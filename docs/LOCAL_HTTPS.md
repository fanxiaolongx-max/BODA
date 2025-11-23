# 本地 HTTPS 配置说明

## 概述

本项目支持在本地开发环境使用 mkcert 生成的 HTTPS 证书，通过环境变量控制，完全不影响线上环境。

## 配置步骤

### 1. 安装 mkcert（如果还没有）

```bash
# macOS
brew install mkcert

# Linux
# 参考 https://github.com/FiloSottile/mkcert#linux
```

### 2. 安装本地 CA

```bash
mkcert -install
```

### 3. 生成证书

在项目根目录运行：

```bash
mkcert boba.local
```

这会生成两个文件：
- `boba.local.pem` - 证书文件
- `boba.local-key.pem` - 私钥文件

### 4. 配置环境变量

创建或编辑 `.env.local` 文件（已加入 .gitignore）：

```bash
# 启用本地 HTTPS
USE_LOCAL_HTTPS=true

# 可选：自定义 HTTPS 端口（默认 3443）
HTTPS_PORT=3443
```

### 5. 启动服务器

```bash
npm start
```

服务器会在 `https://localhost:3443` 启动（或你指定的端口）。

## 环境变量说明

- `USE_LOCAL_HTTPS`: 设置为 `true` 或 `1` 启用本地 HTTPS
- `HTTPS_PORT`: 可选，HTTPS 端口号（默认 3443）
- `NODE_ENV`: 如果设置为 `production`，即使设置了 `USE_LOCAL_HTTPS` 也不会使用本地证书
- `FLY_APP_NAME`: 如果存在（Fly.io 环境），不会使用本地证书

## 安全说明

1. **证书文件已加入 .gitignore**：`*.pem` 和 `*.key` 文件不会被提交到仓库
2. **仅本地环境生效**：生产环境（Fly.io）不会加载本地证书
3. **自动回退**：如果证书文件不存在，会自动回退到 HTTP

## 使用场景

- ✅ 本地开发测试 Stripe 支付（需要 HTTPS）
- ✅ 测试 Service Worker
- ✅ 测试需要 HTTPS 的功能
- ✅ 不影响线上环境部署

## 注意事项

1. 证书文件路径：项目根目录下的 `boba.local.pem` 和 `boba.local-key.pem`
2. 访问地址：`https://boba.local:3443` 或 `https://localhost:3443`
3. 如果证书文件不存在，服务器会自动使用 HTTP 启动
4. 线上环境（Fly.io）会自动使用 Fly.io 的 HTTPS 证书，无需配置

