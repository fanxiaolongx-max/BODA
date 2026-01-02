const express = require('express');
const { 
  getBlogPosts, 
  getBlogPost, 
  getBlogCategories, 
  getBlogComments,
  incrementPostViews,
  createBlogComment
} = require('../utils/blog-helper');
const { logger } = require('../utils/logger');
const { getAsync, runAsync, allAsync } = require('../db/database');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

/**
 * 获取当前本地时间字符串（格式：YYYY-MM-DD HH:mm:ss）
 * 使用 Node.js 的时区设置（通过 TZ 环境变量，如 Africa/Cairo）
 */
function getCurrentLocalTimeString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 获取当前登录用户的手机号
 * 支持Session认证和Token认证
 */
async function getCurrentUserPhone(req) {
  try {
    // 优先检查Session认证（浏览器）
    if (req.session && req.session.userPhone) {
      return req.session.userPhone;
    }
    
    // 如果没有Session，尝试Token认证（小程序）
    const token = req.headers['x-user-token'] || 
                  req.headers['X-User-Token'] || 
                  req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                  req.query.token;
    
    if (token) {
      // 验证Token并获取用户信息
      const { getAsync } = require('../db/database');
      try {
        const tokenRecord = await getAsync(
          `SELECT ut.user_id, ut.expires_at, u.id, u.phone, u.name 
           FROM user_tokens ut 
           JOIN users u ON ut.user_id = u.id 
           WHERE ut.token = ? AND ut.expires_at > datetime('now')`,
          [token]
        );
        
        if (tokenRecord && tokenRecord.phone) {
          return tokenRecord.phone;
        }
      } catch (error) {
        logger.error('验证Token失败', { error: error.message });
      }
    }
    
    // 如果Session中有userId但没有userPhone，从数据库查询
    if (req.session && req.session.userId) {
      const user = await getAsync(
        'SELECT phone FROM users WHERE id = ?',
        [req.session.userId]
      );
      if (user && user.phone) {
        return user.phone;
      }
    }
    
    return null;
  } catch (error) {
    logger.error('获取当前用户手机号失败', { error: error.message });
    return null;
  }
}

/**
 * GET /api/blog/posts
 * 获取文章列表
 */
router.get('/posts', async (req, res) => {
  try {
    const { 
      page = 1, 
      pageSize = 6, 
      category, 
      search,
      published = 'true',
      myPosts = 'false' // 新增：是否只显示当前用户的文章
    } = req.query;
    
    // 获取当前登录用户的手机号
    const userPhone = await getCurrentUserPhone(req);
    
    // 如果用户已登录，需要返回：所有已发布的文章 + 该用户的草稿文章
    // 如果用户未登录，只返回已发布的文章
    let posts = [];
    
    // 如果请求只显示我的文章，且用户已登录
    if (myPosts === 'true' && userPhone) {
      logger.debug('筛选"我的文章"', { userPhone, category, search });
      // 只获取该用户的文章（包括已发布和草稿）
      const userPostsOptions = {
        publishedOnly: false, // 获取所有文章（包括未发布的）
        category: category || undefined,
        search: search || undefined
      };
      const allPosts = await getBlogPosts(userPostsOptions);
      
      // 筛选出该用户的文章（deviceId匹配）
      posts = allPosts.filter(post => {
        const matches = post.deviceId === userPhone;
        if (!matches && post.deviceId) {
          logger.debug('文章deviceId不匹配', { 
            postId: post.id, 
            postDeviceId: post.deviceId, 
            userPhone 
          });
        }
        return matches;
      });
      
      logger.debug('筛选结果', { 
        totalPosts: allPosts.length, 
        myPosts: posts.length, 
        userPhone 
      });
    } else {
      // 根据 published 参数决定返回哪些文章
      // 如果 published === 'true'，严格只返回已发布的文章（不包含任何草稿）
      // 如果 published !== 'true'，返回所有文章（包括未发布的）
      const options = {
        publishedOnly: published === 'true',
        category: category || undefined,
        search: search || undefined
      };
      posts = await getBlogPosts(options);
      
      // 如果 published === 'true'，确保过滤掉所有未发布的文章
      // 即使用户已登录，也不应该返回草稿（草稿应该通过 myPosts=true 参数获取）
      if (published === 'true') {
        posts = posts.filter(post => post.published === true || post.published === 1);
      }
    }
    
    // 分页
    const total = posts.length;
    const totalPages = Math.ceil(total / pageSize);
    const currentPage = parseInt(page, 10);
    const startIndex = (currentPage - 1) * parseInt(pageSize, 10);
    const endIndex = startIndex + parseInt(pageSize, 10);
    const paginatedPosts = posts.slice(startIndex, endIndex);
    
    // 清理内部字段（不对外暴露）
    // 列表场景只保留 HTML 内容的前10个字节，减少响应体积
    const { cleanPostForPublic } = require('../utils/blog-helper');
    const cleanedPosts = paginatedPosts.map(post => {
      const cleaned = cleanPostForPublic(post, false, true); // 第三个参数表示列表场景
      
      // 对于特殊类型（汇率、天气、翻译），将_specialData的内容展开到顶层，以兼容前端代码
      if (cleaned._specialType && cleaned._specialData) {
        if (cleaned._specialType === 'exchange-rate') {
          // 汇率：将_specialData的内容合并到顶层，但保留_specialData字段
          Object.keys(cleaned._specialData).forEach(key => {
            // 跳过标准字段，只保留汇率数据（CNY, USD等货币代码）
            if (!['id', 'name', 'title', 'slug', 'excerpt', 'description', 'detailApi'].includes(key)) {
              cleaned[key] = cleaned._specialData[key];
            }
          });
        }
        // 天气和翻译保持原样，因为它们的结构更复杂
      }
      
      // 判断当前登录用户的手机号是否与文章的deviceId一致
      // 如果一致，添加canEdit字段
      if (userPhone && post.deviceId && userPhone === post.deviceId) {
        cleaned.canEdit = true;
      }
      
      return cleaned;
    });
    
    res.json({
      success: true,
      data: cleanedPosts,
      pagination: {
        currentPage,
        pageSize: parseInt(pageSize, 10),
        total,
        totalPages
      }
    });
  } catch (error) {
    logger.error('获取文章列表失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '获取文章列表失败' 
    });
  }
});

/**
 * GET /api/blog/posts/my-likes
 * 获取我点赞的文章列表
 */
