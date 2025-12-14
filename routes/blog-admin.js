const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const {
  getBlogPosts,
  getBlogPost,
  getBlogCategories,
  getBlogTags,
  getBlogComments,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  createBlogCategory,
  updateBlogCategory,
  deleteBlogCategory,
  createBlogTag,
  createBlogComment,
  approveBlogComment,
  deleteBlogComment
} = require('../utils/blog-helper');
const { logger, logAction } = require('../utils/logger');

const router = express.Router();

// 验证中间件
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      message: '验证失败', 
      errors: errors.array() 
    });
  }
  next();
};

// ==================== 文章管理 ====================

/**
 * GET /api/blog-admin/posts
 * 获取所有文章（包括草稿）
 */
router.get('/posts', requireAuth, async (req, res) => {
  try {
    const posts = await getBlogPosts({ publishedOnly: false });
    
    res.json({
      success: true,
      data: posts,
      total: posts.length
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
 * GET /api/blog-admin/apis
 * 获取所有可用的API列表（用于文章分类选择）
 * 排除博客系统专用的API路径
 */
router.get('/apis', requireAuth, async (req, res) => {
  try {
    const { allAsync } = require('../db/database');
    const apis = await allAsync(`
      SELECT id, name, path, description
      FROM custom_apis
      WHERE method = 'GET' 
        AND status = 'active'
        AND path NOT LIKE '/blog/%'
      ORDER BY name ASC
    `);
    
    res.json({
      success: true,
      data: apis
    });
  } catch (error) {
    logger.error('获取API列表失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '获取API列表失败' 
    });
  }
});

/**
 * GET /api/blog-admin/apis/:apiName/field-mapping
 * 获取API字段映射配置
 */
router.get('/apis/:apiName/field-mapping', requireAuth, async (req, res) => {
  try {
    const { apiName } = req.params;
    const { getApiFieldMapping } = require('../utils/blog-helper');
    const mapping = await getApiFieldMapping(apiName);
    
    res.json({
      success: true,
      data: mapping
    });
  } catch (error) {
    logger.error('获取字段映射配置失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '获取字段映射配置失败' 
    });
  }
});

/**
 * PUT /api/blog-admin/apis/:apiName/field-mapping
 * 更新API字段映射配置
 */
router.put('/apis/:apiName/field-mapping', requireAuth, [
  body('mapping').isObject().withMessage('字段映射必须是对象'),
  validate
], async (req, res) => {
  try {
    const { apiName } = req.params;
    const { mapping } = req.body;
    const { runAsync, getAsync } = require('../db/database');
    
    // 保存到settings表
    const key = `blog_api_field_mapping_${apiName}`;
    const existing = await getAsync('SELECT id FROM settings WHERE key = ?', [key]);
    
    if (existing) {
      await runAsync(
        `UPDATE settings SET value = ?, updated_at = datetime('now', 'localtime') WHERE key = ?`,
        [JSON.stringify(mapping), key]
      );
    } else {
      await runAsync(
        `INSERT INTO settings (key, value, description) VALUES (?, ?, ?)`,
        [key, JSON.stringify(mapping), `博客API字段映射配置: ${apiName}`]
      );
    }
    
    await logAction(
      req.session.adminId,
      'UPDATE',
      'blog_api_field_mapping',
      apiName,
      JSON.stringify(mapping),
      req
    );
    
    res.json({
      success: true,
      message: '字段映射配置保存成功'
    });
  } catch (error) {
    logger.error('保存字段映射配置失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '保存字段映射配置失败: ' + error.message 
    });
  }
});

/**
 * POST /api/blog-admin/posts
 * 创建文章
 */
router.post('/posts', requireAuth, [
  body('name').notEmpty().withMessage('文章名称不能为空'),
  body('apiName').notEmpty().withMessage('API名称（分类）不能为空'),
  body('htmlContent').optional().isString().withMessage('htmlContent必须是字符串'),
  body('slug').optional().isString(),
  body('excerpt').optional().isString(),
  body('description').optional().isString(),
  body('image').optional().isString(),
  body('tags').optional(),
  body('published').optional().isBoolean(),
  validate
], async (req, res) => {
  try {
    // name和title保持一致
    const nameValue = req.body.name || req.body.title || '未命名';
    // excerpt和description保持一致
    const excerptValue = req.body.excerpt || req.body.description || '';
    const postData = {
      id: req.body.id,
      name: nameValue,
      title: nameValue, // name和title保持一致
      slug: req.body.slug,
      excerpt: excerptValue,
      description: excerptValue, // description和excerpt保持一致
      image: req.body.image || null,
      apiName: req.body.apiName, // API名称（用于确定数据存储位置）
      category: req.body.category || req.body.apiName, // 分类/标签（用于博客展示，默认使用apiName）
      // tags字段已废弃，使用category作为标签
      published: req.body.published !== undefined ? req.body.published : false
    };
    
    // 特殊字段（二手市场和租房酒店）
    if (req.body.price !== undefined) postData.price = req.body.price;
    if (req.body.rooms !== undefined) postData.rooms = req.body.rooms;
    if (req.body.area !== undefined) postData.area = req.body.area;
    if (req.body.views !== undefined) postData.views = parseInt(req.body.views) || 0;
    
    // 处理特殊类别的数据
    if (req.body._specialData !== undefined) {
      postData._specialData = req.body._specialData;
      // 特殊类别不使用htmlContent
    } else {
      // 普通类别才使用htmlContent
      postData.htmlContent = req.body.htmlContent || '';
    }
    
    if (req.body._specialType !== undefined) postData._specialType = req.body._specialType;
    
    const post = await createBlogPost(postData);
    
    await logAction(
      req.session.adminId,
      'CREATE',
      'blog_post',
      post.id,
      JSON.stringify({ name: post.name, apiName: postData.apiName }),
      req
    );
    
    res.json({
      success: true,
      message: '文章创建成功',
      data: post
    });
  } catch (error) {
    logger.error('创建文章失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '创建文章失败: ' + error.message 
    });
  }
});

/**
 * PUT /api/blog-admin/posts/:id
 * 更新文章
 */
router.put('/posts/:id', requireAuth, [
  body('name').optional().notEmpty().withMessage('文章名称不能为空'),
  body('content').optional().isString(),
  body('slug').optional().isString(),
  body('excerpt').optional().isString(),
  body('description').optional().isString(),
  body('image').optional().isString(),
  body('apiName').optional().isString(),
  body('tags').optional(),
  body('published').optional().isBoolean(),
  validate
], async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {};
    
    // name和title保持一致
    if (req.body.name !== undefined) {
      updateData.name = req.body.name;
      updateData.title = req.body.name; // title与name保持一致
    } else if (req.body.title !== undefined) {
      updateData.name = req.body.title;
      updateData.title = req.body.title; // name与title保持一致
    }
    if (req.body.slug !== undefined) updateData.slug = req.body.slug;
    // excerpt和description保持一致
    if (req.body.excerpt !== undefined) {
      updateData.excerpt = req.body.excerpt;
      updateData.description = req.body.excerpt; // description和excerpt保持一致
    } else if (req.body.description !== undefined) {
      updateData.excerpt = req.body.description;
      updateData.description = req.body.description; // description和excerpt保持一致
    }
    if (req.body.image !== undefined) updateData.image = req.body.image;
    if (req.body.apiName !== undefined) updateData.apiName = req.body.apiName; // 支持更改分类（API）
    if (req.body.category !== undefined) updateData.category = req.body.category; // 分类/标签字段
    
    // 特殊字段（二手市场和租房酒店）
    if (req.body.price !== undefined) updateData.price = req.body.price;
    if (req.body.rooms !== undefined) updateData.rooms = req.body.rooms;
    if (req.body.area !== undefined) updateData.area = req.body.area;
    if (req.body.views !== undefined) updateData.views = parseInt(req.body.views) || 0;
    
    // 处理特殊类别的数据
    // 注意：second-hand 和 rentals 虽然需要特殊字段，但仍然需要 htmlContent
    const needsSpecialDataOnly = req.body._specialType && 
      (req.body._specialType === 'weather' || req.body._specialType === 'exchange-rate' || req.body._specialType === 'translation');
    
    if (req.body._specialData !== undefined) {
      updateData._specialData = req.body._specialData;
      // 只有 weather、exchange-rate、translation 不使用 htmlContent
      // second-hand 和 rentals 仍然需要 htmlContent
      if (!needsSpecialDataOnly && req.body.htmlContent !== undefined) {
        updateData.htmlContent = req.body.htmlContent;
      }
    } else {
      // 普通类别才使用htmlContent
      if (req.body.htmlContent !== undefined) updateData.htmlContent = req.body.htmlContent;
    }
    
    if (req.body._specialType !== undefined) updateData._specialType = req.body._specialType;
    // tags字段已废弃，使用category作为标签
    if (req.body.published !== undefined) updateData.published = req.body.published;
    
    // 处理特殊类别的数据
    if (req.body._specialData !== undefined) updateData._specialData = req.body._specialData;
    if (req.body._specialType !== undefined) updateData._specialType = req.body._specialType;
    
    // 添加调试日志
    logger.info('更新文章请求', {
      postId: id,
      hasSpecialData: !!updateData._specialData,
      specialType: updateData._specialType,
      apiName: updateData.apiName,
      specialDataKeys: updateData._specialData ? Object.keys(updateData._specialData) : []
    });
    
    const post = await updateBlogPost(id, updateData);
    
    if (!post) {
      return res.status(404).json({ 
        success: false, 
        message: '文章不存在' 
      });
    }
    
    await logAction(
      req.session.adminId,
      'UPDATE',
      'blog_post',
      id,
      JSON.stringify(updateData),
      req
    );
    
    res.json({
      success: true,
      message: '文章更新成功',
      data: post
    });
  } catch (error) {
    logger.error('更新文章失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '更新文章失败: ' + error.message 
    });
  }
});

