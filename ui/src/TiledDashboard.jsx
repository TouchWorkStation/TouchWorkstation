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
  Bot, House, Grid3X3, CloudRain,
} from 'lucide-react';
import { api, usePoll } from './main.jsx';

// The Omarchy home is rendered "bare" (no topbar, no dock — see Shell in
// main.jsx), so unlike every other screen this one has to carry its own way
// out. MinimalDashboard is itself a destination list so it never needed one;
// the tiled layout is all panes, which left it with no navigation at all.
const NAV_TARGETS = [
  { id: 'home', label: 'Home', icon: House },
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
  { id: 'weather', name: 'Weather radar', description: 'Pixelated CLI-style precipitation radar' },
  { id: 'agents', name: 'AI CLIs', description: 'Claude Code, Codex, Antigravity' },
  { id: 'apps', name: 'Apps', description: 'Installed apps, each a launcher tile' },
  { id: 'processes', name: 'Processes', description: 'Live top process list' },
  { id: 'files', name: 'Files', description: 'Browse and open files' },
  { id: 'editor', name: 'Editor', description: 'Edit the file you opened' },
  { id: 'terminal', name: 'Terminal', description: 'A live shell in a tile' },
];
export const DEFAULT_TILED_PANES = ['stats', 'weather', 'agents', 'apps', 'processes', 'files', 'editor', 'terminal'];

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
    weather: <WeatherRadarPane key="weather" />,
    agents: <AgentCliPane key="agents" go={go} />,
    apps: <AppsPane key="apps" go={go} />,
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
  const [projects, setProjects] = useState([]);
  const [scope, setScope] = useState(''); // '' = home, otherwise a project path
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api('/agents/runtimes').then((r) => setRuntimes(r.runtimes || [])).catch(() => setRuntimes([]));
    api('/projects').then((r) => setProjects(r.projects || [])).catch(() => setProjects([]));
  }, []);

  // The server decides install vs launch vs reattach in one place
  // (resolveOpen in server/agents.js) — the client just carries out whatever
  // it says. `attach` deliberately sends no command: the CLI is already
  // sitting in its own session, so re-sending one would type into its prompt.
  async function run(rt, opts = {}) {
    setMsg('');
    try {
      const r = await api(`/agents/runtimes/${rt.id}/open`, {
        method: 'POST',
        body: JSON.stringify({ login: !!opts.login, apiKey: !!opts.apiKey, cwd: scope || undefined }),
      });
      go?.('terminal', {
        sessionId: r.sessionId,
        cwd: r.cwd,
        pendingCommand: r.action === 'attach' ? undefined : r.command,
      });
    } catch (e) { setMsg(e.message); }
  }

  const list = (runtimes || []).filter((r) => CLI_IDS.includes(r.id));
  const scopeName = scope ? (projects.find((p) => p.path === scope)?.name || scope.split('/').pop()) : 'Home';

  return (
    <Pane
      icon={Bot}
      title="AI CLIs"
      className="tile-agents"
      right={projects.length > 0 && (
        // Which directory the CLI opens in, so a signed-in agent can actually
        // work on a project instead of always starting in the home folder.
        <select className="tile-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="">Home</option>
          {projects.map((p) => <option key={p.path} value={p.path}>{p.name}</option>)}
        </select>
      )}
    >
      {msg && <div className="tile-pane-error">{msg}</div>}
      <div className="tile-agents-list">
        {list.map((rt) => (
          <div key={rt.id} className="tile-agent-row">
            <Bot />
            <button className="tile-agent-main" onClick={() => run(rt)}>
              <strong>{rt.label}</strong>
              <small>{rt.installed ? `Open in ${scopeName}` : 'Tap to install, then it opens'}</small>
            </button>
            {rt.installed && rt.canLogin && (
              <button className="tile-agent-signin" onClick={() => run(rt, { login: true })} title={`Sign in to ${rt.label}`}>sign in</button>
            )}
            {rt.installed && rt.canApiKeyLogin && (
              // Headless fallback for Codex when device-auth's account setting
              // isn't on and the OAuth redirect can't complete from a phone.
              <button className="tile-agent-signin" onClick={() => run(rt, { apiKey: true })} title={`Sign in to ${rt.label} with an API key`}>API key</button>
            )}
            <span className={'tile-agent-state' + (rt.installed ? ' ready' : '')}>
              {rt.installed ? 'open' : 'install'}
            </span>
          </div>
        ))}
        {runtimes && !list.length && <div className="tile-pane-empty">No CLI runtimes found.</div>}
        {!runtimes && <div className="tile-pane-empty">Loading…</div>}
      </div>
    </Pane>
  );
}

