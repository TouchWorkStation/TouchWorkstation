// ui/src/Network.jsx
// Network & VPN control center. Lists NetworkManager VPN connections
// (WireGuard / OpenVPN) with connect/disconnect/delete, lets you import a
// config (.conf / .ovpn, pasted or from a file), and surfaces Tailscale (the
// mesh VPN) alongside them. Any step that needs root falls back to a
// copy-the-command box, same as the Tailscale wizard.

import { useEffect, useState } from 'react';
import { Network as NetIcon, ShieldCheck, Plus, Trash2, Loader, X, Wifi, Globe2, Copy, Check, Lock } from 'lucide-react';
import { api, Button, PageTitle, copyText } from './main.jsx';
import { RemoteAccess } from './RemoteAccess.jsx';

function CmdBox({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="nw-cmd">
      <code>{text}</code>
      <button onClick={() => { copyText(text, 'network'); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check /> : <Copy />}</button>
    </div>
  );
}

const KIND_LABEL = { wireguard: 'WireGuard', openvpn: 'OpenVPN', openconnect: 'OpenConnect', vpn: 'VPN' };

export function Network() {
  const [net, setNet] = useState(null);
  const [vpns, setVpns] = useState(null);
  const [ts, setTs] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null); // {message, command}
  const [adding, setAdding] = useState(false);
  const [showRA, setShowRA] = useState(false);

  const load = async () => {
    try {
      const [n, v, t] = await Promise.all([
        api('/network').catch(() => null),
        api('/vpn/connections').catch(() => ({ connections: [] })),
        api('/vpn/status').catch(() => null),
      ]);
      setNet(n); setVpns(v.connections || []); setTs(t); setErr('');
    } catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  async function act(uuid, action) {
    setBusy(uuid + action); setNote(null); setErr('');
    try {
      const r = await api(`/vpn/connections/${encodeURIComponent(uuid)}/${action}`, { method: 'POST', body: '{}' });
      if (r.ok) await load();
      else setNote({ message: r.message, command: r.command });
    } catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  }
  async function remove(c) {
    if (!window.confirm(`Delete VPN "${c.name}"?`)) return;
    setBusy(c.uuid + 'del'); setErr('');
    try { const r = await api(`/vpn/connections/${encodeURIComponent(c.uuid)}`, { method: 'DELETE' }); if (r.ok) await load(); else setNote({ message: 'Could not delete automatically:', command: r.command }); }
    catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  }

  const nmAvailable = net ? net.nmAvailable !== false : true;

  return (
    <div className="page-pad network-page">
      {showRA && <RemoteAccess onClose={() => { setShowRA(false); load(); }} />}
      <PageTitle kicker="NETWORK" title="Network & VPN" body="Your connection, and any VPN — WireGuard, OpenVPN, or Tailscale." />
      {err && <div className="inline-error">{err}</div>}

      <div className="nw-overview">
        <div className="nw-ov-head"><Wifi /> <strong>This machine</strong></div>
        <div className="nw-ov-grid">
          {(net?.interfaces || []).map((i) => <div key={i.name + i.ip} className="nw-ov-item"><small>{i.name}</small><strong>{i.ip}</strong></div>)}
          {net?.defaultRoute && <div className="nw-ov-item"><small>gateway</small><strong>{net.defaultRoute.gateway}</strong></div>}
          {!net?.interfaces?.length && <div className="nw-ov-item"><small>no active IPv4</small></div>}
        </div>
      </div>

      {/* Tailscale — the mesh VPN */}
      <section className="nw-card">
        <div className="nw-card-head"><ShieldCheck /><div><strong>Tailscale</strong><small>{ts?.connected ? `Connected${ts.hostname ? ` · ${ts.hostname}` : ''}` : ts?.installed ? 'Installed · not connected' : 'Not set up'}</small></div>
          {ts?.connected && <span className={'nw-badge' + (ts.httpsServed ? ' on' : '')}>{ts.httpsServed ? <><Lock /> HTTPS</> : 'Connected'}</span>}
        </div>
        <div className="nw-card-actions"><Button className="primary" onClick={() => setShowRA(true)}>{ts?.connected ? 'Manage' : 'Set up Tailscale'}</Button></div>
      </section>

      {/* NetworkManager VPNs */}
      <div className="section-head"><h2>VPN connections</h2>{nmAvailable && <button className="link-btn" onClick={() => setAdding(true)}><Plus /> Add a VPN</button>}</div>
      {!nmAvailable && <div className="empty-state">{net?.message || 'NetworkManager (nmcli) isn’t installed, so WireGuard/OpenVPN management isn’t available here. Tailscale above still works.'}</div>}
      {nmAvailable && vpns && vpns.length === 0 && <div className="empty-state">No WireGuard or OpenVPN connections yet. Tap “Add a VPN” to import one.</div>}
      {nmAvailable && (vpns || []).map((c) => (
        <div key={c.uuid} className={'nw-vpn' + (c.active ? ' active' : '')}>
          <div className="nw-vpn-main">
            <span className={'nw-dot' + (c.active ? ' on' : '')} />
            <div><strong>{c.name}</strong><small>{KIND_LABEL[c.kind] || c.kind}{c.active ? ' · connected' : ''}</small></div>
          </div>
          <div className="nw-vpn-actions">
            <Button className={c.active ? '' : 'primary'} disabled={!!busy} onClick={() => act(c.uuid, c.active ? 'down' : 'up')}>
              {busy === c.uuid + (c.active ? 'down' : 'up') ? <Loader className="spin" /> : (c.active ? 'Disconnect' : 'Connect')}
            </Button>
            <button className="nw-del" title="Delete" disabled={!!busy} onClick={() => remove(c)}><Trash2 /></button>
          </div>
        </div>
      ))}
      {note && <div className="nw-note"><p>{note.message}</p><CmdBox text={note.command} /><Button onClick={() => { setNote(null); load(); }}>Done</Button></div>}

      {adding && <AddVpn onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} onNote={setNote} />}
    </div>
  );
}

