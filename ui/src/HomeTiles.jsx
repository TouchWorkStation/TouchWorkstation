// ui/src/HomeTiles.jsx
// Configurable home-screen launcher tiles (Settings > Home screen) plus the
// shared catalog/default list the Dashboard renders from.
//
// A tile is either:
//   - a "core" destination (Projects, Agents, Apps) — primary nav
//     targets that aren't part of the /apps registry, or
//   - an entry straight from the /apps registry (the same one the Apps page
//     uses), so anything there is also pinnable to the home screen without a
//     second definition anywhere.
//
// Tile order/membership is stored server-side as settings.homeTiles (an
// ordered array of ids). Resolving ids against the live catalog happens at
// render time and silently drops anything that no longer exists — a
// removed app, or a stale id from an older config — rather than crashing
// the home screen. (Dashboard used to hardcode its shortcuts specifically
// to avoid an earlier crash from a dynamic-but-unvalidated tile list; this
// keeps that same safety property while making the list editable.)

import { useEffect, useRef, useState } from 'react';
import { GripVertical, X, Plus } from 'lucide-react';
import { api } from './main.jsx';
import { TileIcon } from './AppsV2.jsx';

export const CORE_TILES = [
  { id: 'projects', name: 'Projects', iconKey: 'Code2', color: '--accent', core: true, description: 'Your work' },
  { id: 'agents', name: 'Agents', iconKey: 'Bot', color: '--purple', core: true, description: 'AI assistants' },
  { id: 'apps', name: 'Apps', iconKey: 'Grid3X3', color: '--blue', core: true, description: 'Full app launcher' },
];

export const DEFAULT_HOME_TILES = ['projects', 'agents', 'terminal', 'files'];

export function buildTileCatalog(apps) {
  const catalog = [...CORE_TILES];
  const seen = new Set(catalog.map((t) => t.id));
  for (const a of apps || []) {
    if (seen.has(a.id)) continue; // core wins on any id collision
    catalog.push(a);
    seen.add(a.id);
  }
  return catalog;
}

// ids -> resolved catalog entries, in order, dropping anything unknown.
export function resolveHomeTiles(ids, catalog) {
  const byId = new Map(catalog.map((t) => [t.id, t]));
  const list = ids && ids.length ? ids : DEFAULT_HOME_TILES;
  return list.map((id) => byId.get(id)).filter(Boolean);
}

export function HomeTileSettings({ settings, setSettings }) {
  const [apps, setApps] = useState([]);
  const [dragId, setDragId] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const rowRefs = useRef({});
  const dragState = useRef(null);

  useEffect(() => { api('/apps').then((x) => setApps(x.apps || [])).catch(() => setApps([])); }, []);

  const catalog = buildTileCatalog(apps);
  const order = (settings?.homeTiles && settings.homeTiles.length ? settings.homeTiles : DEFAULT_HOME_TILES)
    .filter((id) => catalog.some((t) => t.id === id));
  const pinned = resolveHomeTiles(order, catalog);
  const available = catalog.filter((t) => !order.includes(t.id));

  function persist(nextOrder) {
    setSettings((s) => ({ ...s, homeTiles: nextOrder }));
    api('/settings', { method: 'POST', body: JSON.stringify({ homeTiles: nextOrder }) }).catch(() => {});
  }

  function addTile(id) { persist([...order, id]); }
  function removeTile(id) { persist(order.filter((x) => x !== id)); }

  function onHandlePointerDown(e, id) {
    const idx = order.indexOf(id);
    const rowEl = rowRefs.current[id];
    const rowHeight = rowEl?.offsetHeight || 56;
    dragState.current = { startY: e.clientY, rowHeight, index: idx, order: [...order] };
    setDragId(id);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onHandlePointerMove(e) {
    if (!dragId || !dragState.current) return;
    const st = dragState.current;
    const deltaY = e.clientY - st.startY;
    const steps = Math.round(deltaY / st.rowHeight);
    if (steps !== 0) {
      const from = st.index;
      const to = Math.min(st.order.length - 1, Math.max(0, from + steps));
      if (to !== from) {
        const next = [...st.order];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        st.order = next;
        st.index = to;
        st.startY = e.clientY;
        setSettings((s) => ({ ...s, homeTiles: next }));
      }
    } else {
      setDragOffset(deltaY);
      return;
    }
    setDragOffset(0);
  }
  function onHandlePointerUp() {
    if (dragState.current) persist(dragState.current.order);
    setDragId(null);
    setDragOffset(0);
    dragState.current = null;
  }

  return (
    <div className="home-tile-settings">
      <p className="home-tile-hint">Drag to reorder, tap ✕ to remove, or add a tile below. Changes apply immediately.</p>
      <div className="home-tile-list">
        {pinned.map((t) => (
          <div
            key={t.id}
            ref={(el) => { if (el) rowRefs.current[t.id] = el; }}
            className={`home-tile-row${dragId === t.id ? ' dragging' : ''}`}
            style={dragId === t.id ? { transform: `translateY(${dragOffset}px)` } : undefined}
          >
            <button
              className="home-tile-handle"
              onPointerDown={(e) => onHandlePointerDown(e, t.id)}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
              aria-label={`Reorder ${t.name}`}
            >
              <GripVertical />
            </button>
            <TileIcon app={t} />
            <div className="home-tile-row-copy"><strong>{t.name}</strong><small>{t.description || ''}</small></div>
            <button className="home-tile-remove" onClick={() => removeTile(t.id)} aria-label={`Remove ${t.name}`}><X /></button>
          </div>
        ))}
        {!pinned.length && <div className="empty-state">No tiles pinned — add one below.</div>}
      </div>
      {available.length > 0 && (
        <>
          <p className="home-tile-hint">Add a tile</p>
          <div className="home-tile-add-grid">
            {available.map((t) => (
              <button key={t.id} className="home-tile-add-chip" onClick={() => addTile(t.id)}>
                <TileIcon app={t} />
                <span>{t.name}</span>
                <Plus />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
