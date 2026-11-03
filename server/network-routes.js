// server/network-routes.js
// Network & VPN control center. Manages "any VPN" uniformly through
// NetworkManager (nmcli) — WireGuard and OpenVPN connections: list, connect,
// disconnect, import (.conf / .ovpn), delete — plus a network overview. The
// mesh VPN (Tailscale) stays in index.js's /api/vpn/* and is shown alongside
// these by the client. Mount with: mountNetworkRoutes(app, { auth, env, stateDir }).

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const sh = promisify(exec);

export function mountNetworkRoutes(app, { auth, env, stateDir }) {
  // Synchronous best-effort command → trimmed stdout ('' on failure).
  const run = (cmd) => {
    try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: '/bin/bash', env }).trim(); }
    catch { return ''; }
  };
  const have = (bin) => !!run(`command -v ${bin}`);
  const nmAvailable = () => have('nmcli');

  // nmcli -t terse output escapes ':' inside fields as '\:'. Split on
  // unescaped colons, then unescape.
  const splitTerse = (line) => {
    const out = []; let cur = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '\\' && i + 1 < line.length) { cur += line[i + 1]; i++; }
      else if (c === ':') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  };

  // Run an nmcli action that may need root/polkit, non-interactively. Returns
  // { ok } or { needsTerminal, command } so the UI can show the manual command.
  const nmAction = async (args, friendly) => {
    const cmd = `nmcli ${args}`;
    try {
      await sh(`sudo -n ${cmd} 2>&1 || ${cmd} 2>&1`, { timeout: 30000, env });
      return { ok: true };
    } catch (e) {
      const out = ((e.stdout || '') + (e.stderr || e.message || '')).trim();
      return { ok: false, error: out, needsTerminal: true, command: `sudo ${cmd}`, detail: out.slice(-400) };
    }
  };

  // Map an nmcli connection to a friendly VPN kind label.
  const vpnKind = (type, uuid) => {
    if (type === 'wireguard') return 'wireguard';
    if (type === 'vpn') {
      const st = run(`nmcli -t -f vpn.service-type connection show ${JSON.stringify(uuid)} 2>/dev/null`);
      const svc = (st.split(':')[1] || st).split('.').pop() || 'vpn'; // ...NetworkManager.openvpn -> openvpn
      return svc || 'vpn';
    }
    return type;
  };

  app.get('/api/network', auth, (req, res) => {
    if (!nmAvailable()) return res.json({ nmAvailable: false, interfaces: ifaceList(), message: 'NetworkManager (nmcli) is not installed, so VPN management is unavailable.' });
    const active = run('nmcli -t -f NAME,TYPE,DEVICE,STATE connection show --active')
      .split('\n').filter(Boolean).map((l) => { const f = splitTerse(l); return { name: f[0], type: f[1], device: f[2], state: f[3] }; });
    let defaultRoute = null;
    const dr = run('ip -4 route show default 2>/dev/null').split('\n')[0];
    const m = dr.match(/default via (\S+) dev (\S+)/);
    if (m) defaultRoute = { gateway: m[1], device: m[2] };
    res.json({ nmAvailable: true, interfaces: ifaceList(), connections: active, defaultRoute });
  });

  app.get('/api/vpn/connections', auth, (req, res) => {
    if (!nmAvailable()) return res.json({ nmAvailable: false, connections: [] });
    const activeUuids = new Set(
      run('nmcli -t -f UUID connection show --active').split('\n').map((s) => s.trim()).filter(Boolean)
    );
    const connections = run('nmcli -t -f NAME,UUID,TYPE connection show')
      .split('\n').filter(Boolean)
      .map((l) => { const f = splitTerse(l); return { name: f[0], uuid: f[1], type: f[2] }; })
      .filter((c) => c.type === 'vpn' || c.type === 'wireguard')
      .map((c) => ({ ...c, kind: vpnKind(c.type, c.uuid), active: activeUuids.has(c.uuid) }));
    res.json({ nmAvailable: true, connections });
  });

  app.post('/api/vpn/connections/:uuid/:action', auth, async (req, res) => {
    const action = req.params.action === 'down' ? 'down' : 'up';
    if (!nmAvailable()) return res.status(400).json({ error: 'NetworkManager is not available.' });
    const r = await nmAction(`connection ${action} uuid ${JSON.stringify(req.params.uuid)}`);
    if (r.ok) return res.json({ ok: true });
    res.json({ ok: false, needsTerminal: true, command: r.command, message: `Couldn't ${action === 'up' ? 'connect' : 'disconnect'} automatically — run this in Terminal (it needs administrator access):`, detail: r.detail });
  });

  app.delete('/api/vpn/connections/:uuid', auth, async (req, res) => {
    if (!nmAvailable()) return res.status(400).json({ error: 'NetworkManager is not available.' });
    const r = await nmAction(`connection delete uuid ${JSON.stringify(req.params.uuid)}`);
    if (r.ok) return res.json({ ok: true });
    res.json({ ok: false, needsTerminal: true, command: r.command, detail: r.detail });
  });

  // Import a VPN from a pasted (or uploaded) config. Secrets never leave the
  // server: the config is written 0600 to a temp file, imported, then deleted.
  app.post('/api/vpn/connections/import', auth, async (req, res) => {
    if (!nmAvailable()) return res.status(400).json({ error: 'NetworkManager (nmcli) is not installed.' });
    const kind = req.body?.kind === 'openvpn' ? 'openvpn' : 'wireguard';
    const config = String(req.body?.config || '');
    const name = String(req.body?.name || '').replace(/[^A-Za-z0-9 _.-]/g, '').slice(0, 60);
    if (!config.trim()) return res.status(400).json({ error: 'Paste or upload a VPN config first.' });
    // OpenVPN needs its NetworkManager plugin; WireGuard is built in.
    if (kind === 'openvpn' && !fs.existsSync('/usr/lib/NetworkManager/VPN/nm-openvpn-service.name') && !run('command -v openvpn')) {
      return res.json({ needsPlugin: true, command: 'sudo pacman -S networkmanager-openvpn', message: 'OpenVPN support needs the NetworkManager OpenVPN plugin. Install it, then import again.' });
    }
    fs.mkdirSync(stateDir, { recursive: true });
    const tmp = path.join(stateDir, `vpn-import-${crypto.randomBytes(6).toString('hex')}.${kind === 'wireguard' ? 'conf' : 'ovpn'}`);
    try {
      fs.writeFileSync(tmp, config, { mode: 0o600 });
      const cmd = `nmcli connection import type ${kind} file ${JSON.stringify(tmp)}`;
      let out = '';
      try { const r = await sh(`sudo -n ${cmd} 2>&1 || ${cmd} 2>&1`, { timeout: 30000, env }); out = (r.stdout || '') + (r.stderr || ''); }
      catch (e) { out = (e.stdout || '') + (e.stderr || e.message || ''); }
      // Did it import? nmcli prints: Connection '<id>' (<uuid>) successfully added.
      const mm = out.match(/\(([0-9a-fA-F-]{36})\)\s+successfully added/);
      if (!mm) {
        if (/plugin|openvpn|unknown connection type|not installed/i.test(out))
          return res.json({ needsPlugin: true, command: 'sudo pacman -S networkmanager-openvpn', message: 'OpenVPN support needs the NetworkManager OpenVPN plugin. Install it, then import again.', detail: out.slice(-400) });
        return res.json({ ok: false, needsTerminal: true, command: `sudo ${cmd}`, message: 'Could not import automatically — run this in Terminal:', detail: out.slice(-400) });
      }
      const uuid = mm[1];
      if (name) await nmAction(`connection modify uuid ${JSON.stringify(uuid)} connection.id ${JSON.stringify(name)}`);
      res.json({ ok: true, uuid });
    } catch (e) {
      res.status(500).json({ error: e.message });
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }
  });

  function ifaceList() {
    return Object.entries(os.networkInterfaces())
      .flatMap(([name, addrs]) => (addrs || []).filter((a) => a.family === 'IPv4' && !a.internal).map((a) => ({ name, ip: a.address })));
  }
}
