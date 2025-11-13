# 博达奶茶点单系统 - 准商用版

一个功能完善的奶茶店在线点单系统，支持管理员后台管理和用户点单功能。

## ✨ 主要功能

### 👥 用户端功能
- 📱 手机号快速登录（无需密码）
- 🛒 在线浏览菜单并加入购物车
- 📝 创建订单
- 💰 查看订单及折扣信息
- 📸 上传付款截图
- 🔍 查询历史订单

### 🔐 管理员功能
- 🔑 安全的账号密码登录
- 📊 数据概览仪表盘
- 🍹 菜单管理（增删改查、图片上传）
- 📂 分类管理
- 💵 折扣梯度自由设置
- 📋 订单管理（状态更新、查看付款截图）
- 👤 用户管理
- 🔐 管理员账号管理
- 📝 操作日志查看
- ⚙️ 系统设置（点单开关等）

## 🛡️ 准商用特性

### 安全性
- ✅ 密码加密存储（bcrypt）
- ✅ Session会话管理
- ✅ 请求频率限制（防暴力破解）
- ✅ SQL注入防护
- ✅ XSS攻击防护（Helmet）
- ✅ 输入验证（express-validator）
- ✅ CORS跨域配置
- ✅ 文件上传安全限制

### 数据库
- ✅ SQLite数据库（轻量高效）
- ✅ 完整的关系模型设计
- ✅ 事务支持（ACID）
- ✅ 索引优化
- ✅ 外键约束
- ✅ WAL模式（提高并发性能）
- ✅ 数据完整性保护

### 日志系统
- ✅ Winston日志框架
- ✅ 操作日志（记录所有管理员操作）
- ✅ 错误日志
- ✅ 访问日志
- ✅ 日志文件自动轮转
- ✅ 日志查询功能

### 用户体验
- ✅ 响应式设计（支持手机、平板、电脑）
- ✅ 现代化UI（Tailwind CSS）
- ✅ 流畅的动画效果
- ✅ 友好的错误提示
- ✅ 实时数据更新

## 📦 技术栈

### 后端
- Node.js + Express
- SQLite3（数据库）
- bcryptjs（密码加密）
- express-session（会话管理）
- express-rate-limit（限流）
- winston（日志）
- helmet（安全）
- express-validator（验证）
- multer（文件上传）

### 前端
- 原生JavaScript（无框架依赖）
- Tailwind CSS（样式）
- 响应式设计

## 🚀 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 初始化数据库（可选）
```bash
node db/init.js
```

### 3. 启动服务器
```bash
npm start
```

开发模式（自动重启）：
```bash
npm run dev
```

### 4. 访问系统
- 用户端：http://localhost:3000
- 管理后台：http://localhost:3000/admin.html

## 🔑 默认账号

### 管理员
- 用户名：`admin`
- 密码：`admin123`

**⚠️ 重要：首次登录后请立即修改默认密码！**

### 普通用户
- 无需注册，输入手机号即可登录

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
│   └── logger.js          # 日志工具
├── public/                 # 前端文件
│   ├── index.html         # 用户端页面
│   ├── app.js             # 用户端脚本
│   ├── admin.html         # 管理端页面
│   └── admin.js           # 管理端脚本
├── uploads/                # 上传文件目录
│   ├── products/          # 菜品图片
│   └── payments/          # 付款截图
├── logs/                   # 日志文件
│   ├── error.log          # 错误日志
│   └── combined.log       # 综合日志
├── server.js              # 主服务器文件
├── package.json           # 依赖配置
└── README.md              # 说明文档
```

## 🔧 配置说明

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

## 📊 数据库表结构

1. **admins** - 管理员表
2. **users** - 用户表
3. **categories** - 菜单分类表
4. **products** - 菜品表
5. **orders** - 订单表
6. **order_items** - 订单详情表
7. **discount_rules** - 折扣规则表
8. **settings** - 系统设置表
9. **logs** - 操作日志表

## 🔐 安全建议

1. **修改默认密码**：首次部署后立即修改admin密码
2. **使用HTTPS**：生产环境建议启用SSL
3. **定期备份**：定期备份数据库文件
4. **更新依赖**：定期更新npm包到最新版本
5. **限制访问**：使用防火墙限制管理后台访问
6. **日志审查**：定期查看日志文件
7. **SESSION_SECRET**：使用强密码作为session密钥

## 📝 使用流程

### 管理员操作流程
1. 登录管理后台
2. 设置菜单分类
3. 添加菜品（可上传图片）
4. 设置折扣规则
5. 开放点单
6. 监控订单
7. 关闭点单（自动计算折扣）
8. 审核付款截图
9. 标记订单完成

### 用户操作流程
1. 输入手机号登录
2. 浏览菜单并加入购物车
3. 提交订单
4. 等待点单关闭
5. 查看折扣后价格
6. 上传付款截图
7. 等待订单完成

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

## 📈 性能优化

- ✅ 数据库索引优化
- ✅ 静态文件缓存
- ✅ 请求频率限制
- ✅ 日志文件轮转
- ✅ WAL模式提高并发

## 🔄 更新日志

### v2.0.0 (2025-11-12) - 准商用版
- 🎉 完全重构为准商用标准
- ✅ 使用SQLite数据库
- ✅ 完整的管理员认证系统
- ✅ 操作日志系统
- ✅ 用户管理
- ✅ 安全性增强
- ✅ 现代化UI设计
- ✅ 完整的API接口

### v1.0.0 - 初始版本
- 基础点单功能
- JSON文件存储

## 📞 技术支持

如有问题，请查看：
1. 日志文件：`logs/error.log`
2. 操作日志：管理后台 → 操作日志
3. 控制台输出

## 📄 许可证

ISC License

## 🙏 致谢

感谢所有开源项目的贡献者！
