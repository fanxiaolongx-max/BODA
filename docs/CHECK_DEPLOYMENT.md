# 如何检查是否使用 Nginx

## 快速检查方法

### 方法 1：检查 Fly.io 部署（推荐）

如果您使用 **Fly.io** 部署，**不需要 Nginx**。

检查方法：
```bash
# 检查环境变量
echo $FLY_APP_NAME

# 或检查文件
ls -la /data
ls -la /app/fly.toml
```

**如果看到 Fly.io 相关文件或环境变量，说明使用 Fly.io 部署，不需要 Nginx 配置。**

### 方法 2：检查 Nginx 是否安装和运行

```bash
# 检查 Nginx 是否安装
which nginx
nginx -v

# 检查 Nginx 是否运行
systemctl status nginx
# 或
ps aux | grep nginx
```

### 方法 3：使用检查脚本

运行项目提供的检查脚本：

```bash
./scripts/check-deployment.sh
```

## 根据部署方式判断

### 情况 1：Fly.io 部署 ✅

**特征：**
- 有 `fly.toml` 配置文件
- 使用 `flyctl deploy` 部署
- 环境变量中有 `FLY_APP_NAME`
- 数据存储在 `/data` 目录

**结论：**
- ✅ **不需要 Nginx**
- ✅ CORS 配置已在 `server.js` 中设置
- ✅ Fly.io 会自动处理 HTTPS 和反向代理

### 情况 2：自托管服务器 + Nginx

**特征：**
- 有自己的 Linux 服务器（VPS）
- 使用 PM2 运行 Node.js
- 安装了 Nginx
- 有 `/etc/nginx/sites-available/` 配置文件

**结论：**
- ⚠️ **需要配置 Nginx CORS**
- 参考：[Nginx CORS 配置指南](./NGINX_CORS_CONFIG.md)

### 情况 3：直接运行 Node.js（无反向代理）

**特征：**
- 直接运行 `node server.js` 或使用 PM2
- 没有安装 Nginx
- 直接访问 Node.js 端口（如 3000）

**结论：**
- ✅ **不需要 Nginx**
- ✅ CORS 配置已在 `server.js` 中设置

## 检查 Nginx 配置中的 CORS

如果使用 Nginx，检查配置文件中是否有 CORS 设置：

```bash
# 查看配置文件
sudo cat /etc/nginx/sites-available/bobapro.conf | grep -A 20 "location /uploads/"

# 或
sudo cat /etc/nginx/sites-enabled/bobapro.conf | grep -A 20 "location /uploads/"
```

**应该看到：**
```nginx
location /uploads/ {
    # ... 代理配置 ...
    
    # CORS 响应头
    add_header Access-Control-Allow-Origin * always;
    add_header Access-Control-Allow-Methods 'GET, HEAD, OPTIONS' always;
    add_header Access-Control-Allow-Headers '*' always;
    
    # OPTIONS 预检请求处理
    if ($request_method = 'OPTIONS') {
        # ...
    }
}
```

## 根据您的项目判断

根据项目文件分析：

1. **有 `fly.toml` 文件** → 使用 Fly.io 部署
2. **有 `.github/workflows/fly-deploy.yml`** → 使用 GitHub Actions 自动部署到 Fly.io
3. **文档中提到 Nginx** → 仅适用于自托管服务器

**结论：您的项目主要使用 Fly.io 部署，不需要 Nginx 配置。**

## 如果仍有 CORS 问题

即使使用 Fly.io，如果小程序仍无法访问图片，请检查：

1. **Node.js 应用的 CORS 配置**（`server.js`）
   - 已配置 `staticWithCORS` 中间件
   - 已设置正确的 CORS 响应头

2. **Fly.io HTTP 服务配置**（`fly.toml`）
   - `force_https = true` 已设置
   - `internal_port = 3000` 正确

3. **测试 CORS 配置**
   ```bash
   curl -X OPTIONS -H "Origin: https://servicewechat.com" \
     -v https://your-domain.fly.dev/uploads/custom-api-images/test.jpg
   ```

## 总结

| 部署方式 | 是否需要 Nginx | CORS 配置位置 |
|---------|---------------|--------------|
| Fly.io | ❌ 不需要 | `server.js` |
| 自托管 + Nginx | ✅ 需要 | Nginx 配置文件 |
| 直接运行 Node.js | ❌ 不需要 | `server.js` |
