// server/agents.js
// The agent harness backend for TouchWorkstation.
//
// This is the real thing, not a mock: it detects which agent CLIs are
// actually installed on the machine, persists per-agent configuration
// (runtime, model, working directory, granular permissions), and tracks
// launched sessions so the dashboard can monitor them.
//
// It deliberately does NOT embed a model or run an agent loop itself.
// Agents here are external tools (Claude Code, Hermes, Codex, ...) that run
// in real PTY sessions — the same terminal primitive the rest of the app
// uses. This module configures and observes them; the terminal runs them.
// That keeps the harness runtime-agnostic, which is the stated goal.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { augmentedPath } from './apps.js';

// ---- known agent runtimes -------------------------------------------------
// Each runtime declares how to detect it (a CLI binary on PATH) and what a
// sensible default launch command looks like. `command:null` means "not
// confirmed yet" — the dashboard shows it as needing setup rather than
// guessing an invocation that might not exist.

// Claude Code and Codex both install via plain `npm install -g`, which
// assumes npm is already on the machine — true on Jarvis (this app depends
// on Node itself), but NOT guaranteed on whatever machine an agent actually
// gets installed on, which can be a bare fresh VM with nothing but a base
// OS image. Confirmed live: `npm install -g @anthropic-ai/claude-code` on a
// stock Ubuntu VM failed outright with "Command 'npm' not found". This
// bootstraps a real Node/npm first, only if npm isn't already present —
// Ubuntu/Debian's own apt nodejs package is often years out of date (Ubuntu
// 22.04 ships Node 12 via apt, far too old for a modern CLI), so that path
// pulls from NodeSource instead of the distro repo; dnf/pacman's own repos
// are kept current enough to install directly. Mirrors the same
// multi-package-manager detection this app's own install.sh/postinst
// scripts already use elsewhere.
const ENSURE_NPM = 'command -v npm >/dev/null 2>&1 || { '
  + 'command -v apt-get >/dev/null 2>&1 && (curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs) || '
  + 'command -v dnf >/dev/null 2>&1 && sudo dnf install -y nodejs npm || '
  + 'command -v pacman >/dev/null 2>&1 && sudo pacman -Sy --noconfirm nodejs npm; }';

