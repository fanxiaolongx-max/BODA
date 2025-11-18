# 路径修复验证测试指南

本文档说明如何验证路径修复是否生效。

## 修复内容

1. ✅ **支付截图上传路径** (`routes/user.js`)
   - 修复前：使用相对路径 `'uploads/payments'`
   - 修复后：使用 `DATA_DIR` 绝对路径

2. ✅ **静态文件服务路径** (`server.js`)
   - 修复前：`express.static('public')` 和 `express.static('show')` 使用相对路径
   - 修复后：使用 `path.join(__dirname, 'public')` 和 `path.join(__dirname, 'show')`

3. ✅ **健康检查数据库路径** (`utils/health-check.js`)
   - 修复前：硬编码路径 `path.join(__dirname, '../db/boda.db')`
   - 修复后：使用 `DB_PATH` 从 `db/database.js` 导入

4. ✅ **备份脚本路径** (`scripts/backup.js`)
   - 修复前：使用相对路径
   - 修复后：使用 `DATA_DIR` 和 `DB_PATH`

## 测试步骤

### 测试环境准备

1. **部署到新服务器**（或使用 Docker）
   ```bash
   # 确保工作目录不是项目根目录
   cd /tmp
   # 从其他位置启动服务器
   node /path/to/BODA/server.js
   ```

2. **检查环境变量和目录**
   ```bash
   # 检查 /data 目录是否存在（Fly.io 环境）
   ls -la /data
   
   # 检查当前工作目录
   pwd
   ```

### 测试 1: 支付截图上传和访问

**步骤：**
1. 登录用户端
2. 创建一个订单
3. 关闭点单（管理员操作）
4. 上传支付截图
5. 验证截图可以正常访问

**验证方法：**
```bash
# 1. 检查文件是否保存到正确位置
# 如果 /data 存在，应该在 /data/uploads/payments/
# 否则在项目目录的 uploads/payments/
ls -la /data/uploads/payments/  # Fly.io/Docker
# 或
ls -la /path/to/BODA/uploads/payments/  # 本地

# 2. 检查数据库中存储的路径
# 应该存储为：/uploads/payments/filename.jpg
sqlite3 /data/boda.db "SELECT payment_image FROM orders WHERE payment_image IS NOT NULL LIMIT 1;"

# 3. 通过浏览器访问截图
# 访问：http://your-server:3000/uploads/payments/filename.jpg
# 应该能正常显示图片
```

**预期结果：**
- ✅ 文件保存到 `DATA_DIR/uploads/payments/` 目录
- ✅ 数据库中路径为 `/uploads/payments/filename.jpg`
- ✅ 浏览器可以访问 `http://server:3000/uploads/payments/filename.jpg`

### 测试 2: 产品图片上传和访问

**步骤：**
1. 登录管理员后台
2. 创建或编辑产品
3. 上传产品图片
4. 验证图片可以正常显示

**验证方法：**
```bash
# 1. 检查文件是否保存到正确位置
ls -la /data/uploads/products/  # Fly.io/Docker
# 或
ls -la /path/to/BODA/uploads/products/  # 本地

# 2. 检查数据库中存储的路径
sqlite3 /data/boda.db "SELECT image_url FROM products WHERE image_url IS NOT NULL LIMIT 1;"

# 3. 通过浏览器访问图片
# 访问：http://your-server:3000/uploads/products/filename.jpg
```

**预期结果：**
- ✅ 文件保存到 `DATA_DIR/uploads/products/` 目录
- ✅ 数据库中路径为 `/uploads/products/filename.jpg`
- ✅ 浏览器可以访问图片

### 测试 3: 静态文件服务

**步骤：**
1. 访问用户端首页
2. 访问管理后台
3. 检查首页展示图片

**验证方法：**
```bash
# 1. 检查静态文件是否可以访问
curl -I http://your-server:3000/
curl -I http://your-server:3000/admin.html
curl -I http://your-server:3000/show/image.jpg

# 2. 检查服务器日志，确认没有路径错误
# 应该没有 "ENOENT" 或 "Cannot find module" 错误
```

**预期结果：**
- ✅ 首页正常加载（HTML、CSS、JS）
- ✅ 管理后台正常加载
- ✅ 展示图片正常显示
- ✅ 没有路径相关的错误日志

### 测试 4: 健康检查端点

**步骤：**
1. 访问健康检查端点

**验证方法：**
```bash
# 访问健康检查端点
curl http://your-server:3000/health

# 预期返回 JSON，包含数据库状态
# 应该显示数据库文件大小等信息
```

**预期结果：**
- ✅ 返回 JSON 格式的健康状态
- ✅ 数据库状态为 "healthy"
- ✅ 显示正确的数据库文件大小（使用正确的 DB_PATH）

