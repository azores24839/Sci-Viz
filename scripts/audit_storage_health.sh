#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "Storage overview"
du -sh \
  .git \
  journal_covers \
  nasa_svs_output \
  nature_covers \
  sjtu_platform_media \
  sci-viz-case-hub/server/uploads \
  sci-viz-case-hub/server/backups \
  sci-viz-case-hub/server/node_modules \
  sci-viz-case-hub/web/node_modules 2>/dev/null || true

echo
echo "Git object database"
git count-objects -vH

echo
echo "Working tree"
git status -sb

echo
echo "Protected media inventory"
node scripts/media_inventory.mjs

echo
echo "No files were deleted or modified in protected media directories."
