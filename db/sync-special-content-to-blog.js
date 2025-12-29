const { getAsync, runAsync, allAsync, waitForDbReady } = require('./database');
const { v4: uuidv4 } = require('uuid');

/**
 * 将特殊类型内容（天气、汇率、翻译）从 custom_apis 同步到 blog_posts
 */
async function syncSpecialContentToBlog() {
  await waitForDbReady();
  
  try {
    console.log('开始同步特殊类型内容到 blog_posts 表...\n');
    
    // 要同步的API路径
    const specialApis = [
      { path: '/weather', apiName: '天气路况', specialType: 'weather' },
      { path: '/exchange-rate', apiName: '汇率转换', specialType: 'exchange-rate' },
      { path: '/translation', apiName: '翻译卡片', specialType: 'translation' }
    ];
    
    let totalSynced = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    
    for (const apiInfo of specialApis) {
      console.log(`\n处理 ${apiInfo.apiName} (${apiInfo.path})...`);
      
      // 获取API数据（包括inactive的）
      const api = await getAsync(`
        SELECT id, name, path, response_content, updated_at
        FROM custom_apis
        WHERE path = ? AND method = 'GET'
      `, [apiInfo.path]);
      
      if (!api) {
        console.log(`  ⚠️  未找到API: ${apiInfo.path}`);
        continue;
      }
      
      // 解析响应内容
      let responseContent;
      try {
        responseContent = JSON.parse(api.response_content);
      } catch (e) {
        console.error(`  ❌ 解析响应内容失败: ${e.message}`);
        totalErrors++;
        continue;
      }
      
      // 检查是否已存在文章
      const existingPosts = await allAsync(`
        SELECT id FROM blog_posts 
        WHERE api_name = ? OR category = ? OR (api_name LIKE ? OR category LIKE ?)
      `, [
        api.name,
        apiInfo.apiName,
        `%${apiInfo.apiName}%`,
        `%${apiInfo.apiName}%`
      ]);
      
      if (apiInfo.specialType === 'weather') {
        // 天气路况：对象格式，整个对象是一个文章
        if (responseContent.globalAlert && responseContent.attractions && responseContent.traffic) {
          const weatherPostId = `weather-${api.name}`;
          
          // 检查是否已存在
          const existing = existingPosts.find(p => p.id === weatherPostId);
          
          if (existing) {
            console.log(`  ℹ️  天气文章已存在，更新中...`);
            // 更新现有文章
            const customFields = {
              _specialType: 'weather',
              _specialData: responseContent
            };
            
            await runAsync(`
              UPDATE blog_posts
              SET custom_fields = ?,
                  updated_at = datetime('now', 'localtime')
              WHERE id = ?
            `, [JSON.stringify(customFields), weatherPostId]);
            
            totalSynced++;
            console.log(`  ✅ 已更新天气文章`);
          } else {
            // 创建新文章（直接插入数据库）
            const customFields = {
              _specialType: 'weather',
              _specialData: responseContent
            };
            
            await runAsync(`
              INSERT INTO blog_posts (
                id, api_name, name, title, slug, excerpt, description,
                html_content, image, category, published, views,
                created_at, updated_at, custom_fields
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'), ?)
            `, [
              weatherPostId,
              api.name,
              apiInfo.apiName,
              apiInfo.apiName,
              'weather',
              responseContent.globalAlert?.message || '',
              responseContent.globalAlert?.message || '',
              '',
              null,
              apiInfo.apiName,
              1, // published = 1 (已发布)
              0,
              JSON.stringify(customFields)
            ]);
            
            totalSynced++;
            console.log(`  ✅ 已创建天气文章`);
          }
        } else {
          console.log(`  ⚠️  天气数据格式不正确，跳过`);
          totalSkipped++;
        }
      } else if (apiInfo.specialType === 'exchange-rate') {
        // 汇率转换：数组格式，每个元素是一个文章
        let items = [];
        if (Array.isArray(responseContent)) {
          items = responseContent;
        } else if (responseContent.data && Array.isArray(responseContent.data)) {
          items = responseContent.data;
        } else {
          // 单个对象，包装成数组
          items = [responseContent];
        }
        
        console.log(`  找到 ${items.length} 个汇率记录`);
        
        for (const item of items) {
          const itemId = item.id || uuidv4();
          const existing = existingPosts.find(p => String(p.id) === String(itemId));
          
          if (existing) {
            // 更新现有文章
            const customFields = {
              _specialType: 'exchange-rate',
              _specialData: item
            };
            
            await runAsync(`
              UPDATE blog_posts
              SET custom_fields = ?,
                  updated_at = datetime('now', 'localtime')
              WHERE id = ?
            `, [JSON.stringify(customFields), itemId]);
            
            totalSynced++;
          } else {
            // 创建新文章（直接插入数据库）
            const customFields = {
              _specialType: 'exchange-rate',
              _specialData: item
            };
            
            const slug = `exchange-rate-${String(itemId).substring(0, 8)}`;
            
            await runAsync(`
              INSERT INTO blog_posts (
                id, api_name, name, title, slug, excerpt, description,
                html_content, image, category, published, views,
                created_at, updated_at, custom_fields
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'), ?)
            `, [
              String(itemId),
              api.name,
              item.name || apiInfo.apiName,
              item.name || apiInfo.apiName,
              slug,
              apiInfo.apiName,
              apiInfo.apiName,
              '',
              null,
              apiInfo.apiName,
              1, // published = 1 (已发布)
              0,
              JSON.stringify(customFields)
            ]);
            
            totalSynced++;
          }
        }
        
        console.log(`  ✅ 已同步 ${items.length} 个汇率记录`);
      } else if (apiInfo.specialType === 'translation') {
        // 翻译卡片：数组格式，每个元素是一个文章
        let items = [];
        if (Array.isArray(responseContent)) {
          items = responseContent;
        } else if (responseContent.data && Array.isArray(responseContent.data)) {
          items = responseContent.data;
        }
        
        console.log(`  找到 ${items.length} 个翻译卡片`);
        
        for (const item of items) {
          const itemId = item.id || uuidv4();
          const existing = existingPosts.find(p => String(p.id) === String(itemId));
          
          if (existing) {
            // 更新现有文章
            const customFields = {
              _specialType: 'translation',
              _specialData: item
            };
            
            await runAsync(`
              UPDATE blog_posts
              SET custom_fields = ?,
                  name = ?,
                  title = ?,
                  excerpt = ?,
                  description = ?,
                  updated_at = datetime('now', 'localtime')
              WHERE id = ?
            `, [
              JSON.stringify(customFields),
              item.name || item.chinese || '翻译卡片',
              item.name || item.chinese || '翻译卡片',
              item.chinese || '',
              item.chinese || '',
              itemId
            ]);
            
            totalSynced++;
          } else {
            // 创建新文章（直接插入数据库）
            const customFields = {
              _specialType: 'translation',
              _specialData: item
            };
            
            const slug = item.slug || `translation-${String(itemId).substring(0, 8)}`;
            const name = item.name || item.chinese || '翻译卡片';
            const excerpt = item.chinese || '';
            
            await runAsync(`
              INSERT INTO blog_posts (
                id, api_name, name, title, slug, excerpt, description,
                html_content, image, category, published, views,
                created_at, updated_at, custom_fields
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'), ?)
            `, [
              String(itemId),
              api.name,
              name,
              name,
              slug,
              excerpt,
              excerpt,
              '',
              null,
              apiInfo.apiName,
              1, // published = 1 (已发布)
              item.views || 0,
              JSON.stringify(customFields)
            ]);
            
            totalSynced++;
          }
        }
        
        console.log(`  ✅ 已同步 ${items.length} 个翻译卡片`);
      }
    }
    
    console.log(`\n✅ 同步完成！`);
    console.log(`  - 已同步: ${totalSynced} 条记录`);
    console.log(`  - 已跳过: ${totalSkipped} 条记录`);
    console.log(`  - 错误: ${totalErrors} 条记录`);
    
  } catch (error) {
    console.error('❌ 同步失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  syncSpecialContentToBlog()
    .then(() => {
      console.log('\n完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n失败:', error);
      process.exit(1);
    });
}

module.exports = { syncSpecialContentToBlog };

