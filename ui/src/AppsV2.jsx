// ui/src/AppsV2.jsx
// Replaces the old Apps()/AppIcon() pair in main.jsx. Renders the curated
// registry from server/apps.js instead of a raw .desktop scan. Same visual
// language as the original (.apps-grid / .app-card / .app-icon), extended
// with a "not configured" state and a routing layer for the three tile kinds.
//
// Wiring into main.jsx:
//   import { AppsV2, WebviewApp } from './AppsV2.jsx';
//   case 'apps': return <AppsV2 go={p.go} project={p.project}/>;
//   case 'webview': return <WebviewApp app={p.webviewApp} back={()=>p.go('apps')}/>;
// (see INTEGRATION-v2.md for the full diff, including the small App-level
// state needed to pass the selected webview app through.)

import { useEffect, useState } from 'react';
import {
  Search, TerminalSquare, Folder, GitBranch, Code2, Server, Bot, Sparkles,
  ArrowLeft, RefreshCcw, Lock, ExternalLink, Download, LayoutGrid,
  Database, Activity, Globe2, Grid3X3, Monitor,
} from 'lucide-react';
import { api, Button, PageTitle, resolveTerminalTarget } from './main.jsx';

export const ICONS = { TerminalSquare, Folder, GitBranch, Code2, Server, Bot, Sparkles, Database, Activity, Globe2, Grid3X3, Monitor };

export function TileIcon({ app }) {
  const Icon = ICONS[app.iconKey] || Bot;
  return (
    <span
      className="app-icon"
      style={{ color: `var(${app.color || '--accent'})`, background: `color-mix(in srgb, var(${app.color || '--accent'}) 14%, transparent)` }}
    >
      <Icon />
    </span>
  );
}

function statusLabel(app, busy) {
  if (app.underConstruction) return 'Under construction';
  if (busy) return app.canInstall && app.kind !== 'terminal-agent' ? 'Installing…' : 'Opening…';
  if (app.canInstall && app.kind === 'terminal-agent') return 'Tap to install & launch';
  if (app.canInstall) return 'Tap to install';
  if (app.configured === false) return 'Set up required';
  if (app.kind === 'native' && app.installed === false) return 'Not installed';
  switch (app.kind) {
    case 'builtin': return 'Open';
    case 'native': return 'Open on this workstation';
    case 'webview': return 'Open';
    case 'terminal-agent': return 'Open in Terminal';
    default: return 'Open';
  }
}

