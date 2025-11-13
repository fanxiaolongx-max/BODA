// 数据库迁移脚本 - 为order_items表添加杯型、甜度、加料字段
const { db, runAsync } = require('./database');

async function migrateOrderItems() {
  console.log('开始迁移order_items表...');
  
  try {
    // 检查字段是否已存在
    const tableInfo = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(order_items)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const hasSize = tableInfo.some(col => col.name === 'size');
    const hasSugar = tableInfo.some(col => col.name === 'sugar_level');
    const hasToppings = tableInfo.some(col => col.name === 'toppings');
    
    if (!hasSize) {
      console.log('添加 size 字段...');
      await runAsync('ALTER TABLE order_items ADD COLUMN size TEXT');
    }
    
    if (!hasSugar) {
      console.log('添加 sugar_level 字段...');
      await runAsync('ALTER TABLE order_items ADD COLUMN sugar_level TEXT');
    }
    
    if (!hasToppings) {
      console.log('添加 toppings 字段...');
      await runAsync('ALTER TABLE order_items ADD COLUMN toppings TEXT');
    }
    
    console.log('✅ order_items表迁移完成！');
    
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    throw error;
  }
}

if (require.main === module) {
  migrateOrderItems()
    .then(() => {
      console.log('迁移成功');
      process.exit(0);
    })
    .catch((err) => {
      console.error('迁移失败:', err);
      process.exit(1);
    });
}

module.exports = { migrateOrderItems };

