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
 * 迁移脚本：
 * 1. 删除blog_posts表中category为"博客标签列表"的数据
 * 2. 更新blog_posts表中api_name字段，将包含中英文的api_name更新为只保留中文
 */
async function migrateCleanBlogPosts() {
  await waitForDbReady();
  
  try {
    console.log('开始迁移：清理blog_posts表...');
    
    // 检查blog_posts表是否存在
    const tableExists = await runAsync(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='blog_posts'
    `);
    
    if (!tableExists) {
      console.log('blog_posts表不存在，跳过迁移');
      return;
    }
    
    // 第一步：删除category为"博客标签列表"的数据
    console.log('\n第一步：删除category为"博客标签列表"的数据...');
    
    const deleteResult = await runAsync(`
      DELETE FROM blog_posts 
      WHERE category = '博客标签列表' OR category LIKE '%博客标签列表%'
    `);
    
    const deletedCount = deleteResult.changes || 0;
    console.log(`  ✓ 删除了 ${deletedCount} 条category为"博客标签列表"的记录`);
    
    // 第二步：更新api_name字段，将包含中英文的api_name更新为只保留中文
    console.log('\n第二步：更新api_name字段（去除英文）...');
    
    // 获取所有需要更新的记录（api_name包含英文）
    const posts = await allAsync(`
      SELECT DISTINCT api_name 
      FROM blog_posts 
      WHERE api_name IS NOT NULL AND api_name != ''
    `);
    
    if (!posts || posts.length === 0) {
      console.log('没有找到需要更新的记录');
      return;
    }
    
    console.log(`找到 ${posts.length} 个不同的api_name值`);
    
    let updated = 0;
    let errors = 0;
    const nameMapping = {}; // 存储旧名称到新名称的映射
    
    // 处理每个api_name
    for (const post of posts) {
      try {
        const oldApiName = post.api_name;
        const chineseApiName = extractChineseName(oldApiName);
        
        // 如果名称没有变化，跳过
        if (chineseApiName === oldApiName) {
          continue;
        }
        
        // 存储名称映射
        nameMapping[oldApiName] = chineseApiName;
        
        // 更新blog_posts表中的api_name和category字段
        const updateResult = await runAsync(`
          UPDATE blog_posts 
          SET api_name = ?, category = ?, updated_at = datetime('now', 'localtime')
          WHERE api_name = ?
        `, [chineseApiName, chineseApiName, oldApiName]);
        
        const changes = updateResult.changes || 0;
        if (changes > 0) {
          updated += changes;
          console.log(`  ✓ "${oldApiName}" -> "${chineseApiName}" (${changes}条记录)`);
        }
      } catch (error) {
        console.error(`更新api_name失败 (${post.api_name}):`, error.message);
        errors++;
      }
    }
    
    console.log(`\napi_name更新完成！`);
    console.log(`- 成功更新: ${updated} 条记录`);
    if (errors > 0) {
      console.log(`- 失败: ${errors} 次操作`);
    }
    
    // 第三步：更新category字段（如果还有包含英文的）
    console.log('\n第三步：更新category字段（去除英文）...');
    
    const categoryPosts = await allAsync(`
      SELECT DISTINCT category 
      FROM blog_posts 
      WHERE category IS NOT NULL AND category != '' AND category != api_name
    `);
    
    if (categoryPosts && categoryPosts.length > 0) {
      let categoryUpdated = 0;
      
      for (const post of categoryPosts) {
        try {
          const oldCategory = post.category;
          const chineseCategory = extractChineseName(oldCategory);
          
          // 如果名称没有变化，跳过
          if (chineseCategory === oldCategory) {
            continue;
          }
          
          // 更新category字段
          const updateResult = await runAsync(`
            UPDATE blog_posts 
            SET category = ?, updated_at = datetime('now', 'localtime')
            WHERE category = ?
          `, [chineseCategory, oldCategory]);
          
          const changes = updateResult.changes || 0;
          if (changes > 0) {
            categoryUpdated += changes;
            console.log(`  ✓ category: "${oldCategory}" -> "${chineseCategory}" (${changes}条记录)`);
          }
        } catch (error) {
          console.error(`更新category失败 (${post.category}):`, error.message);
        }
      }
      
      console.log(`\ncategory更新完成！`);
      console.log(`- 成功更新: ${categoryUpdated} 条记录`);
    }
    
    // 验证结果
    console.log('\n验证迁移结果...');
    
    // 检查是否还有category为"博客标签列表"的记录
    const remainingTagPosts = await allAsync(`
      SELECT COUNT(*) as count 
      FROM blog_posts 
      WHERE category = '博客标签列表' OR category LIKE '%博客标签列表%'
    `);
    
    const remainingTagCount = remainingTagPosts[0]?.count || 0;
    if (remainingTagCount > 0) {
      console.warn(`警告：仍有 ${remainingTagCount} 条category为"博客标签列表"的记录`);
    } else {
      console.log('✓ 所有category为"博客标签列表"的记录已删除');
    }
    
    // 检查是否还有包含英文的api_name（通过比较提取的中文名称和原名称）
    const allApiNames = await allAsync(`
      SELECT DISTINCT api_name 
      FROM blog_posts 
      WHERE api_name IS NOT NULL AND api_name != ''
    `);
    
    if (allApiNames && allApiNames.length > 0) {
      const englishApiNames = [];
      for (const row of allApiNames) {
        const apiName = row.api_name;
        const chineseName = extractChineseName(apiName);
        // 如果提取的中文名称和原名称不同，说明包含英文
        if (chineseName !== apiName) {
          englishApiNames.push(apiName);
        }
      }
      
      if (englishApiNames.length > 0) {
        console.warn(`警告：仍有 ${englishApiNames.length} 个api_name包含英文:`, 
          englishApiNames.join(', '));
      } else {
        console.log('✓ 所有api_name已更新为只保留中文');
      }
    } else {
      console.log('✓ 没有api_name需要检查');
    }
    
    console.log('\n✓ 迁移完成！');
    
  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateCleanBlogPosts()
    .then(() => {
      console.log('迁移脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { migrateCleanBlogPosts };