router.get('/posts/my-likes', async (req, res) => {
  try {
    const { page = 1, pageSize = 6 } = req.query;
    const userPhone = await getCurrentUserPhone(req);
    
    if (!userPhone) {
      return res.status(401).json({ 
        success: false, 
        message: '需要登录才能查看点赞的文章' 
      });
    }

    // 查询我点赞的文章ID列表
    const likedPosts = await allAsync(
      `SELECT post_id, created_at as liked_at 
       FROM blog_likes 
       WHERE user_phone = ? 
       ORDER BY created_at DESC`,
      [userPhone]
    );

    if (!likedPosts || likedPosts.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          currentPage: parseInt(page, 10),
          pageSize: parseInt(pageSize, 10),
          total: 0,
          totalPages: 0
        }
      });
    }

    // 获取文章ID列表（保持点赞时间顺序）
    const postIds = likedPosts.map(item => item.post_id);
    
    // 创建post_id到点赞时间的映射，用于后续排序
    const likedAtMap = new Map();
    likedPosts.forEach(item => {
      likedAtMap.set(item.post_id, item.liked_at);
    });
    
    // 查询文章详情
    const placeholders = postIds.map(() => '?').join(',');
    const rows = await allAsync(`
      SELECT 
        id, api_name, name, title, slug, excerpt, description,
        html_content, image, category, published, views,
        COALESCE(likes_count, 0) as likes_count,
        COALESCE(favorites_count, 0) as favorites_count,
        COALESCE(comments_count, 0) as comments_count,
        created_at, updated_at, custom_fields
      FROM blog_posts
      WHERE id IN (${placeholders})
    `, postIds);

    // 批量获取所有API的字段映射配置
    const { getAllApiFieldMappings, cleanPostForPublic } = require('../utils/blog-helper');
    const apiNames = [...new Set(rows.map(row => row.api_name))];
    const allFieldMappings = await getAllApiFieldMappings(apiNames);

    // 创建post_id到文章对象的映射
    const postsMap = new Map();
    rows.forEach(row => {
      // 解析 custom_fields JSON
      let customFields = {};
      try {
        if (row.custom_fields) {
          customFields = JSON.parse(row.custom_fields);
        }
      } catch (e) {
        logger.warn('解析custom_fields失败', { id: row.id, error: e.message });
      }
      
      // 获取字段映射配置
      const fieldMapping = allFieldMappings.get(row.api_name) || null;
      
      // 构建文章对象
      const post = {
        id: row.id,
        name: row.name,
        title: row.title || row.name,
        slug: row.slug,
        excerpt: row.excerpt,
        description: row.description || row.excerpt,
        htmlContent: row.html_content,
        image: row.image,
        category: row.category || row.api_name,
        apiName: row.api_name,
        published: row.published === 1,
        views: row.views || 0,
        likesCount: row.likes_count || 0,
        favoritesCount: row.favorites_count || 0,
        commentsCount: row.comments_count || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        customFields: customFields,
        _fieldMapping: fieldMapping
      };

      // 添加点赞时间
      const likedAt = likedAtMap.get(row.id);
      if (likedAt) {
        post.likedAt = likedAt;
      }

      postsMap.set(row.id, post);
    });

    // 按照点赞时间顺序排列文章（最新的在前）
    const allPosts = postIds
      .map(postId => postsMap.get(postId))
      .filter(post => post !== undefined); // 过滤掉可能不存在的文章

    // 分页
    const total = allPosts.length;
    const totalPages = Math.ceil(total / pageSize);
    const currentPage = parseInt(page, 10);
    const startIndex = (currentPage - 1) * parseInt(pageSize, 10);
    const endIndex = startIndex + parseInt(pageSize, 10);
    const paginatedPosts = allPosts.slice(startIndex, endIndex);
    
    // 清理内部字段（不对外暴露）
    const cleanedPosts = paginatedPosts.map(post => {
      const cleaned = cleanPostForPublic(post, false, true); // 第三个参数表示列表场景
      
      // 判断当前登录用户的手机号是否与文章的deviceId一致
      if (userPhone && post.deviceId && userPhone === post.deviceId) {
        cleaned.canEdit = true;
      }
      
      return cleaned;
    });
    
    res.json({
      success: true,
      data: cleanedPosts,
      pagination: {
        currentPage,
        pageSize: parseInt(pageSize, 10),
        total,
        totalPages
      }
    });
  } catch (error) {
    logger.error('获取点赞文章列表失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '获取点赞文章列表失败' 
    });
  }
});

/**
 * GET /api/blog/posts/my-favorites
 * 获取我的收藏文章列表
 */
router.get('/posts/my-favorites', async (req, res) => {
  try {
    const { page = 1, pageSize = 6 } = req.query;
    const userPhone = await getCurrentUserPhone(req);
    
    if (!userPhone) {
      return res.status(401).json({ 
        success: false, 
        message: '需要登录才能查看收藏的文章' 
      });
    }

    // 查询我收藏的文章ID列表
    const favoritedPosts = await allAsync(
      `SELECT post_id, created_at as favorited_at 
       FROM blog_favorites 
       WHERE user_phone = ? 
       ORDER BY created_at DESC`,
      [userPhone]
    );

    if (!favoritedPosts || favoritedPosts.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: {
          currentPage: parseInt(page, 10),
          pageSize: parseInt(pageSize, 10),
          total: 0,
          totalPages: 0
        }
      });
    }

    // 获取文章ID列表（保持收藏时间顺序）
    const postIds = favoritedPosts.map(item => item.post_id);
    
    // 创建post_id到收藏时间的映射，用于后续排序
    const favoritedAtMap = new Map();
    favoritedPosts.forEach(item => {
      favoritedAtMap.set(item.post_id, item.favorited_at);
    });
    
    // 查询文章详情
    const placeholders = postIds.map(() => '?').join(',');
    const rows = await allAsync(`
      SELECT 
        id, api_name, name, title, slug, excerpt, description,
        html_content, image, category, published, views,
        COALESCE(likes_count, 0) as likes_count,
        COALESCE(favorites_count, 0) as favorites_count,
        COALESCE(comments_count, 0) as comments_count,
        created_at, updated_at, custom_fields
      FROM blog_posts
      WHERE id IN (${placeholders})
    `, postIds);

    // 批量获取所有API的字段映射配置
    const { getAllApiFieldMappings, cleanPostForPublic } = require('../utils/blog-helper');
    const apiNames = [...new Set(rows.map(row => row.api_name))];
    const allFieldMappings = await getAllApiFieldMappings(apiNames);

    // 创建post_id到文章对象的映射
    const postsMap = new Map();
    rows.forEach(row => {
      // 解析 custom_fields JSON
      let customFields = {};
      try {
        if (row.custom_fields) {
          customFields = JSON.parse(row.custom_fields);
        }
      } catch (e) {
        logger.warn('解析custom_fields失败', { id: row.id, error: e.message });
      }
      
      // 获取字段映射配置
      const fieldMapping = allFieldMappings.get(row.api_name) || null;
      
      // 构建文章对象
      const post = {
        id: row.id,
        name: row.name,
        title: row.title || row.name,
        slug: row.slug,
        excerpt: row.excerpt,
        description: row.description || row.excerpt,
        htmlContent: row.html_content,
        image: row.image,
        category: row.category || row.api_name,
        apiName: row.api_name,
        published: row.published === 1,
        views: row.views || 0,
        likesCount: row.likes_count || 0,
        favoritesCount: row.favorites_count || 0,
        commentsCount: row.comments_count || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        customFields: customFields,
        _fieldMapping: fieldMapping
      };

      // 添加收藏时间
      const favoritedAt = favoritedAtMap.get(row.id);
      if (favoritedAt) {
        post.favoritedAt = favoritedAt;
      }

      postsMap.set(row.id, post);
    });

    // 按照收藏时间顺序排列文章（最新的在前）
    const allPosts = postIds
      .map(postId => postsMap.get(postId))
      .filter(post => post !== undefined); // 过滤掉可能不存在的文章

    // 分页
    const total = allPosts.length;
    const totalPages = Math.ceil(total / pageSize);
    const currentPage = parseInt(page, 10);
    const startIndex = (currentPage - 1) * parseInt(pageSize, 10);
    const endIndex = startIndex + parseInt(pageSize, 10);
    const paginatedPosts = allPosts.slice(startIndex, endIndex);
    
    // 清理内部字段（不对外暴露）
    const cleanedPosts = paginatedPosts.map(post => {
      const cleaned = cleanPostForPublic(post, false, true); // 第三个参数表示列表场景
      
      // 判断当前登录用户的手机号是否与文章的deviceId一致
      if (userPhone && post.deviceId && userPhone === post.deviceId) {
        cleaned.canEdit = true;
      }
      
      return cleaned;
    });
    
    res.json({
      success: true,
      data: cleanedPosts,
      pagination: {
        currentPage,
        pageSize: parseInt(pageSize, 10),
        total,
        totalPages
      }
    });
  } catch (error) {
    logger.error('获取收藏文章列表失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '获取收藏文章列表失败' 
    });
  }
});

/**
 * GET /api/blog/posts/:slug
 * 获取文章详情
 */
