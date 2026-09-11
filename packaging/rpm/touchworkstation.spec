Name:           touchworkstation
Version:        1.0.0
Release:        1%{?dist}
Summary:        Ubuntu mobile workstation and developer control center
License:        Proprietary
URL:            https://touchworkstation.com
Source0:        touchworkstation-1.0.0.tar.gz
BuildArch:      x86_64
AutoReqProv:    no

Requires:       git tmux curl ca-certificates openssl procps-ng iproute psmisc bash

%description
A responsive React interface and local Ubuntu agent for projects, GitHub,
development previews, applications, files, terminal, and remote access
setup — from your phone.

%prep
%setup -q

%build
# No compilation happens here — npm install/build runs in %post, on the
# target machine, exactly like the .deb's postinst does. This keeps one
# build path instead of two that could drift apart.

%install
cd %{_builddir}/%{name}-%{version}
mkdir -p %{buildroot}/opt/touchworkstation
cp -a opt/touchworkstation/app %{buildroot}/opt/touchworkstation/
cp -a opt/touchworkstation/runtime %{buildroot}/opt/touchworkstation/
mkdir -p %{buildroot}/usr/lib/systemd/system
cat > %{buildroot}/usr/lib/systemd/system/touchworkstation.service <<'UNIT'
[Unit]
Description=TouchWorkstation local agent
After=network.target

[Service]
Type=simple
EnvironmentFile=/etc/touchworkstation/touchworkstation.env
WorkingDirectory=/opt/touchworkstation/app
ExecStart=/opt/touchworkstation/runtime/bin/node server/index.js
Restart=on-failure
RestartSec=3
User=TW_USER_PLACEHOLDER
Group=TW_GROUP_PLACEHOLDER

[Install]
WantedBy=multi-user.target
UNIT

%files
/opt/touchworkstation/app
/opt/touchworkstation/runtime
/usr/lib/systemd/system/touchworkstation.service

%post
set -e
APP=/opt/touchworkstation/app
RUNTIME=/opt/touchworkstation/runtime/bin
ENV_DIR=/etc/touchworkstation
ENV_FILE=$ENV_DIR/touchworkstation.env
STATE=/var/lib/touchworkstation

# nginx and gh aren't declared as RPM Requires: above, because their
# package names/repos genuinely differ between Fedora/RHEL and openSUSE —
# handled here instead, the same way the multi-distro shell installer does.
if command -v dnf >/dev/null 2>&1; then
  PKG="dnf install -y"
  command -v nginx >/dev/null || $PKG nginx
  command -v gcc >/dev/null || $PKG gcc gcc-c++ make python3
  command -v gh >/dev/null || {
    dnf config-manager --add-repo https://cli.github.com/packages/rpm/gh-cli.repo
    $PKG gh
  }
elif command -v zypper >/dev/null 2>&1; then
  PKG="zypper --non-interactive install"
  command -v nginx >/dev/null || $PKG nginx
  command -v gcc >/dev/null || $PKG gcc gcc-c++ make python3
  command -v gh >/dev/null || {
    zypper --non-interactive addrepo https://cli.github.com/packages/rpm/gh-cli.repo
    zypper --non-interactive --gpg-auto-import-keys refresh
    $PKG gh
  }
fi

APP_USER="$(getent passwd | awk -F: '$3>=1000 && $3<60000 && $7 !~ /(nologin|false)$/ {print $1; exit}')"
[ -n "$APP_USER" ] || { echo 'Could not determine the workstation user.' >&2; exit 1; }
APP_GROUP=$(id -gn "$APP_USER")
APP_HOME=$(getent passwd "$APP_USER" | cut -d: -f6)

mkdir -p "$ENV_DIR" "$STATE" "$APP_HOME/TouchWorkstation/Projects"
OLD_PASSWORD=""; OLD_SECRET=""
[ -f "$ENV_FILE" ] && OLD_PASSWORD=$(grep '^APP_PASSWORD=' "$ENV_FILE" | cut -d= -f2- || true)
[ -f "$ENV_FILE" ] && OLD_SECRET=$(grep '^JWT_SECRET=' "$ENV_FILE" | cut -d= -f2- || true)
APP_PASSWORD="${OLD_PASSWORD:-touchwork}"
JWT_SECRET="${OLD_SECRET:-$(openssl rand -hex 48)}"
PW_MUST_CHANGE=1; [ -n "$OLD_PASSWORD" ] && PW_MUST_CHANGE=0

cat > "$ENV_FILE" <<ENV
APP_PASSWORD=$APP_PASSWORD
JWT_SECRET=$JWT_SECRET
PW_MUST_CHANGE=$PW_MUST_CHANGE
PORT=8787
TW_USER=$APP_USER
TW_HOME=$APP_HOME
TW_STATE_DIR=$APP_HOME/.local/share/touchworkstation
TW_ENV_FILE=$ENV_FILE
HOME=$APP_HOME
ENV
chown root:"$APP_GROUP" "$ENV_FILE"; chmod 660 "$ENV_FILE"
mkdir -p "$APP_HOME/.local/share/touchworkstation"
chown -R "$APP_USER:$APP_GROUP" "$APP_HOME/.local" "$STATE" "$APP_HOME/TouchWorkstation" "$APP"

sed -i "s/^User=TW_USER_PLACEHOLDER/User=$APP_USER/; s/^Group=TW_GROUP_PLACEHOLDER/Group=$APP_GROUP/" \
  /usr/lib/systemd/system/touchworkstation.service

NPM_CACHE="$STATE/npm-cache"; mkdir -p "$NPM_CACHE"; chown -R "$APP_USER:$APP_GROUP" "$NPM_CACHE"
runuser -u "$APP_USER" -- env HOME="$APP_HOME" npm_config_cache="$NPM_CACHE" \
  PATH="$RUNTIME:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  bash -lc "cd '$APP' && '$RUNTIME/npm' install --no-audit --no-fund --no-progress && '$RUNTIME/npm' run build"

mkdir -p /etc/nginx/conf.d
cat > /etc/nginx/conf.d/touchworkstation.conf <<'NGINX'
server {
  listen 8088;
  server_name _;
  client_max_body_size 64m;
  location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
NGINX
nginx -t

systemctl daemon-reload
systemctl stop touchworkstation 2>/dev/null || true
# If anything else is squatting on 8787 (a stray manual `node server/index.js`,
# a run that never fully exited), the freshly-restarted service just
# crash-loops on EADDRINUSE forever and the upgrade "worked" but silently
# never took effect. Matches the .deb postinst's existing guard.
fuser -k 8787/tcp 2>/dev/null || true
systemctl enable --now touchworkstation nginx
systemctl restart touchworkstation nginx

HOST=$(hostname); IP=$(hostname -I | awk '{print $1}')
echo
echo "============================================================"
echo " TouchWorkstation installed"
echo "============================================================"
echo " Open:     http://${HOST}.local:8088"
[ -n "$IP" ] && echo " Fallback: http://${IP}:8088"
if [ "$PW_MUST_CHANGE" = "1" ]; then
  echo " Password: $APP_PASSWORD  (you'll be asked to change it on first login)"
else
  echo " Log in with the password you already set."
fi
echo "============================================================"

%preun
if [ "$1" = "0" ]; then
  systemctl stop touchworkstation nginx 2>/dev/null || true
  systemctl disable touchworkstation 2>/dev/null || true
fi

%changelog
* Sun Sep 07 2026 TouchWorkstation Beta <team@touchworkstation.com> - 1.0.0-1
- Initial RPM release, mirrors the .deb's feature set (VNC desktop view removed).
