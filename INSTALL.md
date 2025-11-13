# 安装指南

## 系统要求

- Node.js 14.0 或更高版本
- npm 6.0 或更高版本

## 安装步骤

### 1. 检查Node.js和npm是否已安装

```bash
node --version
npm --version
```

如果没有安装，请访问 https://nodejs.org/ 下载安装。

### 2. 进入项目目录

```bash
cd /Volumes/512G/06-工具开发/BODA
```

### 3. 安装依赖

```bash
npm install
```

这将安装以下依赖包：
- express - Web框架
- sqlite3 - 数据库
- bcryptjs - 密码加密
- express-session - Session管理
- express-rate-limit - 限流
- winston - 日志
- helmet - 安全
- express-validator - 验证
- multer - 文件上传
- cors - 跨域
- uuid - UUID生成
- jsbarcode - 条形码
- canvas - 画布

### 4. 初始化数据库

```bash
node db/init.js
```

这将创建数据库并插入默认数据：
- 默认管理员账号: admin / admin123
- 默认菜单分类和商品
- 默认折扣规则

### 5. 启动服务器

开发模式（自动重启）：
```bash
npm run dev
```

生产模式：
```bash
npm start
```

### 6. 访问系统

启动成功后，在浏览器中访问：
- 用户端: http://localhost:3000
- 管理后台: http://localhost:3000/admin.html

## 常见问题

### 1. sqlite3 安装失败

sqlite3 是一个本地模块，需要编译。如果安装失败：

#### macOS
```bash
# 安装 Xcode Command Line Tools
xcode-select --install

# 然后重新安装
npm install sqlite3 --build-from-source
```

#### Windows
```bash
# 安装 windows-build-tools
npm install --global windows-build-tools

# 然后重新安装
npm install sqlite3 --build-from-source
```

#### Linux
```bash
# Ubuntu/Debian
sudo apt-get install build-essential

# CentOS/RHEL
sudo yum groupinstall "Development Tools"

# 然后重新安装
npm install sqlite3 --build-from-source
```

### 2. canvas 安装失败

canvas 也需要本地编译。如果安装失败：

#### macOS
```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg
npm install canvas
```

#### Ubuntu/Debian
```bash
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
npm install canvas
```

#### Windows
```bash
# 下载预编译包
npm install canvas --canvas_binary_host_mirror=https://github.com/Automattic/node-canvas/releases/download/
```

### 3. 端口被占用

如果3000端口被占用，可以修改端口：

```bash
PORT=3001 npm start
```

或者创建 `.env` 文件：
```
PORT=3001
```

### 4. 权限问题

如果遇到权限错误：

```bash
# macOS/Linux
sudo chown -R $USER:$USER /Volumes/512G/06-工具开发/BODA

# 或者使用不同的目录
mkdir ~/boda
cp -r /Volumes/512G/06-工具开发/BODA/* ~/boda/
cd ~/boda
npm install
```

## 快速测试

安装完成后，运行以下命令测试：

```bash
# 测试数据库连接
node -e "const db = require('./db/database'); console.log('数据库连接成功');"

# 测试服务器启动
npm start
```

## 卸载

如果需要完全卸载：

```bash
# 删除依赖
rm -rf node_modules

# 删除数据库
rm db/boda.db

# 删除日志
rm -rf logs

# 删除上传文件
rm -rf uploads/products/* uploads/payments/*
```

## 技术支持

如果以上方法都无法解决问题，请：
1. 检查 Node.js 版本是否满足要求
2. 尝试使用 `npm cache clean --force` 清理缓存
3. 删除 `node_modules` 和 `package-lock.json` 后重新安装
4. 查看日志文件获取更多错误信息

