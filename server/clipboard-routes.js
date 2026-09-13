// server/clipboard-routes.js
// Mount with: mountClipboardRoutes(app, { auth, stateDir });

import { initClipboard, listClips, addClip, deleteClip, clearClips } from './clipboard.js';

export function mountClipboardRoutes(app, { auth, stateDir }) {
  initClipboard({ stateDir });

  app.get('/api/clipboard', auth, (req, res) => {
    res.json({ clips: listClips() });
  });

  app.post('/api/clipboard', auth, (req, res) => {
    try { res.json({ clip: addClip(req.body || {}) }); }
    catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.delete('/api/clipboard/:id', auth, (req, res) => {
    res.json(deleteClip(req.params.id));
  });

  app.delete('/api/clipboard', auth, (req, res) => {
    res.json(clearClips());
  });
}
