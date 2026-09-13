// ui/src/TiledDashboard.jsx
// A second Omarchy home screen — Settings > Appearance > Home Layout >
// Tiled. Unlike MinimalDashboard.jsx (a plain destination list over a
// wallpaper), this shows several genuinely live, independently-usable
// panes at once: system stats, a process list, a file tree, a config-file
// editor, and a terminal — the tiling-window-manager feel of a real
// Omarchy/Hyprland desktop, translated to a phone as a scrollable stack of
// full-width cards (each internally scrollable) rather than a cramped
// side-by-side grid that wouldn't fit a phone's width. Wide viewports
// (tablet/desktop) get an actual 2-column grid instead, since there's
// room for one there.
//
// Every pane reuses an existing endpoint where one already existed
// (status, files, the terminal's websocket protocol); processes and
// file-content editing are new endpoints added alongside this feature —
// see server/index.js's /api/processes and /api/file-content.

import { useEffect, useRef, useState } from 'react';
import {
  Cpu, Upload, Download, Folder, FileText, Save, TerminalSquare, ChevronUp,
  Code2, GitBranch, Box, Sparkles, ClipboardList, Keyboard, Settings as SettingsIcon,
  Bot,
} from 'lucide-react';
import { api, usePoll } from './main.jsx';

// The Omarchy home is rendered "bare" (no topbar, no dock — see Shell in
// main.jsx), so unlike every other screen this one has to carry its own way
// out. MinimalDashboard is itself a destination list so it never needed one;
// the tiled layout is all panes, which left it with no navigation at all.
const NAV_TARGETS = [
  { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
  { id: 'projects', label: 'Projects', icon: Code2 },
  { id: 'files', label: 'Files', icon: Folder },
  { id: 'projects', label: 'GitHub', icon: GitBranch },
  { id: 'docker', label: 'Containers', icon: Box },
  { id: 'agents', label: 'Agents', icon: Sparkles },
  { id: 'clipboard', label: 'Clipboard', icon: ClipboardList },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

// Which panes exist, and the order they render in by default. Exported so
// Settings can build its picker from the same list rather than duplicating
// the names — same single-source-of-truth shape HomeTiles.jsx uses for the
// standard home screen's tiles.
export const TILED_PANES = [
  { id: 'stats', name: 'System', description: 'CPU, memory, disk and network' },
  { id: 'agents', name: 'AI CLIs', description: 'Claude Code, Codex, Antigravity' },
  { id: 'processes', name: 'Processes', description: 'Live top process list' },
  { id: 'files', name: 'Files', description: 'Browse and open files' },
  { id: 'editor', name: 'Editor', description: 'Edit the file you opened' },
  { id: 'terminal', name: 'Terminal', description: 'A live shell in a tile' },
];
export const DEFAULT_TILED_PANES = ['stats', 'agents', 'processes', 'files', 'editor', 'terminal'];

function fmtRate(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec < 1024) return `${(bytesPerSec || 0).toFixed(0)} B/s`;
  const mb = bytesPerSec / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
}

export default function TiledDashboard({ go, settings }) {
  const [openFile, setOpenFile] = useState(null);
  const enabled = settings?.tiledPanes?.length ? settings.tiledPanes : DEFAULT_TILED_PANES;
  // Unknown ids (a pane removed in a later version, a stale saved config)
  // are dropped rather than rendered as a blank hole.
  const panes = {
    stats: <StatsPane key="stats" />,
    agents: <AgentCliPane key="agents" go={go} />,
    processes: <ProcessListPane key="processes" />,
    files: <FileTreePane key="files" onOpenFile={setOpenFile} />,
    editor: <EditorPane key="editor" path={openFile} />,
    terminal: <TileTerminal key="terminal" />,
  };
  return (
    <div className="tiled-dash">
      <TiledNav go={go} />
      {enabled.map((id) => panes[id]).filter(Boolean)}
    </div>
  );
}

function TiledNav({ go }) {
  return (
    <div className="tiled-nav">
      <div className="tiled-nav-scroll">
        {NAV_TARGETS.map((n) => (
          <button key={n.label} onClick={() => go?.(n.id)}><n.icon /> {n.label}</button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------- AI CLIs -----------------------------------

// The three coding CLIs, surfaced straight on the home screen so they're one
// tap away instead of buried in Agents. Install/login/launch all resolve
// their real command server-side (server/agents.js) and hand it to the
// terminal — the same plumbing the Agents screen uses, not a second copy of
// the command strings.
const CLI_IDS = ['claude-code', 'codex', 'antigravity'];

function AgentCliPane({ go }) {
  const [runtimes, setRuntimes] = useState(null);
  const [msg, setMsg] = useState('');

  async function load() {
    try { const r = await api('/agents/runtimes'); setRuntimes(r.runtimes || []); }
    catch { setRuntimes([]); }
  }
  useEffect(() => { load(); }, []);

  // The server decides install vs login vs launch vs reattach in one place
  // (resolveOpen in server/agents.js) — the client just carries out whatever
  // it says. `attach` deliberately sends no command: the CLI is already
  // sitting in its own session, so re-sending one would type into its prompt.
  async function run(rt) {
    setMsg('');
    try {
      const r = await api(`/agents/runtimes/${rt.id}/open`, { method: 'POST', body: '{}' });
      go?.('terminal', {
        sessionId: r.sessionId,
        cwd: r.cwd,
        pendingCommand: r.action === 'attach' ? undefined : r.command,
      });
    } catch (e) { setMsg(e.message); }
  }

  const list = (runtimes || []).filter((r) => CLI_IDS.includes(r.id));
  const stateOf = (rt) => (!rt.installed ? 'install' : !rt.loggedIn ? 'log in' : 'open');
  const hintOf = (rt) => (!rt.installed ? 'Tap to install' : !rt.loggedIn ? 'Tap to sign in once' : `Resume ${rt.defaultCommand}`);

  return (
    <Pane icon={Bot} title="AI CLIs" className="tile-agents">
      {msg && <div className="tile-pane-error">{msg}</div>}
      <div className="tile-agents-list">
        {list.map((rt) => (
          <button key={rt.id} className="tile-agent-row" onClick={() => run(rt)}>
            <Bot />
            <div className="tile-agent-copy">
              <strong>{rt.label}</strong>
              <small>{hintOf(rt)}</small>
            </div>
            <span className={'tile-agent-state' + (rt.installed && rt.loggedIn ? ' ready' : '')}>
              {stateOf(rt)}
            </span>
          </button>
        ))}
        {runtimes && !list.length && <div className="tile-pane-empty">No CLI runtimes found.</div>}
        {!runtimes && <div className="tile-pane-empty">Loading…</div>}
      </div>
    </Pane>
  );
}

function Pane({ icon: Icon, title, right, className = '', children }) {
  return (
    <div className={'tile-pane ' + className}>
      <div className="tile-pane-head">
        {Icon && <Icon />}
        <span>{title}</span>
        <div className="tile-pane-head-right">{right}</div>
      </div>
      {children}
    </div>
  );
}

// ---------------------------------- Stats -----------------------------------

function StatsPane() {
  const [status] = usePoll(() => api('/status'), 3000, []);
  return (
    <Pane icon={Cpu} title="System" className="tile-stats">
      <div className="tile-stats-grid">
        <div className="tile-stat"><span>CPU</span><strong>{status ? `${status.cpu}%` : '—'}</strong></div>
        <div className="tile-stat">
          <span>MEM</span><strong>{status ? `${status.memory}%` : '—'}</strong>
          {status?.specs && <small>{status.specs.memUsedGB} / {status.specs.memTotalGB} GB</small>}
        </div>
        <div className="tile-stat">
          <span>DISK</span><strong>{status ? `${status.disk}%` : '—'}</strong>
          {status?.specs && <small>{status.specs.diskUsedGB} / {status.specs.diskTotalGB} GB</small>}
        </div>
        <div className="tile-stat">
          <span>NET</span>
          <small><Upload /> {fmtRate(status?.net?.txBps)}</small>
          <small><Download /> {fmtRate(status?.net?.rxBps)}</small>
        </div>
      </div>
    </Pane>
  );
}

// ------------------------------- Process list --------------------------------

function ProcessListPane() {
  const [data] = usePoll(() => api('/processes').catch(() => ({ processes: [] })), 4000, []);
  const rows = data?.processes || [];
  return (
    <Pane title="Processes" className="tile-processes">
      <div className="tile-proc-table">
        <div className="tile-proc-row tile-proc-head">
          <span>PID</span><span>USER</span><span>CPU%</span><span>MEM%</span><span>COMMAND</span>
        </div>
        {rows.map((p) => (
          <div className="tile-proc-row" key={p.pid}>
            <span>{p.pid}</span>
            <span className="tile-proc-user">{p.user}</span>
            <span>{p.cpu.toFixed(1)}</span>
            <span>{p.mem.toFixed(1)}</span>
            <span className="tile-proc-cmd">{p.command}</span>
          </div>
        ))}
        {!rows.length && <div className="tile-pane-empty">Loading…</div>}
      </div>
    </Pane>
  );
}

// --------------------------------- File tree ----------------------------------

function FileTreePane({ onOpenFile }) {
  const [dir, setDir] = useState(null); // null = home
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/files' + (dir ? `?path=${encodeURIComponent(dir)}` : '')).then((r) => { setData(r); setErr(''); }).catch((e) => setErr(e.message));
  }, [dir]);

  return (
    <Pane
      icon={Folder}
      title="Files"
      className="tile-files"
      right={data?.parent && <button className="tile-mini-btn" onClick={() => setDir(data.parent)}><ChevronUp /> Up</button>}
    >
      {err && <div className="tile-pane-error">{err}</div>}
      <div className="tile-file-list">
        {data?.entries?.map((f) => (
          <button key={f.path} className="tile-file-row" onClick={() => (f.directory ? setDir(f.path) : onOpenFile(f.path))}>
            {f.directory ? <Folder /> : <FileText />}
            <span>{f.name}</span>
          </button>
        ))}
        {data && !data.entries?.length && <div className="tile-pane-empty">Empty folder.</div>}
      </div>
    </Pane>
  );
}

// ----------------------------------- Editor -----------------------------------

function EditorPane({ path }) {
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const gutterRef = useRef(null);
  const areaRef = useRef(null);

  useEffect(() => {
    if (!path) return;
    setMsg('Loading…');
    api(`/file-content?path=${encodeURIComponent(path)}`)
      .then((r) => { setContent(r.content); setSaved(r.content); setMsg(''); })
      .catch((e) => setMsg(e.message));
  }, [path]);

  async function save() {
    setBusy(true); setMsg('');
    try {
      await api('/file-content', { method: 'POST', body: JSON.stringify({ path, content }) });
      setSaved(content);
      setMsg('Saved');
      setTimeout(() => setMsg(''), 1500);
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  function syncGutterScroll() {
    if (gutterRef.current && areaRef.current) gutterRef.current.scrollTop = areaRef.current.scrollTop;
  }

  const dirty = path && content !== saved;
  const lineCount = content ? content.split('\n').length : 1;

  return (
    <Pane
      icon={FileText}
      title={path ? path.split('/').pop() : 'Editor'}
      className="tile-editor"
      right={path && <button className="tile-mini-btn" onClick={save} disabled={busy || !dirty}><Save /> {dirty ? 'Save' : 'Saved'}</button>}
    >
      {msg && <div className="tile-editor-msg">{msg}</div>}
      {!path ? (
        <div className="tile-pane-empty">Tap a file in Files to edit it here.</div>
      ) : (
        <div className="tile-editor-body">
          <div className="tile-editor-gutter" ref={gutterRef}>
            {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
          </div>
          <textarea
            ref={areaRef}
            className="tile-editor-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onScroll={syncGutterScroll}
            spellCheck="false"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>
      )}
    </Pane>
  );
}

// --------------------------------- Terminal -----------------------------------

// Deliberately its own small, self-contained implementation rather than
// reusing MinimalTerminalPTY here — that component's keyboard-avoidance
// (visualViewport → CSS vars on <html>) and full-screen assumptions are
// built for being the ENTIRE screen, not one tile among five. This pane
// gets its own dedicated tmux session ("tile", i.e. tw-tile server-side —
// see server/pty.js) at a smaller size, so it never collides with the
// user's main terminal session.
function TileTerminal() {
  const wsRef = useRef(null);
  const bodyRef = useRef(null);
  const burstTimer = useRef(null);
  const [status, setStatus] = useState('connecting');
  const [paneText, setPaneText] = useState('');
  const [input, setInput] = useState('');

  function stripAnsi(s) {
    return (s || '')
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
      .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }

  async function refreshPane() {
    try {
      const r = await api('/terminal/sessions/tile/history');
      setPaneText(stripAnsi(r.text || ''));
    } catch { /* transient */ }
  }

  useEffect(() => {
    refreshPane();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/terminal?session=tile`);
    wsRef.current = ws;
    ws.onopen = () => {
      setStatus('live');
      ws.send(JSON.stringify({ type: 'resize', cols: 56, rows: 14 }));
      refreshPane();
    };
    ws.onmessage = () => {
      clearTimeout(burstTimer.current);
      burstTimer.current = setTimeout(refreshPane, 250);
    };
    ws.onclose = () => setStatus('disconnected');
    ws.onerror = () => ws.close();
    return () => { clearTimeout(burstTimer.current); ws.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [paneText]);

  function send() {
    const t = input;
    setInput('');
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: 'input', data: t + '\r' }));
  }

  return (
    <Pane
      icon={TerminalSquare}
      title="Terminal"
      className="tile-terminal"
      right={<span className={'tile-status' + (status === 'live' ? ' on' : '')}>{status}</span>}
    >
      <pre className="tile-term-body" ref={bodyRef}>{paneText}</pre>
      <div className="tile-term-input-row">
        <span>$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Type a command…"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck="false"
        />
      </div>
    </Pane>
  );
}
