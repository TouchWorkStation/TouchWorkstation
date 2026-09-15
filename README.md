# TouchWorkstation

**Your Linux workstation, in your pocket.** TouchWorkstation turns any Linux
machine into a touch-first mobile workspace you drive from your phone — a real
terminal, your projects and Git, live dev-server previews, AI coding CLIs,
files, containers, and a tiling dashboard — over your home network or a private
VPN. It runs *on* your computer and mirrors it; it doesn't replace your desktop.

---

## Install

One line, on the workstation you want to control. It auto-detects your distro,
installs a prebuilt package, sets everything up, and starts the service:

```bash
curl -fsSL https://raw.githubusercontent.com/TouchWorkStation/TouchWorkstation/master/install.sh | sh
```

Supported: **Arch / Omarchy**, **Ubuntu / Debian**, **Fedora / RHEL**,
**openSUSE**. (On a fresh machine it refreshes your package databases first so
dependencies resolve.)

When it finishes it prints the address to open, the login password, and the
management commands. Then, from your phone's browser:

1. Open **`http://<your-hostname>.local:8088`** (or `http://<ip>:8088` — both
   are shown after install).
2. Log in with the first-run password **`touchwork`** — you'll be asked to set
   your own immediately.
3. Add it to your Home Screen for an app-like experience.

Away from home? Set up the built-in **Tailscale** VPN from Settings > *Access
away from home* — no port-forwarding, nothing exposed to the internet.

---

## Managing it (`touchworkstation`)

A single command on the workstation handles everything:

```bash
touchworkstation status     # service state + how to reach it (URL, IP, port)
touchworkstation url        # just the address
touchworkstation restart    # restart the app + proxy         (sudo)
touchworkstation logs [N]   # recent logs (default 100 lines)
touchworkstation follow     # live-tail the logs
touchworkstation credentials# show the URL + login password   (sudo)
touchworkstation update     # pull + reinstall the latest release
touchworkstation help       # all commands
```

### Updating

Any of these:
- **Settings > Updates** in the app, or
- `touchworkstation update` on the workstation, or
- re-run the one-line installer above.

---

## Features

**Terminal**
- A real, fully-interactive shell — `tmux`-backed, so sessions survive
  reconnects, the phone locking, or the app backgrounding.
- Multiple terminals with a tab switcher; sized to your phone so full-screen
  CLIs fit; keyboard-aware layout.
- An access banner at the top showing the app's URL, IP, and port at a glance.

**AI coding agents / CLIs** — Claude Code, Codex, and Antigravity
- One-tap **install → sign in → open**, with the tile showing exactly the one
  action you need. Sign in once; every launch reuses it (Settings > *AI sign-in*
  is the one place to authenticate them all).
- Scope an agent to a project directory, then talk to it from a **chat** view or
  the terminal, and flip to the live **preview** to see its edits. A per-agent
  **kanban board** tracks tasks.

**Projects & Git**
- Browse your local repos, run their dev servers, and see a **live preview** of
  the running app right on your phone.
- GitHub sign-in, clone, pull, push.

**Omarchy tiled dashboard** (Settings > Interface > Omarchy > Tiled)
- Several live panes at once — **System** stats, a **Weather radar** rendered as
  a pixelated ASCII coastline map, **AI CLIs**, an **Apps** launcher, a
  **Process** list, a **File** tree, a text **Editor**, and a **Terminal** tile.
- Choose which panes show and their order (Settings > *Tiled panes*), and a
  **Mono** or **Colour** palette (Settings > *Tiled colours*).

**Apps** — a curated launcher (Terminal, Files, GitHub, Docker, Lazygit,
PostgreSQL, Redis, System Monitor, Nginx, and the AI CLIs), each installable and
launchable in a tap, and surfaced as tiles as they're installed.

**Files** — browse and open files; edit text right on your phone.

**Containers** — a Docker view for what's running on the machine.

**Clipboard** — copies made in the app are kept in a clipboard history.

**Remote access** — a guided Tailscale setup for secure use away from home.

**Appearance** — Standard or Omarchy interface, colour themes, and a custom
wallpaper for the Omarchy home screen.

---

## Reporting bugs

Please open an issue:

**https://github.com/TouchWorkStation/TouchWorkstation/issues**

To make it fixable fast, include:
- **What you did** and **what you expected vs. what happened** (a screenshot
  from your phone helps a lot).
- The output of **`touchworkstation status`** and a few lines of
  **`touchworkstation logs`** from the workstation.
- Your **device / OS** (e.g. iPhone 15 / Omarchy on Arch), and the build SHA
  from **Settings > Build** (this tells us exactly which version you're on and
  whether your browser is on a stale cached bundle).

---

## Running from source (developers)

```bash
npm install
npm run build            # standard theme → dist/
VITE_THEME=minimal npm run build   # Omarchy theme
node server/index.js
```

Useful env vars: `PORT` (default 8787), `APP_PASSWORD`, `JWT_SECRET`, `TW_HOME`,
`HTTPS_PORT`. Packaged installs run behind an nginx proxy on port **8088** →
the app on 127.0.0.1:8787.

Layout: `server/` is the Node/Express backend (`index.js` entry point — auth,
terminal PTY over tmux + websocket, projects, GitHub, apps, agents, Docker,
weather); `ui/` is the React/Vite frontend (`main.jsx` shell + routing,
`TiledDashboard.jsx` the Omarchy tiled home, `TerminalPTY.jsx` /
`MinimalTerminalPTY.jsx` the terminals, `AgentDetail.jsx` the agent chat/board).
Packaging lives in `packaging/` (Arch `PKGBUILD`, Debian, RPM) and the release
pipeline in `.github/workflows/release.yml`.
