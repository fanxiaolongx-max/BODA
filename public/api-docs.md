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

---

# 外部API管理接口（/api/external/custom-apis）

以下内容来自 `docs/EXTERNAL_API_GUIDE.md`，用于管理自定义API（需要 API Token）。

# 外部API管理接口完整指南

## 一、接口概览

所有外部API管理接口位于 `/api/external/custom-apis`，使用API Token认证。

### 基础信息

- **Base URL**: `http://localhost:3000/api/external`
- **认证方式**: API Token
  - 请求头: `X-API-Token: <token>`
  - 或: `Authorization: Bearer <token>`
  - 或: 查询参数 `?token=<token>`（不推荐）
- **内容类型**: `application/json`
- **速率限制**: 100次/15分钟

## 二、完整API接口列表

### 1. 获取API列表

**GET** `/api/external/custom-apis`

**查询参数**:
- `page` (可选): 页码，默认1
- `limit` (可选): 每页数量，默认50，最大100
- `status` (可选): 过滤状态，`active` 或 `inactive`
- `method` (可选): 过滤请求方法，`GET`, `POST`, `PUT`, `DELETE`, `PATCH`

**请求示例**:
```bash
curl -X GET \
  -H "X-API-Token: your-token" \
  "http://localhost:3000/api/external/custom-apis?page=1&limit=50&status=active"
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "apis": [
      {
        "id": 1,
        "name": "热门打卡地",
        "path": "/hot-spots",
        "method": "GET",
        "requires_token": false,
        "description": "热门打卡地列表",
        "status": "active",
        "created_at": "2025-01-15 10:00:00",
        "updated_at": "2025-01-15 10:00:00"
      }
    ],
    "total": 10,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

### 2. 获取API详情

**GET** `/api/external/custom-apis/:id`

**请求示例**:
```bash
curl -X GET \
  -H "X-API-Token: your-token" \
  http://localhost:3000/api/external/custom-apis/1
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "热门打卡地",
    "path": "/hot-spots",
    "method": "GET",
    "requires_token": false,
    "response_content": "[{\"id\":1,\"name\":\"金字塔\",\"detailApi\":\"...\"}]",
    "description": "热门打卡地列表",
    "status": "active",
    "created_at": "2025-01-15 10:00:00",
    "updated_at": "2025-01-15 10:00:00"
  }
}
```

### 3. 创建API

**POST** `/api/external/custom-apis`

**请求体**:
```json
{
  "name": "新API",
  "path": "/new-api",
  "method": "GET",
  "requires_token": false,
  "response_content": "[{\"id\":1,\"name\":\"项目1\",\"detailApi\":\"https://bobapro.life/api/custom/new-api/1/detail\"}]",
  "description": "新创建的API",
  "status": "active"
}
```

**请求示例**:
```bash
curl -X POST \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "新API",
    "path": "/new-api",
    "method": "GET",
    "response_content": "[{\"id\":1,\"name\":\"项目1\",\"detailApi\":\"https://bobapro.life/api/custom/new-api/1/detail\"}]"
  }' \
  http://localhost:3000/api/external/custom-apis
```

**响应示例**:
```json
{
  "success": true,
  "message": "自定义API创建成功",
  "data": {
    "id": 2
  }
}
```

### 4. 更新API

**PUT** `/api/external/custom-apis/:id`

**请求体**（所有字段可选，但至少提供一个）:
```json
{
  "name": "更新后的名称",
  "status": "inactive"
}
```

**请求示例**:
```bash
curl -X PUT \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "更新后的名称",
    "status": "inactive"
  }' \
  http://localhost:3000/api/external/custom-apis/1
```

**响应示例**:
```json
{
  "success": true,
  "message": "自定义API更新成功"
}
```

### 5. 删除API

**DELETE** `/api/external/custom-apis/:id`

**请求示例**:
```bash
curl -X DELETE \
  -H "X-API-Token: your-token" \
  http://localhost:3000/api/external/custom-apis/1
```

**响应示例**:
```json
{
  "success": true,
  "message": "自定义API删除成功"
}
```

### 6. 部分更新API内容 ⭐ 新增功能

**PATCH** `/api/external/custom-apis/:id/content`

支持对 `response_content` 进行部分更新，无需替换整个JSON。

#### 6.1 更新字段值

**操作**: `update` 或 `add`

**请求示例**:
```bash
# 更新 data[0].name
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "0.name",
    "value": "更新后的名称"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content

