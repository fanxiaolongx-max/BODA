// 添加"其它"分类并将加料商品归类
const { runAsync, getAsync, allAsync, beginTransaction, commit, rollback } = require('./database');

async function addOtherCategory() {
  console.log('开始添加"其它"分类...');
  
  try {
    await beginTransaction();
    
    // 1. 检查是否已存在"其它"或"加料"分类
    const existingCategory = await getAsync(
      "SELECT * FROM categories WHERE name LIKE '%其它%' OR name LIKE '%加料%' OR name LIKE '%ADD%' OR name LIKE '%OTHER%'"
    );
    
    let otherCategoryId;
    
    if (existingCategory) {
      console.log('已存在相关分类，使用现有分类:', existingCategory.name);
      otherCategoryId = existingCategory.id;
      
      // 更新sort_order确保在最后
      await runAsync(
        'UPDATE categories SET sort_order = 999 WHERE id = ?',
        [otherCategoryId]
      );
    } else {
      // 创建"其它"分类
      const result = await runAsync(
        'INSERT INTO categories (name, description, sort_order, status) VALUES (?, ?, ?, ?)',
        ['其它 OTHER', '其他商品和加料', 999, 'active']
      );
      otherCategoryId = result.id;
      console.log('创建"其它"分类成功，ID:', otherCategoryId);
    }
    
    // 2. 查找所有加料商品（价格为20的商品，或者category_id为null的商品）
    const toppings = await allAsync(
      "SELECT * FROM products WHERE (price = 20 AND (name LIKE '%Cheese%' OR name LIKE '%Jelly%' OR name LIKE '%Boba%' OR name LIKE '%Cream%' OR name LIKE '%芝士%' OR name LIKE '%果冻%' OR name LIKE '%波霸%' OR name LIKE '%奶盖%')) OR category_id IS NULL"
    );
    
    console.log(`找到 ${toppings.length} 个加料商品`);
    
    // 3. 将这些商品归类到"其它"分类
    for (const topping of toppings) {
      await runAsync(
        'UPDATE products SET category_id = ? WHERE id = ?',
        [otherCategoryId, topping.id]
      );
      console.log(`- 更新商品: ${topping.name}`);
    }
    
    await commit();
    console.log('完成！"其它"分类已创建/更新，加料商品已归类。');
  } catch (error) {
    await rollback();
    console.error('错误:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  addOtherCategory()
    .then(() => {
      console.log('脚本执行完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { addOtherCategory };

