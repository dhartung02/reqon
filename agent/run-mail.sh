#!/usr/bin/env bash
# Gmail response-ingest runner. Path-independent (resolves from its own location).
# Sources .env IN ITS OWN PROCESS so the Gmail credentials reach mail_ingest.py without
# changing the scout's environment. No-ops cleanly when Gmail isn't configured, so it's safe
# to call unconditionally from run-scout.sh or schedule on its own.
#
# Run more often than the daily scout if you like (e.g. an hourly launchd/cron entry):
#   bash agent/run-mail.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # project root
PY="$(command -v python3)"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"
mkdir -p "$DIR/logs"

# load .env (KEY=value) so GMAIL_USER / GMAIL_APP_PASSWORD / APP_TOKEN / DIGEST_SLACK_WEBHOOK
# / OPENAI_API_KEY are available; scoped to this process only. Parsed line-by-line (not sourced)
# so a passphrase with spaces or shell metacharacters can't break or execute anything.
if [ -f "$DIR/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
      *=*) export "${line%%=*}=${line#*=}" ;;
    esac
  done < "$DIR/.env"
fi

# nothing to do until Gmail is configured
if [ -z "${GMAIL_USER:-}" ] || [ -z "${GMAIL_APP_PASSWORD:-}" ]; then
  exit 0
fi

# MAIL_AI=true in .env turns on AI classification of the keyword-ambiguous ones.
AI_FLAG=""
[ "${MAIL_AI:-}" = "true" ] && AI_FLAG="--ai"

echo "[$STAMP] mail-ingest start" >> "$DIR/logs/mail.log"
"$PY" "$DIR/agent/mail_ingest.py" --apply $AI_FLAG >> "$DIR/logs/mail.log" 2>&1 || \
  echo "[$STAMP] mail_ingest.py failed" >> "$DIR/logs/mail.log"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] mail-ingest done" >> "$DIR/logs/mail.log"
