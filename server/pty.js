// server/pty.js
// Real interactive terminal for TouchWorkstation: a websocket-backed PTY,
// authenticated with the same tw_session JWT cookie used by the REST API.
//
// If tmux is available on the host, each session is opened as
// `tmux new-session -A -s tw-<sessionId>`, so reconnecting after the phone
// locks, the app backgrounds, or the network drops re-attaches to the same
// live shell instead of starting a fresh one. Falls back to a plain login
// shell if tmux isn't installed.

import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import pty from 'node-pty';

// Build a PATH that includes the user's own install dirs, so tools installed
// to ~/.local/bin, npm-global, nvm, cargo, etc. are runnable in the terminal
// even though the systemd service starts with a minimal PATH.
function augmentPath(current, home) {
  const extra = [
    `${home}/.local/bin`, `${home}/.npm-global/bin`, `${home}/bin`,
    `${home}/.cargo/bin`, `${home}/.deno/bin`, `${home}/.bun/bin`,
    '/usr/local/bin', '/usr/bin', '/bin', '/snap/bin',
  ];
  try {
    const nvm = `${home}/.nvm/versions/node`;
    if (fs.existsSync(nvm)) for (const v of fs.readdirSync(nvm)) extra.push(`${nvm}/${v}/bin`);
  } catch { /* ignore */ }
  return [...new Set([...(current || '').split(':'), ...extra])].filter(Boolean).join(':');
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        const i = x.indexOf('=');
        return [x.slice(0, i), decodeURIComponent(x.slice(i + 1))];
      })
  );
}

let tmuxAvailable = null;
function hasTmux(home) {
  if (tmuxAvailable === null) {
    try {
      execSync('command -v tmux', { stdio: 'ignore', env: { ...process.env, PATH: augmentPath(process.env.PATH, home) }, shell: '/bin/bash' });
      tmuxAvailable = true;
    } catch {
      tmuxAvailable = false;
    }
  }
  return tmuxAvailable;
}

// sessionId comes from the client (e.g. "main", or a project path hash) so
// multiple terminal tabs/panes can each get their own persistent session.
function safeSessionId(raw) {
  const s = String(raw || 'main').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return s || 'main';
}

/**
 * Attach the PTY websocket endpoint to an existing http.Server.
 * @param {import('http').Server} server
 * @param {{ jwtSecret: string, home: string }} opts
 */
export function attachPty(server, { jwtSecret, home }) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname !== '/ws/terminal') return; // not ours; ignore

    try {
      const token = parseCookies(req).tw_session;
      if (!token) throw new Error('no session cookie');
      jwt.verify(token, jwtSecret);
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const sessionId = safeSessionId(url.searchParams.get('session'));
    const requestedCwd = url.searchParams.get('cwd');
    const cwd = requestedCwd && fs.existsSync(requestedCwd) ? requestedCwd : home;

    let cmd, args;
    if (hasTmux(home)) {
      cmd = 'tmux';
      args = ['new-session', '-A', '-s', `tw-${sessionId}`];
    } else {
      cmd = process.env.SHELL || '/bin/bash';
      args = ['-l'];
    }

    const term = pty.spawn(cmd, args, {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      // Augment PATH so user-installed CLIs (~/.local/bin, npm-global, nvm,
      // etc.) are runnable even though the systemd service starts with a
      // minimal PATH. Without this, `hermes`/`codex` are "command not found"
      // in the terminal even when installed.
      env: { ...process.env, PATH: augmentPath(process.env.PATH, home) },
    });

    term.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'data', data }));
    });

    term.onExit(({ exitCode }) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'exit', code: exitCode }));
      try { ws.close(); } catch {}
    });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === 'input') term.write(msg.data);
      else if (msg.type === 'resize') {
        const cols = Math.max(1, msg.cols | 0) || 80;
        const rows = Math.max(1, msg.rows | 0) || 24;
        try { term.resize(cols, rows); } catch {}
      }
    });

    ws.on('close', () => {
      // With tmux, closing the socket detaches but leaves the session
      // running — that's the point (reconnect resumes it). Without tmux
      // there's nothing to persist, so kill the process.
      if (!hasTmux()) { try { term.kill(); } catch {} }
    });
    ws.on('error', () => { try { term.kill(); } catch {} });
  });

  return wss;
}