router.get('/posts/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { commentsPage = 1, commentsPageSize = 10, includeComments = 'true' } = req.query;
    
    const post = await getBlogPost(slug);
    
    if (!post) {
      return res.status(404).json({ 
        success: false, 
        message: '文章不存在' 
      });
    }
    
    // 增加阅读量（异步，不阻塞响应）
    incrementPostViews(slug).catch(err => {
      logger.error('增加阅读量失败', { slug, error: err.message });
    });
    
    // 获取当前登录用户的手机号
    const userPhone = await getCurrentUserPhone(req);
    
    // 清理内部字段（不对外暴露）
    // 详情场景返回完整的 HTML 内容
    const { cleanPostForPublic } = require('../utils/blog-helper');
    const cleanedPost = cleanPostForPublic(post, true);
    
    // 判断当前登录用户的手机号是否与文章的deviceId一致
    // 如果一致，添加canEdit字段
    if (userPhone && post.deviceId && userPhone === post.deviceId) {
      cleanedPost.canEdit = true;
    }
    
    // 获取评论列表（如果请求包含评论）
    let commentsData = null;
    if (includeComments === 'true' || includeComments === true) {
      try {
        commentsData = await getBlogComments(post.id, {
          // 不设置 flat，返回树形结构，但分页按平铺计算
          page: parseInt(commentsPage, 10),
          pageSize: parseInt(commentsPageSize, 10)
        });
      } catch (error) {
        logger.warn('获取评论列表失败', { postId: post.id, error: error.message });
        // 评论获取失败不影响文章详情返回
        commentsData = {
          comments: [],
          total: 0,
          totalPages: 0,
          currentPage: parseInt(commentsPage, 10)
        };
      }
    }
    
    const response = {
      success: true,
      data: cleanedPost
    };
    
    // 如果包含评论，添加到响应中
    if (commentsData) {
      response.comments = commentsData;
    }
    
    res.json(response);
  } catch (error) {
    logger.error('获取文章详情失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '获取文章详情失败' 
    });
  }
});

/**
 * GET /api/blog/categories
 * 获取分类列表
 */
router.get('/categories', async (req, res) => {
  try {
    const categories = await getBlogCategories();
    
    res.json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error('获取分类列表失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '获取分类列表失败' 
    });
  }
});

/**
 * GET /api/blog/posts/:postId/comments
 * 获取文章评论
 */
router.get('/posts/:postId/comments', async (req, res) => {
  try {
    const { postId } = req.params;
    const { page = 1, pageSize = 10 } = req.query;
    
    const commentsData = await getBlogComments(postId, {
      page: parseInt(page, 10),
      pageSize: parseInt(pageSize, 10)
    });
    
    res.json({
      success: true,
      ...commentsData
    });
  } catch (error) {
    logger.error('获取评论失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '获取评论失败' 
    });
  }
});

/**
 * POST /api/blog/posts/:postId/comments
 * 创建评论
 */
router.post('/posts/:postId/comments', async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, authorName, authorEmail, parentId } = req.body;
    
    // 验证必填字段：评论内容是必填的
    if (!content || content.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        message: '评论内容不能为空' 
      });
    }
    
    // 如果提供了邮箱，验证邮箱格式
    if (authorEmail && authorEmail.trim() !== '') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(authorEmail)) {
        return res.status(400).json({ 
          success: false, 
          message: '邮箱格式不正确' 
        });
      }
    }
    
    // 检查文章是否存在
    const posts = await getBlogPosts({ publishedOnly: false });
    const post = posts.find(p => p.id === postId);
    
    if (!post) {
      return res.status(404).json({ 
        success: false, 
        message: '文章不存在' 
      });
    }
    
    // 获取用户信息（如果已登录）
    const userPhone = await getCurrentUserPhone(req);
    let userId = null;
    let userName = null;
    
    if (req.session && req.session.userId) {
      userId = req.session.userId;
      userName = req.session.userName;
    } else {
      const token = req.headers['x-user-token'] || 
                    req.headers['X-User-Token'] || 
                    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                    req.query.token;
      if (token) {
        const tokenRecord = await getAsync(
          `SELECT ut.user_id, u.name, u.phone 
           FROM user_tokens ut 
           JOIN users u ON ut.user_id = u.id 
           WHERE ut.token = ? AND ut.expires_at > datetime('now', 'localtime')`,
          [token]
        );
        if (tokenRecord) {
          userId = tokenRecord.user_id;
          userName = tokenRecord.name;
          // 如果请求中没有提供userPhone，使用token中的phone
          if (!userPhone && tokenRecord.phone) {
            // userPhone会在getCurrentUserPhone中获取，这里不需要重复设置
          }
        }
      }
    }

    // 确定作者名称：优先使用提供的authorName，其次使用登录用户的name，最后使用"匿名用户"
    const finalAuthorName = authorName && authorName.trim() !== '' 
      ? authorName.trim() 
      : (userName && userName.trim() !== '' ? userName.trim() : '匿名用户');

    let comment;
    try {
      comment = await createBlogComment(postId, {
        content: content.trim(),
        authorName: finalAuthorName,
        authorEmail: authorEmail && authorEmail.trim() !== '' ? authorEmail.trim() : null,
        authorPhone: userPhone,
        userId: userId,
        parentId: parentId || null
      });
    } catch (error) {
      // 如果是层级限制错误，返回友好的错误信息
      if (error.message && error.message.includes('最多支持2级')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      throw error;
    }

    // 更新文章评论数（统计所有评论）
    await runAsync(
      `UPDATE blog_posts 
       SET comments_count = (
         SELECT COUNT(*) 
         FROM blog_comments 
         WHERE blog_comments.post_id = blog_posts.id
       )
       WHERE id = ?`,
      [postId]
    );
    
    res.json({
      success: true,
      message: '评论已提交',
      data: comment
    });
  } catch (error) {
    logger.error('创建评论失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '创建评论失败' 
    });
  }
});

/**
 * POST /api/blog/posts/:slug/views
 * 增加阅读量
 */
router.post('/posts/:slug/views', async (req, res) => {
  try {
    const { slug } = req.params;
    const success = await incrementPostViews(slug);
    
    if (success) {
      res.json({ success: true, message: '阅读量已更新' });
    } else {
      res.status(404).json({ 
        success: false, 
        message: '文章不存在' 
      });
    }
  } catch (error) {
    logger.error('增加阅读量失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '增加阅读量失败' 
    });
  }
});

/**
 * GET /api/blog/search
 * 搜索文章
 */
router.get('/search', async (req, res) => {
  try {
    const { q, page = 1, pageSize = 10 } = req.query;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({ 
        success: false, 
        message: '搜索关键词不能为空' 
      });
    }
    
    const posts = await getBlogPosts({
      publishedOnly: true,
      search: q.trim()
    });
    
    // 获取当前登录用户的手机号
    const userPhone = await getCurrentUserPhone(req);
    
    // 分页
    const total = posts.length;
    const totalPages = Math.ceil(total / pageSize);
    const currentPage = parseInt(page, 10);
    const startIndex = (currentPage - 1) * parseInt(pageSize, 10);
    const endIndex = startIndex + parseInt(pageSize, 10);
    const paginatedPosts = posts.slice(startIndex, endIndex);
    
    // 清理内部字段（不对外暴露）
    // 搜索场景也是列表场景，只保留 HTML 内容的前10个字节
    const { cleanPostForPublic } = require('../utils/blog-helper');
    const cleanedPosts = paginatedPosts.map(post => {
      const cleaned = cleanPostForPublic(post, false, true); // 第三个参数表示列表场景
      
      // 判断当前登录用户的手机号是否与文章的deviceId一致
      // 如果一致，添加canEdit字段
      if (userPhone && post.deviceId && userPhone === post.deviceId) {
        cleaned.canEdit = true;
      }
      
      return cleaned;
    });
    
    res.json({
      success: true,
      data: cleanedPosts,
      pagination: {
        currentPage,
        pageSize: parseInt(pageSize, 10),
        total,
        totalPages
      }
    });
  } catch (error) {
    logger.error('搜索文章失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '搜索文章失败' 
    });
  }
});

/**
 * POST /api/blog/posts/:postId/like
 * 点赞文章
 */
