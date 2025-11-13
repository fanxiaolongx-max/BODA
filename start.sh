#!/bin/bash

echo "========================================="
echo "  博达奶茶点单系统 - 启动脚本"
echo "========================================="
echo ""

# 检查Node.js
if ! command -v node &> /dev/null
then
    echo "❌ 错误: 未找到Node.js"
    echo "请访问 https://nodejs.org/ 下载安装"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"

# 检查npm
if ! command -v npm &> /dev/null
then
    echo "❌ 错误: 未找到npm"
    exit 1
fi

echo "✅ npm 版本: $(npm --version)"
echo ""

# 检查依赖是否已安装
if [ ! -d "node_modules" ]; then
    echo "📦 正在安装依赖..."
    npm install
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
    node db/init.js
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

npm start

