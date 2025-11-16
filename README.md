# BOBA TEA 点单系统

一个功能完善的奶茶店在线点单系统，支持管理员后台管理和用户点单功能，按照准商用标准设计开发。

## 📋 目录

- [快速开始](#快速开始)
- [主要功能](#主要功能)
- [技术栈](#技术栈)
- [安装部署](#安装部署)
- [使用指南](#使用指南)
- [API文档](#api文档)
- [安全特性](#安全特性)
- [性能优化](#性能优化)
- [监控和日志](#监控和日志)
- [测试](#测试)
- [故障排查](#故障排查)
- [更新日志](#更新日志)
- [架构文档](#架构文档)

## 🚀 快速开始

### 方法1：使用启动脚本（推荐）

```bash
./start.sh
```

### 方法2：手动启动

```bash
# 1. 安装依赖
npm install

# 2. 初始化数据库
node db/init.js

# 3. 启动服务器
npm start
```

### 访问系统

启动成功后，在浏览器中访问：

- **用户端**: http://localhost:3000
- **管理后台**: http://localhost:3000/admin.html

### 默认账号

**管理员账号**:
- 用户名: `admin`
- 密码: `admin123`

⚠️ **重要：首次登录后请立即修改默认密码！**

**用户端**: 使用手机号登录，无需密码（支持国际手机号格式）

## ✨ 主要功能

### 👥 用户端功能

- 📱 **手机号快速登录** - 无需密码，支持国际手机号格式（8-15位）
- 🏠 **首页展示** - 新品图片滚动展示
- 🛒 **在线浏览菜单** - 支持分类筛选，实时价格计算
- 🍹 **产品定制** - 支持选择杯型、甜度、加料、冰度
- 📝 **购物车管理** - 添加、修改、删除商品
- 💰 **订单管理** - 创建订单、查看订单、上传付款截图
- 📊 **折扣查看** - 实时查看当前周期订单总额和折扣信息
- 📸 **付款截图上传** - 支持图片预览、缩放、拖拽查看

### 🔐 管理员功能

- 🔑 **安全登录认证** - 账号密码登录，支持角色管理（super_admin / admin）
- 📊 **数据概览仪表盘** - 实时统计订单、金额、折扣等信息
- 🍹 **菜单管理** - 完整的CRUD操作，支持图片上传
  - 支持多杯型价格设置
  - 支持甜度选项配置
  - 支持可选加料配置
  - 支持冰度选项配置
- 📂 **分类管理** - 创建、编辑、删除分类，支持排序
- 💵 **折扣规则管理** - 自由设置折扣梯度，自动计算折扣
- 📋 **订单管理** - 查看、筛选、更新订单状态，查看付款截图
  - 支持按周期筛选
  - 支持按状态筛选
  - 自动归档旧周期订单
- 👤 **用户管理** - 查看用户列表和统计信息
- 🔐 **管理员管理** - 只有super_admin可以管理其他管理员
- 📝 **操作日志** - 详细记录所有操作，支持查询和筛选
- ⚙️ **系统设置** - 点单开关、商店名称、货币符号等配置
- 🔧 **开发者工具** - 只有super_admin可以访问，支持数据库表CRUD操作
- ℹ️ **关于页面** - 系统说明和版本信息

## 🛡️ 准商用特性

### 安全性

- ✅ **密码加密存储**（bcrypt，强度10）
- ✅ **Session会话管理**（HttpOnly Cookie，24小时过期，SameSite保护）
- ✅ **请求频率限制**（API: 500次/15分钟，登录: 5次/15分钟）
- ✅ **SQL注入防护**（参数化查询，避免字符串拼接）
- ✅ **XSS攻击防护**（Helmet安全头，CSP策略）
- ✅ **输入验证**（express-validator，所有用户输入验证）
- ✅ **CORS跨域配置**（开发环境宽松，生产环境白名单）
- ✅ **文件上传安全限制**（类型、大小验证）
- ✅ **角色权限控制**（super_admin / admin，细粒度权限）
- ✅ **点击劫持防护**（X-Frame-Options: DENY）
- ✅ **MIME类型嗅探防护**（X-Content-Type-Options: nosniff）
- ✅ **HSTS**（HTTP严格传输安全，1年有效期）
- ✅ **安全响应头**（隐藏X-Powered-By，DNS预取控制）

### 数据库

- ✅ SQLite数据库（轻量高效）
- ✅ 完整的关系模型设计（9张表）
- ✅ 事务支持（ACID特性）
- ✅ 索引优化
- ✅ 外键约束
- ✅ WAL模式（提高并发性能）
- ✅ 数据完整性保护
- ✅ 自动归档旧周期数据

### 日志系统

- ✅ Winston日志框架
- ✅ 操作日志（记录所有管理员操作到数据库）
- ✅ 错误日志（文件存储）
- ✅ 访问日志
- ✅ 日志文件自动轮转（按天）
- ✅ 日志查询功能（管理后台）

### 用户体验

- ✅ 响应式设计（支持手机、平板、电脑）
- ✅ 现代化UI（Tailwind CSS）
- ✅ 流畅的动画效果
- ✅ 友好的错误提示
- ✅ 实时数据更新
- ✅ 多语言支持（英文界面）
- ✅ 动态商店名称和货币符号

## 📦 技术栈

### 后端

- **Node.js** + **Express** - Web框架
- **SQLite3** - 数据库
- **bcryptjs** - 密码加密
- **express-session** - 会话管理
- **express-rate-limit** - 请求限流
- **winston** - 日志框架
- **helmet** - 安全头设置
- **express-validator** - 输入验证
- **multer** - 文件上传
- **uuid** - UUID生成

### 前端

- **原生JavaScript** - 无框架依赖
- **Tailwind CSS** - 样式框架
- **响应式设计** - 移动端适配

## 📁 项目结构

```
BODA/
├── db/                      # 数据库相关
│   ├── database.js         # 数据库连接和操作
│   ├── init.js            # 数据库初始化
│   └── boda.db            # SQLite数据库文件
├── middleware/             # 中间件
│   ├── auth.js            # 认证中间件
│   └── validation.js      # 验证中间件
├── routes/                 # 路由
│   ├── auth.js            # 认证路由
│   ├── admin.js           # 管理员路由
│   ├── user.js            # 用户路由
│   └── public.js          # 公开路由
├── utils/                  # 工具函数
│   ├── logger.js          # 日志工具
│   └── scheduler.js       # 定时任务（已禁用）
├── public/                 # 前端文件
│   ├── index.html         # 用户端页面
│   ├── app.js             # 用户端脚本
│   ├── admin.html         # 管理端页面
│   ├── admin.js           # 管理端脚本
│   └── i18n.js            # 国际化配置
├── uploads/                # 上传文件目录
│   ├── products/          # 菜品图片
│   └── payments/          # 付款截图
├── logs/                   # 日志文件
│   ├── error.log          # 错误日志
│   ├── combined.log       # 综合日志
│   └── export/            # 归档的订单CSV
├── show/                   # 首页展示图片
├── server.js              # 主服务器文件
├── package.json           # 依赖配置
├── start.sh               # 启动脚本
└── README.md              # 说明文档
```

## 🔧 安装部署

### 系统要求

- Node.js 14.0 或更高版本
- npm 6.0 或更高版本
- 操作系统: Linux / macOS / Windows

### 安装步骤

#### 1. 检查Node.js和npm

```bash
node --version
npm --version
```

如果没有安装，请访问 https://nodejs.org/ 下载安装。

#### 2. 安装依赖

```bash
npm install
```

#### 3. 初始化数据库

```bash
node db/init.js
```

这将创建数据库并插入默认数据：
- 默认管理员账号: admin / admin123
- 默认菜单分类和商品
- 默认折扣规则

#### 4. 启动服务器

**开发模式**（自动重启）：
```bash
npm run dev
```

**生产模式**：
```bash
npm start
```

### 生产环境部署

#### 使用PM2管理进程（推荐）

```bash
# 安装PM2
npm install -g pm2

# 启动应用
pm2 start server.js --name boda

# 设置开机自启
pm2 startup
pm2 save

# 查看日志
pm2 logs boda
```

#### 使用Nginx反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

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

#### 数据备份

建议设置定期备份脚本：

```bash
#!/bin/bash
# backup.sh
BACKUP_DIR="/var/backups/boda"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
cp /path/to/boda/db/boda.db $BACKUP_DIR/boda_$DATE.db
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /path/to/boda/uploads
```

设置定时任务（每天凌晨2点）：
```bash
0 2 * * * /path/to/backup.sh
```

## 📖 使用指南

### 管理员操作流程

1. **登录管理后台** - 使用admin账号登录
2. **设置菜单分类** - 在"分类管理"中创建分类
3. **添加菜品** - 在"菜单管理"中添加菜品，可上传图片
4. **配置折扣规则** - 在"折扣管理"中设置折扣梯度
5. **系统设置** - 设置商店名称、货币符号等
6. **开放点单** - 点击"开放点单"按钮
7. **监控订单** - 在"订单管理"中查看订单
8. **关闭点单** - 点击"关闭点单"（自动计算折扣）
9. **审核付款** - 查看付款截图，更新订单状态
10. **标记完成** - 将订单状态更新为"已完成"

### 用户操作流程

1. **输入手机号登录** - 无需密码，支持国际格式
2. **浏览菜单** - 在首页或菜单页浏览商品
3. **选择商品** - 点击商品，选择杯型、甜度、加料、冰度
4. **加入购物车** - 添加到购物车
5. **提交订单** - 确认订单信息后提交
6. **等待点单关闭** - 等待管理员关闭点单
7. **查看折扣** - 查看折扣后的最终价格
8. **上传付款截图** - 上传付款凭证
9. **等待完成** - 等待管理员确认订单完成

### 权限说明

- **super_admin**: 拥有所有权限，包括：
  - 管理其他管理员（增删改）
  - 访问开发者工具
  - 所有普通admin的权限

- **admin**: 拥有管理权限，包括：
  - 菜单管理
  - 订单管理
  - 用户管理
  - 系统设置
  - 但不能管理其他管理员和访问开发者工具

## 📡 API文档

### 基础信息

- **Base URL**: `http://localhost:3000/api`
- **认证方式**: Session Cookie
- **内容类型**: `application/json` 或 `multipart/form-data`

### 主要接口

#### 认证接口 (`/api/auth`)

- `POST /api/auth/admin/login` - 管理员登录
- `POST /api/auth/admin/logout` - 管理员登出
- `GET /api/auth/admin/me` - 获取当前管理员信息
- `POST /api/auth/user/login` - 用户登录（手机号）
- `POST /api/auth/user/logout` - 用户登出

#### 管理员接口 (`/api/admin`)

**分类管理**:
- `GET /api/admin/categories` - 获取所有分类
- `POST /api/admin/categories` - 创建分类
- `PUT /api/admin/categories/:id` - 更新分类
- `DELETE /api/admin/categories/:id` - 删除分类

**菜品管理**:
- `GET /api/admin/products` - 获取所有菜品
- `POST /api/admin/products` - 创建菜品（支持文件上传）
- `PUT /api/admin/products/:id` - 更新菜品
- `DELETE /api/admin/products/:id` - 删除菜品

**订单管理**:
- `GET /api/admin/orders` - 获取订单列表（支持筛选）
- `GET /api/admin/orders/statistics` - 获取订单统计
- `PUT /api/admin/orders/:id/status` - 更新订单状态
- `GET /api/admin/orders/export` - 导出订单（CSV）

**折扣管理**:
- `GET /api/admin/discount-rules` - 获取折扣规则
- `POST /api/admin/discount-rules/batch` - 批量更新折扣规则

**系统设置**:
- `GET /api/admin/settings` - 获取设置
- `POST /api/admin/settings` - 更新设置

**管理员管理**（仅super_admin）:
- `GET /api/admin/admins` - 获取管理员列表
- `POST /api/admin/admins` - 创建管理员
- `PUT /api/admin/admins/:id` - 更新管理员
- `DELETE /api/admin/admins/:id` - 删除管理员

**开发者工具**（仅super_admin）:
- `GET /api/admin/developer/tables` - 获取数据库表列表
- `GET /api/admin/developer/table-schema/:tableName` - 获取表结构
- `GET /api/admin/developer/table-data/:tableName` - 获取表数据
- `PUT /api/admin/developer/table-data/:tableName` - 更新表数据
- `POST /api/admin/developer/execute-sql` - 执行SQL查询

#### 用户接口 (`/api/user`)

- `POST /api/user/orders` - 创建订单
- `GET /api/user/orders` - 获取我的订单
- `GET /api/user/orders/:id` - 获取订单详情
- `PUT /api/user/orders/:id` - 更新订单
- `DELETE /api/user/orders/:id` - 删除订单
- `POST /api/user/orders/:id/payment` - 上传付款截图

#### 公开接口 (`/api/public`)

- `GET /api/public/settings` - 获取系统设置
- `GET /api/public/categories` - 获取分类列表
- `GET /api/public/products` - 获取菜品列表
- `GET /api/public/discount-rules` - 获取折扣规则
- `GET /api/public/show-images` - 获取首页展示图片

### 错误响应格式

```json
{
  "success": false,
  "message": "错误信息",
  "errors": []  // 可选，验证错误详情
}
```

常见错误码：
- `400` - 请求参数错误
- `401` - 未登录或认证失败
- `403` - 权限不足
- `404` - 资源不存在
- `500` - 服务器错误

### 频率限制

- 登录接口: 15分钟内最多50次
- 其他API: 15分钟内最多500次

## ⚡ 性能优化

### 数据库查询优化

- ✅ 使用批量查询替代循环中的单个查询
- ✅ 批量获取订单项和周期信息
- ✅ 批量查询加料产品信息
- ✅ 使用事务确保批量更新的原子性

### 缓存机制

- ✅ 内存缓存系统设置、分类列表、折扣规则
- ✅ 缓存过期时间：5分钟
- ✅ 数据更新时自动清除相关缓存
- ✅ 减少数据库查询，提升响应速度

### 批量操作

- ✅ 批量更新订单折扣
- ✅ 批量查询订单项
- ✅ 批量查询周期信息

## 📊 监控和日志

### 性能监控

- ✅ 请求响应时间监控
- ✅ 内存使用监控
- ✅ 慢请求检测（>1秒自动记录）
- ✅ 自动记录所有API请求的性能指标

### 健康检查

访问 `/health` 端点可以获取系统健康状态：

```bash
curl http://localhost:3000/health
```

返回示例：
```json
{
  "status": "healthy",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "checks": {
    "database": { "status": "healthy", "message": "Database connection OK" },
    "disk": { "status": "healthy", "message": "Database size: 2.5MB" },
    "memory": { "status": "healthy", "message": "Memory usage: 45.2MB / 128MB" }
  }
}
```

### 日志系统

- ✅ 使用 winston 进行日志记录
- ✅ 按日期自动归档日志文件
- ✅ 分类记录：错误日志、综合日志、访问日志
- ✅ 操作日志写入数据库，支持查询和筛选

日志文件位置：
- `logs/error-YYYY-MM-DD.log` - 错误日志
- `logs/combined-YYYY-MM-DD.log` - 综合日志
- `logs/access-YYYY-MM-DD.log` - 访问日志

### 数据备份

使用备份脚本定期备份数据库：

```bash
npm run backup
```

备份文件存储在 `logs/backup/` 目录，自动保留最近30个备份。

## 🔒 安全特性

### 密码安全

- 使用bcrypt加密，强度为10
- 密码不会以明文形式存储或传输

### 会话管理

- 使用HttpOnly Cookie存储Session ID
- Session过期时间：24小时
- 支持代理环境（ngrok等）

### 请求限流

- 登录接口：50次/15分钟
- 其他API：500次/15分钟
- 防止暴力破解和DDoS攻击

### 输入验证

- 所有用户输入都经过验证
- 使用express-validator进行参数验证
- SQL注入防护（参数化查询）

### 文件上传安全

- 限制文件类型：jpg, png, gif, webp
- 限制文件大小：菜品图片5MB，付款截图10MB
- 文件名使用UUID，防止路径遍历

### 权限控制

- 基于角色的访问控制（RBAC）
- super_admin拥有最高权限
- 普通admin无法管理其他管理员

## 🐛 故障排查

### 数据库错误

```bash
# 删除并重新初始化数据库
rm db/boda.db
node db/init.js
```

### 端口占用

```bash
# 修改 server.js 中的 PORT 变量
# 或使用环境变量
PORT=3001 npm start
```

### 依赖安装失败

```bash
# 清理缓存后重新安装
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### sqlite3 安装失败

**macOS**:
```bash
xcode-select --install
npm install sqlite3 --build-from-source
```

**Linux (Ubuntu/Debian)**:
```bash
sudo apt-get install build-essential
npm install sqlite3 --build-from-source
```

### 查看日志

```bash
# 应用日志
tail -f logs/error.log
tail -f logs/combined.log

# 如果使用PM2
pm2 logs boda
```

## 📊 数据库表结构

1. **admins** - 管理员表（id, username, password, name, email, role, status）
2. **users** - 用户表（id, phone, name, created_at, last_login）
3. **categories** - 菜单分类表（id, name, description, sort_order, status）
4. **products** - 菜品表（id, name, description, price, category_id, image_url, sizes, sugar_levels, available_toppings, ice_options, status）
5. **orders** - 订单表（id, order_number, user_id, customer_name, customer_phone, total_amount, discount_amount, final_amount, status, payment_image, notes, cycle_id）
6. **order_items** - 订单详情表（id, order_id, product_id, quantity, size, sugar_level, ice_level, toppings, unit_price, subtotal）
7. **discount_rules** - 折扣规则表（id, min_amount, max_amount, discount_rate, description, status）
8. **settings** - 系统设置表（key, value）
9. **logs** - 操作日志表（id, admin_id, action, target_type, target_id, details, ip_address, created_at）
10. **ordering_cycles** - 订单周期表（id, cycle_number, start_time, end_time, status, total_amount, discount_rate）

## 🔄 更新日志

### v2.1.0 (2025-11-14)

- ✅ 实现角色权限控制（super_admin / admin）
- ✅ 只有super_admin可以管理其他管理员
- ✅ 只有super_admin可以访问开发者工具
- ✅ 数据库表说明注释
- ✅ 优化开发者工具UI/UX

### v2.0.0 (2025-11-12) - 准商用版

- 🎉 完全重构为准商用标准
- ✅ 使用SQLite数据库
- ✅ 完整的管理员认证系统
- ✅ 操作日志系统
- ✅ 用户管理
- ✅ 安全性增强
- ✅ 现代化UI设计
- ✅ 完整的API接口
- ✅ 产品定制功能（杯型、甜度、加料、冰度）
- ✅ 订单周期管理
- ✅ 自动折扣计算
- ✅ 订单归档功能
- ✅ 首页展示功能
- ✅ 商店名称和货币符号自定义
- ✅ 付款截图查看优化

### v1.0.0 - 初始版本

- 基础点单功能
- JSON文件存储

## ⚙️ 配置说明

### 环境变量（可选）

创建 `.env` 文件：

```env
PORT=3000
NODE_ENV=production
SESSION_SECRET=your-secret-key-change-this
CORS_ORIGIN=*
LOG_LEVEL=info
```

### 数据库位置

默认：`./db/boda.db`

### 上传文件限制

- 菜品图片：5MB
- 付款截图：10MB
- 支持格式：jpg, png, gif, webp

## 🔐 安全建议

1. **修改默认密码**：首次部署后立即修改admin密码
2. **使用HTTPS**：生产环境建议启用SSL
3. **定期备份**：定期备份数据库文件
4. **更新依赖**：定期更新npm包到最新版本
5. **限制访问**：使用防火墙限制管理后台访问
6. **日志审查**：定期查看日志文件
7. **SESSION_SECRET**：使用强密码作为session密钥
8. **角色管理**：合理分配super_admin和admin角色

## 📞 技术支持

如有问题，请查看：

1. 日志文件：`logs/error.log`
2. 操作日志：管理后台 → 操作日志
3. 控制台输出
4. 浏览器开发者工具

## 🧪 测试

项目使用Jest作为测试框架，包含完整的单元测试和集成测试。

### 运行测试

```bash
# 运行所有后端测试（推荐）
npm test

# 运行所有测试（后端 + 前端）
npm run test:all

# 运行所有测试并生成覆盖率报告
npm run test:full

# 运行前端UI组件测试
npm run test:frontend

# 监听模式运行测试（开发时使用）
npm run test:watch

# 生成测试覆盖率报告
npm run test:coverage

# 只运行单元测试
npm run test:unit

# 只运行集成测试
npm run test:integration
```

### 测试结构

```
tests/
├── setup.js              # 测试环境设置
├── teardown.js           # 测试清理
├── helpers/              # 测试辅助函数
│   ├── test-db.js       # 测试数据库设置
│   └── mock-data.js     # 模拟数据
├── middleware/           # 中间件测试
│   ├── auth.test.js
│   └── validation.test.js
├── utils/                # 工具函数测试
│   └── logger.test.js
├── routes/               # API路由测试
│   ├── auth.test.js
│   ├── admin.test.js
│   ├── user.test.js
│   └── public.test.js
├── db/                   # 数据库操作测试
│   └── database.test.js
└── frontend/             # 前端UI组件测试
    ├── setup.js         # 前端测试环境设置
    └── ui.test.js       # UI组件测试（Toast、对话框、加载状态等）
```

### 测试覆盖范围

#### 后端测试
- ✅ 中间件测试（认证、验证、性能监控）
- ✅ 工具函数测试（日志、缓存、周期辅助、订单辅助、健康检查）
  - ✅ 缓存系统测试（set/get/delete/clear/has/size，TTL过期）
  - ✅ 周期辅助函数测试（findOrderCycle, findOrderCyclesBatch, isActiveCycle, isOrderExpired）
  - ✅ 订单辅助函数测试（calculateItemPrice, batchGetToppingProducts, batchGetOrderItems）
  - ✅ 健康检查测试（数据库、磁盘、内存检查）
  - ✅ 性能监控中间件测试（请求性能记录、慢请求检测）
- ✅ API路由测试（认证、管理员、用户、公开接口）
  - ✅ 管理员管理CRUD（创建、读取、更新、删除）
  - ✅ Name字段保存和更新测试
  - ✅ 权限控制测试（super_admin vs admin）
  - ✅ 表单验证测试
  - ✅ 删除功能测试
- ✅ 数据库操作测试（CRUD、事务）

#### 前端测试
- ✅ Toast通知系统测试（success/error/warning/info类型）
- ✅ 确认对话框测试（Promise-based交互）
- ✅ 按钮加载状态测试（loading spinner）
- ✅ 全局Loading遮罩测试
- ✅ API工具函数测试（apiGet, apiPost, apiPut, apiDelete）
- ✅ 验证工具函数测试（表单验证）
- ✅ 错误处理测试（API错误、网络错误）

**新增测试文件**（本次优化新增）：
- `tests/utils/cache.test.js` - 缓存系统测试（8个测试用例）
- `tests/utils/cycle-helper.test.js` - 周期辅助函数测试（16个测试用例）
- `tests/utils/order-helper.test.js` - 订单辅助函数测试（15个测试用例）
- `tests/utils/health-check.test.js` - 健康检查测试（6个测试用例）
- `tests/middleware/monitoring.test.js` - 性能监控中间件测试（8个测试用例）

### 测试覆盖率

**当前覆盖率**：
- 总体覆盖率: **83.13%** ✅
- 语句覆盖率: 83.15%
- 分支覆盖率: 67.82%
- 函数覆盖率: 93.84%
- 行覆盖率: 83.15%

**新增代码覆盖率**（utils和middleware）：
- 缓存系统 (cache.js): 87.87%
- 周期辅助 (cycle-helper.js): 100%
- 订单辅助 (order-helper.js): 100%
- 健康检查 (health-check.js): 100%
- 性能监控 (monitoring.js): 100%

**覆盖率目标**：
- ✅ 总体覆盖率: **83.13%** (目标: 80%) ✅ 已达成
- ✅ 语句覆盖率: 83.15% (目标: 80%) ✅ 已达成
- ✅ 分支覆盖率: 67.82% (目标: 60%) ✅ 已达成
- ✅ 函数覆盖率: 93.84% (目标: 60%) ✅ 已达成
- ✅ 行覆盖率: 83.15% (目标: 80%) ✅ 已达成

### 编写新测试

1. 在对应的测试目录创建 `*.test.js` 文件
2. 使用 `describe` 和 `it` 组织测试用例
3. 使用 `beforeEach` 和 `afterEach` 进行测试数据准备和清理
4. 使用测试辅助函数创建模拟数据和请求对象

示例：

```javascript
describe('My Feature', () => {
  beforeEach(async () => {
    // 准备测试数据
  });

  it('should do something', async () => {
    // 测试逻辑
    expect(result).toBe(expected);
  });
});
```

## 📄 许可证

ISC License

## 🙏 致谢

感谢所有开源项目的贡献者！

---

**项目版本**: v2.1.0  
**最后更新**: 2025-11-14  
**开发语言**: JavaScript (Node.js)  
**许可协议**: ISC