router.post('/posts/:postId/like', async (req, res) => {
  try {
    const { postId } = req.params;
    const userPhone = await getCurrentUserPhone(req);
    
    if (!userPhone) {
      return res.status(401).json({ 
        success: false, 
        message: '需要登录才能点赞' 
      });
    }

    // 检查文章是否存在
    const post = await getAsync('SELECT id FROM blog_posts WHERE id = ?', [postId]);
    if (!post) {
      return res.status(404).json({ 
        success: false, 
        message: '文章不存在' 
      });
    }

    // 检查是否已点赞
    const existingLike = await getAsync(
      'SELECT id FROM blog_likes WHERE post_id = ? AND user_phone = ?',
      [postId, userPhone]
    );

    if (existingLike) {
      return res.status(400).json({ 
        success: false, 
        message: '您已经点赞过这篇文章' 
      });
    }

    // 获取用户ID（如果存在）
    let userId = null;
    if (req.session && req.session.userId) {
      userId = req.session.userId;
    } else {
      const token = req.headers['x-user-token'] || 
                    req.headers['X-User-Token'] || 
                    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                    req.query.token;
      if (token) {
        const tokenRecord = await getAsync(
          `SELECT ut.user_id FROM user_tokens ut 
           JOIN users u ON ut.user_id = u.id 
           WHERE ut.token = ? AND ut.expires_at > datetime('now', 'localtime')`,
          [token]
        );
        if (tokenRecord) {
          userId = tokenRecord.user_id;
        }
      }
    }

    // 添加点赞记录（显式设置时间，使用Node.js进程时区）
    const now = getCurrentLocalTimeString();
    await runAsync(
      'INSERT INTO blog_likes (post_id, user_id, user_phone, created_at) VALUES (?, ?, ?, ?)',
      [postId, userId, userPhone, now]
    );

    // 更新文章点赞数
    await runAsync(
      'UPDATE blog_posts SET likes_count = likes_count + 1 WHERE id = ?',
      [postId]
    );

    // 获取更新后的点赞数
    const updatedPost = await getAsync(
      'SELECT likes_count FROM blog_posts WHERE id = ?',
      [postId]
    );

    res.json({
      success: true,
      message: '点赞成功',
      data: {
        likesCount: updatedPost.likes_count,
        isLiked: true
      }
    });
  } catch (error) {
    logger.error('点赞失败', { error: error.message, postId: req.params.postId });
    res.status(500).json({ 
      success: false, 
      message: '点赞失败' 
    });
  }
});

/**
 * DELETE /api/blog/posts/:postId/like
 * 取消点赞
 */
router.delete('/posts/:postId/like', async (req, res) => {
  try {
    const { postId } = req.params;
    const userPhone = await getCurrentUserPhone(req);
    
    if (!userPhone) {
      return res.status(401).json({ 
        success: false, 
        message: '需要登录才能取消点赞' 
      });
    }

    // 检查是否已点赞
    const existingLike = await getAsync(
      'SELECT id FROM blog_likes WHERE post_id = ? AND user_phone = ?',
      [postId, userPhone]
    );

    if (!existingLike) {
      return res.status(400).json({ 
        success: false, 
        message: '您还没有点赞过这篇文章' 
      });
    }

    // 删除点赞记录
    await runAsync(
      'DELETE FROM blog_likes WHERE post_id = ? AND user_phone = ?',
      [postId, userPhone]
    );

    // 更新文章点赞数
    await runAsync(
      'UPDATE blog_posts SET likes_count = CASE WHEN likes_count > 0 THEN likes_count - 1 ELSE 0 END WHERE id = ?',
      [postId]
    );

    // 获取更新后的点赞数
    const updatedPost = await getAsync(
      'SELECT likes_count FROM blog_posts WHERE id = ?',
      [postId]
    );

    res.json({
      success: true,
      message: '取消点赞成功',
      data: {
        likesCount: updatedPost.likes_count,
        isLiked: false
      }
    });
  } catch (error) {
    logger.error('取消点赞失败', { error: error.message, postId: req.params.postId });
    res.status(500).json({ 
      success: false, 
      message: '取消点赞失败' 
    });
  }
});

/**
 * POST /api/blog/posts/:postId/favorite
 * 收藏文章
 */
router.post('/posts/:postId/favorite', async (req, res) => {
  try {
    const { postId } = req.params;
    const userPhone = await getCurrentUserPhone(req);
    
    if (!userPhone) {
      return res.status(401).json({ 
        success: false, 
        message: '需要登录才能收藏' 
      });
    }

    // 检查文章是否存在
    const post = await getAsync('SELECT id FROM blog_posts WHERE id = ?', [postId]);
    if (!post) {
      return res.status(404).json({ 
        success: false, 
        message: '文章不存在' 
      });
    }

    // 检查是否已收藏
    const existingFavorite = await getAsync(
      'SELECT id FROM blog_favorites WHERE post_id = ? AND user_phone = ?',
      [postId, userPhone]
    );

    if (existingFavorite) {
      return res.status(400).json({ 
        success: false, 
        message: '您已经收藏过这篇文章' 
      });
    }

    // 获取用户ID（如果存在）
    let userId = null;
    if (req.session && req.session.userId) {
      userId = req.session.userId;
    } else {
      const token = req.headers['x-user-token'] || 
                    req.headers['X-User-Token'] || 
                    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                    req.query.token;
      if (token) {
        const tokenRecord = await getAsync(
          `SELECT ut.user_id FROM user_tokens ut 
           JOIN users u ON ut.user_id = u.id 
           WHERE ut.token = ? AND ut.expires_at > datetime('now', 'localtime')`,
          [token]
        );
        if (tokenRecord) {
          userId = tokenRecord.user_id;
        }
      }
    }

    // 添加收藏记录（显式设置时间，使用Node.js进程时区）
    const now = getCurrentLocalTimeString();
    await runAsync(
      'INSERT INTO blog_favorites (post_id, user_id, user_phone, created_at) VALUES (?, ?, ?, ?)',
      [postId, userId, userPhone, now]
    );

    // 更新文章收藏数
    await runAsync(
      'UPDATE blog_posts SET favorites_count = favorites_count + 1 WHERE id = ?',
      [postId]
    );

    // 获取更新后的收藏数
    const updatedPost = await getAsync(
      'SELECT favorites_count FROM blog_posts WHERE id = ?',
      [postId]
    );

    res.json({
      success: true,
      message: '收藏成功',
      data: {
        favoritesCount: updatedPost.favorites_count,
        isFavorited: true
      }
    });
  } catch (error) {
    logger.error('收藏失败', { error: error.message, postId: req.params.postId });
    res.status(500).json({ 
      success: false, 
      message: '收藏失败' 
    });
  }
});

/**
 * DELETE /api/blog/posts/:postId/favorite
 * 取消收藏
 */
router.delete('/posts/:postId/favorite', async (req, res) => {
  try {
    const { postId } = req.params;
    const userPhone = await getCurrentUserPhone(req);
    
    if (!userPhone) {
      return res.status(401).json({ 
        success: false, 
        message: '需要登录才能取消收藏' 
      });
    }

    // 检查是否已收藏
    const existingFavorite = await getAsync(
      'SELECT id FROM blog_favorites WHERE post_id = ? AND user_phone = ?',
      [postId, userPhone]
    );

    if (!existingFavorite) {
      return res.status(400).json({ 
        success: false, 
        message: '您还没有收藏过这篇文章' 
      });
    }

    // 删除收藏记录
    await runAsync(
      'DELETE FROM blog_favorites WHERE post_id = ? AND user_phone = ?',
      [postId, userPhone]
    );

    // 更新文章收藏数
    await runAsync(
      'UPDATE blog_posts SET favorites_count = CASE WHEN favorites_count > 0 THEN favorites_count - 1 ELSE 0 END WHERE id = ?',
      [postId]
    );

    // 获取更新后的收藏数
    const updatedPost = await getAsync(
      'SELECT favorites_count FROM blog_posts WHERE id = ?',
      [postId]
    );

    res.json({
      success: true,
      message: '取消收藏成功',
      data: {
        favoritesCount: updatedPost.favorites_count,
        isFavorited: false
      }
    });
  } catch (error) {
    logger.error('取消收藏失败', { error: error.message, postId: req.params.postId });
    res.status(500).json({ 
      success: false, 
      message: '取消收藏失败' 
    });
  }
});

/**
 * GET /api/blog/posts/:postId/interactions
 * 获取用户对文章的互动状态（点赞、收藏）
 */
