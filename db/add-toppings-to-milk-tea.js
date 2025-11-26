const { runAsync, getAsync, allAsync, beginTransaction, commit, rollback } = require('./database');

async function addToppingsToMilkTea() {
  console.log('开始为奶茶系列添加加料选项...');
  
  try {
    await beginTransaction();
    
    // 1. 获取加料系列的所有产品ID和价格
    const toppingsCategory = await getAsync(
      "SELECT id FROM categories WHERE name LIKE '%加料%' OR name LIKE '%Toppings%'"
    );
    
    if (!toppingsCategory) {
      throw new Error('未找到加料系列分类');
    }
    
    const toppings = await allAsync(
      'SELECT id, name, price FROM products WHERE category_id = ? ORDER BY id',
      [toppingsCategory.id]
    );
    
    console.log(`找到 ${toppings.length} 个加料产品:`);
    toppings.forEach(t => {
      console.log(`  - ${t.name}: ${t.price}LE (ID: ${t.id})`);
    });
    
    // 2. 获取所有加料产品的ID数组
    const toppingIds = toppings.map(t => t.id);
    const toppingsJson = JSON.stringify(toppingIds);
    
    console.log(`\n加料ID数组: ${toppingsJson}`);
    
    // 3. 获取奶茶系列的所有产品
    const milkTeaCategory = await getAsync(
      "SELECT id FROM categories WHERE name LIKE '%奶茶%' OR name LIKE '%Milk Tea%'"
    );
    
    if (!milkTeaCategory) {
      throw new Error('未找到奶茶系列分类');
    }
    
    const milkTeaProducts = await allAsync(
      'SELECT id, name, available_toppings FROM products WHERE category_id = ? ORDER BY id',
      [milkTeaCategory.id]
    );
    
    console.log(`\n找到 ${milkTeaProducts.length} 个奶茶产品`);
    
    // 4. 为每个奶茶产品添加所有加料选项
    let updatedCount = 0;
    for (const product of milkTeaProducts) {
      // 解析现有的加料选项（如果有）
      let existingToppings = [];
      try {
        if (product.available_toppings && product.available_toppings !== '[]' && product.available_toppings !== '') {
          existingToppings = JSON.parse(product.available_toppings);
        }
      } catch (e) {
        console.log(`  产品 ${product.name} 的加料数据解析失败，将重置`);
        existingToppings = [];
      }
      
      // 合并现有加料和新加料（去重）
      const allToppings = [...new Set([...existingToppings, ...toppingIds])];
      const updatedToppingsJson = JSON.stringify(allToppings);
      
      // 更新产品
      await runAsync(
        'UPDATE products SET available_toppings = ? WHERE id = ?',
        [updatedToppingsJson, product.id]
      );
      
      updatedCount++;
      console.log(`  ✅ ${product.name}: 添加了 ${toppingIds.length} 个加料选项`);
    }
    
    await commit();
    console.log(`\n✅ 完成！共更新 ${updatedCount} 个奶茶产品`);
    
    // 5. 验证更新结果
    console.log('\n验证更新结果:');
    const sampleProducts = await allAsync(
      `SELECT id, name, available_toppings FROM products 
       WHERE category_id = ? 
       ORDER BY id 
       LIMIT 3`,
      [milkTeaCategory.id]
    );
    
    for (const product of sampleProducts) {
      const toppings = JSON.parse(product.available_toppings || '[]');
      console.log(`  ${product.name}: ${toppings.length} 个加料选项`);
    }
    
  } catch (error) {
    await rollback();
    console.error('❌ 添加加料失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  addToppingsToMilkTea()
    .then(() => {
      console.log('脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { addToppingsToMilkTea };