export function useAppLauncher({ go, project }) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [chooser, setChooser] = useState(null); // app awaiting a UI/Terminal choice

  async function open(a) {
    if (a.underConstruction) { setMsg(`${a.name} is under construction — not available yet.`); return; }
    setBusy(a.id); setMsg('');
    try {
      // Not installed but installable -> run the official installer in a
      // visible terminal, right from the phone.
      // Terminal-agent tiles (Claude Code, Codex, Hermes) are the exception:
      // their launch route chains install-then-run in one session, so a
      // single tap installs and starts the agent instead of two separate taps.
      if (a.installed === false && a.canInstall && a.kind !== 'terminal-agent') {
        const res = await api(`/apps/${a.id}/install`, { method: 'POST', body: '{}' });
        go('terminal', { pendingCommand: res.command, cwd: res.cwd, sessionId: res.sessionId });
        return;
      }
      // Not configured and not installable -> nothing to do yet.
      if (a.configured === false && a.kind !== 'terminal-agent') {
        setMsg(`${a.name} isn't available to set up yet.`);
        return;
      }
      // App supports both a UI and a terminal -> ask which the user wants.
      if (Array.isArray(a.modes) && a.modes.length > 1) {
        setBusy('');
        setChooser(a);
        return;
      }
      await openMode(a, a.modes?.[0] || null);
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy('');
    }
  }

  // Open a specific mode for an app (called directly, or from the chooser).
  async function openMode(a, mode) {
    setBusy(a.id); setMsg('');
    try {
      if (mode === 'ui' && a.uiView) { go(a.uiView); return; }
      if (mode === 'terminal') {
        if (a.id === 'docker') { const sessionId = await resolveTerminalTarget('docker'); go('terminal', { pendingCommand: 'docker ps -a', sessionId }); return; }
      }
      if (a.kind === 'builtin') {
        if (a.id === 'docker') { go(a.uiView || 'docker'); return; }
        go(a.id);
        return;
      }
      if (a.kind === 'native') {
        await api('/apps/launch', { method: 'POST', body: JSON.stringify({ id: a.id }) });
        setMsg(`${a.name} launched on this machine.`);
        return;
      }
      if (a.kind === 'webview') { go('webview', { app: a }); return; }
      if (a.kind === 'terminal-agent') {
        // Hermes: the chooser sheet asks CLI (web UI) vs terminal. Respect
        // whichever the user actually picked instead of always trying the
        // UI first — picking Terminal should go straight there.
        if (a.hermesUi && mode === 'ui') {
          let ui = await api('/hermes/ui').catch(() => ({ ready: false }));
          if (!ui.ready) {
            setMsg('Starting the Hermes interface…');
            ui = await api('/hermes/start', { method: 'POST', body: '{}' }).catch(() => ({ ready: false }));
          }
          if (ui.ready && ui.url) {
            go('webview', { app: { id: 'hermes', name: 'Hermes', url: ui.url, proxied: true } });
            return;
          }
          // Fall back to launching Hermes in the terminal (installs first if
          // needed, since terminal-launch chains install).
          setMsg('Couldn\u2019t reach the Hermes web interface \u2014 opening the terminal instead.');
        }
        const res = await api('/apps/terminal-launch', {
          method: 'POST',
          body: JSON.stringify({ id: a.id, cwd: project?.path }),
        });
        // Terminal-agent tiles (Claude Code, Codex, Hermes) get their own
        // stable session every time — not main-if-idle. These are stateful
        // (auth, an ongoing conversation), so bouncing between main and a
        // fallback session depending on the moment's traffic would make
        // credentials or context established in one launch invisible in the
        // next, which is exactly the "keeps asking me to sign in" bug.
        go('terminal', { pendingCommand: res.command, cwd: res.cwd, sessionId: res.sessionId });
        return;
      }
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy('');
    }
  }

  return { open, openMode, busy, msg, setMsg, chooser, setChooser };
}