// ----------------------------------- Apps -----------------------------------

// Every installed app from the curated registry (server/apps.js), each as its
// own launcher tile — so the tiled home reflects what's actually installed and
// updates as apps are added, instead of a fixed pane set. Launch reuses the
// existing flows (terminal-launch / native launch / webview) rather than a
// second copy of that logic.
function AppsPane({ go }) {
  const [apps, setApps] = useState(null);
  const [msg, setMsg] = useState('');
  const load = () => api('/apps').then((r) => setApps(r.apps || [])).catch(() => setApps([]));
  useEffect(() => { load(); }, []);

  async function open(a) {
    setMsg('');
    try {
      if (a.kind === 'builtin') {
        // Terminal/Files/Docker etc. are in-app views, not launched externally.
        go?.(a.uiView || a.id);
      } else if (a.kind === 'terminal-agent') {
        const r = await api('/apps/terminal-launch', { method: 'POST', body: JSON.stringify({ id: a.id }) });
        go?.('terminal', { sessionId: r.sessionId, cwd: r.cwd, pendingCommand: r.command });
      } else if (a.kind === 'native') {
        await api('/apps/launch', { method: 'POST', body: JSON.stringify({ id: a.id }) });
        setMsg(`${a.name} launched on the desktop.`);
      } else if (a.kind === 'webview' && a.url) {
        window.open(a.url, '_blank', 'noopener');
      }
    } catch (e) { setMsg(e.message); }
  }

  // Installed (or configured builtins) first; a greyed, tappable "install"
  // tile for the rest, rather than hiding them.
  const installed = (apps || []).filter((a) => a.installed || a.kind === 'builtin' || a.configured);
  const available = (apps || []).filter((a) => !(a.installed || a.kind === 'builtin' || a.configured));

  return (
    <Pane icon={Grid3X3} title="Apps" className="tile-apps">
      {msg && <div className="tile-pane-error">{msg}</div>}
      <div className="tile-apps-grid">
        {[...installed, ...available].map((a) => (
          <button key={a.id} className={'tile-app' + (installed.includes(a) ? '' : ' off')} onClick={() => open(a)}>
            <Box />
            <span>{a.name}</span>
            {!installed.includes(a) && <em>install</em>}
          </button>
        ))}
        {apps && !apps.length && <div className="tile-pane-empty">No apps found.</div>}
        {!apps && <div className="tile-pane-empty">Loading…</div>}
      </div>
    </Pane>
  );
}

// --------------------------------- Weather ----------------------------------

// A phone-native replacement for omastorm (which is desktop-only Quickshell):
// a real precipitation grid from /api/weather rendered as pixelated block
// glyphs — the "radar written and displayed in the CLI" look the user asked
// for. Dry weather renders as an empty field with the location/temp header,
// which is honest rather than faking returns.
const WX_CODES = {
  0: 'Clear', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Violent showers',
  85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm',
};
// precipitation mm -> glyph + intensity class (green→yellow→red).
function radarCell(mm) {
  if (!mm || mm < 0.05) return { ch: '·', lvl: 0 }; // ·
  if (mm < 0.5) return { ch: '░', lvl: 1 };          // ░
  if (mm < 2) return { ch: '▒', lvl: 2 };            // ▒
  if (mm < 6) return { ch: '▓', lvl: 3 };            // ▓
  return { ch: '█', lvl: 4 };                         // █
}
function WeatherRadarPane() {
  const [wx] = usePoll(() => api('/weather').catch(() => ({ ok: false, message: 'offline' })), 5 * 60 * 1000, []);
  const header = wx?.ok
    ? `${wx.place}${wx.temp != null ? ` · ${Math.round(wx.temp)}°C` : ''}${wx.code != null ? ` · ${WX_CODES[wx.code] || ''}` : ''}`
    : (wx ? (wx.message || 'Unavailable') : 'Loading…');
  return (
    <Pane icon={CloudRain} title="Weather radar" className="tile-weather">
      <div className="tile-wx-head">{header}</div>
      {wx?.ok && wx.grid && (
        <pre className="tile-wx-radar">
          {wx.grid.map((row, r) => (
            <div key={r}>
              {row.map((mm, c) => { const cell = radarCell(mm); return <span key={c} className={'wx' + cell.lvl}>{cell.ch}</span>; })}
            </div>
          ))}
        </pre>
      )}
      {wx && !wx.ok && <div className="tile-pane-empty">{wx.message || 'Radar unavailable.'}</div>}
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
