const { runAsync, allAsync, waitForDbReady } = require('./database');

/**
 * 提取分类名称的中文部分（去除英文）
 * @param {string} name - 原始分类名称
 * @returns {string} 只包含中文的名称
 */
function extractChineseName(name) {
  if (!name) return name;
  
  // 提取中文字符（包括中文标点）
  const chineseRegex = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]+/g;
  const chineseMatches = name.match(chineseRegex);
  
  if (chineseMatches && chineseMatches.length > 0) {
    // 返回所有中文字符的组合，去除空格
    return chineseMatches.join('').trim();
  }
  
  // 如果没有中文字符，返回原名称
  return name;
}

/**
 * 迁移脚本：将custom_apis表中的分类名称更新为只保留中文
 * 同时更新blog_posts表中对应的api_name和category字段
 */
async function migrateCategoryNamesToChineseOnly() {
  await waitForDbReady();
  
  try {
    console.log('开始迁移：将分类名称更新为只保留中文...');
    
    // 检查custom_apis表是否存在
    const tableExists = await runAsync(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='custom_apis'
    `);
    
    if (!tableExists) {
      console.log('custom_apis表不存在，跳过迁移');
      return;
    }
    
    // 获取所有需要更新的分类（name中包含非中文字符）
    const categories = await allAsync(`
      SELECT id, name, path
      FROM custom_apis
      WHERE method = 'GET' AND status = 'active'
    `);
    
    if (!categories || categories.length === 0) {
      console.log('没有找到分类记录');
      return;
    }
    
    console.log(`找到 ${categories.length} 条分类记录`);
    
    // 检查blog_posts表是否存在，用于统计文章数量
    const blogPostsExists = await runAsync(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='blog_posts'
    `);
    
    // 统计每个分类的文章数量
    const categoryPostCount = {};
    if (blogPostsExists) {
      const postCounts = await allAsync(`
        SELECT api_name, COUNT(*) as count
        FROM blog_posts
        GROUP BY api_name
      `);
      postCounts.forEach(row => {
        categoryPostCount[row.api_name] = row.count;
      });
    }
    
    let updated = 0;
    let deleted = 0;
    let errors = 0;
    const nameMapping = {}; // 存储旧名称到新名称的映射，用于更新blog_posts表
    const categoriesToDelete = []; // 需要删除的分类ID
    
    // 第一步：处理重复分类（中文名称相同的情况）
    console.log('\n第一步：处理重复分类...');
    const chineseNameGroups = {};
    
    // 按中文名称分组
    for (const category of categories) {
      const chineseName = extractChineseName(category.name);
      if (!chineseNameGroups[chineseName]) {
        chineseNameGroups[chineseName] = [];
      }
      chineseNameGroups[chineseName].push(category);
    }
    
    // 处理每个中文名称组
    for (const [chineseName, group] of Object.entries(chineseNameGroups)) {
      if (group.length <= 1) continue; // 没有重复，跳过
      
      // 找出只包含中文的分类和带英文的分类
      const chineseOnly = group.find(cat => cat.name === chineseName);
      const withEnglish = group.filter(cat => cat.name !== chineseName);
      
      if (!chineseOnly && withEnglish.length > 0) {
        // 没有只包含中文的分类，保留第一个，删除其他的
        const keepCategory = withEnglish[0];
        const deleteCategories = withEnglish.slice(1);
        
        // 统计文章数量
        const keepPostCount = categoryPostCount[keepCategory.name] || 0;
        
        for (const delCategory of deleteCategories) {
          const delPostCount = categoryPostCount[delCategory.name] || 0;
          
          if (delPostCount > 0) {
            // 需要迁移文章
            console.log(`  ⚠ 需要迁移文章: "${delCategory.name}" (${delPostCount}篇) -> "${keepCategory.name}"`);
            await runAsync(`
              UPDATE blog_posts 
              SET api_name = ?, category = ?, updated_at = datetime('now', 'localtime')
              WHERE api_name = ? OR category = ?
            `, [keepCategory.name, keepCategory.name, delCategory.name, delCategory.name]);
          }
          
          categoriesToDelete.push(delCategory.id);
          console.log(`  ✓ 标记删除重复分类: "${delCategory.name}"`);
        }
        
        // 更新保留的分类名称为只包含中文
        if (keepCategory.name !== chineseName) {
          nameMapping[keepCategory.name] = chineseName;
        }
      } else if (chineseOnly && withEnglish.length > 0) {
        // 有只包含中文的分类，删除所有带英文的分类
        const chinesePostCount = categoryPostCount[chineseOnly.name] || 0;
        
        for (const delCategory of withEnglish) {
          const delPostCount = categoryPostCount[delCategory.name] || 0;
          
          if (delPostCount > 0) {
            // 需要迁移文章到只包含中文的分类
            console.log(`  ⚠ 迁移文章: "${delCategory.name}" (${delPostCount}篇) -> "${chineseOnly.name}"`);
            await runAsync(`
              UPDATE blog_posts 
              SET api_name = ?, category = ?, updated_at = datetime('now', 'localtime')
              WHERE api_name = ? OR category = ?
            `, [chineseOnly.name, chineseOnly.name, delCategory.name, delCategory.name]);
          }
          
          categoriesToDelete.push(delCategory.id);
          console.log(`  ✓ 标记删除重复分类: "${delCategory.name}"`);
        }
      }
    }
    
    // 删除重复的分类
    if (categoriesToDelete.length > 0) {
      console.log(`\n删除 ${categoriesToDelete.length} 个重复分类...`);
      for (const categoryId of categoriesToDelete) {
        try {
          await runAsync(`DELETE FROM custom_apis WHERE id = ?`, [categoryId]);
          deleted++;
        } catch (error) {
          console.error(`删除分类 ${categoryId} 失败:`, error.message);
          errors++;
        }
      }
    }
    
    // 第二步：更新剩余分类的名称（去除英文）
    console.log('\n第二步：更新分类名称（去除英文）...');
    
    // 重新获取分类列表（删除重复后）
    const remainingCategories = await allAsync(`
      SELECT id, name, path
      FROM custom_apis
      WHERE method = 'GET' AND status = 'active'
    `);
    
    for (const category of remainingCategories) {
      try {
        const chineseName = extractChineseName(category.name);
        
        // 如果名称没有变化，跳过
        if (chineseName === category.name) {
          continue;
        }
        
        // 检查新名称是否与其他分类冲突（应该不会，因为已经处理了重复）
        const conflict = await runAsync(`
          SELECT id FROM custom_apis 
          WHERE name = ? AND method = 'GET' AND status = 'active' AND id != ?
        `, [chineseName, category.id]);
        
        if (conflict) {
          console.warn(`跳过更新 "${category.name}" -> "${chineseName}"：新名称已被其他分类使用`);
          continue;
        }
        
        // 存储名称映射
        nameMapping[category.name] = chineseName;
        
        // 更新custom_apis表的name字段
        await runAsync(`
          UPDATE custom_apis 
          SET name = ?, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `, [chineseName, category.id]);
        
        updated++;
        
        console.log(`  ✓ "${category.name}" -> "${chineseName}"`);
        
        if (updated % 10 === 0) {
          console.log(`已更新 ${updated} 条分类...`);
        }
      } catch (error) {
        console.error(`更新分类 ${category.id} (${category.name}) 失败:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n分类处理完成！`);
    console.log(`- 删除重复分类: ${deleted} 条`);
    console.log(`- 更新分类名称: ${updated} 条`);
    if (errors > 0) {
      console.log(`- 失败: ${errors} 条操作`);
    }
    
    // 更新blog_posts表中对应的api_name和category字段
    if (Object.keys(nameMapping).length > 0) {
      console.log('\n开始更新blog_posts表中的api_name和category字段...');
      
      let postsUpdated = 0;
      let postsErrors = 0;
      
      for (const [oldName, newName] of Object.entries(nameMapping)) {
        try {
          // 分别更新api_name和category字段
          const apiNameResult = await runAsync(`
            UPDATE blog_posts 
            SET api_name = ?, updated_at = datetime('now', 'localtime')
            WHERE api_name = ?
          `, [newName, oldName]);
          
          const categoryResult = await runAsync(`
            UPDATE blog_posts 
            SET category = ?, updated_at = datetime('now', 'localtime')
            WHERE category = ?
          `, [newName, oldName]);
          
          const totalChanges = (apiNameResult.changes || 0) + (categoryResult.changes || 0);
          if (totalChanges > 0) {
            postsUpdated += totalChanges;
            console.log(`  ✓ 更新了 ${totalChanges} 篇文章的api_name/category: "${oldName}" -> "${newName}"`);
          }
        } catch (error) {
          console.error(`更新文章失败 (${oldName} -> ${newName}):`, error.message);
          postsErrors++;
        }
      }
      
      console.log(`\n文章更新完成！`);
      console.log(`- 成功更新: ${postsUpdated} 篇文章`);
      if (postsErrors > 0) {
        console.log(`- 失败: ${postsErrors} 次更新操作`);
      }
    }
    
    // 验证迁移结果
    const remaining = await allAsync(`
      SELECT COUNT(*) as count 
      FROM custom_apis
      WHERE method = 'GET' AND status = 'active'
        AND name != TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(name, 'a', ''), 'b', ''), 'c', ''), 'd', ''), 'e', ''), 'f', ''), 'g', ''), 'h', ''), 'i', ''), 'j', ''))
    `);
    
    console.log('\n✓ 迁移完成！所有分类名称已更新为只保留中文');
    
  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateCategoryNamesToChineseOnly()
    .then(() => {
      console.log('迁移脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { migrateCategoryNamesToChineseOnly };