# 更新嵌套字段 data[0].category
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "data.0.category",
    "value": "新分类"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

#### 6.2 追加元素到数组

**操作**: `append`

**请求示例**:
```bash
# 追加到数组末尾
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "data",
    "value": {
      "id": 10,
      "name": "新项目",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/10/detail"
    }
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

#### 6.3 删除数组元素

**操作**: `delete`

**请求示例**:
```bash
# 通过索引删除 data[0]
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "delete",
    "path": "data.0"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content

# 通过值匹配删除
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "delete",
    "path": "data",
    "value": {"id": 2, "name": "要删除的项目"}
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

#### 6.4 删除字段

**操作**: `remove`

**请求示例**:
```bash
# 删除 data[0].oldField
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "remove",
    "path": "data.0.oldField"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

**响应示例**:
```json
{
  "success": true,
  "message": "内容更新成功",
  "data": {
    "updated_content": { /* 更新后的完整内容 */ }
  }
}
```

### 7. 获取API调用日志

**GET** `/api/external/custom-apis/:id/logs`

**查询参数**:
- `page` (可选): 页码，默认1
- `limit` (可选): 每页数量，默认50，最大100

**请求示例**:
```bash
curl -X GET \
  -H "X-API-Token: your-token" \
  "http://localhost:3000/api/external/custom-apis/1/logs?page=1&limit=50"
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": 1,
        "request_method": "GET",
        "request_path": "/api/custom/hot-spots",
        "response_status": 200,
        "response_time_ms": 15,
        "ip_address": "127.0.0.1",
        "created_at": "2025-01-15 10:00:00"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 50,
    "totalPages": 2
  }
}
```

## 三、实际使用场景示例

### 场景1：创建热门打卡地API

```bash
# 1. 创建列表API
curl -X POST \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "热门打卡地",
    "path": "/hot-spots",
    "method": "GET",
    "response_content": "[{\"id\":1,\"name\":\"金字塔\",\"title\":\"金字塔详情\",\"description\":\"世界七大奇迹之一\",\"image\":\"https://example.com/pyramid.jpg\",\"category\":\"景点\",\"detailApi\":\"https://bobapro.life/api/custom/hot-spots/1/detail\"}]",
    "description": "热门打卡地列表",
    "status": "active"
  }' \
  http://localhost:3000/api/external/custom-apis

# 响应: {"success": true, "data": {"id": 1}}
```

### 场景2：添加新项目到列表

```bash
# 假设API ID是1，response_content是数组格式
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "",
    "value": {
      "id": 2,
      "name": "狮身人面像",
      "title": "狮身人面像详情",
      "description": "古埃及著名古迹",
      "image": "https://example.com/sphinx.jpg",
      "category": "景点",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/2/detail"
    }
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

### 场景3：更新项目信息

```bash
# 更新第一个项目的名称
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "0.name",
    "value": "金字塔（更新）"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content

# 更新第一个项目的分类
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "0.category",
    "value": "世界遗产"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

### 场景4：删除项目

```bash
# 删除第一个项目（索引0）
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "delete",
    "path": "0"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

### 场景5：批量操作

```bash
# 批量添加多个项目
for i in {3..5}; do
  curl -X PATCH \
    -H "X-API-Token: your-token" \
    -H "Content-Type: application/json" \
    -d "{
      \"operation\": \"append\",
      \"path\": \"\",
      \"value\": {
        \"id\": $i,
        \"name\": \"项目$i\",
        \"detailApi\": \"https://bobapro.life/api/custom/hot-spots/$i/detail\"
      }
    }" \
    http://localhost:3000/api/external/custom-apis/1/content
done
```

## 四、字段结构标准

### 列表API标准字段

所有列表API返回的数据项必须包含以下字段：

**必填字段**:
- `id`: 唯一标识符
- `name`: 名称（用于卡片显示）
- `detailApi`: 详情API地址

**可选字段**:
- `title`: 标题（用于详情页标题）
- `description`: 描述信息
- `image`: 图片URL
- `category`: 分类