router.get('/posts/:postId/interactions', async (req, res) => {
  try {
    const { postId } = req.params;
    const userPhone = await getCurrentUserPhone(req);
    
    if (!userPhone) {
      return res.json({
        success: true,
        data: {
          isLiked: false,
          isFavorited: false
        }
      });
    }

    // 检查是否已点赞
    const like = await getAsync(
      'SELECT id FROM blog_likes WHERE post_id = ? AND user_phone = ?',
      [postId, userPhone]
    );

    // 检查是否已收藏
    const favorite = await getAsync(
      'SELECT id FROM blog_favorites WHERE post_id = ? AND user_phone = ?',
      [postId, userPhone]
    );

    res.json({
      success: true,
      data: {
        isLiked: !!like,
        isFavorited: !!favorite
      }
    });
  } catch (error) {
    logger.error('获取互动状态失败', { error: error.message, postId: req.params.postId });
    res.status(500).json({ 
      success: false, 
      message: '获取互动状态失败' 
    });
  }
});

/**
 * DELETE /api/blog/posts/:postId/comments/:commentId
 * 删除评论
 */
router.delete('/posts/:postId/comments/:commentId', async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const userPhone = await getCurrentUserPhone(req);
    
    // 检查评论是否存在
    const comment = await getAsync(
      'SELECT * FROM blog_comments WHERE id = ? AND post_id = ?',
      [commentId, postId]
    );

    if (!comment) {
      return res.status(404).json({ 
        success: false, 
        message: '评论不存在' 
      });
    }

    // 检查权限：只有评论作者或管理员可以删除
    const isAdmin = req.session && req.session.adminId;
    
    // 获取用户ID（支持Session和Token认证）
    let userId = null;
    if (req.session && req.session.userId) {
      userId = req.session.userId;
    } else {
      const token = req.headers['x-user-token'] || 
                    req.headers['X-User-Token'] || 
                    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                    req.query.token;
      if (token) {
        const tokenRecord = await getAsync(
          `SELECT ut.user_id FROM user_tokens ut 
           JOIN users u ON ut.user_id = u.id 
           WHERE ut.token = ? AND ut.expires_at > datetime('now', 'localtime')`,
          [token]
        );
        if (tokenRecord) {
          userId = tokenRecord.user_id;
        }
      }
    }
    
    // 判断是否是评论作者：
    // 1. author_phone 匹配 userPhone
    // 2. user_id 匹配 userId（支持Session和Token）
    const isAuthor = (userPhone && comment.author_phone === userPhone) || 
                     (userId && comment.user_id && comment.user_id.toString() === userId.toString());

    if (!isAdmin && !isAuthor) {
      return res.status(403).json({ 
        success: false, 
        message: '您没有权限删除此评论' 
      });
    }

    // 删除评论（级联删除子评论）
    await runAsync(
      'DELETE FROM blog_comments WHERE id = ?',
      [commentId]
    );

    // 更新文章评论数（统计所有评论）
    await runAsync(
      `UPDATE blog_posts 
       SET comments_count = (
         SELECT COUNT(*) 
         FROM blog_comments 
         WHERE blog_comments.post_id = blog_posts.id
       )
       WHERE id = ?`,
      [postId]
    );

    res.json({
      success: true,
      message: '评论删除成功'
    });
  } catch (error) {
    logger.error('删除评论失败', { error: error.message, commentId: req.params.commentId });
    res.status(500).json({ 
      success: false, 
      message: '删除评论失败' 
    });
  }
});

/**
 * POST /api/blog/comments/:commentId/like
 * 点赞评论
 */
router.post('/comments/:commentId/like', async (req, res) => {
  try {
    const { commentId } = req.params;
    const userPhone = await getCurrentUserPhone(req);
    
    if (!userPhone) {
      return res.status(401).json({ 
        success: false, 
        message: '需要登录才能点赞' 
      });
    }

    // 检查评论是否存在
    const comment = await getAsync('SELECT id, post_id FROM blog_comments WHERE id = ?', [commentId]);
    if (!comment) {
      return res.status(404).json({ 
        success: false, 
        message: '评论不存在' 
      });
    }

    // 检查是否已点赞
    const existingLike = await getAsync(
      'SELECT id FROM blog_comment_likes WHERE comment_id = ? AND user_phone = ?',
      [commentId, userPhone]
    );

    if (existingLike) {
      return res.status(400).json({ 
        success: false, 
        message: '您已经点赞过这条评论' 
      });
    }

    // 获取用户ID（如果存在）
    let userId = null;
    if (req.session && req.session.userId) {
      userId = req.session.userId;
    } else {
      const token = req.headers['x-user-token'] || 
                    req.headers['X-User-Token'] || 
                    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                    req.query.token;
      if (token) {
        const tokenRecord = await getAsync(
          `SELECT ut.user_id FROM user_tokens ut 
           JOIN users u ON ut.user_id = u.id 
           WHERE ut.token = ? AND ut.expires_at > datetime('now', 'localtime')`,
          [token]
        );
        if (tokenRecord) {
          userId = tokenRecord.user_id;
        }
      }
    }

    // 添加点赞记录
    await runAsync(
      'INSERT INTO blog_comment_likes (comment_id, user_id, user_phone) VALUES (?, ?, ?)',
      [commentId, userId, userPhone]
    );

    // 更新评论点赞数和更新时间（点赞后排序到前面）
    // 使用Node.js进程时区，而不是UTC时间
    const now = getCurrentLocalTimeString();
    await runAsync(
      'UPDATE blog_comments SET likes_count = COALESCE(likes_count, 0) + 1, updated_at = ? WHERE id = ?',
      [now, commentId]
    );
    
    // 如果有父评论，也要更新父评论的 updated_at 时间
    const commentWithParent = await getAsync('SELECT parent_id FROM blog_comments WHERE id = ?', [commentId]);
    if (commentWithParent && commentWithParent.parent_id) {
      await runAsync(
        'UPDATE blog_comments SET updated_at = ? WHERE id = ?',
        [now, commentWithParent.parent_id]
      );
    }

    // 获取更新后的点赞数
    const updatedComment = await getAsync(
      'SELECT likes_count FROM blog_comments WHERE id = ?',
      [commentId]
    );

    res.json({
      success: true,
      message: '点赞成功',
      data: {
        likesCount: updatedComment.likes_count || 0,
        isLiked: true
      }
    });
  } catch (error) {
    logger.error('点赞评论失败', { error: error.message, commentId: req.params.commentId });
    res.status(500).json({ 
      success: false, 
      message: '点赞失败' 
    });
  }
});

/**
 * DELETE /api/blog/comments/:commentId/like
 * 取消点赞评论
 */
router.delete('/comments/:commentId/like', async (req, res) => {
  try {
    const { commentId } = req.params;
    const userPhone = await getCurrentUserPhone(req);
    
    if (!userPhone) {
      return res.status(401).json({ 
        success: false, 
        message: '需要登录才能取消点赞' 
      });
    }

    // 检查是否已点赞
    const existingLike = await getAsync(
      'SELECT id FROM blog_comment_likes WHERE comment_id = ? AND user_phone = ?',
      [commentId, userPhone]
    );

    if (!existingLike) {
      return res.status(400).json({ 
        success: false, 
        message: '您还没有点赞过这条评论' 
      });
    }

    // 删除点赞记录
    await runAsync(
      'DELETE FROM blog_comment_likes WHERE comment_id = ? AND user_phone = ?',
      [commentId, userPhone]
    );

    // 更新评论点赞数和更新时间（取消点赞后也更新排序）
    // 使用Node.js进程时区，而不是UTC时间
    const now = getCurrentLocalTimeString();
    await runAsync(
      'UPDATE blog_comments SET likes_count = CASE WHEN COALESCE(likes_count, 0) > 0 THEN likes_count - 1 ELSE 0 END, updated_at = ? WHERE id = ?',
      [now, commentId]
    );
    
    // 如果有父评论，也要更新父评论的 updated_at 时间
    const comment = await getAsync('SELECT parent_id FROM blog_comments WHERE id = ?', [commentId]);
    if (comment && comment.parent_id) {
      await runAsync(
        'UPDATE blog_comments SET updated_at = ? WHERE id = ?',
        [now, comment.parent_id]
      );
    }

    // 获取更新后的点赞数
    const updatedComment = await getAsync(
      'SELECT likes_count FROM blog_comments WHERE id = ?',
      [commentId]
    );

    res.json({
      success: true,
      message: '取消点赞成功',
      data: {
        likesCount: updatedComment.likes_count || 0,
        isLiked: false
      }
    });
  } catch (error) {
    logger.error('取消点赞评论失败', { error: error.message, commentId: req.params.commentId });
    res.status(500).json({ 
      success: false, 
      message: '取消点赞失败' 
    });
  }
});

