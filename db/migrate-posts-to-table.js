const { runAsync, getAsync, allAsync, waitForDbReady } = require('./database');
const { v4: uuidv4 } = require('uuid');

async function migratePostsToTable() {
  await waitForDbReady();
  
  try {
    console.log('开始将文章数据从 custom_apis.response_content 迁移到 blog_posts 表...');
    
    // 检查 blog_posts 表是否已存在数据
    const existingPosts = await allAsync('SELECT COUNT(*) as count FROM blog_posts');
    if (existingPosts[0].count > 0) {
      console.log(`⚠️  blog_posts 表已有 ${existingPosts[0].count} 条记录，跳过迁移`);
      console.log('如需重新迁移，请先清空 blog_posts 表');
      return;
    }
    
    // 获取所有GET方法的API
    const apis = await allAsync(`
      SELECT id, name, path, response_content, created_at, updated_at
      FROM custom_apis
      WHERE method = 'GET' AND status = 'active'
      ORDER BY name ASC
    `);
    
    console.log(`找到 ${apis.length} 个API分类`);
    
    let totalMigrated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    for (const api of apis) {
      console.log(`\n处理分类: ${api.name} (${api.path})`);
      
      // 解析 response_content
      let responseContent;
      try {
        responseContent = JSON.parse(api.response_content);
      } catch (e) {
        console.warn(`  ⚠  response_content 解析失败，跳过: ${e.message}`);
        totalSkipped++;
        continue;
      }
      
      // 提取文章数组
      let items = [];
      let isArrayFormat = false;
      
      if (Array.isArray(responseContent)) {
        items = responseContent;
        isArrayFormat = true;
      } else if (responseContent && responseContent.data && Array.isArray(responseContent.data)) {
        items = responseContent.data;
        isArrayFormat = false;
      } else {
        console.log(`  ℹ 没有文章数据（格式: ${typeof responseContent}）`);
        continue;
      }
      
      if (items.length === 0) {
        console.log(`  ℹ 没有文章需要迁移`);
        continue;
      }
      
      console.log(`  找到 ${items.length} 篇文章`);
      
      let migrated = 0;
      let skipped = 0;
      let errors = 0;
      
      // 批量插入文章
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
        try {
          // 生成或验证文章ID
          let postId;
          if (item.id && UUID_REGEX.test(String(item.id))) {
            // 检查ID是否已存在
            const existing = await getAsync('SELECT id FROM blog_posts WHERE id = ?', [item.id]);
            if (existing) {
              console.warn(`    ⚠ 文章 ${i + 1} ID已存在，生成新ID: ${item.id}`);
              postId = uuidv4();
            } else {
              postId = item.id;
            }
          } else {
            // 生成新的UUID
            postId = uuidv4();
          }
          
          // 提取基本字段
          const name = item.name || item.title || '未命名文章';
          const title = item.title || item.name || name;
          const slug = item.slug || '';
          const excerpt = item.excerpt || item.description || '';
          const description = item.description || item.excerpt || excerpt;
          const htmlContent = item.htmlContent || item.html_content || item.content || '';
          const image = item.image || '';
          const category = item.category || item._sourceApiName || api.name;
          const published = item.published !== undefined ? (item.published ? 1 : 0) : 0;
          const views = parseInt(item.views) || 0;
          
          // 提取特殊字段到 custom_fields JSON
          const customFields = {};
          if (item.price !== undefined) customFields.price = item.price;
          if (item.rooms !== undefined) customFields.rooms = item.rooms;
          if (item.area !== undefined) customFields.area = item.area;
          if (item.phone !== undefined) customFields.phone = item.phone;
          if (item.address !== undefined) customFields.address = item.address;
          if (item.latitude !== undefined) customFields.latitude = item.latitude;
          if (item.longitude !== undefined) customFields.longitude = item.longitude;
          
          // 保留其他未映射的字段（排除已映射的字段）
          const excludedFields = ['id', 'name', 'title', 'slug', 'excerpt', 'description', 
            'htmlContent', 'html_content', 'content', 'image', 'category', '_sourceApiName',
            'published', 'views', 'price', 'rooms', 'area', 'phone', 'address', 
            'latitude', 'longitude', 'created_at', 'updated_at', 'internal_post_id'];
          
          for (const key in item) {
            if (!excludedFields.includes(key) && item[key] !== undefined && item[key] !== null) {
              customFields[key] = item[key];
            }
          }
          
          // 使用文章的创建时间，如果没有则使用API的创建时间
          const createdAt = item.created_at || item.createdAt || api.created_at || new Date().toISOString();
          const updatedAt = item.updated_at || item.updatedAt || api.updated_at || createdAt;
          
          // 插入到 blog_posts 表
          await runAsync(`
            INSERT INTO blog_posts (
              id, api_name, name, title, slug, excerpt, description,
              html_content, image, category, published, views,
              created_at, updated_at, custom_fields
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            postId,
            api.name,
            name,
            title,
            slug,
            excerpt,
            description,
            htmlContent,
            image,
            category,
            published,
            views,
            createdAt,
            updatedAt,
            JSON.stringify(customFields)
          ]);
          
          migrated++;
        } catch (error) {
          console.error(`    ✗ 文章 ${i + 1} 迁移失败: ${error.message}`);
          errors++;
          totalErrors++;
        }
      }
      
      console.log(`  ✓ 成功迁移 ${migrated} 篇，跳过 ${skipped} 篇，错误 ${errors} 篇`);
      totalMigrated += migrated;
      totalSkipped += skipped;
    }
    
    console.log('\n迁移完成！');
    console.log(`总计: 成功 ${totalMigrated} 篇，跳过 ${totalSkipped} 个API，错误 ${totalErrors} 篇`);
    
  } catch (error) {
    console.error('迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migratePostsToTable()
    .then(() => {
      console.log('迁移完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

module.exports = { migratePostsToTable };


