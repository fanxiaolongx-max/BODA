const { closeTestDatabase } = require('./helpers/test-db');

// 测试后清理
module.exports = async () => {
  await closeTestDatabase();
};