/**
 * GET /api/blog/comments/:commentId/interactions
 * 获取用户对评论的互动状态（是否已点赞）
 */
router.get('/comments/:commentId/interactions', async (req, res) => {
  try {
    const { commentId } = req.params;
    const userPhone = await getCurrentUserPhone(req);
    
    if (!userPhone) {
      return res.json({
        success: true,
        data: {
          isLiked: false
        }
      });
    }

    // 检查是否已点赞
    const like = await getAsync(
      'SELECT id FROM blog_comment_likes WHERE comment_id = ? AND user_phone = ?',
      [commentId, userPhone]
    );

    res.json({
      success: true,
      data: {
        isLiked: !!like
      }
    });
  } catch (error) {
    logger.error('获取评论互动状态失败', { error: error.message, commentId: req.params.commentId });
    res.status(500).json({ 
      success: false, 
      message: '获取互动状态失败' 
    });
  }
});

/**
 * GET /api/blog/my-comments
 * 查询我发布的评论数量和内容
 */
router.get('/my-comments', async (req, res) => {
  try {
    const { page = 1, pageSize = 10 } = req.query;
    const userPhone = await getCurrentUserPhone(req);
    
    if (!userPhone) {
      return res.status(401).json({ 
        success: false, 
        message: '需要登录才能查看我的评论' 
      });
    }

    // 获取用户ID（如果存在）
    let userId = null;
    if (req.session && req.session.userId) {
      userId = req.session.userId;
    } else {
      const token = req.headers['x-user-token'] || 
                    req.headers['X-User-Token'] || 
                    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                    req.query.token;
      if (token) {
        const tokenRecord = await getAsync(
          `SELECT ut.user_id FROM user_tokens ut 
           JOIN users u ON ut.user_id = u.id 
           WHERE ut.token = ? AND ut.expires_at > datetime('now', 'localtime')`,
          [token]
        );
        if (tokenRecord) {
          userId = tokenRecord.user_id;
        }
      }
    }

    // 构建查询条件：根据 user_phone 或 user_id 查询
    let query = `
      SELECT 
        c.id,
        c.post_id,
        c.content,
        c.author_name,
        c.author_email,
        c.author_phone,
        c.user_id,
        c.parent_id,
        c.approved,
        c.likes_count,
        c.created_at,
        c.updated_at,
        p.name as post_name,
        p.slug as post_slug,
        p.title as post_title
      FROM blog_comments c
      LEFT JOIN blog_posts p ON c.post_id = p.id
      WHERE (c.author_phone = ? OR c.user_id = ?)
    `;
    const queryParams = [userPhone, userId || userPhone];

    // 按创建时间倒序排序
    query += ' ORDER BY c.created_at DESC';

    // 获取所有评论
    const allComments = await allAsync(query, queryParams);

    // 计算总数
    const total = allComments.length;

    // 分页
    const totalPages = Math.ceil(total / pageSize);
    const currentPage = parseInt(page, 10);
    const startIndex = (currentPage - 1) * parseInt(pageSize, 10);
    const endIndex = startIndex + parseInt(pageSize, 10);
    const paginatedComments = allComments.slice(startIndex, endIndex);

    // 格式化评论数据
    const formattedComments = paginatedComments.map(comment => ({
      id: comment.id,
      content: comment.content,
      authorName: comment.author_name,
      authorEmail: comment.author_email,
      authorPhone: comment.author_phone,
      userId: comment.user_id,
      postId: comment.post_id,
      parentId: comment.parent_id,
      approved: comment.approved === 1,
      likesCount: comment.likes_count || 0,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      post: {
        id: comment.post_id,
        name: comment.post_name,
        title: comment.post_title,
        slug: comment.post_slug
      }
    }));

    res.json({
      success: true,
      data: formattedComments,
      pagination: {
        currentPage,
        pageSize: parseInt(pageSize, 10),
        total,
        totalPages
      }
    });
  } catch (error) {
    logger.error('获取我的评论失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '获取我的评论失败' 
    });
  }
});

/**
 * GET /api/blog/my-posts-interactions
 * 查询别人对我发布文章的评论、点赞和收藏数量和详情
 */
