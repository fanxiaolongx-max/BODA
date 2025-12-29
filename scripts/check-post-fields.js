const { getAsync } = require('../db/database');
const { waitForDbReady } = require('../db/database');

async function checkPostFields(postId) {
  await waitForDbReady();
  
  try {
    const post = await getAsync(`
      SELECT 
        id, name, api_name, category,
        custom_fields, created_at, updated_at
      FROM blog_posts
      WHERE id = ?
    `, [postId]);
    
    if (!post) {
      console.log('❌ 未找到文章，ID:', postId);
      return;
    }
    
    console.log('✅ 找到文章:');
    console.log('  ID:', post.id);
    console.log('  名称:', post.name);
    console.log('  API名称:', post.api_name);
    console.log('  分类:', post.category);
    console.log('  创建时间:', post.created_at);
    console.log('  更新时间:', post.updated_at);
    console.log('');
    
    // 解析 custom_fields
    let customFields = {};
    try {
      if (post.custom_fields) {
        customFields = JSON.parse(post.custom_fields);
      }
    } catch (e) {
      console.log('❌ 解析 custom_fields 失败:', e.message);
      return;
    }
    
    console.log('📋 custom_fields 内容:');
    console.log(JSON.stringify(customFields, null, 2));
    console.log('');
    
    // 检查新增字段
    console.log('🔍 检查新增字段:');
    const newFields = ['nickname', 'deviceModel', 'deviceId', 'deviceIp'];
    let hasNewFields = false;
    
    for (const field of newFields) {
      if (customFields[field] !== undefined) {
        console.log(`  ✅ ${field}:`, customFields[field]);
        hasNewFields = true;
      } else {
        console.log(`  ❌ ${field}: 未找到`);
      }
    }
    
    if (!hasNewFields) {
      console.log('');
      console.log('⚠️  警告: 未找到任何新增字段！');
      console.log('   请确认请求中是否包含了这些字段。');
    }
    
    // 显示所有 custom_fields 字段
    console.log('');
    console.log('📊 所有 custom_fields 字段:');
    const allFields = Object.keys(customFields);
    if (allFields.length === 0) {
      console.log('  (空)');
    } else {
      allFields.forEach(field => {
        console.log(`  - ${field}:`, customFields[field]);
      });
    }
    
  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

// 从命令行参数获取文章ID
const postId = process.argv[2];
if (!postId) {
  console.error('❌ 请提供文章ID');
  console.error('用法: node scripts/check-post-fields.js <文章ID>');
  process.exit(1);
}

checkPostFields(postId);

