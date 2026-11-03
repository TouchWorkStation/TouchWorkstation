// ui/src/Disks.jsx
// Storage view for a workstation with several drives: every physical disk and
// its partitions, with capacity and per-mount usage bars. Read-only — sourced
// from /api/disks (lsblk + df on the server).

import { useEffect, useState } from 'react';
import { HardDrive, RefreshCcw } from 'lucide-react';
import { api, PageTitle, Button, fmtBytes } from './main.jsx';

function usageColor(pct) {
  if (pct >= 90) return '#f7768e';
  if (pct >= 75) return '#e0af68';
  return '#7ee787';
}

// One partition/volume row with its mount + usage bar.
function Volume({ node }) {
  const u = node.usage;
  const pct = u ? u.usePct : null;
  return (
    <div className="disk-vol">
      <div className="disk-vol-head">
        <strong>{node.name}</strong>
        {node.fstype && <span className="disk-tag">{node.fstype}</span>}
        {node.label && <span className="disk-label">{node.label}</span>}
        <span className="disk-size">{fmtBytes(node.size)}</span>
      </div>
      {node.mountpoint
        ? <div className="disk-mount"><code>{node.mountpoint}</code></div>
        : <div className="disk-mount disk-unmounted">not mounted</div>}
      {u && (
        <>
          <div className="disk-bar"><i style={{ width: `${pct}%`, background: usageColor(pct) }} /></div>
          <div className="disk-usage">
            <span>{fmtBytes(u.used)} used</span>
            <span>{fmtBytes(u.avail)} free</span>
            <span>{pct}%</span>
          </div>
        </>
      )}
    </div>
  );
}

export function Disks() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try { setData(await api('/disks')); setErr(''); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);

  // Only physical disks (and loop devices with a mount) at the top level; each
  // renders its partitions/children as volumes.
  const disks = (data?.disks || []).filter(d => d.type === 'disk' || (d.children && d.children.length) || d.mountpoint);

  return (
    <div className="page-pad disks-page">
      <PageTitle kicker="STORAGE" title="Disks" body="Every drive in this workstation, with capacity and usage." actions={<Button onClick={load} disabled={busy}><RefreshCcw /> Refresh</Button>} />
      {err && <div className="inline-error">{err}</div>}
      {!data && !err && <div className="empty-state">Reading drives…</div>}
      {data && !disks.length && <div className="empty-state">No drives reported. (Is lsblk available?)</div>}
      <div className="disk-list">
        {disks.map(d => {
          const vols = d.children && d.children.length ? d.children : [d];
          return (
            <section className="disk-card" key={d.name}>
              <div className="disk-card-head">
                <HardDrive />
                <div>
                  <strong>{d.model ? d.model.trim() : d.name}{d.rm === true || d.rm === '1' ? ' · removable' : ''}</strong>
                  <small>/dev/{d.name} · {fmtBytes(d.size)}{d.vendor ? ` · ${d.vendor.trim()}` : ''}</small>
                </div>
              </div>
              <div className="disk-vols">
                {vols.map(v => <Volume key={v.name} node={v} />)}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
