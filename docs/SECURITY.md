# 安全配置文档

## 安全特性概述

本系统采用多层安全防护机制，确保数据和用户安全。

## 1. 认证和授权

### 密码安全
- 使用 `bcryptjs` 进行密码哈希（强度10轮）
- 密码永不存储明文
- 登录失败次数限制（5次/15分钟）

### Session管理
- HttpOnly Cookie（防止XSS攻击）
- SameSite=Lax（防止CSRF攻击）
- Secure Cookie（HTTPS环境自动启用）
- 24小时自动过期
- 支持反向代理（ngrok、Nginx）

### 角色权限
- `super_admin`: 完全权限，可管理其他管理员
- `admin`: 常规管理权限，不可管理其他管理员
- 细粒度权限控制（Developer功能仅super_admin可用）

## 2. HTTP安全头（Helmet.js）

### Content Security Policy (CSP)
```
defaultSrc: 'self'
styleSrc: 'self' 'unsafe-inline' https://cdn.tailwindcss.com
scriptSrc: 'self' 'unsafe-inline' https://cdn.tailwindcss.com
imgSrc: 'self' data: blob:
connectSrc: 'self'
fontSrc: 'self' https://cdn.tailwindcss.com
objectSrc: 'none'
mediaSrc: 'self'
frameSrc: 'none'
baseUri: 'self'
formAction: 'self'
```

### 其他安全头
- `X-Frame-Options: DENY` - 防止点击劫持
- `X-Content-Type-Options: nosniff` - 防止MIME类型嗅探
- `X-XSS-Protection: 1; mode=block` - XSS保护
- `X-DNS-Prefetch-Control: off` - 禁用DNS预取
- `Strict-Transport-Security` - HSTS（1年有效期，包含子域名）
  - **注意**：1年有效期是指浏览器缓存HSTS规则的时长，**不影响程序运行**
  - 只要服务器继续发送HSTS头，浏览器会自动续期
  - 这是安全增强机制，不是使用限制
- 隐藏 `X-Powered-By` 头

## 3. CORS配置

### 开发环境
- 允许所有源（方便测试和开发）

### 生产环境
- 白名单机制（通过 `CORS_ORIGIN` 环境变量配置）
- 支持多个域名（逗号分隔）
- 允许凭证传递（credentials: true）
- 限制HTTP方法：GET, POST, PUT, DELETE, OPTIONS
- 限制请求头：Content-Type, Authorization, X-Requested-With
- 预检请求缓存：24小时

### 配置示例
```bash
# .env
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
```

## 4. 请求限流

### API限流
- 窗口：15分钟
- 最大请求数：500次
- 防止DDoS和滥用

### 登录限流
- 窗口：15分钟
- 最大尝试次数：5次
- 防止暴力破解

## 5. 输入验证

### 使用 express-validator
- 所有用户输入都经过验证
- 类型检查、长度限制、格式验证
- 自定义验证规则

### SQL注入防护
- 使用参数化查询（Prepared Statements）
- 禁止字符串拼接SQL
- 所有数据库操作都使用参数化

### XSS防护
- 输出转义（前端处理）
- CSP策略限制脚本执行
- HttpOnly Cookie防止脚本访问

## 6. 文件上传安全

### 限制
- 文件大小：最大10MB
- 文件类型：仅允许图片（jpg, jpeg, png, gif, webp）
- 文件存储：独立目录，不执行权限

### 验证
- MIME类型检查
- 文件扩展名验证
- 文件内容验证（magic number）

## 7. 数据库安全

### SQLite配置
- WAL模式（提高并发性能）
- 外键约束（数据完整性）
- 事务支持（ACID特性）
- 参数化查询（防止SQL注入）

### 数据保护
- 敏感数据加密（密码哈希）
- 定期备份（自动备份脚本）
- 访问控制（仅应用可访问）

## 8. 环境变量安全

### 敏感信息
- Session密钥（`SESSION_SECRET`）
- 数据库路径（`DB_PATH`）
- CORS配置（`CORS_ORIGIN`）

### 最佳实践
- 使用 `.env` 文件（不要提交到版本控制）
- 生产环境使用强随机密钥（至少32字符）
- 定期轮换密钥
- 使用环境变量管理工具（如AWS Secrets Manager）

## 9. 日志和监控

### 安全日志
- 登录尝试（成功/失败）
- 权限拒绝
- 异常操作
- 安全事件

### 监控
- 性能监控（慢请求检测）
- 错误监控（异常捕获）
- 健康检查（数据库、磁盘、内存）

## 10. 依赖安全

### 安全检查
```bash
npm audit
```

### 更新策略
- 定期检查安全漏洞
- 及时更新有安全问题的依赖
- 使用 `npm audit fix` 自动修复
- 生产依赖优先更新

### 当前状态
- ✅ 已移除未使用的 `sntp` 依赖（有安全漏洞）
- ⚠️ `js-yaml` 有moderate级别漏洞（来自Jest，开发依赖，不影响生产）

## 11. 部署安全建议

### 生产环境检查清单
- [ ] 修改 `SESSION_SECRET` 为强随机字符串
- [ ] 设置 `NODE_ENV=production`
- [ ] 配置 `CORS_ORIGIN` 为实际域名
- [ ] 使用HTTPS协议
- [ ] 配置防火墙规则
- [ ] 启用日志监控
- [ ] 定期备份数据库
- [ ] 设置文件权限（数据库文件、上传目录）
- [ ] 使用反向代理（Nginx）提供额外安全层
- [ ] 配置SSL/TLS证书
- [ ] 启用自动安全更新

### 服务器安全
- 使用非root用户运行应用
- 限制文件系统权限
- 配置防火墙（仅开放必要端口）
- 定期更新操作系统
- 使用fail2ban防止暴力破解

## 12. 安全响应

### 发现漏洞
1. 立即评估影响范围
2. 修复漏洞或应用补丁
3. 通知受影响用户（如需要）
4. 更新安全文档

### 应急响应
- 监控异常活动
- 快速隔离受影响系统
- 保留日志证据
- 通知相关人员

## 13. 合规性

### 数据保护
- 用户数据加密存储
- 最小化数据收集
- 定期清理过期数据
- 用户数据导出功能

### 隐私保护
- 不记录敏感信息（如完整密码）
- 日志脱敏处理
- 遵守数据保护法规

## 更新日志

- 2025-01-XX: 增强Helmet配置，添加更多安全头
- 2025-01-XX: 优化CORS配置，支持生产环境白名单
- 2025-01-XX: 移除未使用的sntp依赖（安全漏洞）
- 2025-01-XX: 添加环境变量配置示例

