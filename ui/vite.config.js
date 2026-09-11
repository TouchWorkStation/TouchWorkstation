import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

// Stamp the exact git commit into the built JS so the running app can show
// what version it is at a glance. Compare it against /api/me's `build` at
// runtime — if they differ, the browser is on a stale bundle and needs a
// hard refresh. Prefer a build-info.json written by the packaging step
// (works in a tarball with no .git dir); fall back to `git rev-parse` for
// dev builds; fall back to 'unknown' if neither works — never fail the
// build over this.
function resolveBuildSha() {
  try {
    const info = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'build-info.json'), 'utf8'));
    if (info?.sha) return String(info.sha).slice(0, 12);
  } catch {}
  try {
    return execSync('git rev-parse --short=12 HEAD', { cwd: process.cwd() }).toString().trim();
  } catch {}
  return 'unknown';
}
const BUILD_SHA = resolveBuildSha();
const BUILD_THEME = process.env.VITE_THEME === 'minimal' ? 'omarchy' : 'standard';

export default defineConfig({
  root: path.resolve(process.cwd(), 'ui'),
  plugins: [react()],
  define: {
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
    __BUILD_THEME__: JSON.stringify(BUILD_THEME),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    outDir: path.resolve(process.cwd(), 'dist'),
    emptyOutDir: true
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/ws': { target: 'ws://127.0.0.1:8787', ws: true },
      // Served by the backend (STATE_DIR, not a static ui/public asset —
      // see server/index.js) so it survives rebuilds and can be replaced by
      // an upload at any time. Without this, vite's dev server has no idea
      // the path exists and falls back to serving index.html for it, the
      // way it does for any other unmatched SPA route.
      '/wallpaper.jpg': 'http://127.0.0.1:8787'
    }
  }
});
