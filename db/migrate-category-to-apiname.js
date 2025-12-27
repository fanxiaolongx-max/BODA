const { runAsync, allAsync, waitForDbReady } = require('./database');

/**
 * 迁移脚本：将category字段更新为对应的api_name值
 * 合并API/分类和分类字段，只保留API/分类
 */
async function migrateCategoryToApiName() {
  await waitForDbReady();
  
  try {
    console.log('开始迁移：将category字段更新为api_name...');
    
    // 检查blog_posts表是否存在
    const tableExists = await runAsync(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='blog_posts'
    `);
    
    if (!tableExists) {
      console.log('blog_posts表不存在，跳过迁移');
      return;
    }
    
    // 获取所有需要更新的记录（category != api_name 或 category IS NULL）
    const posts = await allAsync(`
      SELECT id, api_name, category 
      FROM blog_posts 
      WHERE category IS NULL OR category != api_name OR category = ''
    `);
    
    if (!posts || posts.length === 0) {
      console.log('没有需要更新的记录');
      return;
    }
    
    console.log(`找到 ${posts.length} 条需要更新的记录`);
    
    let updated = 0;
    let errors = 0;
    
    // 批量更新category字段为api_name
    for (const post of posts) {
      try {
        await runAsync(`
          UPDATE blog_posts 
          SET category = ?, updated_at = datetime('now', 'localtime')
          WHERE id = ?
        `, [post.api_name, post.id]);
        
        updated++;
        
        if (updated % 100 === 0) {
          console.log(`已更新 ${updated}/${posts.length} 条记录...`);
        }
      } catch (error) {
        console.error(`更新记录 ${post.id} 失败:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n迁移完成！`);
    console.log(`- 成功更新: ${updated} 条记录`);
    if (errors > 0) {
      console.log(`- 失败: ${errors} 条记录`);
    }
    
    // 验证迁移结果
    const remaining = await allAsync(`
      SELECT COUNT(*) as count 
      FROM blog_posts 
      WHERE category IS NULL OR category != api_name OR category = ''
    `);
    
    const remainingCount = remaining[0]?.count || 0;
    if (remainingCount > 0) {
      console.warn(`警告：仍有 ${remainingCount} 条记录的category字段未正确设置`);
    } else {
      console.log('✓ 所有记录的category字段已正确设置为api_name');
    }
    
  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateCategoryToApiName()
    .then(() => {
      console.log('迁移脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { migrateCategoryToApiName };

