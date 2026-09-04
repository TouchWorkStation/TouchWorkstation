// server/apps.js
// The curated TouchWorkstation launcher registry.
//
// This replaces the old approach of scanning every .desktop file on the
// system. Per the product direction: a short, deliberate list of apps —
// not an app-store mirror of the OS.
//
// Three tile kinds, because they launch completely differently:
//
//   native          — a real Linux GUI app, launched via .desktop exec into
//                      the graphical session. No registry entries currently
//                      use this kind (the phone-side viewer for it, the
//                      VNC-based Desktop view, was removed from this build).
//   webview         — a web app/service with no meaningful desktop presence
//                      here (Claude.ai, ChatGPT, Cowork, GitHub, Hermes if
//                      it's hosted). Rendered as an embedded view, not routed
//                      through the graphical session.
//   terminal-agent  — a CLI tool (Claude Code, Codex, etc). "Launching" it
//                      opens a PTY session with the command already run.
//
// Nothing here is discovered automatically. Entries are curated in code
// (or eventually a small user-editable config) so the grid stays small and
// intentional. Anything with `configured:false` still renders — greyed out,
// with a "Set up" affordance — rather than being hidden, per the project's
// own rule: don't fake functionality, mark what's not wired up yet.

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Cached check for whether a CLI binary is available. The TouchWorkstation
// service runs under systemd with a minimal PATH that usually excludes the
// user's own install dirs (~/.local/bin, ~/.npm-global/bin, nvm shims), so a
// bare `command -v` misses tools like Hermes/Codex/Claude that install there.
// We build an augmented PATH from the user's HOME and common locations, and
// also check well-known absolute paths directly.
const binCache = new Map();
export function augmentedPath() {
  const home = process.env.TW_HOME || process.env.HOME || '';
  const extra = [
    `${home}/.local/bin`,
    `${home}/.npm-global/bin`,
    `${home}/bin`,
    `${home}/.cargo/bin`,
    `${home}/.deno/bin`,
    `${home}/.bun/bin`,
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/snap/bin',
  ];
  // Include any nvm current/versioned bin dirs if present.
  try {
    const nvm = `${home}/.nvm/versions/node`;
    if (fs.existsSync(nvm)) {
      for (const v of fs.readdirSync(nvm)) extra.push(`${nvm}/${v}/bin`);
    }
  } catch { /* ignore */ }
  return [...new Set([...(process.env.PATH || '').split(':'), ...extra])].filter(Boolean).join(':');
}
function binOnPath(bin) {
  if (binCache.has(bin)) return binCache.get(bin);
  let found = false;
  const PATH = augmentedPath();
  try { execSync(`command -v ${bin}`, { stdio: 'ignore', env: { ...process.env, PATH }, shell: '/bin/bash' }); found = true; }
  catch {
    // Fall back to checking the augmented dirs for an executable file directly.
    for (const dir of PATH.split(':')) {
      try { const p = path.join(dir, bin); if (fs.existsSync(p) && (fs.statSync(p).mode & 0o111)) { found = true; break; } } catch { /* ignore */ }
    }
  }
  binCache.set(bin, found);
  return found;
}

// ---- native app resolution (still needs .desktop lookup, just no scanning) ----

const NATIVE_DESKTOP_DIRS = ['/usr/share/applications', '/var/lib/snapd/desktop/applications'];