**标准格式示例**:
```json
{
  "id": 1,
  "name": "项目名称",
  "title": "详情页标题",
  "description": "项目描述",
  "image": "https://example.com/image.jpg",
  "category": "分类",
  "detailApi": "https://bobapro.life/api/custom/path/1/detail"
}
```

### 详情API标准格式

详情API应返回HTML内容：

```json
{
  "content": "<h2>标题</h2><p>HTML内容...</p>",
  "title": "文章标题",
  "meta": "2024-01-15"
}
```

或：

```json
{
  "html": "<h2>标题</h2><p>HTML内容...</p>",
  "title": "文章标题"
}
```

## 五、路径表达式说明

部分更新接口使用路径表达式来指定要修改的位置：

### 路径格式

- **对象字段**: 使用点号分隔，如 `data.name`、`user.profile.email`
- **数组索引**: 使用数字索引，如 `items.0`、`data.list.2`
- **混合路径**: 如 `data.items.0.name`

### 示例

假设 `response_content` 是：
```json
{
  "data": [
    {
      "id": 1,
      "name": "项目1",
      "category": "分类1"
    }
  ]
}
```

路径示例：
- `data.0.name` - 更新第一个项目的名称
- `data.0.category` - 更新第一个项目的分类
- `data` - 追加元素到data数组

## 六、错误处理

### 错误响应格式

```json
{
  "success": false,
  "message": "错误描述",
  "code": "ERROR_CODE"
}
```

### 常见错误码

| 错误码 | HTTP状态 | 说明 |
|--------|----------|------|
| `UNAUTHORIZED` | 401 | Token无效或缺失 |
| `NOT_FOUND` | 404 | API不存在 |
| `VALIDATION_ERROR` | 400 | 参数验证失败 |
| `DUPLICATE_PATH` | 400 | 路径已存在 |
| `INVALID_JSON` | 400 | JSON格式无效 |
| `OPERATION_FAILED` | 400 | 操作失败（路径不存在） |
| `SERVER_ERROR` | 500 | 服务器错误 |

## 七、配置API Token

API Token需要在管理后台配置：

1. 登录管理后台
2. 进入"系统设置"
3. 找到"自定义API Token"设置
4. 设置强随机字符串作为Token
5. 保存设置

**安全建议**:
- 使用至少32字符的强随机字符串
- 定期轮换Token
- 不要在代码中硬编码Token
- 使用环境变量存储Token

## 八、测试建议

### 使用curl测试

```bash
# 设置Token变量
export API_TOKEN="your-token"

# 获取列表
curl -H "X-API-Token: $API_TOKEN" \
  http://localhost:3000/api/external/custom-apis

# 创建API
curl -X POST \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @api-data.json \
  http://localhost:3000/api/external/custom-apis
```

### 使用Postman测试

1. 创建新请求
2. 设置URL: `http://localhost:3000/api/external/custom-apis`
3. 添加Header: `X-API-Token: your-token`
4. 选择请求方法（GET/POST/PUT/DELETE/PATCH）
5. 发送请求

## 九、迁移脚本

已创建自动迁移脚本，可以将旧数据迁移到新格式：

```bash
node db/migrate-custom-api-fields.js
```

迁移脚本会自动：
- 为缺少 `name` 的项从 `title` 生成
- 为缺少 `detailApi` 的项生成标准格式的详情API地址
- 保留所有扩展字段
- 确保所有必填字段都存在

## 十、完整工作流程示例

### 创建并管理一个完整的API

