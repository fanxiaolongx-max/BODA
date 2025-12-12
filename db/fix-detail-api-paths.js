const { runAsync, getAsync, allAsync, waitForDbReady } = require('./database');

/**
 * 修复detailApi路径错误的API
 */
async function fixDetailApiPaths() {
  await waitForDbReady();
  
  try {
    console.log('开始修复detailApi路径...\n');
    
    const apiIds = [3, 4, 10]; // 需要修复的API ID
    
    for (const apiId of apiIds) {
      const api = await getAsync('SELECT id, name, path, response_content FROM custom_apis WHERE id = ?', [apiId]);
      
      if (!api) {
        console.log(`API ID ${apiId} 不存在，跳过`);
        continue;
      }
      
      console.log(`处理 API ID ${apiId}: ${api.name} (${api.path})`);
      
      let content = JSON.parse(api.response_content);
      const items = Array.isArray(content) ? content : (content.data || [content]);
      const isObjectWithData = !Array.isArray(content) && content.data;
      
      let hasChanges = false;
      
      const fixedItems = items.map(item => {
        if (item.detailApi && item.detailApi.includes('/test')) {
          // 修复错误的detailApi路径
          const correctDetailApi = `https://bobapro.life/api/custom${api.path}/${item.id}/detail`;
          console.log(`  修复项目 ID ${item.id}: ${item.detailApi} -> ${correctDetailApi}`);
          hasChanges = true;
          return {
            ...item,
            detailApi: correctDetailApi
          };
        }
        return item;
      });
      
      if (hasChanges) {
        let newContent;
        if (isObjectWithData) {
          newContent = {
            ...content,
            data: fixedItems
          };
        } else {
          newContent = fixedItems;
        }
        
        const newResponseContent = JSON.stringify(newContent, null, 2);
        await runAsync(
          `UPDATE custom_apis 
           SET response_content = ?, updated_at = datetime('now', 'localtime')
           WHERE id = ?`,
          [newResponseContent, apiId]
        );
        
        console.log(`  ✓ API ID ${apiId} 已修复\n`);
      } else {
        console.log(`  - API ID ${apiId} 无需修复\n`);
      }
    }
    
    console.log('修复完成！');
    
  } catch (error) {
    console.error('修复失败:', error);
    throw error;
  }
}

if (require.main === module) {
  fixDetailApiPaths()
    .then(() => {
      console.log('所有修复完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('修复失败:', error);
      process.exit(1);
    });
}

module.exports = { fixDetailApiPaths };
