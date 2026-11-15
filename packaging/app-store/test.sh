#!/usr/bin/env bash
# End-to-end check of the App Store image: run it as Omarchy Server would, then use it.
#   packaging/app-store/test.sh <image>
set -euo pipefail
IMAGE=${1:?image}
KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
WORK=$(mktemp -d)
mkdir -p "$WORK/home" "$WORK/projects"
ok() { echo "ok  $*"; }
fail() { echo "FAILED: $*"; docker logs tw-app 2>&1 | tail -40; exit 1; }
api() { curl -sS -o /tmp/body -w '%{http_code}' -H "x-omarchy-gateway: $KEY" "$@"; }

# Without the key it must not even start.
if docker run --rm -e OMARCHY_GATEWAY_KEY= "$IMAGE" >/tmp/nokey 2>&1; then fail "started without a key"; fi
grep -q "needs OMARCHY_GATEWAY_KEY" /tmp/nokey && ok "won't start without Omarchy Server's key"

docker run -d --name tw-app -p 127.0.0.1:18787:8787 -e OMARCHY_GATEWAY_KEY="$KEY" \
  -v "$WORK/home:/data/home" -v "$WORK/projects:/data/home/Projects" "$IMAGE" >/dev/null
for i in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:18787/ && break; sleep 1; done
B=http://127.0.0.1:18787

[ "$(curl -s -o /dev/null -w '%{http_code}' $B/)" = 401 ] && ok "no key: the page is refused"
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'x-omarchy-gateway: wrong' $B/api/me)" = 401 ] && ok "wrong key: refused"
[ "$(api $B/)" = 200 ] && grep -q '<div id="root"' /tmp/body && ok "with the key: the app loads" || fail "page"
[ "$(api $B/api/me)" = 200 ] && grep -q '"appMode":true' /tmp/body && grep -q '"mustChangePassword":false' /tmp/body && ok "signed in through Omarchy Server, no password of its own" || fail "me: $(cat /tmp/body)"
for p in vpn/status machines update/check disks access apps docker/containers login change-password; do
  code=$(api -X GET $B/api/$p); [ "$code" = 404 ] || fail "/api/$p should be gone, got $code"
done
ok "host features are gone (vpn, machines, update, disks, docker, login…)"
for c in gh git claude codex tmux; do docker exec tw-app sh -c "command -v $c" >/dev/null || fail "$c missing"; done
ok "gh, git, claude, codex and tmux are installed"
[ "$(api $B/api/github/status)" = 200 ] && grep -q '"connected":false' /tmp/body && ok "GitHub: not signed in yet, and says so" || fail "github: $(cat /tmp/body)"
[ "$(api $B/api/agents/runtimes)" = 200 ] && ok "agents: runtimes listed ($(tr -d '\n' </tmp/body | head -c 300))" || fail "runtimes"
jq -e '.runtimes[]|select(.id=="claude-code")|.installed==true' /tmp/body >/dev/null && ok "Claude Code detected as installed" || fail "claude not detected: $(cat /tmp/body)"

# Clone a public repo through the API (GitHub without signing in).
[ "$(api -X POST -H 'content-type: application/json' -d '{"url":"https://github.com/octocat/Hello-World"}' $B/api/github/clone)" = 200 ] || fail "clone: $(cat /tmp/body)"
[ -d "$WORK/projects/Hello-World/.git" ] && ok "clone lands in the projects folder you chose" || fail "clone not in projects folder"
stat -c '%u' "$WORK/projects/Hello-World" >/dev/null

# A small Vite project: Run, then its live preview through TouchWorkstation.
mkdir -p "$WORK/projects/hello-vite"
cat > "$WORK/projects/hello-vite/package.json" <<'J'
{"name":"hello-vite","private":true,"scripts":{"dev":"vite"},"devDependencies":{"vite":"^6"}}
J
echo '<!doctype html><title>hello</title><h1>preview works</h1>' > "$WORK/projects/hello-vite/index.html"
[ "$(api $B/api/projects)" = 200 ] && grep -q '"hello-vite"' /tmp/body && grep -q '"Hello-World"' /tmp/body && ok "both show up in Projects" || fail "projects: $(cat /tmp/body)"
code=$(api -X POST -H 'content-type: application/json' -d '{"path":"/data/home/Projects/hello-vite"}' --max-time 600 $B/api/projects/run)
[ "$code" = 200 ] || fail "run: $code $(cat /tmp/body)"
PORT=$(sed -n 's/.*"port":\([0-9]*\).*/\1/p' /tmp/body)
for i in $(seq 1 60); do [ "$(api $B/preview/$PORT/)" = 200 ] && grep -q 'preview works' /tmp/body && break; sleep 2; done
grep -q 'preview works' /tmp/body && ok "Run + live preview at /preview/$PORT/" || fail "preview: $(head -c 300 /tmp/body)"
[ "$(curl -s -o /dev/null -w '%{http_code}' $B/preview/$PORT/)" = 401 ] && ok "the preview needs the key too"
api -X POST -H 'content-type: application/json' -d '{"path":"/data/home/Projects/hello-vite"}' $B/api/projects/stop >/dev/null && ok "stop"

# The terminal: refused without the key, accepted with it.
up() { curl -s -o /dev/null -w '%{http_code}' --max-time 3 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' "$@" "$B/ws/terminal?cols=80&rows=24" || true; }
[ "$(up)" = 401 ] && ok "terminal: refused without the key"
[ "$(up -H "x-omarchy-gateway: $KEY")" = 101 ] && ok "terminal: opens with the key" || fail "terminal upgrade"
# Paths outside its home stay blocked even inside the container.
[ "$(api "$B/api/files?path=/etc")" != 200 ] && ok "files outside its home are blocked"
docker rm -f tw-app >/dev/null
echo "ALL CHECKS PASSED"