```bash
# 1. 创建列表API
API_ID=$(curl -s -X POST \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试API",
    "path": "/test",
    "method": "GET",
    "response_content": "[]",
    "status": "active"
  }' \
  http://localhost:3000/api/external/custom-apis | jq -r '.data.id')

echo "创建的API ID: $API_ID"

# 2. 添加第一个项目
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d "{
    \"operation\": \"append\",
    \"path\": \"\",
    \"value\": {
      \"id\": 1,
      \"name\": \"项目1\",
      \"detailApi\": \"https://bobapro.life/api/custom/test/1/detail\"
    }
  }" \
  http://localhost:3000/api/external/custom-apis/$API_ID/content

# 3. 添加第二个项目
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d "{
    \"operation\": \"append\",
    \"path\": \"\",
    \"value\": {
      \"id\": 2,
      \"name\": \"项目2\",
      \"detailApi\": \"https://bobapro.life/api/custom/test/2/detail\"
    }
  }" \
  http://localhost:3000/api/external/custom-apis/$API_ID/content

# 4. 更新第一个项目
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d "{
    \"operation\": \"update\",
    \"path\": \"0.name\",
    \"value\": \"更新后的项目1\"
  }" \
  http://localhost:3000/api/external/custom-apis/$API_ID/content

# 5. 查看API详情
curl -H "X-API-Token: your-token" \
  http://localhost:3000/api/external/custom-apis/$API_ID

# 6. 查看调用日志
curl -H "X-API-Token: your-token" \
  http://localhost:3000/api/external/custom-apis/$API_ID/logs
```

## 十一、注意事项

1. **detailApi必填**: 所有列表项必须包含 `detailApi` 字段
2. **name必填**: 所有列表项必须包含 `name` 字段
3. **路径格式**: 路径必须以 `/` 开头
4. **JSON格式**: 所有 `response_content` 必须是有效的JSON
5. **路径唯一性**: 同一路径和方法组合只能存在一个API
6. **Token安全**: 生产环境请使用强随机Token
7. **速率限制**: 注意不要超过100次/15分钟的限制

## 十二、相关文档

- [自定义API使用示例](./CUSTOM_API_EXAMPLES.md) - 详细的字段结构和示例
- [API文档](./API.md) - 完整的API接口文档
- [安全文档](./SECURITY.md) - 安全配置和最佳实践

---

# 自定义API运行时接口（/api/custom/*）

> 说明：此类接口为“运行时动态API”。路径与方法由后台“自定义API管理”配置决定。

## 基础信息

- **Base URL**: `http://localhost:3000/api/custom`
- **认证方式**：
  - 如果该 API 设置为 `requires_token = true`：
    - `X-API-Token: <token>`
    - 或 `Authorization: Bearer <token>`
    - 或 `?token=<token>`（不推荐）
  - 若启用了 Session（管理员或用户），也可使用 Cookie 自动鉴权

## 请求示例

```bash
curl -X GET \
  -H "X-API-Token: your-token" \
  "http://localhost:3000/api/custom/hot-spots"
```

## 响应示例

```json
[{
  "id": 1,
  "name": "金字塔",
  "detailApi": "https://example.com/api/custom/hot-spots/1/detail"
}]
```

## 已停用API的返回（410）

当 API 处于 `inactive` 时，会返回 410 并指向迁移后的替代接口。

```json
{
  "success": false,
  "message": "此API已停用。二手集市已迁移到博客文章系统。",
  "deprecated": true,
  "replacement": "/api/blog/posts?category=二手市场"
}
```

---

# 博客前台 API（/api/blog）

## 认证说明

- 读取类接口大多可匿名访问。
- 点赞 / 收藏 / 评论 / 我的数据 需要登录（Session 或 Token）。
- Token 支持：`X-User-Token` 或 `Authorization: Bearer <token>` 或 `?token=`。

## 1. 获取文章列表

**GET** `/api/blog/posts`

**查询参数**
- `page` (可选, 默认 1)
- `pageSize` (可选, 默认 6)
- `category` (可选)
- `search` (可选)
- `published` (可选, 默认 true)
- `myPosts` (可选, 默认 false；需登录)

