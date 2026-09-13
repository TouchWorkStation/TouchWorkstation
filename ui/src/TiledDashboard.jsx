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
} from 'lucide-react';
import { api, usePoll } from './main.jsx';

function fmtRate(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec < 1024) return `${(bytesPerSec || 0).toFixed(0)} B/s`;
  const mb = bytesPerSec / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
}

export default function TiledDashboard() {
  const [openFile, setOpenFile] = useState(null);
  return (
    <div className="tiled-dash">
      <StatsPane />
      <ProcessListPane />
      <FileTreePane onOpenFile={setOpenFile} />
      <EditorPane path={openFile} />
      <TileTerminal />
    </div>
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
