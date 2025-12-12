/**
 * 将文章ID迁移为全局唯一ID
 * 将internal_post_id的值复制到id字段，并删除internal_post_id字段
 */

const { getAsync, allAsync, runAsync } = require('../db/database');

async function waitForDbReady() {
  const maxRetries = 10;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      await getAsync('SELECT 1');
      return;
    } catch (error) {
      retries++;
      if (retries >= maxRetries) {
        throw new Error('数据库连接失败');
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

async function migratePostIdsToGlobal() {
  await waitForDbReady();
  
  try {
    console.log('开始将文章ID迁移为全局唯一ID...');
    
    // 获取所有分类
    const apis = await allAsync(`
      SELECT id, name, path, response_content
      FROM custom_apis
      WHERE method = 'GET' AND status = 'active'
    `);
    
    console.log(`找到 ${apis.length} 个分类`);
    
    let totalUpdated = 0;
    let totalDeleted = 0;
    
    for (const api of apis) {
      console.log(`\n处理分类: ${api.name}`);
      
      // 解析response_content
      let responseContent;
      try {
        responseContent = JSON.parse(api.response_content);
      } catch (e) {
        console.warn(`  ⚠ 分类 "${api.name}" 的response_content解析失败，跳过`);
        continue;
      }
      
      // 获取文章列表
      let items = [];
      let isArray = false;
      if (Array.isArray(responseContent)) {
        items = responseContent;
        isArray = true;
      } else if (responseContent.data && Array.isArray(responseContent.data)) {
        items = responseContent.data;
      }
      
      if (items.length === 0) {
        console.log(`  ℹ 没有文章需要处理`);
        continue;
      }
      
      let hasChanges = false;
      let updatedCount = 0;
      
      // 处理每个文章
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        // 如果有internal_post_id，将其值复制到id
        if (item.internal_post_id) {
          const oldId = item.id;
          item.id = item.internal_post_id;
          delete item.internal_post_id; // 删除internal_post_id字段
          hasChanges = true;
          updatedCount++;
          console.log(`  ✓ 文章 ${i + 1}: ${oldId} -> ${item.id} (${item.name || item.title || '未命名'})`);
        } else {
          console.log(`  ⚠ 文章 ${i + 1} 没有internal_post_id，跳过: ${item.id} (${item.name || item.title || '未命名'})`);
        }
      }
      
      // 如果有更改，更新response_content
      if (hasChanges) {
        const updatedContent = isArray
          ? items
          : { ...responseContent, data: items };
        
        await runAsync(
          `UPDATE custom_apis 
           SET response_content = ?, updated_at = datetime('now', 'localtime')
           WHERE id = ?`,
          [JSON.stringify(updatedContent), api.id]
        );
        
        totalUpdated += updatedCount;
        console.log(`  ✓ 已更新 ${updatedCount} 个文章的ID`);
      } else {
        console.log(`  ℹ 没有需要更新的文章`);
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('迁移完成！');
    console.log(`- 更新了 ${totalUpdated} 个文章的ID为全局唯一ID`);
    console.log(`- 所有文章的ID现在都是全局唯一的`);
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migratePostIdsToGlobal()
    .then(() => {
      console.log('\n迁移脚本执行完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n迁移脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { migratePostIdsToGlobal };
