/**
 * 统一使用htmlContent字段
 * 1. 将所有文章的content转换为htmlContent（如果有content但没有htmlContent）
 * 2. 为所有没有htmlContent的文章添加示例HTML
 * 3. 删除所有文章的content和detailApi字段
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

async function migrateToHtmlContentOnly() {
  await waitForDbReady();
  
  try {
    console.log('开始统一使用htmlContent字段...');
    
    // 获取所有分类
    const apis = await allAsync(`
      SELECT id, name, path, response_content
      FROM custom_apis
      WHERE method = 'GET' AND status = 'active'
    `);
    
    console.log(`找到 ${apis.length} 个分类`);
    
    const defaultHtmlContent = '<h2>详细说明</h2><p>这是一段详细的描述内容...</p><p>更多信息请参考官方文档。</p>';
    
    let totalUpdated = 0;
    let contentConverted = 0;
    let htmlContentAdded = 0;
    let detailApiDeleted = 0;
    
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
        let itemChanged = false;
        
        // 1. 如果有content但没有htmlContent，将content转换为htmlContent
        if (item.content && !item.htmlContent) {
          // 如果content看起来像HTML（以<开头），直接使用
          if (item.content.trim().startsWith('<')) {
            item.htmlContent = item.content;
          } else {
            // 否则，将content作为HTML内容（简单处理，保留原有内容）
            item.htmlContent = `<p>${item.content.replace(/\n/g, '</p><p>')}</p>`;
          }
          delete item.content;
          itemChanged = true;
          contentConverted++;
          console.log(`  ✓ 文章 ${i + 1}: 将content转换为htmlContent (${item.name || item.title || '未命名'})`);
        }
        
        // 2. 如果既没有content也没有htmlContent，添加示例HTML
        if (!item.htmlContent && !item.content) {
          item.htmlContent = defaultHtmlContent;
          itemChanged = true;
          htmlContentAdded++;
          console.log(`  ✓ 文章 ${i + 1}: 添加示例htmlContent (${item.name || item.title || '未命名'})`);
        }
        
        // 3. 如果有content但已经有htmlContent，删除content
        if (item.content && item.htmlContent) {
          delete item.content;
          itemChanged = true;
          console.log(`  ✓ 文章 ${i + 1}: 删除content字段，保留htmlContent (${item.name || item.title || '未命名'})`);
        }
        
        // 4. 删除detailApi字段
        if (item.detailApi) {
          delete item.detailApi;
          itemChanged = true;
          detailApiDeleted++;
          console.log(`  ✓ 文章 ${i + 1}: 删除detailApi字段 (${item.name || item.title || '未命名'})`);
        }
        
        if (itemChanged) {
          hasChanges = true;
          updatedCount++;
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
        console.log(`  ✓ 已更新 ${updatedCount} 个文章`);
      } else {
        console.log(`  ℹ 没有需要更新的文章`);
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('迁移完成！');
    console.log(`- 更新了 ${totalUpdated} 个文章`);
    console.log(`- 转换了 ${contentConverted} 个content字段为htmlContent`);
    console.log(`- 添加了 ${htmlContentAdded} 个示例htmlContent`);
    console.log(`- 删除了 ${detailApiDeleted} 个detailApi字段`);
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateToHtmlContentOnly()
    .then(() => {
      console.log('\n迁移脚本执行完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n迁移脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { migrateToHtmlContentOnly };