export const RUNTIMES = {
  'claude-code': {
    label: 'Claude Code',
    bin: 'claude',
    defaultCommand: 'claude',
    // claude's default first-run flow expects an OAuth redirect back to a
    // browser on THIS machine — fine at a desk, but there's no browser open
    // on Jarvis when you're only ever driving it from a phone, so it hangs
    // waiting for a callback that can't arrive. `setup-token` is Anthropic's
    // own escape hatch for exactly this: it prints a URL you complete on ANY
    // device (your phone), then hands back a token to paste into the
    // terminal — no local browser or callback needed.
    loginCommand: 'claude setup-token',
    installCommand: `${ENSURE_NPM} && npm install -g @anthropic-ai/claude-code`,
    // Where this CLI persists its own credentials once its login flow
    // completes. Existence of any of these is what "already logged in"
    // means — checked rather than remembered, so revoking a token or
    // logging out from the CLI itself is reflected immediately instead of
    // leaving a stale "logged in" flag behind in our own config.
    // .claude.json alone is NOT proof of login — it's the general config
    // file and exists after any first run, authenticated or not. Treating
    // it as a login marker would skip the login step and drop the user into
    // a CLI that immediately prompts for auth anyway.
    authPaths: ['.claude/.credentials.json', { path: '.claude.json', contains: 'oauthAccount' }],
    supportsModels: true,
    models: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
    docs: 'Anthropic Claude Code CLI',
  },
  hermes: {
    label: 'Hermes',
    bin: 'hermes',
    defaultCommand: 'hermes',
    loginCommand: 'hermes setup',  // Hermes has a setup wizard for keys/login
    // Official one-line installer (runs as the user, no root). Browser step
    // kept in (no --skip-browser) per product decision.
    installCommand: 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash',
    supportsModels: true,
    models: [],
    docs: 'Hermes agent runtime by Nous Research',
  },
  codex: {
    label: 'Codex',
    bin: 'codex',
    defaultCommand: 'codex',
    // Plain `codex login` defaults to a localhost OAuth callback — it
    // opens (via the xdg-open shim) a chatgpt.com/auth.openai.com URL
    // whose redirect_uri points back at localhost on THIS machine, which a
    // phone's browser can never reach, so OpenAI rejects the request
    // outright ("Invalid authorize request" / invalid_authorize_request).
    // Confirmed live. `--device-auth` is OpenAI's own escape hatch for
    // exactly this — headless/remote environments — printing a one-time
    // code to enter at auth.openai.com/codex/device from any device
    // instead of needing a local callback. Same shape as Claude Code's
    // `setup-token` fix above. Requires "Device code authorization for
    // Codex" to be turned on once in ChatGPT Settings > Security first, or
    // the code is silently rejected server-side — that's an account
    // setting only the user can flip, not something this app can automate.
    loginCommand: 'codex login --device-auth',
    installCommand: `${ENSURE_NPM} && npm install -g @openai/codex`,
    authPaths: ['.codex/auth.json'],
    supportsModels: false,
    models: [],
    docs: 'OpenAI Codex CLI',
  },
  antigravity: {
    label: 'Antigravity',
    bin: 'agy',
    defaultCommand: 'agy',
    // Unlike Claude Code, agy needs no special-cased login command: it
    // auto-detects a headless/remote session on first run and prints a
    // Google Sign-In URL + one-time code directly, instead of trying (and
    // failing) a localhost OAuth callback — so plain `agy` already handles
    // first-run auth on its own. loginCommand stays null (same as Ollama)
    // since there's no separate CLI subcommand to surface as a "Log in"
    // action.
    loginCommand: null,
    installCommand: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
    authPaths: ['.antigravity/auth.json', '.config/antigravity/auth.json'],
    supportsModels: false,
    models: [],
    docs: 'Google Antigravity CLI (agy)',
  },
  ollama: {
    label: 'Ollama',
    bin: 'ollama',
    defaultCommand: 'ollama run',
    loginCommand: null,            // local, no login
    installCommand: 'curl -fsSL https://ollama.com/install.sh | sh',
    supportsModels: true,
    models: [],
    docs: 'Local Ollama models',
  },
};

// Default permission set for a newly-created agent. Off by default for
// anything destructive or external, per the product direction.
export const DEFAULT_PERMISSIONS = {
  readFiles: true,
  modifyFiles: false,
  runCommands: false,
  startDevServer: false,
  gitCommit: false,
  gitPush: false,
  docker: false,
  outsideWorkspace: false,
};

const PERMISSION_LABELS = {
  readFiles: 'Read project files',
  modifyFiles: 'Modify project files',
  runCommands: 'Run terminal commands',
  startDevServer: 'Start dev server',
  gitCommit: 'Git commit',
  gitPush: 'Git push',
  docker: 'Docker',
  outsideWorkspace: 'Files outside workspace',
};

let STATE_DIR = null;
let AGENTS_FILE = null;

export function initAgents({ stateDir }) {
  STATE_DIR = stateDir;
  AGENTS_FILE = path.join(stateDir, 'agents.json');
  try {
    fs.mkdirSync(stateDir, { recursive: true });
  } catch {}
}

// ---- runtime detection ----------------------------------------------------

// Short TTL rather than a permanent memo: a CLI gets installed FROM this app,
// in a terminal this same process is serving. A cache that never expires
// would keep reporting "not installed" for the life of the server, so the
// tile would offer to install it again on every tap — forever, and the user
// never reaches the launch path no matter how many times the install
// succeeded. A few seconds is plenty to spare the repeated `command -v`
// while still noticing an install that just finished.
const DETECT_TTL_MS = 5000;
const detectCache = new Map();
function binOnPath(bin) {
  const hit = detectCache.get(bin);
  if (hit && Date.now() - hit.at < DETECT_TTL_MS) return hit.found;
  let found = false;
  const PATH = augmentedPath();
  try {
    execSync(`command -v ${bin}`, { stdio: 'ignore', env: { ...process.env, PATH }, shell: '/bin/bash' });
    found = true;
  } catch {
    for (const dir of PATH.split(':')) {
      try { const p = path.join(dir, bin); if (fs.existsSync(p) && (fs.statSync(p).mode & 0o111)) { found = true; break; } } catch { /* ignore */ }
    }
  }
  detectCache.set(bin, { found, at: Date.now() });
  return found;
}