**响应示例**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "标题",
      "slug": "slug",
      "excerpt": "...",
      "image": "https://...",
      "category": "分类",
      "published": true,
      "views": 123,
      "likesCount": 12,
      "favoritesCount": 3,
      "commentsCount": 2
    }
  ],
  "pagination": {
    "currentPage": 1,
    "pageSize": 6,
    "total": 20,
    "totalPages": 4
  }
}
```

## 2. 获取文章详情

**GET** `/api/blog/posts/:slug`

**查询参数**
- `includeComments` (可选, true/false, 默认 true)
- `commentsPage` (可选, 默认 1)
- `commentsPageSize` (可选, 默认 10, 最大 100)

## 3. 获取分类

**GET** `/api/blog/categories`

## 4. 获取评论列表

**GET** `/api/blog/posts/:postId/comments`

**查询参数**
- `page` (可选, 默认 1)
- `pageSize` (可选, 默认 10)

## 5. 创建评论（需登录）

**POST** `/api/blog/posts/:postId/comments`

**请求体**
```json
{
  "content": "评论内容",              // 必填
  "authorName": "昵称",              // 可选
  "authorEmail": "xx@xx.com",        // 可选
  "parentId": "comment-id"           // 可选（回复）
}
```

## 6. 搜索文章

**GET** `/api/blog/search`

**查询参数**
- `q` (必填)
- `page` (可选, 默认 1)
- `pageSize` (可选, 默认 10)

## 7. 记录阅读量

**POST** `/api/blog/posts/:slug/views`

## 8. 点赞 / 取消点赞（需登录）

- **POST** `/api/blog/posts/:postId/like`
- **DELETE** `/api/blog/posts/:postId/like`

## 9. 收藏 / 取消收藏（需登录）

- **POST** `/api/blog/posts/:postId/favorite`
- **DELETE** `/api/blog/posts/:postId/favorite`

## 10. 获取互动数据（点赞/收藏/评论）

- **GET** `/api/blog/posts/:postId/interactions`
- **GET** `/api/blog/comments/:commentId/interactions`

## 11. 评论点赞 / 取消点赞（需登录）

- **POST** `/api/blog/comments/:commentId/like`
- **DELETE** `/api/blog/comments/:commentId/like`

## 12. 删除评论（需登录且有权限）

- **DELETE** `/api/blog/posts/:postId/comments/:commentId`

## 13. 我的数据（需登录）

- **GET** `/api/blog/posts/my-likes`
- **GET** `/api/blog/posts/my-favorites`
- **GET** `/api/blog/my-comments`
- **GET** `/api/blog/my-posts-interactions`
- **POST** `/api/blog/my-posts-interactions/mark-as-read`

---

# 博客管理 API（/api/blog-admin）

## 认证方式

`requireBlogAuth` 支持四种：

1. 管理员 Session Cookie（后台登录）
2. 普通用户 Session Cookie
3. 用户 Token：`X-User-Token` / `Authorization: Bearer`
4. API Token：`X-API-Token` / `Authorization: Bearer`

## 1. 文章管理

- **GET** `/api/blog-admin/posts`（支持分页、过滤、查询）
- **GET** `/api/blog-admin/posts/:id`
- **POST** `/api/blog-admin/posts`
- **PUT** `/api/blog-admin/posts/:id`
- **DELETE** `/api/blog-admin/posts/:id`
- **POST** `/api/blog-admin/posts/batch-publish`

**POST / PUT 请求体常见字段**
```json
{
  "name": "标题",
  "excerpt": "摘要",
  "htmlContent": "<p>...</p>",
  "image": "https://...",
  "category": "分类",
  "published": true,
  "customFields": { "price": 1000 }
}
```

## 2. 分类管理

- **GET** `/api/blog-admin/categories`
- **POST** `/api/blog-admin/categories`
- **PUT** `/api/blog-admin/categories/:id`
- **DELETE** `/api/blog-admin/categories/:id`

## 3. 评论管理

- **GET** `/api/blog-admin/comments`
- **PUT** `/api/blog-admin/comments/:id/approve`
- **DELETE** `/api/blog-admin/comments/:id`

## 4. API字段映射配置

- **GET** `/api/blog-admin/apis`
- **GET** `/api/blog-admin/apis/:apiName/field-mapping`
- **PUT** `/api/blog-admin/apis/:apiName/field-mapping`

## 5. 上传与特殊内容

- **POST** `/api/blog-admin/upload`（表单上传）
- **GET** `/api/blog-admin/special-content/:type`
- **PUT** `/api/blog-admin/special-content/:type`

---

# TTS 语音合成 API（/api/tts）

**POST** `/api/tts`

**请求体**
```json
{
  "text": "你好，欢迎使用TTS",
  "lang": "zh",             // zh 或 ar
  "format": "mp3"           // 可选: mp3 / aac
}
```

**响应示例**
```json
{
  "success": true,
  "audioUrl": "https://your-domain/uploads/tts/xxxx.mp3"
}
```

---

# Telegram Webhook（/api/telegram）

**POST** `/api/telegram/webhook/:token`

- 供 Telegram Bot Webhook 回调使用
- `:token` 必须与服务器配置的 Bot Token 匹配

---

# 系统与健康检查

- **GET** `/health` 健康检查
- **GET** `/dine-in?table=xxx` 堂食扫码登录（重定向到 `/api/public/dine-in/login`）
- **GET** `/digital-certificate.txt` / `/private-key.pem`（QZ Tray 证书）


---

# 博客接口详细字段说明（/api/blog）

## 统一字段说明（文章对象）

**字段** | **类型** | **说明**
---|---|---
`id` | `string` | 全局唯一 UUID
`name` | `string` | 文章名称（与 `title` 保持一致）
`title` | `string` | 文章标题（与 `name` 保持一致）
`slug` | `string` | URL 友好标识，唯一
`excerpt` | `string` | 摘要（与 `description` 保持一致）
`description` | `string` | 描述（与 `excerpt` 保持一致）
`htmlContent` | `string` | 文章 HTML 内容。列表场景会被截断或省略，详情接口返回完整内容
`image` | `string | null` | 封面图 URL
`category` | `string` | 分类（通常等于 API 名称）
`apiName` | `string` | API 分类名称（部分接口返回）
`published` | `boolean` | 是否发布
`views` | `number` | 阅读量
`likesCount` | `number` | 点赞数（统计字段）
`favoritesCount` | `number` | 收藏数（统计字段）
`commentsCount` | `number` | 评论数（统计字段）
`createdAt` | `string` | 创建时间（ISO 字符串，包含时区）
`updatedAt` | `string` | 更新时间（ISO 字符串，包含时区）
`canEdit` | `boolean` | 是否允许编辑（仅登录用户且为作者时出现）
`customFields` | `object` | 扩展字段（后台使用，部分接口返回）

**可能出现在文章对象中的扩展字段**（由 `custom_fields` 展开）：
- `price` / `rooms` / `area`
- `phone` / `address` / `latitude` / `longitude`
- `nickname` / `deviceModel` / `deviceId` / `deviceIp`
- `'_specialType'` / `'_specialData'`（天气/汇率/翻译等特殊卡片数据）

## 文章列表 - 响应结构

**GET** `/api/blog/posts`

```json
{
  "success": true,
  "data": [/* 文章对象（列表场景） */],
  "pagination": {
    "currentPage": 1,
    "pageSize": 6,
    "total": 20,
    "totalPages": 4
  }
}
```

**列表场景行为**
- `htmlContent` 仅保留前 10 个字符用于轻量预览，或直接省略。
- 未发布文章仅在 `myPosts=true` 且已登录时可见。

## 文章详情 - 响应结构

**GET** `/api/blog/posts/:slug`

```json
{
  "success": true,
  "data": { /* 文章对象（详情场景，含完整 htmlContent） */ },
  "comments": {
    "comments": [/* 评论树结构 */],
    "total": 12,
    "totalPages": 2,
    "currentPage": 1
  }
}
```

## 评论对象字段

**字段** | **类型** | **说明**
---|---|---
`id` | `string` | 评论 ID
`postId` | `string` | 文章 ID
`content` | `string` | 评论内容
`authorName` | `string` | 作者名称
`authorEmail` | `string` | 作者邮箱（可选）
`parentId` | `string | null` | 父评论 ID（回复）
`createdAt` | `string` | 创建时间
`likesCount` | `number` | 点赞数
`children` | `array` | 子评论（树结构）

---

# 博客管理接口详细字段说明（/api/blog-admin）

## 认证方式

- 管理员 Session Cookie（推荐）
- 普通用户 Session Cookie（部分功能）
- `X-User-Token` / `Authorization: Bearer`
- `X-API-Token` / `Authorization: Bearer`

## 1. 文章列表（含管理字段）

**GET** `/api/blog-admin/posts`

**常用查询参数**
- `page` / `pageSize`
- `category`
- `search`
- `published`（true/false）

**响应结构**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "apiName": "分类API",
      "name": "标题",
      "title": "标题",
      "slug": "slug",
      "excerpt": "摘要",
      "description": "摘要",
      "htmlContent": "<p>...</p>",
      "image": "https://...",
      "category": "分类",
      "published": true,
      "views": 12,
      "likesCount": 3,
      "favoritesCount": 1,
      "commentsCount": 0,
      "createdAt": "2026-01-01T10:00:00+02:00",
      "updatedAt": "2026-01-01T12:00:00+02:00",
      "customFields": { "price": 1000 }
    }
  ],
  "pagination": { "currentPage": 1, "pageSize": 20, "total": 120, "totalPages": 6 }
}
```

