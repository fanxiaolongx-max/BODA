/**
 * 为分类和文章添加内部唯一ID
 * 这些ID不对外呈现，仅用于系统内部唯一标识
 */

const { getAsync, allAsync, runAsync } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

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

async function addInternalIds() {
  await waitForDbReady();
  
  try {
    console.log('开始为分类和文章添加内部唯一ID...');
    
    // 1. 为custom_apis表添加internal_api_id字段
    try {
      await runAsync(`
        ALTER TABLE custom_apis 
        ADD COLUMN internal_api_id TEXT
      `);
      console.log('✓ 已添加internal_api_id字段到custom_apis表');
      
      // 创建唯一索引（SQLite不支持在ALTER TABLE时直接添加UNIQUE约束）
      try {
        await runAsync(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_apis_internal_api_id 
          ON custom_apis(internal_api_id)
        `);
        console.log('✓ 已创建internal_api_id唯一索引');
      } catch (indexError) {
        console.warn('⚠ 创建唯一索引失败（可能已存在）:', indexError.message);
      }
    } catch (error) {
      if (error.message.includes('duplicate column') || error.message.includes('already exists')) {
        console.log('✓ internal_api_id字段已存在');
        
        // 确保唯一索引存在
        try {
          await runAsync(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_apis_internal_api_id 
            ON custom_apis(internal_api_id)
          `);
          console.log('✓ 已确保internal_api_id唯一索引存在');
        } catch (indexError) {
          // 索引可能已存在，忽略错误
        }
      } else {
        throw error;
      }
    }
    
    // 2. 为所有分类生成内部唯一ID
    const apis = await allAsync(`
      SELECT id, name, path, response_content, internal_api_id
      FROM custom_apis
      WHERE method = 'GET' AND status = 'active'
    `);
    
    console.log(`找到 ${apis.length} 个分类`);
    
    let apiUpdated = 0;
    let postUpdated = 0;
    
    for (const api of apis) {
      // 为分类生成内部ID（如果还没有）
      let internalApiId = api.internal_api_id;
      if (!internalApiId) {
        internalApiId = uuidv4();
        await runAsync(
          `UPDATE custom_apis SET internal_api_id = ? WHERE id = ?`,
          [internalApiId, api.id]
        );
        apiUpdated++;
        console.log(`  ✓ 为分类 "${api.name}" 生成内部ID: ${internalApiId}`);
      }
      
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
      if (Array.isArray(responseContent)) {
        items = responseContent;
      } else if (responseContent.data && Array.isArray(responseContent.data)) {
        items = responseContent.data;
      }
      
      if (items.length === 0) {
        continue;
      }
      
      // 为每个文章生成内部ID（如果还没有）
      let hasChanges = false;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.internal_post_id) {
          item.internal_post_id = uuidv4();
          hasChanges = true;
          postUpdated++;
          console.log(`    ✓ 为文章 "${item.name || item.title || item.id}" 生成内部ID: ${item.internal_post_id}`);
        }
      }
      
      // 如果有更改，更新response_content
      if (hasChanges) {
        const updatedContent = Array.isArray(responseContent)
          ? items
          : { ...responseContent, data: items };
        
        await runAsync(
          `UPDATE custom_apis 
           SET response_content = ?, updated_at = datetime('now', 'localtime')
           WHERE id = ?`,
          [JSON.stringify(updatedContent), api.id]
        );
      }
    }
    
    console.log('\n完成！');
    console.log(`- 更新了 ${apiUpdated} 个分类的内部ID`);
    console.log(`- 更新了 ${postUpdated} 个文章的内部ID`);
    
  } catch (error) {
    console.error('添加内部ID失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  addInternalIds()
    .then(() => {
      console.log('迁移完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

module.exports = { addInternalIds };