function AddVpn({ onClose, onDone, onNote }) {
  const [kind, setKind] = useState('wireguard');
  const [name, setName] = useState('');
  const [config, setConfig] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function onFile(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    if (/\.ovpn$/i.test(f.name)) setKind('openvpn');
    else if (/\.conf$/i.test(f.name)) setKind('wireguard');
    if (!name) setName(f.name.replace(/\.(conf|ovpn|txt)$/i, ''));
    try { setConfig(await f.text()); } catch { setErr('Could not read that file.'); }
  }
  async function submit() {
    setBusy(true); setErr('');
    try {
      const r = await api('/vpn/connections/import', { method: 'POST', body: JSON.stringify({ kind, name, config }) });
      if (r.ok) onDone();
      else if (r.needsPlugin) { onNote({ message: r.message, command: r.command }); onClose(); }
      else if (r.needsTerminal) { onNote({ message: r.message, command: r.command }); onClose(); }
      else setErr(r.error || 'Import failed.');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="fp-overlay" onClick={onClose}>
      <div className="fp-card nw-add" onClick={(e) => e.stopPropagation()}>
        <div className="fp-head"><strong>Add a VPN</strong><button className="ms-x" onClick={onClose}><X /></button></div>
        <div className="nw-add-body">
          <div className="theme-picker nw-kind">
            {[['wireguard', 'WireGuard'], ['openvpn', 'OpenVPN']].map(([id, label]) => (
              <button key={id} className={'theme-opt' + (kind === id ? ' active' : '')} onClick={() => setKind(id)}><i />{label}</button>
            ))}
          </div>
          <input className="nw-input" placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="nw-file"><input type="file" accept=".conf,.ovpn,.txt" hidden onChange={onFile} /><Plus /> Choose a {kind === 'wireguard' ? '.conf' : '.ovpn'} file</label>
          <textarea className="nw-config" placeholder={`… or paste the ${kind === 'wireguard' ? 'WireGuard (.conf)' : 'OpenVPN (.ovpn)'} config here`} value={config} onChange={(e) => setConfig(e.target.value)} rows={7} />
          {err && <div className="inline-error">{err}</div>}
        </div>
        <div className="fp-actions"><Button className="primary" disabled={busy || !config.trim()} onClick={submit}>{busy ? 'Importing…' : 'Import & save'}</Button><Button onClick={onClose}>Cancel</Button></div>
      </div>
    </div>
  );
}
