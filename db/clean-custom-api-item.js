const { getAsync, runAsync } = require('./database');
const { logger } = require('../utils/logger');

/**
 * 从 custom_apis 的 response_content 中删除指定ID的项目
 */
async function cleanCustomApiItem(itemId, apiId = null) {
  try {
    console.log(`正在查找包含 ID ${itemId} 的API...`);
    
    // 如果提供了API ID，直接使用
    let api;
    if (apiId) {
      api = await getAsync(
        `SELECT id, name, path, response_content FROM custom_apis WHERE id = ?`,
        [apiId]
      );
    } else {
      // 否则搜索所有API
      const apis = await getAsync(
        `SELECT id, name, path, response_content FROM custom_apis WHERE method = 'GET' AND status = 'active'`
      );
      
      // 需要搜索所有API找到包含该ID的
      const { allAsync } = require('./database');
      const allApis = await allAsync(
        `SELECT id, name, path, response_content FROM custom_apis WHERE method = 'GET' AND status = 'active'`
      );
      
      for (const a of allApis) {
        try {
          const content = JSON.parse(a.response_content || '{}');
          let items = [];
          
          if (Array.isArray(content)) {
            items = content;
          } else if (content.data && Array.isArray(content.data)) {
            items = content.data;
          } else if (typeof content === 'object') {
            items = [content];
          }
          
          const found = items.some(item => {
            const itemIdStr = String(item.id || item._id || '');
            return itemIdStr === String(itemId);
          });
          
          if (found) {
            api = a;
            break;
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
    
    if (!api) {
      console.log(`❌ 未找到包含该ID的API`);
      return false;
    }
    
    console.log(`✅ 找到API: "${api.name}" (ID: ${api.id}, Path: ${api.path})`);
    
    // 解析 response_content
    let content;
    try {
      content = JSON.parse(api.response_content || '{}');
    } catch (e) {
      console.log(`❌ 解析 response_content 失败:`, e.message);
      return false;
    }
    
    // 处理不同格式
    let items = [];
    let isArrayFormat = false;
    let isDataFormat = false;
    
    if (Array.isArray(content)) {
      items = content;
      isArrayFormat = true;
    } else if (content.data && Array.isArray(content.data)) {
      items = content.data;
      isDataFormat = true;
    } else if (typeof content === 'object') {
      // 单个对象格式
      const itemIdStr = String(content.id || content._id || '');
      if (itemIdStr === String(itemId)) {
        // 这就是要删除的对象
        console.log(`✅ 找到要删除的项目（单个对象格式）`);
        console.log(`   名称: ${content.name || content.title || '未命名'}`);
        
        // 删除整个API或设置为空数组
        const newContent = { data: [] };
        await runAsync(
          `UPDATE custom_apis SET response_content = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
          [JSON.stringify(newContent), api.id]
        );
        
        console.log(`✅ 已清理API的 response_content`);
        return true;
      } else {
        console.log(`❌ 单个对象格式，但ID不匹配`);
        return false;
      }
    }
    
    // 查找并删除项目
    const originalLength = items.length;
    const filteredItems = items.filter(item => {
      const itemIdStr = String(item.id || item._id || '');
      return itemIdStr !== String(itemId);
    });
    
    if (filteredItems.length === originalLength) {
      console.log(`❌ 未在 items 中找到该ID`);
      return false;
    }
    
    const removedItem = items.find(item => {
      const itemIdStr = String(item.id || item._id || '');
      return itemIdStr === String(itemId);
    });
    
    console.log(`✅ 找到要删除的项目:`);
    console.log(`   名称: ${removedItem.name || removedItem.title || '未命名'}`);
    console.log(`   原始数量: ${originalLength}, 删除后数量: ${filteredItems.length}`);
    
    // 更新 response_content
    let newContent;
    if (isArrayFormat) {
      newContent = filteredItems;
    } else if (isDataFormat) {
      newContent = { ...content, data: filteredItems };
    } else {
      newContent = filteredItems.length > 0 ? filteredItems[0] : {};
    }
    
    await runAsync(
      `UPDATE custom_apis SET response_content = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`,
      [JSON.stringify(newContent), api.id]
    );
    
    console.log(`✅ 已从API中删除该项目`);
    return true;
  } catch (error) {
    console.error(`❌ 清理失败:`, error.message);
    logger.error('清理 custom_api item 失败', { itemId, apiId, error: error.message });
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const itemId = process.argv[2];
  const apiId = process.argv[3] || null;
  
  if (!itemId) {
    console.error('❌ 请提供项目ID');
    console.log('用法: node db/clean-custom-api-item.js <项目ID> [API ID]');
    process.exit(1);
  }
  
  cleanCustomApiItem(itemId, apiId)
    .then((success) => {
      if (success) {
        console.log('✅ 操作完成');
        process.exit(0);
      } else {
        console.log('❌ 操作失败');
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('❌ 操作失败:', err);
      process.exit(1);
    });
}

module.exports = { cleanCustomApiItem };

