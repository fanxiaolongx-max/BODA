#!/bin/bash

# 尝试加载nvm (如果存在)
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    \. "$NVM_DIR/nvm.sh"
    # 使用nvm的默认版本
    nvm use default 2>/dev/null || nvm use node 2>/dev/null || true
fi
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

echo "========================================="
echo "  点单系统 - 启动脚本"
echo "========================================="
echo ""

# 检查Node.js (检查node或nodejs命令)
NODE_CMD=""
if command -v node &> /dev/null; then
    NODE_CMD="node"
elif command -v nodejs &> /dev/null; then
    NODE_CMD="nodejs"
else
    echo "❌ 错误: 未找到Node.js"
    echo ""
    echo "请使用以下命令安装Node.js:"
    echo ""
    echo "方法1 - 使用nvm (推荐，无需sudo):"
    echo "  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
    echo "  export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && \. \"\$NVM_DIR/nvm.sh\""
    echo "  nvm install --lts"
    echo ""
    echo "方法2 - 使用NodeSource (需要sudo):"
    echo "  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    echo ""
    echo "方法3 - 使用Debian官方仓库 (需要sudo):"
    echo "  sudo apt update"
    echo "  sudo apt install -y nodejs npm"
    echo ""
    echo "安装完成后，请重新运行此脚本"
    exit 1
fi

echo "✅ Node.js 版本: $($NODE_CMD --version)"

# 检查npm
NPM_CMD=""
if command -v npm &> /dev/null; then
    NPM_CMD="npm"
else
    echo "❌ 错误: 未找到npm"
    echo "请确保Node.js安装时包含了npm"
    exit 1
fi

echo "✅ npm 版本: $($NPM_CMD --version)"
echo ""

# 检查依赖是否已安装
if [ ! -d "node_modules" ]; then
    echo "📦 正在安装依赖..."
    $NPM_CMD install
    if [ $? -ne 0 ]; then
        echo "❌ 依赖安装失败"
        echo "请查看 INSTALL.md 获取帮助"
        exit 1
    fi
    echo "✅ 依赖安装完成"
    echo ""
fi

# 检查数据库是否存在
if [ ! -f "db/boda.db" ]; then
    echo "🗄️  正在初始化数据库..."
    $NODE_CMD db/init.js
    if [ $? -ne 0 ]; then
        echo "❌ 数据库初始化失败"
        exit 1
    fi
    echo "✅ 数据库初始化完成"
    echo ""
fi

# 启动服务器
echo "🚀 正在启动服务器..."
echo ""
echo "========================================="
echo "  访问地址:"
echo "  用户端: http://localhost:3000"
echo "  管理后台: http://localhost:3000/admin.html"
echo "  默认账号: admin / admin123"
echo "========================================="
echo ""

$NPM_CMD start

