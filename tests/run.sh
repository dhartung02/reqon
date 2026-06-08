#!/usr/bin/env bash
# Run the scout/adapter/scoring/dedupe test suite (stdlib unittest; no deps).
cd "$(dirname "$0")/.."
exec python3 -m unittest discover -s tests -p 'test_*.py' "$@"
