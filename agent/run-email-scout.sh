#!/usr/bin/env bash
# Email job-scout runner — ingests job-RECOMMENDATION emails (LinkedIn/Indeed/Glassdoor/…)
# from the live Gmail inbox and adds new leads to the board (append-only, resolved to the
# real employer req when possible). Path-independent; sources .env in its own process.
#
# No-ops cleanly unless Gmail is configured AND EMAIL_SCOUT=true in .env, so it's safe to
# call unconditionally from run-scout.sh or schedule on its own:
#   bash agent/run-email-scout.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # project root
PY="$(command -v python3)"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"
mkdir -p "$DIR/logs"

# load .env (KEY=value) scoped to this process; parsed line-by-line (not sourced) so a
# value with spaces or shell metacharacters can't break or execute anything.
if [ -f "$DIR/.env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
      *=*) export "${line%%=*}=${line#*=}" ;;
    esac
  done < "$DIR/.env"
fi

# off unless explicitly enabled + Gmail configured
if [ "${EMAIL_SCOUT:-}" != "true" ]; then exit 0; fi
if [ -z "${GMAIL_USER:-}" ] || [ -z "${GMAIL_APP_PASSWORD:-}" ]; then exit 0; fi

# EMAIL_SCOUT_NO_RESOLVE=true skips career-site resolution (faster, lower confidence).
RESOLVE_FLAG=""
[ "${EMAIL_SCOUT_NO_RESOLVE:-}" = "true" ] && RESOLVE_FLAG="--no-resolve"
# Optional: EMAIL_SCOUT_SOURCES=linkedin,indeed  EMAIL_SCOUT_MIN_FIT=6.5
SRC_FLAG=""; [ -n "${EMAIL_SCOUT_SOURCES:-}" ] && SRC_FLAG="--sources ${EMAIL_SCOUT_SOURCES}"
FIT_FLAG=""; [ -n "${EMAIL_SCOUT_MIN_FIT:-}" ] && FIT_FLAG="--min-fit ${EMAIL_SCOUT_MIN_FIT}"

echo "[$STAMP] email-scout start" >> "$DIR/logs/scout.log"
# shellcheck disable=SC2086
"$PY" "$DIR/agent/scout_email.py" --apply $RESOLVE_FLAG $SRC_FLAG $FIT_FLAG >> "$DIR/logs/scout.log" 2>&1 || \
  echo "[$STAMP] scout_email.py failed" >> "$DIR/logs/scout.log"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] email-scout done" >> "$DIR/logs/scout.log"
