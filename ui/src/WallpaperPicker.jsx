// ui/src/WallpaperPicker.jsx
// Upload + crop UI for the Omarchy home screen's background photo. Opened
// from Settings > Appearance > Wallpaper.
//
// The crop itself is client-side: pick a photo from the phone's own photo
// picker (a plain <input type=file accept=image/*>, no native permission
// prompt needed beyond what the OS file picker already handles), drag to
// reposition it inside a fixed-aspect frame, use the zoom slider to scale
// it, then Save renders exactly what's visible in the frame onto a
// full-resolution canvas and uploads that as a JPEG. The server only ever
// receives an already-cropped, already-sized image — see server/index.js's
// comment on /api/wallpaper for why that's deliberate (no multipart/multer
// dependency needed for what's fundamentally a small fixed-format upload).
//
// Single-finger drag to pan + a slider to zoom, not pinch-to-zoom gestures —
// a slider is simple to build correctly and just as usable with a thumb on
// a phone, without needing two-finger touch-distance tracking.

import { useRef, useState } from 'react';
import { X, Image as ImageIcon, ZoomIn } from 'lucide-react';
import { api, Button } from './main.jsx';

// Frame is the on-screen preview size (CSS px); OUT is the actual saved
// resolution. Portrait, roughly a phone's aspect ratio — the app's own
// background rendering (.minimal-home-bg{object-fit:cover}) will still
// sensibly fill any real device's exact viewport regardless of this
// tool's precise aspect, so this doesn't need to match every phone exactly.
const FRAME_W = 240, FRAME_H = 420;
const OUT_W = 1080, OUT_H = 1890;

export function WallpaperPicker({ onClose, onSaved }) {
  const [imgUrl, setImgUrl] = useState(null);
  const [imgEl, setImgEl] = useState(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [err, setErr] = useState('');
  const dragRef = useRef(null);
  const fileInputRef = useRef(null);

  function pickFile(e) {
    const f = e.target.files?.[0];
    e.target.value = ''; // so picking the same file again still fires onChange
    if (!f) return;
    setErr('');
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { setImgEl(img); setImgUrl(url); setScale(1); setPos({ x: 0, y: 0 }); };
    img.onerror = () => setErr('Could not read that image.');
    img.src = url;
  }

  function onPointerDown(e) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    setPos({ x: dragRef.current.origX + (e.clientX - dragRef.current.startX), y: dragRef.current.origY + (e.clientY - dragRef.current.startY) });
  }
  function onPointerUp() { dragRef.current = null; }

  async function save() {
    if (!imgEl) return;
    setSaving(true); setErr('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUT_W; canvas.height = OUT_H;
      const ctx = canvas.getContext('2d');
      const rx = OUT_W / FRAME_W, ry = OUT_H / FRAME_H;
      // Same "cover" math the CSS preview uses (object-fit:cover), then the
      // user's own extra pan/zoom on top, then scaled from the on-screen
      // frame size up to the real output resolution.
      const coverScale = Math.max(FRAME_W / imgEl.naturalWidth, FRAME_H / imgEl.naturalHeight);
      const drawW = imgEl.naturalWidth * coverScale * scale;
      const drawH = imgEl.naturalHeight * coverScale * scale;
      const dx = (FRAME_W / 2 + pos.x - drawW / 2) * rx;
      const dy = (FRAME_H / 2 + pos.y - drawH / 2) * ry;
      ctx.drawImage(imgEl, dx, dy, drawW * rx, drawH * ry);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      await api('/wallpaper', { method: 'POST', body: JSON.stringify({ image: dataUrl }) });
      onSaved?.();
      onClose();
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  async function removeWallpaper() {
    setRemoving(true); setErr('');
    try { await api('/wallpaper', { method: 'DELETE' }); onSaved?.(); onClose(); }
    catch (e) { setErr(e.message); }
    finally { setRemoving(false); }
  }

  return (
    <div className="wp-backdrop" onClick={onClose}>
      <div className="wp-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="wp-head"><strong>Wallpaper</strong><button className="wp-x" onClick={onClose} aria-label="Close"><X /></button></div>

        {!imgUrl && (
          <div className="wp-empty">
            <ImageIcon />
            <p>Choose a photo from your phone. You'll be able to drag and zoom it to fit before saving.</p>
            <Button className="primary" onClick={() => fileInputRef.current?.click()}>Choose photo</Button>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={pickFile} />
            <button className="wp-remove-link" onClick={removeWallpaper} disabled={removing}>{removing ? 'Removing…' : 'Remove custom wallpaper'}</button>
          </div>
        )}

        {imgUrl && (
          <>
            <div className="wp-frame" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
              <img src={imgUrl} draggable={false} alt="" className="wp-img" style={{ transform: `translate(-50%,-50%) translate(${pos.x}px,${pos.y}px) scale(${scale})` }} />
            </div>
            <label className="wp-zoom"><ZoomIn /><input type="range" min="1" max="3" step="0.01" value={scale} onChange={(e) => setScale(Number(e.target.value))} /></label>
            {err && <div className="inline-error">{err}</div>}
            <div className="wp-actions">
              <Button onClick={() => { setImgUrl(null); setImgEl(null); }}>Different photo</Button>
              <Button className="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save wallpaper'}</Button>
            </div>
          </>
        )}
        {!imgUrl && err && <div className="inline-error">{err}</div>}
      </div>
    </div>
  );
}
