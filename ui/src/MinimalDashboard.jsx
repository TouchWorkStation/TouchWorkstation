// ui/src/MinimalDashboard.jsx
// Alternate home screen for the Omarchy UI variant — on by default when
// built with VITE_THEME=minimal (the Arch/Omarchy package sets this — see
// packaging/arch/PKGBUILD), or when the user flips Settings > Appearance >
// Interface to "Omarchy" at runtime. Every other build/setting keeps
// rendering the standard Dashboard from main.jsx untouched.
//
// Deliberately minimal in scope, not just style: no hero header, no
// launcher tiles, no dashboard cards — a stats strip and a plain list of
// destinations over a full-screen wallpaper. Chris can drop his own image
// in as ui/public/wallpaper.jpg (falls back to the generated
// wallpaper-default.jpg shipped here) without touching any code.

import { useEffect, useState } from 'react';
import { Cpu, MemoryStick, HardDrive, Upload, Download, TerminalSquare, Code2, Folder, GitBranch, Box, Sparkles } from 'lucide-react';
import { api, usePoll } from './main.jsx';

const NAV = [
  { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
  { id: 'projects', label: 'Projects', icon: Code2 },
  { id: 'files', label: 'Files', icon: Folder },
  { id: 'projects', label: 'GitHub', icon: GitBranch },
  { id: 'docker', label: 'Containers', icon: Box },
  { id: 'agents', label: 'Agents', icon: Sparkles },
];

function fmtRate(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec < 1024) return `${(bytesPerSec || 0).toFixed(0)} B/s`;
  const mb = bytesPerSec / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB/s`;
  return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
}

export default function MinimalDashboard({ go }) {
  const [status] = usePoll(() => api('/status'), 3000, []);
  const [bgOk, setBgOk] = useState(true);

  return (
    <div className="minimal-home">
      {bgOk && (
        <img
          className="minimal-home-bg"
          src="/wallpaper.jpg"
          onError={(e) => {
            if (e.currentTarget.src.endsWith('/wallpaper.jpg')) e.currentTarget.src = '/wallpaper-default.jpg';
            else setBgOk(false);
          }}
          alt=""
        />
      )}
      <div className="minimal-home-scrim" />

      <div className="minimal-stats">
        <div className="minimal-stat">
          <Cpu /><span className="minimal-stat-label">CPU</span>
          <strong>{status ? `${status.cpu}%` : '—'}</strong>
        </div>
        <div className="minimal-stat">
          <MemoryStick /><span className="minimal-stat-label">RAM</span>
          <strong>{status ? `${status.memory}%` : '—'}</strong>
          {status?.specs && <small>{status.specs.memUsedGB} / {status.specs.memTotalGB} GB</small>}
        </div>
        <div className="minimal-stat">
          <HardDrive /><span className="minimal-stat-label">DISK</span>
          <strong>{status ? `${status.disk}%` : '—'}</strong>
          {status?.specs && <small>{status.specs.diskUsedGB} / {status.specs.diskTotalGB} GB</small>}
        </div>
        <div className="minimal-stat">
          <span className="minimal-stat-label">NET</span>
          <small><Upload /> {fmtRate(status?.net?.txBps)}</small>
          <small><Download /> {fmtRate(status?.net?.rxBps)}</small>
        </div>
      </div>

      <nav className="minimal-nav">
        {NAV.map((item, i) => {
          const Icon = item.icon;
          return (
            <button key={item.label + i} className="minimal-nav-item" onClick={() => go(item.id)}>
              <Icon />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