/**
 * DELETE /api/blog-admin/posts/:id
 * 删除文章
 */
router.delete('/posts/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const success = await deleteBlogPost(id);
    
    if (!success) {
      return res.status(404).json({ 
        success: false, 
        message: '文章不存在' 
      });
    }
    
    await logAction(
      req.session.adminId,
      'DELETE',
      'blog_post',
      id,
      null,
      req
    );
    
    res.json({
      success: true,
      message: '文章删除成功'
    });
  } catch (error) {
    logger.error('删除文章失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '删除文章失败: ' + error.message 
    });
  }
});

// ==================== 分类管理 ====================

/**
 * GET /api/blog-admin/categories
 * 获取所有分类
 */
router.get('/categories', requireAuth, async (req, res) => {
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
 * POST /api/blog-admin/categories
 * 创建分类
 */
router.post('/categories', requireAuth, [
  body('name').notEmpty().withMessage('分类名称不能为空'),
  body('path').optional().isString(),
  body('description').optional().isString(),
  validate
], async (req, res) => {
  try {
    const categoryData = {
      name: req.body.name,
      path: req.body.path || req.body.description, // path作为描述
      description: req.body.description || req.body.path
    };
    
    const category = await createBlogCategory(categoryData);
    
    await logAction(
      req.session.adminId,
      'CREATE',
      'blog_category',
      category.id.toString(),
      JSON.stringify({ name: category.name, path: category.description }),
      req
    );
    
    res.json({
      success: true,
      message: '分类创建成功',
      data: category
    });
  } catch (error) {
    logger.error('创建分类失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '创建分类失败: ' + error.message 
    });
  }
});

/**
 * PUT /api/blog-admin/categories/:id
 * 更新分类
 */
router.put('/categories/:id', requireAuth, [
  body('name').optional().notEmpty().withMessage('分类名称不能为空'),
  body('path').optional().isString(),
  body('description').optional().isString(),
  validate
], async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {};
    
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.path !== undefined) {
      updateData.path = req.body.path;
      updateData.description = req.body.path; // path同时作为description
    } else if (req.body.description !== undefined) {
      updateData.path = req.body.description;
      updateData.description = req.body.description;
    }
    
    const category = await updateBlogCategory(parseInt(id, 10), updateData);
    
    if (!category) {
      return res.status(404).json({ 
        success: false, 
        message: '分类不存在' 
      });
    }
    
    await logAction(
      req.session.adminId,
      'UPDATE',
      'blog_category',
      id,
      JSON.stringify(updateData),
      req
    );
    
    res.json({
      success: true,
      message: '分类更新成功',
      data: category
    });
  } catch (error) {
    logger.error('更新分类失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '更新分类失败: ' + error.message 
    });
  }
});

