// 数据库迁移脚本 - 添加冰度选项和备注字段
const { db, runAsync } = require('./database');

async function migrateIceOptions() {
  console.log('开始迁移数据库（添加冰度选项和备注字段）...');
  
  try {
    // 检查products表的ice_options字段
    const productsTableInfo = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(products)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const hasIceOptions = productsTableInfo.some(col => col.name === 'ice_options');
    
    if (!hasIceOptions) {
      console.log('添加 products.ice_options 字段...');
      await runAsync('ALTER TABLE products ADD COLUMN ice_options TEXT DEFAULT \'["normal","less","no","room","hot"]\'');
    }
    
    // 检查order_items表的ice_level字段
    const orderItemsTableInfo = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(order_items)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const hasIceLevel = orderItemsTableInfo.some(col => col.name === 'ice_level');
    
    if (!hasIceLevel) {
      console.log('添加 order_items.ice_level 字段...');
      await runAsync('ALTER TABLE order_items ADD COLUMN ice_level TEXT');
    }
    
    // 检查orders表的notes字段
    const ordersTableInfo = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(orders)", (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    
    const hasNotes = ordersTableInfo.some(col => col.name === 'notes');
    
    if (!hasNotes) {
      console.log('添加 orders.notes 字段...');
      await runAsync('ALTER TABLE orders ADD COLUMN notes TEXT');
    }
    
    console.log('✅ 数据库迁移完成！');
    
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    throw error;
  }
}

if (require.main === module) {
  migrateIceOptions()
    .then(() => {
      console.log('迁移完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

module.exports = { migrateIceOptions };

