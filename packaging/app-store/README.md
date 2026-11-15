# TouchWorkstation in the Omarchy Server App Store

`Dockerfile` here builds the App Store version: `ghcr.io/touchworkstation/touchworkstation-app`.

- **What's in it:** Projects (local repos, GitHub sign-in/clone/pull/push, dev servers with live
  previews), Agents (Claude Code, Codex: chat, board, preview), and a terminal *inside the container*.
  No host terminal, files, Docker, disks, network, VPN, machines or self-update.
- **Sign-in:** none of its own. It only answers requests that carry `x-omarchy-gateway` equal to
  `OMARCHY_GATEWAY_KEY`, which Omarchy Server's sign-in gateway adds for this app alone. It refuses to
  start without the key.
- **Storage:** `/data/home` (agent and GitHub sign-ins, settings) and `/data/home/Projects`, which
  Omarchy Server maps to the folder you picked when installing (inside the app, or one of yours).

Built and published by `.github/workflows/app-image.yml`.
