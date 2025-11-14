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

    // 创建默认分类
    const categories = [
      { name: '经典奶茶', description: '经典系列奶茶', sort_order: 1 },
      { name: '拿铁系列', description: '各种口味拿铁', sort_order: 2 },
      { name: '果茶系列', description: '新鲜果茶', sort_order: 3 },
      { name: '冰沙系列', description: '清凉冰沙', sort_order: 4 }
    ];

    for (const cat of categories) {
      await runAsync(
        'INSERT INTO categories (name, description, sort_order) VALUES (?, ?, ?)',
        [cat.name, cat.description, cat.sort_order]
      );
    }
    console.log('默认分类已创建');

    // 获取分类ID
    const catMap = {};
    const allCats = await require('./database').allAsync('SELECT * FROM categories');
    allCats.forEach(cat => {
      catMap[cat.name] = cat.id;
    });

    // 创建默认菜单
    const products = [
      { name: '珍珠奶茶', price: 15, category: '经典奶茶', description: '经典珍珠奶茶' },
      { name: '红豆奶茶', price: 16, category: '经典奶茶', description: '香甜红豆奶茶' },
      { name: '布丁奶茶', price: 17, category: '经典奶茶', description: '顺滑布丁奶茶' },
      { name: '椰果奶茶', price: 16, category: '经典奶茶', description: 'Q弹椰果奶茶' },
      { name: '乌龙奶茶', price: 15, category: '经典奶茶', description: '清香乌龙奶茶' },
      { name: '抹茶拿铁', price: 20, category: '拿铁系列', description: '浓郁抹茶拿铁' },
      { name: '焦糖拿铁', price: 20, category: '拿铁系列', description: '丝滑焦糖拿铁' },
      { name: '香草拿铁', price: 20, category: '拿铁系列', description: '经典香草拿铁' },
      { name: '柠檬蜂蜜', price: 18, category: '果茶系列', description: '清新柠檬蜂蜜茶' },
      { name: '百香果茶', price: 18, category: '果茶系列', description: '香甜百香果茶' },
      { name: '芒果冰沙', price: 22, category: '冰沙系列', description: '热带芒果冰沙' },
      { name: '草莓冰沙', price: 22, category: '冰沙系列', description: '鲜甜草莓冰沙' }
    ];

    for (const product of products) {
      await runAsync(
        'INSERT INTO products (name, description, price, category_id, status) VALUES (?, ?, ?, ?, ?)',
        [product.name, product.description, product.price, catMap[product.category], 'active']
      );
    }
    console.log('默认菜单已创建');

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
      { key: 'currency_symbol', value: 'LE', description: '货币符号' }
    ];

    for (const setting of settings) {
      await runAsync(
        'INSERT INTO settings (key, value, description) VALUES (?, ?, ?)',
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

