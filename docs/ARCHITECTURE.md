# 系统架构文档

## 版本
v1.0.0

## 系统概述

BOBA TEA 点单系统是一个基于 Node.js + Express + SQLite 的在线点单系统，采用前后端分离架构，支持管理员后台管理和用户点单功能。

## 技术栈

### 后端
- **Node.js** - 运行环境
- **Express.js** - Web框架
- **SQLite** - 数据库
- **bcryptjs** - 密码加密
- **express-session** - 会话管理
- **express-validator** - 输入验证
- **multer** - 文件上传
- **winston** - 日志系统
- **helmet** - 安全中间件
- **express-rate-limit** - 限流保护

### 前端
- **原生JavaScript** - 无框架依赖
- **Tailwind CSS** - 样式框架
- **响应式设计** - 移动端适配

## 项目结构

```
BODA/
├── db/                      # 数据库相关
│   ├── database.js         # 数据库连接和操作
│   ├── init.js            # 数据库初始化
│   └── boda.db            # SQLite数据库文件
├── middleware/             # 中间件
│   ├── auth.js            # 认证中间件
│   ├── validation.js      # 验证中间件
│   └── monitoring.js      # 性能监控中间件
├── routes/                 # 路由
│   ├── auth.js            # 认证路由
│   ├── admin.js           # 管理员路由
│   ├── user.js            # 用户路由
│   └── public.js          # 公开路由
├── utils/                  # 工具函数
│   ├── logger.js          # 日志工具
│   ├── cache.js           # 内存缓存
│   ├── order-helper.js    # 订单辅助函数
│   ├── cycle-helper.js    # 周期辅助函数
│   └── health-check.js    # 健康检查
├── public/                 # 前端文件
│   ├── index.html         # 用户端页面
│   ├── app.js             # 用户端脚本
│   ├── admin.html         # 管理端页面
│   ├── admin.js           # 管理端脚本
│   └── utils/             # 前端工具
│       ├── api.js         # API封装
│       ├── validation.js  # 表单验证
│       ├── error-handler.js # 错误处理
│       └── network.js     # 网络状态
├── uploads/                # 上传文件目录
│   ├── products/          # 菜品图片
│   └── payments/          # 付款截图
├── logs/                   # 日志文件
│   ├── error.log          # 错误日志
│   ├── combined.log       # 综合日志
│   ├── access.log         # 访问日志
│   ├── export/            # 归档的订单CSV
│   └── backup/            # 数据库备份
├── show/                   # 首页展示图片
├── scripts/                # 脚本
│   └── backup.js          # 数据库备份脚本
├── tests/                  # 测试文件
│   ├── routes/            # 路由测试
│   ├── middleware/        # 中间件测试
│   ├── db/                # 数据库测试
│   ├── utils/             # 工具测试
│   └── frontend/          # 前端测试
├── server.js              # 主服务器文件
├── package.json           # 依赖配置
└── README.md              # 说明文档
```

## 核心业务流程

### 1. 用户订单流程

```
用户登录 → 浏览菜单 → 选择商品（杯型、甜度、加料、冰度） → 添加到购物车 
→ 提交订单 → 等待点单关闭 → 上传付款截图 → 管理员确认 → 订单完成
```

### 2. 订单周期流程

```
管理员开启点单 → 创建新周期 → 用户下单 → 管理员关闭点单 
→ 自动计算折扣 → 用户上传付款截图 → 管理员确认周期 → 周期结束
```

### 3. 折扣计算逻辑

- 系统根据当前周期的总订单金额，自动匹配折扣规则
- 折扣规则按 `min_amount` 从高到低匹配，找到第一个符合条件的规则
- 所有待付款订单统一应用折扣率
- 折扣金额 = 订单总额 × 折扣率
- 最终金额 = 订单总额 - 折扣金额

## 数据库设计

### 核心表结构

1. **admins** - 管理员表
   - 支持角色管理（super_admin / admin）
   - 密码使用 bcryptjs 加密

2. **users** - 用户表
   - 手机号唯一标识
   - 支持国际手机号格式

3. **categories** - 分类表
   - 支持排序和状态管理

4. **products** - 产品表
   - 支持多杯型价格（JSON格式）
   - 支持甜度选项配置
   - 支持可选加料配置
   - 支持冰度选项配置

5. **orders** - 订单表
   - 订单号自动生成（BO + 时间戳后8位）
   - 支持折扣计算
   - 支持付款截图上传

6. **order_items** - 订单详情表
   - 存储商品定制信息（杯型、甜度、加料、冰度）
   - 存储备注信息

7. **ordering_cycles** - 订单周期表
   - 记录每个点单周期的开始和结束时间
   - 记录周期总金额和折扣率

8. **discount_rules** - 折扣规则表
   - 支持金额区间折扣
   - 支持百分比折扣

## API 设计

### 认证相关
- `POST /api/auth/admin/login` - 管理员登录
- `POST /api/auth/admin/logout` - 管理员登出
- `GET /api/auth/admin/me` - 获取管理员信息
- `POST /api/auth/user/login` - 用户登录
- `POST /api/auth/user/logout` - 用户登出
- `GET /api/auth/user/me` - 获取用户信息

