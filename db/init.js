const bcrypt = require('bcryptjs');
const { initDatabase, runAsync, getAsync } = require('./database');

async function initData() {
  try {
    // 初始化数据库表结构
    await initDatabase();

    // 检查是否已初始化
    const adminCount = await getAsync('SELECT COUNT(*) as count FROM admins');
    if (adminCount.count > 0) {
      console.log('数据已初始化，跳过初始化数据');
      return;
    }

    console.log('开始初始化默认数据...');

    // 创建默认管理员账户
    const defaultPassword = await bcrypt.hash('admin123', 10);
    await runAsync(
      'INSERT INTO admins (username, password, name, role) VALUES (?, ?, ?, ?)',
      ['admin', defaultPassword, '系统管理员', 'super_admin']
    );
    console.log('默认管理员账户已创建 (用户名: admin, 密码: admin123)');

    // 创建分类（使用当前实际的分类数据）
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
    console.log('默认分类已创建');

    // 创建加料商品（作为独立商品）
    const toppingIds = {};
    const toppings = [
      { name: 'Cheese 芝士', price: 20 },
      { name: 'Jelly 果冻', price: 20 },
      { name: 'Boba 波霸', price: 20 },
      { name: 'Cream 奶盖', price: 20 }
    ];
    
    for (const topping of toppings) {
      const result = await runAsync(
        'INSERT INTO products (name, description, price, category_id, status, sugar_levels, available_toppings, ice_options) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [topping.name, '额外加料', topping.price, null, 'active', '[]', '[]', '[]']
      );
      toppingIds[topping.name] = result.id;
    }
    console.log('加料选项已创建');

    // 默认所有加料选项（ID数组）
    const allToppings = JSON.stringify([
      toppingIds['Cheese 芝士'],
      toppingIds['Jelly 果冻'],
      toppingIds['Boba 波霸'],
      toppingIds['Cream 奶盖']
    ]);
    
    // 默认甜度选项
    const allSugarLevels = JSON.stringify(['0', '30', '50', '70', '100']);
    
    // 默认冰度选项
    const allIceOptions = JSON.stringify(['normal', 'less', 'no', 'room', 'hot']);

    // 创建菜单（使用当前实际的菜单数据）
    const products = [
      // TOP DRINKS (支持杯型)
      {
        name: 'Mango Coconut Milk 芒果椰椰鲜奶',
        category: 'TOP DRINKS 人气推荐',
        sizes: { 'Large 大杯': 170 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Strawberry Milkshake 草莓奶昔',
        category: 'TOP DRINKS 人气推荐',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Brown Sugar Boba Milk 黑糖珍珠鲜奶',
        category: 'TOP DRINKS 人气推荐',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      
      // FRESH FRUIT TEA
      {
        name: 'Mango Fresh Fruit Tea 芒果鲜果茶',
        category: 'FRESH FRUIT TEA 鲜果水果茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Orange Fresh Fruit Tea 橙汁鲜果茶',
        category: 'FRESH FRUIT TEA 鲜果水果茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Red Grape Fruit Tea 红葡萄鲜果茶',
        category: 'FRESH FRUIT TEA 鲜果水果茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Grapefruit Fruit Tea 西柚鲜果茶',
        category: 'FRESH FRUIT TEA 鲜果水果茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Green Grape Fruit Tea 青提鲜果茶',
        category: 'FRESH FRUIT TEA 鲜果水果茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      
      // BOBA MILKSHAKE
      {
        name: 'Green Grapes Jelly Boba 芝士青提波霸',
        category: 'BOBA MILKSHAKE 波霸奶昔',
        sizes: { 'Large 大杯': 170 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Grape Jelly Boba 葡萄果冻波霸',
        category: 'BOBA MILKSHAKE 波霸奶昔',
        sizes: { 'Large 大杯': 170 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Orange Jelly Boba 橙味果冻波霸',
        category: 'BOBA MILKSHAKE 波霸奶昔',
        sizes: { 'Large 大杯': 170 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Mango Jelly Boba 芒果果冻波霸',
        category: 'BOBA MILKSHAKE 波霸奶昔',
        sizes: { 'Large 大杯': 170 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Grapefruit Jelly Boba 西柚果冻波霸',
        category: 'BOBA MILKSHAKE 波霸奶昔',
        sizes: { 'Large 大杯': 170 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      
      // COCOA
      {
        name: 'Oreo Cocoa 奥利奥可可',
        category: 'COCOA 可可系列',
        sizes: { 'Medium 中杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Chocolate Cocoa 巧克力可可',
        category: 'COCOA 可可系列',
        sizes: { 'Medium 中杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Creamy Cocoa 奶香可可',
        category: 'COCOA 可可系列',
        sizes: { 'Medium 中杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Thai Milk Tea Cocoa 泰式奶茶可可',
        category: 'COCOA 可可系列',
        sizes: { 'Medium 中杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      
      // MATCHA (合并中杯大杯)
      {
        name: 'Creamy Matcha 奶香抹茶',
        category: 'MATCHA 抹茶系列',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Strawberry Matcha 草莓抹茶',
        category: 'MATCHA 抹茶系列',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Mango Matcha 芒果抹茶',
        category: 'MATCHA 抹茶系列',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Jasmine Matcha 茉莉抹茶',
        category: 'MATCHA 抹茶系列',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      
      // CREAMY TEA
      {
        name: 'Ceylon Cream Tea 锡兰红茶奶盖',
        category: 'CREAMY TEA 奶盖茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Peach Oolong Cream 桃乌龙奶盖',
        category: 'CREAMY TEA 奶盖茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Jasmine Cream Tea 茉莉奶盖',
        category: 'CREAMY TEA 奶盖茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Yashi Cream Tea 雅诗奶盖',
        category: 'CREAMY TEA 奶盖茶',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      
      // BOBO MILK TEA (合并中杯大杯)
      {
        name: 'Ceylon Black Tea Popping Boba 锡兰红茶波波',
        category: 'BOBO MILK TEA 波波奶茶',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Peach Oolong Tea Popping Boba 桃乌龙波波',
        category: 'BOBO MILK TEA 波波奶茶',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Jasmine Milk Popping Boba 茉莉奶波波',
        category: 'BOBO MILK TEA 波波奶茶',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Yashi Tea Popping Boba 雅诗波波',
        category: 'BOBO MILK TEA 波波奶茶',
        sizes: { 'Medium 中杯': 120, 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      
      // LEMON TEA
      {
        name: 'Ceylon Black Ice Lemon 锡兰红茶冰柠檬',
        category: 'LEMON TEA 柠檬茶',
        sizes: { 'Large 大杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Peach Oolong Ice Lemon 桃乌龙冰柠檬',
        category: 'LEMON TEA 柠檬茶',
        sizes: { 'Large 大杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Jasmine Ice Lemon 茉莉冰柠檬',
        category: 'LEMON TEA 柠檬茶',
        sizes: { 'Large 大杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Yashi Tea Ice Lemon 雅诗冰柠檬',
        category: 'LEMON TEA 柠檬茶',
        sizes: { 'Large 大杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      
      // COFFEE
      {
        name: 'American Coffee 美式咖啡',
        category: 'COFFEE 咖啡系列',
        sizes: { 'Medium 中杯': 120 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Coconut Latte 椰香拿铁',
        category: 'COFFEE 咖啡系列',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Spanish Latte 西班牙拿铁',
        category: 'COFFEE 咖啡系列',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      },
      {
        name: 'Matcha Latte 抹茶拿铁',
        category: 'COFFEE 咖啡系列',
        sizes: { 'Large 大杯': 150 },
        sugar_levels: allSugarLevels,
        available_toppings: allToppings,
        ice_options: allIceOptions
      }
    ];

    for (const product of products) {
      const categoryId = categoryIds[product.category];
      const sizesJson = JSON.stringify(product.sizes);
      const firstSize = Object.keys(product.sizes)[0];
      const basePrice = product.sizes[firstSize];
      
      await runAsync(
        `INSERT INTO products (name, description, price, category_id, status, sizes, sugar_levels, available_toppings, ice_options) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.name,
          '支持多种杯型、甜度、冰度和加料选择',
          basePrice,
          categoryId,
          'active',
          sizesJson,
          product.sugar_levels,
          product.available_toppings,
          product.ice_options
        ]
      );
    }
    console.log(`默认菜单已创建（${products.length} 个菜品）`);

    // 创建默认折扣规则
    const discountRules = [
      { min_amount: 0, max_amount: 50, discount_rate: 0, description: '满0元无折扣' },
      { min_amount: 50, max_amount: 100, discount_rate: 0.05, description: '满50元享95折' },
      { min_amount: 100, max_amount: 200, discount_rate: 0.1, description: '满100元享9折' },
      { min_amount: 200, max_amount: null, discount_rate: 0.15, description: '满200元享85折' }
    ];

    for (const rule of discountRules) {
      await runAsync(
        'INSERT INTO discount_rules (min_amount, max_amount, discount_rate, description, status) VALUES (?, ?, ?, ?, ?)',
        [rule.min_amount, rule.max_amount, rule.discount_rate, rule.description, 'active']
      );
    }
    console.log('默认折扣规则已创建');

    // 创建系统设置
    const settings = [
      { key: 'ordering_open', value: 'false', description: '点单开关' },
      { key: 'ordering_end_time', value: '', description: '点单结束时间' },
      { key: 'system_name', value: 'Neferdidi BOBA TEA', description: '系统名称' },
      { key: 'store_name', value: 'BOBA TEA', description: '商店名称' },
      { key: 'contact_phone', value: '', description: '联系电话' },
      { key: 'currency', value: 'EGP', description: '货币单位' },
      { key: 'currency_symbol', value: 'LE', description: '货币符号' },
      { key: 'max_visible_cycles', value: '10', description: '最大可见周期数' },
      { key: 'admin_session_timeout', value: '7200', description: '管理员session过期时间（秒），默认7200秒（2小时）' },
      { key: 'user_session_timeout', value: '7200', description: '用户session过期时间（秒），默认7200秒（2小时）' },
      { key: 'sms_enabled', value: 'false', description: '是否启用短信验证码' },
      { key: 'sms_provider', value: 'twilio', description: '短信服务商' },
      { key: 'twilio_account_sid', value: '', description: 'Twilio Account SID' },
      { key: 'debug_logging_enabled', value: 'false', description: '是否启用详细DEBUG日志（记录所有请求，包括静态资源）' },
      { key: 'twilio_auth_token', value: '', description: 'Twilio Auth Token' },
      { key: 'twilio_phone_number', value: '', description: 'Twilio发送号码' },
      { key: 'twilio_verify_service_sid', value: '', description: 'Twilio Verify Service SID (推荐使用)' },
      { key: 'stripe_publishable_key', value: '', description: 'Stripe Publishable Key (starts with pk_)' },
      { key: 'stripe_secret_key', value: '', description: 'Stripe Secret Key (starts with sk_)' },
      { key: 'stripe_webhook_secret', value: '', description: 'Stripe Webhook Secret (starts with whsec_, optional)' },
      { key: 'instant_payment_enabled', value: 'false', description: '允许用户即时支付（开启后用户无需等待周期结束即可支付或删除订单，折扣功能不生效）' }
    ];

    for (const setting of settings) {
      // 使用 INSERT OR IGNORE 避免与 migrateSettings() 冲突
      // migrateSettings() 已经在 initDatabase() 中执行，可能已经添加了这些设置项
      await runAsync(
        'INSERT OR IGNORE INTO settings (key, value, description) VALUES (?, ?, ?)',
        [setting.key, setting.value, setting.description]
      );
    }
    console.log('系统设置已创建');

    console.log('数据初始化完成！');
  } catch (error) {
    console.error('数据初始化失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本，则执行初始化
if (require.main === module) {
  initData()
    .then(() => {
      console.log('初始化成功');
      process.exit(0);
    })
    .catch((err) => {
      console.error('初始化失败:', err);
      process.exit(1);
    });
}

module.exports = { initData };