/**
 * DELETE /api/blog-admin/categories/:id
 * 删除分类
 */
router.delete('/categories/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const success = await deleteBlogCategory(parseInt(id, 10));
    
    if (!success) {
      return res.status(404).json({ 
        success: false, 
        message: '分类不存在' 
      });
    }
    
    await logAction(
      req.session.adminId,
      'DELETE',
      'blog_category',
      id,
      null,
      req
    );
    
    res.json({
      success: true,
      message: '分类删除成功'
    });
  } catch (error) {
    logger.error('删除分类失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '删除分类失败: ' + error.message 
    });
  }
});

// ==================== 标签管理 ====================

/**
 * GET /api/blog-admin/tags
 * 获取所有标签
 */
router.get('/tags', requireAuth, async (req, res) => {
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
 * POST /api/blog-admin/tags
 * 创建标签
 */
router.post('/tags', requireAuth, [
  body('name').notEmpty().withMessage('标签名称不能为空'),
  body('slug').optional().isString(),
  validate
], async (req, res) => {
  try {
    const tagData = {
      name: req.body.name,
      slug: req.body.slug
    };
    
    const tag = await createBlogTag(tagData);
    
    await logAction(
      req.session.adminId,
      'CREATE',
      'blog_tag',
      tag.id,
      JSON.stringify({ name: tag.name }),
      req
    );
    
    res.json({
      success: true,
      message: '标签创建成功',
      data: tag
    });
  } catch (error) {
    logger.error('创建标签失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '创建标签失败: ' + error.message 
    });
  }
});

// ==================== 评论管理 ====================

/**
 * GET /api/blog-admin/comments
 * 获取所有评论
 */
router.get('/comments', requireAuth, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, approved } = req.query;
    
    // 获取所有文章的评论
    const posts = await getBlogPosts({ publishedOnly: false });
    let allComments = [];
    
    for (const post of posts) {
      const commentsData = await getBlogComments(post.id, { 
        approvedOnly: false,
        page: 1,
        pageSize: 1000 // 获取所有评论
      });
      allComments = allComments.concat(
        commentsData.comments.map(comment => ({
          ...comment,
          postName: post.name || post.title,
          postSlug: post.slug
        }))
      );
    }
    
    // 筛选审核状态
    if (approved !== undefined) {
      const approvedBool = approved === 'true';
      allComments = allComments.filter(c => c.approved === approvedBool);
    }
    
    // 分页
    const total = allComments.length;
    const totalPages = Math.ceil(total / pageSize);
    const currentPage = parseInt(page, 10);
    const startIndex = (currentPage - 1) * parseInt(pageSize, 10);
    const endIndex = startIndex + parseInt(pageSize, 10);
    const paginatedComments = allComments.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: paginatedComments,
      pagination: {
        currentPage,
        pageSize: parseInt(pageSize, 10),
        total,
        totalPages
      }
    });
  } catch (error) {
    logger.error('获取评论列表失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '获取评论列表失败' 
    });
  }
});

