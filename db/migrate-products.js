// 数据库迁移脚本 - 添加杯型、甜度、加料字段
const { db, runAsync, getAsync, allAsync } = require('./database');

async function migrateDatabase() {
  console.log('开始数据库迁移...');
  
  try {
    // 检查字段是否已存在
    const tableInfo = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(products)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const hasSize = tableInfo.some(col => col.name === 'sizes');
    const hasSugar = tableInfo.some(col => col.name === 'sugar_levels');
    const hasToppings = tableInfo.some(col => col.name === 'available_toppings');
    
    if (!hasSize) {
      console.log('添加 sizes 字段...');
      await runAsync('ALTER TABLE products ADD COLUMN sizes TEXT DEFAULT "{}"');
    }
    
    if (!hasSugar) {
      console.log('添加 sugar_levels 字段...');
      await runAsync('ALTER TABLE products ADD COLUMN sugar_levels TEXT DEFAULT \'["0","30","50","70","100"]\'');
    }
    
    if (!hasToppings) {
      console.log('添加 available_toppings 字段...');
      await runAsync('ALTER TABLE products ADD COLUMN available_toppings TEXT DEFAULT "[]"');
    }
    
    console.log('✅ 数据库迁移完成！');
    
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    throw error;
  }
}

if (require.main === module) {
  migrateDatabase()
    .then(() => {
      console.log('迁移成功');
      process.exit(0);
    })
    .catch((err) => {
      console.error('迁移失败:', err);
      process.exit(1);
    });
}

module.exports = { migrateDatabase };

