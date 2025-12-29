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
const { getAsync } = require('../db/database');

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
 * GET /api/blog/posts/:slug
 * 获取文章详情
 */
router.get('/posts/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
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
    
    res.json({
      success: true,
      data: cleanedPost
    });
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
      approvedOnly: true,
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
    
    // 验证必填字段
    if (!content || !authorName || !authorEmail) {
      return res.status(400).json({ 
        success: false, 
        message: '评论内容、作者名称和邮箱为必填项' 
      });
    }
    
    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(authorEmail)) {
      return res.status(400).json({ 
        success: false, 
        message: '邮箱格式不正确' 
      });
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
    
    const comment = await createBlogComment(postId, {
      content,
      authorName,
      authorEmail,
      parentId: parentId || null
    });
    
    res.json({
      success: true,
      message: '评论已提交，等待审核',
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

module.exports = router;
