#!/usr/bin/env bash
# Offline whole-library backup. Configure using deployment/backup.env.example.
set -euo pipefail
: "${CASE_HUB_COMPOSE_DIR:?Set CASE_HUB_COMPOSE_DIR}"
: "${CASE_HUB_DATA_DIR:?Set absolute CASE_HUB_DATA_DIR}"
: "${CASE_HUB_SNAPSHOT_DIR:?Set absolute CASE_HUB_SNAPSHOT_DIR outside data}"
: "${CASE_HUB_WRITERS_MANAGED:?Confirm all writers are managed by this container}"
[ "$CASE_HUB_WRITERS_MANAGED" = true ] || { echo 'External writers must be disabled before automated backup' >&2; exit 1; }
script_dir=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$CASE_HUB_SNAPSHOT_DIR"
exec 9>"$CASE_HUB_SNAPSHOT_DIR/.backup.lock"
flock -n 9 || { echo 'Another backup is running' >&2; exit 1; }
settings=${CASE_HUB_ENV_FILE:-$CASE_HUB_COMPOSE_DIR/.env}
if [ ! -f "$settings" ] && [ -f "$CASE_HUB_COMPOSE_DIR/config/online.env" ]; then settings="$CASE_HUB_COMPOSE_DIR/config/online.env"; fi
export CASE_HUB_ENV_FILE="$settings"
compose=(docker compose --project-directory "$CASE_HUB_COMPOSE_DIR" --env-file "$settings" -f "$CASE_HUB_COMPOSE_DIR/docker-compose.prod.yml")
was_running=false
running_id=$("${compose[@]}" ps --status running -q sci-viz-hub)
if [ -n "$running_id" ]; then was_running=true; fi
resume() {
  rc=$?
  if [ "$was_running" = true ]; then
    "${compose[@]}" start sci-viz-hub || rc=1
  fi
  exit "$rc"
}
trap resume EXIT
if [ "$was_running" = true ]; then "${compose[@]}" stop sci-viz-hub; fi
snapshot="$CASE_HUB_SNAPSHOT_DIR/$(date -u +%Y%m%dT%H%M%SZ)"
python3 "$script_dir/data_snapshot.py" snapshot --db "$CASE_HUB_DATA_DIR/prisma/dev.db" --uploads "$CASE_HUB_DATA_DIR/uploads" --journal-covers "$CASE_HUB_DATA_DIR/journal_covers" --output "$snapshot" --writers-stopped
python3 "$script_dir/data_snapshot.py" verify --snapshot "$snapshot"
# Set to a private SSH destination such as backup-user@backup-host:/srv/private-case-hub/.
# A failed offsite copy fails the job and preserves all local snapshots.
if [ -n "${CASE_HUB_OFFSITE_DEST:-}" ]; then
  rsync -a -- "$snapshot" "$CASE_HUB_OFFSITE_DEST"
fi
# Keep only timestamp-named snapshots created by this tool. Never follow symlinks.
python3 - "$CASE_HUB_SNAPSHOT_DIR" "${CASE_HUB_SNAPSHOT_KEEP:-7}" <<'PY'
from pathlib import Path
import re
import shutil
import sys
root = Path(sys.argv[1])
keep = int(sys.argv[2])
if keep < 2:
    raise ValueError('Keep at least two verified snapshots')
items = sorted(p for p in root.iterdir() if re.fullmatch(r'\d{8}T\d{6}Z', p.name) and p.is_dir() and not p.is_symlink() and (p / 'manifest.json').is_file())
for old in items[:-keep]:
    shutil.rmtree(old)
PY
