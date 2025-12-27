# 自定义 API 消息体清理检查报告

## 检查时间
2024年检查

## 检查结果

### ✅ 已实现的清理机制

1. **定时调度器清理** (`utils/scheduler.js`)
   - 位置：`startApiLogsCleanupScheduler()` 函数
   - 频率：每小时执行一次
   - 清理范围：超过 3 小时的消息体
   - 状态：✅ 已在应用启动时自动启动（`server.js` 第 592 行）

2. **异步触发清理** (`utils/custom-api-router.js`)
   - 位置：`cleanupOldResponseBodies()` 函数
   - 触发时机：每次记录 API 日志时异步触发
   - 限流机制：1 小时内最多执行一次，避免频繁清理
   - 状态：✅ 已实现

3. **手动清理脚本** (`db/cleanup-api-logs.js`)
   - 位置：`cleanupApiLogsResponseBody()` 函数
   - 用途：支持手动执行清理任务
   - 使用方式：`node db/cleanup-api-logs.js [小时数] [--vacuum]`
   - 状态：✅ 已实现

### ⚠️ 发现的问题

**问题：只清理了 `response_body`，未清理 `request_body`**

- `request_body` 字段也可能占用大量数据库空间，特别是对于 POST/PUT 请求
- 当前清理逻辑只清理了 `response_body`，`request_body` 会一直保留

### ✅ 已修复

已更新以下文件，现在会同时清理 `request_body` 和 `response_body`：

1. **`utils/scheduler.js`** - 定时调度器
   - 更新清理 SQL，同时清理 `request_body` 和 `response_body`
   - 更新日志信息，反映清理范围

2. **`utils/custom-api-router.js`** - 异步清理函数
   - 更新 `cleanupOldResponseBodies()` 函数
   - 同时清理 `request_body` 和 `response_body`
   - 更新函数注释

3. **`db/cleanup-api-logs.js`** - 手动清理脚本
   - 更新 `cleanupApiLogsResponseBody()` 函数
   - 同时清理 `request_body` 和 `response_body`
   - 更新空间计算逻辑，包含两个字段的大小

## 数据库表结构

```sql
CREATE TABLE custom_api_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_id INTEGER NOT NULL,
  request_method TEXT NOT NULL,
  request_path TEXT NOT NULL,
  request_headers TEXT,
  request_query TEXT,
  request_body TEXT,        -- 请求体（现在也会被清理）
  response_status INTEGER,
  response_body TEXT,       -- 响应体（现在会被清理）
  response_time_ms INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  error_message TEXT,
  created_at DATETIME DEFAULT (datetime('now', 'localtime'))
)
```

## 清理策略

### 清理规则
- **保留时间**：最近 3 小时的消息体
- **清理字段**：`request_body` 和 `response_body`
- **清理方式**：将字段设置为 `NULL`，保留记录和其他字段
- **执行频率**：每小时自动执行一次

### 清理 SQL

```sql
UPDATE custom_api_logs
SET 
  request_body = NULL,
  response_body = NULL
WHERE created_at < datetime('now', '-3 hours')
  AND (
    (request_body IS NOT NULL AND request_body != '')
    OR (response_body IS NOT NULL AND response_body != '')
  )
```

## 验证方法

### 1. 检查调度器是否运行

查看应用启动日志，应该看到：
```
API日志清理调度器已启动（每小时清理一次超过3小时的消息体）
```

### 2. 检查清理是否执行

查看应用日志，应该定期看到：
```
自动清理超过3小时的消息体（request_body 和 response_body）
```

### 3. 手动执行清理

```bash
# 清理超过3小时的消息体
node db/cleanup-api-logs.js

# 清理超过6小时的消息体
node db/cleanup-api-logs.js 6

# 清理并压缩数据库
node db/cleanup-api-logs.js 3 --vacuum
```

### 4. 检查数据库状态

```sql
-- 检查超过3小时但仍保留消息体的记录数
SELECT COUNT(*) as count
FROM custom_api_logs
WHERE created_at < datetime('now', '-3 hours')
  AND (
    (request_body IS NOT NULL AND request_body != '')
    OR (response_body IS NOT NULL AND response_body != '')
  );

-- 检查消息体占用空间
SELECT 
  SUM(COALESCE(LENGTH(request_body), 0) + COALESCE(LENGTH(response_body), 0)) / 1024 / 1024 as total_mb
FROM custom_api_logs
WHERE (
  (request_body IS NOT NULL AND request_body != '')
  OR (response_body IS NOT NULL AND response_body != '')
);
```

## 总结

✅ **清理机制已完整实现**
- 定时自动清理（每小时）
- 异步触发清理（记录日志时）
- 手动清理脚本（支持自定义时间）

✅ **已修复问题**
- 现在会同时清理 `request_body` 和 `response_body`
- 更好地控制数据库大小

✅ **建议**
- 定期检查数据库大小
- 如果数据库仍然过大，可以考虑：
  1. 缩短保留时间（修改清理函数中的 3 小时参数）
  2. 运行 `VACUUM` 命令压缩数据库
  3. 考虑归档或删除更旧的日志记录