// Has this CLI's own login flow already been completed on this machine?
// Runtimes with no authPaths (Ollama — purely local) are always "logged in"
// so they never get sent through a login step that doesn't exist.
export function runtimeLoggedIn(id) {
  const r = RUNTIMES[id];
  if (!r) return false;
  if (!r.authPaths || !r.authPaths.length) return true;
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return r.authPaths.some((entry) => {
    const rel = typeof entry === 'string' ? entry : entry.path;
    const needle = typeof entry === 'string' ? null : entry.contains;
    const full = path.join(home, rel);
    try {
      if (fs.statSync(full).size === 0) return false;
      if (!needle) return true;
      return fs.readFileSync(full, 'utf8').includes(needle);
    } catch { return false; }
  });
}

// The whole "tap the CLI and it does the right thing" decision, made in one
// place on the server where all three inputs (is it installed, is it logged
// in, is it already running) actually live. The client just follows the
// returned `action` — it never has to sequence install/login/launch itself.
//
// `runningCommand` is the foreground process of this CLI's own dedicated
// tmux session, passed in by the route (only index.js has the tmux helper).
// If the CLI is already sitting in there, we attach and send NOTHING —
// re-sending the launch command would type "claude" into a Claude prompt
// that's already open, which is exactly the "it just runs it again" bug.
export function resolveOpen(runtimeId, runningCommand) {
  const r = RUNTIMES[runtimeId];
  if (!r) return null;
  const sessionId = `cli-${runtimeId}`;
  // Checked FIRST, ahead of the install test: something already running in
  // this CLI's own session is proof enough that it's usable, and trusting
  // that over PATH detection is what stops a stale "not installed" reading
  // from re-running the installer on top of a CLI that is already open.
  const SHELLS = new Set(['bash', 'sh', 'zsh', 'fish', 'dash']);
  if (runningCommand && !SHELLS.has(runningCommand)) {
    return { action: 'attach', sessionId, label: r.label };
  }
  if (!binOnPath(r.bin)) {
    if (!r.installCommand) return { action: 'unavailable', sessionId, label: r.label };
    return { action: 'install', command: r.installCommand, sessionId, label: r.label };
  }
  if (!runtimeLoggedIn(runtimeId)) {
    // Antigravity has no separate login subcommand — running it is the login
    // flow (it prints a sign-in URL + code on first run), so fall through to
    // its normal command rather than inventing one.
    return { action: 'login', command: r.loginCommand || r.defaultCommand, sessionId, label: r.label };
  }
  return { action: 'launch', command: r.defaultCommand, sessionId, label: r.label };
}

export function runtimeStatus() {
  return Object.entries(RUNTIMES).map(([id, r]) => ({
    id,
    label: r.label,
    installed: binOnPath(r.bin),
    loggedIn: runtimeLoggedIn(id),
    supportsModels: r.supportsModels,
    models: r.models,
    defaultCommand: r.defaultCommand,
    canInstall: !!r.installCommand,
    canLogin: !!r.loginCommand,
    docs: r.docs,
    underConstruction: !!r.underConstruction,
  }));
}

// Resolve the install command for a runtime (for the "Install" action).
// Returns null if there's no known installer or it's already installed.
export function resolveInstall(runtimeId) {
  const r = RUNTIMES[runtimeId];
  if (!r || !r.installCommand) return null;
  return { command: r.installCommand, sessionId: `install-${runtimeId}` };
}

// Resolve the login command for an agent's runtime (for the "Log in" action).
// This runs the runtime's OWN auth flow in a terminal — the OAuth URL/code it
// prints is completed by the user. TouchWorkstation doesn't implement OAuth
// itself; it surfaces the runtime's native flow.
export function resolveLogin(runtimeId) {
  const r = RUNTIMES[runtimeId];
  if (!r || !r.loginCommand) return null;
  if (!binOnPath(r.bin)) return { error: `${r.label} is not installed yet.` };
  return { command: r.loginCommand, sessionId: `login-${runtimeId}` };
}

