# API测试覆盖率清单

本文档列出所有89个API端点及其测试状态。

## 认证接口 (`/api/auth`) - 10个端点

- [x] POST /api/auth/admin/login - 已测试
- [x] POST /api/auth/admin/logout - 已测试
- [x] GET /api/auth/admin/me - 已测试
- [x] POST /api/auth/user/login - 已测试
- [x] POST /api/auth/user/logout - 已测试
- [ ] POST /api/auth/sms/send - **需要测试**
- [ ] POST /api/auth/user/login-with-code - **需要测试**
- [x] GET /api/auth/user/me - 已测试
- [ ] GET /api/auth/session/info - **需要测试**
- [ ] POST /api/auth/session/refresh - **需要测试**

## 管理员接口 (`/api/admin`) - 63个端点

### 分类管理 (4个)
- [x] GET /api/admin/categories - 已测试
- [x] POST /api/admin/categories - 已测试
- [x] PUT /api/admin/categories/:id - 已测试
- [x] DELETE /api/admin/categories/:id - 已测试

### 产品管理 (5个)
- [x] GET /api/admin/products - 已测试
- [x] POST /api/admin/products - 已测试
- [x] PUT /api/admin/products/:id - 已测试
- [x] DELETE /api/admin/products/:id - 已测试
- [ ] POST /api/admin/products/batch-update - **需要测试**

### 折扣规则管理 (2个)
- [x] GET /api/admin/discount-rules - 已测试
- [x] POST /api/admin/discount-rules/batch - 已测试

### 系统设置 (2个)
- [x] GET /api/admin/settings - 已测试
- [x] POST /api/admin/settings - 已测试

### 点单控制 (2个)
- [x] POST /api/admin/ordering/open - 已测试
- [x] POST /api/admin/ordering/close - 已测试

### 订单管理 (5个)
- [x] GET /api/admin/orders - 已测试
- [x] GET /api/admin/orders/statistics - 已测试
- [x] GET /api/admin/orders/export - 已测试
- [x] PUT /api/admin/orders/:id/status - 已测试
- [x] POST /api/admin/cycles/:id/confirm - 已测试

### 周期管理 (2个)
- [x] GET /api/admin/cycles - 已测试

### 用户管理 (1个)
- [x] GET /api/admin/users - 已测试

### 管理员管理 (4个)
- [x] GET /api/admin/admins - 已测试
- [x] POST /api/admin/admins - 已测试
- [x] PUT /api/admin/admins/:id - 已测试
- [x] DELETE /api/admin/admins/:id - 已测试

### 日志管理 (2个)
- [x] GET /api/admin/logs - 已测试
- [ ] GET /api/admin/logs/filter-options - **需要测试**

### 开发者工具 (10个) - 需要超级管理员权限
- [x] GET /api/admin/developer/tables - 已测试
- [x] GET /api/admin/developer/table-schema/:tableName - 已测试
- [x] GET /api/admin/developer/table-data/:tableName - 已测试
- [x] PUT /api/admin/developer/table-data/:tableName - 已测试
- [ ] GET /api/admin/developer/files/list - **需要测试**
- [ ] GET /api/admin/developer/files/read - **需要测试**
- [ ] POST /api/admin/developer/files/write - **需要测试**
- [ ] DELETE /api/admin/developer/files - **需要测试**
- [ ] POST /api/admin/developer/files/mkdir - **需要测试**
- [ ] POST /api/admin/developer/files/upload - **需要测试**
- [ ] GET /api/admin/developer/files/download - **需要测试**
- [ ] POST /api/admin/developer/execute-sql - 已测试

### 备份管理 (7个)
- [ ] POST /api/admin/backup/create - **需要测试**
- [ ] POST /api/admin/menu/backup - **需要测试**
- [ ] POST /api/admin/menu/import - **需要测试**
- [ ] GET /api/admin/menu/backup/download - **需要测试**
- [ ] GET /api/admin/backup/list - **需要测试**
- [ ] GET /api/admin/backup/download/:fileName - **需要测试**
- [ ] POST /api/admin/backup/restore - **需要测试**
- [ ] DELETE /api/admin/backup/delete - **需要测试**
- [ ] POST /api/admin/backup/upload - **需要测试**

### 清理工具 (2个)
- [ ] GET /api/admin/cleanup/info - **需要测试**
- [ ] POST /api/admin/cleanup/execute - **需要测试**

### 远程备份 (10个)
- [ ] GET /api/admin/remote-backup/configs - **需要测试**
- [ ] POST /api/admin/remote-backup/configs - **需要测试**
- [ ] PUT /api/admin/remote-backup/configs/:id - **需要测试**
- [ ] DELETE /api/admin/remote-backup/configs/:id - **需要测试**
- [ ] POST /api/admin/remote-backup/configs/:id/push - **需要测试**
- [ ] GET /api/admin/remote-backup/receive-config - **需要测试**
- [ ] PUT /api/admin/remote-backup/receive-config - **需要测试**
- [ ] GET /api/admin/remote-backup/push-logs - **需要测试**
- [ ] GET /api/admin/remote-backup/received - **需要测试**
- [ ] POST /api/admin/remote-backup/received/:id/restore - **需要测试**

### 其他 (1个)
- [ ] POST /api/admin/email/test - **需要测试**
- [ ] POST /api/admin/remote-backup/receive - **需要测试**

## 用户接口 (`/api/user`) - 8个端点

- [x] POST /api/user/orders - 已测试
- [x] GET /api/user/orders - 已测试
- [x] GET /api/user/orders/by-phone - 已测试
- [x] GET /api/user/orders/:id - 已测试
- [x] DELETE /api/user/orders/:id - 已测试
- [x] PUT /api/user/orders/:id - 已测试
- [x] POST /api/user/orders/:id/payment - 已测试
- [x] GET /api/user/orders-summary - 已测试

## 公开接口 (`/api/public`) - 8个端点

- [x] GET /api/public/settings - 已测试
- [x] GET /api/public/categories - 已测试
- [x] GET /api/public/products - 已测试
- [x] GET /api/public/orders/:orderNumber - 已测试
- [x] GET /api/public/discount-rules - 已测试
- [x] POST /api/public/calculate-discount - 已测试
- [x] GET /api/public/cycle-discount - 已测试
- [x] GET /api/public/show-images - 已测试

## 总结

- **已测试**: 约 50个端点
- **需要测试**: 约 39个端点
- **总端点**: 89个

## 优先级

### 高优先级（核心业务）
1. POST /api/auth/sms/send
2. POST /api/auth/user/login-with-code
3. GET /api/auth/session/info
4. POST /api/auth/session/refresh
5. POST /api/admin/products/batch-update
6. GET /api/admin/logs/filter-options

### 中优先级（管理功能）
7. 备份管理相关端点 (7个)
8. 清理工具相关端点 (2个)
9. 远程备份相关端点 (10个)

### 低优先级（开发者工具）
10. 开发者文件管理相关端点 (6个)
11. POST /api/admin/email/test
12. POST /api/admin/remote-backup/receive

