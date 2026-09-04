// server/docker.js
// Mobile-friendly Docker control. Wraps the docker CLI with JSON output so
// the UI can render buttons instead of making the user type commands.
//
// Permissions: the app runs as the workstation user. If that user isn't in
// the `docker` group, docker needs sudo. We try direct first and report a
// clear "permission" error the UI can act on, rather than failing silently.

import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileP = promisify(execFile);

let dockerAvailable = null;

async function runDocker(args, { timeout = 15000 } = {}) {
  // Try direct docker first; if it fails on permissions, surface that clearly.
  try {
    const { stdout } = await execFileP('docker', args, { timeout, maxBuffer: 5_000_000 });
    return { ok: true, stdout };
  } catch (e) {
    const msg = String(e.stderr || e.message || '');
    if (/permission denied|cannot connect to the docker daemon/i.test(msg)) {
      return { ok: false, permission: true, error: 'TouchWorkstation can\u2019t reach Docker. Add your user to the docker group (sudo usermod -aG docker $USER) and re-log, or run Docker commands from the Terminal.' };
    }
    if (/executable file not found|not found/i.test(msg)) {
      return { ok: false, notInstalled: true, error: 'Docker is not installed.' };
    }
    return { ok: false, error: msg.slice(0, 500) || 'Docker command failed.' };
  }
}

export async function dockerInstalled() {
  if (dockerAvailable !== null) return dockerAvailable;
  try { await execFileP('docker', ['--version'], { timeout: 5000 }); dockerAvailable = true; }
  catch { dockerAvailable = false; }
  return dockerAvailable;
}

// List all containers (running + stopped) as structured rows.
export async function listContainers() {
  const fmt = '{"id":"{{.ID}}","name":"{{.Names}}","image":"{{.Image}}","state":"{{.State}}","status":"{{.Status}}","ports":"{{.Ports}}"}';
  const r = await runDocker(['ps', '-a', '--format', fmt]);
  if (!r.ok) return r;
  const containers = r.stdout.split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
  return { ok: true, containers };
}

export async function listImages() {
  const fmt = '{"id":"{{.ID}}","repo":"{{.Repository}}","tag":"{{.Tag}}","size":"{{.Size}}"}';
  const r = await runDocker(['images', '--format', fmt]);
  if (!r.ok) return r;
  const images = r.stdout.split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
  return { ok: true, images };
}

// Validate a container id/name to avoid passing arbitrary shell content.
function safeId(id) {
  const s = String(id || '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(s)) throw new Error('Invalid container id');
  return s;
}

export async function containerAction(id, action) {
  const cid = safeId(id);
  const allowed = { start: 'start', stop: 'stop', restart: 'restart', remove: 'rm' };
  const verb = allowed[action];
  if (!verb) throw new Error('Unknown action');
  const args = verb === 'rm' ? ['rm', '-f', cid] : [verb, cid];
  const r = await runDocker(args, { timeout: 30000 });
  return r;
}

export async function containerLogs(id, tail = 200) {
  const cid = safeId(id);
  const n = Math.min(2000, Math.max(1, parseInt(tail, 10) || 200));
  const r = await runDocker(['logs', '--tail', String(n), cid], { timeout: 15000 });
  if (!r.ok) return r;
  return { ok: true, logs: r.stdout };
}
