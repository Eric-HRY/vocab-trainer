#!/bin/bash
# 啸啸单词斩 · 一键启动（iPad/iPhone 家庭 Wi-Fi 版）
# 双击此文件即可启动；关闭这个终端窗口就停止服务。
cd "$(dirname "$0")"
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo "==============================================="
echo "  啸啸单词斩 启动中…"
echo ""
echo "  iPad / iPhone 使用方法："
echo "  1. 确保和这台 Mac 连接同一个 Wi-Fi"
echo "  2. 用 Safari 打开:  http://$IP:4174"
echo "  3. 点「分享 → 添加到主屏幕」即可像 App 一样使用"
echo "==============================================="
lsof -tiTCP:4174 -sTCP:LISTEN | xargs kill 2>/dev/null
npm run preview -- --host --port 4174 --strictPort
