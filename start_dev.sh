#!/bin/bash

# ==========================================
# Health Data Management Site 启动脚本
# 用于 macOS 自动操作 (Automator)
# ==========================================

# 1. 设置项目绝对路径（自动取脚本所在目录）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_PATH="$SCRIPT_DIR"

# 2. 使用 AppleScript 打开终端运行服务
# 这样做的好处是：
# - 可以看到启动日志和错误信息
# - 可以通过关闭终端窗口来停止服务
osascript <<EOF
tell application "Terminal"
    activate
    if not (exists window 1) then reopen
    do script "cd \"$PROJECT_PATH\" && npm run dev"
end tell
EOF

# 3. 等待服务启动 (给予 2 秒缓冲时间)
sleep 2

# 4. 打开浏览器访问本地服务
open "http://127.0.0.1:5173"