### 测试 5: 备份脚本

**步骤：**
1. 运行备份脚本

**验证方法：**
```bash
# 1. 运行备份脚本
cd /path/to/BODA
node scripts/backup.js

# 2. 检查备份文件位置
# 如果 /data 存在，应该在 /data/logs/backup/
# 否则在项目目录的 logs/backup/
ls -la /data/logs/backup/  # Fly.io/Docker
# 或
ls -la /path/to/BODA/logs/backup/  # 本地

# 3. 验证备份文件完整性
file /data/logs/backup/boda-backup-*.db
# 应该显示：SQLite database file
```

**预期结果：**
- ✅ 备份文件创建成功
- ✅ 备份文件保存在 `DATA_DIR/logs/backup/` 目录
- ✅ 备份文件是有效的 SQLite 数据库文件

### 测试 6: Docker 环境测试

**步骤：**
1. 构建 Docker 镜像
2. 运行容器（不挂载卷）
3. 测试所有功能

**验证方法：**
```bash
# 1. 构建镜像
docker build -t boda-test .

# 2. 运行容器（数据存储在容器内部）
docker run -d -p 3000:3000 --name boda-test boda-test

# 3. 进入容器检查路径
docker exec -it boda-test sh
ls -la /data/uploads/payments/
ls -la /data/uploads/products/
ls -la /data/logs/

# 4. 测试上传功能
# 在浏览器中上传支付截图和产品图片

# 5. 检查文件是否在容器内的 /data 目录
docker exec boda-test ls -la /data/uploads/payments/
docker exec boda-test ls -la /data/uploads/products/
```

**预期结果：**
- ✅ 所有文件保存在容器内的 `/data` 目录
- ✅ 静态文件服务正常工作
- ✅ 上传的文件可以正常访问

### 测试 7: 不同工作目录测试

**步骤：**
1. 从不同目录启动服务器

**验证方法：**
```bash
# 1. 从项目目录启动（正常情况）
cd /path/to/BODA
node server.js
# 测试功能是否正常

# 2. 从其他目录启动（测试路径修复）
cd /tmp
node /path/to/BODA/server.js
# 测试功能是否正常

# 3. 检查文件是否仍然保存到正确位置
# 无论从哪个目录启动，文件都应该保存到 DATA_DIR
```

**预期结果：**
- ✅ 无论从哪个目录启动，功能都正常
- ✅ 文件保存位置不受工作目录影响
- ✅ 静态文件服务正常工作

## 常见问题排查

### 问题 1: 支付截图无法访问

**检查：**
```bash
# 1. 检查文件是否存在
ls -la /data/uploads/payments/

# 2. 检查文件权限
chmod 644 /data/uploads/payments/*.jpg

# 3. 检查静态文件服务配置
# 确认 server.js 中 /uploads 路由指向 DATA_DIR/uploads
```

### 问题 2: 静态文件 404

**检查：**
```bash
# 1. 检查文件是否存在
ls -la /path/to/BODA/public/
ls -la /path/to/BODA/show/

# 2. 检查服务器日志
# 查看是否有路径相关的错误

# 3. 验证静态文件服务路径
# 确认使用 path.join(__dirname, 'public')
```

### 问题 3: 备份脚本失败

**检查：**
```bash
# 1. 检查数据库文件位置
ls -la /data/boda.db  # Fly.io/Docker
ls -la /path/to/BODA/db/boda.db  # 本地

# 2. 检查备份目录权限
mkdir -p /data/logs/backup
chmod 755 /data/logs/backup

# 3. 验证 DATA_DIR 和 DB_PATH 配置
node -e "const fs = require('fs'); const path = require('path'); const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname); console.log('DATA_DIR:', DATA_DIR);"
```

## 验证清单

完成所有测试后，确认以下项目：

- [ ] 支付截图可以上传并访问
- [ ] 产品图片可以上传并访问
- [ ] 静态文件（HTML、CSS、JS）正常加载
- [ ] 展示图片正常显示
- [ ] 健康检查端点返回正确信息
- [ ] 备份脚本可以正常运行
- [ ] Docker 环境中所有功能正常
- [ ] 从不同目录启动服务器功能正常
- [ ] 没有路径相关的错误日志

## 注意事项

1. **部署前测试**：在部署到生产环境前，务必在测试环境完成所有测试
2. **路径一致性**：确保上传路径和静态文件服务路径使用相同的 `DATA_DIR`
3. **权限问题**：确保应用有权限在 `DATA_DIR` 创建目录和文件
4. **Docker 环境**：如果使用 Docker，确保数据目录正确挂载或使用容器内路径

