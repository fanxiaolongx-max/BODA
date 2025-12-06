const { runAsync, waitForDbReady } = require('./database');

async function migrateCustomApis() {
  await waitForDbReady();
  
  try {
    // 自定义API表
    await runAsync(`
      CREATE TABLE IF NOT EXISTS custom_apis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        method TEXT NOT NULL DEFAULT 'GET',
        requires_token INTEGER DEFAULT 0,
        response_content TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
      )
    `);

    // 创建索引
    await runAsync('CREATE INDEX IF NOT EXISTS idx_custom_apis_path ON custom_apis(path)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_custom_apis_status ON custom_apis(status)');

    console.log('自定义API表迁移完成');
  } catch (error) {
    console.error('自定义API表迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateCustomApis()
    .then(() => {
      console.log('迁移完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

module.exports = { migrateCustomApis };