// ---- agent config persistence ---------------------------------------------

function readAgents() {
  try {
    return JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeAgents(list) {
  fs.writeFileSync(AGENTS_FILE, JSON.stringify(list, null, 2));
}

function enrichAgent(a, runtimesById) {
  return {
    ...a,
    runtimeInstalled: runtimesById[a.runtime]?.installed ?? false,
    runtimeLabel: RUNTIMES[a.runtime]?.label ?? a.runtime,
    runtimeUnderConstruction: !!RUNTIMES[a.runtime]?.underConstruction,
    permissionLabels: PERMISSION_LABELS,
  };
}

export function listAgents() {
  const runtimes = Object.fromEntries(runtimeStatus().map((r) => [r.id, r]));
  return readAgents().map((a) => enrichAgent(a, runtimes));
}

export function getAgent(id) {
  const a = readAgents().find((x) => x.id === id);
  if (!a) return null;
  const runtimes = Object.fromEntries(runtimeStatus().map((r) => [r.id, r]));
  return enrichAgent(a, runtimes);
}

export function createAgent({ name, runtime, model, workspace, permissions, instructions }) {
  if (!name || !runtime) throw new Error('name and runtime are required');
  if (!RUNTIMES[runtime]) throw new Error(`Unknown runtime: ${runtime}`);
  const list = readAgents();
  const agent = {
    id: `agent-${Date.now().toString(36)}`,
    name,
    runtime,
    model: model || null,
    workspace: workspace || null,
    instructions: instructions || '',
    permissions: { ...DEFAULT_PERMISSIONS, ...(permissions || {}) },
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    runCount: 0,
  };
  list.push(agent);
  writeAgents(list);
  return agent;
}

export function updateAgent(id, patch) {
  const list = readAgents();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error('Agent not found');
  const cur = list[idx];
  list[idx] = {
    ...cur,
    ...patch,
    // never allow id/createdAt to be overwritten; merge permissions
    id: cur.id,
    createdAt: cur.createdAt,
    permissions: { ...cur.permissions, ...(patch.permissions || {}) },
  };
  writeAgents(list);
  return list[idx];
}

export function deleteAgent(id) {
  const list = readAgents();
  const next = list.filter((a) => a.id !== id);
  if (next.length === list.length) throw new Error('Agent not found');
  writeAgents(next);
  return { deleted: true };
}

// Resolve the shell command that launches this agent, respecting its
// configured runtime + model. If the runtime isn't installed yet, this
// chains the official installer before the launch command (one terminal
// session: install, then run) instead of making the user install and launch
// as two separate steps.
export function resolveLaunch(id) {
  const agent = getAgent(id);
  if (!agent) throw new Error('Agent not found');
  const rt = RUNTIMES[agent.runtime];
  if (!rt) throw new Error('Unknown runtime');
  let command = rt.defaultCommand;
  if (rt.supportsModels && agent.model) {
    command = `${command} --model ${agent.model}`.replace('ollama run --model', 'ollama run');
    if (agent.runtime === 'ollama') command = `ollama run ${agent.model}`;
  }
  if (!binOnPath(rt.bin)) {
    if (!rt.installCommand) {
      return { ok: false, reason: `${rt.label} is not installed on this machine, and there's no known installer for it yet.` };
    }
    // Chain install then launch in one session. `&&` means launch only runs
    // if install actually succeeds, so a failed install doesn't try to run
    // a still-missing binary.
    command = `${rt.installCommand} && ${command}`;
  }
  // Claude Code specifically: if it's installed but NOT yet authenticated,
  // launching plain `claude` triggers its browser/localhost-callback login,
  // which can't complete from a phone (the callback can't reach this machine)
  // and yields the broken "Missing client_id" URL. Route first-run auth
  // through `claude setup-token` instead — a paste-back flow that completes
  // from any device — then drop into the real session. We detect the
  // authenticated state by the presence of Claude Code's own credentials
  // file (~/.claude/.credentials.json, mode 0600, per Anthropic's docs).
  if (agent.runtime === 'claude-code' && binOnPath(rt.bin) && !claudeCodeAuthed()) {
    command = `claude setup-token && ${rt.defaultCommand}`;
  }
  return { ok: true, command, workspace: agent.workspace, sessionId: agent.id };
}

// True if Claude Code already has stored credentials, so we don't force the
// setup-token flow on an already-authenticated machine.
export function claudeCodeAuthed() {
  const home = process.env.TW_HOME || process.env.HOME || '';
  // Env-var auth (CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY) also counts —
  // those bypass the login screen entirely.
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY) return true;
  const custom = process.env.CLAUDE_CONFIG_DIR;
  const candidates = [
    custom ? path.join(custom, '.credentials.json') : null,
    path.join(home, '.claude', '.credentials.json'),
  ].filter(Boolean);
  return candidates.some((p) => { try { return fs.existsSync(p); } catch { return false; } });
}

// Record that an agent was launched (for the monitoring view).
export function markLaunched(id) {
  const list = readAgents();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return;
  list[idx].lastRunAt = new Date().toISOString();
  list[idx].runCount = (list[idx].runCount || 0) + 1;
  writeAgents(list);
}

// ---- live session monitoring ----------------------------------------------
// Sessions are tmux sessions named tw-agent-<id> (the terminal opens agents
// under that sessionId). This lets the dashboard show which agents are
// actually running right now, cross-referenced with config.

export function liveSessions() {
  let names = [];
  try {
    const out = execSync('tmux ls -F "#{session_name}" 2>/dev/null', { encoding: 'utf8' });
    names = out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    names = [];
  }
  // agent sessions are prefixed tw-agent-<id> (TerminalPTY prefixes tw-)
  return names
    .filter((n) => n.startsWith('tw-agent-'))
    .map((n) => n.replace(/^tw-/, ''));
}

// ---- live status classification (Herdr-inspired) --------------------------
// A running agent's tmux pane is classified into one of four states so the
// list/dashboard can show which agent actually needs a human, without
// opening each one to check. This is deliberately a coarser, cheaper check
// than agent-board-routes.js's reply-capture mechanism (which needs
// continuous polling + tail-diffing to extract a clean chat message) — state
// classification only needs "as of right now", computed fresh on each
// /api/agents request, so it doesn't need a persistent background poller.
//
//   blocked — the pane's last line looks like it's waiting on the human
//             (a yes/no prompt, a question, "press enter to continue")
//   working — pane content changed since the last time we looked
//   done    — pane stopped changing recently (a reply likely just finished)
//   idle    — pane has been unchanged for a while (nothing pending)
//
// Thresholds and patterns here are a first-pass heuristic, not a protocol —
// expect to tune both against real usage.
const stateCache = new Map(); // agentId -> { lastCapture, lastChangeAt }
const BLOCKED_LINE_PATTERNS = [
  /\?\s*$/,
  /\(y\/n\)\s*$/i,
  /\[y\/n\]\s*$/i,
  /press enter to continue/i,
  /do you want to proceed/i,
  /waiting for (your )?(input|response|confirmation)/i,
];
const DONE_WINDOW_MS = 45_000; // unchanged for less than this -> "done"; longer -> "idle"

function capturePaneQuick(id) {
  try {
    return execSync(`tmux capture-pane -t ${JSON.stringify(`tw-${id}`)} -p -S -50`, { encoding: 'utf8' });
  } catch {
    return null;
  }
}

export function classifyAgentState(id) {
  const snap = capturePaneQuick(id);
  if (snap === null) return null; // not running, or tmux/session gone
  const now = Date.now();
  const prev = stateCache.get(id);
  const changed = !prev || prev.lastCapture !== snap;
  const lastChangeAt = changed ? now : (prev ? prev.lastChangeAt : now);
  stateCache.set(id, { lastCapture: snap, lastChangeAt });

  const lastLine = snap.trimEnd().split('\n').pop() || '';
  if (!changed && BLOCKED_LINE_PATTERNS.some((re) => re.test(lastLine))) return 'blocked';
  if (changed) return 'working';
  return now - lastChangeAt < DONE_WINDOW_MS ? 'done' : 'idle';
}
