// server/docker-routes.js
// Mount with: mountDockerRoutes(app, { auth });

import {
  dockerInstalled, listContainers, listImages, containerAction, containerLogs,
} from './docker.js';

export function mountDockerRoutes(app, { auth }) {
  app.get('/api/docker/status', auth, async (req, res) => {
    res.json({ installed: await dockerInstalled() });
  });

  app.get('/api/docker/containers', auth, async (req, res) => {
    const r = await listContainers();
    if (!r.ok) return res.status(r.notInstalled ? 400 : 200).json(r);
    res.json(r);
  });

  app.get('/api/docker/images', auth, async (req, res) => {
    const r = await listImages();
    if (!r.ok) return res.status(200).json(r);
    res.json(r);
  });

  app.post('/api/docker/containers/:id/:action', auth, async (req, res) => {
    try {
      const r = await containerAction(req.params.id, req.params.action);
      if (!r.ok) return res.status(400).json(r);
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  app.get('/api/docker/containers/:id/logs', auth, async (req, res) => {
    const r = await containerLogs(req.params.id, req.query.tail);
    if (!r.ok) return res.status(400).json(r);
    res.json(r);
  });
}
