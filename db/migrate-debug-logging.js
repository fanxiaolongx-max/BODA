const { getAsync, runAsync } = require('./database');

async function migrateDebugLogging() {
  try {
    // 检查设置是否已存在
    const existing = await getAsync(
      "SELECT * FROM settings WHERE key = 'debug_logging_enabled'"
    );
    
    if (!existing) {
      // 添加新设置项，默认值为 false
      await runAsync(
        `INSERT INTO settings (key, value, description) 
         VALUES (?, ?, ?)`,
        ['debug_logging_enabled', 'false', '是否启用详细DEBUG日志（记录所有请求，包括静态资源）']
      );
      console.log('✅ 已添加 debug_logging_enabled 设置项（默认值: false）');
    } else {
      console.log('ℹ️  debug_logging_enabled 设置项已存在，跳过迁移');
    }
  } catch (error) {
    console.error('❌ 迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateDebugLogging()
    .then(() => {
      console.log('迁移完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

module.exports = migrateDebugLogging;

