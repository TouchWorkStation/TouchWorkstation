// ui/src/MinimalTerminalPTY.jsx
// Terminal view for the Omarchy UI variant — on by default when built with
// VITE_THEME=minimal (the Arch/Omarchy package — see packaging/arch/PKGBUILD),
// or when the user flips Settings > Appearance > Interface to "Omarchy" at
// runtime. Every other build/setting keeps rendering the standard
// TerminalPTY.jsx from ui/src/, byte for byte unchanged.
//
// Same backend (websocket for input, polled tmux capture-pane for output)
// as the standard terminal — this file only changes how it's presented:
// full-screen, no title bar or chrome, no boxed "Send" button — typing
// happens on an inline prompt line and Enter submits, the way an actual
// terminal emulator works, not a web form sitting below one.

import { useEffect, useRef, useState } from 'react';
import { api } from './main.jsx';

const CONTROL_KEYS = [
  { label: 'esc', seq: '\x1b' },
  { label: 'tab', seq: '\t' },
  { label: '^c', seq: '\x03' },
  { label: '^d', seq: '\x04' },
  { label: '\u2191', seq: '\x1b[A' },
  { label: '\u2193', seq: '\x1b[B' },
  { label: '\u2190', seq: '\x1b[D' },
  { label: '\u2192', seq: '\x1b[C' },
];

const POLL_MS = 1200;

