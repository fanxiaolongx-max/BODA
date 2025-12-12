# Nginx CORS 配置指南

## 问题说明

如果您的服务器使用 Nginx 作为反向代理，**必须在 Nginx 层面配置 CORS 响应头**，否则小程序无法正常访问图片资源。

即使 Node.js 应用已经设置了 CORS 头，Nginx 作为反向代理可能会：
1. 覆盖或移除后端设置的 CORS 头
2. 不传递 CORS 头到客户端
3. 阻止 OPTIONS 预检请求

## 解决方案

### 1. 完整的 Nginx 配置（推荐）

在您的 Nginx 配置文件中（如 `/etc/nginx/sites-available/bobapro.conf`），添加以下配置：

```nginx
server {
    listen 80;
    listen 443 ssl;
    server_name bobapro.life www.bobapro.life;

    # SSL 配置（如果有证书）
    # ssl_certificate /path/to/cert.pem;
    # ssl_certificate_key /path/to/key.pem;

    # 增加上传文件大小限制
    client_max_body_size 10M;

    # ==================== 图片上传目录 CORS 配置 ====================
    # 这是关键配置：为 /uploads/ 路径添加 CORS 支持
    location /uploads/ {
        # 代理到 Node.js 应用
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # ========== CORS 响应头配置（小程序必需） ==========
        # 允许所有来源（小程序需要）
        add_header Access-Control-Allow-Origin * always;
        
        # 允许的方法
        add_header Access-Control-Allow-Methods 'GET, HEAD, OPTIONS' always;
        
        # 允许所有请求头
        add_header Access-Control-Allow-Headers '*' always;

        # 处理 OPTIONS 预检请求（小程序会发送）
        if ($request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin * always;
            add_header Access-Control-Allow-Methods 'GET, HEAD, OPTIONS' always;
            add_header Access-Control-Allow-Headers '*' always;
            add_header Access-Control-Max-Age 1728000;
            add_header Content-Type 'text/plain; charset=utf-8';
            add_header Content-Length 0;
            return 204;
        }
    }

    # ==================== show 目录 CORS 配置 ====================
    location /show/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # CORS 响应头
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods 'GET, HEAD, OPTIONS' always;
        add_header Access-Control-Allow-Headers '*' always;

        if ($request_method = 'OPTIONS') {
            add_header Access-Control-Allow-Origin * always;
            add_header Access-Control-Allow-Methods 'GET, HEAD, OPTIONS' always;
            add_header Access-Control-Allow-Headers '*' always;
            add_header Access-Control-Max-Age 1728000;
            add_header Content-Type 'text/plain; charset=utf-8';
            add_header Content-Length 0;
            return 204;
        }
    }

    # ==================== 其他路径（默认配置） ====================
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 2. 关键配置说明

#### `always` 关键字的重要性

```nginx
add_header Access-Control-Allow-Origin * always;
```

**必须使用 `always` 关键字**，否则：
- 当响应状态码为 2xx 或 3xx 时，CORS 头才会被添加
- 对于 4xx 或 5xx 错误响应，CORS 头不会被添加
- 小程序可能无法看到错误信息

#### OPTIONS 预检请求处理

小程序在跨域请求前会发送 OPTIONS 预检请求，必须正确处理：

```nginx
if ($request_method = 'OPTIONS') {
    # 返回 204 No Content，不返回响应体
    return 204;
}
```

### 3. 应用配置

保存配置文件后，执行以下命令：

```bash
# 1. 测试配置文件语法
sudo nginx -t

# 2. 重新加载 Nginx 配置（平滑重启，不中断服务）
sudo systemctl reload nginx

# 或者使用
sudo nginx -s reload
```

### 4. 验证配置

#### 方法 1：使用 curl 测试

```bash
# 测试 OPTIONS 预检请求
curl -X OPTIONS \
  -H "Origin: https://servicewechat.com" \
  -H "Access-Control-Request-Method: GET" \
  -v https://bobapro.life/uploads/custom-api-images/test.jpg

# 应该看到以下响应头：
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Methods: GET, HEAD, OPTIONS
# Access-Control-Allow-Headers: *

# 测试 GET 请求
curl -H "Origin: https://servicewechat.com" \
  -v https://bobapro.life/uploads/custom-api-images/test.jpg
```

#### 方法 2：浏览器开发者工具

1. 打开浏览器开发者工具（F12）
2. 切换到 Network（网络）标签
3. 访问图片 URL：`https://bobapro.life/uploads/custom-api-images/xxx.jpg`
4. 查看响应头，应该包含：
   - `Access-Control-Allow-Origin: *`
   - `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`
   - `Access-Control-Allow-Headers: *`

### 5. 常见问题排查

#### 问题 1：CORS 头没有出现

**可能原因：**
- 没有使用 `always` 关键字
- Nginx 配置没有生效（需要 reload）
- 配置位置错误（应该在 `location /uploads/` 块内）

**解决方法：**
```bash
# 检查 Nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# 检查配置语法
sudo nginx -t

# 重新加载配置
sudo systemctl reload nginx
```

#### 问题 2：OPTIONS 请求返回 405

**可能原因：**
- 没有正确处理 OPTIONS 请求
- `if` 语句位置错误

**解决方法：**
确保 `if ($request_method = 'OPTIONS')` 块在 `location` 块内，并且使用 `return 204;` 而不是 `return 200;`

#### 问题 3：小程序仍然无法访问

**可能原因：**
- Nginx 缓存了旧配置
- 小程序缓存了失败的响应

**解决方法：**
```bash
# 清除 Nginx 缓存（如果有）
sudo rm -rf /var/cache/nginx/*

# 重启 Nginx（如果 reload 无效）
sudo systemctl restart nginx
```

### 6. Fly.io 部署说明

如果您使用 **Fly.io** 部署，Fly.io 使用自己的 HTTP 服务，**不需要 Nginx 配置**。

Fly.io 会自动处理 HTTPS 和反向代理，Node.js 应用设置的 CORS 头会直接传递给客户端。

如果 Fly.io 部署后仍有 CORS 问题，请检查：
1. Node.js 应用的 CORS 配置（`server.js` 中的 `staticWithCORS`）
2. Fly.io 的 HTTP 服务配置（`fly.toml`）

### 7. 安全考虑

#### 生产环境建议

如果您的图片资源需要更严格的安全控制，可以：

1. **限制允许的来源**（而不是使用 `*`）：
```nginx
# 只允许特定域名
add_header Access-Control-Allow-Origin https://servicewechat.com always;
```

2. **添加缓存控制**：
```nginx
location /uploads/ {
    # ... 其他配置 ...
    
    # 图片缓存 30 天
    expires 30d;
    add_header Cache-Control "public, immutable";
}
```

3. **限制文件大小**：
```nginx
# 限制请求体大小（已在 server 块配置）
client_max_body_size 10M;
```

## 总结

**关键点：**
1. ✅ 必须在 Nginx 配置中添加 CORS 头
2. ✅ 使用 `always` 关键字确保所有响应都包含 CORS 头
3. ✅ 正确处理 OPTIONS 预检请求
4. ✅ 配置后必须 reload Nginx 使配置生效
5. ✅ Fly.io 部署不需要 Nginx 配置

配置完成后，小程序应该可以正常访问图片资源了！
