#!/bin/bash

# 检查部署方式脚本
# 用于确定服务器是否使用 Nginx 或 Fly.io

echo "=========================================="
echo "部署方式检查工具"
echo "=========================================="
echo ""

# 检查是否在 Fly.io 环境
if [ -n "$FLY_APP_NAME" ] || [ -d "/data" ] && [ -f "/app/fly.toml" ]; then
    echo "✓ 检测到 Fly.io 部署环境"
    echo "  - FLY_APP_NAME: ${FLY_APP_NAME:-未设置}"
    echo "  - 数据目录: /data"
    echo ""
    echo "结论: 使用 Fly.io 部署，不需要 Nginx 配置"
    echo "      CORS 配置已在 Node.js 应用中设置（server.js）"
    exit 0
fi

# 检查是否安装了 Nginx
if command -v nginx &> /dev/null; then
    echo "✓ 检测到 Nginx 已安装"
    echo ""
    
    # 检查 Nginx 是否运行
    if systemctl is-active --quiet nginx 2>/dev/null || pgrep -x nginx > /dev/null; then
        echo "✓ Nginx 正在运行"
        echo ""
        
        # 检查配置文件
        if [ -f "/etc/nginx/sites-available/bobapro.conf" ] || [ -f "/etc/nginx/sites-available/boda.conf" ]; then
            echo "✓ 找到 Nginx 配置文件"
            echo ""
            echo "请检查配置文件是否包含 CORS 设置："
            echo "  - /etc/nginx/sites-available/bobapro.conf"
            echo "  - /etc/nginx/sites-available/boda.conf"
            echo ""
            echo "如果缺少 CORS 配置，请参考: docs/NGINX_CORS_CONFIG.md"
        else
            echo "⚠ 未找到项目相关的 Nginx 配置文件"
            echo "  可能需要创建配置文件"
        fi
        
        # 检查是否有 /uploads/ 的 location 配置
        echo ""
        echo "检查 Nginx 配置中的 /uploads/ location..."
        if grep -r "location /uploads/" /etc/nginx/sites-enabled/ 2>/dev/null | grep -q "add_header Access-Control"; then
            echo "✓ 找到 /uploads/ 的 CORS 配置"
        else
            echo "⚠ 未找到 /uploads/ 的 CORS 配置"
            echo "  需要添加 CORS 配置，参考: docs/NGINX_CORS_CONFIG.md"
        fi
    else
        echo "⚠ Nginx 已安装但未运行"
        echo "  如果使用 Nginx，请启动: sudo systemctl start nginx"
    fi
else
    echo "⚠ 未检测到 Nginx"
    echo ""
    echo "可能的情况："
    echo "  1. 使用 Fly.io 部署（不需要 Nginx）"
    echo "  2. 直接运行 Node.js（不使用反向代理）"
    echo "  3. 使用其他反向代理（如 Caddy、Traefik）"
fi

echo ""
echo "=========================================="
echo "检查完成"
echo "=========================================="