export default function MinimalTerminalPTY({ sessionId = 'main', cwd, pendingCommand }) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const pollTimer = useRef(null);
  const burstTimer = useRef(null);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const streamBuf = useRef('');
  const autoScrollRef = useRef(true);

  const [status, setStatus] = useState('connecting');
  const [authUrl, setAuthUrl] = useState(null);
  const [paneText, setPaneText] = useState('');
  const [input, setInput] = useState('');
  const [pasteFallback, setPasteFallback] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // tmux's capture-pane -e returns text with the terminal's raw ANSI escape
  // sequences embedded (colors, cursor moves, hyperlinks, title-set OSCs).
  // The standard TerminalPTY parses SGR codes into styled spans; this
  // minimal terminal deliberately doesn't do that (part of the "text-message
  // box" look), so instead strip every escape sequence to plain text.
  // Without this, running any tool with color output (ls, git status, htop)
  // fills the pane with garbage like `[38;5;220m`.
  function stripAnsi(s) {
    return (s || '')
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')  // CSI (colors, cursor, etc.)
      .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '') // OSC (title, hyperlinks)
      .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '')    // DCS/SOS/PM/APC strings
      .replace(/\x1b[()][0-9A-Za-z]/g, '')          // Charset selection
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ''); // stray controls
  }

  async function refreshPane() {
    try {
      const r = await api(`/terminal/sessions/${sessionId}/history`);
      setPaneText(stripAnsi(r.text || ''));
    } catch { /* transient */ }
  }

  useEffect(() => {
    refreshPane();
    pollTimer.current = setInterval(refreshPane, POLL_MS);

    // Keyboard-avoidance. iOS Safari never shrinks the layout viewport (or
    // `100dvh`) for the software keyboard — only `window.visualViewport`
    // reports it — so this is the only way to know the keyboard opened at
    // all. Height alone isn't enough though: iOS can also shift the visual
    // viewport's own origin (`offsetTop`) up when it repositions the page
    // around a focused input, and a plain `position:fixed;inset:0` element
    // doesn't track that — it stays pinned to the *layout* viewport's top
    // corner, which is what left a dead gap ("the UI hanging") the size of
    // the keyboard after closing it, and kept it from sitting flush at the
    // top to begin with. Setting both --tw-vvh and --tw-vv-top every time
    // either fires, on both 'resize' and 'scroll' (iOS sometimes only
    // fires one or the other depending on why the viewport changed), keeps
    // the terminal pinned to wherever the visible viewport actually is.
    const setVVH = () => {
      const vv = window.visualViewport;
      document.documentElement.style.setProperty('--tw-vvh', `${vv?.height || window.innerHeight}px`);
      document.documentElement.style.setProperty('--tw-vv-top', `${vv?.offsetTop || 0}px`);
    };
    setVVH();
    window.addEventListener('resize', setVVH);
    window.visualViewport?.addEventListener('resize', setVVH);
    window.visualViewport?.addEventListener('scroll', setVVH);

    connect();

    return () => {
      clearInterval(pollTimer.current);
      clearTimeout(burstTimer.current);
      clearTimeout(reconnectTimer.current);
      window.removeEventListener('resize', setVVH);
      window.visualViewport?.removeEventListener('resize', setVVH);
      window.visualViewport?.removeEventListener('scroll', setVVH);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

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
      ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
      if (pendingCommand) ws.send(JSON.stringify({ type: 'input', data: pendingCommand + '\r' }));
      refreshPane();
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'data') {
        let buf = (streamBuf.current + msg.data)
          .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
          .replace(/\x1b\][^\x07]*\x07/g, '');
        const joined = buf.replace(/[\r\n]+/g, '');
        streamBuf.current = buf.slice(-4000);
        const m = joined.match(/https?:\/\/[^\s'"]*(?:oauth|authorize|login|callback|setup)[^\s'"]*\?[^\s'"]+/i);
        if (m && /client_id=|code=|token=/i.test(m[0])) setAuthUrl(m[0]);
        clearTimeout(burstTimer.current);
        burstTimer.current = setTimeout(refreshPane, 250);
      } else if (msg.type === 'exit') {
        refreshPane();
      }
    };
    ws.onclose = () => { setStatus('disconnected'); reconnectTimer.current = setTimeout(connect, 1500); };
    ws.onerror = () => ws.close();
  }

  function sendRaw(seq) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data: seq }));
    }
    clearTimeout(burstTimer.current);
    burstTimer.current = setTimeout(refreshPane, 250);
  }

  // Blank Enter is valid and common (dismissing a prompt, paging through
  // less, or just a blank line) — never swallow it.
  function send() {
    const t = input;
    setInput('');
    sendRaw(t + '\r');
  }

  async function pasteFromClipboard() {
    if (!window.isSecureContext || !navigator.clipboard?.readText) { setPasteFallback(true); return; }
    try {
      const text = await navigator.clipboard.readText();
      if (text) sendRaw(text);
    } catch {
      setPasteFallback(true);
    }
  }
  function submitPasteFallback() {
    if (pasteText) sendRaw(pasteText);
    setPasteText('');
    setPasteFallback(false);
  }

  return (
    <div className="mt-root">
      <pre ref={bodyRef} className="mt-pane" onScroll={onScroll}>{paneText}</pre>

      {authUrl && (
        <div className="mt-auth">
          <span>{'sign-in link detected \u2014'}</span>
          <button onClick={() => window.open(authUrl, '_blank', 'noopener')}>open</button>
          <button onClick={() => setAuthUrl(null)} aria-label="dismiss">{'\u2715'}</button>
        </div>
      )}

      {pasteFallback && (
        <div className="mt-paste-fallback">
          <input
            autoFocus
            placeholder="long-press, paste, then send"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitPasteFallback(); }}
          />
          <button onClick={submitPasteFallback}>send</button>
          <button onClick={() => { setPasteFallback(false); setPasteText(''); }} aria-label="cancel">{'\u2715'}</button>
        </div>
      )}

      <div className="mt-prompt-row" onClick={() => inputRef.current?.focus()}>
        <span className="mt-caret">{status === 'live' ? '\u276f' : '\u2026'}</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck="false"
        />
      </div>

      <div className="mt-keys">
        <button onClick={pasteFromClipboard}>paste</button>
        {CONTROL_KEYS.map((k) => (
          <button key={k.label} onClick={() => sendRaw(k.seq)}>{k.label}</button>
        ))}
      </div>
    </div>
  );
}
