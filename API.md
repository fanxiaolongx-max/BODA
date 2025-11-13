# API接口文档

## 基础信息

- **Base URL**: `http://localhost:3000/api`
- **认证方式**: Session Cookie
- **内容类型**: `application/json`

## 认证接口 (`/api/auth`)

### 管理员登录
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

### 管理员登出
```http
POST /api/auth/admin/logout

Response 200:
{
  "success": true,
  "message": "登出成功"
}
```

### 获取当前管理员信息
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

### 用户登录（手机号）
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

### 用户登出
```http
POST /api/auth/user/logout

Response 200:
{
  "success": true,
  "message": "登出成功"
}
```

## 管理员接口 (`/api/admin`)

所有管理员接口需要先登录认证。

### 分类管理

#### 获取所有分类
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

#### 创建分类
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

#### 更新分类
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

#### 删除分类
```http
DELETE /api/admin/categories/:id

Response 200:
{
  "success": true,
  "message": "分类删除成功"
}
```

### 菜品管理

#### 获取所有菜品
```http
GET /api/admin/products?category_id=1&status=active

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

#### 创建菜品
```http
POST /api/admin/products
Content-Type: multipart/form-data

name: 新菜品
description: 描述
price: 20
category_id: 1
sort_order: 0
status: active
image: [file]

Response 200:
{
  "success": true,
  "message": "菜品创建成功",
  "id": 13
}
```

#### 更新菜品
```http
PUT /api/admin/products/:id
Content-Type: multipart/form-data

name: 更新后的名称
price: 22
...

Response 200:
{
  "success": true,
  "message": "菜品更新成功"
}
```

#### 删除菜品
```http
DELETE /api/admin/products/:id

Response 200:
{
  "success": true,
  "message": "菜品删除成功"
}
```

### 折扣规则管理

#### 获取折扣规则
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

#### 批量更新折扣规则
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
      "discount_rate": 0.1,
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

### 订单管理

#### 获取订单列表
```http
GET /api/admin/orders?status=pending&phone=138&date=2025-11-12

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
      "items": [
        {
          "id": 1,
          "product_id": 1,
          "product_name": "珍珠奶茶",
          "product_price": 15,
          "quantity": 2,
          "subtotal": 30
        }
      ]
    }
  ]
}
```

#### 获取订单统计
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

#### 更新订单状态
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

### 用户管理

#### 获取用户列表
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

### 系统设置

#### 获取设置
```http
GET /api/admin/settings

Response 200:
{
  "success": true,
  "settings": {
    "ordering_open": "false",
    "ordering_end_time": "",
    "system_name": "博达奶茶点单系统",
    "contact_phone": ""
  }
}
```

#### 更新设置
```http
POST /api/admin/settings
Content-Type: application/json

{
  "ordering_open": "true",
  "system_name": "新名称"
}

Response 200:
{
  "success": true,
  "message": "设置更新成功"
}
```

### 操作日志

#### 获取日志
```http
GET /api/admin/logs?page=1&limit=50&action=LOGIN&admin_id=1

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
    "limit": 50,
    "total": 100
  }
}
```

## 用户接口 (`/api/user`)

所有用户接口需要先登录（手机号）。

### 创建订单
```http
POST /api/user/orders
Content-Type: application/json

{
  "items": [
    {
      "product_id": 1,
      "quantity": 2
    },
    {
      "product_id": 2,
      "quantity": 1
    }
  ],
  "customer_name": "张三"
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

### 获取我的订单
```http
GET /api/user/orders

Response 200:
{
  "success": true,
  "orders": [...]
}
```

### 获取订单详情
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

### 上传付款截图
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

## 公开接口 (`/api/public`)

无需认证即可访问。

### 获取系统设置
```http
GET /api/public/settings

Response 200:
{
  "success": true,
  "settings": {
    "ordering_open": "true",
    ...
  }
}
```

### 获取分类列表
```http
GET /api/public/categories

Response 200:
{
  "success": true,
  "categories": [...]
}
```

### 获取菜品列表
```http
GET /api/public/products?category_id=1

Response 200:
{
  "success": true,
  "products": [...]
}
```

### 获取折扣规则
```http
GET /api/public/discount-rules

Response 200:
{
  "success": true,
  "rules": [...]
}
```

### 计算折扣
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

