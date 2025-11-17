#!/bin/bash

# Docker 测试脚本
# 用于快速测试 Docker 镜像构建和运行

set -e

echo "========================================="
echo "  BOBA TEA Docker 测试脚本"
echo "========================================="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查 Docker 是否安装
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ 错误: 未找到 Docker${NC}"
    echo "请访问 https://docs.docker.com/get-docker/ 安装 Docker"
    exit 1
fi

echo -e "${GREEN}✅ Docker 已安装${NC}"
echo ""

# 数据存储在容器内部，不需要创建外部目录
echo "ℹ️  数据将存储在容器内部"
echo ""

# 构建镜像
echo "🔨 构建 Docker 镜像..."
if docker build -t boda-ordering-system:test .; then
    echo -e "${GREEN}✅ 镜像构建成功${NC}"
else
    echo -e "${RED}❌ 镜像构建失败${NC}"
    exit 1
fi
echo ""

# 停止并删除旧容器（如果存在）
echo "🧹 清理旧容器..."
docker stop boda-test 2>/dev/null || true
docker rm boda-test 2>/dev/null || true
echo -e "${GREEN}✅ 清理完成${NC}"
echo ""

# 运行容器
echo "🚀 启动容器..."
if docker run -d \
    --name boda-test \
    -p 3000:3000 \
    boda-ordering-system:test; then
    echo -e "${GREEN}✅ 容器启动成功${NC}"
else
    echo -e "${RED}❌ 容器启动失败${NC}"
    exit 1
fi
echo ""

# 等待服务启动
echo "⏳ 等待服务启动（10秒）..."
sleep 10

# 检查容器状态
echo "📊 检查容器状态..."
if docker ps | grep -q boda-test; then
    echo -e "${GREEN}✅ 容器正在运行${NC}"
else
    echo -e "${RED}❌ 容器未运行${NC}"
    echo "查看日志:"
    docker logs boda-test
    exit 1
fi
echo ""

# 检查健康状态
echo "🏥 检查健康状态..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 健康检查通过${NC}"
else
    echo -e "${YELLOW}⚠️  健康检查失败，但容器可能仍在启动中${NC}"
fi
echo ""

# 显示访问信息
echo "========================================="
echo -e "${GREEN}✅ 测试完成！${NC}"
echo "========================================="
echo ""
echo "访问地址:"
echo "  - 用户端: http://localhost:3000"
echo "  - 管理后台: http://localhost:3000/admin.html"
echo "  - 默认账号: admin / admin123"
echo ""
echo "查看日志:"
echo "  docker logs -f boda-test"
echo ""
echo "停止容器:"
echo "  docker stop boda-test"
echo ""
echo "删除容器:"
echo "  docker rm boda-test"
echo ""

