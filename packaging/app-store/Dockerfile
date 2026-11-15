# TouchWorkstation for the Omarchy Server App Store: Projects (with GitHub and live previews),
# AI coding agents, and the container's own terminal they use. Omarchy Server signs you in and
# proves it on every request (OMARCHY_GATEWAY_KEY); see TW_MODE=app in server/index.js.
#
# Everything an agent or dev server does stays inside this container: it sees only its own home
# (/data/home) and the projects folder you chose when installing (/data/home/Projects).
FROM node:22-bookworm-slim

ARG BUILD_SHA=unknown

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl git gnupg tmux sudo procps less nano openssh-client \
      python3 python3-pip make g++ \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && rm -rf /var/lib/apt/lists/*

# The AI coding CLIs, ready to sign in to (Settings → AI sign-in).
RUN npm install -g @anthropic-ai/claude-code @openai/codex && npm cache clean --force

WORKDIR /opt/touchworkstation
COPY package.json ./
RUN npm install --no-audit --no-fund && npm cache clean --force
COPY server ./server
COPY ui ./ui
RUN VITE_APP_MODE=1 npx vite build --config ui/vite.config.js \
 && printf '{"sha":"%s"}\n' "$BUILD_SHA" > build-info.json

ENV TW_MODE=app \
    PORT=8787 \
    HOME=/data/home \
    TW_HOME=/data/home \
    TW_PROJECTS=/data/home/Projects \
    TW_STATE_DIR=/data/home/.local/share/touchworkstation \
    GIT_TERMINAL_PROMPT=0
VOLUME ["/data/home"]
EXPOSE 8787
CMD ["node", "server/index.js"]
