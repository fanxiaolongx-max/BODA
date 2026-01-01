const { runAsync, waitForDbReady, getAsync } = require('./database');

/**
 * 迁移博客互动功能（点赞、收藏、评论）
 */
async function migrateBlogInteractions() {
  await waitForDbReady();
  
  try {
    // 1. 在 blog_posts 表中添加点赞数和收藏数字段
    try {
      await runAsync(`
        ALTER TABLE blog_posts 
        ADD COLUMN likes_count INTEGER DEFAULT 0
      `);
      console.log('已添加 likes_count 字段');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('likes_count 字段已存在，跳过');
      } else {
        throw error;
      }
    }

    try {
      await runAsync(`
        ALTER TABLE blog_posts 
        ADD COLUMN favorites_count INTEGER DEFAULT 0
      `);
      console.log('已添加 favorites_count 字段');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('favorites_count 字段已存在，跳过');
      } else {
        throw error;
      }
    }

    try {
      await runAsync(`
        ALTER TABLE blog_posts 
        ADD COLUMN comments_count INTEGER DEFAULT 0
      `);
      console.log('已添加 comments_count 字段');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('comments_count 字段已存在，跳过');
      } else {
        throw error;
      }
    }

    // 2. 创建 blog_likes 表（用户点赞记录）
    await runAsync(`
      CREATE TABLE IF NOT EXISTS blog_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_phone TEXT,
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        UNIQUE(post_id, user_id),
        FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_likes_post_id ON blog_likes(post_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_likes_user_id ON blog_likes(user_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_likes_user_phone ON blog_likes(user_phone)');
    console.log('blog_likes 表创建完成');

    // 3. 创建 blog_favorites 表（用户收藏记录）
    await runAsync(`
      CREATE TABLE IF NOT EXISTS blog_favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_phone TEXT,
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        UNIQUE(post_id, user_id),
        FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_favorites_post_id ON blog_favorites(post_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_favorites_user_id ON blog_favorites(user_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_favorites_user_phone ON blog_favorites(user_phone)');
    console.log('blog_favorites 表创建完成');

    // 4. 创建 blog_comments 表（评论）
    await runAsync(`
      CREATE TABLE IF NOT EXISTS blog_comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL,
        content TEXT NOT NULL,
        author_name TEXT NOT NULL,
        author_email TEXT,
        author_phone TEXT,
        user_id TEXT,
        parent_id TEXT,
        approved INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (post_id) REFERENCES blog_posts(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES blog_comments(id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_comments_post_id ON blog_comments(post_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_comments_user_id ON blog_comments(user_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_comments_parent_id ON blog_comments(parent_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_comments_approved ON blog_comments(approved)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_comments_created_at ON blog_comments(created_at DESC)');
    console.log('blog_comments 表创建完成');

    // 6. 在 blog_comments 表中添加点赞数字段
    try {
      await runAsync(`
        ALTER TABLE blog_comments 
        ADD COLUMN likes_count INTEGER DEFAULT 0
      `);
      console.log('已添加评论 likes_count 字段');
    } catch (error) {
      if (error.message.includes('duplicate column name')) {
        console.log('评论 likes_count 字段已存在，跳过');
      } else {
        throw error;
      }
    }

    // 7. 创建 blog_comment_likes 表（评论点赞记录）
    await runAsync(`
      CREATE TABLE IF NOT EXISTS blog_comment_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        comment_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_phone TEXT,
        created_at DATETIME DEFAULT (datetime('now', 'localtime')),
        UNIQUE(comment_id, user_id),
        FOREIGN KEY (comment_id) REFERENCES blog_comments(id) ON DELETE CASCADE
      )
    `);

    // 创建索引
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_comment_likes_comment_id ON blog_comment_likes(comment_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_comment_likes_user_id ON blog_comment_likes(user_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_blog_comment_likes_user_phone ON blog_comment_likes(user_phone)');
    console.log('blog_comment_likes 表创建完成');

    // 5. 初始化现有文章的计数（从现有数据计算）
    await initializeCounts();

    console.log('博客互动功能迁移完成');
  } catch (error) {
    console.error('博客互动功能迁移失败:', error);
    throw error;
  }
}

/**
 * 初始化现有文章的点赞数、收藏数和评论数
 */
async function initializeCounts() {
  try {
    // 更新点赞数
    await runAsync(`
      UPDATE blog_posts 
      SET likes_count = (
        SELECT COUNT(*) 
        FROM blog_likes 
        WHERE blog_likes.post_id = blog_posts.id
      )
    `);

    // 更新收藏数
    await runAsync(`
      UPDATE blog_posts 
      SET favorites_count = (
        SELECT COUNT(*) 
        FROM blog_favorites 
        WHERE blog_favorites.post_id = blog_posts.id
      )
    `);

    // 更新评论数（统计所有评论）
    await runAsync(`
      UPDATE blog_posts 
      SET comments_count = (
        SELECT COUNT(*) 
        FROM blog_comments 
        WHERE blog_comments.post_id = blog_posts.id
      )
    `);

    // 初始化评论点赞数
    await runAsync(`
      UPDATE blog_comments 
      SET likes_count = (
        SELECT COUNT(*) 
        FROM blog_comment_likes 
        WHERE blog_comment_likes.comment_id = blog_comments.id
      )
    `);

    console.log('已初始化文章和评论计数');
  } catch (error) {
    console.warn('初始化文章计数失败（可能是表刚创建，没有数据）:', error.message);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  migrateBlogInteractions()
    .then(() => {
      console.log('迁移完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('迁移失败:', error);
      process.exit(1);
    });
}

module.exports = { migrateBlogInteractions };

