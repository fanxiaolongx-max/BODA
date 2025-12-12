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
# 选项 1：生成 boba.app 证书（推荐，Stripe 域名验证可通过）
mkcert boba.app

# 选项 2：生成 boba.local 证书（仅本地测试）
mkcert boba.local
```

这会生成两个文件：
- `boba.app.pem` / `boba.local.pem` - 证书文件
- `boba.app-key.pem` / `boba.local-key.pem` - 私钥文件

**注意**：系统会优先使用 `boba.app.pem`（如果存在），否则使用 `boba.local.pem`

### 4. 配置环境变量

创建或编辑 `.env.local` 文件（已加入 .gitignore）：

```bash
# 启用本地 HTTPS
USE_LOCAL_HTTPS=true

# 使用标准HTTPS端口443（需要root权限）
USE_STANDARD_HTTPS_PORT=true

# 或者自定义 HTTPS 端口（如果不想使用443）
# HTTPS_PORT=3443
```

### 5. 启动服务器

#### 选项1：使用标准443端口（推荐）

**重要：必须使用 `export` 导出环境变量，然后使用 `sudo -E` 保留环境变量！**

```bash
# 方法1：一行命令（推荐）
export USE_LOCAL_HTTPS=true USE_STANDARD_HTTPS_PORT=true && sudo -E npm start

# 方法2：分步执行
export USE_LOCAL_HTTPS=true
export USE_STANDARD_HTTPS_PORT=true
sudo -E npm start

# 方法3：直接在sudo命令中设置环境变量
sudo -E env USE_LOCAL_HTTPS=true USE_STANDARD_HTTPS_PORT=true npm start
```

**注意：**
- ❌ **错误**：`USE_LOCAL_HTTPS=true sudo npm start` （环境变量不会传递）
- ✅ **正确**：`export USE_LOCAL_HTTPS=true && sudo -E npm start` （环境变量会传递）

服务器会在 `https://localhost` 或 `https://boba.app` 启动（无需指定端口）。

如果看到 "无法绑定443端口" 的警告，说明权限不足，请确保使用 `sudo`。

#### 选项2：使用自定义端口（无需root权限）

```bash
# 设置自定义端口
export HTTPS_PORT=3443
npm start
```

服务器会在 `https://localhost:3443` 启动。

## 环境变量说明

- `USE_LOCAL_HTTPS`: 设置为 `true` 或 `1` 启用本地 HTTPS
- `USE_STANDARD_HTTPS_PORT`: 设置为 `true` 使用标准443端口（需要root权限）
- `HTTPS_PORT`: 可选，自定义 HTTPS 端口号（如果未设置且USE_STANDARD_HTTPS_PORT=false，默认使用3000）
- `NODE_ENV`: 如果设置为 `production`，即使设置了 `USE_LOCAL_HTTPS` 也不会使用本地证书
- `FLY_APP_NAME`: 如果存在（Fly.io 环境），不会使用本地证书

**端口优先级**：
1. 如果设置了 `HTTPS_PORT`，使用该端口
2. 如果设置了 `USE_STANDARD_HTTPS_PORT=true`，使用443端口（需要root权限）
3. 否则使用 `PORT` 环境变量或默认3000端口

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

1. 证书文件路径：
   - 优先使用：`boba.app.pem` 和 `boba.app-key.pem`（Stripe 验证通过）
   - 备选：`boba.local.pem` 和 `boba.local-key.pem`（仅本地测试）
2. 访问地址：
   - 使用443端口：`https://boba.app` 或 `https://localhost`（无需指定端口）
   - 使用自定义端口：`https://boba.app:3443` 或 `https://localhost:3443`
3. 如果证书文件不存在，服务器会自动使用 HTTP 启动
4. 如果443端口绑定失败（权限不足），会自动回退到PORT端口（默认3000）
5. 线上环境（Fly.io）会自动使用 Fly.io 的 HTTPS 证书，无需配置

## 使用443端口的优势

- ✅ 标准HTTPS端口，访问时无需指定端口号
- ✅ 更符合生产环境的访问方式
- ✅ 浏览器地址栏更简洁（`https://localhost` 而不是 `https://localhost:3000`）

## 注意事项

- 443端口需要root权限，macOS/Linux需要使用 `sudo` 运行
- 如果无法绑定443端口，系统会自动回退到PORT端口（默认3000）
- Windows系统可能需要以管理员身份运行

