#!/usr/bin/env sh
# TouchWorkstation single-line installer.
#
#   curl -fsSL https://touchworkstation.com/api/public/install | sh -s -- <code>
#
# This is the single source of truth for installing TouchWorkstation on any
# supported Linux distro. The website (touchworkstation.com, hosted on
# Lovable) should serve/proxy this exact file verbatim at
# /api/public/install rather than hosting its own copy — one script, edited
# in one place, so it can never silently drift out of date the way
# manually-uploaded .deb/.rpm/.pkg.tar.zst files did.
#
# Any argument passed through (e.g. an access code) is accepted and ignored
# here — whatever the website does with it server-side before proxying to
# this script stays exactly as-is; this script itself doesn't need it.
#
# What it does: detect the system's package manager, fetch the matching
# pre-built package from the latest GitHub Release, and install it with the
# native tool. Every package is built fresh from source on every tagged
# release by .github/workflows/release.yml (Ubuntu VM for .deb/.rpm, a real
# Arch container for the Arch package) and install-tested on its actual
# target distro before that release is ever published — so "latest" here
# always means "the newest release that has already been proven to
# install-and-run correctly," not just "the newest build."
set -eu

REPO="TouchWorkStation/TouchWorkstation"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"

log() { printf '%s\n' "$*" >&2; }
die() { log "Error: $*"; exit 1; }

need_sudo() {
  if [ "$(id -u)" = "0" ]; then "$@"; else sudo "$@"; fi
}

# Pick the download URL for the given file extension out of the GitHub
# Releases API response — never a hardcoded filename, since the exact name
# (version number, arch suffix) changes on every release.
pick_asset_url() {
  ext="$1"
  # No `jq` dependency assumed (a fresh minimal install may not have it) —
  # a small grep/sed pass over the JSON's browser_download_url fields is
  # reliable enough for this one shape of data. Excludes Arch's optional
  # -debug- package (same guard the in-app update feature already applies)
  # in case a future makepkg config starts producing one alongside the
  # real package.
  grep -o "\"browser_download_url\": *\"[^\"]*${ext}\"" "$RELEASE_JSON" \
    | grep -v -- '-debug-' \
    | head -n1 \
    | sed -E 's/.*"(https:[^"]+)"/\1/'
}

fetch_release_json() {
  RELEASE_JSON="$(mktemp)"
  trap 'rm -f "$RELEASE_JSON"' EXIT
  if ! curl -fsSL "$API_URL" -o "$RELEASE_JSON"; then
    die "Could not reach GitHub to find the latest release. Check your network connection and try again, or install manually from https://github.com/${REPO}/releases/latest"
  fi
}

install_asset() {
  url="$1"
  [ -n "$url" ] || die "The latest GitHub release doesn't have a matching package for this system yet. See https://github.com/${REPO}/releases/latest"
  file="$(mktemp -t touchworkstation-XXXXXX)"
  log "Downloading $(basename "$url")..."
  curl -fsSL "$url" -o "$file"
  printf '%s\n' "$file"
}

# pacman refuses to run while its database is locked, and its own error
# ("could not lock database: File exists") reads like corruption and invites
# people to delete the lock while a real package manager is mid-transaction,
# which genuinely can break the system. Detect it BEFORE downloading anything
# and say which of the two situations this is, since the safe answer differs.
check_pacman_lock() {
  [ -e /var/lib/pacman/db.lck ] || return 0
  holder="$(pgrep -a 'pacman|pamac|yay|paru|pikaur|octopi' 2>/dev/null || true)"
  if [ -n "$holder" ]; then
    die "Another package manager is running, so pacman can't start:
$holder
Wait for it to finish, then run this installer again."
  fi
  die "pacman's database is locked (/var/lib/pacman/db.lck) but nothing appears to be running — usually a leftover from an update that was interrupted.
Double-check nothing is running:  pgrep -a pacman pamac yay paru
If that prints nothing, clear it:  sudo rm /var/lib/pacman/db.lck
Then run this installer again."
}

main() {
  fetch_release_json

  if command -v apt-get >/dev/null 2>&1; then
    log "Detected an apt-based system (Ubuntu/Debian) — installing the .deb package."
    url="$(pick_asset_url '\.deb')"
    pkg="$(install_asset "$url")"
    need_sudo dpkg -i "$pkg" || need_sudo apt-get install -f -y
    rm -f "$pkg"

  elif command -v dnf >/dev/null 2>&1; then
    log "Detected a dnf-based system (Fedora/RHEL) — installing the .rpm package."
    url="$(pick_asset_url '\.rpm')"
    pkg="$(install_asset "$url")"
    need_sudo dnf install -y "$pkg"
    rm -f "$pkg"

  elif command -v zypper >/dev/null 2>&1; then
    log "Detected a zypper-based system (openSUSE) — installing the .rpm package."
    url="$(pick_asset_url '\.rpm')"
    pkg="$(install_asset "$url")"
    need_sudo zypper --non-interactive install "$pkg"
    rm -f "$pkg"

  elif command -v pacman >/dev/null 2>&1; then
    log "Detected an Arch-based system — installing the pre-built package."
    check_pacman_lock
    url="$(pick_asset_url '\.pkg\.tar\.zst')"
    pkg="$(install_asset "$url")"
    # The package depends on nodejs/npm/nginx/github-cli, which pacman -U pulls
    # from the sync repos. On a fresh machine those repo databases may not be
    # downloaded yet ("database file for 'core' does not exist"), so dependency
    # resolution fails outright. Refresh the databases first so -U can resolve
    # and install the deps. -Sy (not -Syu) keeps this to just what's needed to
    # satisfy the package without forcing a full system upgrade mid-install.
    log "Refreshing package databases so dependencies resolve..."
    need_sudo pacman -Sy --noconfirm || true
    need_sudo pacman -U --noconfirm "$pkg"
    rm -f "$pkg"

  else
    die "No supported package manager found (looked for apt-get, dnf, zypper, pacman). Install manually instead: clone https://github.com/${REPO}, then run 'npm install' and 'npm run build' followed by 'node server/index.js' — or see https://github.com/${REPO}/releases/latest for a package that might still fit your system."
  fi

  log ""
  log "============================================================"
  log " TouchWorkstation installed."
  log ""
  # Show the real address + service state by calling the management CLI the
  # package just installed — single source of truth, and it's correct on both
  # fresh installs and upgrades (the package's post_install only runs on a
  # fresh install, so an upgrade would otherwise show nothing useful here).
  if command -v touchworkstation >/dev/null 2>&1; then
    touchworkstation status 2>/dev/null || true
    log ""
    log " Manage it from any terminal:"
    log "   touchworkstation status     service state + how to reach it"
    log "   touchworkstation url        just the address (IP / port)"
    log "   touchworkstation restart    restart the app (sudo)"
    log "   touchworkstation logs       recent logs"
    log "   touchworkstation update     pull + reinstall the latest"
    log "   touchworkstation help       all commands"
    log ""
    log " First login password: touchwork  (you'll change it on first login)"
  else
    # Fallback for non-packaged installs where the CLI isn't present.
    HOST="$(hostname 2>/dev/null)"; IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [ -n "$HOST" ] && log " Open: http://${HOST}.local:8088"
    [ -n "$IP" ] && log " Or:   http://${IP}:8088"
    log " First login password: touchwork  (you'll change it on first login)"
  fi
  log "============================================================"
}

main "$@"
