# 自动清理功能设置说明

## ✅ 已实现的自动清理功能

### 1. 备份文件自动清理

**功能：** 自动清理超过7天的备份文件

**清理范围：**
- 数据库备份文件（`.db`, `.db-wal`, `.db-shm`）
- 完整备份文件（`.zip`）

**执行频率：** 每12小时自动执行一次

**保留策略：** 保留最近7天的备份

**实现位置：**
- `scripts/backup.js` - `cleanupOldBackups(days)` 函数
- `utils/scheduler.js` - `startBackupAndLogCleanupScheduler()` 函数

**手动执行：**
```bash
# 清理超过7天的备份
node scripts/backup.js --cleanup --days 7

# 清理超过3天的备份
node scripts/backup.js --cleanup --days 3
```

### 2. 应用日志自动清理

**功能：** 自动清理超过7天的应用日志文件

**清理范围：**
- `/data/logs/` 目录下的所有日志文件
- 不包括 `backup` 和 `export` 目录

**执行频率：** 每12小时自动执行一次

**保留策略：** 保留最近7天的日志

**实现位置：**
- `utils/log-cleanup.js` - `cleanupAppLogs(days)` 函数

### 3. 系统日志自动清理

**功能：** 自动清理超过7天的系统日志

**清理范围：**
- `/var/log/journal` - systemd 日志（使用 `journalctl --vacuum-time`）
- `/var/log/*.gz` - 压缩的旧日志文件
- `/var/log/*.log.N` - 轮转的旧日志文件
- `/var/log/btmp` - 失败的登录尝试日志（如果大于10MB）

**执行频率：** 每12小时自动执行一次

**保留策略：** 保留最近7天的日志

**实现位置：**
- `utils/log-cleanup.js` - `cleanupSystemLogs(days)` 函数

**注意：** 清理系统日志可能需要 sudo 权限

## 📊 清理效果统计

### 首次执行结果

**备份清理：**
- 删除文件：13 个
- 释放空间：74.69 MB

**日志清理：**
- 应用日志：删除 36 个文件，释放 100.12 MB
- 系统日志：删除 35 个文件，释放 127.73 MB
- **总计：删除 71 个文件，释放 227.85 MB**

**总体效果：**
- 删除文件总数：84 个
- 释放空间总计：**302.54 MB**

## 🔧 配置说明

### 修改保留天数

如果需要修改保留天数，可以编辑以下文件：

1. **备份清理保留天数：**
   - 文件：`utils/scheduler.js`
   - 函数：`startBackupAndLogCleanupScheduler()`
   - 修改：`cleanupOldBackups(7)` 中的数字

2. **日志清理保留天数：**
   - 文件：`utils/scheduler.js`
   - 函数：`startBackupAndLogCleanupScheduler()`
   - 修改：`cleanupAllLogs(7)` 中的数字

### 修改执行频率

**文件：** `utils/scheduler.js`

**函数：** `startBackupAndLogCleanupScheduler()`

**当前设置：**
```javascript
// 每12小时检查一次
setInterval(checkAndCleanup, 12 * 60 * 60 * 1000);
```

**修改示例（改为每天执行一次）：**
```javascript
// 每天执行一次（24小时）
setInterval(checkAndCleanup, 24 * 60 * 60 * 1000);
```

## 📝 日志记录

所有清理操作都会记录到应用日志中：

**日志级别：** `info`

**日志内容：**
- 清理的文件数量
- 释放的空间大小
- 清理时间

**查看日志：**
```bash
# 查看最近的清理日志
tail -f /data/logs/combined-*.log | grep "清理"
```

## ⚠️ 注意事项

1. **备份文件清理：**
   - 清理会删除超过指定天数的所有备份
   - 建议至少保留最近3-7天的备份
   - 重要备份建议手动保存到其他位置

2. **日志文件清理：**
   - 应用日志清理不会删除 `backup` 和 `export` 目录
   - 系统日志清理可能需要 sudo 权限
   - 某些系统日志文件可能无法删除（权限限制）

3. **磁盘空间监控：**
   - 建议定期检查磁盘使用情况
   - 可以使用 `node scripts/analyze-disk-usage.js` 分析磁盘占用

4. **首次执行：**
   - 首次执行会清理所有超过7天的文件
   - 之后每12小时自动执行一次
   - 可以手动执行立即清理

## 🚀 使用示例

### 手动执行清理

```bash
# 清理超过7天的备份
node scripts/backup.js --cleanup --days 7

# 清理超过3天的备份（更激进）
node scripts/backup.js --cleanup --days 3

# 清理所有日志（应用+系统）
node -e "const { cleanupAllLogs } = require('./utils/log-cleanup'); cleanupAllLogs(7).then(r => console.log('完成:', r))"
```

### 检查清理效果

```bash
# 查看备份目录大小
du -sh /data/logs/backup/

# 查看日志目录大小
du -sh /data/logs/

# 查看系统日志大小
du -sh /var/log/

# 完整磁盘分析
node scripts/analyze-disk-usage.js
```

## 📈 预期效果

**定期自动清理后：**
- 备份文件：保持在合理大小（约 100-200 MB）
- 应用日志：保持在合理大小（约 50-100 MB）
- 系统日志：保持在合理大小（约 200-500 MB）

**磁盘使用率：** 从 30% 降至约 25-28%

## 🔍 故障排查

### 清理未执行

1. 检查调度器是否启动：
   ```bash
   # 查看应用启动日志
   grep "备份和日志清理调度器" /data/logs/combined-*.log
   ```

2. 检查是否有错误：
   ```bash
   # 查看错误日志
   grep "清理.*失败" /data/logs/combined-*.log
   ```

### 清理权限问题

如果系统日志清理失败，可能需要 sudo 权限：

```bash
# 手动清理 systemd 日志
sudo journalctl --vacuum-time=7d

# 手动清空 btmp
sudo truncate -s 0 /var/log/btmp
```

## 📚 相关文档

- `docs/DISK_USAGE_ANALYSIS.md` - 磁盘使用情况分析
- `docs/DATABASE_SIZE_ANALYSIS.md` - 数据库大小分析
- `scripts/analyze-disk-usage.js` - 磁盘使用分析脚本

