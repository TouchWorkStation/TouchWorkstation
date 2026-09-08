// server/agent-board-routes.js
// Mount with: mountBoardRoutes(app, { auth });
//
// Kanban + chat for agents. Chat messages can be forwarded into the agent's
// live terminal session (tmux tw-agent-<id>) so the agent actually receives
// them; if the agent isn't running, the message is still saved to the thread
// and the client is told it wasn't delivered live.

import { execSync } from 'child_process';
import {
  initBoard, COLUMNS, tasksForAgent, createTask, updateTask, deleteTask, moveTask,
  chatForAgent, addChatMessage,
} from './agent-board.js';

// agentId already looks like "agent-<hash>" (that's the id format agents are
// created with), and that's exactly what resolveLaunch uses as the tmux
// session id — so the real session is tw-agent-<hash>. Prepending another
// "agent-" here constructed a name that never matched a real session, so
// this always reported not-running regardless of the agent's actual state.
function sessionName(agentId) {
  return `tw-${agentId}`;
}
function sessionRunning(agentId) {
  try {
    const out = execSync('tmux ls -F "#{session_name}" 2>/dev/null', { encoding: 'utf8' });
    return out.split('\n').map((s) => s.trim()).includes(sessionName(agentId));
  } catch {
    return false;
  }
}