router.get('/my-posts-interactions', async (req, res) => {
  try {
    const { page = 1, pageSize = 10, type } = req.query; // type: 'comments', 'likes', 'favorites', 或 'all'
    const userPhone = await getCurrentUserPhone(req);
    
    if (!userPhone) {
      return res.status(401).json({ 
        success: false, 
        message: '需要登录才能查看我的文章互动' 
      });
    }

    // 首先找到所有我发布的文章（deviceId匹配）
    // 注意：deviceId存储在custom_fields JSON中
    // 先查询所有文章，然后在内存中过滤deviceId
    const allPostsData = await allAsync(`
      SELECT id, name, title, slug, custom_fields
      FROM blog_posts
    `, []);

    // 在内存中过滤出deviceId匹配的文章
    const myPosts = [];
    for (const post of allPostsData) {
      let customFields = {};
      try {
        if (post.custom_fields) {
          customFields = JSON.parse(post.custom_fields);
        }
      } catch (e) {
        logger.warn('解析custom_fields失败', { id: post.id, error: e.message });
        continue;
      }
      
      if (customFields.deviceId === userPhone) {
        myPosts.push({
          id: post.id,
          name: post.name,
          title: post.title,
          slug: post.slug
        });
      }
    }

    if (!myPosts || myPosts.length === 0) {
      return res.json({
        success: true,
        data: {
          comments: [],
          likes: [],
          favorites: [],
          statistics: {
            totalComments: 0,
            totalLikes: 0,
            totalFavorites: 0,
            totalPosts: 0
          }
        },
        notifications: {
          hasUnreadMessage: false,
          unreadCount: 0,
          unreadCommentsCount: 0,
          unreadLikesCount: 0,
          unreadFavoritesCount: 0
        },
        pagination: {
          currentPage: parseInt(page, 10),
          pageSize: parseInt(pageSize, 10),
          total: 0,
          totalPages: 0
        }
      });
    }

    const myPostIds = myPosts.map(p => p.id);
    const postMap = new Map(myPosts.map(p => [p.id, p]));

    // 获取用户ID（用于查询最后查看时间）
    let userId = null;
    if (req.session && req.session.userId) {
      userId = req.session.userId;
    } else {
      const token = req.headers['x-user-token'] || 
                    req.headers['X-User-Token'] || 
                    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                    req.query.token;
      if (token) {
        const tokenRecord = await getAsync(
          `SELECT ut.user_id FROM user_tokens ut 
           JOIN users u ON ut.user_id = u.id 
           WHERE ut.token = ? AND ut.expires_at > datetime('now', 'localtime')`,
          [token]
        );
        if (tokenRecord) {
          userId = tokenRecord.user_id;
        }
      }
    }

    // 如果通过token获取不到userId，尝试通过phone查找（与mark-as-read接口保持一致）
    if (!userId && userPhone) {
      const user = await getAsync('SELECT id FROM users WHERE phone = ?', [userPhone]);
      if (user) {
        userId = user.id;
        logger.debug('通过phone查找userId', { userPhone, userId });
      }
    }

    // 获取用户最后查看互动的时间
    let lastViewedAt = null;
    if (userId) {
      const user = await getAsync(
        'SELECT last_interactions_viewed_at FROM users WHERE id = ?',
        [userId]
      );
      if (user && user.last_interactions_viewed_at) {
        lastViewedAt = user.last_interactions_viewed_at;
        logger.info('获取最后查看时间成功', { 
          userId, 
          userPhone, 
          lastViewedAt, 
          type: typeof lastViewedAt,
          length: lastViewedAt ? lastViewedAt.length : 0
        });
      } else {
        logger.info('用户未设置最后查看时间', { userId, userPhone });
      }
    } else {
      logger.warn('无法获取userId，无法查询最后查看时间', { userPhone });
    }

    // 统计信息
    let statistics = {
      totalComments: 0,
      totalLikes: 0,
      totalFavorites: 0,
      totalPosts: myPosts.length
    };

    // 查询评论
    let comments = [];
    if (!type || type === 'all' || type === 'comments') {
      const placeholders = myPostIds.map(() => '?').join(',');
      logger.info('查询评论', {
        myPostIds: myPostIds.slice(0, 5), // 只记录前5个，避免日志过长
        totalPostIds: myPostIds.length
      });
      const commentsData = await allAsync(`
        SELECT 
          c.id,
          c.post_id,
          c.content,
          c.author_name,
          c.author_email,
          c.author_phone,
          c.user_id,
          c.parent_id,
          c.approved,
          c.likes_count,
          c.created_at,
          c.updated_at
        FROM blog_comments c
        WHERE c.post_id IN (${placeholders})
        ORDER BY c.created_at DESC
      `, myPostIds);
      
      logger.info('查询评论结果', {
        commentsCount: commentsData.length,
        latestCommentTime: commentsData.length > 0 ? commentsData[0].created_at : null,
        latestCommentId: commentsData.length > 0 ? commentsData[0].id : null,
        latestCommentPostId: commentsData.length > 0 ? commentsData[0].post_id : null
      });

      comments = commentsData.map(comment => ({
        id: comment.id,
        content: comment.content,
        authorName: comment.author_name,
        authorEmail: comment.author_email,
        authorPhone: comment.author_phone,
        userId: comment.user_id,
        postId: comment.post_id,
        parentId: comment.parent_id,
        approved: comment.approved === 1,
        likesCount: comment.likes_count || 0,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
        post: postMap.get(comment.post_id) || {
          id: comment.post_id,
          name: '未知文章',
          title: '未知文章',
          slug: null
        }
      }));

      statistics.totalComments = comments.length;
    }

    // 查询点赞
    let likes = [];
    if (!type || type === 'all' || type === 'likes') {
      const placeholders = myPostIds.map(() => '?').join(',');
      const likesData = await allAsync(`
        SELECT 
          l.post_id,
          l.user_id,
          l.user_phone,
          l.created_at as liked_at,
          u.name as user_name
        FROM blog_likes l
        LEFT JOIN users u ON l.user_id = u.id
        WHERE l.post_id IN (${placeholders})
        ORDER BY l.created_at DESC
      `, myPostIds);

      likes = likesData.map(like => ({
        postId: like.post_id,
        userId: like.user_id,
        userPhone: like.user_phone,
        userName: like.user_name || like.user_phone || '匿名用户',
        likedAt: like.liked_at,
        post: postMap.get(like.post_id) || {
          id: like.post_id,
          name: '未知文章',
          title: '未知文章',
          slug: null
        }
      }));

      statistics.totalLikes = likes.length;
    }

    // 查询收藏
    let favorites = [];
    if (!type || type === 'all' || type === 'favorites') {
      const placeholders = myPostIds.map(() => '?').join(',');
      const favoritesData = await allAsync(`
        SELECT 
          f.post_id,
          f.user_id,
          f.user_phone,
          f.created_at as favorited_at,
          u.name as user_name
        FROM blog_favorites f
        LEFT JOIN users u ON f.user_id = u.id
        WHERE f.post_id IN (${placeholders})
        ORDER BY f.created_at DESC
      `, myPostIds);

      favorites = favoritesData.map(favorite => ({
        postId: favorite.post_id,
        userId: favorite.user_id,
        userPhone: favorite.user_phone,
        userName: favorite.user_name || favorite.user_phone || '匿名用户',
        favoritedAt: favorite.favorited_at,
        post: postMap.get(favorite.post_id) || {
          id: favorite.post_id,
          name: '未知文章',
          title: '未知文章',
          slug: null
        }
      }));

      statistics.totalFavorites = favorites.length;
    }

    // 计算未读消息数量
    let unreadCommentsCount = 0;
    let unreadLikesCount = 0;
    let unreadFavoritesCount = 0;
    let hasUnreadMessage = false;

    if (lastViewedAt) {
      // 如果有最后查看时间，计算未读数量
      // SQLite返回的时间格式是 'YYYY-MM-DD HH:MM:SS'
      // 直接使用字符串比较更可靠（格式一致时）
      logger.info('计算未读消息', { 
        userId, 
        userPhone,
        lastViewedAt,
        commentsCount: comments.length,
        likesCount: likes.length,
        favoritesCount: favorites.length,
        latestCommentTime: comments.length > 0 ? comments[0].createdAt : null,
        latestLikeTime: likes.length > 0 ? likes[0].likedAt : null,
        latestFavoriteTime: favorites.length > 0 ? favorites[0].favoritedAt : null
      });
      
      // 统计未读评论数量（排除自己评论的）
      // 使用字符串比较，因为SQLite的时间格式是标准化的 'YYYY-MM-DD HH:MM:SS'
      // 但为了更可靠，我们也尝试使用 Date 对象比较
      unreadCommentsCount = comments.filter(comment => {
        // 检查时间字段是否存在
        if (!comment.createdAt) {
          logger.warn('评论缺少createdAt字段', { commentId: comment.id });
          return false;
        }
        
        // 使用字符串比较，与点赞和收藏保持一致
        // SQLite返回的时间格式是标准化的 'YYYY-MM-DD HH:MM:SS'
        const isAfterLastView = comment.createdAt > lastViewedAt;
        
        // 排除自己评论的逻辑：
        // 1. 如果 authorPhone 和 userPhone 都存在且相等，则是自己的评论
        // 2. 如果 userId 和 comment.user_id 都存在且相等，则是自己的评论
        // 3. 如果 authorPhone 为 null 且 userId 不匹配，则不是自己的评论（匿名评论或别人的评论）
        const isOwnByPhone = comment.authorPhone && userPhone && comment.authorPhone === userPhone;
        const isOwnByUserId = userId && comment.user_id && userId.toString() === comment.user_id.toString();
        const isNotOwnComment = !isOwnByPhone && !isOwnByUserId;
        const isUnread = isAfterLastView && isNotOwnComment;
        
        // 记录所有评论的比较结果，方便调试（只记录前10条，避免日志过多）
        if (comments.indexOf(comment) < 10) {
          logger.info('评论未读检查', { 
            commentId: comment.id,
            createdAt: comment.createdAt,
            lastViewedAt: lastViewedAt,
            authorPhone: comment.authorPhone,
            userPhone: userPhone,
            isAfterLastView: isAfterLastView,
            isOwnByPhone: isOwnByPhone,
            isOwnByUserId: isOwnByUserId,
            isNotOwnComment: isNotOwnComment,
            isUnread: isUnread,
            timeComparison: `${comment.createdAt} > ${lastViewedAt} = ${isAfterLastView}`,
            authorPhoneMatch: comment.authorPhone === userPhone,
            userIdMatch: userId && comment.user_id ? userId.toString() === comment.user_id.toString() : false
          });
        }
        
        return isUnread;
      }).length;
      
      // 记录统计摘要
      logger.info('评论未读统计摘要', {
        totalComments: comments.length,
        unreadCommentsCount: unreadCommentsCount,
        lastViewedAt: lastViewedAt,
        latestCommentTime: comments.length > 0 ? comments[0].createdAt : null,
        oldestCommentTime: comments.length > 0 ? comments[comments.length - 1].createdAt : null,
        userPhone: userPhone,
        commentsWithAuthorPhone: comments.filter(c => c.authorPhone).length,
        commentsWithoutAuthorPhone: comments.filter(c => !c.authorPhone).length,
        sampleComments: comments.slice(0, 3).map(c => ({
          id: c.id,
          createdAt: c.createdAt,
          authorPhone: c.authorPhone,
          isAfterLastView: c.createdAt > lastViewedAt,
          isNotOwnComment: !c.authorPhone || c.authorPhone !== userPhone
        }))
      });

      // 统计未读点赞数量
      unreadLikesCount = likes.filter(like => {
        if (!like.likedAt) {
          logger.warn('点赞缺少likedAt字段', { postId: like.postId });
          return false;
        }
        const isUnread = like.likedAt > lastViewedAt;
        logger.debug('点赞未读检查', { 
          postId: like.postId, 
          likedAt: like.likedAt, 
          lastViewedAt,
          isUnread
        });
        return isUnread;
      }).length;

      // 统计未读收藏数量
      unreadFavoritesCount = favorites.filter(favorite => {
        if (!favorite.favoritedAt) {
          logger.warn('收藏缺少favoritedAt字段', { postId: favorite.postId });
          return false;
        }
        const isUnread = favorite.favoritedAt > lastViewedAt;
        logger.debug('收藏未读检查', { 
          postId: favorite.postId, 
          favoritedAt: favorite.favoritedAt, 
          lastViewedAt,
          isUnread
        });
        return isUnread;
      }).length;
      
      logger.info('未读消息统计结果', {
        lastViewedAt,
        unreadCommentsCount,
        unreadLikesCount,
        unreadFavoritesCount,
        totalUnread: unreadCommentsCount + unreadLikesCount + unreadFavoritesCount,
        userId,
        userPhone,
        commentsTotal: comments.length,
        likesTotal: likes.length,
        favoritesTotal: favorites.length
      });
    } else {
      // 如果从未查看过，所有消息都是未读
      // 排除自己评论的
      unreadCommentsCount = comments.filter(comment => comment.authorPhone !== userPhone).length;
      unreadLikesCount = likes.length;
      unreadFavoritesCount = favorites.length;
      logger.debug('用户从未查看过，所有消息都是未读', {
        unreadCommentsCount,
        unreadLikesCount,
        unreadFavoritesCount
      });
    }

    const totalUnreadCount = unreadCommentsCount + unreadLikesCount + unreadFavoritesCount;
    hasUnreadMessage = totalUnreadCount > 0;

    // 根据type参数决定返回哪些数据
    let resultData = {};
    let allItems = [];

    if (type === 'comments') {
      resultData.comments = comments;
      allItems = comments;
    } else if (type === 'likes') {
      resultData.likes = likes;
      allItems = likes;
    } else if (type === 'favorites') {
      resultData.favorites = favorites;
      allItems = favorites;
    } else {
      // type === 'all' 或未指定
      resultData.comments = comments;
      resultData.likes = likes;
      resultData.favorites = favorites;
      // 合并所有数据用于分页（按时间排序）
      allItems = [
        ...comments.map(c => ({ ...c, type: 'comment', sortTime: c.createdAt })),
        ...likes.map(l => ({ ...l, type: 'like', sortTime: l.likedAt })),
        ...favorites.map(f => ({ ...f, type: 'favorite', sortTime: f.favoritedAt }))
      ].sort((a, b) => new Date(b.sortTime) - new Date(a.sortTime));
    }

    // 分页（仅当type为'all'或未指定时）
    let paginatedItems = allItems;
    let pagination = null;
    
    if (!type || type === 'all') {
      const total = allItems.length;
      const totalPages = Math.ceil(total / pageSize);
      const currentPage = parseInt(page, 10);
      const startIndex = (currentPage - 1) * parseInt(pageSize, 10);
      const endIndex = startIndex + parseInt(pageSize, 10);
      paginatedItems = allItems.slice(startIndex, endIndex);
      
      pagination = {
        currentPage,
        pageSize: parseInt(pageSize, 10),
        total,
        totalPages
      };
    } else {
      // 对于特定类型，也进行分页
      const total = allItems.length;
      const totalPages = Math.ceil(total / pageSize);
      const currentPage = parseInt(page, 10);
      const startIndex = (currentPage - 1) * parseInt(pageSize, 10);
      const endIndex = startIndex + parseInt(pageSize, 10);
      paginatedItems = allItems.slice(startIndex, endIndex);
      
      pagination = {
        currentPage,
        pageSize: parseInt(pageSize, 10),
        total,
        totalPages
      };
    }

    // 如果type为'all'，返回分页后的合并数据
    if (!type || type === 'all') {
      resultData.items = paginatedItems;
    } else {
      // 对于特定类型，更新对应的数组
      if (type === 'comments') {
        resultData.comments = paginatedItems;
      } else if (type === 'likes') {
        resultData.likes = paginatedItems;
      } else if (type === 'favorites') {
        resultData.favorites = paginatedItems;
      }
    }

    res.json({
      success: true,
      data: {
        ...resultData,
        statistics
      },
      notifications: {
        hasUnreadMessage: hasUnreadMessage,
        unreadCount: totalUnreadCount,
        unreadCommentsCount: unreadCommentsCount,
        unreadLikesCount: unreadLikesCount,
        unreadFavoritesCount: unreadFavoritesCount
      },
      pagination: pagination || {
        currentPage: parseInt(page, 10),
        pageSize: parseInt(pageSize, 10),
        total: allItems.length,
        totalPages: Math.ceil(allItems.length / pageSize)
      }
    });
  } catch (error) {
    logger.error('获取我的文章互动失败', { 
      error: error.message, 
      stack: error.stack,
      userPhone: req.userPhone || 'unknown'
    });
    res.status(500).json({ 
      success: false, 
      message: '获取我的文章互动失败',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/blog/my-posts-interactions/mark-as-read
 * 标记我的文章互动为已读（更新最后查看时间）
 */
router.post('/my-posts-interactions/mark-as-read', async (req, res) => {
  try {
    const userPhone = await getCurrentUserPhone(req);
    
    if (!userPhone) {
      return res.status(401).json({ 
        success: false, 
        message: '需要登录才能标记为已读' 
      });
    }

    // 获取用户ID
    let userId = null;
    if (req.session && req.session.userId) {
      userId = req.session.userId;
    } else {
      const token = req.headers['x-user-token'] || 
                    req.headers['X-User-Token'] || 
                    req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                    req.query.token;
      if (token) {
        const tokenRecord = await getAsync(
          `SELECT ut.user_id FROM user_tokens ut 
           JOIN users u ON ut.user_id = u.id 
           WHERE ut.token = ? AND ut.expires_at > datetime('now', 'localtime')`,
          [token]
        );
        if (tokenRecord) {
          userId = tokenRecord.user_id;
        }
      }
    }

    if (!userId) {
      // 如果没有userId，尝试通过phone查找
      const user = await getAsync('SELECT id FROM users WHERE phone = ?', [userPhone]);
      if (user) {
        userId = user.id;
      } else {
        return res.status(404).json({ 
          success: false, 
          message: '用户不存在' 
        });
      }
    }

    // 更新最后查看时间为当前时间
    // 使用SQLite的datetime函数确保时间格式一致（'YYYY-MM-DD HH:MM:SS'）
    await runAsync(
      `UPDATE users 
       SET last_interactions_viewed_at = datetime('now', 'localtime') 
       WHERE id = ?`,
      [userId]
    );
    
    // 获取更新后的时间用于返回
    const updatedUser = await getAsync(
      'SELECT last_interactions_viewed_at FROM users WHERE id = ?',
      [userId]
    );
    const now = updatedUser ? updatedUser.last_interactions_viewed_at : null;

    logger.debug('标记消息为已读', { 
      userId, 
      userPhone, 
      lastViewedAt: now,
      type: typeof now,
      timestamp: Date.now()
    });

    res.json({
      success: true,
      message: '已标记为已读',
      data: {
        lastViewedAt: now
      }
    });
  } catch (error) {
    logger.error('标记消息为已读失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '标记消息为已读失败' 
    });
  }
});

module.exports = router;
