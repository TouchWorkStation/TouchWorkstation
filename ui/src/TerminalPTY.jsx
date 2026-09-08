// ui/src/TerminalPTY.jsx
// Terminal view: plain, natively-scrollable/selectable pane text (fetched
// from tmux's own scrollback) + a websocket connection for sending input.
//
// Why not xterm.js for display: every session here runs inside tmux (see
// server/pty.js), which manages its own scrollback and redraws the pane
// itself — xterm.js never gets a real native scrollback buffer to scroll
// into, regardless of touch, mouse, or JS driving it. That cost a very long
// debugging effort to fully understand. Plain text from tmux's own
// capture-pane, rendered in a normal scrollable/selectable element, is the
// one mechanism that's actually been proven to work throughout that same
// process — so that's the terminal now, not a secondary view living next to
// a broken primary one.
//
// Trade-off, stated plainly: this no longer renders a live character-by-
// character grid, so full-screen TUI apps (vim, htop, less) will look like
// scrolling text dumps rather than a real screen. Typing, running commands,
// and reading/scrolling/copying output all work; a truly interactive
// full-screen program does not render the way it would in a real terminal
// emulator. That trade was made deliberately, given how much scroll/copy
// reliability was worth versus that.

import { useEffect, useRef, useState } from 'react';
import { api } from './main.jsx';

// Standard 16-color ANSI palette, tuned to stay readable against this app's
// dark terminal background rather than using raw pure colors.
const ANSI_FG = {
  30: '#5c5660', 31: '#e6675f', 32: '#5fd97a', 33: '#e0c250', 34: '#6ea8ff', 35: '#c584e0', 36: '#57c9d0', 37: '#d6d0d8',
  90: '#847d88', 91: '#ff8f88', 92: '#8ef5a3', 93: '#f5db77', 94: '#8ab4f8', 95: '#e0a6f5', 96: '#7fe3e8', 97: '#ffffff',
};
const ANSI_BG = {
  40: '#5c5660', 41: '#e6675f', 42: '#5fd97a', 43: '#e0c250', 44: '#6ea8ff', 45: '#c584e0', 46: '#57c9d0', 47: '#d6d0d8',
  100: '#847d88', 101: '#ff8f88', 102: '#8ef5a3', 103: '#f5db77', 104: '#8ab4f8', 105: '#e0a6f5', 106: '#7fe3e8', 107: '#ffffff',
};

// Parses SGR escape sequences (\x1b[...m — color/bold/dim) into styled
// spans. Any other CSI sequence (cursor movement etc.) is stripped rather
// than rendered, since tmux's capture-pane -e output is a static snapshot
// and shouldn't normally contain those — this is just a safety net against
// garbage characters if one slips through.
function renderAnsi(text) {
  const cleaned = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, (m) => (m.endsWith('m') ? m : ''));
  const out = [];
  let fg = null, bg = null, bold = false, dim = false;
  let pos = 0, key = 0;
  const re = /\x1b\[([0-9;]*)m/g;
  let match;
  function flush(end) {
    if (end <= pos) return;
    const chunk = cleaned.slice(pos, end);
    if (!fg && !bg && !bold && !dim) { out.push(chunk); return; }
    const style = {};
    if (fg) style.color = fg;
    if (bg) style.backgroundColor = bg;
    if (bold) style.fontWeight = 700;
    if (dim) style.opacity = 0.62;
    out.push(<span key={key++} style={style}>{chunk}</span>);
  }
  while ((match = re.exec(cleaned))) {
    flush(match.index);
    const codes = match[1].length ? match[1].split(';').map(Number) : [0];
    for (const c of codes) {
      if (c === 0) { fg = null; bg = null; bold = false; dim = false; }
      else if (c === 1) bold = true;
      else if (c === 2) dim = true;
      else if (c === 22) { bold = false; dim = false; }
      else if (c === 39) fg = null;
      else if (c === 49) bg = null;
      else if (ANSI_FG[c] !== undefined) fg = ANSI_FG[c];
      else if (ANSI_BG[c] !== undefined) bg = ANSI_BG[c];
    }
    pos = re.lastIndex;
  }
  flush(cleaned.length);
  return out;
}

