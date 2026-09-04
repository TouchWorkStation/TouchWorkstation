// ui/src/DockerView.jsx
// Touch-first Docker container manager. Lists containers with status,
// start/stop/restart/remove buttons, and a logs viewer — so Docker is usable
// without touching a terminal.

import { useEffect, useState } from 'react';
import {
  Server, Play, Square, RotateCcw, Trash2, FileText, RefreshCcw, X, AlertTriangle, ArrowLeft,
} from 'lucide-react';
import { api, Button, Pill, PageTitle } from './main.jsx';

export function DockerView({ go }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [perm, setPerm] = useState('');
  const [busy, setBusy] = useState('');
  const [logsFor, setLogsFor] = useState(null);

  const load = async () => {
    try {
      const r = await api('/docker/containers');
      if (r.ok === false) {
        if (r.permission) setPerm(r.error);
        else setErr(r.error || 'Could not reach Docker.');
        setData({ containers: [] });
        return;
      }
      setErr(''); setPerm('');
      setData(r);
    } catch (e) { setErr(e.message); setData({ containers: [] }); }
  };

  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, []);

  async function act(c, action) {
    setBusy(c.id + action);
    try {
      const r = await api(`/docker/containers/${c.id}/${action}`, { method: 'POST', body: '{}' });
      if (r.ok === false) setErr(r.error || 'Action failed.');
      load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(''); }
  }

  const running = (c) => /up|running/i.test(c.state) || /^up/i.test(c.status);

  return (
    <div className="page-pad">
      <PageTitle kicker="CONTAINERS" title="Docker" body="Manage the containers on this machine — no terminal required." actions={<Button onClick={load}><RefreshCcw/> Refresh</Button>}/>

      {perm && <div className="docker-perm"><AlertTriangle/><div><strong>Docker needs permission</strong><p>{perm}</p><Button onClick={() => go('terminal', { pendingCommand: 'sudo usermod -aG docker $USER && echo "Done — log out and back in."' })}>Fix in Terminal</Button></div></div>}
      {err && !perm && <div className="inline-error">{err}</div>}

      {!data ? <div className="empty-state">Loading containers…</div> :
        data.containers.length === 0 && !perm ? <div className="empty-state">No containers yet. Pull or run an image to get started.</div> :
        <div className="docker-list">
          {data.containers.map((c) => (
            <div className={'docker-card' + (running(c) ? ' up' : '')} key={c.id}>
              <div className="dc-top">
                <span className="dc-icon"><Server/></span>
                <div className="dc-id"><strong>{c.name}</strong><small>{c.image}</small></div>
                <Pill tone={running(c) ? 'success' : ''}>{running(c) ? 'Running' : 'Stopped'}</Pill>
              </div>
              <div className="dc-status">{c.status}{c.ports ? ` · ${c.ports}` : ''}</div>
              <div className="dc-actions">
                {running(c)
                  ? <Button onClick={() => act(c, 'stop')} disabled={busy === c.id + 'stop'}><Square/> Stop</Button>
                  : <Button className="primary" onClick={() => act(c, 'start')} disabled={busy === c.id + 'start'}><Play/> Start</Button>}
                <Button onClick={() => act(c, 'restart')} disabled={busy === c.id + 'restart'}><RotateCcw/> Restart</Button>
                <Button onClick={() => setLogsFor(c)}><FileText/> Logs</Button>
                <button className="dc-del" onClick={() => { if (confirm(`Remove container ${c.name}?`)) act(c, 'remove'); }}><Trash2/></button>
              </div>
            </div>
          ))}
        </div>}

      {logsFor && <LogsModal container={logsFor} onClose={() => setLogsFor(null)}/>}
    </div>
  );
}

function LogsModal({ container, onClose }) {
  const [logs, setLogs] = useState('Loading…');
  const load = () => api(`/docker/containers/${container.id}/logs?tail=300`).then((r) => setLogs(r.logs || '(no output)')).catch((e) => setLogs('Error: ' + e.message));
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [container.id]);
  return (
    <div className="docker-logs-overlay" onClick={onClose}>
      <div className="docker-logs" onClick={(e) => e.stopPropagation()}>
        <div className="dl-head"><strong>{container.name} · logs</strong><button onClick={onClose}><X/></button></div>
        <pre>{logs}</pre>
      </div>
    </div>
  );
}
