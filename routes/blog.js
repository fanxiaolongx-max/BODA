const express = require('express');
const { 
  getBlogPosts, 
  getBlogPost, 
  getBlogCategories, 
  getBlogTags, 
  getBlogComments,
  incrementPostViews,
  createBlogComment
} = require('../utils/blog-helper');
const { logger } = require('../utils/logger');

const router = express.Router();

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
      tag, 
      search,
      published = 'true' 
    } = req.query;
    
    const options = {
      publishedOnly: published === 'true',
      category: category || undefined,
      tag: tag || undefined,
      search: search || undefined
    };
    
    let posts = await getBlogPosts(options);
    
    // 分页
    const total = posts.length;
    const totalPages = Math.ceil(total / pageSize);
    const currentPage = parseInt(page, 10);
    const startIndex = (currentPage - 1) * parseInt(pageSize, 10);
    const endIndex = startIndex + parseInt(pageSize, 10);
    const paginatedPosts = posts.slice(startIndex, endIndex);
    
    // 清理内部字段（不对外暴露）
    const { cleanPostForPublic } = require('../utils/blog-helper');
    const cleanedPosts = paginatedPosts.map(post => cleanPostForPublic(post));
    
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
    
    // 清理内部字段（不对外暴露）
    const { cleanPostForPublic } = require('../utils/blog-helper');
    const cleanedPost = cleanPostForPublic(post);
    
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
 * GET /api/blog/tags
 * 获取标签列表
 */
router.get('/tags', async (req, res) => {
  try {
    const tags = await getBlogTags();
    
    res.json({
      success: true,
      data: tags
    });
  } catch (error) {
    logger.error('获取标签列表失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '获取标签列表失败' 
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
    
    // 分页
    const total = posts.length;
    const totalPages = Math.ceil(total / pageSize);
    const currentPage = parseInt(page, 10);
    const startIndex = (currentPage - 1) * parseInt(pageSize, 10);
    const endIndex = startIndex + parseInt(pageSize, 10);
    const paginatedPosts = posts.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: paginatedPosts,
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
