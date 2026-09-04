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
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    supportsModels: true,
    models: ['claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5'],
    docs: 'Anthropic Claude Code CLI',
    underConstruction: true, // not working in this build yet — flagged in the UI rather than left silently broken
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
    loginCommand: 'codex login',   // Codex OAuth flow — prints a URL/code to complete
    installCommand: 'npm install -g @openai/codex',
    supportsModels: false,
    models: [],
    docs: 'OpenAI Codex CLI',
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

const detectCache = new Map();
function binOnPath(bin) {
  if (detectCache.has(bin)) return detectCache.get(bin);
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
  detectCache.set(bin, found);
  return found;
}

export function runtimeStatus() {
  return Object.entries(RUNTIMES).map(([id, r]) => ({
    id,
    label: r.label,
    installed: binOnPath(r.bin),
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
