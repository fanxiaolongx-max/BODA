const { runAsync, waitForDbReady } = require('./database');

async function migrateUserTokens() {
  await waitForDbReady();
  
  try {
    // 创建 user_tokens 表
    await runAsync(`
      CREATE TABLE IF NOT EXISTS user_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    await runAsync('CREATE INDEX IF NOT EXISTS idx_user_tokens_user_id ON user_tokens(user_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_user_tokens_token ON user_tokens(token)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_user_tokens_expires_at ON user_tokens(expires_at)');

    console.log('user_tokens 表迁移完成');
  } catch (error) {
    console.error('user_tokens 表迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateUserTokens()
    .then(() => {
      console.log('迁移完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

module.exports = { migrateUserTokens };

