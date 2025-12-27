const { getAsync, allAsync } = require('./database');

/**
 * 搜索文章
 */
async function searchPost(searchTerm) {
  try {
    console.log(`正在搜索: ${searchTerm}...`);
    
    // 搜索ID
    const byId = await getAsync('SELECT id, name, title, api_name, slug FROM blog_posts WHERE id = ?', [searchTerm]);
    if (byId) {
      console.log(`\n✅ 通过ID找到:`);
      console.log(`  ID: ${byId.id}`);
      console.log(`  名称: ${byId.name || byId.title || '未命名'}`);
      console.log(`  分类: ${byId.api_name || '无分类'}`);
      console.log(`  Slug: ${byId.slug || '无'}`);
      return byId;
    }
    
    // 搜索名称中包含 Neferdidi 的文章
    const byName = await allAsync(
      `SELECT id, name, title, api_name, slug FROM blog_posts 
       WHERE name LIKE ? OR title LIKE ? OR slug LIKE ? 
       LIMIT 10`,
      [`%${searchTerm}%`, `%${searchTerm}%`, `%${searchTerm}%`]
    );
    
    if (byName && byName.length > 0) {
      console.log(`\n✅ 通过名称找到 ${byName.length} 条记录:`);
      byName.forEach((post, index) => {
        console.log(`\n  ${index + 1}. ID: ${post.id}`);
        console.log(`     名称: ${post.name || post.title || '未命名'}`);
        console.log(`     分类: ${post.api_name || '无分类'}`);
        console.log(`     Slug: ${post.slug || '无'}`);
      });
      return byName;
    }
    
    // 搜索包含"副本"的文章
    const byCopy = await allAsync(
      `SELECT id, name, title, api_name, slug FROM blog_posts 
       WHERE name LIKE ? OR title LIKE ? 
       LIMIT 10`,
      ['%副本%', '%副本%']
    );
    
    if (byCopy && byCopy.length > 0) {
      console.log(`\n✅ 找到包含"副本"的 ${byCopy.length} 条记录:`);
      byCopy.forEach((post, index) => {
        console.log(`\n  ${index + 1}. ID: ${post.id}`);
        console.log(`     名称: ${post.name || post.title || '未命名'}`);
        console.log(`     分类: ${post.api_name || '无分类'}`);
        console.log(`     Slug: ${post.slug || '无'}`);
      });
      return byCopy;
    }
    
    console.log(`\n❌ 未找到匹配的文章`);
    return null;
  } catch (error) {
    console.error(`❌ 搜索失败:`, error.message);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const searchTerm = process.argv[2] || 'Neferdidi';
  
  searchPost(searchTerm)
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ 操作失败:', err);
      process.exit(1);
    });
}

module.exports = { searchPost };

