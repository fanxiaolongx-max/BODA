const express = require('express');
const { body, query, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireBlogAuth } = require('../middleware/blog-auth');
const {
  getBlogPosts,
  getBlogPost,
  getBlogCategories,
  getBlogComments,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  createBlogCategory,
  updateBlogCategory,
  deleteBlogCategory,
  createBlogComment,
  approveBlogComment,
  deleteBlogComment,
  incrementPostViews
} = require('../utils/blog-helper');
const { logger, logAction } = require('../utils/logger');

const router = express.Router();

// 获取上传目录路径
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// 确保上传目录存在
const ensureUploadDirs = () => {
  const dirs = [
    path.join(UPLOADS_DIR, 'images'),
    path.join(UPLOADS_DIR, 'videos')
  ];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};
ensureUploadDirs();

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const type = req.body.type || 'image';
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const typeDir = type === 'video' ? 'videos' : 'images';
    const dir = path.join(UPLOADS_DIR, typeDir, String(year), month);
    
    // 创建目录
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    const filename = `${uniqueSuffix}${ext}`;
    cb(null, filename);
  }
});

// 文件类型验证（通过MIME类型自动判断，也支持通过req.body.type指定）
const fileFilter = (req, file, cb) => {
  const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  const allowedVideoTypes = ['video/mp4', 'video/quicktime'];
  const allowedImageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const allowedVideoExts = ['.mp4', '.mov'];
  
  // 先通过MIME类型判断文件类型
  const isImage = allowedImageTypes.includes(file.mimetype);
  const isVideo = allowedVideoTypes.includes(file.mimetype);
  
  // 如果MIME类型无法判断，尝试通过扩展名判断
  const ext = path.extname(file.originalname).toLowerCase();
  const isImageByExt = allowedImageExts.includes(ext);
  const isVideoByExt = allowedVideoExts.includes(ext);
  
  // 如果指定了type参数，优先使用指定的类型
  const specifiedType = req.body && req.body.type;
  let fileType = null;
  
  if (specifiedType === 'image' || specifiedType === 'video') {
    fileType = specifiedType;
  } else if (isImage || isImageByExt) {
    fileType = 'image';
  } else if (isVideo || isVideoByExt) {
    fileType = 'video';
  }
  
  if (!fileType) {
    return cb(new Error('不支持的文件类型，仅支持 jpg, jpeg, png, gif, webp, mp4, mov'));
  }
  
  // 验证文件扩展名
  const allowedExts = fileType === 'video' ? allowedVideoExts : allowedImageExts;
  if (!allowedExts.includes(ext)) {
    return cb(new Error(`不支持的文件扩展名，${fileType === 'video' ? '视频' : '图片'}仅支持 ${allowedExts.join(', ')}`));
  }
  
  // 验证MIME类型
  const allowedMimeTypes = fileType === 'video' ? allowedVideoTypes : allowedImageTypes;
  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(new Error(`不支持的文件MIME类型，${fileType === 'video' ? '视频' : '图片'}仅支持 ${allowedMimeTypes.map(m => m.split('/')[1]).join(', ')}`));
  }
  
  // 保存文件类型到req，供后续使用
  req.fileType = fileType;
  
  cb(null, true);
};

// 配置 multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB（最大限制，实际会根据文件类型进一步限制）
  },
  fileFilter: fileFilter
});

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
 * 获取文章列表
 * 支持分页：?page=1&pageSize=20
 * 支持筛选：?published=true&category=xxx&search=xxx
 * 
 * 注意：小程序使用时，默认行为与博客首页保持一致：
 * - 默认只返回已发布的文章（published=true）
 * - 主页场景（无分类筛选）会过滤空内容的文章
 * - 分类场景会包含所有文章（包括空内容的）
 */
router.get('/posts', requireBlogAuth, async (req, res) => {
  try {
    const { 
      page = 1, 
      pageSize,
      published,  // 管理后台：默认返回所有文章（包括未发布的），可以通过参数筛选
      category,
      search
    } = req.query;
    
    // 构建查询选项
    // 管理后台默认显示所有文章（包括未发布的），这样才能管理草稿
    // 如果明确指定了published参数为'true'，则只返回已发布的；否则返回所有文章
    const options = {
      publishedOnly: published === 'true' ? true : false, // 管理后台默认false（显示所有文章）
      category: category || undefined,
      search: search || undefined,
      includeEmptyContent: true // 管理后台始终包含空内容的文章，这样才能管理所有文章
    };
    
    // 获取文章列表（与博客首页使用相同的逻辑）
    let posts = await getBlogPosts(options);
    
    // 过滤掉特殊分类：汇率转换、天气、翻译（这些分类不需要在管理后台显示）
    const excludedCategories = ['汇率转换', '翻译卡片', '翻译', '天气', '天气路况', 'exchange-rate', 'translation', 'weather'];
    posts = posts.filter(post => {
      const apiName = post._sourceApiName || post.category || '';
      const apiNameLower = apiName.toLowerCase();
      
      // 检查是否匹配排除的分类（支持中文和英文名称）
      const isExcluded = excludedCategories.some(excluded => {
        if (apiName === excluded) return true;
        if (apiNameLower.includes(excluded.toLowerCase())) return true;
        // 检查是否包含关键词
        if (excluded === '汇率转换' && (apiName.includes('汇率') || apiName.includes('exchange'))) return true;
        if (excluded === '翻译' && (apiName.includes('翻译') || apiName.includes('translation'))) return true;
        if (excluded === '天气' && (apiName.includes('天气') || apiName.includes('weather'))) return true;
        return false;
      });
      
      return !isExcluded;
    });
    
    // 管理后台默认返回所有文章（不分页），除非明确指定了pageSize
    // 这样可以确保所有分类都能显示
    let cleanedPosts = posts;
    let pagination = null;
    
    if (pageSize) {
      // 如果指定了pageSize，才进行分页
      const total = posts.length;
      const pageSizeNum = parseInt(pageSize, 10);
      const totalPages = Math.ceil(total / pageSizeNum);
      const currentPage = parseInt(page, 10);
      const startIndex = (currentPage - 1) * pageSizeNum;
      const endIndex = startIndex + pageSizeNum;
      const paginatedPosts = posts.slice(startIndex, endIndex);
      
      pagination = {
        currentPage,
        pageSize: pageSizeNum,
        total,
        totalPages
      };
      
      cleanedPosts = paginatedPosts;
    }
    
    // 清理内部字段，列表场景下htmlContent只保留前10个字节（与博客首页保持一致）
    const { cleanPostForPublic } = require('../utils/blog-helper');
    cleanedPosts = cleanedPosts.map(post => cleanPostForPublic(post, false, true)); // 第三个参数表示列表场景
    
    const response = {
      success: true,
      data: cleanedPosts
    };
    
    if (pagination) {
      response.pagination = pagination;
    }
    
    res.json(response);
  } catch (error) {
    logger.error('获取文章列表失败', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: '获取文章列表失败' 
    });
  }
});

