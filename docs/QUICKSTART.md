# 快速开始指南

## 🚀 三步启动

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

## 📱 立即使用

启动成功后，打开浏览器访问：

### 用户端
**地址**: http://localhost:3000

**功能**:
1. 输入手机号登录（无需密码）
2. 浏览菜单并加入购物车
3. 提交订单
4. 查看订单和折扣
5. 上传付款截图

### 管理后台
**地址**: http://localhost:3000/admin.html

**默认账号**:
- 用户名: `admin`
- 密码: `admin123`

**功能**:
- 📊 查看数据概览
- 📝 管理订单
- 🍹 管理菜单和分类
- 💰 设置折扣规则
- ⚙️ 系统设置（开放/关闭点单）
- 👥 用户管理
- 🔐 管理员管理
- 📋 操作日志

## 🎯 完整工作流程

### 管理员操作
```
1. 登录管理后台
   ↓
2. 设置菜单分类
   ↓
3. 添加菜品（可上传图片）
   ↓
4. 配置折扣规则
   ↓
5. 点击"开放点单"
   ↓
6. 监控订单创建
   ↓
7. 点击"关闭点单"（自动计算折扣）
   ↓
8. 审核付款截图
   ↓
9. 更新订单状态为"已完成"
```

### 用户操作
```
1. 输入手机号登录
   ↓
2. 浏览菜单
   ↓
3. 加入购物车
   ↓
4. 提交订单
   ↓
5. 等待点单关闭
   ↓
6. 查看折扣后价格
   ↓
7. 上传付款截图
   ↓
8. 等待订单完成
```

## 📦 项目结构速览

```
BODA/
├── 📂 db/              数据库相关
│   ├── database.js     数据库连接
│   ├── init.js         初始化脚本
│   └── boda.db         SQLite数据库
│
├── 📂 routes/          API路由
│   ├── auth.js         认证接口
│   ├── admin.js        管理员接口
│   ├── user.js         用户接口
│   └── public.js       公开接口
│
├── 📂 middleware/      中间件
│   ├── auth.js         认证中间件
│   └── validation.js   验证中间件
│
├── 📂 utils/           工具函数
│   └── logger.js       日志工具
│
├── 📂 public/          前端页面
│   ├── index.html      用户端页面
│   ├── app.js          用户端脚本
│   ├── admin.html      管理端页面
│   └── admin.js        管理端脚本
│
├── 📂 uploads/         上传文件
│   ├── products/       菜品图片
│   └── payments/       付款截图
│
├── 📂 logs/            日志文件
│
├── server.js           主服务器
├── package.json        依赖配置
├── README.md           详细说明
├── INSTALL.md          安装指南
├── DEPLOYMENT.md       部署指南
└── start.sh            启动脚本
```

## 🔑 核心功能

### ✅ 已实现功能

**用户端**:
- ✅ 手机号快速登录
- ✅ 菜单浏览和分类筛选
- ✅ 购物车管理
- ✅ 在线下单
- ✅ 订单查询
- ✅ 查看折扣
- ✅ 上传付款截图
- ✅ 响应式设计

**管理端**:
- ✅ 安全登录认证
- ✅ 数据概览仪表盘
- ✅ 菜单管理（CRUD）
- ✅ 分类管理
- ✅ 折扣规则配置
- ✅ 订单管理
- ✅ 用户管理
- ✅ 管理员管理
- ✅ 操作日志
- ✅ 系统设置

**技术特性**:
- ✅ SQLite数据库
- ✅ 密码加密存储
- ✅ Session会话管理
- ✅ 请求频率限制
- ✅ 完整的日志系统
- ✅ 事务处理
- ✅ 数据验证
- ✅ 文件上传安全
- ✅ 数据库并发控制

## 🛠️ 常用命令

```bash
# 启动服务器
npm start

# 开发模式（自动重启）
npm run dev

# 初始化数据库
node db/init.js

# 查看日志
tail -f logs/combined.log
tail -f logs/error.log

# 备份数据库
cp db/boda.db db/boda.db.backup
```

## ⚙️ 配置选项

创建 `.env` 文件进行自定义配置：

```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=your-secret-key
CORS_ORIGIN=*
LOG_LEVEL=info
```

## 🔒 安全提示

**⚠️ 重要：首次部署后请立即：**

1. 修改管理员密码
2. 修改SESSION_SECRET
3. 配置防火墙
4. 启用HTTPS（生产环境）
5. 定期备份数据库

## 📚 扩展阅读

- **README.md** - 完整功能介绍和技术文档
- **INSTALL.md** - 详细安装步骤和故障排查
- **DEPLOYMENT.md** - 生产环境部署指南

## 🆘 遇到问题？

### 依赖安装失败
```bash
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

### 数据库错误
```bash
rm db/boda.db
node db/init.js
```

### 端口占用
```bash
PORT=3001 npm start
```

### 查看日志
```bash
# 应用日志
cat logs/error.log

# 如果使用PM2
pm2 logs boda
```

## 💡 提示

1. **开发测试**: 使用默认配置即可，无需额外设置
2. **生产部署**: 参考 DEPLOYMENT.md 进行完整配置
3. **数据备份**: 定期备份 `db/boda.db` 和 `uploads/` 目录
4. **安全更新**: 定期运行 `npm update` 更新依赖

## 🎉 开始使用

现在您可以：
1. 启动服务器：`./start.sh`
2. 打开浏览器访问 http://localhost:3000
3. 使用默认账号登录管理后台
4. 开始配置您的奶茶店！

祝您使用愉快！🧋