## 2. 创建文章

**POST** `/api/blog-admin/posts`

**请求体字段**
- `apiName`（必填，分类 API 名称）
- `name` 或 `title`（至少一个）
- `excerpt` / `description`
- `htmlContent`
- `image`
- `category`
- `published`（boolean）
- 扩展字段（如 `price` / `rooms` / `area` / `phone` 等）会存入 `custom_fields`

**响应结构**
```json
{ "success": true, "message": "创建成功", "data": { /* 新文章对象 */ } }
```

## 3. 更新文章

**PUT** `/api/blog-admin/posts/:id`

- 与创建字段一致，支持部分更新
- 更新 `slug` 时会自动做唯一性校验

## 4. 删除文章

**DELETE** `/api/blog-admin/posts/:id`

**响应结构**
```json
{ "success": true, "message": "删除成功" }
```

## 5. 分类管理

- **GET** `/api/blog-admin/categories`
- **POST** `/api/blog-admin/categories`
- **PUT** `/api/blog-admin/categories/:id`
- **DELETE** `/api/blog-admin/categories/:id`

分类对象常见字段：`id` `name` `description` `createdAt` `updatedAt`

## 6. 评论管理

- **GET** `/api/blog-admin/comments`
- **PUT** `/api/blog-admin/comments/:id/approve`
- **DELETE** `/api/blog-admin/comments/:id`

