const { runAsync, waitForDbReady } = require('./database');

async function migrateCustomApiLogs() {
  await waitForDbReady();
  
  try {
    // 自定义API日志表
    await runAsync(`
      CREATE TABLE IF NOT EXISTS custom_api_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_id INTEGER NOT NULL,
        request_method TEXT NOT NULL,
        request_path TEXT NOT NULL,
        request_headers TEXT,
        request_query TEXT,
        request_body TEXT,
        response_status INTEGER,
        response_body TEXT,
        response_time_ms INTEGER,
        ip_address TEXT,
        user_agent TEXT,
        error_message TEXT,
        created_at DATETIME DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // 创建索引以提高查询性能
    await runAsync('CREATE INDEX IF NOT EXISTS idx_custom_api_logs_api_id ON custom_api_logs(api_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_custom_api_logs_created_at ON custom_api_logs(created_at)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_custom_api_logs_request_path ON custom_api_logs(request_path)');

    console.log('自定义API日志表迁移完成');
  } catch (error) {
    console.error('自定义API日志表迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateCustomApiLogs()
    .then(() => {
      console.log('迁移完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

module.exports = { migrateCustomApiLogs };