/**
 * PUT /api/blog-admin/comments/:id/approve
 * 审核评论
 */
router.put('/comments/:id/approve', requireAuth, [
  body('approved').isBoolean().withMessage('approved必须是布尔值'),
  validate
], async (req, res) => {
  try {
    const { id } = req.params;
    const { approved } = req.body;
    
    const success = await approveBlogComment(id, approved);
    
    if (!success) {
      return res.status(404).json({ 
        success: false, 
        message: '评论不存在' 
      });
    }
    
    await logAction(
      req.session.adminId,
      approved ? 'APPROVE' : 'REJECT',
      'blog_comment',
      id,
      null,
      req
    );
    
    res.json({
      success: true,
      message: approved ? '评论已审核通过' : '评论已拒绝'
    });
  } catch (error) {
    logger.error('审核评论失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '审核评论失败: ' + error.message 
    });
  }
});

/**
 * DELETE /api/blog-admin/comments/:id
 * 删除评论
 */
router.delete('/comments/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const success = await deleteBlogComment(id);
    
    if (!success) {
      return res.status(404).json({ 
        success: false, 
        message: '评论不存在' 
      });
    }
    
    await logAction(
      req.session.adminId,
      'DELETE',
      'blog_comment',
      id,
      null,
      req
    );
    
    res.json({
      success: true,
      message: '评论删除成功'
    });
  } catch (error) {
    logger.error('删除评论失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '删除评论失败: ' + error.message 
    });
  }
});

module.exports = router;
