#!/bin/bash
# Sci-Viz Case Hub - 一键分享给同事
# 用法: ./share.sh         启动分享
#       ./share.sh stop    停止分享

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HUB_DIR="$SCRIPT_DIR/sci-viz-case-hub"

stop_sharing() {
  echo "正在停止分享..."
  pkill -f cloudflared 2>/dev/null && echo "  隧道已关闭" || echo "  隧道未在运行"
  exit 0
}

[ "$1" = "stop" ] && stop_sharing

echo "========================================="
echo "  Sci-Viz Case Hub 分享中..."
echo "========================================="
echo ""

# 检查开发服务器是否在运行
SERVER_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null)
if [ "$SERVER_CODE" != "200" ]; then
  echo "[1/2] 启动开发服务器..."
  cd "$HUB_DIR"
  nohup npm run dev > /tmp/sciviz-dev.log 2>&1 &
  
  # 等待服务器就绪
  for i in $(seq 1 30); do
    CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null || echo "000")
    [ "$CODE" = "200" ] && break
    sleep 1
  done
  echo "  开发服务器已就绪"
else
  echo "[1/2] 开发服务器已在运行"
fi

# 检查是否已有隧道在运行
if pgrep -f cloudflared > /dev/null 2>&1; then
  echo "[2/2] 隧道已在运行"
  URL=$(grep -o 'https://[^ ]*trycloudflare\.com' /tmp/cloudflared.log 2>/dev/null | tail -1)
else
  echo "[2/2] 启动公网隧道..."
  nohup cloudflared tunnel --url http://localhost:5173 > /tmp/cloudflared.log 2>&1 &
  sleep 6
  URL=$(grep -o 'https://[^ ]*trycloudflare\.com' /tmp/cloudflared.log 2>/dev/null | tail -1)
fi

echo ""
echo "========================================="
echo "  👇 把这个链接发给同事:"
echo ""
echo "  $URL"
echo ""
echo "  📌 不要关掉这个终端窗口"
echo "  🛑 停止: ./share.sh stop"
echo "========================================="

# 一直运行直到 Ctrl+C
trap 'echo ""; echo "正在关闭..."; pkill -f cloudflared 2>/dev/null; echo "已停止分享"; exit 0' INT TERM
while true; do sleep 3600; done