const CONTROL_KEYS = [
  { label: 'Esc', seq: '\x1b' },
  { label: 'Tab', seq: '\t' },
  { label: 'Ctrl+C', seq: '\x03' },
  { label: 'Ctrl+D', seq: '\x04' },
  { label: '↑', seq: '\x1b[A' },
  { label: '↓', seq: '\x1b[B' },
  { label: '←', seq: '\x1b[D' },
  { label: '→', seq: '\x1b[C' },
];

const POLL_MS = 1200;

export default function TerminalPTY({ sessionId = 'main', cwd, pendingCommand }) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const pollTimer = useRef(null);
  const burstTimer = useRef(null);
  const bodyRef = useRef(null);
  const streamBuf = useRef('');
  // A ref (not state) so the scroll handler can read the latest value
  // without needing to re-subscribe on every render.
  const autoScrollRef = useRef(true);

  const [status, setStatus] = useState('connecting'); // connecting | live | disconnected
  const [authUrl, setAuthUrl] = useState(null);
  const [paneText, setPaneText] = useState('');
  const [input, setInput] = useState('');
  const [pasteFallback, setPasteFallback] = useState(false);
  const [pasteText, setPasteText] = useState('');

  async function refreshPane() {
    try {
      const r = await api(`/terminal/sessions/${sessionId}/history`);
      setPaneText(r.text || '');
    } catch { /* transient — the next poll tick retries */ }
  }

  useEffect(() => {
    refreshPane();
    pollTimer.current = setInterval(refreshPane, POLL_MS);

    const setVVH = () => {
      const h = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty('--tw-vvh', `${h}px`);
    };
    setVVH();
    window.addEventListener('resize', setVVH);
    window.visualViewport?.addEventListener('resize', setVVH);

    connect();

    return () => {
      clearInterval(pollTimer.current);
      clearTimeout(burstTimer.current);
      clearTimeout(reconnectTimer.current);
      window.removeEventListener('resize', setVVH);
      window.visualViewport?.removeEventListener('resize', setVVH);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Auto-scroll to the bottom on new content, but only when the user was
  // already at (or near) the bottom — otherwise reading back through
  // history would get yanked back down on every poll tick.
  useEffect(() => {
    const el = bodyRef.current;
    if (el && autoScrollRef.current) el.scrollTop = el.scrollHeight;
  }, [paneText]);

  function onScroll() {
    const el = bodyRef.current;
    if (!el) return;
    autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const params = new URLSearchParams({ session: sessionId, ...(cwd ? { cwd } : {}) });
    const ws = new WebSocket(`${proto}://${location.host}/ws/terminal?${params}`);
    wsRef.current = ws;
    setStatus('connecting');

    ws.onopen = () => {
      setStatus('live');
      // Fixed, generous size — nothing here measures a real character grid
      // anymore, so there's no pixel-perfect size to compute.
      ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
      if (pendingCommand) ws.send(JSON.stringify({ type: 'input', data: pendingCommand + '\r' }));
      refreshPane();
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'data') {
        // Auth-URL detection off the raw stream — unrelated to display,
        // kept exactly as before. tmux/terminals can hard-wrap a long URL
        // mid-string, and it can span multiple websocket chunks, so this
        // strips ANSI escapes and joins across line breaks in a rolling
        // buffer rather than matching against one message at a time.
        let buf = (streamBuf.current + msg.data)
          .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')   // CSI escapes
          .replace(/\x1b\][^\x07]*\x07/g, '');       // OSC escapes
        const joined = buf.replace(/[\r\n]+/g, '');
        streamBuf.current = buf.slice(-4000);
        const m = joined.match(/https?:\/\/[^\s'"]*(?:oauth|authorize|login|callback|setup)[^\s'"]*\?[^\s'"]+/i);
        if (m && /client_id=|code=|token=/i.test(m[0])) setAuthUrl(m[0]);
        // A burst of output likely means something just happened on
        // screen — refresh sooner than the next regular poll tick.
        clearTimeout(burstTimer.current);
        burstTimer.current = setTimeout(refreshPane, 250);
      } else if (msg.type === 'exit') {
        refreshPane();
      }
    };
    ws.onclose = () => {
      setStatus('disconnected');
      reconnectTimer.current = setTimeout(connect, 1500);
    };
    ws.onerror = () => ws.close();
  }

  function sendRaw(seq) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data: seq }));
    }
    clearTimeout(burstTimer.current);
    burstTimer.current = setTimeout(refreshPane, 250);
  }

  function send() {
    const t = input;
    if (!t) return;
    setInput('');
    sendRaw(t + '\r');
  }

  // xterm.js has a long-standing, upstream limitation: its input textarea is
  // positioned off-screen for cursor tracking, which breaks the native
  // long-press "Paste" menu on iOS/Android touch keyboards. That's moot now
  // (no xterm here), but the Clipboard API restriction below still applies
  // regardless of renderer, so the same fallback stays.
  async function pasteFromClipboard() {
    // The Clipboard API's readText() is spec-restricted to secure contexts
    // (HTTPS or localhost). TouchWorkstation serves over plain HTTP on the
    // LAN/Tailscale (http://<host>:8088), which most mobile browsers do NOT
    // treat as secure — so this will fail there before even asking. Skip
    // straight to the fallback input in that case rather than showing a
    // doomed permission prompt first.
    if (!window.isSecureContext || !navigator.clipboard?.readText) {
      setPasteFallback(true);
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text) sendRaw(text);
    } catch {
      // Safari/iOS often denies programmatic clipboard reads even in a
      // secure context, e.g. outside a direct user gesture. Same fallback.
      setPasteFallback(true);
    }
  }
  function submitPasteFallback() {
    if (pasteText) sendRaw(pasteText);
    setPasteText('');
    setPasteFallback(false);
  }

  return (
    <div className="terminal-window">
      <div className="terminal-chrome">
        <div><i/><i/><i/></div>
        <span>terminal — bash{status === 'live' ? '' : status === 'connecting' ? ' (connecting…)' : ' (reconnecting…)'}</span>
        <div className="terminal-chrome-right">
          <span className={`pill ${status === 'live' ? '' : 'pill-off'}`}>
            {status === 'live' ? 'live' : status}
          </span>
        </div>
      </div>
      {authUrl && (
        <div className="term-auth-banner">
          <div className="tab-text">
            <strong>Sign-in link detected</strong>
            <small>Open it to authenticate, then come back to the terminal.</small>
          </div>
          <button className="tab-open" onClick={() => window.open(authUrl, '_blank', 'noopener')}>Open sign-in</button>
          <button className="tab-x" onClick={() => setAuthUrl(null)} aria-label="Dismiss">✕</button>
        </div>
      )}
      {pasteFallback && (
        <div className="term-paste-fallback">
          <input
            autoFocus
            placeholder="Long-press here, then tap Paste, then Send"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitPasteFallback(); }}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck="false"
          />
          <button className="tab-open" onClick={submitPasteFallback}>Send</button>
          <button className="tab-x" onClick={() => { setPasteFallback(false); setPasteText(''); }} aria-label="Cancel">✕</button>
        </div>
      )}
      <pre ref={bodyRef} className="terminal-pty-viewport" onScroll={onScroll}>{renderAnsi(paneText)}</pre>
      <div className="terminal-compose-row">
        <span className="term-prompt-caret">$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Type a command…"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck="false"
        />
        <button className="term-send-btn" onClick={send}>Send</button>
      </div>
      <div className="terminal-mobile-keys">
        <button onClick={pasteFromClipboard} title="Paste">Paste</button>
        {CONTROL_KEYS.map((k) => (
          <button key={k.label} onClick={() => sendRaw(k.seq)}>{k.label}</button>
        ))}
      </div>
    </div>
  );
}