/**
 * GET /api/blog-admin/posts/:id
 * 获取单篇文章详情
 * 注意：此API不需要鉴权，因为小程序需要使用它来获取文章详情
 */
router.get('/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { commentsPage = 1, commentsPageSize = 10, includeComments = 'true' } = req.query;
    
    logger.info('获取文章详情请求', { id, timestamp: new Date().toISOString() });
    const post = await getBlogPost(id);
    
    if (!post) {
      logger.warn('文章不存在', { id, timestamp: new Date().toISOString() });
      return res.status(404).json({ 
        success: false, 
        message: '文章不存在' 
      });
    }
    
    logger.info('成功获取文章详情', { id, name: post.name, apiName: post._sourceApiName || post.category });
    
    // 增加阅读量（异步，不阻塞响应）
    // 注意：管理API访问也会增加阅读量，因为小程序可能使用此API获取文章详情
    incrementPostViews(post.slug || post.id).catch(err => {
      logger.error('增加阅读量失败（管理API）', { 
        id, 
        slug: post.slug || post.id, 
        error: err.message 
      });
    });
    
    // 详情场景返回完整的 HTML 内容（不裁剪）
    const { cleanPostForPublic, getBlogComments } = require('../utils/blog-helper');
    const cleanedPost = cleanPostForPublic(post, true); // 第二个参数为true，表示包含完整htmlContent
    
    logger.info('返回文章详情', {
      id: cleanedPost.id,
      name: cleanedPost.name,
      hasHtmlContent: !!cleanedPost.htmlContent,
      htmlContentLength: cleanedPost.htmlContent ? cleanedPost.htmlContent.length : 0
    });
    
    // 获取评论列表（如果请求包含评论）
    let commentsData = null;
    logger.info('检查是否包含评论', { 
      includeComments, 
      includeCommentsType: typeof includeComments,
      shouldInclude: includeComments === 'true' || includeComments === true 
    });
    
    if (includeComments === 'true' || includeComments === true || includeComments === '1') {
      try {
        logger.info('开始获取评论列表', { postId: id, commentsPage, commentsPageSize });
        commentsData = await getBlogComments(id, {
          // 不设置 flat，返回树形结构，但分页按平铺计算
          page: parseInt(commentsPage, 10),
          pageSize: parseInt(commentsPageSize, 10)
        });
        logger.info('获取评论列表成功', { 
          postId: id, 
          commentsCount: commentsData.total,
          commentsLength: commentsData.comments ? commentsData.comments.length : 0,
          currentPage: commentsData.currentPage
        });
      } catch (error) {
        logger.error('获取评论列表失败', { postId: id, error: error.message, stack: error.stack });
        // 评论获取失败不影响文章详情返回
        commentsData = {
          comments: [],
          total: 0,
          totalPages: 0,
          currentPage: parseInt(commentsPage, 10)
        };
      }
    } else {
      logger.info('跳过获取评论列表', { includeComments });
    }
    
    const response = {
      success: true,
      data: cleanedPost
    };
    
    // 如果包含评论，添加到响应中（即使为空数组也要添加）
    if (includeComments === 'true' || includeComments === true || includeComments === '1') {
      // 确保 commentsData 有正确的结构
      if (!commentsData) {
        commentsData = {
          comments: [],
          total: 0,
          totalPages: 0,
          currentPage: parseInt(commentsPage, 10)
        };
      }
      response.comments = commentsData;
      logger.info('添加评论到响应', { 
        hasComments: !!response.comments,
        commentsCount: response.comments.total,
        commentsArrayLength: response.comments.comments ? response.comments.comments.length : 0,
        commentsDataKeys: Object.keys(response.comments),
        responseKeys: Object.keys(response)
      });
    } else {
      logger.info('不包含评论', { includeComments });
    }
    
    logger.info('最终响应结构', { 
      hasData: !!response.data,
      hasComments: !!response.comments,
      responseKeys: Object.keys(response)
    });
    
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
 * GET /api/blog-admin/apis
 * 获取所有可用的API列表（用于文章分类选择）
 * 排除博客系统专用的API路径
 * 直接从数据库读取，不受 status 状态控制（包括 inactive 的 API）
 */
router.get('/apis', requireBlogAuth, async (req, res) => {
  try {
    const { allAsync } = require('../db/database');
    // 移除 status = 'active' 条件，返回所有 GET 方法的 API
    const apis = await allAsync(`
      SELECT id, name, path, description, status
      FROM custom_apis
      WHERE method = 'GET' 
        AND path NOT LIKE '/blog/%'
      ORDER BY name ASC
    `);
    
    // 构造返回数据，包含状态信息
    const formattedApis = apis.map(api => ({
      id: api.id,
      name: api.name,
      path: api.path,
      description: api.description,
      status: api.status || 'active' // 兼容旧数据
    }));
    
    res.json({
      success: true,
      data: formattedApis
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
router.get('/apis/:apiName/field-mapping', requireBlogAuth, async (req, res) => {
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
router.put('/apis/:apiName/field-mapping', requireBlogAuth, [
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
    
    // 记录操作日志（Token认证时adminId为null）
    await logAction(
      req.session?.adminId || null,
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
router.post('/posts', requireBlogAuth, [
  body('name').notEmpty().withMessage('文章名称不能为空'),
  body('apiName').optional().isString().withMessage('API名称（分类）必须是字符串'),
  body('htmlContent').optional().isString().withMessage('htmlContent必须是字符串'),
  body('slug').optional().isString(),
  body('excerpt').optional().isString(),
  body('description').optional().isString(),
  body('image').optional().isString(),
  body('published').optional().isBoolean(),
  validate
], async (req, res) => {
  try {
    // 提取中文名称用于统一存储（避免"二手市场"和"二手市场 second-hand"不一致）
    const extractChineseName = (name) => {
      if (!name) return '';
      const chineseRegex = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]+/g;
      const chineseMatches = name.match(chineseRegex);
      return chineseMatches && chineseMatches.length > 0 
        ? chineseMatches.join('').trim() 
        : name;
    };
    
    // name和title保持一致
    const nameValue = req.body.name || req.body.title || '未命名';
    // excerpt和description保持一致
    const excerptValue = req.body.excerpt || req.body.description || '';
    
    // 统一使用中文名称作为apiName和category（保持数据一致性）
    const rawApiName = req.body.apiName || '';
    const apiNameChinese = extractChineseName(rawApiName) || rawApiName;
    
    const postData = {
      id: req.body.id,
      name: nameValue,
      title: nameValue, // name和title保持一致
      slug: req.body.slug,
      excerpt: excerptValue,
      description: excerptValue, // description和excerpt保持一致
      image: req.body.image || null,
      apiName: apiNameChinese, // 统一使用中文名称
      category: apiNameChinese, // 统一使用中文名称
      published: req.body.published !== undefined ? req.body.published : false
    };
    
    // 特殊字段（二手市场和租房酒店）
    if (req.body.price !== undefined) postData.price = req.body.price;
    if (req.body.rooms !== undefined) postData.rooms = req.body.rooms;
    if (req.body.area !== undefined) postData.area = req.body.area;
    if (req.body.views !== undefined) postData.views = parseInt(req.body.views) || 0;
    
    // 位置和联系方式字段
    if (req.body.phone !== undefined) postData.phone = req.body.phone;
    if (req.body.address !== undefined) postData.address = req.body.address;
    if (req.body.latitude !== undefined) postData.latitude = parseFloat(req.body.latitude);
    if (req.body.longitude !== undefined) postData.longitude = parseFloat(req.body.longitude);
    
    // 小程序用户和设备信息字段
    if (req.body.nickname !== undefined) postData.nickname = req.body.nickname;
    if (req.body.deviceModel !== undefined) postData.deviceModel = req.body.deviceModel;
    if (req.body.deviceId !== undefined) postData.deviceId = req.body.deviceId;
    // 设备IP：优先使用请求中的值，否则从请求头获取
    if (req.body.deviceIp !== undefined) {
      postData.deviceIp = req.body.deviceIp;
    } else {
      // 从请求头获取真实IP（考虑代理情况）
      const forwarded = req.headers['x-forwarded-for'];
      const realIp = req.headers['x-real-ip'];
      const clientIp = forwarded 
        ? forwarded.split(',')[0].trim() 
        : (realIp || req.ip || req.connection.remoteAddress);
      if (clientIp) {
        postData.deviceIp = clientIp;
      }
    }
    
    // 处理特殊类别的数据
    if (req.body._specialData !== undefined) {
      postData._specialData = req.body._specialData;
      // 特殊类别：second-hand 和 rentals 仍然需要 htmlContent
      // 只有 weather、exchange-rate、translation 不使用 htmlContent
      const needsSpecialDataOnly = req.body._specialType === 'weather' || 
                                    req.body._specialType === 'exchange-rate' || 
                                    req.body._specialType === 'translation';
      if (!needsSpecialDataOnly && req.body.htmlContent !== undefined) {
        postData.htmlContent = req.body.htmlContent || '';
      }
    } else {
      // 普通类别才使用htmlContent
      postData.htmlContent = req.body.htmlContent !== undefined ? (req.body.htmlContent || '') : '';
    }
    
    logger.info('创建文章htmlContent处理', {
      hasSpecialData: !!req.body._specialData,
      specialType: req.body._specialType,
      htmlContentLength: postData.htmlContent ? postData.htmlContent.length : 0,
      htmlContentProvided: req.body.htmlContent !== undefined
    });
    
    if (req.body._specialType !== undefined) postData._specialType = req.body._specialType;
    
    logger.info('创建文章请求', { 
      name: nameValue, 
      apiName: apiNameChinese, 
      hasId: !!req.body.id,
      providedId: req.body.id 
    });
    
    const post = await createBlogPost(postData);
    
    logger.info('文章创建成功', { 
      id: post.id, 
      name: post.name, 
      apiName: post._sourceApiName || post.category,
      slug: post.slug 
    });
    
    // 记录操作日志（Token认证时adminId为null）
    await logAction(
      req.session?.adminId || null,
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
router.put('/posts/:id', requireBlogAuth, [
  body('name').optional().notEmpty().withMessage('文章名称不能为空'),
  body('content').optional().isString(),
  body('slug').optional().isString(),
  body('excerpt').optional().isString(),
  body('description').optional().isString(),
  body('image').optional().isString(),
  body('apiName').optional().isString(),
  body('published').optional().isBoolean(),
  validate
], async (req, res) => {
  try {
    // 提取中文名称用于统一存储（避免"二手市场"和"二手市场 second-hand"不一致）
    const extractChineseName = (name) => {
      if (!name) return '';
      const chineseRegex = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]+/g;
      const chineseMatches = name.match(chineseRegex);
      return chineseMatches && chineseMatches.length > 0 
        ? chineseMatches.join('').trim() 
        : name;
    };
    
    const { id } = req.params;
    
    // 权限检查：如果不是管理员，需要检查用户是否有编辑权限
    // 管理员通过Session认证，普通用户通过Token认证
    const isAdmin = req.session && req.session.adminId;
    
    if (!isAdmin) {
      // 普通用户：检查用户手机号是否与文章的deviceId一致
      // 获取当前登录用户的手机号
      let userPhone = null;
      try {
        // 优先检查Session认证（浏览器）
        if (req.session && req.session.userPhone) {
          userPhone = req.session.userPhone;
        } else if (req.session && req.session.userId) {
          // 如果Session中有userId但没有userPhone，从数据库查询
          const { getAsync } = require('../db/database');
          const user = await getAsync(
            'SELECT phone FROM users WHERE id = ?',
            [req.session.userId]
          );
          if (user && user.phone) {
            userPhone = user.phone;
          }
        } else {
          // 如果没有Session，可能是小程序使用 X-API-Token 认证
          // DELETE 请求通常没有请求体，优先从查询参数或请求头获取 deviceId
          if (req.query.deviceId) {
            // 从查询参数获取 deviceId（推荐方式：DELETE /api/blog-admin/posts/:id?deviceId=xxx）
            userPhone = req.query.deviceId;
          } else if (req.headers['x-device-id'] || req.headers['X-Device-Id']) {
            // 从请求头获取 deviceId（备选方式：X-Device-Id: xxx）
            userPhone = req.headers['x-device-id'] || req.headers['X-Device-Id'];
          } else if (req.body && req.body.deviceId) {
            // 从请求体获取 deviceId（如果请求体存在）
            userPhone = req.body.deviceId;
          } else if (req.body && req.body.phone) {
            // 如果没有 deviceId，使用 phone 作为备选
            userPhone = req.body.phone;
          } else {
            // 如果都没有，尝试从 X-User-Token 获取（用户级别的Token）
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
                  userPhone = tokenRecord.phone;
                }
              } catch (error) {
                logger.error('验证Token失败', { error: error.message });
              }
            }
          }
        }
      } catch (error) {
        logger.error('获取当前用户手机号失败', { error: error.message });
      }
      
      if (!userPhone) {
        return res.status(401).json({
          success: false,
          message: '需要登录才能编辑文章。请提供 deviceId（查询参数、请求头 X-Device-Id 或请求体）或有效的用户Token',
          code: 'UNAUTHORIZED'
        });
      }
      
      // 获取文章信息，检查权限
      const existingPost = await getBlogPost(id);
      if (!existingPost) {
        return res.status(404).json({
          success: false,
          message: '文章不存在'
        });
      }
      
      // 直接对比 deviceId
      if (!existingPost.deviceId || existingPost.deviceId !== userPhone) {
        logger.warn('权限检查失败', {
          userDeviceId: userPhone,
          postDeviceId: existingPost.deviceId,
          postId: id
        });
        return res.status(403).json({
          success: false,
          message: '您没有权限编辑此文章',
          code: 'FORBIDDEN'
        });
      }
    }
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
    if (req.body.apiName !== undefined) {
      // 统一使用中文名称（保持数据一致性）
      const rawApiName = req.body.apiName;
      const apiNameChinese = extractChineseName(rawApiName) || rawApiName;
      updateData.apiName = apiNameChinese; // 统一使用中文名称
      updateData.category = apiNameChinese; // 统一使用中文名称
    }
    
    // 特殊字段（二手市场和租房酒店）
    if (req.body.price !== undefined) updateData.price = req.body.price;
    if (req.body.rooms !== undefined) updateData.rooms = req.body.rooms;
    if (req.body.area !== undefined) updateData.area = req.body.area;
    if (req.body.views !== undefined) updateData.views = parseInt(req.body.views) || 0;
    
    // 位置和联系方式字段
    // 如果字段值为null或空字符串，则删除该字段（设置为null）
    if (req.body.phone !== undefined) {
      updateData.phone = req.body.phone === null || req.body.phone === '' ? null : req.body.phone;
    }
    if (req.body.address !== undefined) {
      updateData.address = req.body.address === null || req.body.address === '' ? null : req.body.address;
    }
    if (req.body.latitude !== undefined) {
      updateData.latitude = (req.body.latitude === null || req.body.latitude === '') ? null : parseFloat(req.body.latitude);
    }
    if (req.body.longitude !== undefined) {
      updateData.longitude = (req.body.longitude === null || req.body.longitude === '') ? null : parseFloat(req.body.longitude);
    }
    
    // 小程序用户和设备信息字段
    if (req.body.nickname !== undefined) {
      updateData.nickname = req.body.nickname === null || req.body.nickname === '' ? null : req.body.nickname;
    }
    if (req.body.deviceModel !== undefined) {
      updateData.deviceModel = req.body.deviceModel === null || req.body.deviceModel === '' ? null : req.body.deviceModel;
    }
    if (req.body.deviceId !== undefined) {
      updateData.deviceId = req.body.deviceId === null || req.body.deviceId === '' ? null : req.body.deviceId;
    }
    // 设备IP：优先使用请求中的值，否则从请求头获取（仅在更新时如果未提供则自动获取）
    if (req.body.deviceIp !== undefined) {
      updateData.deviceIp = req.body.deviceIp === null || req.body.deviceIp === '' ? null : req.body.deviceIp;
    }
    
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
      specialDataKeys: updateData._specialData ? Object.keys(updateData._specialData) : [],
      // 记录小程序字段
      nickname: updateData.nickname,
      deviceModel: updateData.deviceModel,
      deviceId: updateData.deviceId,
      deviceIp: updateData.deviceIp,
      // 记录请求体中的所有字段
      requestBodyKeys: Object.keys(req.body),
      updateDataKeys: Object.keys(updateData)
    });
    
    const post = await updateBlogPost(id, updateData);
    
    if (!post) {
      return res.status(404).json({ 
        success: false, 
        message: '文章不存在' 
      });
    }
    
    // 记录操作日志（Token认证时adminId为null）
    await logAction(
      req.session?.adminId || null,
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
router.delete('/posts/:id', requireBlogAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 权限检查：如果不是管理员，需要检查用户是否有删除权限
    // 管理员通过Session认证，普通用户通过Token认证
    const isAdmin = req.session && req.session.adminId;
    
    if (!isAdmin) {
      // 普通用户：检查用户手机号是否与文章的deviceId一致
      // 获取当前登录用户的手机号
      let userPhone = null;
      try {
        // 优先检查Session认证（浏览器）
        if (req.session && req.session.userPhone) {
          userPhone = req.session.userPhone;
        } else if (req.session && req.session.userId) {
          // 如果Session中有userId但没有userPhone，从数据库查询
          const { getAsync } = require('../db/database');
          const user = await getAsync(
            'SELECT phone FROM users WHERE id = ?',
            [req.session.userId]
          );
          if (user && user.phone) {
            userPhone = user.phone;
          }
        } else {
          // 如果没有Session，可能是小程序使用 X-API-Token 认证
          // DELETE 请求通常没有请求体，优先从查询参数或请求头获取 deviceId
          if (req.query.deviceId) {
            // 从查询参数获取 deviceId（推荐方式：DELETE /api/blog-admin/posts/:id?deviceId=xxx）
            userPhone = req.query.deviceId;
          } else if (req.headers['x-device-id'] || req.headers['X-Device-Id']) {
            // 从请求头获取 deviceId（备选方式：X-Device-Id: xxx）
            userPhone = req.headers['x-device-id'] || req.headers['X-Device-Id'];
          } else if (req.body && req.body.deviceId) {
            // 从请求体获取 deviceId（如果请求体存在）
            userPhone = req.body.deviceId;
          } else if (req.body && req.body.phone) {
            // 如果没有 deviceId，使用 phone 作为备选
            userPhone = req.body.phone;
          } else {
            // 如果都没有，尝试从 X-User-Token 获取（用户级别的Token）
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
                  userPhone = tokenRecord.phone;
                }
              } catch (error) {
                logger.error('验证Token失败', { error: error.message });
              }
            }
          }
        }
      } catch (error) {
        logger.error('获取当前用户手机号失败', { error: error.message });
      }
      
      if (!userPhone) {
        return res.status(401).json({
          success: false,
          message: '需要登录才能删除文章。请提供 deviceId（查询参数、请求头 X-Device-Id 或请求体）或有效的用户Token',
          code: 'UNAUTHORIZED'
        });
      }
      
      // 获取文章信息，检查权限
      const existingPost = await getBlogPost(id);
      if (!existingPost) {
        return res.status(404).json({
          success: false,
          message: '文章不存在'
        });
      }
      
      // 直接对比 deviceId
      if (!existingPost.deviceId || existingPost.deviceId !== userPhone) {
        logger.warn('权限检查失败', {
          userDeviceId: userPhone,
          postDeviceId: existingPost.deviceId,
          postId: id
        });
        return res.status(403).json({
          success: false,
          message: '您没有权限删除此文章',
          code: 'FORBIDDEN'
        });
      }
    }
    
    const success = await deleteBlogPost(id);
    
    if (!success) {
      return res.status(404).json({ 
        success: false, 
        message: '文章不存在' 
      });
    }
    
    // 记录操作日志（Token认证时adminId为null）
    await logAction(
      req.session?.adminId || null,
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

/**
 * POST /api/blog-admin/posts/batch-publish
 * 批量发布文章
 */
router.post('/posts/batch-publish', requireBlogAuth, [
  body('ids').isArray().withMessage('ids必须是数组'),
  body('ids.*').isString().notEmpty().withMessage('每个id必须是非空字符串'),
  validate
], async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供要发布的文章ID数组'
      });
    }
    
    const { runAsync, getAsync } = require('../db/database');
    let successCount = 0;
    let failedCount = 0;
    const failedIds = [];
    
    // 批量更新文章发布状态
    for (const id of ids) {
      try {
        // 检查文章是否存在
        const post = await getAsync(
          'SELECT id, published FROM blog_posts WHERE id = ?',
          [id]
        );
        
        if (!post) {
          failedCount++;
          failedIds.push(id);
          logger.warn('批量发布：文章不存在', { id });
          continue;
        }
        
        // 如果已经是发布状态，跳过
        if (post.published === 1) {
          logger.debug('批量发布：文章已发布，跳过', { id });
          continue;
        }
        
        // 更新发布状态
        await runAsync(
          `UPDATE blog_posts 
           SET published = 1, updated_at = datetime('now', 'localtime')
           WHERE id = ?`,
          [id]
        );
        
        successCount++;
        
        // 记录操作日志
        await logAction(
          req.session?.adminId || 'api-token',
          'UPDATE',
          'blog_post',
          id,
          JSON.stringify({ published: true, batchPublish: true }),
          req
        );
      } catch (error) {
        failedCount++;
        failedIds.push(id);
        logger.error('批量发布单篇文章失败', { id, error: error.message });
      }
    }
    
    // 清除缓存
    try {
      const { clearPostsCache } = require('../utils/blog-helper');
      clearPostsCache();
    } catch (e) {
      logger.warn('清除缓存失败', { error: e.message });
    }
    
    res.json({
      success: true,
      message: `批量发布完成：成功 ${successCount} 篇，失败 ${failedCount} 篇`,
      data: {
        successCount,
        failedCount,
        failedIds: failedIds.length > 0 ? failedIds : undefined
      }
    });
  } catch (error) {
    logger.error('批量发布失败', { error: error.message });
    res.status(500).json({
      success: false,
      message: '批量发布失败: ' + error.message
    });
  }
});

// ==================== 分类管理 ====================

/**
 * GET /api/blog-admin/categories
 * 获取所有分类
 */
router.get('/categories', requireBlogAuth, async (req, res) => {
  try {
    // 管理后台显示所有分类（包括只有未发布文章的分类）
    const categories = await getBlogCategories({ includeUnpublished: true });
    
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
router.post('/categories', requireBlogAuth, [
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
    
    // 记录操作日志（Token认证时adminId为null）
    await logAction(
      req.session?.adminId || null,
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
router.put('/categories/:id', requireBlogAuth, [
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
    
    // 记录操作日志（Token认证时adminId为null）
    await logAction(
      req.session?.adminId || null,
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
router.delete('/categories/:id', requireBlogAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const success = await deleteBlogCategory(parseInt(id, 10));
    
    if (!success) {
      return res.status(404).json({ 
        success: false, 
        message: '分类不存在' 
      });
    }
    
    // 记录操作日志（Token认证时adminId为null）
    await logAction(
      req.session?.adminId || null,
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

// ==================== 评论管理 ====================

/**
 * GET /api/blog-admin/comments
 * 获取所有评论
 */
router.get('/comments', requireBlogAuth, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, approved } = req.query;
    
    // 获取所有文章的评论（包括空内容的文章）
    const posts = await getBlogPosts({ 
      publishedOnly: false,
      includeEmptyContent: true 
    });
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
router.put('/comments/:id/approve', requireBlogAuth, [
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
    
    // 记录操作日志（Token认证时adminId为null）
    await logAction(
      req.session?.adminId || null,
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
router.delete('/comments/:id', requireBlogAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const success = await deleteBlogComment(id);
    
    if (!success) {
      return res.status(404).json({ 
        success: false, 
        message: '评论不存在' 
      });
    }
    
    // 记录操作日志（Token认证时adminId为null）
    await logAction(
      req.session?.adminId || null,
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

// ==================== 文件上传 ====================

/**
 * POST /api/blog-admin/upload
 * 上传文件（图片或视频）
 */
router.post('/upload', requireBlogAuth, (req, res, next) => {
  // 根据文件类型设置不同的文件大小限制
  // 默认使用图片限制，实际类型会在 fileFilter 中确定
  const defaultMaxSize = 50 * 1024 * 1024; // 50MB（最大限制）
  
  // 创建 multer 实例
  const uploadMiddleware = multer({
    storage: storage,
    limits: {
      fileSize: defaultMaxSize
    },
    fileFilter: fileFilter
  });
  
  uploadMiddleware.single('file')(req, res, (err) => {
    if (err) {
      // 处理 multer 错误
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          // 根据文件类型返回不同的错误信息
          const fileType = req.fileType || '文件';
          const maxSizeMB = fileType === 'video' ? 50 : 10;
          return res.status(413).json({
            success: false,
            message: `${fileType === 'video' ? '视频' : '图片'}大小超过限制（最大${maxSizeMB}MB）`
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message || '文件上传失败'
        });
      }
      // 处理文件过滤错误
      return res.status(400).json({
        success: false,
        message: err.message || '不支持的文件类型'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '未选择文件'
      });
    }
    
    // 检查文件大小限制（根据实际文件类型）
    const fileType = req.fileType || 'image';
    const maxSize = fileType === 'video' ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (req.file.size > maxSize) {
      const maxSizeMB = maxSize / (1024 * 1024);
      return res.status(413).json({
        success: false,
        message: `${fileType === 'video' ? '视频' : '图片'}大小超过限制（最大${maxSizeMB}MB）`
      });
    }
    
    try {
      // 构建文件URL
      // 文件路径格式：uploads/images/2025/01/xxx.jpg
      // URL格式：https://bobapro.life/uploads/images/2025/01/xxx.jpg
      const filePath = req.file.path;
      const relativePath = path.relative(DATA_DIR, filePath).replace(/\\/g, '/'); // Windows路径转Unix格式
      const baseUrl = process.env.BASE_URL || 'https://bobapro.life';
      const fileUrl = `${baseUrl}/${relativePath}`;
      
      logger.info('文件上传成功', {
        filename: req.file.filename,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        type: fileType,
        url: fileUrl
      });
      
      res.json({
        success: true,
        url: fileUrl,
        message: '上传成功'
      });
    } catch (error) {
      logger.error('文件上传处理失败', { error: error.message });
      res.status(500).json({
        success: false,
        message: '文件上传处理失败: ' + error.message
      });
    }
  });
});

// ==================== 特殊内容管理（天气、汇率、翻译）====================

const { getAsync, runAsync, allAsync } = require('../db/database');

/**
 * GET /api/blog-admin/special-content/:type
 * 获取特殊内容（天气、汇率、翻译）
 * type: weather, exchange-rate, translation
 */
router.get('/special-content/:type', requireBlogAuth, async (req, res) => {
  try {
    const { type } = req.params;
    
    // 验证类型
    const validTypes = ['weather', 'exchange-rate', 'translation'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: '无效的内容类型'
      });
    }
    
    // 根据类型确定API路径（支持多种路径格式）
    let apiPath = `/${type}`;
    
    // 类型到路径的映射（支持中文名称）
    const typeToPathMap = {
      'weather': ['/weather', '/天气', '/天气路况'],
      'exchange-rate': ['/exchange-rate', '/汇率', '/汇率转换'],
      'translation': ['/translation', '/翻译', '/翻译卡片']
    };
    
    const possiblePaths = typeToPathMap[type] || [apiPath];
    
    // 从数据库获取API数据（尝试多个可能的路径）
    let api = null;
    for (const path of possiblePaths) {
      api = await getAsync(
        `SELECT id, name, path, method, response_content, description, status, updated_at
         FROM custom_apis
         WHERE path = ? AND method = 'GET' AND status = 'active'`,
        [path]
      );
      if (api) {
        apiPath = path;
        break;
      }
    }
    
    // 如果还是没找到，尝试通过名称匹配（包含关键词）
    if (!api) {
      const nameKeywords = {
        'weather': ['天气', 'weather'],
        'exchange-rate': ['汇率', 'exchange'],
        'translation': ['翻译', 'translation']
      };
      const keywords = nameKeywords[type] || [];
      
      for (const keyword of keywords) {
        api = await getAsync(
          `SELECT id, name, path, method, response_content, description, status, updated_at
           FROM custom_apis
           WHERE (name LIKE ? OR path LIKE ?) AND method = 'GET' AND status = 'active'
           LIMIT 1`,
          [`%${keyword}%`, `%${keyword}%`]
        );
        if (api) {
          apiPath = api.path;
          break;
        }
      }
    }
    
    if (!api) {
      logger.warn('未找到特殊内容API', { type, triedPaths: possiblePaths });
      return res.status(404).json({
        success: false,
        message: `未找到${type}内容，请先创建对应的API`
      });
    }
    
    logger.debug('找到特殊内容API', { type, apiPath: api.path, apiName: api.name });
    
    // 解析响应内容
    let content = {};
    try {
      const parsed = JSON.parse(api.response_content);
      
      // 对于天气类型，如果解析出来的是对象格式（包含globalAlert、attractions、traffic），直接使用
      // 如果是数组格式，需要转换为对象格式
      if (type === 'weather') {
        if (parsed.globalAlert && parsed.attractions && parsed.traffic) {
          // 已经是正确的对象格式
          content = parsed;
        } else if (Array.isArray(parsed) && parsed.length > 0) {
          // 数组格式，转换为对象格式（这种情况不应该发生，但兼容处理）
          content = {
            globalAlert: parsed[0]?.globalAlert || { level: 'medium', message: '' },
            attractions: parsed[0]?.attractions || [],
            traffic: parsed[0]?.traffic || []
          };
        } else {
          // 空数据或格式不正确，返回默认结构
          content = {
            globalAlert: { level: 'medium', message: '' },
            attractions: [],
            traffic: []
          };
        }
      } else {
        // 其他类型直接使用解析结果
        content = parsed;
      }
      
      logger.info('解析特殊内容数据', { 
        type, 
        hasContent: !!content,
        contentKeys: Object.keys(content),
        contentType: Array.isArray(content) ? 'array' : typeof content,
        hasGlobalAlert: !!content.globalAlert,
        attractionsCount: content.attractions ? content.attractions.length : 0,
        trafficCount: content.traffic ? content.traffic.length : 0,
        rawResponseContent: api.response_content ? api.response_content.substring(0, 200) : 'null'
      });
    } catch (e) {
      logger.warn('解析特殊内容数据失败', { type, error: e.message, responseContent: api.response_content });
      // 如果解析失败，返回默认结构
      if (type === 'weather') {
        content = {
          globalAlert: { level: 'medium', message: '' },
          attractions: [],
          traffic: []
        };
      } else {
        content = {};
      }
    }
    
    const responseData = {
      success: true,
      data: {
        id: api.id,
        name: api.name,
        path: api.path,
        description: api.description,
        updatedAt: api.updated_at,
        content: content
      }
    };
    
    logger.info('返回特殊内容数据', {
      type,
      hasContent: !!content,
      contentStructure: {
        hasGlobalAlert: !!content.globalAlert,
        attractionsCount: content.attractions ? content.attractions.length : 0,
        trafficCount: content.traffic ? content.traffic.length : 0
      }
    });
    
    res.json(responseData);
  } catch (error) {
    logger.error('获取特殊内容失败', { type: req.params.type, error: error.message });
    res.status(500).json({
      success: false,
      message: '获取特殊内容失败: ' + error.message
    });
  }
});

/**
 * PUT /api/blog-admin/special-content/:type
 * 更新特殊内容（天气、汇率、翻译）
 */
router.put('/special-content/:type', requireBlogAuth, [
  body('content').notEmpty().withMessage('内容不能为空'),
  validate
], async (req, res) => {
  try {
    const { type } = req.params;
    const { content } = req.body;
    
    // 验证类型
    const validTypes = ['weather', 'exchange-rate', 'translation'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: '无效的内容类型'
      });
    }
    
    // 根据类型确定API路径（支持多种路径格式）
    let apiPath = `/${type}`;
    
    // 类型到路径的映射（支持中文名称）
    const typeToPathMap = {
      'weather': ['/weather', '/天气', '/天气路况'],
      'exchange-rate': ['/exchange-rate', '/汇率', '/汇率转换'],
      'translation': ['/translation', '/翻译', '/翻译卡片']
    };
    
    const possiblePaths = typeToPathMap[type] || [apiPath];
    
    // 从数据库获取API数据（尝试多个可能的路径）
    let api = null;
    for (const path of possiblePaths) {
      api = await getAsync(
        `SELECT id, name, path, method, response_content, status
         FROM custom_apis
         WHERE path = ? AND method = 'GET' AND status = 'active'`,
        [path]
      );
      if (api) {
        apiPath = path;
        break;
      }
    }
    
    // 如果还是没找到，尝试通过名称匹配（包含关键词）
    if (!api) {
      const nameKeywords = {
        'weather': ['天气', 'weather'],
        'exchange-rate': ['汇率', 'exchange'],
        'translation': ['翻译', 'translation']
      };
      const keywords = nameKeywords[type] || [];
      
      for (const keyword of keywords) {
        api = await getAsync(
          `SELECT id, name, path, method, response_content, status
           FROM custom_apis
           WHERE (name LIKE ? OR path LIKE ?) AND method = 'GET' AND status = 'active'
           LIMIT 1`,
          [`%${keyword}%`, `%${keyword}%`]
        );
        if (api) {
          apiPath = api.path;
          break;
        }
      }
    }
    
    if (!api) {
      logger.warn('未找到特殊内容API（更新）', { type, triedPaths: possiblePaths });
      return res.status(404).json({
        success: false,
        message: `未找到${type}内容，请先创建对应的API`
      });
    }
    
    logger.debug('找到特殊内容API（更新）', { type, apiPath: api.path, apiName: api.name });
    
    // 验证内容格式
    let contentObj;
    try {
      contentObj = typeof content === 'string' ? JSON.parse(content) : content;
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: '内容格式无效，必须是有效的JSON'
      });
    }
    
    // 根据类型验证内容结构
    if (type === 'weather') {
      if (!contentObj.globalAlert || !contentObj.attractions || !contentObj.traffic) {
        return res.status(400).json({
          success: false,
          message: '天气内容必须包含 globalAlert、attractions 和 traffic 字段'
        });
      }
    } else if (type === 'exchange-rate') {
      // 汇率内容可以是数组或对象
      if (!Array.isArray(contentObj) && typeof contentObj !== 'object') {
        return res.status(400).json({
          success: false,
          message: '汇率内容必须是数组或对象'
        });
      }
    } else if (type === 'translation') {
      // 翻译内容应该是数组
      if (!Array.isArray(contentObj)) {
        return res.status(400).json({
          success: false,
          message: '翻译内容必须是数组'
        });
      }
    }
    
    // 更新数据库
    const responseContent = JSON.stringify(contentObj);
    await runAsync(
      `UPDATE custom_apis
       SET response_content = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [responseContent, api.id]
    );
    
    // 记录操作日志
    await logAction(
      req.session?.adminId || 'api-token',
      'UPDATE',
      'special_content',
      `${type}:${api.id}`,
      JSON.stringify({ type, content: contentObj }),
      req
    );
    
    // 重新加载自定义API路由（使更改生效）
    try {
      const { reloadCustomApiRoutes } = require('../utils/custom-api-router');
      await reloadCustomApiRoutes();
    } catch (reloadError) {
      logger.warn('重新加载API路由失败', { error: reloadError.message });
    }
    
    res.json({
      success: true,
      message: `${type}内容更新成功`,
      data: {
        id: api.id,
        content: contentObj
      }
    });
  } catch (error) {
    logger.error('更新特殊内容失败', { type: req.params.type, error: error.message });
    res.status(500).json({
      success: false,
      message: '更新特殊内容失败: ' + error.message
    });
  }
});

module.exports = router;
