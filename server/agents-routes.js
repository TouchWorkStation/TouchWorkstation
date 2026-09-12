// server/agents-routes.js
// Mount with: mountAgentRoutes(app, { auth, HOME, stateDir });

import path from 'path';
import fs from 'fs';
import {
  initAgents, runtimeStatus, listAgents, getAgent, createAgent,
  updateAgent, deleteAgent, resolveLaunch, markLaunched, liveSessions,
  resolveInstall, resolveLogin, classifyAgentState,
} from './agents.js';
import { purgeAgent } from './agent-board.js';

export function mountAgentRoutes(app, { auth, HOME, stateDir }) {
  initAgents({ stateDir });

  // Available runtimes + whether each is installed on this machine.
  app.get('/api/agents/runtimes', auth, (req, res) => {
    res.json({ runtimes: runtimeStatus() });
  });

  // All configured agents, enriched with live status. `state` is only
  // meaningful (non-null) while `running` — see classifyAgentState's own
  // comment in agents.js for what blocked/working/done/idle each mean.
  app.get('/api/agents', auth, (req, res) => {
    const live = new Set(liveSessions());
    const agents = listAgents().map((a) => {
      const running = live.has(a.id);
      return { ...a, running, state: running ? classifyAgentState(a.id) : null };
    });
    res.json({ agents });
  });

  app.get('/api/agents/:id', auth, (req, res) => {
    const a = getAgent(req.params.id);
    if (!a) return res.status(404).json({ error: 'Agent not found' });
    const live = new Set(liveSessions());
    const running = live.has(a.id);
    res.json({ agent: { ...a, running, state: running ? classifyAgentState(a.id) : null } });
  });

  app.post('/api/agents', auth, (req, res) => {
    try {
      const ws = req.body?.workspace ? path.resolve(String(req.body.workspace)) : null;
      if (ws && !ws.startsWith(path.resolve(HOME))) {
        return res.status(400).json({ error: 'Workspace must be inside your home directory' });
      }
      if (ws && !fs.existsSync(ws)) {
        return res.status(400).json({ error: 'Workspace directory does not exist' });
      }
      const agent = createAgent({ ...req.body, workspace: ws });
      res.json({ agent });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put('/api/agents/:id', auth, (req, res) => {
    try {
      if (req.body?.workspace) {
        const ws = path.resolve(String(req.body.workspace));
        if (!ws.startsWith(path.resolve(HOME))) {
          return res.status(400).json({ error: 'Workspace must be inside your home directory' });
        }
        req.body.workspace = ws;
      }
      res.json({ agent: updateAgent(req.params.id, req.body) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/agents/:id', auth, (req, res) => {
    try {
      const r = deleteAgent(req.params.id);
      purgeAgent(req.params.id); // clean up this agent's board + chat too
      res.json(r);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Install a runtime (e.g. Hermes). Returns a command for the client to run
  // in a visible terminal — the user watches the official installer run.
  app.post('/api/agents/runtimes/:runtime/install', auth, (req, res) => {
    const r = resolveInstall(req.params.runtime);
    if (!r) return res.status(400).json({ error: 'No installer available for this runtime' });
    res.json({ command: r.command, cwd: HOME, sessionId: r.sessionId });
  });

  // Log in to a runtime (e.g. Codex OAuth). Returns the runtime's own login
  // command for the client to run in a terminal; the OAuth URL/code the tool
  // prints is completed by the user. TouchWorkstation surfaces the flow, it
  // does not implement OAuth itself.
  app.post('/api/agents/runtimes/:runtime/login', auth, (req, res) => {
    const r = resolveLogin(req.params.runtime);
    if (!r) return res.status(400).json({ error: 'No login flow for this runtime' });
    if (r.error) return res.status(400).json({ error: r.error });
    res.json({ command: r.command, cwd: HOME, sessionId: r.sessionId });
  });

  // Resolve the launch command for an agent. Like the terminal-agent app
  // tiles, this does not spawn anything — it returns the command + cwd for
  // the client to run in a real PTY session (so the agent runs interactively
  // with tmux persistence, and the harness can then see it in liveSessions).
  app.post('/api/agents/:id/launch', auth, (req, res) => {
    try {
      const r = resolveLaunch(req.params.id);
      if (!r.ok) return res.status(400).json({ error: r.reason });
      const cwd = r.workspace && fs.existsSync(r.workspace) ? r.workspace : HOME;
      markLaunched(req.params.id);
      // Use the session id resolveLaunch already computed (agent.id) instead
      // of re-deriving it here — reconstructing it as `agent-${id}` produced
      // a DIFFERENT tmux session name than what the rest of the app (and any
      // earlier successful login/setup-token run) used for this same agent,
      // so credentials established in one session were invisible from the
      // other and every launch looked like a brand-new, unauthenticated shell.
      res.json({ command: r.command, cwd, sessionId: r.sessionId });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Live snapshot for the monitoring view — the client polls this every few
  // seconds to keep running/state fresh without re-fetching the full agent
  // list + runtimes each time.
  app.get('/api/agents/monitor/live', auth, (req, res) => {
    const running = liveSessions();
    const states = Object.fromEntries(running.map((id) => [id, classifyAgentState(id)]));
    res.json({ running, states });
  });
}
