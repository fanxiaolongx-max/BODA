const { initData } = require('../db/init');
const { allAsync } = require('../db/database');

async function checkBlogPostsExchange() {
  try {
    await initData();
    
    console.log('=== 检查 blog_posts 表中的汇率数据 ===\n');
    
    // 查找所有 exchange-rate 相关的文章
    const posts = await allAsync(
      `SELECT id, name, title, category, api_name, updated_at, created_at, custom_fields
       FROM blog_posts 
       WHERE api_name LIKE '%exchange%' 
          OR category LIKE '%汇率%' 
          OR category LIKE '%exchange%'
          OR name LIKE '%汇率%'
          OR name LIKE '%exchange%'
       ORDER BY updated_at DESC`
    );
    
    console.log(`找到 ${posts.length} 条相关文章:\n`);
    
    posts.forEach((post, index) => {
      console.log(`${index + 1}. 文章 ID: ${post.id}`);
      console.log(`   名称: ${post.name}`);
      console.log(`   标题: ${post.title || '无'}`);
      console.log(`   分类: ${post.category}`);
      console.log(`   API名称: ${post.api_name}`);
      console.log(`   创建时间: ${post.created_at}`);
      console.log(`   更新时间: ${post.updated_at}`);
      
      // 解析 custom_fields
      if (post.custom_fields) {
        try {
          const customFields = JSON.parse(post.custom_fields);
          if (customFields._specialType === 'exchange-rate') {
            console.log(`   特殊类型: ${customFields._specialType}`);
            if (customFields._specialData) {
              console.log(`   特殊数据: ${JSON.stringify(customFields._specialData).substring(0, 100)}...`);
            }
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
      
      console.log('');
    });
    
    if (posts.length > 0) {
      console.log('⚠️ 警告: blog_posts 表中有汇率相关的文章！');
      console.log('这可能导致 API 返回旧数据，而不是 custom_apis.response_content 中的最新数据。');
      console.log('\n建议:');
      console.log('1. 如果这些文章是旧的，可以删除它们');
      console.log('2. 或者确保 custom_apis.response_content 中的数据是最新的');
    } else {
      console.log('✅ blog_posts 表中没有汇率相关的文章');
      console.log('API 将从 custom_apis.response_content 读取数据');
    }
    
  } catch (error) {
    console.error('检查失败:', error);
  } finally {
    process.exit(0);
  }
}

checkBlogPostsExchange();