export function ModeChooserSheet({ chooser, onClose, onPick }) {
  if (!chooser) return null;
  return (
    <div className="mode-sheet-overlay" onClick={onClose}>
      <div className="mode-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h3>Open {chooser.name}</h3>
        <p>How would you like to use it?</p>
        <button className="mode-option" onClick={() => onPick('ui')}>
          <LayoutGrid />
          <div><strong>App</strong><small>Touch-friendly interface</small></div>
        </button>
        <button className="mode-option" onClick={() => onPick('terminal')}>
          <TerminalSquare />
          <div><strong>Terminal</strong><small>Full command-line control</small></div>
        </button>
        <button className="mode-cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

export function AppsV2({ go, project }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const { open, openMode, busy, msg, chooser, setChooser } = useAppLauncher({ go, project });

  useEffect(() => { refresh(); }, []);
  function refresh() { api('/apps').then((x) => setItems(x.apps || [])); }

  const filtered = items.filter((a) => a.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page-pad">
      <PageTitle
        kicker="LAUNCHER"
        title="Apps"
        body="A short, curated set of tools \u2014 not everything installed on this machine."
      />
      <label className="searchbox">
        <Search />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps\u2026" />
      </label>
      {msg && <div className="notice">{msg}</div>}
      <div className="apps-grid">
        {filtered.map((a) => (
          <button
            className={`app-card${a.configured === false && !a.canInstall ? ' app-card-off' : ''}${a.canInstall ? ' app-card-install' : ''}${a.underConstruction ? ' app-card-construction' : ''}`}
            key={a.id}
            onClick={() => open(a)}
            disabled={busy === a.id || a.underConstruction}
          >
            <TileIcon app={a} />
            <strong>{a.name}</strong>
            <small>
              {a.canInstall ? <Download /> : a.configured === false && <Lock />} {statusLabel(a, busy === a.id)}
            </small>
          </button>
        ))}
      </div>
      {chooser && (
        <ModeChooserSheet
          chooser={chooser}
          onClose={() => setChooser(null)}
          onPick={(mode) => { const a = chooser; setChooser(null); openMode(a, mode); }}
        />
      )}
    </div>
  );
}

export function WebviewApp({ app, back }) {
  const [key, setKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);

  // Sites like claude.ai / chatgpt.com send X-Frame-Options/CSP that stop them
  // rendering in an iframe. There's no clean error event for that, so we time
  // out: if the frame hasn't reported load shortly, treat it as blocked and
  // offer to open in a real browser tab instead of showing a blank frame.
  useEffect(() => {
    if (!app?.url) return;
    setLoaded(false); setBlocked(false);
    // Known-unembeddable sites (X-Frame-Options/CSP deny, e.g. GitHub) — don't
    // race a flaky load-timeout heuristic, just go straight to the fallback.
    if (app.embeddable === false) { setBlocked(true); return; }
    // Same-origin proxied content (e.g. the Hermes gateway via /preview/) is
    // never X-Frame blocked, and can take longer to first paint — don't run
    // the blocked-timeout heuristic for it.
    if (app.proxied) return;
    const t = setTimeout(() => { setBlocked((b) => (loaded ? b : true)); }, 4500);
    return () => clearTimeout(t);
  }, [app?.url, key]);

  if (!app) return null;
  return (
    <div className="desktop-page">
      <div className="desktop-toolbar">
        <div>
          <span className="kicker">APP</span>
          <strong>{app.name}</strong>
        </div>
        <div>
          <Button onClick={back}><ArrowLeft /> Back</Button>
          <Button onClick={() => { setKey((k) => k + 1); }}><RefreshCcw /> Reload</Button>
          <a className="btn" href={app.url} target="_blank" rel="noreferrer"><ExternalLink /></a>
        </div>
      </div>
      <div className="desktop-frame">
        {app.url && app.embeddable !== false ? (
          <>
            <iframe
              key={key}
              title={app.name}
              src={app.url}
              onLoad={() => { setLoaded(true); }}
              style={blocked ? { display: 'none' } : undefined}
            />
            {blocked && (
              <div className="desktop-loading">
                <ExternalLink />
                <h2>{app.name} won\u2019t open inside the app</h2>
                <p>{app.name} blocks being embedded for security. Open it in a browser tab instead — you\u2019ll stay signed in there.</p>
                <a className="btn primary" href={app.url} target="_blank" rel="noreferrer"><ExternalLink /> Open {app.name}</a>
                <button className="linklike" onClick={() => { setBlocked(false); setKey((k) => k + 1); }}>Try embedding again</button>
              </div>
            )}
          </>
        ) : app.url ? (
          <div className="desktop-loading">
            <ExternalLink />
            <h2>{app.name} won\u2019t open inside the app</h2>
            <p>{app.name} blocks being embedded for security. Open it in a browser tab instead — you\u2019ll stay signed in there.</p>
            <a className="btn primary" href={app.url} target="_blank" rel="noreferrer"><ExternalLink /> Open {app.name}</a>
          </div>
        ) : (
          <div className="desktop-loading">
            <Sparkles />
            <h2>{app.name} isn\u2019t wired up yet.</h2>
            <p>No URL configured for this app in server/apps.js.</p>
          </div>
        )}
      </div>
    </div>
  );
}
