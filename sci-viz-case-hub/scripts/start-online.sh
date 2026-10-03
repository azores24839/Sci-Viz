#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
settings=${CASE_HUB_ONLINE_CONFIG:-$root/config/online.env}
case "$settings" in /*) ;; *) settings="$root/$settings" ;; esac
if [ ! -f "$settings" ]; then
  echo '请先将 config/online.env.example 复制为 config/online.env，再填写线上设置。' >&2
  exit 1
fi
python3 "$root/scripts/check_online_config.py" "$settings"
command -v docker >/dev/null || { echo '线上服务器需要安装 Docker 和 Compose。' >&2; exit 1; }
export CASE_HUB_ENV_FILE="$settings"
compose=(docker compose --project-directory "$root" --env-file "$settings" -f "$root/docker-compose.prod.yml")
"${compose[@]}" config -q
if [ "${1:-}" = --check ]; then echo '线上配置格式检查通过；启动时还会检查 HTTPS 和密钥。'; exit 0; fi
data_dir=$(python3 "$root/scripts/check_online_config.py" "$settings" --data-dir)
if [ ! -f "$data_dir/prisma/dev.db" ] || [ ! -d "$data_dir/uploads/originals" ] || [ ! -d "$data_dir/uploads/thumbnails" ] || [ ! -d "$data_dir/journal_covers" ]; then
  echo '请先迁移完整数据库、原图、缩略图和期刊封面。' >&2; exit 1
fi
"${compose[@]}" pull
"${compose[@]}" up -d --wait --wait-timeout 120