function findDesktopFile(desktopId) {
  for (const dir of NATIVE_DESKTOP_DIRS) {
    const p = `${dir}/${desktopId}`;
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function parseDesktopExec(path) {
  try {
    const text = fs.readFileSync(path, 'utf8');
    const line = text.split('\n').find((l) => l.startsWith('Exec='));
    if (!line) return null;
    return line.slice(5).replace(/%[fFuUdDnNickvm]/g, '').trim();
  } catch {
    return null;
  }
}

// ---- the curated registry ----
// iconKey maps to a lucide-react icon name on the client (kept as a plain
// string here so this file has no UI dependency). color is a CSS var name
// from the existing design tokens (--accent, --purple, --blue, etc.) so new
// tiles inherit the theme instead of introducing new colors.

export const APP_REGISTRY = [
  {
    id: 'terminal',
    name: 'Terminal',
    kind: 'builtin',       // opens the existing Terminal view, not launched externally
    iconKey: 'TerminalSquare',
    color: '--accent',
    description: 'Full interactive shell into this machine.',
  },
  {
    id: 'files',
    name: 'Files',
    kind: 'builtin',
    iconKey: 'Folder',
    color: '--blue',
    description: 'Browse and edit files on this machine.',
  },
  {
    id: 'github',
    name: 'GitHub',
    kind: 'webview',
    iconKey: 'GitBranch',
    color: '--purple',
    url: 'https://github.com',
    description: 'Issues, pull requests, and notifications.',
    configured: true,
    embeddable: false, // GitHub always sends X-Frame-Options/CSP deny
  },
  {
    id: 'docker',
    name: 'Docker',
    kind: 'builtin',
    iconKey: 'Server',
    color: '--green',
    description: 'Containers and services running on this machine.',
    detectBin: 'docker', // configured = true iff the docker CLI is present
    installCommand: 'curl -fsSL https://get.docker.com | sh',
    modes: ['ui', 'terminal'], // tapping offers a choice: mobile UI or terminal
    uiView: 'docker',          // which router view the UI mode opens
  },
  {
    id: 'lazygit',
    name: 'Lazygit',
    kind: 'terminal-agent',
    iconKey: 'GitBranch',
    color: '--purple',
    detectBin: 'lazygit',
    command: 'lazygit',
    installCommand: "sudo add-apt-repository -y ppa:lazygit-team/release && sudo apt update && sudo apt install -y lazygit",
    description: 'Terminal UI for Git — stage, commit, branch and rebase without memorizing flags.',
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    kind: 'terminal-agent',
    iconKey: 'Database',
    color: '--blue',
    description: 'Local database server for your projects — opens the psql shell.',
    detectBin: 'psql',
    command: 'sudo -u postgres psql',
    installCommand: 'sudo apt update && sudo apt install -y postgresql postgresql-contrib',
  },
  {
    id: 'redis',
    name: 'Redis',
    kind: 'terminal-agent',
    iconKey: 'Database',
    color: '--red',
    description: 'In-memory cache and queue backend for your projects — opens redis-cli.',
    detectBin: 'redis-cli',
    command: 'redis-cli',
    installCommand: 'sudo apt update && sudo apt install -y redis-server',
  },
  {
    id: 'btop',
    name: 'System Monitor',
    kind: 'terminal-agent',
    iconKey: 'Activity',
    color: '--yellow',
    detectBin: 'btop',
    command: 'btop',
    installCommand: 'sudo apt update && sudo apt install -y btop',
    description: 'Live CPU, memory, disk and process view — the terminal version of the dashboard stats.',
  },
  {
    id: 'nginx',
    name: 'Nginx',
    kind: 'terminal-agent',
    iconKey: 'Globe2',
    color: '--green',
    description: 'Reverse proxy — useful for serving multiple projects or testing production-style routing.',
    detectBin: 'nginx',
    command: 'sudo systemctl status nginx --no-pager',
    installCommand: 'sudo apt update && sudo apt install -y nginx',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    kind: 'terminal-agent',
    iconKey: 'Bot',
    color: '--accent',
    detectBin: 'claude',
    command: 'claude',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    description: 'Open Claude Code in this project\u2019s terminal.',
    underConstruction: true, // not working in this build yet
  },
  {
    id: 'codex',
    name: 'Codex',
    kind: 'terminal-agent',
    iconKey: 'Bot',
    color: '--blue',
    detectBin: 'codex',
    command: 'codex',
    installCommand: 'npm install -g @openai/codex',
    description: 'Open Codex in this project\u2019s terminal.',
  },
  {
    id: 'claude-ai',
    name: 'Claude',
    kind: 'webview',
    iconKey: 'Bot',
    color: '--accent',
    url: 'https://claude.ai',
    description: 'Claude.ai in a touch-optimized view.',
    embeddable: false, // claude.ai also sends X-Frame-Options/CSP deny
    underConstruction: true, // not working in this build yet
  },
  {
    id: 'hermes',
    name: 'Hermes',
    kind: 'terminal-agent',
    iconKey: 'Sparkles',
    color: '--yellow',
    detectBin: 'hermes',
    command: 'hermes',
    installCommand: 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash',
    // Hermes runs a local web gateway; tapping it should ask whether you want
    // the web UI or a raw terminal session, same as any other dual-mode tool.
    hermesUi: true,
    modes: ['ui', 'terminal'],
    description: 'Open the Hermes agent — choose the web UI or a terminal session.',
  },
];

// Resolve a registry entry into what the client needs to render + act on it.
// Native apps get their exec string resolved lazily (only when present on
// this machine) so the tile can show "not installed" instead of failing
// silently on launch.
function resolveAppStatus(a) {
  const out = { ...a };
  if (a.kind === 'native') {
    const file = a.desktopId ? findDesktopFile(a.desktopId) : null;
    out.installed = !!file;
    out.configured = out.configured !== false && out.installed;
  } else if (a.detectBin) {
    const present = binOnPath(a.detectBin);
    out.installed = present;
    out.configured = present;
  } else if (a.kind === 'builtin') {
    out.configured = out.configured !== false;
  }
  out.canInstall = !!a.installCommand && !out.installed;
  return out;
}

export function listApps() {
  return APP_REGISTRY.map(resolveAppStatus);
}

// Resolve the install command for an app tile (for the "Install" flow when a
// greyed tile is tapped). Runs in a visible terminal, same as agent installs.
export function resolveAppInstall(id) {
  const app = APP_REGISTRY.find((a) => a.id === id);
  if (!app || !app.installCommand) return null;
  return { command: app.installCommand, sessionId: `install-${id}` };
}

export function resolveNativeExec(id) {
  const app = APP_REGISTRY.find((a) => a.id === id && a.kind === 'native');
  if (!app) return null;
  const file = findDesktopFile(app.desktopId);
  if (!file) return null;
  return parseDesktopExec(file);
}

// Real-time detected status for a single app, used by routes that need to
// know whether it's actually installed right now (e.g. terminal-launch
// deciding whether to chain an install first).
export function getApp(id) {
  const a = APP_REGISTRY.find((x) => x.id === id);
  return a ? resolveAppStatus(a) : null;
}
