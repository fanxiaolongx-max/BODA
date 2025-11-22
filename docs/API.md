# API接口文档

## 目录

- [基础信息](#基础信息)
- [认证接口 (`/api/auth`) - 10个端点](#认证接口-apiauth---10个端点)
- [管理员接口 (`/api/admin`) - 63个端点](#管理员接口-apiadmin---63个端点)
  - [分类管理 (4个)](#分类管理-4个)
  - [产品管理 (5个)](#产品管理-5个)
  - [折扣规则管理 (2个)](#折扣规则管理-2个)
  - [系统设置 (2个)](#系统设置-2个)
  - [点单控制 (2个)](#点单控制-2个)
  - [订单管理 (5个)](#订单管理-5个)
  - [周期管理 (2个)](#周期管理-2个)
  - [用户管理 (1个)](#用户管理-1个)
  - [管理员管理 (4个)](#管理员管理-4个)
  - [日志管理 (2个)](#日志管理-2个)
  - [开发者工具 (10个)](#开发者工具-10个)
  - [备份管理 (7个)](#备份管理-7个)
  - [清理工具 (2个)](#清理工具-2个)
  - [远程备份 (10个)](#远程备份-10个)
  - [其他 (1个)](#其他-1个)
- [用户接口 (`/api/user`) - 8个端点](#用户接口-apiuser---8个端点)
- [公开接口 (`/api/public`) - 8个端点](#公开接口-apipublic---8个端点)
- [错误响应](#错误响应)
- [频率限制](#频率限制)

## 基础信息

- **Base URL**: `http://localhost:3000/api`
- **认证方式**: Session Cookie
- **内容类型**: `application/json` (除文件上传接口使用 `multipart/form-data`)

---

## 认证接口 (`/api/auth`) - 10个端点

### 1. 管理员登录
```http
POST /api/auth/admin/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}

Response 200:
{
  "success": true,
  "message": "登录成功",
  "admin": {
    "id": 1,
    "username": "admin",
    "name": "系统管理员",
    "role": "super_admin"
  }
}
```

### 2. 管理员登出
```http
POST /api/auth/admin/logout

Response 200:
{
  "success": true,
  "message": "登出成功"
}
```

### 3. 获取当前管理员信息
```http
GET /api/auth/admin/me

Response 200:
{
  "success": true,
  "admin": {
    "id": 1,
    "username": "admin",
    "name": "系统管理员",
    "email": "",
    "role": "super_admin",
    "created_at": "2025-11-12T00:00:00.000Z"
  }
}
```

### 4. 用户登录（手机号）
```http
POST /api/auth/user/login
Content-Type: application/json

{
  "phone": "13800138000",
  "name": "张三"
}

Response 200:
{
  "success": true,
  "message": "登录成功",
  "user": {
    "id": 1,
    "phone": "13800138000",
    "name": "张三"
  }
}
```

### 5. 用户登出
```http
POST /api/auth/user/logout

Response 200:
{
  "success": true,
  "message": "登出成功"
}
```

### 6. 发送验证码
```http
POST /api/auth/sms/send
Content-Type: application/json

{
  "phone": "13800138000",
  "type": "login"  // 可选: "login", "register", "reset"
}

Response 200:
{
  "success": true,
  "message": "验证码已发送",
  "code": "123456"  // 仅开发环境返回
}
```

### 7. 验证码登录
```http
POST /api/auth/user/login-with-code
Content-Type: application/json

{
  "phone": "13800138000",
  "code": "123456",
  "name": "张三"  // 可选
}

Response 200:
{
  "success": true,
  "message": "登录成功",
  "user": {
    "id": 1,
    "phone": "13800138000",
    "name": "张三"
  }
}
```

### 8. 获取当前用户信息
```http
GET /api/auth/user/me

Response 200:
{
  "success": true,
  "user": {
    "id": 1,
    "phone": "13800138000",
    "name": "张三",
    "created_at": "2025-11-12T00:00:00.000Z"
  }
}
```

### 9. 获取会话信息
```http
GET /api/auth/session/info

Response 200:
{
  "success": true,
  "session": {
    "isLoggedIn": true,
    "userType": "admin",  // "admin", "user", "both", "guest"
    "userId": 1,
    "adminId": 1,
    "cookie": {
      "expiresAt": "2025-11-12T12:00:00.000Z",
      "remainingMs": 3600000,
      "hours": 1,
      "minutes": 0,
      "seconds": 0,
      "formatted": "1小时0分钟0秒"
    },
    "admin": {
      "expiresAt": "2025-11-12T12:00:00.000Z",
      "remainingMs": 3600000,
      "isExpired": false
    },
    "user": {
      "expiresAt": "2025-11-12T12:00:00.000Z",
      "remainingMs": 3600000,
      "isExpired": false
    }
  }
}
```

### 10. 刷新会话
```http
POST /api/auth/session/refresh

Response 200:
{
  "success": true,
  "message": "会话已刷新"
}
```

---

## 管理员接口 (`/api/admin`) - 63个端点

所有管理员接口需要先登录认证。

### 分类管理 (4个)

#### 1. 获取所有分类
```http
GET /api/admin/categories

Response 200:
{
  "success": true,
  "categories": [
    {
      "id": 1,
      "name": "经典奶茶",
      "description": "经典系列奶茶",
      "sort_order": 1,
      "status": "active",
      "created_at": "2025-11-12T00:00:00.000Z",
      "updated_at": "2025-11-12T00:00:00.000Z"
    }
  ]
}
```

#### 2. 创建分类
```http
POST /api/admin/categories
Content-Type: application/json

{
  "name": "新分类",
  "description": "分类描述",
  "sort_order": 10,
  "status": "active"
}

Response 200:
{
  "success": true,
  "message": "分类创建成功",
  "id": 5
}
```

#### 3. 更新分类
```http
PUT /api/admin/categories/:id
Content-Type: application/json

{
  "name": "更新后的名称",
  "description": "更新后的描述",
  "sort_order": 5,
  "status": "active"
}

Response 200:
{
  "success": true,
  "message": "分类更新成功"
}
```

#### 4. 删除分类
```http
DELETE /api/admin/categories/:id

Response 200:
{
  "success": true,
  "message": "分类删除成功"
}
```

### 产品管理 (5个)

#### 5. 获取所有产品
```http
GET /api/admin/products?category_id=1&status=active

Query Parameters:
- category_id (可选): 分类ID
- status (可选): 状态过滤 (active/inactive)

Response 200:
{
  "success": true,
  "products": [
    {
      "id": 1,
      "name": "珍珠奶茶",
      "description": "经典珍珠奶茶",
      "price": 15,
      "category_id": 1,
      "category_name": "经典奶茶",
      "image_url": "/uploads/products/xxx.jpg",
      "status": "active",
      "sort_order": 0,
      "created_at": "2025-11-12T00:00:00.000Z",
      "updated_at": "2025-11-12T00:00:00.000Z"
    }
  ]
}
```

#### 6. 创建产品
```http
POST /api/admin/products
Content-Type: multipart/form-data

name: 新菜品
description: 描述
price: 20
category_id: 1
sort_order: 0
status: active
sizes: [{"name":"large","price":5}]
ice_options: ["Less Ice","No Ice"]
image: [file]

Response 200:
{
  "success": true,
  "message": "菜品创建成功",
  "id": 13
}
```

#### 7. 更新产品
```http
PUT /api/admin/products/:id
Content-Type: multipart/form-data

name: 更新后的名称
price: 22
image: [file]  // 可选，不传则不更新图片
...

Response 200:
{
  "success": true,
  "message": "菜品更新成功"
}
```

#### 8. 删除产品
```http
DELETE /api/admin/products/:id

Response 200:
{
  "success": true,
  "message": "菜品删除成功"
}
```

#### 9. 批量更新产品
```http
POST /api/admin/products/batch-update
Content-Type: application/json

{
  "product_ids": [1, 2, 3],
  "updates": {
    "status": "inactive",
    "sort_order": 10
  }
}

Response 200:
{
  "success": true,
  "message": "批量更新成功",
  "updated_count": 3
}
```

### 折扣规则管理 (2个)

#### 10. 获取折扣规则
```http
GET /api/admin/discount-rules

Response 200:
{
  "success": true,
  "rules": [
    {
      "id": 1,
      "min_amount": 0,
      "max_amount": 50,
      "discount_rate": 0,
      "description": "满0元无折扣",
      "status": "active",
      "created_at": "2025-11-12T00:00:00.000Z"
    }
  ]
}
```

#### 11. 批量更新折扣规则
```http
POST /api/admin/discount-rules/batch
Content-Type: application/json

{
  "rules": [
    {
      "min_amount": 0,
      "max_amount": 50,
      "discount_rate": 0,
      "description": "满0元无折扣"
    },
    {
      "min_amount": 50,
      "max_amount": null,
      "discount_rate": 10,
      "description": "满50元享9折"
    }
  ]
}

Response 200:
{
  "success": true,
  "message": "折扣规则更新成功"
}
```

### 系统设置 (2个)

#### 12. 获取设置
```http
GET /api/admin/settings

Response 200:
{
  "success": true,
  "settings": {
    "ordering_open": "false",
    "ordering_end_time": "",
    "store_name": "博达奶茶点单系统",
    "contact_phone": ""
  }
}
```

#### 13. 更新设置
```http
POST /api/admin/settings
Content-Type: application/json

{
  "ordering_open": "true",
  "store_name": "新名称"
}

Response 200:
{
  "success": true,
  "message": "设置更新成功"
}
```

### 点单控制 (2个)

#### 14. 开启点单
```http
POST /api/admin/ordering/open
Content-Type: application/json

{
  "end_time": "2025-11-12 18:00:00"  // 可选，自动结束时间
}

Response 200:
{
  "success": true,
  "message": "点单已开启",
  "cycle": {
    "id": 1,
    "cycle_number": "CYCLE20251112",
    "start_time": "2025-11-12T10:00:00.000Z",
    "status": "active"
  }
}
```

#### 15. 关闭点单
```http
POST /api/admin/ordering/close

Response 200:
{
  "success": true,
  "message": "点单已关闭",
  "cycle": {
    "id": 1,
    "cycle_number": "CYCLE20251112",
    "end_time": "2025-11-12T18:00:00.000Z",
    "status": "ended"
  }
}
```

### 订单管理 (5个)

#### 16. 获取订单列表
```http
GET /api/admin/orders?status=pending&phone=138&date=2025-11-12

Query Parameters:
- status (可选): 订单状态 (pending/paid/completed/cancelled)
- phone (可选): 手机号模糊搜索
- date (可选): 日期 (YYYY-MM-DD)

Response 200:
{
  "success": true,
  "orders": [
    {
      "id": "uuid",
      "order_number": "BO12345678",
      "user_id": 1,
      "customer_name": "张三",
      "customer_phone": "13800138000",
      "total_amount": 50,
      "discount_amount": 5,
      "final_amount": 45,
      "status": "pending",
      "payment_image": null,
      "payment_time": null,
      "created_at": "2025-11-12T10:00:00.000Z",
      "items": [...]
    }
  ]
}
```

#### 17. 获取订单统计
```http
GET /api/admin/orders/statistics

Response 200:
{
  "success": true,
  "statistics": {
    "total_orders": 100,
    "total_amount": 5000,
    "total_discount": 500,
    "total_final_amount": 4500,
    "pending_count": 10,
    "paid_count": 80,
    "completed_count": 10
  }
}
```

#### 18. 导出订单 (XLSX)
```http
GET /api/admin/orders/export

Response 200:
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
[Excel文件二进制数据]
```

#### 19. 更新订单状态
```http
PUT /api/admin/orders/:id/status
Content-Type: application/json

{
  "status": "completed"
}

Response 200:
{
  "success": true,
  "message": "订单状态更新成功"
}
```

#### 20. 确认周期并计算折扣
```http
POST /api/admin/cycles/:id/confirm

Response 200:
{
  "success": true,
  "message": "周期确认成功",
  "discountRate": 10,
  "orderCount": 50,
  "cancelledCount": 30,
  "excelFile": "/tmp/cycle-export.xlsx",
  "emailSent": true
}
```

### 周期管理 (2个)

#### 21. 获取周期列表
```http
GET /api/admin/cycles?status=active

Query Parameters:
- status (可选): 周期状态 (active/ended/confirmed)

Response 200:
{
  "success": true,
  "cycles": [
    {
      "id": 1,
      "cycle_number": "CYCLE20251112",
      "start_time": "2025-11-12T10:00:00.000Z",
      "end_time": "2025-11-12T18:00:00.000Z",
      "status": "ended",
      "total_amount": 5000,
      "discount_rate": 10,
      "confirmed_at": null
    }
  ]
}
```

### 用户管理 (1个)

#### 22. 获取用户列表
```http
GET /api/admin/users

Response 200:
{
  "success": true,
  "users": [
    {
      "id": 1,
      "phone": "13800138000",
      "name": "张三",
      "created_at": "2025-11-12T00:00:00.000Z",
      "last_login": "2025-11-12T10:00:00.000Z",
      "order_count": 5,
      "total_spent": 250
    }
  ]
}
```

### 管理员管理 (4个)

#### 23. 获取管理员列表
```http
GET /api/admin/admins

Response 200:
{
  "success": true,
  "admins": [
    {
      "id": 1,
      "username": "admin",
      "name": "系统管理员",
      "email": "",
      "role": "super_admin",
      "status": "active",
      "created_at": "2025-11-12T00:00:00.000Z"
    }
  ]
}
```

#### 24. 创建管理员
```http
POST /api/admin/admins
Content-Type: application/json

{
  "username": "newadmin",
  "password": "password123",
  "name": "新管理员",
  "email": "admin@example.com",
  "role": "admin"
}

Response 200:
{
  "success": true,
  "message": "管理员创建成功",
  "id": 2
}
```

**权限要求**: 仅超级管理员

#### 25. 更新管理员
```http
PUT /api/admin/admins/:id
Content-Type: application/json

{
  "name": "更新后的名称",
  "email": "newemail@example.com",
  "role": "admin",
  "status": "active"
}

Response 200:
{
  "success": true,
  "message": "管理员更新成功"
}
```

**权限要求**: 仅超级管理员

#### 26. 删除管理员
```http
DELETE /api/admin/admins/:id

Response 200:
{
  "success": true,
  "message": "管理员删除成功"
}
```

**权限要求**: 仅超级管理员

### 日志管理 (2个)

#### 27. 获取日志
```http
GET /api/admin/logs?page=1&limit=30&startDate=2025-11-01&endDate=2025-11-12&action=LOGIN&operator=admin&target_type=admin&ip_address=127.0.0.1&details=登录

Query Parameters:
- page (可选): 页码，默认1
- limit (可选): 每页数量，默认30
- startDate (可选): 开始日期 (YYYY-MM-DD)
- endDate (可选): 结束日期 (YYYY-MM-DD)
- action (可选): 操作类型
- operator (可选): 操作者
- target_type (可选): 目标类型
- ip_address (可选): IP地址（模糊匹配）
- details (可选): 详情（模糊匹配）

Response 200:
{
  "success": true,
  "logs": [
    {
      "id": 1,
      "admin_id": 1,
      "admin_username": "admin",
      "action": "LOGIN",
      "target_type": "admin",
      "target_id": "1",
      "details": "管理员登录",
      "ip_address": "127.0.0.1",
      "user_agent": "Mozilla/5.0...",
      "created_at": "2025-11-12T10:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 30,
    "total": 100
  }
}
```

#### 28. 获取日志过滤选项
```http
GET /api/admin/logs/filter-options

Response 200:
{
  "success": true,
  "filterOptions": {
    "actionTypes": ["LOGIN", "LOGOUT", "CREATE", "UPDATE", "DELETE"],
    "resourceTypes": ["admin", "user", "product", "category", "order"],
    "operators": [
      {"id": 1, "username": "admin"},
      {"id": 2, "username": "manager"}
    ]
  }
}
```

### 开发者工具 (10个)

**权限要求**: 仅超级管理员

#### 29. 获取数据库表列表
```http
GET /api/admin/developer/tables

Response 200:
{
  "success": true,
  "tables": ["admins", "users", "products", "categories", "orders", ...]
}
```

#### 30. 获取表结构
```http
GET /api/admin/developer/table-schema/:tableName

Response 200:
{
  "success": true,
  "schema": [
    {
      "cid": 0,
      "name": "id",
      "type": "INTEGER",
      "notnull": 1,
      "dflt_value": null,
      "pk": 1
    }
  ]
}
```

#### 31. 获取表数据
```http
GET /api/admin/developer/table-data/:tableName?limit=100&offset=0

Query Parameters:
- limit (可选): 限制数量
- offset (可选): 偏移量

Response 200:
{
  "success": true,
  "data": [...],
  "total": 1000
}
```

#### 32. 更新表数据
```http
PUT /api/admin/developer/table-data/:tableName
Content-Type: application/json

{
  "id": 1,
  "name": "新名称"
}

Response 200:
{
  "success": true,
  "message": "数据更新成功"
}
```

#### 33. 获取文件列表
```http
GET /api/admin/developer/files/list?path=/uploads

Query Parameters:
- path (可选): 目录路径

Response 200:
{
  "success": true,
  "files": [
    {
      "name": "file.txt",
      "type": "file",
      "size": 1024,
      "modified": "2025-11-12T10:00:00.000Z"
    }
  ]
}
```

#### 34. 读取文件
```http
GET /api/admin/developer/files/read?path=/path/to/file.txt

Response 200:
{
  "success": true,
  "content": "文件内容",
  "encoding": "utf8"
}
```

#### 35. 写入文件
```http
POST /api/admin/developer/files/write
Content-Type: application/json

{
  "path": "/path/to/file.txt",
  "content": "文件内容"
}

Response 200:
{
  "success": true,
  "message": "文件写入成功"
}
```

#### 36. 删除文件
```http
DELETE /api/admin/developer/files?path=/path/to/file.txt

Response 200:
{
  "success": true,
  "message": "文件删除成功"
}
```

#### 37. 创建目录
```http
POST /api/admin/developer/files/mkdir
Content-Type: application/json

{
  "path": "/path/to/directory"
}

Response 200:
{
  "success": true,
  "message": "目录创建成功"
}
```

#### 38. 上传文件
```http
POST /api/admin/developer/files/upload
Content-Type: multipart/form-data

path: /path/to/directory
file: [file]

Response 200:
{
  "success": true,
  "message": "文件上传成功",
  "filePath": "/path/to/directory/filename.ext"
}
```

#### 39. 下载文件
```http
GET /api/admin/developer/files/download?path=/path/to/file.txt&preview=false

Query Parameters:
- path: 文件路径
- preview (可选): 是否预览模式

Response 200:
[文件二进制数据]
```

#### 40. 执行SQL
```http
POST /api/admin/developer/execute-sql
Content-Type: application/json

{
  "sql": "SELECT * FROM users LIMIT 10"
}

Response 200:
{
  "success": true,
  "results": [...],
  "rowCount": 10
}
```

### 备份管理 (7个)

#### 41. 创建备份
```http
POST /api/admin/backup/create
Content-Type: application/json

{
  "type": "db"  // "db" 或 "full"
}

Response 200:
{
  "success": true,
  "message": "备份创建成功",
  "fileName": "backup-20251112-120000.db"
}
```

#### 42. 菜单备份
```http
POST /api/admin/menu/backup

Response 200:
{
  "success": true,
  "message": "菜单备份成功",
  "fileName": "menu-backup-20251112-120000.zip"
}
```

#### 43. 菜单导入
```http
POST /api/admin/menu/import
Content-Type: multipart/form-data

backupFile: [file]

Response 200:
{
  "success": true,
  "message": "菜单导入成功"
}
```

#### 44. 下载菜单备份
```http
GET /api/admin/menu/backup/download?fileName=menu-backup-20251112-120000.zip

Response 200:
[ZIP文件二进制数据]
```

#### 45. 获取备份列表
```http
GET /api/admin/backup/list

Response 200:
{
  "success": true,
  "backups": [
    {
      "fileName": "backup-20251112-120000.db",
      "size": 1024000,
      "createdAt": "2025-11-12T12:00:00.000Z"
    }
  ]
}
```

#### 46. 下载备份
```http
GET /api/admin/backup/download/:fileName

Response 200:
[备份文件二进制数据]
```

#### 47. 恢复备份
```http
POST /api/admin/backup/restore
Content-Type: application/json

{
  "fileName": "backup-20251112-120000.db"
}

Response 200:
{
  "success": true,
  "message": "备份恢复成功"
}
```

#### 48. 删除备份
```http
DELETE /api/admin/backup/delete
Content-Type: application/json

{
  "fileName": "backup-20251112-120000.db"
}

Response 200:
{
  "success": true,
  "message": "备份删除成功"
}
```

#### 49. 上传备份
```http
POST /api/admin/backup/upload
Content-Type: multipart/form-data

backupFile: [file]

Response 200:
{
  "success": true,
  "message": "备份上传成功",
  "fileName": "backup-20251112-120000.db"
}
```

### 清理工具 (2个)

#### 50. 获取清理信息
```http
GET /api/admin/cleanup/info?days=30&cleanPaymentScreenshots=false&cleanLogs=false

Query Parameters:
- days (可选): 清理天数，默认30
- cleanPaymentScreenshots (可选): 是否清理付款截图
- cleanLogs (可选): 是否清理日志

Response 200:
{
  "success": true,
  "info": {
    "oldOrders": 100,
    "oldPaymentScreenshots": 50,
    "oldLogs": 200,
    "totalSize": "10MB"
  }
}
```

#### 51. 执行清理
```http
POST /api/admin/cleanup/execute
Content-Type: application/json

{
  "days": 30,
  "cleanPaymentScreenshots": false,
  "cleanLogs": false
}

Response 200:
{
  "success": true,
  "message": "清理完成",
  "cleaned": {
    "orders": 100,
    "paymentScreenshots": 50,
    "logs": 200
  }
}
```

### 远程备份 (10个)

#### 52. 获取远程备份配置列表
```http
GET /api/admin/remote-backup/configs

Response 200:
{
  "success": true,
  "configs": [
    {
      "id": 1,
      "name": "主服务器",
      "target_url": "https://backup.example.com",
      "schedule_type": "daily",
      "schedule_time": "02:00",
      "enabled": true,
      "created_at": "2025-11-12T00:00:00.000Z"
    }
  ]
}
```

#### 53. 创建远程备份配置
```http
POST /api/admin/remote-backup/configs
Content-Type: application/json

{
  "name": "主服务器",
  "target_url": "https://backup.example.com",
  "api_token": "token123",
  "schedule_type": "daily",
  "schedule_time": "02:00",
  "schedule_day": null,
  "enabled": true
}

Response 200:
{
  "success": true,
  "message": "配置创建成功",
  "id": 1
}
```

#### 54. 更新远程备份配置
```http
PUT /api/admin/remote-backup/configs/:id
Content-Type: application/json

{
  "name": "更新后的名称",
  "enabled": false
}

Response 200:
{
  "success": true,
  "message": "配置更新成功"
}
```

#### 55. 删除远程备份配置
```http
DELETE /api/admin/remote-backup/configs/:id

Response 200:
{
  "success": true,
  "message": "配置删除成功"
}
```

#### 56. 推送备份到远程
```http
POST /api/admin/remote-backup/configs/:id/push

Response 200:
{
  "success": true,
  "message": "备份推送成功",
  "backupFileName": "backup-20251112-120000.db"
}
```

#### 57. 获取接收配置
```http
GET /api/admin/remote-backup/receive-config

Response 200:
{
  "success": true,
  "config": {
    "api_token": "token123",
    "auto_restore": false
  }
}
```

#### 58. 更新接收配置
```http
PUT /api/admin/remote-backup/receive-config
Content-Type: application/json

{
  "api_token": "newtoken123",
  "auto_restore": true
}

Response 200:
{
  "success": true,
  "message": "配置更新成功"
}
```

#### 59. 获取推送日志
```http
GET /api/admin/remote-backup/push-logs?config_id=1&limit=100&offset=0

Query Parameters:
- config_id (可选): 配置ID
- limit (可选): 限制数量
- offset (可选): 偏移量

Response 200:
{
  "success": true,
  "logs": [
    {
      "id": 1,
      "config_id": 1,
      "backup_file": "backup-20251112-120000.db",
      "status": "success",
      "message": "推送成功",
      "created_at": "2025-11-12T12:00:00.000Z"
    }
  ]
}
```

#### 60. 获取接收的备份列表
```http
GET /api/admin/remote-backup/received

Response 200:
{
  "success": true,
  "backups": [
    {
      "id": 1,
      "source_name": "主服务器",
      "backup_file": "backup-20251112-120000.db",
      "received_at": "2025-11-12T12:00:00.000Z"
    }
  ]
}
```

#### 61. 恢复接收的备份
```http
POST /api/admin/remote-backup/received/:id/restore

Response 200:
{
  "success": true,
  "message": "备份恢复成功"
}
```

### 其他 (1个)

#### 62. 测试邮件配置
```http
POST /api/admin/email/test

Response 200:
{
  "success": true,
  "message": "测试邮件发送成功"
}
```

#### 63. 接收远程备份
```http
POST /api/admin/remote-backup/receive
Content-Type: multipart/form-data

backupFile: [file]

Response 200:
{
  "success": true,
  "message": "备份接收成功",
  "backupId": 1
}
```

**认证要求**: 需要远程备份认证令牌

---

## 用户接口 (`/api/user`) - 8个端点

所有用户接口需要先登录（手机号）。

### 1. 创建订单
```http
POST /api/user/orders
Content-Type: application/json

{
  "items": [
    {
      "product_id": 1,
      "quantity": 2,
      "size": "large",
      "sugar_level": "50",
      "ice_level": "Less Ice",
      "toppings": [1, 2]
    }
  ],
  "customer_name": "张三",
  "notes": "备注信息"
}

Response 200:
{
  "success": true,
  "message": "订单创建成功",
  "order": {
    "id": "uuid",
    "order_number": "BO12345678",
    "total_amount": 50,
    "items": [...]
  }
}
```

### 2. 获取我的订单
```http
GET /api/user/orders

Response 200:
{
  "success": true,
  "orders": [
    {
      "id": "uuid",
      "order_number": "BO12345678",
      "total_amount": 50,
      "status": "pending",
      "items": [...],
      "cycle_id": 1,
      "cycle_number": "CYCLE20251112",
      "isActiveCycle": true,
      "isExpired": false
    }
  ]
}
```

### 3. 按手机号获取订单
```http
GET /api/user/orders/by-phone

Response 200:
{
  "success": true,
  "orders": [...]
}
```

### 4. 获取订单详情
```http
GET /api/user/orders/:id

Response 200:
{
  "success": true,
  "order": {
    "id": "uuid",
    "order_number": "BO12345678",
    "total_amount": 50,
    "discount_amount": 5,
    "final_amount": 45,
    "status": "pending",
    "items": [...]
  }
}
```

### 5. 删除订单
```http
DELETE /api/user/orders/:id

Response 200:
{
  "success": true,
  "message": "订单删除成功"
}
```

**限制**: 只能删除pending状态的订单，且点单必须开放

### 6. 更新订单
```http
PUT /api/user/orders/:id
Content-Type: application/json

{
  "items": [
    {
      "product_id": 1,
      "quantity": 3
    }
  ],
  "notes": "更新后的备注"
}

Response 200:
{
  "success": true,
  "message": "订单更新成功",
  "order": {
    "id": "uuid",
    "total_amount": 75,
    "items": [...]
  }
}
```

**限制**: 只能更新pending状态的订单，且点单必须开放

### 7. 上传付款截图
```http
POST /api/user/orders/:id/payment
Content-Type: multipart/form-data

payment_image: [file]

Response 200:
{
  "success": true,
  "message": "付款截图上传成功",
  "payment_image": "/uploads/payments/xxx.jpg"
}
```

**限制**: 点单必须已关闭，订单不能已取消或周期已确认

### 8. 获取订单汇总
```http
GET /api/user/orders-summary

Response 200:
{
  "success": true,
  "summary": {
    "total_orders": 10,
    "total_amount": 500,
    "total_discount": 50,
    "total_final_amount": 450,
    "orders": [...]
  }
}
```

---

## 公开接口 (`/api/public`) - 8个端点

无需认证即可访问。

### 1. 获取系统设置
```http
GET /api/public/settings

Response 200:
{
  "success": true,
  "settings": {
    "ordering_open": "true",
    "store_name": "博达奶茶点单系统",
    "contact_phone": "13800138000"
  }
}
```

### 2. 获取分类列表
```http
GET /api/public/categories

Response 200:
{
  "success": true,
  "categories": [
    {
      "id": 1,
      "name": "经典奶茶",
      "description": "经典系列奶茶",
      "status": "active"
    }
  ]
}
```

### 3. 获取产品列表
```http
GET /api/public/products?category_id=1

Query Parameters:
- category_id (可选): 分类ID过滤

Response 200:
{
  "success": true,
  "products": [
    {
      "id": 1,
      "name": "珍珠奶茶",
      "description": "经典珍珠奶茶",
      "price": 15,
      "category_id": 1,
      "category_name": "经典奶茶",
      "image_url": "/uploads/products/xxx.jpg"
    }
  ]
}
```

### 4. 获取订单详情（按订单号）
```http
GET /api/public/orders/:orderNumber

Response 200:
{
  "success": true,
  "order": {
    "id": "uuid",
    "order_number": "BO12345678",
    "total_amount": 50,
    "status": "pending",
    "items": [...]
  }
}
```

### 5. 获取折扣规则
```http
GET /api/public/discount-rules

Response 200:
{
  "success": true,
  "rules": [
    {
      "id": 1,
      "min_amount": 0,
      "max_amount": 50,
      "discount_rate": 0,
      "description": "满0元无折扣"
    }
  ]
}
```

### 6. 计算折扣
```http
POST /api/public/calculate-discount

Response 200:
{
  "success": true,
  "message": "折扣计算完成",
  "discount_applied": true,
  "discount_rate": 0.1,
  "total_amount": 1000
}
```

**说明**: 仅当点单已关闭时才能计算折扣

### 7. 获取周期折扣信息
```http
GET /api/public/cycle-discount

Response 200:
{
  "success": true,
  "cycle": {
    "id": 1,
    "cycle_number": "CYCLE20251112",
    "total_amount": 5000,
    "status": "active"
  },
  "currentDiscount": {
    "min_amount": 100,
    "discount_rate": 10
  },
  "nextDiscount": {
    "min_amount": 200,
    "discount_rate": 15
  }
}
```

### 8. 获取展示图片
```http
GET /api/public/show-images

Response 200:
{
  "success": true,
  "images": [
    {
      "filename": "image1.jpg",
      "url": "/show/image1.jpg"
    }
  ]
}
```

---

## 错误响应

所有错误响应格式：

```json
{
  "success": false,
  "message": "错误信息",
  "errors": [...]  // 可选，验证错误详情
}
```

常见错误码：
- `400` - 请求参数错误
- `401` - 未登录或认证失败
- `403` - 权限不足
- `404` - 资源不存在
- `500` - 服务器错误

---

## 频率限制

- 登录接口: 15分钟内最多5次
- 其他API: 15分钟内最多100次

超出限制返回：
```json
{
  "success": false,
  "message": "请求过于频繁，请稍后再试"
}
```

---

## 总结

本系统共提供 **89个API端点**：

- **认证接口** (`/api/auth`): 10个端点
- **管理员接口** (`/api/admin`): 63个端点
- **用户接口** (`/api/user`): 8个端点
- **公开接口** (`/api/public`): 8个端点

所有接口均支持JSON格式响应，文件上传接口使用`multipart/form-data`格式。
