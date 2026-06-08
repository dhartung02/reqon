#!/usr/bin/env bash
# Daily scout runner. Path-independent (resolves from its own location).
# Add LinkedIn alert ingestion by setting LI_DIR to a folder of saved .eml/.html.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # project root
PY="$(command -v python3)"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"
mkdir -p "$DIR/logs"

echo "[$STAMP] scout start" >> "$DIR/logs/scout.log"

# 1) ATS board scout (Greenhouse/Ashby/Lever)
"$PY" "$DIR/agent/scout.py" --quiet >> "$DIR/logs/scout.log" 2>&1 || \
  echo "[$STAMP] scout.py failed" >> "$DIR/logs/scout.log"

# 2) (optional) LinkedIn job-alert email ingestion.
#    Set LI_DIR to a folder where LinkedIn alert emails are saved as .eml/.html.
if [ -n "${LI_DIR:-}" ] && [ -d "${LI_DIR}" ]; then
  "$PY" "$DIR/agent/scout_linkedin.py" --dir "$LI_DIR" >> "$DIR/logs/scout.log" 2>&1 || \
    echo "[$STAMP] scout_linkedin.py failed" >> "$DIR/logs/scout.log"
fi

# 3) refresh the Excel export if the server is up (optional, ignored if down)
curl -fs "http://localhost:8787/api/export.xlsx" -o "$DIR/Job Search Pipeline.xlsx" 2>/dev/null || true

echo "[$(date '+%Y-%m-%d %H:%M:%S')] scout done" >> "$DIR/logs/scout.log"
