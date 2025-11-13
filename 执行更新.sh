#!/bin/bash

echo "========================================="
echo "  Neferdidi 奶茶系统 - 界面升级"
echo "========================================="
echo ""

cd /Volumes/512G/06-工具开发/BODA

echo "📦 步骤 1/5: 迁移products表..."
node db/migrate-products.js
if [ $? -ne 0 ]; then
    echo "❌ 迁移products表失败"
    exit 1
fi
echo ""

echo "📦 步骤 2/5: 迁移order_items表..."
node db/migrate-order-items.js
if [ $? -ne 0 ]; then
    echo "❌ 迁移order_items表失败"
    exit 1
fi
echo ""

echo "🗑️  步骤 3/5: 备份并重置数据库..."
if [ -f "db/boda.db" ]; then
    cp db/boda.db db/boda.db.backup.$(date +%Y%m%d_%H%M%S)
    echo "✅ 已备份旧数据库"
fi
rm -f db/boda.db db/boda.db-shm db/boda.db-wal
echo ""

echo "🔧 步骤 4/5: 初始化数据库..."
node db/init.js
if [ $? -ne 0 ]; then
    echo "❌ 初始化失败"
    exit 1
fi
echo ""

echo "🍹 步骤 5/5: 导入Neferdidi菜单..."
node db/update-menu-v2.js
if [ $? -ne 0 ]; then
    echo "❌ 更新菜单失败"
    exit 1
fi
echo ""

echo "========================================="
echo "  ✅ 更新完成！"
echo "========================================="
echo ""
echo "📱 新功能："
echo "  ✅ 左右分栏布局"
echo "  ✅ 左侧分类导航"
echo "  ✅ 商品横向展示"
echo "  ✅ 杯型/甜度/加料选择"
echo "  ✅ 底部购物车栏"
echo "  ✅ 底部导航栏（首页/点单/订单/我的）"
echo "  ✅ 货币单位：EGP"
echo ""
echo "🚀 现在请启动服务器："
echo "   npm start"
echo ""
echo "🌐 访问地址："
echo "   用户端: http://localhost:3000"
echo "   管理后台: http://localhost:3000/admin.html"
echo ""
echo "🔑 管理员账号："
echo "   用户名: admin"
echo "   密码: admin123"
echo ""
echo "========================================="

