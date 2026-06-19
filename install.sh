#!/usr/bin/env bash
#
# One-command setup for the Job Pipeline CRM + daily Scout on macOS.
# Installs deps, seeds data (first run only), optionally builds a resume-tailored
# search profile, and registers TWO launchd agents:
#   - com.reqon.server : the board server (auto-start + auto-restart)
#   - com.reqon.scout  : the daily job scout (weekday 7am)
#
# Usage:
#   cd ~/reqon && ./install.sh
#   ./install.sh --resume "/path/to/Resume.docx"    # tailor the search to a resume
#   LI_DIR="$HOME/Downloads/li-alerts" ./install.sh  # also ingest LinkedIn alert emails daily
#
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LABEL="com.reqon.server"
SCOUT_LABEL="com.reqon.scout"
PORT="${PORT:-8787}"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
SCOUT_PLIST="$HOME/Library/LaunchAgents/${SCOUT_LABEL}.plist"
UID_NUM="$(id -u)"
RESUME=""

# ---- args ----
while [ $# -gt 0 ]; do
  case "$1" in
    --resume) RESUME="${2:-}"; shift 2 ;;
    --resume=*) RESUME="${1#*=}"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

echo "==> Job Pipeline CRM + Scout installer"
echo "    Project: $DIR"
echo "    Port:    $PORT"
echo

# 1. Node check (server) + Python check (scout)
if ! command -v node >/dev/null 2>&1; then
  echo "X Node.js is not installed.  brew install node   (or https://nodejs.org)"; exit 1
fi
NODE_BIN="$(command -v node)"; echo "OK Node $(node -v) at $NODE_BIN"
PY_BIN="$(command -v python3 || true)"
if [ -n "$PY_BIN" ]; then echo "OK Python $($PY_BIN -V 2>&1 | awk '{print $2}') at $PY_BIN";
else echo "!  python3 not found - the daily Scout needs it (brew install python). Server still works."; fi

# 2. Dependencies
echo "==> Installing dependencies (npm install)..."
( cd "$DIR" && npm install --no-audit --no-fund )

# 3. Seed (only if no store yet)
if [ ! -f "$DIR/data.json" ]; then
  cp "$DIR/seed.json" "$DIR/data.json"
  echo "OK Seeded data.json from seed.json ($(node -e "console.log(require('$DIR/seed.json').length)") reqs)"
else
  echo "OK Existing data.json preserved ($(node -e "console.log(require('$DIR/data.json').length)") reqs)"
fi
mkdir -p "$DIR/logs" "$DIR/backups"

# 4. Make scout scripts executable
chmod +x "$DIR/agent/run-scout.sh" "$DIR/agent/run-mail.sh" "$DIR/agent/scout.py" \
         "$DIR/agent/scout_linkedin.py" "$DIR/agent/mail_ingest.py" \
         "$DIR/agent/profile-from-resume.py" 2>/dev/null || true

# 5. Optional: build resume-tailored search profile
if [ -n "$RESUME" ]; then
  if [ -z "$PY_BIN" ]; then echo "!  --resume given but python3 missing; skipping profile."
  elif [ ! -f "$RESUME" ]; then echo "!  Resume not found: $RESUME";
  else
    echo "==> Building resume-tailored profile from: $RESUME"
    "$PY_BIN" "$DIR/agent/profile-from-resume.py" "$RESUME" || echo "!  profile build failed (continuing)"
  fi
fi

# 6. Server launchd agent (auto-start + auto-restart)
echo "==> Writing server agent -> $PLIST"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>            <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>${NODE_BIN}</string><string>${DIR}/server.js</string></array>
  <key>WorkingDirectory</key> <string>${DIR}</string>
  <key>EnvironmentVariables</key>
  <dict><key>PORT</key><string>${PORT}</string><key>HOST</key><string>0.0.0.0</string></dict>
  <key>RunAtLoad</key>        <true/>
  <key>KeepAlive</key>        <true/>
  <key>StandardOutPath</key>  <string>${DIR}/logs/server.log</string>
  <key>StandardErrorPath</key><string>${DIR}/logs/server.err.log</string>
</dict>
</plist>
PLIST

# 7. Scout launchd agent (weekday 7am) - only if python3 is present
if [ -n "$PY_BIN" ]; then
  echo "==> Writing scout agent -> $SCOUT_PLIST  (weekdays 7:00am)"
  cat > "$SCOUT_PLIST" <<SPLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${SCOUT_LABEL}</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>${DIR}/agent/run-scout.sh</string></array>
  <key>WorkingDirectory</key><string>${DIR}</string>
  <key>EnvironmentVariables</key>
  <dict><key>PORT</key><string>${PORT}</string><key>LI_DIR</key><string>${LI_DIR:-}</string></dict>
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>2</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>3</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>4</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>5</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  </array>
  <key>StandardOutPath</key><string>${DIR}/logs/scout.log</string>
  <key>StandardErrorPath</key><string>${DIR}/logs/scout.err.log</string>
</dict>
</plist>
SPLIST
fi

# 8. (Re)load agents
load_agent () {  # $1 = label, $2 = plist
  launchctl bootout "gui/${UID_NUM}/$1" 2>/dev/null || true
  if ! launchctl bootstrap "gui/${UID_NUM}" "$2" 2>/dev/null; then
    launchctl unload "$2" 2>/dev/null || true
    launchctl load -w "$2"
  fi
}
echo "==> Loading agents..."
load_agent "$LABEL" "$PLIST"
launchctl kickstart -k "gui/${UID_NUM}/${LABEL}" 2>/dev/null || true
[ -n "$PY_BIN" ] && load_agent "$SCOUT_LABEL" "$SCOUT_PLIST"

# 9. Health check + summary
echo "==> Waiting for server..."
ok=""
for i in $(seq 1 20); do
  if curl -fsS "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then ok="yes"; break; fi
  sleep 0.5
done
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo '')"
echo
[ -n "$ok" ] && echo "[OK] CRM running, auto-starts on reboot." || echo "[!] Server slow to answer - see $DIR/logs/server.err.log"
[ -n "$PY_BIN" ] && echo "[OK] Scout scheduled weekdays 7am (runs even if the desktop app is closed)."
echo
echo "   Board:         http://localhost:${PORT}"
[ -n "$LAN_IP" ] && echo "   On your phone: http://${LAN_IP}:${PORT}"
echo "   Run scout now: python3 $DIR/agent/scout.py --dry-run"
echo "   Re-tailor:     python3 $DIR/agent/profile-from-resume.py \"/path/Resume.docx\""
echo "   Scout docs:    $DIR/agent/SCOUT.md"
echo "   Stop scout:    launchctl bootout gui/${UID_NUM}/${SCOUT_LABEL}"
echo
