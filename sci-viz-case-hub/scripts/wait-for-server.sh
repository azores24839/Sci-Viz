#!/usr/bin/env bash
set -euo pipefail

url="${1:-}"
timeout_seconds="${WAIT_FOR_SERVER_TIMEOUT_SECONDS:-30}"
interval_seconds="${WAIT_FOR_SERVER_INTERVAL_SECONDS:-0.5}"
started_at="$(date +%s)"

if [[ -z "$url" ]]; then
  echo "Usage: bash scripts/wait-for-server.sh <url>" >&2
  exit 1
fi

while true; do
  if curl -fsS "$url" >/dev/null 2>&1; then
    echo "[wait-for-server] Ready: $url"
    exit 0
  fi

  now="$(date +%s)"
  if (( now - started_at >= timeout_seconds )); then
    echo "[wait-for-server] Timed out after ${timeout_seconds}s: $url" >&2
    exit 1
  fi

  sleep "$interval_seconds"
done
