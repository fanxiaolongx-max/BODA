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
    } else if (userPhone && published === 'true') {
      // 用户已登录：获取所有已发布的文章 + 该用户的草稿文章
      const publishedOptions = {
        publishedOnly: true,
        category: category || undefined,
        search: search || undefined
      };
      const publishedPosts = await getBlogPosts(publishedOptions);
      
      // 获取该用户的草稿文章（未发布的）
      const draftOptions = {
        publishedOnly: false, // 获取所有文章（包括未发布的）
        category: category || undefined,
        search: search || undefined
      };
      const allPosts = await getBlogPosts(draftOptions);
      
      // 筛选出该用户的草稿文章（deviceId匹配且未发布）
      const userDrafts = allPosts.filter(post => 
        post.deviceId === userPhone && (!post.published || post.published === false)
      );
      
      // 合并已发布的文章和用户的草稿文章
      const publishedPostIds = new Set(publishedPosts.map(p => p.id));
      posts = [...publishedPosts];
      
      // 添加用户的草稿文章（避免重复）
      userDrafts.forEach(draft => {
        if (!publishedPostIds.has(draft.id)) {
          posts.push(draft);
        }
      });
    } else {
      // 用户未登录或明确要求只显示已发布的：只返回已发布的文章
      const options = {
        publishedOnly: published === 'true',
        category: category || undefined,
        search: search || undefined
      };
      posts = await getBlogPosts(options);
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

    // 添加点赞记录
    await runAsync(
      'INSERT INTO blog_likes (post_id, user_id, user_phone) VALUES (?, ?, ?)',
      [postId, userId, userPhone]
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

    // 添加收藏记录
    await runAsync(
      'INSERT INTO blog_favorites (post_id, user_id, user_phone) VALUES (?, ?, ?)',
      [postId, userId, userPhone]
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
    const isAuthor = userPhone && (comment.author_phone === userPhone || comment.user_id === req.session?.userId);

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
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
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
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
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

module.exports = router;
