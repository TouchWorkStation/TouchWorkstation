// ui/src/RemoteAccess.jsx
// A plain-language walkthrough for setting up remote access via Tailscale.
// No Linux jargon: "Do you want to reach this computer away from home?" ->
// install -> tap a sign-in link -> confirmed. Falls back to a copyable
// terminal command only when passwordless sudo isn't available.

import { useEffect, useState } from 'react';
import { ShieldCheck, Check, Copy, ExternalLink, Loader, ArrowRight, X } from 'lucide-react';
import { api, Button, copyText } from './main.jsx';

export function RemoteAccess({ onClose }) {
  const [status, setStatus] = useState(null);
  const [phase, setPhase] = useState('intro'); // intro | installing | signin | connected
  const [authUrl, setAuthUrl] = useState('');
  const [termCmd, setTermCmd] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => api('/vpn/status').then((s) => {
    setStatus(s);
    if (s.connected) setPhase('connected');
  }).catch(() => {});

  useEffect(() => { refresh(); }, []);
  // While waiting on sign-in, poll for the connection to complete.
  useEffect(() => {
    if (phase !== 'signin') return;
    const t = setInterval(() => {
      api('/vpn/status').then((s) => { if (s.connected) { setStatus(s); setPhase('connected'); } }).catch(() => {});
    }, 3000);
    return () => clearInterval(t);
  }, [phase]);

  async function install() {
    setBusy(true); setMsg(''); setTermCmd('');
    try {
      const r = await api('/vpn/install', { method: 'POST', body: '{}' });
      if (r.installed) { await bringUp(); return; }
      if (r.needsTerminal) { setTermCmd(r.command); setMsg(r.message); }
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  async function bringUp() {
    setBusy(true); setMsg(''); setAuthUrl(''); setTermCmd('');
    try {
      const r = await api('/vpn/up', { method: 'POST', body: '{}' });
      if (r.connected) { setPhase('connected'); refresh(); return; }
      if (r.authUrl) { setAuthUrl(r.authUrl); setPhase('signin'); return; }
      if (r.needsTerminal) { setTermCmd(r.command); setMsg(r.message); setPhase('signin'); }
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  function start() {
    if (status?.installed) bringUp();
    else { setPhase('installing'); install(); }
  }

  return (
    <div className="ra-overlay" onClick={onClose}>
      <div className="ra-card" onClick={(e) => e.stopPropagation()}>
        <button className="ra-close" onClick={onClose}><X/></button>
        <div className="ra-icon"><ShieldCheck/></div>

        {phase === 'intro' && <>
          <h2>Reach this computer from anywhere</h2>
          <p>TouchWorkstation can set up a private, secure connection so you can use this workstation when you're away from home — no exposing it to the public internet, no router setup.</p>
          <div className="ra-actions"><Button onClick={onClose}>Not now</Button><Button className="primary" onClick={start} disabled={busy}>{busy ? 'Working…' : <>Set it up <ArrowRight/></>}</Button></div>
        </>}

        {phase === 'installing' && <>
          <h2>Setting up secure access…</h2>
          {termCmd ? <>
            <p>{msg || 'One command is needed in Terminal (it requires administrator access):'}</p>
            <CopyBox text={termCmd}/>
            <p className="ra-hint">Run that in the Terminal tab, then come back and tap Continue.</p>
            <div className="ra-actions"><Button className="primary" onClick={bringUp} disabled={busy}>Continue</Button></div>
          </> : <div className="ra-loading"><Loader className="spin"/> Installing…</div>}
          {msg && !termCmd && <div className="notice">{msg}</div>}
        </>}

        {phase === 'signin' && <>
          <h2>Sign in to connect</h2>
          {authUrl ? <>
            <p>Tap to sign in with your Tailscale account (Google, GitHub, Microsoft, or email). This links your phone and this computer privately.</p>
            <a className="btn primary ra-signin" href={authUrl} target="_blank" rel="noreferrer"><ExternalLink/> Open sign-in page</a>
            <p className="ra-hint">After you sign in, this screen updates automatically.</p>
          </> : termCmd ? <>
            <p>{msg || 'Run this in Terminal to sign in:'}</p>
            <CopyBox text={termCmd}/>
            <p className="ra-hint">A sign-in link will appear in the terminal. Open it, sign in, then come back.</p>
            <div className="ra-actions"><Button className="primary" onClick={bringUp} disabled={busy}>Check again</Button></div>
          </> : <div className="ra-loading"><Loader className="spin"/> Preparing sign-in…</div>}
        </>}

        {phase === 'connected' && <>
          <div className="ra-success"><Check/></div>
          <h2>Remote access is ready</h2>
          {status?.viaTailscale ? (
            <p>You're connected securely through Tailscale right now.</p>
          ) : (
            <>
              <p>Tailscale is set up on this computer \u2014 but you're viewing this page over your local Wi-Fi right now, not through Tailscale.</p>
              <p className="ra-hint">Make sure the Tailscale app is installed and signed in on this phone too (same account), then open this address instead of the one you're on now:</p>
              {status?.hostname && <CopyBox text={status.hostname}/>}
            </>
          )}
          {status?.ip && <div className="ra-detail"><span>This device</span><strong>{status.hostname || status.ip}</strong></div>}
          <div className="ra-actions"><Button className="primary" onClick={onClose}>Done</Button></div>
        </>}
      </div>
    </div>
  );
}

function CopyBox({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="ra-copybox">
      <code>{text}</code>
      <button onClick={() => { copyText(text, 'remote access'); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
        {copied ? <Check/> : <Copy/>}
      </button>
    </div>
  );
}
