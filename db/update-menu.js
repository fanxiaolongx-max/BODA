const { runAsync, getAsync, allAsync, beginTransaction, commit, rollback } = require('./database');

async function updateMenu() {
  console.log('开始更新菜单...');
  
  try {
    await beginTransaction();
    
    // 1. 删除所有旧的订单详情、订单、菜品和分类
    console.log('删除旧数据...');
    await runAsync('DELETE FROM order_items');
    await runAsync('DELETE FROM orders');
    await runAsync('DELETE FROM products');
    await runAsync('DELETE FROM categories');
    
    // 2. 创建新的分类
    console.log('创建新分类...');
    const categories = [
      { name: 'TOP DRINKS 人气推荐', sort_order: 1 },
      { name: 'FRESH FRUIT TEA 鲜果水果茶', sort_order: 2 },
      { name: 'BOBA MILKSHAKE 波霸奶昔', sort_order: 3 },
      { name: 'COCOA 可可系列', sort_order: 4 },
      { name: 'MATCHA 抹茶系列', sort_order: 5 },
      { name: 'CREAMY TEA 奶盖茶', sort_order: 6 },
      { name: 'BOBO MILK TEA 波波奶茶', sort_order: 7 },
      { name: 'LEMON TEA 柠檬茶', sort_order: 8 },
      { name: 'COFFEE 咖啡系列', sort_order: 9 },
      { name: 'ADD 加料区', sort_order: 10 }
    ];
    
    const categoryIds = {};
    for (const cat of categories) {
      const result = await runAsync(
        'INSERT INTO categories (name, description, sort_order, status) VALUES (?, ?, ?, ?)',
        [cat.name, '', cat.sort_order, 'active']
      );
      categoryIds[cat.name] = result.id;
    }
    
    // 3. 添加新菜品
    console.log('添加新菜品...');
    const products = [
      // TOP DRINKS
      { name: 'Mango Coconut Milk 芒果椰椰鲜奶', price: 170, category: 'TOP DRINKS 人气推荐', description: 'Large 大杯' },
      { name: 'Strawberry Milkshake 草莓奶昔', price: 150, category: 'TOP DRINKS 人气推荐', description: 'Large 大杯' },
      { name: 'Brown Sugar Boba Milk 黑糖珍珠鲜奶（中杯）', price: 120, category: 'TOP DRINKS 人气推荐', description: 'Medium 中杯' },
      { name: 'Brown Sugar Boba Milk 黑糖珍珠鲜奶（大杯）', price: 150, category: 'TOP DRINKS 人气推荐', description: 'Large 大杯' },
      
      // FRESH FRUIT TEA
      { name: 'Mango Fresh Fruit Tea 芒果鲜果茶', price: 150, category: 'FRESH FRUIT TEA 鲜果水果茶', description: 'Large 大杯' },
      { name: 'Orange Fresh Fruit Tea 橙汁鲜果茶', price: 150, category: 'FRESH FRUIT TEA 鲜果水果茶', description: 'Large 大杯' },
      { name: 'Red Grape Fruit Tea 红葡萄鲜果茶', price: 150, category: 'FRESH FRUIT TEA 鲜果水果茶', description: 'Large 大杯' },
      { name: 'Grapefruit Fruit Tea 西柚鲜果茶', price: 150, category: 'FRESH FRUIT TEA 鲜果水果茶', description: 'Large 大杯' },
      { name: 'Green Grape Fruit Tea 青提鲜果茶', price: 150, category: 'FRESH FRUIT TEA 鲜果水果茶', description: 'Large 大杯' },
      
      // BOBA MILKSHAKE
      { name: 'Green Grapes Jelly Boba 芝士青提波霸', price: 170, category: 'BOBA MILKSHAKE 波霸奶昔', description: 'Large 大杯' },
      { name: 'Grape Jelly Boba 葡萄果冻波霸', price: 170, category: 'BOBA MILKSHAKE 波霸奶昔', description: 'Large 大杯' },
      { name: 'Orange Jelly Boba 橙味果冻波霸', price: 170, category: 'BOBA MILKSHAKE 波霸奶昔', description: 'Large 大杯' },
      { name: 'Mango Jelly Boba 芒果果冻波霸', price: 170, category: 'BOBA MILKSHAKE 波霸奶昔', description: 'Large 大杯' },
      { name: 'Grapefruit Jelly Boba 西柚果冻波霸', price: 170, category: 'BOBA MILKSHAKE 波霸奶昔', description: 'Large 大杯' },
      
      // COCOA
      { name: 'Oreo Cocoa 奥利奥可可', price: 120, category: 'COCOA 可可系列', description: 'Medium 中杯' },
      { name: 'Chocolate Cocoa 巧克力可可', price: 120, category: 'COCOA 可可系列', description: 'Medium 中杯' },
      { name: 'Creamy Cocoa 奶香可可', price: 120, category: 'COCOA 可可系列', description: 'Medium 中杯' },
      { name: 'Thai Milk Tea Cocoa 泰式奶茶可可', price: 120, category: 'COCOA 可可系列', description: 'Medium 中杯' },
      
      // MATCHA
      { name: 'Creamy Matcha 奶香抹茶（中杯）', price: 120, category: 'MATCHA 抹茶系列', description: 'Medium 中杯' },
      { name: 'Creamy Matcha 奶香抹茶（大杯）', price: 150, category: 'MATCHA 抹茶系列', description: 'Large 大杯' },
      { name: 'Strawberry Matcha 草莓抹茶（中杯）', price: 120, category: 'MATCHA 抹茶系列', description: 'Medium 中杯' },
      { name: 'Strawberry Matcha 草莓抹茶（大杯）', price: 150, category: 'MATCHA 抹茶系列', description: 'Large 大杯' },
      { name: 'Mango Matcha 芒果抹茶（中杯）', price: 120, category: 'MATCHA 抹茶系列', description: 'Medium 中杯' },
      { name: 'Mango Matcha 芒果抹茶（大杯）', price: 150, category: 'MATCHA 抹茶系列', description: 'Large 大杯' },
      { name: 'Jasmine Matcha 茉莉抹茶（中杯）', price: 120, category: 'MATCHA 抹茶系列', description: 'Medium 中杯' },
      { name: 'Jasmine Matcha 茉莉抹茶（大杯）', price: 150, category: 'MATCHA 抹茶系列', description: 'Large 大杯' },
      
      // CREAMY TEA
      { name: 'Ceylon Cream Tea 锡兰红茶奶盖', price: 150, category: 'CREAMY TEA 奶盖茶', description: 'Large 大杯' },
      { name: 'Peach Oolong Cream 桃乌龙奶盖', price: 150, category: 'CREAMY TEA 奶盖茶', description: 'Large 大杯' },
      { name: 'Jasmine Cream Tea 茉莉奶盖', price: 150, category: 'CREAMY TEA 奶盖茶', description: 'Large 大杯' },
      { name: 'Yashi Cream Tea 雅诗奶盖', price: 150, category: 'CREAMY TEA 奶盖茶', description: 'Large 大杯' },
      
      // BOBO MILK TEA
      { name: 'Ceylon Black Tea Popping Boba 锡兰红茶波波（中杯）', price: 120, category: 'BOBO MILK TEA 波波奶茶', description: 'Medium 中杯' },
      { name: 'Ceylon Black Tea Popping Boba 锡兰红茶波波（大杯）', price: 150, category: 'BOBO MILK TEA 波波奶茶', description: 'Large 大杯' },
      { name: 'Peach Oolong Tea Popping Boba 桃乌龙波波（中杯）', price: 120, category: 'BOBO MILK TEA 波波奶茶', description: 'Medium 中杯' },
      { name: 'Peach Oolong Tea Popping Boba 桃乌龙波波（大杯）', price: 150, category: 'BOBO MILK TEA 波波奶茶', description: 'Large 大杯' },
      { name: 'Jasmine Milk Popping Boba 茉莉奶波波（中杯）', price: 120, category: 'BOBO MILK TEA 波波奶茶', description: 'Medium 中杯' },
      { name: 'Jasmine Milk Popping Boba 茉莉奶波波（大杯）', price: 150, category: 'BOBO MILK TEA 波波奶茶', description: 'Large 大杯' },
      { name: 'Yashi Tea Popping Boba 雅诗波波（中杯）', price: 120, category: 'BOBO MILK TEA 波波奶茶', description: 'Medium 中杯' },
      { name: 'Yashi Tea Popping Boba 雅诗波波（大杯）', price: 150, category: 'BOBO MILK TEA 波波奶茶', description: 'Large 大杯' },
      
      // LEMON TEA
      { name: 'Ceylon Black Ice Lemon 锡兰红茶冰柠檬', price: 120, category: 'LEMON TEA 柠檬茶', description: 'Large 大杯' },
      { name: 'Peach Oolong Ice Lemon 桃乌龙冰柠檬', price: 120, category: 'LEMON TEA 柠檬茶', description: 'Large 大杯' },
      { name: 'Jasmine Ice Lemon 茉莉冰柠檬', price: 120, category: 'LEMON TEA 柠檬茶', description: 'Large 大杯' },
      { name: 'Yashi Tea Ice Lemon 雅诗冰柠檬', price: 120, category: 'LEMON TEA 柠檬茶', description: 'Large 大杯' },
      
      // COFFEE
      { name: 'American Coffee 美式咖啡', price: 120, category: 'COFFEE 咖啡系列', description: 'Medium 中杯' },
      { name: 'Coconut Latte 椰香拿铁', price: 150, category: 'COFFEE 咖啡系列', description: 'Large 大杯' },
      { name: 'Spanish Latte 西班牙拿铁', price: 150, category: 'COFFEE 咖啡系列', description: 'Large 大杯' },
      { name: 'Matcha Latte 抹茶拿铁', price: 150, category: 'COFFEE 咖啡系列', description: 'Large 大杯' },
      
      // ADD 加料区
      { name: 'Cheese 芝士', price: 20, category: 'ADD 加料区', description: '额外加料' },
      { name: 'Jelly 果冻', price: 20, category: 'ADD 加料区', description: '额外加料' },
      { name: 'Boba 波霸', price: 20, category: 'ADD 加料区', description: '额外加料' },
      { name: 'Cream 奶盖', price: 20, category: 'ADD 加料区', description: '额外加料' }
    ];
    
    for (const product of products) {
      const categoryId = categoryIds[product.category];
      await runAsync(
        'INSERT INTO products (name, description, price, category_id, status) VALUES (?, ?, ?, ?, ?)',
        [product.name, product.description, product.price, categoryId, 'active']
      );
    }
    
    await commit();
    console.log('✅ 菜单更新完成！');
    console.log(`- 创建了 ${categories.length} 个分类`);
    console.log(`- 添加了 ${products.length} 个菜品`);
    console.log('');
    console.log('菜单已更新为 Neferdidi 奶茶店菜单');
    console.log('所有价格单位：EGP（埃及镑）');
    
  } catch (error) {
    await rollback();
    console.error('❌ 更新失败:', error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  updateMenu()
    .then(() => {
      console.log('');
      console.log('🎉 请重启服务器以查看更新后的菜单');
      process.exit(0);
    })
    .catch((err) => {
      console.error('更新失败:', err);
      process.exit(1);
    });
}

module.exports = { updateMenu };

