const { runAsync, getAsync } = require('./database');
const { logger } = require('../utils/logger');

/**
 * 删除指定ID的文章
 */
async function deletePost(postId) {
  try {
    console.log(`正在查找文章 ID: ${postId}...`);
    
    // 先检查文章是否存在
    const post = await getAsync('SELECT id, name, title, api_name FROM blog_posts WHERE id = ?', [postId]);
    
    if (!post) {
      console.log(`❌ 文章不存在: ${postId}`);
      return false;
    }
    
    console.log(`找到文章:`);
    console.log(`  ID: ${post.id}`);
    console.log(`  名称: ${post.name || post.title || '未命名'}`);
    console.log(`  分类: ${post.api_name || '无分类'}`);
    
    // 删除文章
    console.log(`正在删除文章...`);
    const result = await runAsync('DELETE FROM blog_posts WHERE id = ?', [postId]);
    
    if (result.changes === 0) {
      console.log(`❌ 删除失败：未找到文章`);
      return false;
    }
    
    console.log(`✅ 文章删除成功！删除了 ${result.changes} 条记录`);
    return true;
  } catch (error) {
    console.error(`❌ 删除文章失败:`, error.message);
    logger.error('删除文章失败', { postId, error: error.message });
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const postId = process.argv[2];
  
  if (!postId) {
    console.error('❌ 请提供文章ID');
    console.log('用法: node db/delete-post.js <文章ID>');
    process.exit(1);
  }
  
  deletePost(postId)
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

module.exports = { deletePost };

