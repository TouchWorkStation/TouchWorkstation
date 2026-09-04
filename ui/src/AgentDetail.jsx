// ui/src/AgentDetail.jsx
// The per-agent workspace: a kanban board of tasks you assign to the agent,
// and a chat thread that can forward messages into the agent's live session.
// Opened when you tap an agent (from Home or the Agents harness).

import { useEffect, useState, useRef } from 'react';
import {
  ArrowLeft, Plus, Bot, Play, Trash2, Send, X, Check,
  LayoutGrid, MessageSquare,
} from 'lucide-react';
import { api, Button, Pill } from './main.jsx';

const COLUMN_LABELS = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' };
const COLUMN_ORDER = ['todo', 'in_progress', 'done'];

export function AgentDetail({ agentId, go, back }) {
  const [agent, setAgent] = useState(null);
  const [tab, setTab] = useState('chat'); // chat | board
  const [err, setErr] = useState('');

  useEffect(() => {
    api(`/agents/${agentId}`).then((r) => setAgent(r.agent)).catch((e) => setErr(e.message));
  }, [agentId]);

  async function launch() {
    setErr('');
    try {
      const r = await api(`/agents/${agentId}/launch`, { method: 'POST', body: '{}' });
      go('terminal', { pendingCommand: r.command, cwd: r.cwd, sessionId: r.sessionId });
    } catch (e) { setErr(e.message); }
  }

  if (err) return <div className="page-pad"><div className="inline-error">{err}</div><Button onClick={back}><ArrowLeft/> Back</Button></div>;
  if (!agent) return <div className="page-pad"><div className="empty-state">Loading agent…</div></div>;

  return (
    <div className="agent-detail">
      <div className="ad-top">
        <Button onClick={back}><ArrowLeft/> Agents</Button>
        <div className="ad-title"><span className="ad-icon"><Bot/></span><div><strong>{agent.name}</strong><small>{agent.runtimeLabel}{agent.model ? ` · ${agent.model}` : ''}</small></div></div>
        <div className="ad-top-actions">
          <Pill tone={agent.running ? 'success' : ''}>{agent.running ? 'Running' : agent.runtimeInstalled ? 'Ready' : 'Setup'}</Pill>
          <Button className="primary" onClick={launch}><Play/> {agent.running ? 'Attach' : agent.runtimeInstalled ? 'Launch' : 'Install & Launch'}</Button>
        </div>
      </div>

      <div className="ad-tabs">
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><MessageSquare/> Chat</button>
        <button className={tab === 'board' ? 'active' : ''} onClick={() => setTab('board')}><LayoutGrid/> Board</button>
      </div>

      {tab === 'chat' ? <AgentChat agentId={agentId} running={agent.running}/> : <KanbanBoard agentId={agentId}/>}
    </div>
  );
}

function KanbanBoard({ agentId }) {
  const [tasks, setTasks] = useState([]);
  const [adding, setAdding] = useState(null); // column id when adding
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');

  const load = () => api(`/agents/${agentId}/tasks`).then((r) => setTasks(r.tasks || [])).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [agentId]);

  async function add(column) {
    if (!title.trim()) { setAdding(null); return; }
    try {
      await api(`/agents/${agentId}/tasks`, { method: 'POST', body: JSON.stringify({ title, column }) });
      setTitle(''); setAdding(null); load();
    } catch (e) { setErr(e.message); }
  }
  async function move(task, column) {
    try { await api(`/tasks/${task.id}/move`, { method: 'POST', body: JSON.stringify({ column, order: 0 }) }); load(); }
    catch (e) { setErr(e.message); }
  }
  async function remove(task) {
    try { await api(`/tasks/${task.id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); }
  }

  const byColumn = (c) => tasks.filter((t) => t.column === c);

  return (
    <div className="kanban">
      {err && <div className="inline-error">{err}</div>}
      <div className="kanban-cols">
        {COLUMN_ORDER.map((col) => (
          <div className="kanban-col" key={col}>
            <div className="kanban-col-head"><strong>{COLUMN_LABELS[col]}</strong><span>{byColumn(col).length}</span></div>
            <div className="kanban-cards">
              {byColumn(col).map((task) => (
                <div className="kanban-card" key={task.id}>
                  <p>{task.title}</p>
                  {task.description && <small>{task.description}</small>}
                  <div className="kanban-card-actions">
                    {col !== 'todo' && <button title="Move left" onClick={() => move(task, col === 'done' ? 'in_progress' : 'todo')}>←</button>}
                    {col !== 'done' && <button title="Move right" onClick={() => move(task, col === 'todo' ? 'in_progress' : 'done')}>→</button>}
                    <button className="kc-del" title="Delete" onClick={() => remove(task)}><Trash2/></button>
                  </div>
                </div>
              ))}
              {adding === col ? (
                <div className="kanban-add">
                  <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(col); if (e.key === 'Escape') { setAdding(null); setTitle(''); } }} placeholder="Task title…"/>
                  <div className="kanban-add-actions"><button className="primary" onClick={() => add(col)}><Check/></button><button onClick={() => { setAdding(null); setTitle(''); }}><X/></button></div>
                </div>
              ) : (
                <button className="kanban-add-btn" onClick={() => { setAdding(col); setTitle(''); }}><Plus/> Add task</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentChat({ agentId, running }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');
  const endRef = useRef(null);

  const load = () => api(`/agents/${agentId}/chat`).then((r) => setMessages(r.messages || [])).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => { clearInterval(t); api(`/agents/${agentId}/chat/unwatch`, { method: 'POST', body: '{}' }).catch(() => {}); }; }, [agentId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send() {
    const t = text.trim();
    if (!t) return;
    setText(''); setErr(''); setNote('');
    try {
      const r = await api(`/agents/${agentId}/chat`, { method: 'POST', body: JSON.stringify({ text: t }) });
      if (!r.delivered) setNote('Saved to thread — agent isn\u2019t running, so it wasn\u2019t delivered live. Launch the agent to have it act on messages.');
      load();
    } catch (e) { setErr(e.message); }
  }

  return (
    <div className="agent-chat">
      <div className="agent-chat-stream">
        {messages.length === 0 && <div className="empty-state">No messages yet. {running ? 'Say something to the agent.' : 'Messages you send are saved; launch the agent to have it respond.'}</div>}
        {messages.map((m) => (
          <div key={m.id} className={'ac-msg ' + (m.role === 'you' ? 'you' : 'agent')}>
            {m.role === 'agent' && <span className="ac-avatar"><Bot/></span>}
            <div className="ac-bubble"><p>{m.text}</p></div>
          </div>
        ))}
        <div ref={endRef}/>
      </div>
      {note && <div className="notice">{note}</div>}
      {err && <div className="inline-error">{err}</div>}
      <div className="agent-chat-compose">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={running ? 'Message the agent…' : 'Message (agent not running)…'}/>
        <Button className="primary send" onClick={send}><Send/></Button>
      </div>
    </div>
  );
}
