#!/usr/bin/env bash
# run-tunnel.sh — expose the local Reqon server over HTTPS with Tailscale Funnel, so the iOS
# app can pair/sync from outside your LAN (iOS ATS blocks plaintext HTTP). This is the
# recommended path from MOBILE-SETUP.md when you're behind CGNAT or don't want to open ports.
#
# What it does:
#   1. verifies Tailscale is installed + logged in
#   2. enables Funnel for the app's port (default 8787) in the background
#   3. reads back your Funnel hostname and writes PUBLIC_URL=https://<host> into .env
#   4. reminds you to restart the server + re-pair the phone (so the QR bakes the https origin)
#
# Caddy alternative: if you'd rather use the bundled Caddyfile (your own domain + Let's Encrypt),
# skip this script, run `caddy run --config Caddyfile`, and set PUBLIC_URL to your domain in
# Settings → Advanced → Remote access URL.
#
# Usage:  ./agent/run-tunnel.sh [PORT]      (PORT defaults to 8787, or $PORT)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT/.env"
PORT="${1:-${PORT:-8787}}"

if ! command -v tailscale >/dev/null 2>&1; then
  echo "✗ Tailscale isn't installed. Get it from https://tailscale.com/download (or: brew install tailscale)."
  echo "  Then run 'tailscale up' to log in, and re-run this script."
  exit 1
fi

# Confirm we're logged in and grab this machine's MagicDNS name (strip trailing dot).
HOST="$(tailscale status --json 2>/dev/null | python3 -c 'import sys,json;d=json.load(sys.stdin);print((d.get("Self",{}).get("DNSName","") or "").rstrip("."))' 2>/dev/null || true)"
if [ -z "$HOST" ]; then
  echo "✗ Couldn't read your Tailscale identity. Run 'tailscale up' to log in, then re-run."
  exit 1
fi

echo "→ Enabling Tailscale Funnel for 127.0.0.1:$PORT  (machine: $HOST)"
# --bg keeps it running after this script exits; serves the local app over the public Funnel host.
tailscale funnel --bg "$PORT" >/dev/null

PUBLIC_URL="https://$HOST"

# Write/replace PUBLIC_URL in .env (create the file if missing).
touch "$ENV_FILE"
if grep -q '^PUBLIC_URL=' "$ENV_FILE"; then
  # portable in-place edit (macOS + GNU sed)
  tmp="$(mktemp)"; sed "s#^PUBLIC_URL=.*#PUBLIC_URL=$PUBLIC_URL#" "$ENV_FILE" > "$tmp" && mv "$tmp" "$ENV_FILE"
else
  printf '\nPUBLIC_URL=%s\n' "$PUBLIC_URL" >> "$ENV_FILE"
fi

cat <<EOF

✓ Funnel is live:  $PUBLIC_URL
✓ Wrote PUBLIC_URL to $ENV_FILE

Next:
  1. Restart the server so it picks up .env (or just save Settings once — PUBLIC_URL is also
     editable at Settings → Advanced → Remote access URL):
        launchctl kickstart -k gui/\$(id -u)/com.reqon.server
  2. On the board: Settings → Advanced → Show pairing QR  (it now bakes $PUBLIC_URL)
  3. On the phone: Settings → Sync → Scan QR.  Sync should work on cellular / off-LAN now.

To stop exposing the server:  tailscale funnel --bg off   (then clear PUBLIC_URL in Settings)
EOF