### 公开接口
- `GET /api/public/settings` - 获取系统设置
- `GET /api/public/categories` - 获取分类列表
- `GET /api/public/products` - 获取产品列表
- `GET /api/public/discount-rules` - 获取折扣规则
- `GET /api/public/cycle-discount` - 获取周期折扣信息
- `GET /api/public/orders/:orderNumber` - 根据订单号查询订单
- `POST /api/public/calculate-discount` - 计算折扣
- `GET /api/public/show-images` - 获取展示图片

### 用户接口
- `POST /api/user/orders` - 创建订单
- `GET /api/user/orders` - 获取我的订单列表
- `GET /api/user/orders/:id` - 获取订单详情
- `GET /api/user/orders/by-phone` - 根据手机号获取订单
- `PUT /api/user/orders/:id` - 更新订单
- `DELETE /api/user/orders/:id` - 删除订单
- `POST /api/user/orders/:id/payment` - 上传付款截图
- `GET /api/user/orders-summary` - 获取订单汇总

### 管理员接口
- `GET /api/admin/categories` - 获取分类列表
- `POST /api/admin/categories` - 创建分类
- `PUT /api/admin/categories/:id` - 更新分类
- `DELETE /api/admin/categories/:id` - 删除分类
- `GET /api/admin/products` - 获取产品列表
- `POST /api/admin/products` - 创建产品
- `PUT /api/admin/products/:id` - 更新产品
- `DELETE /api/admin/products/:id` - 删除产品
- `GET /api/admin/orders` - 获取订单列表
- `PUT /api/admin/orders/:id/status` - 更新订单状态
- `GET /api/admin/orders/export` - 导出订单
- `GET /api/admin/orders/statistics` - 获取订单统计
- `GET /api/admin/discount-rules` - 获取折扣规则
- `POST /api/admin/discount-rules/batch` - 批量更新折扣规则
- `GET /api/admin/cycles` - 获取周期列表
- `POST /api/admin/cycles/:id/confirm` - 确认周期
- `GET /api/admin/settings` - 获取设置
- `POST /api/admin/settings` - 更新设置
- `POST /api/admin/ordering/open` - 开启点单
- `POST /api/admin/ordering/close` - 关闭点单
- `GET /api/admin/dashboard` - 获取仪表盘数据
- `GET /api/admin/logs` - 获取操作日志
- `GET /api/admin/users` - 获取用户列表
- `GET /api/admin/admins` - 获取管理员列表（仅super_admin）
- `POST /api/admin/admins` - 创建管理员（仅super_admin）
- `PUT /api/admin/admins/:id` - 更新管理员（仅super_admin）
- `DELETE /api/admin/admins/:id` - 删除管理员（仅super_admin）
- `GET /api/admin/developer/tables` - 获取表列表（仅super_admin）
- `GET /api/admin/developer/table-schema/:table` - 获取表结构（仅super_admin）
- `GET /api/admin/developer/table-data/:table` - 获取表数据（仅super_admin）
- `POST /api/admin/developer/table-data/:table` - 更新表数据（仅super_admin）
- `POST /api/admin/developer/execute-sql` - 执行SQL（仅super_admin）

## 性能优化

### 数据库查询优化
- 使用批量查询替代循环中的单个查询
- 使用 JOIN 查询减少数据库往返
- 使用索引优化查询性能

### 缓存机制
- 内存缓存系统设置、分类列表、折扣规则
- 缓存过期时间：5分钟
- 数据更新时自动清除相关缓存

### 批量操作
- 批量更新订单折扣
- 批量查询订单项
- 批量查询周期信息

## 安全特性

### 认证和授权
- 管理员使用账号密码登录
- 用户使用手机号登录（无需密码）
- 基于角色的访问控制（RBAC）
- Session 管理

### 输入验证
- 使用 express-validator 进行输入验证
- SQL 注入防护（参数化查询）
- XSS 防护（输入转义）

### 安全中间件
- Helmet 安全头设置
- CORS 配置
- 请求限流
- CSP 内容安全策略

## 监控和日志

### 日志系统
- 使用 winston 进行日志记录
- 按日期自动归档日志文件
- 分类记录：错误日志、综合日志、访问日志
- 操作日志写入数据库

### 性能监控
- 请求响应时间监控
- 内存使用监控
- 慢请求检测（>1秒）

### 健康检查
- `/health` 端点提供系统健康状态
- 检查数据库连接
- 检查磁盘空间
- 检查内存使用

## 数据备份

### 自动备份
- 使用 `npm run backup` 执行备份
- 备份文件存储在 `logs/backup/` 目录
- 自动清理旧备份（保留最近30个）

## 测试

### 测试框架
- Jest - 测试框架
- Supertest - HTTP 断言
- JSDOM - DOM 测试环境

### 测试覆盖
- 总体覆盖率：80.09%
- 路由测试：80.09%
- 中间件测试：100%
- 工具函数测试：63.33%

### 测试类型
- 单元测试
- 集成测试
- 边界测试
- 安全测试
- 性能测试

## 部署

### 环境要求
- Node.js 14.0+
- npm 6.0+
- SQLite 3

### 部署步骤
1. 安装依赖：`npm install`
2. 初始化数据库：`node db/init.js`
3. 启动服务：`npm start`

### 生产环境建议
- 使用 PM2 管理进程
- 使用 Nginx 反向代理
- 配置 HTTPS
- 定期备份数据库
- 监控系统资源

## 版本历史

### v1.0.0 (当前版本)
- 完整的用户和管理员功能
- 订单周期管理
- 折扣计算系统
- 性能优化
- 缓存机制
- 监控和日志
- 测试框架

