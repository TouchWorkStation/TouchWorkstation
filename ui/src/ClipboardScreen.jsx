// ui/src/ClipboardScreen.jsx
// Universal clipboard history — Omarchy has one clipboard with a searchable
// history, consistent everywhere; a phone's native clipboard has neither
// (it's single-slot and never crosses between the terminal and the rest of
// this app on its own). Entries land here either from a native copy inside
// the terminal (see the oncopy handlers in TerminalPTY/MinimalTerminalPTY)
// or from any of the app's own Copy buttons (see copyText in main.jsx).
//
// "Tap to paste" here means writing the entry back onto the OS clipboard —
// the same Paste button already in the terminal then pastes it in, so this
// doesn't need its own separate injection path into every screen.

import { useEffect, useState } from 'react';
import { Copy, Check, Trash2, ClipboardList } from 'lucide-react';
import { api, Button, PageTitle, copyText, fmtWhen } from './main.jsx';

export function ClipboardScreen() {
  const [clips, setClips] = useState(null);
  const [err, setErr] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const load = () => api('/clipboard').then((r) => setClips(r.clips || [])).catch((e) => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  function paste(clip) {
    // Re-copying an already-logged entry would otherwise bump a duplicate
    // to the top and immediately re-log it — copyText's own POST already
    // handles the dedupe/reorder server-side, so this is just the plain
    // clipboard write plus the same UI feedback as every other Copy button.
    navigator.clipboard?.writeText(clip.text);
    api('/clipboard', { method: 'POST', body: JSON.stringify({ text: clip.text, source: clip.source }) }).then(load).catch(() => {});
    setCopiedId(clip.id);
    setTimeout(() => setCopiedId(''), 1500);
  }

  async function remove(id) {
    try { await api(`/clipboard/${id}`, { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); }
  }

  async function clearAll() {
    try { await api('/clipboard', { method: 'DELETE' }); load(); } catch (e) { setErr(e.message); }
  }

  return (
    <div className="page-pad">
      <PageTitle
        kicker="CLIPBOARD"
        title="Clipboard"
        body="Everything copied here or in the terminal, in one place. Tap an entry to copy it again."
        actions={clips?.length ? <Button onClick={clearAll}><Trash2/> Clear all</Button> : null}
      />
      {err && <div className="inline-error">{err}</div>}
      {!clips ? (
        <div className="empty-state">Loading…</div>
      ) : clips.length === 0 ? (
        <div className="empty-state"><ClipboardList/> Nothing copied yet. Copy something in the terminal or tap any Copy button in the app.</div>
      ) : (
        <div className="clipboard-list">
          {clips.map((c) => (
            <button className="clipboard-card" key={c.id} onClick={() => paste(c)}>
              <p>{c.text}</p>
              <div className="clipboard-card-foot">
                <small>{c.source} · {fmtWhen(c.at)}</small>
                <span className="clipboard-card-actions">
                  <span className="cc-copy">{copiedId === c.id ? <Check/> : <Copy/>}</span>
                  <span className="cc-del" onClick={(e) => { e.stopPropagation(); remove(c.id); }}><Trash2/></span>
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
