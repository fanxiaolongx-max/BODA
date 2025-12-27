const { runAsync, waitForDbReady } = require('./database');

async function migrateBlogPosts() {
  await waitForDbReady();
  
  try {
    // 创建 blog_posts 表
    await runAsync(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id TEXT PRIMARY KEY,
        api_name TEXT NOT NULL,
        name TEXT NOT NULL,
        title TEXT,
        slug TEXT,
        excerpt TEXT,
        description TEXT,
        html_content TEXT,
        image TEXT,
        category TEXT,
        published INTEGER DEFAULT 0,
        views INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
        custom_fields TEXT DEFAULT '{}'
      )
    `);

    // 创建索引
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_posts_api_name ON blog_posts(api_name)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts(slug)');
    await runAsync('CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_posts_slug_unique ON blog_posts(slug) WHERE slug IS NOT NULL AND slug != ""');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_posts_category ON blog_posts(category)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_posts_created_at ON blog_posts(created_at DESC)');

    console.log('blog_posts 表迁移完成');
  } catch (error) {
    console.error('blog_posts 表迁移失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateBlogPosts()
    .then(() => {
      console.log('迁移完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

module.exports = { migrateBlogPosts };


