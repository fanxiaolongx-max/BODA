const { runAsync, getAsync, allAsync, beginTransaction, commit, rollback } = require('./database');

async function updateMenuV3() {
  console.log('开始更新菜单 V3...');
  
  try {
    await beginTransaction();
    
    // 1. 清除所有现有产品（需要先删除订单项以避免外键约束）
    console.log('清除所有现有产品...');
    
    // 先禁用外键约束
    await runAsync('PRAGMA foreign_keys = OFF');
    
    // 删除订单项（如果有外键引用）
    try {
      await runAsync('DELETE FROM order_items');
      console.log('订单项已清除');
    } catch (e) {
      console.log('清除订单项时出错（可能表不存在）:', e.message);
    }
    
    // 删除产品
    await runAsync('DELETE FROM products');
    console.log('所有产品已清除');
    
    // 重新启用外键约束
    await runAsync('PRAGMA foreign_keys = ON');
    
    // 2. 获取或创建默认分类
    let defaultCategory = await getAsync("SELECT id FROM categories WHERE name LIKE '%默认%' OR name LIKE '%Default%' LIMIT 1");
    if (!defaultCategory) {
      // 创建默认分类
      const result = await runAsync(
        'INSERT INTO categories (name, description, status, sort_order) VALUES (?, ?, ?, ?)',
        ['默认分类 Default Category', '默认产品分类', 'active', 0]
      );
      defaultCategory = { id: result.lastID };
    }
    const categoryId = defaultCategory.id;
    
    // 3. 默认配置
    const allSugarLevels = JSON.stringify(['0', '30', '50', '70', '100']);
    const allIceOptions = JSON.stringify(['normal', 'less', 'no', 'room', 'hot']);
    const emptyToppings = JSON.stringify([]);
    const emptySizes = JSON.stringify({});
    
    // 4. 产品数据（从用户提供的表格）
    const products = [
      { nameZh: '经典珍珠奶茶', nameEn: 'Classic Boba Milk Tea', price: 135 },
      { nameZh: '红香奶茶', nameEn: 'Jasmine Milk Tea', price: 130 },
      { nameZh: '蜜桃乌龙奶茶', nameEn: 'Peach Milk Tea', price: 135 },
      { nameZh: '铁观音奶茶', nameEn: 'Tieguanyin Oolong Milk Tea', price: 130 },
      { nameZh: '咸焦糖奶茶', nameEn: 'Salted Caramel Milk Tea', price: 130 },
      { nameZh: '桂花乌龙奶茶', nameEn: 'Osmanthus Oolong Milk Tea', price: 130 },
      { nameZh: '黑糖珍珠奶茶', nameEn: 'Brown Sugar Boba Milk Tea', price: 135 },
      { nameZh: '黑糖抹茶奶茶', nameEn: 'Brown Sugar Matcha Milk Tea', price: 145 },
      { nameZh: '生椰巧克力奶茶', nameEn: 'Coconut Cocoa Milk Tea', price: 135 },
      { nameZh: '椰香可可奶茶', nameEn: 'Boba Cocoa Milk', price: 140 },
      { nameZh: '奥利奥珍珠牛奶', nameEn: 'Oreo Pearl Milk Tea', price: 145 },
      { nameZh: '奥利奥芝士可可奶茶', nameEn: 'Oreo Cheese Cocoa Milk Tea', price: 140 },
      { nameZh: '芋泥珍珠奶茶', nameEn: 'Taro Boba Milk Tea', price: 145 },
      { nameZh: '芋泥抹茶奶茶', nameEn: 'Matcha Milk Tea', price: 150 },
      { nameZh: '芋泥蛋糕奶茶', nameEn: 'Taro Cake Milk', price: 140 },
      { nameZh: '黑糖珍珠蛋糕奶茶', nameEn: 'Brown Sugar Cake Milk Tea', price: 145 },
      { nameZh: '生椰拿铁奶茶', nameEn: 'Coconut Latte', price: 140 },
      { nameZh: '芝士椰香奶茶', nameEn: 'Cheese Sticky Rice Milk Tea', price: 140 },
      { nameZh: '豆乳奶茶', nameEn: 'Soybean Cheese Milk Tea', price: 140 },
      { nameZh: '奶盖珍珠奶茶', nameEn: 'Oreo Cream Boba Milk Tea', price: 145 },
      { nameZh: '黑糖黑奶茶', nameEn: 'Black Jelly Boba Milk Tea', price: 145 },
      { nameZh: '柠檬柚子茶', nameEn: 'Citrus Lemon Tea', price: 130 },
      { nameZh: '柠檬红茶', nameEn: 'Lemon Tea', price: 130 },
      { nameZh: '柠檬养乐多', nameEn: 'Orange Lemon Yakult Tea', price: 135 },
      { nameZh: '蜜瓜柠檬茶', nameEn: 'Green Raisin Lemon Tea', price: 150 },
      { nameZh: '花开初恋', nameEn: 'Peach Fruit Tea', price: 145 },
      { nameZh: '生椰西瓜', nameEn: 'Watermelon Coconut Tea', price: 140 },
      { nameZh: '椰香蜜瓜', nameEn: 'Hami Coconut Melon', price: 140 },
      { nameZh: '芒果椰奶', nameEn: 'Mango & Coconut Milk Tea', price: 155 },
      { nameZh: '葡萄冰茶', nameEn: 'Grape Fruit Ice Tea', price: 145 },
      { nameZh: '草莓麻薯奶茶', nameEn: 'Strawberry Mochi Boba Milk Tea', price: 140 },
      { nameZh: '芒果凤梨果茶', nameEn: 'Mango & Pineapple Fruit Tea', price: 160 },
      { nameZh: '柠檬百香果', nameEn: 'Lemon Passion Fruit Tea', price: 135 },
      { nameZh: '超级水果茶', nameEn: 'Super Fruit Tea', price: 160 },
      { nameZh: '草莓珍珠奶茶', nameEn: 'Strawberry Boba Milk Tea', price: 140 },
      { nameZh: '柠檬养乐多冰茶', nameEn: 'Orange Raisin Lemon Ice Tea', price: 150 },
      { nameZh: '芒果芝士奶盖', nameEn: 'Fresh Mango Cheese Top', price: 160 },
      { nameZh: '蜜瓜百香果绿茶', nameEn: 'Green Melon Passion Fruit Tea', price: 145 },
      { nameZh: '铁观音茶', nameEn: 'Tieguanyin Oolong Tea', price: 130 },
      { nameZh: '桂花乌龙茶', nameEn: 'Osmanthus Oolong Tea', price: 130 },
      { nameZh: '古法红茶', nameEn: 'Ancient Black Tea', price: 130 },
      { nameZh: '冰美式咖啡', nameEn: 'Cafe Americano', price: 115 },
      { nameZh: '黑糖咖啡拿铁', nameEn: 'Brown Sugar Coffee Latte', price: 130 },
      { nameZh: '生椰咖啡拿铁', nameEn: 'Coconut Coffee Latte', price: 130 },
      { nameZh: '黑糖奶咖', nameEn: 'Black Latte Coffee Latte', price: 130 },
      { nameZh: '桂花乌龙奶咖', nameEn: 'Osmanthus Oolong Coffee Latte', price: 130 },
      { nameZh: '抹茶咖啡拿铁', nameEn: 'Matcha Coffee Latte', price: 135 },
      { nameZh: '草莓咖啡拿铁', nameEn: 'Strawberry Coffee Latte', price: 145 },
      { nameZh: '葡萄咖啡拿铁', nameEn: 'Persimmon Coffee Latte', price: 130 },
      { nameZh: '葡萄干咖啡拿铁', nameEn: 'Green Raisins Coffee Latte', price: 130 },
      { nameZh: '普洱珍珠奶茶', nameEn: 'Puer Boba Milk Tea', price: 140 },
      { nameZh: '普洱奶茶', nameEn: 'Ancient Puer Milk Tea', price: 130 },
      { nameZh: '普洱柠檬茶', nameEn: 'Puer Citrus Lemon Tea', price: 130 },
      { nameZh: '糯米奶茶', nameEn: 'Sticky Rice Milk Tea', price: 135 },
      { nameZh: '珍珠', nameEn: 'Boba', price: 50 },
      { nameZh: '西米', nameEn: 'Sago', price: 50 },
      { nameZh: '桂花冻', nameEn: 'Osmanthus Jelly', price: 50 },
      { nameZh: '麻薯', nameEn: 'Mochi', price: 50 },
      { nameZh: '芝士奶盖', nameEn: 'Cheese Cream', price: 50 },
      { nameZh: '黑米', nameEn: 'Sticky Rice', price: 50 },
    ];
    
    // 5. 插入产品
    console.log(`开始插入 ${products.length} 个产品...`);
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const name = `${product.nameEn} ${product.nameZh}`;
      
      await runAsync(
        `INSERT INTO products (name, description, price, category_id, status, sort_order, sizes, sugar_levels, available_toppings, ice_options) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          '',
          product.price,
          categoryId,
          'active',
          i + 1,
          emptySizes,
          allSugarLevels,
          emptyToppings,
          allIceOptions
        ]
      );
    }
    
    await commit();
    console.log(`✅ 菜单更新成功！共添加 ${products.length} 个产品`);
    
  } catch (error) {
    await rollback();
    console.error('❌ 更新菜单失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  updateMenuV3()
    .then(() => {
      console.log('脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { updateMenuV3 };