## 7. 上传

**POST** `/api/blog-admin/upload`

- `multipart/form-data`
- 字段：`file`

**响应**：`{ success: true, url: "https://..." }`

## 8. 特殊内容（天气/汇率/翻译）

- **GET** `/api/blog-admin/special-content/:type`
- **PUT** `/api/blog-admin/special-content/:type`

`type` 常见值：`weather` / `exchange-rate` / `translation`

---

# 管理后台高级接口补充（/api/admin/developer）

> 仅 `super_admin` 可访问。

## 数据库表

### 获取表列表

**GET** `/api/admin/developer/tables`

**响应**
```json
{ "success": true, "tables": [ { "name": "users", "rowCount": 120 } ] }
```

### 获取表结构

**GET** `/api/admin/developer/table-schema/:tableName`

**响应**
```json
{ "success": true, "schema": [ { "cid": 0, "name": "id", "type": "INTEGER", "pk": 1 } ] }
```

### 获取表数据

**GET** `/api/admin/developer/table-data/:tableName?limit=1000&offset=0`

**响应**
```json
{ "success": true, "data": [ { "id": 1, "name": "..." } ] }
```

### 更新表数据

**PUT** `/api/admin/developer/table-data/:tableName`

**请求体**
```json
{
  "updates": [ { "id": 1, "name": "new" } ],
  "deletes": [ 2, 3 ],
  "inserts": [ { "name": "created" } ]
}
```

**响应**
```json
{ "success": true, "message": "Changes saved successfully" }
```

## 文件管理

### 列出目录

**GET** `/api/admin/developer/files/list?path=subdir`

**响应**
```json
{
  "success": true,
  "path": "subdir",
  "items": [
    { "name": "file.txt", "path": "subdir/file.txt", "isDirectory": false, "size": 123, "modified": "...", "permissions": "644" }
  ]
}
```

### 读取文件

**GET** `/api/admin/developer/files/read?path=some.txt`

**响应**
```json
{ "success": true, "path": "some.txt", "content": "...", "isTextFile": true, "size": 12 }
```

### 写入文件

**POST** `/api/admin/developer/files/write`

**请求体**
```json
{ "path": "notes.txt", "content": "hello" }
```

### 删除文件/目录

**DELETE** `/api/admin/developer/files?path=dir_or_file`

### 创建目录

**POST** `/api/admin/developer/files/mkdir`

