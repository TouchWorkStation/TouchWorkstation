#!/usr/bin/env bash
# TouchWorkstation release script.
#
# Run from the repo root on Jarvis after you've made changes and are ready
# to ship them. One run does all of it, from one source of truth:
#   1. Tags and pushes the current source to GitHub
#   2. Builds .deb, .rpm, and the Arch PKGBUILD bundle from that exact commit
#   3. Publishes all three as ONE GitHub Release under that tag
#
# Why this fixes the "duplicate file with a space in the name" bug: GitHub
# Releases reject a re-uploaded filename outright instead of silently
# renaming it, and every asset is permanently tied to the exact commit it
# was built from — there's no separate manual upload step to forget or
# fumble.
#
# Usage: ./release.sh v1.0.0-beta.27 "What changed in this release"
#
# One-time setup (per machine): sudo apt-get install -y rpm  (for rpmbuild)
set -euo pipefail

TAG="${1:?Usage: ./release.sh vX.Y.Z \"release notes\"}"
NOTES="${2:-Release $TAG}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
DIST="$REPO_ROOT/.release-dist"
NODE_VERSION="22.14.0"

command -v gh >/dev/null || { echo "Needs the GitHub CLI (gh). Install it first."; exit 1; }
command -v rpmbuild >/dev/null || { echo "Needs rpmbuild. Run: sudo apt-get install -y rpm"; exit 1; }

rm -rf "$DIST" && mkdir -p "$DIST"

# ---------------------------------------------------------------------------
# 1. Tag and push source FIRST — every asset built below comes from this
#    exact, already-public commit, so source and binaries can't drift apart.
# ---------------------------------------------------------------------------
echo "==> 1/5 Committing and tagging $TAG..."
git add -A
git commit -m "Release $TAG" || echo "   (nothing new to commit)"
git tag -f "$TAG"
git push origin HEAD --follow-tags -f

# The .deb and .rpm packages both strip .git before packaging (below) and
# then rebuild the app A SECOND TIME on the target machine at install time
# (postinst/%post) — the only place their build actually happens, since this
# machine's build in step 2 gets overwritten by that later rebuild anyway.
# Neither has a .git dir to read its own commit from at that point, so
# without this, Settings > Build would show "unknown" on every .deb/.rpm
# install. Written to the repo root now, after tagging (so it's the tag's
# real SHA, not stale), never committed (see .gitignore) — cp -a below
# carries it into both packages, surviving the .git removal, in place for
# when the target machine's own npm run build reads it.
GIT_SHA="$(git rev-parse --short=12 HEAD)"
printf '{"sha":"%s","builtAt":"%s"}\n' "$GIT_SHA" "$(date -u +%FT%TZ)" > build-info.json

# ---------------------------------------------------------------------------
# 2. Build the app once — every package below reuses this same dist/.
# ---------------------------------------------------------------------------
echo "==> 2/5 Building the app..."
npm install --no-audit --no-fund
npm run build

# ---------------------------------------------------------------------------
# 3. .deb
# ---------------------------------------------------------------------------
echo "==> 3/5 Building the .deb..."
DEB_ROOT="$DIST/deb-root"
mkdir -p "$DEB_ROOT/opt/touchworkstation/app" "$DEB_ROOT/lib/systemd/system" "$DEB_ROOT/usr/bin" "$DEB_ROOT/DEBIAN"
cp -a . "$DEB_ROOT/opt/touchworkstation/app/"
rm -rf "$DEB_ROOT/opt/touchworkstation/app/.git" "$DEB_ROOT/opt/touchworkstation/app/.release-dist" "$DEB_ROOT/opt/touchworkstation/app/node_modules"
mkdir -p "$DEB_ROOT/opt/touchworkstation/runtime"
curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-x64.tar.xz" \
  | tar -xJ --strip-components=1 -C "$DEB_ROOT/opt/touchworkstation/runtime"
cp packaging/debian/touchworkstation.service "$DEB_ROOT/lib/systemd/system/"
cp packaging/bin/* "$DEB_ROOT/usr/bin/"
chmod +x "$DEB_ROOT"/usr/bin/*
cp packaging/debian/control packaging/debian/postinst packaging/debian/prerm "$DEB_ROOT/DEBIAN/"
DEB_VERSION="${TAG#v}"
sed -i "s/^Version: .*/Version: $DEB_VERSION/" "$DEB_ROOT/DEBIAN/control"
DEB_FILE="$DIST/touchworkstation_${DEB_VERSION}_amd64.deb"
dpkg-deb --build --root-owner-group "$DEB_ROOT" "$DEB_FILE"

# ---------------------------------------------------------------------------
# 4. .rpm
# ---------------------------------------------------------------------------
echo "==> 4/5 Building the .rpm..."
RPM_VERSION="$(echo "${TAG#v}" | sed 's/-/./g')"
RPMBUILD_DIR="$DIST/rpmbuild"
mkdir -p "$RPMBUILD_DIR"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}
RPM_PAYLOAD="$DIST/rpm-payload/touchworkstation-$RPM_VERSION"
mkdir -p "$RPM_PAYLOAD/opt/touchworkstation" "$RPM_PAYLOAD/usr/bin"
cp -a "$DEB_ROOT/opt/touchworkstation/app" "$RPM_PAYLOAD/opt/touchworkstation/"
cp -a "$DEB_ROOT/opt/touchworkstation/runtime" "$RPM_PAYLOAD/opt/touchworkstation/"
cp packaging/bin/* "$RPM_PAYLOAD/usr/bin/"; chmod +x "$RPM_PAYLOAD"/usr/bin/*
(cd "$DIST/rpm-payload" && tar -czf "$RPMBUILD_DIR/SOURCES/touchworkstation-$RPM_VERSION.tar.gz" "touchworkstation-$RPM_VERSION")
sed "s/^Version:.*/Version:        $RPM_VERSION/" packaging/rpm/touchworkstation.spec > "$RPMBUILD_DIR/SPECS/touchworkstation.spec"
rpmbuild --define "_topdir $RPMBUILD_DIR" -bb "$RPMBUILD_DIR/SPECS/touchworkstation.spec"
cp "$RPMBUILD_DIR"/RPMS/x86_64/*.rpm "$DIST/"

# ---------------------------------------------------------------------------
# 5. Arch PKGBUILD bundle (source files only — Arch builds locally via
#    makepkg, this environment can't produce the actual .pkg.tar.zst)
# ---------------------------------------------------------------------------
echo "==> 5/5 Packaging the Arch PKGBUILD bundle..."
tar -czf "$DIST/touchworkstation-arch-pkgbuild.tar.gz" -C packaging/arch \
  PKGBUILD touchworkstation.install touchworkstation.service touchworkstation-nginx.conf \
  touchworkstation-status touchworkstation-credentials touchworkstation-password touchworkstation-restart

# ---------------------------------------------------------------------------
# Publish — one release, all three assets, atomically.
# ---------------------------------------------------------------------------
echo "==> Publishing GitHub release $TAG..."
gh release create "$TAG" \
  "$DIST"/*.deb "$DIST"/*.rpm "$DIST/touchworkstation-arch-pkgbuild.tar.gz" \
  --title "$TAG" --notes "$NOTES" --latest

echo
echo "============================================================"
echo " Released $TAG. Assets:"
gh release view "$TAG" --json assets --jq '.assets[].name' | sed 's/^/   /'
echo
echo " Next: your website's install script/API should point at this"
echo " release instead of separately-uploaded files, so there's only"
echo " ever one place these live. See the note below for what that"
echo " needs on the website side."
echo "============================================================"
