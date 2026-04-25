#!/bin/bash

# ==========================================
# Health Data Management Site 启动脚本
# 兼容 macOS 和 Linux
# ==========================================

# 1. 设置项目绝对路径（自动取脚本所在目录）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_PATH="$SCRIPT_DIR"

# 2. 检测操作系统并启动服务
detect_os() {
    case "$(uname -s)" in
        Darwin*)  echo "macos" ;;
        Linux*)   echo "linux" ;;
        *)        echo "unknown" ;;
    esac
}

OS_TYPE=$(detect_os)

if [ "$OS_TYPE" = "macos" ]; then
    # macOS: 使用 AppleScript 打开终端运行服务（可看日志，关闭终端即停止）
    osascript <<EOF
tell application "Terminal"
    activate
    if not (exists window 1) then reopen
    do script "cd \"$PROJECT_PATH\" && npm run dev"
end tell
EOF

    # 等待服务启动 (给予 2 秒缓冲时间)
    sleep 2

    # 打开浏览器访问本地服务
    open "http://127.0.0.1:5173"

elif [ "$OS_TYPE" = "linux" ]; then
    echo "=========================================="
    echo "  Health Data Management Site - 启动中"
    echo "  项目路径: $PROJECT_PATH"
    echo "  访问地址: http://127.0.0.1:5173"
    echo "=========================================="
    echo ""

    # 直接在前台运行 dev server
    cd "$PROJECT_PATH" && npm run dev

    echo ""
    echo "=========================================="
    echo "  服务已停止"
    echo "=========================================="
else
    echo "错误: 不支持的操作系统 $(uname -s)"
    echo "请手动运行: cd '$PROJECT_PATH' && npm run dev"
    exit 1
fi