// Send text into the agent's live tmux session as if typed, followed by
// Enter — as ONE atomic literal send with a real carriage return (\r, what a
// physical Enter keypress actually produces at the pty level) appended
// directly to the payload. Two separate send-keys calls (literal text, then
// a separate 'Enter' key-name call) is a documented source of exactly the
// 'text appears typed but never submits' symptom with some interactive
// programs — bundling them removes that ambiguity entirely.
function sendToSession(agentId, text) {
  if (!sessionRunning(agentId)) return false;
  try {
    execSync(`tmux send-keys -t ${JSON.stringify(sessionName(agentId))} -l ${JSON.stringify(text + '\r')}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// ---- capturing the agent's reply back into the chat thread ----
//
// Terminal output isn't a clean message stream — it's a rendered screen that
// redraws (spinners, streaming tokens, status lines), so naively diffing
// every poll tick would spam the thread with dozens of half-finished
// fragments instead of one clean reply. tmux's own `capture-pane -p` already
// gives us ANSI-free rendered text (tmux does the terminal emulation), so
// the remaining problem is knowing when a reply is actually "done" versus
// mid-redraw. We treat the pane as settled once two consecutive snapshots,
// spaced a beat apart, are IDENTICAL — that's a reasonable proxy for "the
// agent stopped producing output for now", which is what a human watching
// the terminal would also use to judge that a reply finished.
const paneState = new Map(); // agentId -> { lastPosted, lastSnapshot, stableSince }

function capturePane(agentId) {
  try {
    return execSync(`tmux capture-pane -t ${JSON.stringify(sessionName(agentId))} -p -S -200`, { encoding: 'utf8' });
  } catch {
    return null;
  }
}

// Called on a short interval per agent that's running and has an open chat
// view. Posts a new 'agent' chat message when the pane has settled on new
// content since the last thing we captured.
function pollAgentReply(agentId) {
  if (!sessionRunning(agentId)) { paneState.delete(agentId); return; }
  const snap = capturePane(agentId);
  if (snap === null) return;
  const st = paneState.get(agentId);
  const now = Date.now();
  if (!st) {
    // First time we've ever looked at this pane — establish it as the
    // baseline silently. Without this, the very first poll would report the
    // agent's entire existing screen (welcome banner, whatever's already
    // echoed) as a brand-new "reply", which is noise, not an answer.
    paneState.set(agentId, { lastPosted: snap, lastSnapshot: snap, stableSince: now });
    return;
  }
  if (snap === st.lastSnapshot) {
    // Unchanged since last check — if it's been stable long enough and
    // differs from what we already posted, capture it as the reply.
    if (st.stableSince && now - st.stableSince > 1400 && snap.trim() && snap !== st.lastPosted) {
      const newText = extractNewTail(st.lastPosted, snap);
      if (newText) addChatMessage(agentId, { role: 'agent', text: newText });
      paneState.set(agentId, { lastPosted: snap, lastSnapshot: snap, stableSince: st.stableSince });
    }
  } else {
    paneState.set(agentId, { lastPosted: st.lastPosted, lastSnapshot: snap, stableSince: now });
  }
}

// The pane is a full rolling screen, not an append log, so "new" content is
// whatever trailing, non-empty lines exist now that weren't in the last
// posted snapshot. This is a heuristic, not a perfect transcript — but it's
// what turns "watch the raw terminal yourself" into "see the reply in chat".
function extractNewTail(prevText, currText) {
  const prevLines = prevText.split('\n');
  const currLines = currText.split('\n').filter((l) => l.trim());
  if (!prevText) return currLines.join('\n').trim().slice(0, 4000);
  // Find where the previous content's trailing non-empty lines still appear
  // in the current snapshot, and take everything after that as new.
  const prevTrim = prevLines.filter((l) => l.trim());
  let overlapEnd = 0;
  for (let i = 0; i < currLines.length; i++) {
    if (currLines[i] === prevTrim[prevTrim.length - 1]) { overlapEnd = i + 1; }
  }
  const fresh = currLines.slice(overlapEnd).join('\n').trim();
  return fresh.slice(0, 4000);
}

// Kept modest: agents you're actively viewing get polled; this is not meant
// to run for every agent on the machine at once.
const activePolls = new Map(); // agentId -> interval handle
export function watchAgentReplies(agentId) {
  if (activePolls.has(agentId)) return;
  const h = setInterval(() => pollAgentReply(agentId), 1200);
  activePolls.set(agentId, h);
}
export function unwatchAgentReplies(agentId) {
  const h = activePolls.get(agentId);
  if (h) { clearInterval(h); activePolls.delete(agentId); }
}

export function mountBoardRoutes(app, { auth, stateDir }) {
  initBoard({ stateDir });

  // ---- board ----
  app.get('/api/agents/:id/tasks', auth, (req, res) => {
    res.json({ columns: COLUMNS, tasks: tasksForAgent(req.params.id) });
  });

  app.post('/api/agents/:id/tasks', auth, (req, res) => {
    try {
      res.json({ task: createTask({ agentId: req.params.id, ...req.body }) });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.put('/api/tasks/:taskId', auth, (req, res) => {
    try { res.json({ task: updateTask(req.params.taskId, req.body) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.post('/api/tasks/:taskId/move', auth, (req, res) => {
    try { res.json({ task: moveTask(req.params.taskId, req.body.column, req.body.order) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.delete('/api/tasks/:taskId', auth, (req, res) => {
    try { res.json(deleteTask(req.params.taskId)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  // ---- chat ----
  app.get('/api/agents/:id/chat', auth, (req, res) => {
    // The client polls this endpoint while the chat screen is open, so
    // that's also our signal to start watching this agent's pane for
    // replies. watchAgentReplies is a no-op if already watching.
    watchAgentReplies(req.params.id);
    res.json({ messages: chatForAgent(req.params.id), running: sessionRunning(req.params.id) });
  });
  // Client calls this when leaving the chat screen, so we're not polling
  // tmux panes for agents nobody is currently looking at.
  app.post('/api/agents/:id/chat/unwatch', auth, (req, res) => {
    unwatchAgentReplies(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/agents/:id/chat', auth, (req, res) => {
    try {
      const text = String(req.body?.text || '').trim();
      if (!text) return res.status(400).json({ error: 'Message is empty' });
      const msg = addChatMessage(req.params.id, { role: 'you', text });
      const delivered = sendToSession(req.params.id, text);
      res.json({ message: msg, delivered });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
}
