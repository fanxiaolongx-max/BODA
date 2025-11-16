const { createTestDatabase, initTestDatabase, clearTestDatabase } = require('./helpers/test-db');

// 测试前设置
beforeAll(async () => {
  try {
    // 创建并初始化测试数据库
    await createTestDatabase();
    await initTestDatabase();
    
    // 设置测试数据库路径到环境变量
    process.env.TEST_DB_PATH = require('path').join(__dirname, '../db/test-boda.db');
    
    // 等待一下确保数据库初始化完成
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
}, 30000); // 增加超时时间到30秒

// 每个测试前清理数据库
beforeEach(async () => {
  try {
    await clearTestDatabase();
    // 等待一下确保清理完成
    await new Promise(resolve => setTimeout(resolve, 50));
  } catch (error) {
    console.error('Failed to clear test database:', error);
    // 不抛出错误，继续测试
  }
});

