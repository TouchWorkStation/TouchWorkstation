# TouchWorkstation

A touch-first React mobile interface + local Ubuntu agent for controlling a
Linux workstation from your phone: projects, GitHub, dev-server previews,
apps, files, terminal, and remote access.

## Structure

- `server/` — Node/Express backend (`index.js` is the entry point). Handles
  auth, the terminal (PTY over tmux + websocket), projects, GitHub, the app
  registry, agents (including the kanban board + chat), and Docker.
- `ui/` — React frontend, built with Vite.
  - `ui/src/main.jsx` — app shell, routing, Dashboard, Settings, Projects,
    Agents list.
  - `ui/src/TerminalPTY.jsx` — the terminal view.
  - `ui/src/AgentDetail.jsx` — per-agent chat + kanban board.
  - `ui/src/AppsV2.jsx`, `ui/src/HomeTiles.jsx` — the app launcher and
    configurable home-screen tiles.
  - `ui/src/RemoteAccess.jsx` — Tailscale setup wizard.

## Running locally

```bash
npm install
npm run build   # builds ui/ into dist/
node server/index.js
```

Environment variables:
- `PORT` — HTTP port (default 8787)
- `APP_PASSWORD` — login password (default `changeme` — set this)
- `JWT_SECRET` — session signing secret (default is a placeholder — set this)
- `TW_HOME` — home directory used for project scanning etc. (default: OS home dir)
- `HTTPS_PORT`, `TW_TLS_DIR` — optional HTTPS listener (see server/index.js)

## Notes

- Terminal sessions run inside `tmux` (`tw-<sessionId>`) for persistence
  across reconnects. The terminal view renders tmux's own captured pane
  content as plain (ANSI-colorized) text rather than a full character-grid
  emulator — see the comment at the top of `ui/src/TerminalPTY.jsx` for why.
- `postinst`/packaging scripts (for building a `.deb`) aren't included here —
  this is just the application source.