**请求体**
```json
{ "path": "new-dir" }
```

### 上传文件

**POST** `/api/admin/developer/files/upload`

- `multipart/form-data`
- 字段：`file`、`path`（目标路径）

### 下载/预览

**GET** `/api/admin/developer/files/download?path=xxx&preview=true`

## SQL 执行

**POST** `/api/admin/developer/execute-sql`

**请求体**
```json
{ "sql": "SELECT * FROM users LIMIT 10" }
```

**响应**
```json
{ "success": true, "result": [ { "id": 1 } ] }
```

> 仅允许 `SELECT/INSERT/UPDATE/DELETE/PRAGMA`，禁止 `DROP/ALTER/CREATE/TRUNCATE/EXEC`。

## 测试运行

### 获取测试套件

**GET** `/api/admin/developer/test-suites`

**响应**
```json
{ "success": true, "suites": [ { "name": "routes/admin.test.js", "displayName": "管理员接口测试", "testCount": 12 } ] }
```

### 运行测试

**POST** `/api/admin/developer/run-tests`

**请求体**
```json
{ "suites": ["tests/routes/admin.test.js", "tests/routes/auth.test.js"] }
```

### 获取进度

**GET** `/api/admin/developer/test-progress`

**响应**
```json
{ "success": true, "running": true, "completed": false, "progress": { "current": 3, "total": 20, "currentTest": "..." }, "logs": [] }
```

### 停止测试

**POST** `/api/admin/developer/stop-tests`

### 获取测试报告

**GET** `/api/admin/developer/test-report`

返回 HTML 报告（若未生成会返回占位页）。


---

# 管理后台高级接口补充（备份/远程备份/菜单导入）

## 数据库备份

### 创建备份
**POST** `/api/admin/backup/create`

请求体：
```json
{ "type": "db" }  // 可选: db | full
```

响应：
```json
{ "success": true, "fileName": "boda-backup-xxx.db", "sizeMB": 12.3, "type": "db" }
```

### 备份列表
**GET** `/api/admin/backup/list`

响应：
```json
{ "success": true, "backups": [ { "fileName": "...", "size": 123456, "sizeMB": 12.3, "created": "...", "type": "db" } ] }
```

### 下载备份
**GET** `/api/admin/backup/download/:fileName`

### 恢复备份
**POST** `/api/admin/backup/restore`

请求体：
```json
{ "fileName": "boda-backup-xxx.db" }
```

### 删除备份
**DELETE** `/api/admin/backup/delete`

请求体：
```json
{ "fileName": "boda-backup-xxx.db" }
```

### 上传备份
**POST** `/api/admin/backup/upload`

`multipart/form-data`，字段：`backupFile`

---

## 菜单数据备份与导入

### 创建菜单备份（含图片）
**POST** `/api/admin/menu/backup`

响应：
```json
{ "success": true, "fileName": "menu-backup-xxx.zip", "sizeMB": 3.2, "categories": 12, "products": 88, "images": 40 }
```

### 下载菜单备份
**GET** `/api/admin/menu/backup/download?fileName=menu-backup-xxx.zip`

### 导入菜单备份
**POST** `/api/admin/menu/import`

`multipart/form-data`，字段：
- `backupFile`（zip）
- `clearExisting`（可选，true/false，是否清空现有数据）

---

## 远程备份（Push / Receive）

### 远程备份配置
- **GET** `/api/admin/remote-backup/configs`
- **POST** `/api/admin/remote-backup/configs`
- **PUT** `/api/admin/remote-backup/configs/:id`
- **DELETE** `/api/admin/remote-backup/configs/:id`

### 推送备份
**POST** `/api/admin/remote-backup/configs/:id/push`

### 接收端配置
- **GET** `/api/admin/remote-backup/receive-config`
- **PUT** `/api/admin/remote-backup/receive-config`

### 推送日志
**GET** `/api/admin/remote-backup/push-logs`

### 已接收备份列表
**GET** `/api/admin/remote-backup/received`

### 恢复接收的备份
**POST** `/api/admin/remote-backup/received/:id/restore`

### 接收端上传入口（服务器对服务器）
**POST** `/api/admin/remote-backup/receive`

该接口使用专用密钥校验，用于远程服务器推送备份文件。

