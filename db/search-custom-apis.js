const { allAsync } = require('./database');

/**
 * 在 custom_apis 的 response_content 中搜索文章ID
 */
async function searchInCustomApis(searchId) {
  try {
    console.log(`正在搜索 custom_apis 表中的数据...`);
    
    // 获取所有 custom_apis
    const apis = await allAsync(
      `SELECT id, name, path, response_content FROM custom_apis WHERE method = 'GET' AND status = 'active'`
    );
    
    console.log(`找到 ${apis.length} 个API\n`);
    
    let found = false;
    
    for (const api of apis) {
      try {
        const content = JSON.parse(api.response_content || '{}');
        
        // 检查是否是数组格式
        let items = [];
        if (Array.isArray(content)) {
          items = content;
        } else if (content.data && Array.isArray(content.data)) {
          items = content.data;
        } else if (typeof content === 'object') {
          // 可能是单个对象
          items = [content];
        }
        
        // 搜索ID
        for (const item of items) {
          const itemId = item.id || item._id;
          if (String(itemId) === String(searchId)) {
            console.log(`✅ 在 API "${api.name}" (${api.path}) 中找到:`);
            console.log(`   ID: ${itemId}`);
            console.log(`   名称: ${item.name || item.title || '未命名'}`);
            console.log(`   API ID: ${api.id}`);
            found = true;
            
            // 询问是否要清理
            console.log(`\n💡 提示: 这个数据在 custom_apis 表中，不在 blog_posts 表中`);
            console.log(`   如果需要清理，可以删除或更新这个API的 response_content`);
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
    
    if (!found) {
      console.log(`❌ 未在 custom_apis 表中找到 ID: ${searchId}`);
      console.log(`\n💡 可能的原因:`);
      console.log(`   1. 这个ID已经不存在了`);
      console.log(`   2. 这个ID在前端缓存中，但数据库中已删除`);
      console.log(`   3. 这个ID在其他地方`);
    }
    
    return found;
  } catch (error) {
    console.error(`❌ 搜索失败:`, error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const searchId = process.argv[2];
  
  if (!searchId) {
    console.error('❌ 请提供文章ID');
    console.log('用法: node db/search-custom-apis.js <文章ID>');
    process.exit(1);
  }
  
  searchInCustomApis(searchId)
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ 操作失败:', err);
      process.exit(1);
    });
}

module.exports = { searchInCustomApis };

