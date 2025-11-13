const { runAsync, getAsync, allAsync, beginTransaction, commit, rollback } = require('./database');

async function updateMenuV2() {
  console.log('开始更新菜单（含杯型/甜度/加料配置）...');
  
  try {
    await beginTransaction();
    
    // 1. 删除所有旧数据
    console.log('删除旧数据...');
    await runAsync('DELETE FROM order_items');
    await runAsync('DELETE FROM orders');
    await runAsync('DELETE FROM products');
    await runAsync('DELETE FROM categories');
    
    // 2. 创建分类
    console.log('创建分类...');
    const categories = [
      { name: 'TOP DRINKS 人气推荐', sort_order: 1 },
      { name: 'FRESH FRUIT TEA 鲜果水果茶', sort_order: 2 },
      { name: 'BOBA MILKSHAKE 波霸奶昔', sort_order: 3 },
      { name: 'COCOA 可可系列', sort_order: 4 },
      { name: 'MATCHA 抹茶系列', sort_order: 5 },
      { name: 'CREAMY TEA 奶盖茶', sort_order: 6 },
      { name: 'BOBO MILK TEA 波波奶茶', sort_order: 7 },
      { name: 'LEMON TEA 柠檬茶', sort_order: 8 },
      { name: 'COFFEE 咖啡系列', sort_order: 9 }
    ];
    
    const categoryIds = {};
    for (const cat of categories) {
      const result = await runAsync(
        'INSERT INTO categories (name, description, sort_order, status) VALUES (?, ?, ?, ?)',
        [cat.name, '', cat.sort_order, 'active']
      );
      categoryIds[cat.name] = result.id;
    }
    
    // 3. 创建加料商品（作为独立商品）
    const toppingIds = {};
    const toppings = [
      { name: 'Cheese 芝士', price: 20 },
      { name: 'Jelly 果冻', price: 20 },
      { name: 'Boba 波霸', price: 20 },
      { name: 'Cream 奶盖', price: 20 }
    ];
    
    for (const topping of toppings) {
      const result = await runAsync(
        'INSERT INTO products (name, description, price, category_id, status, sugar_levels, available_toppings) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [topping.name, '额外加料', topping.price, null, 'active', '[]', '[]']
      );
      toppingIds[topping.name] = result.id;
    }
    
    // 4. 添加菜品（合并后的版本）
    console.log('添加菜品...');
    
    // 默认所有加料选项（ID数组）
    const allToppings = JSON.stringify([
      toppingIds['Cheese 芝士'],
      toppingIds['Jelly 果冻'],
      toppingIds['Boba 波霸'],
      toppingIds['Cream 奶盖']
    ]);
    
    // 默认甜度选项
    const allSugarLevels = JSON.stringify(['0', '30', '50', '70', '100']);
    
    const products = [
      // TOP DRINKS (支持杯型)
      {
        name: 'Mango Coconut Milk 芒果椰椰鲜奶',
        category: 'TOP DRINKS 人气推荐',
        sizes: { 'Large 大杯': 170 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Strawberry Milkshake 草莓奶昔',
        category: 'TOP DRINKS 人气推荐',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Brown Sugar Boba Milk 黑糖珍珠鲜奶',
        category: 'TOP DRINKS 人气推荐',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      
      // FRESH FRUIT TEA
      {
        name: 'Mango Fresh Fruit Tea 芒果鲜果茶',
        category: 'FRESH FRUIT TEA 鲜果水果茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Orange Fresh Fruit Tea 橙汁鲜果茶',
        category: 'FRESH FRUIT TEA 鲜果水果茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Red Grape Fruit Tea 红葡萄鲜果茶',
        category: 'FRESH FRUIT TEA 鲜果水果茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Grapefruit Fruit Tea 西柚鲜果茶',
        category: 'FRESH FRUIT TEA 鲜果水果茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Green Grape Fruit Tea 青提鲜果茶',
        category: 'FRESH FRUIT TEA 鲜果水果茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      
      // BOBA MILKSHAKE
      {
        name: 'Green Grapes Jelly Boba 芝士青提波霸',
        category: 'BOBA MILKSHAKE 波霸奶昔',
        sizes: { 'Large 大杯': 170 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Grape Jelly Boba 葡萄果冻波霸',
        category: 'BOBA MILKSHAKE 波霸奶昔',
        sizes: { 'Large 大杯': 170 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Orange Jelly Boba 橙味果冻波霸',
        category: 'BOBA MILKSHAKE 波霸奶昔',
        sizes: { 'Large 大杯': 170 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Mango Jelly Boba 芒果果冻波霸',
        category: 'BOBA MILKSHAKE 波霸奶昔',
        sizes: { 'Large 大杯': 170 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Grapefruit Jelly Boba 西柚果冻波霸',
        category: 'BOBA MILKSHAKE 波霸奶昔',
        sizes: { 'Large 大杯': 170 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      
      // COCOA
      {
        name: 'Oreo Cocoa 奥利奥可可',
        category: 'COCOA 可可系列',
        sizes: { 'Medium 中杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Chocolate Cocoa 巧克力可可',
        category: 'COCOA 可可系列',
        sizes: { 'Medium 中杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Creamy Cocoa 奶香可可',
        category: 'COCOA 可可系列',
        sizes: { 'Medium 中杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Thai Milk Tea Cocoa 泰式奶茶可可',
        category: 'COCOA 可可系列',
        sizes: { 'Medium 中杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      
      // MATCHA (合并中杯大杯)
      {
        name: 'Creamy Matcha 奶香抹茶',
        category: 'MATCHA 抹茶系列',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Strawberry Matcha 草莓抹茶',
        category: 'MATCHA 抹茶系列',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Mango Matcha 芒果抹茶',
        category: 'MATCHA 抹茶系列',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Jasmine Matcha 茉莉抹茶',
        category: 'MATCHA 抹茶系列',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      
      // CREAMY TEA
      {
        name: 'Ceylon Cream Tea 锡兰红茶奶盖',
        category: 'CREAMY TEA 奶盖茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Peach Oolong Cream 桃乌龙奶盖',
        category: 'CREAMY TEA 奶盖茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Jasmine Cream Tea 茉莉奶盖',
        category: 'CREAMY TEA 奶盖茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Yashi Cream Tea 雅诗奶盖',
        category: 'CREAMY TEA 奶盖茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      
      // BOBO MILK TEA (合并中杯大杯)
      {
        name: 'Ceylon Black Tea Popping Boba 锡兰红茶波波',
        category: 'BOBO MILK TEA 波波奶茶',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Peach Oolong Tea Popping Boba 桃乌龙波波',
        category: 'BOBO MILK TEA 波波奶茶',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Jasmine Milk Popping Boba 茉莉奶波波',
        category: 'BOBO MILK TEA 波波奶茶',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Yashi Tea Popping Boba 雅诗波波',
        category: 'BOBO MILK TEA 波波奶茶',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      
      // LEMON TEA
      {
        name: 'Ceylon Black Ice Lemon 锡兰红茶冰柠檬',
        category: 'LEMON TEA 柠檬茶',
        sizes: { 'Large 大杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Peach Oolong Ice Lemon 桃乌龙冰柠檬',
        category: 'LEMON TEA 柠檬茶',
        sizes: { 'Large 大杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Jasmine Ice Lemon 茉莉冰柠檬',
        category: 'LEMON TEA 柠檬茶',
        sizes: { 'Large 大杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Yashi Tea Ice Lemon 雅诗冰柠檬',
        category: 'LEMON TEA 柠檬茶',
        sizes: { 'Large 大杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      
      // COFFEE
      {
        name: 'American Coffee 美式咖啡',
        category: 'COFFEE 咖啡系列',
        sizes: { 'Medium 中杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Coconut Latte 椰香拿铁',
        category: 'COFFEE 咖啡系列',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Spanish Latte 西班牙拿铁',
        category: 'COFFEE 咖啡系列',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      },
      {
        name: 'Matcha Latte 抹茶拿铁',
        category: 'COFFEE 咖啡系列',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings
      }
    ];
    
    for (const product of products) {
      const categoryId = categoryIds[product.category];
      const sizesJson = JSON.stringify(product.sizes);
      const firstSize = Object.keys(product.sizes)[0];
      const basePrice = product.sizes[firstSize];
      
      await runAsync(
        `INSERT INTO products (name, description, price, category_id, status, sizes, sugar_levels, available_toppings) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.name,
          '支持多种杯型、甜度和加料选择',
          basePrice,
          categoryId,
          'active',
          sizesJson,
          product.sugar_levels,
          product.available_toppings
        ]
      );
    }
    
    await commit();
    
    console.log('✅ 菜单更新完成！');
    console.log(`- 创建了 ${categories.length} 个分类`);
    console.log(`- 添加了 ${products.length} 个菜品（已合并相同名称）`);
    console.log(`- 添加了 ${toppings.length} 个加料选项`);
    console.log('- 所有菜品支持杯型、甜度和加料配置');
    console.log('');
    console.log('甜度选项: 0%(无糖), 30%(微糖), 50%(半糖), 70%(少糖), 100%(标准)');
    console.log('加料选项: 芝士, 果冻, 波霸, 奶盖 (各20 EGP)');
    
  } catch (error) {
    await rollback();
    console.error('❌ 更新失败:', error.message);
    throw error;
  }
}

if (require.main === module) {
  updateMenuV2()
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

module.exports = { updateMenuV2 };

