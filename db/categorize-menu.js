const { runAsync, getAsync, allAsync, beginTransaction, commit, rollback } = require('./database');

async function categorizeMenu() {
  console.log('开始自动归类菜单...');
  
  try {
    await beginTransaction();
    
    // 1. 定义分类（中英文名称）
    const categories = [
      { nameZh: '奶茶系列', nameEn: 'Milk Tea Series', sortOrder: 1 },
      { nameZh: '果茶系列', nameEn: 'Fruit Tea Series', sortOrder: 2 },
      { nameZh: '柠檬茶系列', nameEn: 'Lemon Tea Series', sortOrder: 3 },
      { nameZh: '咖啡系列', nameEn: 'Coffee Series', sortOrder: 4 },
      { nameZh: '纯茶系列', nameEn: 'Pure Tea Series', sortOrder: 5 },
      { nameZh: '加料系列', nameEn: 'Toppings Series', sortOrder: 6 },
    ];
    
    // 2. 清除或更新现有分类，创建新分类
    console.log('创建/更新分类...');
    const categoryIds = {};
    
    for (const category of categories) {
      const categoryName = `${category.nameEn} ${category.nameZh}`;
      
      // 检查分类是否已存在
      let existingCategory = await getAsync(
        "SELECT id FROM categories WHERE name = ? OR name LIKE ? OR name LIKE ?",
        [categoryName, `%${category.nameZh}%`, `%${category.nameEn}%`]
      );
      
      if (existingCategory) {
        // 更新现有分类
        await runAsync(
          'UPDATE categories SET name = ?, sort_order = ?, status = ? WHERE id = ?',
          [categoryName, category.sortOrder, 'active', existingCategory.id]
        );
        categoryIds[category.nameEn] = existingCategory.id;
        console.log(`更新分类: ${categoryName} (ID: ${existingCategory.id})`);
      } else {
        // 创建新分类
        await runAsync(
          'INSERT INTO categories (name, description, status, sort_order) VALUES (?, ?, ?, ?)',
          [categoryName, '', 'active', category.sortOrder]
        );
        // 重新查询获取ID
        const newCategory = await getAsync('SELECT id FROM categories WHERE name = ?', [categoryName]);
        if (newCategory) {
          categoryIds[category.nameEn] = newCategory.id;
          console.log(`创建分类: ${categoryName} (ID: ${newCategory.id})`);
        } else {
          throw new Error(`创建分类失败: ${categoryName}`);
        }
      }
    }
    
    // 3. 获取所有产品
    const allProducts = await allAsync('SELECT id, name FROM products ORDER BY id');
    console.log(`找到 ${allProducts.length} 个产品`);
    
    // 4. 定义分类规则（根据产品名称关键词，按优先级排序）
    // 注意：优先级高的先检查，避免误分类
    const categoryRules = [
      {
        category: 'Toppings Series',
        keywords: [
          // 加料关键词（精确匹配，避免误判）
          'boba 珍珠', 'sago 西米', 'osmanthus jelly 桂花冻', 
          'mochi 麻薯', 'cheese cream 芝士奶盖', 'sticky rice 黑米',
          // 单独加料产品（只有加料名称，没有其他词）
          /^(boba|sago|mochi|珍珠|西米|麻薯|黑米)$/i
        ],
        exactMatch: true // 加料产品需要精确匹配
      },
      {
        category: 'Pure Tea Series',
        keywords: [
          // 纯茶关键词（不包含奶茶、咖啡）
          'tieguanyin oolong tea', 'osmanthus oolong tea', 'ancient black tea',
          '铁观音茶', '桂花乌龙茶', '古法红茶'
        ],
        excludeKeywords: ['milk', 'latte', 'coffee', '奶茶', '拿铁', '咖啡']
      },
      {
        category: 'Coffee Series',
        keywords: [
          // 咖啡关键词
          'cafe americano', 'coffee latte', 'americano', '咖啡拿铁', '咖啡',
          '冰美式咖啡', '奶咖', 'coffee latte', 'persimmon coffee', 'green raisins coffee'
        ]
      },
      {
        category: 'Lemon Tea Series',
        keywords: [
          // 柠檬茶关键词
          'lemon tea', 'citrus lemon', 'lemon ice tea', 'lemon passion fruit',
          '柠檬茶', '柠檬', '养乐多', 'yakult', 'raisin lemon'
        ]
      },
      {
        category: 'Fruit Tea Series',
        keywords: [
          // 果茶关键词（排除奶茶）
          'fruit tea', 'fruit ice tea', 'super fruit tea',
          '果茶', '水果茶', 'mango & pineapple', 'grape fruit ice',
          'watermelon coconut', 'hami coconut melon', 'peach fruit'
        ],
        excludeKeywords: ['milk tea', '奶茶']
      },
      {
        category: 'Milk Tea Series',
        keywords: [
          // 奶茶关键词（默认分类）
          'milk tea', 'boba milk', 'pearl milk', 'cocoa milk', 
          'cake milk', 'latte', 'cheese', 'cream', 'soybean', 'taro',
          'brown sugar', 'black sugar', 'matcha milk', 'puer milk',
          '奶茶', '拿铁', '可可', '抹茶', '芋泥', '黑糖', '生椰'
        ]
      }
    ];
    
    // 5. 分类产品
    let categorizedCount = 0;
    for (const product of allProducts) {
      const productName = product.name.toLowerCase();
      let assignedCategory = null;
      
      // 按优先级检查分类规则
      for (const rule of categoryRules) {
        let matched = false;
        
        // 检查排除关键词
        if (rule.excludeKeywords) {
          const hasExclude = rule.excludeKeywords.some(keyword => 
            productName.includes(keyword.toLowerCase())
          );
          if (hasExclude) continue;
        }
        
        // 检查匹配关键词
        for (const keyword of rule.keywords) {
          if (typeof keyword === 'string') {
            if (productName.includes(keyword.toLowerCase())) {
              matched = true;
              break;
            }
          } else if (keyword instanceof RegExp) {
            // 正则表达式匹配（用于精确匹配加料产品）
            if (keyword.test(product.name)) {
              matched = true;
              break;
            }
          }
        }
        
        if (matched) {
          assignedCategory = categoryIds[rule.category];
          break;
        }
      }
      
      // 如果没有匹配到，默认分配到奶茶系列
      if (!assignedCategory) {
        assignedCategory = categoryIds['Milk Tea Series'];
      }
      
      // 更新产品分类
      await runAsync(
        'UPDATE products SET category_id = ? WHERE id = ?',
        [assignedCategory, product.id]
      );
      
      categorizedCount++;
      
      // 每10个产品输出一次进度
      if (categorizedCount % 10 === 0) {
        console.log(`已分类 ${categorizedCount}/${allProducts.length} 个产品...`);
      }
    }
    
    // 6. 清理旧分类（删除没有产品的旧分类）
    console.log('\n清理旧分类...');
    const oldCategories = await allAsync(
      `SELECT id, name FROM categories 
       WHERE id NOT IN (${Object.values(categoryIds).join(',')}) 
       AND (SELECT COUNT(*) FROM products WHERE category_id = categories.id) = 0`
    );
    
    for (const oldCat of oldCategories) {
      await runAsync('DELETE FROM categories WHERE id = ?', [oldCat.id]);
      console.log(`删除旧分类: ${oldCat.name} (ID: ${oldCat.id})`);
    }
    
    await commit();
    console.log(`✅ 菜单归类完成！共分类 ${categorizedCount} 个产品`);
    
    // 7. 显示分类统计
    console.log('\n分类统计:');
    for (const category of categories) {
      const categoryId = categoryIds[category.nameEn];
      const count = await getAsync(
        'SELECT COUNT(*) as count FROM products WHERE category_id = ?',
        [categoryId]
      );
      console.log(`  ${category.nameEn} ${category.nameZh}: ${count.count} 个产品`);
    }
    
  } catch (error) {
    await rollback();
    console.error('❌ 归类菜单失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  categorizeMenu()
    .then(() => {
      console.log('脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { categorizeMenu };

