// server/apps-routes.js
// Mount with: import { mountAppRoutes } from './apps-routes.js'; mountAppRoutes(app, { auth, HOME });
//
// Three endpoints, matching the three tile kinds in apps.js:
//   GET  /api/apps                 -> the curated list, with live installed/configured state
//   POST /api/apps/launch          -> launch a native app in the graphical session
//   POST /api/apps/terminal-launch -> resolve the shell command for a terminal-agent tile
//                                      (the client opens this in TerminalPTY, same as it
//                                      already does for the plain Terminal view — this route
//                                      does not spawn anything itself, it only validates and
//                                      returns the command + cwd, since actually running it
//                                      belongs to the PTY session, not a one-shot POST)

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { listApps, resolveNativeExec, getApp, resolveAppInstall } from './apps.js';
import { claudeCodeAuthed } from './agents.js';

export function mountAppRoutes(app, { auth, HOME }) {
  app.get('/api/apps', auth, (req, res) => {
    res.json({ apps: listApps() });
  });

  app.post('/api/apps/launch', auth, (req, res) => {
    const id = String(req.body?.id || '');
    const meta = getApp(id);
    if (!meta) return res.status(404).json({ error: 'Unknown app' });
    if (meta.kind !== 'native') {
      return res.status(400).json({ error: 'This app does not launch in the graphical session' });
    }

    const exec = resolveNativeExec(id);
    if (!exec) {
      return res.status(400).json({ error: `${meta.name} is not installed on this machine` });
    }

    try {
      const envFile = '/var/lib/touchworkstation/desktop.env';
      let env = { ...process.env };
      if (fs.existsSync(envFile)) {
        for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
          const i = line.indexOf('=');
          if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
        }
      }
      const child = spawn('/bin/bash', ['-lc', exec], {
        cwd: HOME,
        detached: true,
        stdio: 'ignore',
        env,
      });
      child.unref();
      res.json({ message: `${meta.name} launched on the TouchWorkstation desktop.` });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Terminal-agent tiles don't spawn a background process — they hand the
  // client a command to run inside a real TerminalPTY session, so output,
  // interactivity, and tmux persistence all work exactly like typing it
  // yourself. This endpoint just validates the app is configured and
  // resolves a safe working directory.
  app.post('/api/apps/terminal-launch', auth, (req, res) => {
    const id = String(req.body?.id || '');
    const meta = getApp(id);
    if (!meta) return res.status(404).json({ error: 'Unknown app' });
    if (meta.kind !== 'terminal-agent') {
      return res.status(400).json({ error: 'This app does not launch in the terminal' });
    }
    if (!meta.command) {
      return res.status(400).json({
        error: `${meta.name} isn't set up yet.`,
      });
    }

    const requestedCwd = req.body?.cwd ? String(req.body.cwd) : null;
    const cwd = requestedCwd && fs.existsSync(requestedCwd) ? path.resolve(requestedCwd) : HOME;
    // Guard against escaping HOME the same way the file browser does.
    if (!cwd.startsWith(path.resolve(HOME))) {
      return res.status(400).json({ error: 'Invalid project directory' });
    }

    // Not installed yet -> chain the official installer before the launch
    // command in one terminal session, instead of making the user install
    // and launch as two separate taps.
    let command = meta.command;
    if (meta.installed === false) {
      if (!meta.installCommand) {
        return res.status(400).json({ error: `${meta.name} isn't installed, and there's no known installer for it yet.` });
      }
      command = `${meta.installCommand} && ${meta.command}`;
    }
    // Claude Code first-run auth: if it will be installed now, or is installed
    // but not yet authenticated, route through `claude setup-token` first so
    // sign-in completes from a phone instead of hitting the browser/localhost
    // callback flow. (Same reasoning as the agent launch path.)
    if (id === 'claude-code' && (meta.installed === false || !claudeCodeAuthed())) {
      const base = meta.installed === false ? `${meta.installCommand} && ` : '';
      command = `${base}claude setup-token && ${meta.command}`;
    }

    res.json({ command, cwd, sessionId: `agent-${id}` });
  });

  app.post('/api/apps/:id/install', auth, (req, res) => {
    const r = resolveAppInstall(req.params.id);
    if (!r) return res.status(400).json({ error: 'No installer available for this app' });
    res.json({ command: r.command, cwd: HOME, sessionId: r.sessionId });
  });
}
