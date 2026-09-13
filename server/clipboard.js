// server/clipboard.js
// Universal clipboard history — file-backed in STATE_DIR, same pattern as
// agent-board.js. Entries arrive from either side: something copied in the
// terminal (native browser copy event, captured client-side) or something
// copied via one of the app's own Copy buttons (Remote Access URL, etc).
// The point is Omarchy's "one clipboard, consistent everywhere, with
// history" — translated to a phone, where the OS clipboard has no history
// of its own and nothing crosses between the terminal and the rest of the
// app without this.

import fs from 'fs';
import path from 'path';

let CLIPS_FILE = null;

// Unbounded growth turns this into a slow-leak liability for a feature
// that's meant to be a quick recent-items list, not an archive.
const MAX_CLIPS = 50;

export function initClipboard({ stateDir }) {
  CLIPS_FILE = path.join(stateDir, 'clipboard.json');
}

function readClips() {
  try { return JSON.parse(fs.readFileSync(CLIPS_FILE, 'utf8')); } catch { return []; }
}
function writeClips(list) {
  fs.mkdirSync(path.dirname(CLIPS_FILE), { recursive: true });
  fs.writeFileSync(CLIPS_FILE, JSON.stringify(list, null, 2));
}

export function listClips() {
  return readClips();
}

export function addClip({ text, source }) {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('text is required');
  const list = readClips();
  // A repeat copy of the same text (very common — re-copying the same
  // token, re-tapping the same Copy button) should jump back to the top,
  // not pile up as a duplicate entry.
  const deduped = list.filter((c) => c.text !== clean);
  const clip = {
    id: `clip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    text: clean.slice(0, 4000),
    source: String(source || 'app').slice(0, 40),
    at: new Date().toISOString(),
  };
  deduped.unshift(clip);
  writeClips(deduped.slice(0, MAX_CLIPS));
  return clip;
}

export function deleteClip(id) {
  const list = readClips();
  writeClips(list.filter((c) => c.id !== id));
  return { ok: true };
}

export function clearClips() {
  writeClips([]);
  return { ok: true };
}
