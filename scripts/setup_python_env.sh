#!/bin/bash
# Python 虚拟环境设置脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV_PATH="$PROJECT_ROOT/venv"

echo "========================================="
echo "Python 虚拟环境设置"
echo "========================================="
echo "项目目录: $PROJECT_ROOT"
echo "虚拟环境路径: $VENV_PATH"
echo ""

# 检查 Python 是否安装
if ! command -v python3 &> /dev/null; then
    echo "错误: 未找到 python3，请先安装 Python 3"
    exit 1
fi

echo "Python 版本: $(python3 --version)"
echo ""

# 创建虚拟环境
if [ ! -d "$VENV_PATH" ]; then
    echo "创建虚拟环境..."
    python3 -m venv "$VENV_PATH"
    echo "✓ 虚拟环境创建成功"
else
    echo "虚拟环境已存在，跳过创建"
fi

# 激活虚拟环境
echo ""
echo "激活虚拟环境..."
source "$VENV_PATH/bin/activate"

# 升级 pip
echo ""
echo "升级 pip..."
pip install --upgrade pip

# 安装依赖
if [ -f "$PROJECT_ROOT/requirements.txt" ]; then
    echo ""
    echo "安装依赖包..."
    pip install -r "$PROJECT_ROOT/requirements.txt"
    echo "✓ 依赖安装完成"
else
    echo ""
    echo "未找到 requirements.txt，跳过依赖安装"
fi

echo ""
echo "========================================="
echo "设置完成！"
echo "========================================="
echo ""
echo "激活虚拟环境:"
echo "  source $VENV_PATH/bin/activate"
echo ""
echo "使用 PM2 启动:"
echo "  pm2 start ecosystem.config.js --only boda-python-worker"
echo ""
