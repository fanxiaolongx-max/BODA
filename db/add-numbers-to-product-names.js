const { runAsync, getAsync, allAsync, beginTransaction, commit, rollback } = require('./database');

async function addNumbersToProductNames() {
  console.log('开始为产品名称添加序号...');
  
  try {
    await beginTransaction();
    
    // 产品数据（按顺序）
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
    
    // 获取所有产品，按ID排序
    const allProducts = await allAsync('SELECT id, name FROM products ORDER BY id');
    console.log(`找到 ${allProducts.length} 个产品`);
    
    if (allProducts.length !== products.length) {
      console.warn(`警告：数据库中的产品数量 (${allProducts.length}) 与预期数量 (${products.length}) 不匹配`);
    }
    
    // 更新每个产品的名称
    let updatedCount = 0;
    for (let i = 0; i < Math.min(allProducts.length, products.length); i++) {
      const dbProduct = allProducts[i];
      const productData = products[i];
      const number = i + 1;
      
      // 构建新名称：序号 + 英文名 + 中文名
      const newName = `${number}. ${productData.nameEn} ${productData.nameZh}`;
      
      // 更新产品名称
      await runAsync(
        'UPDATE products SET name = ? WHERE id = ?',
        [newName, dbProduct.id]
      );
      
      updatedCount++;
      console.log(`  ${number}. ${newName}`);
    }
    
    await commit();
    console.log(`\n✅ 完成！共更新 ${updatedCount} 个产品名称`);
    
    // 验证更新结果
    console.log('\n验证更新结果（前5个产品）:');
    const sampleProducts = await allAsync(
      'SELECT id, name FROM products ORDER BY id LIMIT 5'
    );
    sampleProducts.forEach(p => {
      console.log(`  ${p.name}`);
    });
    
  } catch (error) {
    await rollback();
    console.error('❌ 更新产品名称失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  addNumbersToProductNames()
    .then(() => {
      console.log('脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { addNumbersToProductNames };

