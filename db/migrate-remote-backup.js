const { runAsync, waitForDbReady } = require('./database');

async function migrateRemoteBackup() {
  await waitForDbReady();
  
  try {
    // 远程备份配置表
    await runAsync(`
      CREATE TABLE IF NOT EXISTS remote_backup_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        target_url TEXT NOT NULL,
        api_token TEXT NOT NULL,
        schedule_type TEXT DEFAULT 'manual',
        schedule_time TEXT,
        schedule_day INTEGER,
        enabled INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // 接收备份配置表
    await runAsync(`
      CREATE TABLE IF NOT EXISTS backup_receive_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_token TEXT NOT NULL,
        auto_restore INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // 推送日志表
    await runAsync(`
      CREATE TABLE IF NOT EXISTS backup_push_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_id INTEGER,
        backup_file_name TEXT,
        target_url TEXT,
        status TEXT,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (config_id) REFERENCES remote_backup_configs(id) ON DELETE SET NULL
      )
    `);

    // 接收备份记录表
    await runAsync(`
      CREATE TABLE IF NOT EXISTS backup_received (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        backup_file_name TEXT NOT NULL,
        source_url TEXT,
        file_size INTEGER,
        status TEXT DEFAULT 'received',
        restored_at DATETIME,
        created_at DATETIME DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // 创建索引
    await runAsync('CREATE INDEX IF NOT EXISTS idx_push_logs_config ON backup_push_logs(config_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_push_logs_created ON backup_push_logs(created_at)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_received_created ON backup_received(created_at)');

    console.log('远程备份表迁移完成');
  } catch (error) {
    console.error('远程备份表迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateRemoteBackup()
    .then(() => {
      console.log('迁移完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

module.exports = { migrateRemoteBackup };

