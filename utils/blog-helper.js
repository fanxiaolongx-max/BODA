const { getAsync, allAsync, runAsync } = require('../db/database');
const { logger } = require('./logger');
const { v4: uuidv4 } = require('uuid');

// 文章列表缓存（内存缓存）
const postsCache = {
  data: null,
  timestamp: null,
  ttl: 30000 // 30秒缓存时间
};

/**
 * 清除文章列表缓存
 */
function clearPostsCache() {
  postsCache.data = null;
  postsCache.timestamp = null;
}

/**
 * 检查缓存是否有效
 */
function isCacheValid() {
  if (!postsCache.data || !postsCache.timestamp) {
    return false;
  }
  const now = Date.now();
  return (now - postsCache.timestamp) < postsCache.ttl;
}

/**
 * 获取当前本地时间的 ISO 格式字符串
 * 使用 Node.js 的时区设置（通过 TZ 环境变量，如 Africa/Cairo）
 * @returns {string} ISO 格式的时间字符串（YYYY-MM-DDTHH:mm:ss.sssZ）
 */
function getCurrentLocalTimeISOString() {
  const now = new Date();
  // 获取本地时间的各个部分
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  
  // 获取时区偏移（分钟）
  const timezoneOffset = -now.getTimezoneOffset(); // 注意：getTimezoneOffset() 返回的是 UTC 与本地时间的差值（分钟），需要取反
  const offsetHours = String(Math.floor(Math.abs(timezoneOffset) / 60)).padStart(2, '0');
  const offsetMinutes = String(Math.abs(timezoneOffset) % 60).padStart(2, '0');
  const offsetSign = timezoneOffset >= 0 ? '+' : '-';
  
  // 返回 ISO 格式字符串，包含时区信息
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${offsetSign}${offsetHours}:${offsetMinutes}`;
}

/**
 * 从custom_apis表获取博客数据
 * @param {string} path - API路径
 * @returns {Promise<Object|null>} API数据或null
 */
async function getBlogApi(path) {
  try {
    const api = await getAsync(
      `SELECT id, name, path, method, response_content, status 
       FROM custom_apis 
       WHERE path = ? AND method = 'GET' AND status = 'active'`,
      [path]
    );
    
    if (!api) {
      return null;
    }
    
    try {
      api.response_content = JSON.parse(api.response_content);
    } catch (e) {
      logger.warn('解析API响应内容失败', { path, error: e.message });
      return null;
    }
    
    return api;
  } catch (error) {
    logger.error('获取博客API失败', { path, error: error.message });
    return null;
  }
}

/**
 * 获取API字段映射配置
 * @param {string} apiName - API名称
 * @returns {Promise<Object|null>} 字段映射配置或null
 */
async function getApiFieldMapping(apiName) {
  try {
    const mapping = await getAsync(
      `SELECT value FROM settings WHERE key = ?`,
      [`blog_api_field_mapping_${apiName}`]
    );
    
    if (mapping && mapping.value) {
      try {
        return JSON.parse(mapping.value);
      } catch (e) {
        logger.warn('解析API字段映射配置失败', { apiName, error: e.message });
        return null;
      }
    }
    
    return null;
  } catch (error) {
    logger.error('获取API字段映射配置失败', { apiName, error: error.message });
    return null;
  }
}

/**
 * 批量获取多个API的字段映射配置
 * @param {string[]} apiNames - API名称数组
 * @returns {Promise<Map<string, object>>} - 返回Map，key为API名称，value为字段映射对象
 */
async function getAllApiFieldMappings(apiNames) {
  if (!apiNames || apiNames.length === 0) {
    return new Map();
  }
  
  try {
    // 构建查询条件：blog_api_field_mapping_${apiName}
    const keys = apiNames.map(name => `blog_api_field_mapping_${name}`);
    const placeholders = keys.map(() => '?').join(',');
    
    const mappings = await allAsync(
      `SELECT key, value FROM settings WHERE key IN (${placeholders})`,
      keys
    );
    
    // 构建Map，key为API名称（去掉前缀），value为解析后的映射对象
    const mappingMap = new Map();
    
    for (const mapping of mappings) {
      if (mapping && mapping.value) {
        try {
          // 从key中提取API名称：blog_api_field_mapping_${apiName} -> apiName
          const apiName = mapping.key.replace('blog_api_field_mapping_', '');
          const parsedMapping = JSON.parse(mapping.value);
          mappingMap.set(apiName, parsedMapping);
        } catch (e) {
          logger.warn('解析API字段映射配置失败', { key: mapping.key, error: e.message });
        }
      }
    }
    
    return mappingMap;
  } catch (error) {
    logger.error('批量获取API字段映射配置失败', { error: error.message });
    return new Map();
  }
}

/**
 * 将API数据项转换为文章格式
 * @param {Object} item - API数据项
 * @param {string} apiName - API名称（作为分类）
 * @param {Object} fieldMapping - 字段映射配置
 * @returns {Object} 文章对象
 */
function convertApiItemToPost(item, apiName, fieldMapping = null) {
  // 检查是否是天气路况的对象格式
  const isWeatherObject = item && item.globalAlert && item.attractions && item.traffic;
  
  // 默认字段映射（如果未配置）
  const defaultMapping = {
    id: 'id',
    name: 'name',
    title: 'title',
    description: 'description',
    image: 'image',
    htmlContent: 'htmlContent',
    excerpt: 'excerpt',
    slug: 'slug',
    published: 'published',
    views: 'views',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };
  
  const mapping = fieldMapping || defaultMapping;
  
  // 应用字段映射
  // 注意：id字段现在已经是全局唯一的UUID，不需要internal_post_id
  // 对于天气路况对象格式，使用基于API名称的稳定ID
  const postId = isWeatherObject ? `weather-${apiName}` : (item[mapping.id] || item.id || uuidv4());
  // name和title保持一致
  const itemName = isWeatherObject ? '天气路况' : (item[mapping.name] || item.name || item[mapping.title] || item.title || '未命名');
  
  // 生成稳定的slug（基于ID）
  let postSlug;
  if (isWeatherObject) {
    postSlug = 'weather';
  } else {
    const existingSlug = item[mapping.slug] || item.slug;
    if (existingSlug) {
      postSlug = existingSlug;
    } else {
      // 基于名称和ID生成稳定的slug
      let baseSlug = itemName
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      
      if (!baseSlug) {
        baseSlug = String(postId).substring(0, 8).replace(/[^a-z0-9]/g, '');
      }
      
      const idSuffix = String(postId).substring(0, 8).replace(/[^a-z0-9]/g, '');
      postSlug = `${baseSlug}-${idSuffix}`;
    }
  }
  // excerpt和description保持一致
  const excerptValue = isWeatherObject 
    ? (item.globalAlert?.message || '') 
    : (item[mapping.excerpt] || item.excerpt || item[mapping.description] || item.description || '');
  const post = {
    id: postId, // 天气路况对象格式使用稳定ID
    name: itemName,
    title: itemName, // name和title保持一致
    slug: postSlug,
    excerpt: excerptValue,
    description: excerptValue, // description和excerpt保持一致
    htmlContent: item[mapping.htmlContent] || item.htmlContent || item.html || '',
    image: item[mapping.image] || item.image || null,
    category: apiName, // 分类直接使用apiName
    published: mapping.published ? (item[mapping.published] !== undefined ? item[mapping.published] : true) : true,
    views: item[mapping.views] || item.views || 0,
    createdAt: item[mapping.createdAt] || item.createdAt || item.created_at || getCurrentLocalTimeISOString(),
    updatedAt: item[mapping.updatedAt] || item.updatedAt || item.updated_at || getCurrentLocalTimeISOString(),
    // 保留原始数据用于更新
    _sourceApiName: apiName,
    _originalData: item
  };
  
  // 保留特殊字段（二手市场和租房酒店）
  if (item.price !== undefined) post.price = item.price;
  if (item.rooms !== undefined) post.rooms = item.rooms;
  if (item.area !== undefined) post.area = item.area;
  
  // 保留位置和联系方式字段
  if (item.phone !== undefined) post.phone = item.phone;
  if (item.address !== undefined) post.address = item.address;
  if (item.latitude !== undefined) post.latitude = item.latitude;
  if (item.longitude !== undefined) post.longitude = item.longitude;
  
  return post;
}

/**
 * 清理文章对象，移除内部字段（不对外暴露）
 * @param {Object} post - 文章对象
 * @returns {Object} 清理后的文章对象
 */
function cleanPostForPublic(post, includeHtmlContent = false, isList = false) {
  if (!post) return post;
  
  // 创建副本，保留必要的内部字段供前端使用
  // id字段现在已经是全局唯一的，不需要额外处理
  const cleaned = { ...post };
  // 保留_sourceApiName和_originalData，因为前端可能需要用于更新操作
  
  // 处理 HTML 内容
  if (!includeHtmlContent) {
    // 检查 htmlContent 是否存在且不为空
    // 将 "无"、"null"、"undefined" 等无效值也视为空
    const htmlContentStr = cleaned.htmlContent !== undefined && cleaned.htmlContent !== null 
                          ? String(cleaned.htmlContent).trim() 
                          : '';
    const isEmptyValues = ['', '无', 'null', 'undefined', 'none', 'n/a', 'na'];
    const hasHtmlContent = htmlContentStr !== '' && !isEmptyValues.includes(htmlContentStr.toLowerCase());
    
    if (isList) {
      // 列表场景：如果htmlContent存在且不为空，只保留前10个字节用于快速预览
      // 如果htmlContent为空或不存在，则不返回该字段（小程序端无需过滤）
      if (hasHtmlContent) {
        if (htmlContentStr.length > 10) {
          cleaned.htmlContent = htmlContentStr.substring(0, 10);
        } else {
          cleaned.htmlContent = htmlContentStr;
        }
        // 如果截取后为空或无效值，也删除该字段
        const trimmed = cleaned.htmlContent.trim();
        if (trimmed === '' || isEmptyValues.includes(trimmed.toLowerCase())) {
          delete cleaned.htmlContent;
        }
      } else {
        // htmlContent为空或不存在，删除该字段
        delete cleaned.htmlContent;
      }
    } else {
      // 非列表场景：完全移除 HTML 内容
      delete cleaned.htmlContent;
    }
  }
  
  return cleaned;
}

/**
 * 获取文章列表
 * 从 blog_posts 表直接查询
 * @param {Object} options - 查询选项
 * @param {boolean} options.publishedOnly - 仅获取已发布的文章
 * @param {string} options.category - 分类筛选（API名称）
 * @param {string} options.search - 搜索关键词
 * @param {boolean} options.includeEmptyContent - 是否包含空内容的文章（默认：有分类筛选时包含，主页场景不包含）
 * @returns {Promise<Array>} 文章列表
 */
async function getBlogPosts(options = {}) {
  try {
    // 检查缓存（仅在没有任何筛选条件时使用缓存）
    const hasFilters = options.publishedOnly === false || options.category || options.search;
    if (!hasFilters && isCacheValid()) {
      logger.debug('使用缓存的文章列表');
      return postsCache.data;
    }
    
    // 构建SQL查询
    let whereConditions = [];
    let queryParams = [];
    
    // 筛选已发布的文章
    // 只有当 publishedOnly 明确为 true 时才筛选已发布的文章
    // 如果为 false 或 undefined，则返回所有文章（包括未发布的）
    if (options.publishedOnly === true) {
      whereConditions.push('published = 1');
    }
    
    // 分类筛选（api_name字段）
    if (options.category) {
      whereConditions.push('(api_name = ? OR category = ?)');
      queryParams.push(options.category, options.category);
    }
    
    // 搜索
    if (options.search) {
      whereConditions.push(`(
        name LIKE ? OR 
        title LIKE ? OR 
        excerpt LIKE ? OR 
        description LIKE ? OR 
        html_content LIKE ?
      )`);
      const searchPattern = `%${options.search}%`;
      queryParams.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';
    
    // 从 blog_posts 表查询
    const rows = await allAsync(`
      SELECT 
        id, api_name, name, title, slug, excerpt, description,
        html_content, image, category, published, views,
        created_at, updated_at, custom_fields
      FROM blog_posts
      ${whereClause}
      ORDER BY api_name ASC, id ASC
    `, queryParams);
    
    // 批量获取所有API的字段映射配置（性能优化）
    const apiNames = [...new Set(rows.map(row => row.api_name))];
    const allFieldMappings = await getAllApiFieldMappings(apiNames);
    
    // 转换为文章格式
    const allPosts = rows.map(row => {
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
        _sourceApiName: row.api_name, // 保留源API名称
        published: row.published === 1,
        views: row.views || 0,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
      
      // 添加特殊字段（从custom_fields中提取）
      if (customFields.price !== undefined) post.price = customFields.price;
      if (customFields.rooms !== undefined) post.rooms = customFields.rooms;
      if (customFields.area !== undefined) post.area = customFields.area;
      if (customFields.phone !== undefined) post.phone = customFields.phone;
      if (customFields.address !== undefined) post.address = customFields.address;
      if (customFields.latitude !== undefined) post.latitude = customFields.latitude;
      if (customFields.longitude !== undefined) post.longitude = customFields.longitude;
      
      // 添加其他自定义字段
      for (const key in customFields) {
        if (!['price', 'rooms', 'area', 'phone', 'address', 'latitude', 'longitude'].includes(key)) {
          post[key] = customFields[key];
        }
      }
      
      // 应用字段映射（如果需要）
      if (fieldMapping) {
        return convertApiItemToPost(post, row.api_name, fieldMapping);
      }
      
      return post;
    });
    
    // 主页场景（没有分类筛选）：过滤掉空内容的文章
    // 分类页场景（有分类筛选）：保留所有文章，包括空内容的
    // 管理后台：始终包含所有文章，包括空内容的
    let filteredPosts = allPosts;
    
    // 如果明确指定 includeEmptyContent 为 true，或者有分类筛选，则不过滤空内容
    const shouldIncludeEmpty = options.includeEmptyContent === true || options.category;
    
    if (!shouldIncludeEmpty) {
      // 主页场景：过滤掉空内容的文章
      // 空内容的判断：html_content、excerpt、description 都为空或null
      filteredPosts = allPosts.filter(post => {
        const hasHtmlContent = post.htmlContent && post.htmlContent.trim() !== '';
        const hasExcerpt = post.excerpt && post.excerpt.trim() !== '';
        const hasDescription = post.description && post.description.trim() !== '';
        // 至少有一个内容字段不为空，就显示
        return hasHtmlContent || hasExcerpt || hasDescription;
      });
    }
    // 如果有分类筛选，或者明确指定 includeEmptyContent，不过滤空内容，显示所有文章
    
    // 缓存结果（仅在没有任何筛选条件时缓存）
    if (!hasFilters) {
      postsCache.data = filteredPosts;
      postsCache.timestamp = Date.now();
    }
    
    return filteredPosts;
  } catch (error) {
    logger.error('获取文章列表失败', { error: error.message });
    return [];
  }
}

/**
 * 根据slug获取单篇文章
 * @param {string} slug - 文章slug
 * @returns {Promise<Object|null>} 文章对象或null
 */
async function getBlogPost(slug) {
  try {
    // 从所有文章中查找（支持slug和id，id现在是全局唯一的）
    const posts = await getBlogPosts({ publishedOnly: false });
    const post = posts.find(p => {
      // 优先匹配slug
      if (p.slug === slug) {
        return true;
      }
      // 然后匹配id（id现在是全局唯一的UUID）
      if (String(p.id) === String(slug)) {
        return true;
      }
      return false;
    });
    
    return post || null;
  } catch (error) {
    logger.error('获取文章失败', { slug, error: error.message });
    return null;
  }
}

/**
 * 根据ID和API名称查找文章所在的API
 * @param {string} postId - 文章ID
 * @param {string} apiName - API名称（分类）
 * @returns {Promise<Object|null>} API对象或null
 */
/**
 * 根据全局唯一ID查找文章所在的API
 * @param {string} postId - 文章ID（现在是全局唯一的UUID）
 * @param {string} apiName - API名称（分类）
 * @returns {Promise<Object|null>} API对象或null
 */
async function findPostSourceApi(postId, apiName) {
  try {
    const api = await getAsync(`
      SELECT id, name, path, response_content, internal_api_id
      FROM custom_apis
      WHERE name = ? AND method = 'GET' AND status = 'active'
    `, [apiName]);
    
    if (!api) {
      return null;
    }
    
    let responseContent;
    try {
      responseContent = JSON.parse(api.response_content);
    } catch (e) {
      return null;
    }
    
    // 优先检查是否是天气路况的对象格式
    if (responseContent.globalAlert && responseContent.attractions && responseContent.traffic) {
      // 天气路况对象格式：整个对象就是一个"文章"
      // 对于天气路况，使用基于API名称的稳定ID进行匹配
      const weatherPostId = `weather-${apiName}`;
      if (String(postId) === String(weatherPostId)) {
        return {
          api,
          items: [responseContent], // 将整个对象包装成数组
          itemIndex: 0, // 只有一个元素，索引为0
          isArrayFormat: false,
          isWeatherObject: true // 标记这是天气路况对象格式
        };
      }
      // 如果ID不匹配，返回null（可能是其他天气路况API）
      return null;
    }
    
    let items = [];
    if (Array.isArray(responseContent)) {
      items = responseContent;
    } else if (responseContent.data && Array.isArray(responseContent.data)) {
      items = responseContent.data;
    }
    
    // 直接使用id匹配（id现在是全局唯一的UUID）
    const itemIndex = items.findIndex(item => {
      const itemId = item.id || item._id;
      return String(itemId) === String(postId);
    });
    
    if (itemIndex === -1) {
      return null;
    }
    
    return {
      api,
      items,
      itemIndex,
      isArrayFormat: Array.isArray(responseContent), // 记录原始格式
      isWeatherObject: false
    };
  } catch (error) {
    logger.error('查找文章源API失败', { postId, apiName, error: error.message });
    return null;
  }
}

/**
 * 获取分类列表
 * 从blog_posts表中的文章自动提取分类名称，而不是从custom_apis表读取
 * @param {Object} options - 选项
 * @param {boolean} options.includeUnpublished - 是否包含未发布文章的分类（默认false，只统计已发布的文章）
 * @returns {Promise<Array>} 分类列表
 */
async function getBlogCategories(options = {}) {
  try {
    const { includeUnpublished = false } = options;
    // 根据选项获取文章：管理后台需要包含未发布的，博客前端只显示已发布的
    const posts = await getBlogPosts({ publishedOnly: !includeUnpublished });
    
    /**
     * 提取中文名称（用于匹配）
     * @param {string} name - 原始名称
     * @returns {string} 只包含中文的名称
     */
    const extractChineseName = (name) => {
      if (!name) return '';
      const chineseRegex = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]+/g;
      const chineseMatches = name.match(chineseRegex);
      return chineseMatches && chineseMatches.length > 0 
        ? chineseMatches.join('').trim() 
        : name;
    };
    
    // 统计每个分类的文章数（从文章数据中提取分类）
    const categoryMap = new Map(); // 使用Map存储分类信息，key为分类名称
    const seenPostIds = new Set(); // 用于去重，避免重复统计
    
    posts.forEach(post => {
      const postId = String(post.id || '');
      // 如果已存在相同id，跳过（防止重复统计）
      if (postId && seenPostIds.has(postId)) {
        return;
      }
      seenPostIds.add(postId);
      
      // 使用_sourceApiName或category作为分类名称
      const apiName = post._sourceApiName || post.category || '';
      if (apiName) {
        // 提取中文名称（统一使用中文名称作为分类标识）
        const chineseApiName = extractChineseName(apiName);
        const categoryName = chineseApiName || apiName;
        
        // 如果该分类已存在，增加文章数；否则创建新分类
        if (categoryMap.has(categoryName)) {
          const category = categoryMap.get(categoryName);
          category.postCount++;
          // 更新最新文章的创建时间（用于排序）
          if (post.createdAt && (!category.latestPostDate || post.createdAt > category.latestPostDate)) {
            category.latestPostDate = post.createdAt;
          }
        } else {
          // 创建新分类
          categoryMap.set(categoryName, {
            name: categoryName,
            slug: categoryName.toLowerCase().replace(/\s+/g, '-').replace(/[^\u4e00-\u9fa5a-z0-9-]/g, ''),
            description: categoryName,
            postCount: 1,
            latestPostDate: post.createdAt || null
          });
        }
      }
    });
    
    // 转换为数组并按名称排序
    const categories = Array.from(categoryMap.values()).sort((a, b) => {
      // 按分类名称排序
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    
    // 为每个分类添加id（使用索引+1作为临时ID，或者使用slug的hash）
    categories.forEach((cat, index) => {
      cat.id = index + 1;
    });
    
    logger.info('分类文章数统计（从文章数据提取）', {
      包含未发布: includeUnpublished,
      总分类数: categories.length,
      总文章数: posts.length,
      去重后文章数: seenPostIds.size,
      分类列表: categories.map(cat => ({ name: cat.name, count: cat.postCount }))
    });
    
    return categories;
  } catch (error) {
    logger.error('获取分类列表失败', { error: error.message });
    return [];
  }
}

/**
 * 获取文章评论
 * @param {string} postId - 文章ID
 * @param {Object} options - 查询选项
 * @returns {Promise<Object>} 评论数据和分页信息
 */
async function getBlogComments(postId, options = {}) {
  try {
    const api = await getBlogApi(`/blog/posts/${postId}/comments`);
    
    if (!api || !api.response_content || !api.response_content.data) {
      return { comments: [], total: 0, totalPages: 0 };
    }
    
    let comments = api.response_content.data;
    
    // 仅返回已审核的评论（前端）
    if (options.approvedOnly !== false) {
      comments = comments.filter(comment => comment.approved === true);
    }
    
    // 按创建时间倒序排序
    comments.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.created_at || 0);
      const dateB = new Date(b.createdAt || b.created_at || 0);
      return dateB - dateA;
    });
    
    // 分页
    const page = options.page || 1;
    const pageSize = options.pageSize || 10;
    const total = comments.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedComments = comments.slice(startIndex, endIndex);
    
    return {
      comments: paginatedComments,
      total,
      totalPages,
      currentPage: page
    };
  } catch (error) {
    logger.error('获取评论失败', { postId, error: error.message });
    return { comments: [], total: 0, totalPages: 0 };
  }
}

/**
 * 增加文章阅读量
 * @param {string} slug - 文章slug
 * @returns {Promise<boolean>} 是否成功
 */
async function incrementPostViews(slug) {
  try {
    // 先找到文章
    const post = await getBlogPost(slug);
    if (!post) {
      return false;
    }
    
    // 直接从 blog_posts 表更新阅读量
    await runAsync(
      `UPDATE blog_posts 
       SET views = views + 1, updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [post.id]
    );
    
    // 清除缓存
    clearPostsCache();
    
    return true;
  } catch (error) {
    logger.error('增加阅读量失败', { slug, error: error.message });
    return false;
  }
}

/**
 * 创建或更新博客API
 * @param {string} path - API路径
 * @param {string} name - API名称
 * @param {Object} responseContent - 响应内容
 * @param {string} method - HTTP方法，默认GET
 * @param {string} description - 描述
 * @returns {Promise<number>} API ID
 */
async function upsertBlogApi(path, name, responseContent, method = 'GET', description = null) {
  try {
    // 检查是否已存在
    const existing = await getAsync(
      `SELECT id FROM custom_apis WHERE path = ? AND method = ?`,
      [path, method]
    );
    
    const responseContentJson = JSON.stringify(responseContent);
    
    if (existing) {
      // 更新
      await runAsync(
        `UPDATE custom_apis 
         SET name = ?, response_content = ?, description = ?, updated_at = datetime('now', 'localtime')
         WHERE id = ?`,
        [name, responseContentJson, description, existing.id]
      );
      return existing.id;
    } else {
      // 创建
      const result = await runAsync(
        `INSERT INTO custom_apis (name, path, method, response_content, description, status, requires_token)
         VALUES (?, ?, ?, ?, ?, 'active', 0)`,
        [name, path, method, responseContentJson, description]
      );
      return result.id;
    }
  } catch (error) {
    logger.error('创建/更新博客API失败', { path, error: error.message });
    throw error;
  }
}

/**
 * 创建文章
 * @param {Object} postData - 文章数据，必须包含apiName（分类）
 * @returns {Promise<Object>} 创建的文章
 */
async function createBlogPost(postData) {
  try {
    if (!postData.apiName) {
      throw new Error('必须指定API名称（分类）');
    }
    
    // 提取中文名称用于匹配（API的name可能是"中文 英文"格式）
    const extractChineseName = (name) => {
      if (!name) return '';
      const chineseRegex = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]+/g;
      const chineseMatches = name.match(chineseRegex);
      return chineseMatches && chineseMatches.length > 0 
        ? chineseMatches.join('').trim() 
        : name;
    };
    
    const apiNameChinese = extractChineseName(postData.apiName);
    
    // 验证API是否存在（支持中文名称和完整名称匹配）
    let targetApi = await getAsync(`
      SELECT id, name, path
      FROM custom_apis
      WHERE name = ? AND method = 'GET' AND status = 'active'
    `, [postData.apiName]);
    
    // 如果精确匹配失败，尝试中文名称匹配
    if (!targetApi) {
      const allApis = await allAsync(`
        SELECT id, name, path
        FROM custom_apis
        WHERE method = 'GET' AND status = 'active'
      `);
      
      targetApi = allApis.find(api => {
        const apiNameChineseOnly = extractChineseName(api.name);
        return apiNameChineseOnly === apiNameChinese || api.name === postData.apiName;
      });
    }
    
    if (!targetApi) {
      throw new Error(`API "${postData.apiName}" 不存在`);
    }
    
    // 生成文章ID（全局唯一的UUID）
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    let postId;
    if (postData.id) {
      const idStr = String(postData.id);
      if (UUID_REGEX.test(idStr)) {
        // 检查是否已存在
        const existing = await getAsync('SELECT id FROM blog_posts WHERE id = ?', [idStr]);
        if (existing) {
          logger.warn('提供的ID已存在，生成新的UUID', { providedId: idStr });
          postId = uuidv4();
        } else {
          postId = idStr;
        }
      } else {
        logger.warn('提供的ID不是UUID格式，生成新的UUID', { providedId: idStr });
        postId = uuidv4();
      }
    } else {
      postId = uuidv4();
    }
    
    // 生成稳定的slug
    let slug = postData.slug;
    if (!slug && postData.name) {
      let baseSlug = postData.name
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      
      if (!baseSlug) {
        baseSlug = String(postId).substring(0, 8).replace(/[^a-z0-9]/g, '');
      }
      
      const idSuffix = String(postId).substring(0, 8).replace(/[^a-z0-9]/g, '');
      slug = `${baseSlug}-${idSuffix}`;
    }
    
    // 确保slug唯一
    let finalSlug = slug || '';
    if (finalSlug) {
      let counter = 1;
      let existingSlug = await getAsync('SELECT id FROM blog_posts WHERE slug = ? AND id != ?', [finalSlug, postId]);
      while (existingSlug) {
        const baseSlug = slug.split('-').slice(0, -1).join('-') || slug;
        finalSlug = `${baseSlug}-${counter}`;
        existingSlug = await getAsync('SELECT id FROM blog_posts WHERE slug = ? AND id != ?', [finalSlug, postId]);
        counter++;
      }
    }
    
    // 准备基本字段
    const nameValue = postData.name || postData.title || '未命名';
    const titleValue = postData.title || nameValue;
    const excerptValue = postData.excerpt || postData.description || '';
    const descriptionValue = postData.description || excerptValue;
    const htmlContent = postData.htmlContent || '';
    const image = postData.image || null;
    const category = postData.category || postData.apiName;
    const published = postData.published !== undefined ? (postData.published ? 1 : 0) : 0;
    const views = postData.views !== undefined ? parseInt(postData.views) || 0 : 0;
    
    // 构建 custom_fields JSON
    const customFields = {};
    if (postData.price !== undefined) customFields.price = postData.price;
    if (postData.rooms !== undefined) customFields.rooms = postData.rooms;
    if (postData.area !== undefined) customFields.area = postData.area;
    if (postData.phone !== undefined) customFields.phone = postData.phone;
    if (postData.address !== undefined) customFields.address = postData.address;
    if (postData.latitude !== undefined) customFields.latitude = postData.latitude;
    if (postData.longitude !== undefined) customFields.longitude = postData.longitude;
    
    // 处理特殊类别数据（天气、汇率、翻译等）
    const isSpecialCategory = (apiName) => {
      if (!apiName) return null;
      const lowerName = apiName.toLowerCase();
      if (lowerName === 'weather' || lowerName.includes('weather')) return 'weather';
      if (lowerName === 'exchange-rate' || lowerName === 'exchangerate' || lowerName.includes('exchange')) return 'exchange-rate';
      if (lowerName === 'translation' || lowerName.includes('translation')) return 'translation';
      return null;
    };
    
    const specialType = isSpecialCategory(postData.apiName);
    if (specialType && postData._specialData) {
      // 将特殊数据存储到 custom_fields
      customFields._specialType = specialType;
      customFields._specialData = postData._specialData;
    }
    
    // 添加其他未映射的字段到 custom_fields
    const excludedFields = ['id', 'name', 'title', 'slug', 'excerpt', 'description', 
      'htmlContent', 'image', 'category', 'apiName', 'published', 'views',
      'price', 'rooms', 'area', 'phone', 'address', 'latitude', 'longitude',
      '_specialData', 'createdAt', 'updatedAt'];
    
    for (const key in postData) {
      if (!excludedFields.includes(key) && postData[key] !== undefined && postData[key] !== null) {
        customFields[key] = postData[key];
      }
    }
    
    const createdAt = getCurrentLocalTimeISOString();
    const updatedAt = createdAt;
    
    // 直接插入到 blog_posts 表
    await runAsync(`
      INSERT INTO blog_posts (
        id, api_name, name, title, slug, excerpt, description,
        html_content, image, category, published, views,
        created_at, updated_at, custom_fields
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      postId,
      postData.apiName,
      nameValue,
      titleValue,
      finalSlug,
      excerptValue,
      descriptionValue,
      htmlContent,
      image,
      category,
      published,
      views,
      createdAt,
      updatedAt,
      JSON.stringify(customFields)
    ]);
    
    // 清除缓存
    clearPostsCache();
    
    // 获取字段映射配置（用于返回格式转换）
    const fieldMapping = await getApiFieldMapping(postData.apiName);
    
    // 构建返回的文章对象
    const newPost = {
      id: postId,
      name: nameValue,
      title: titleValue,
      slug: finalSlug,
      excerpt: excerptValue,
      description: descriptionValue,
      htmlContent: htmlContent,
      image: image,
      category: category,
      _sourceApiName: postData.apiName,
      published: published === 1,
      views: views,
      createdAt: createdAt,
      updatedAt: updatedAt,
      ...customFields
    };
    
    // 应用字段映射（如果需要）
    if (fieldMapping) {
      return convertApiItemToPost(newPost, postData.apiName, fieldMapping);
    }
    
    return newPost;
  } catch (error) {
    logger.error('创建文章失败', { error: error.message });
    throw error;
  }
}

/**
 * 更新文章
 * @param {string} postId - 文章ID
 * @param {Object} postData - 更新的文章数据
 * @returns {Promise<Object|null>} 更新后的文章或null
 */
async function updateBlogPost(postId, postData) {
  try {
    // 从 blog_posts 表查找文章
    const post = await getAsync(`
      SELECT id, api_name, name, title, slug, excerpt, description,
        html_content, image, category, published, views,
        created_at, updated_at, custom_fields
      FROM blog_posts
      WHERE id = ?
    `, [postId]);
    
    if (!post) {
      logger.warn('更新文章失败：未找到文章', { postId });
      return null;
    }
    
    // 解析现有的 custom_fields
    let customFields = {};
    try {
      if (post.custom_fields) {
        customFields = JSON.parse(post.custom_fields);
      }
    } catch (e) {
      logger.warn('解析custom_fields失败', { id: postId, error: e.message });
    }
    
    const currentApiName = post.api_name;
    const newApiName = postData.apiName || currentApiName;
    
    // 如果分类改变，需要更新 api_name
    if (newApiName !== currentApiName) {
      // 提取中文名称用于匹配（API的name可能是"中文 英文"格式）
      const extractChineseName = (name) => {
        if (!name) return '';
        const chineseRegex = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]+/g;
        const chineseMatches = name.match(chineseRegex);
        return chineseMatches && chineseMatches.length > 0 
          ? chineseMatches.join('').trim() 
          : name;
      };
      
      const newApiNameChinese = extractChineseName(newApiName);
      
      // 验证新API是否存在（支持中文名称和完整名称匹配）
      let newApi = await getAsync(`
        SELECT id, name FROM custom_apis
        WHERE name = ? AND method = 'GET' AND status = 'active'
      `, [newApiName]);
      
      // 如果精确匹配失败，尝试中文名称匹配
      if (!newApi) {
        const allApis = await allAsync(`
          SELECT id, name FROM custom_apis
          WHERE method = 'GET' AND status = 'active'
        `);
        
        newApi = allApis.find(api => {
          const apiNameChineseOnly = extractChineseName(api.name);
          return apiNameChineseOnly === newApiNameChinese || api.name === newApiName;
        });
      }
      
      if (!newApi) {
        throw new Error(`目标API "${newApiName}" 不存在`);
      }
    }
    
    // 准备更新字段
    const updateFields = [];
    const updateValues = [];
    
    // 基本字段更新
    if (postData.name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(postData.name);
      // name和title保持一致
      updateFields.push('title = ?');
      updateValues.push(postData.name);
    } else if (postData.title !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(postData.title);
      updateFields.push('title = ?');
      updateValues.push(postData.title);
    }
    
    if (postData.slug !== undefined) {
      // 检查slug唯一性
      let finalSlug = postData.slug;
      if (finalSlug) {
        const existing = await getAsync('SELECT id FROM blog_posts WHERE slug = ? AND id != ?', [finalSlug, postId]);
        if (existing) {
          // slug冲突，生成新的
          const baseSlug = finalSlug.split('-').slice(0, -1).join('-') || finalSlug;
          let counter = 1;
          while (existing) {
            finalSlug = `${baseSlug}-${counter}`;
            existing = await getAsync('SELECT id FROM blog_posts WHERE slug = ? AND id != ?', [finalSlug, postId]);
            counter++;
          }
        }
      }
      updateFields.push('slug = ?');
      updateValues.push(finalSlug);
    }
    
    if (postData.excerpt !== undefined) {
      updateFields.push('excerpt = ?');
      updateValues.push(postData.excerpt);
      // excerpt和description保持一致
      updateFields.push('description = ?');
      updateValues.push(postData.excerpt);
    } else if (postData.description !== undefined) {
      updateFields.push('excerpt = ?');
      updateValues.push(postData.description);
      updateFields.push('description = ?');
      updateValues.push(postData.description);
    }
    
    if (postData.htmlContent !== undefined) {
      updateFields.push('html_content = ?');
      updateValues.push(postData.htmlContent);
    }
    
    if (postData.image !== undefined) {
      updateFields.push('image = ?');
      updateValues.push(postData.image);
    }
    
    if (postData.category !== undefined) {
      updateFields.push('category = ?');
      updateValues.push(postData.category);
    }
    
    if (postData.published !== undefined) {
      updateFields.push('published = ?');
      updateValues.push(postData.published ? 1 : 0);
    }
    
    if (postData.views !== undefined) {
      updateFields.push('views = ?');
      updateValues.push(parseInt(postData.views) || 0);
    }
    
    // 更新 api_name（如果分类改变）
    if (newApiName !== currentApiName) {
      updateFields.push('api_name = ?');
      updateValues.push(newApiName);
    }
    
    // 更新 custom_fields
    const excludedFields = ['id', 'name', 'title', 'slug', 'excerpt', 'description', 
      'htmlContent', 'html_content', 'image', 'category', 'apiName', 'published', 'views',
      'createdAt', 'updatedAt', '_specialData'];
    
    let customFieldsUpdated = false;
    for (const key in postData) {
      if (!excludedFields.includes(key) && postData[key] !== undefined) {
        if (postData[key] === null || postData[key] === '') {
          delete customFields[key];
        } else {
          customFields[key] = postData[key];
        }
        customFieldsUpdated = true;
      }
    }
    
    // 处理特殊类别数据
    if (postData._specialData) {
      const isSpecialCategory = (apiName) => {
        if (!apiName) return null;
        const lowerName = apiName.toLowerCase();
        if (lowerName === 'weather' || lowerName.includes('weather')) return 'weather';
        if (lowerName === 'exchange-rate' || lowerName === 'exchangerate' || lowerName.includes('exchange')) return 'exchange-rate';
        if (lowerName === 'translation' || lowerName.includes('translation')) return 'translation';
        return null;
      };
      
      const specialType = isSpecialCategory(newApiName);
      if (specialType) {
        customFields._specialType = specialType;
        customFields._specialData = postData._specialData;
        customFieldsUpdated = true;
      }
    }
    
    if (customFieldsUpdated) {
      updateFields.push('custom_fields = ?');
      updateValues.push(JSON.stringify(customFields));
    }
    
    // 更新时间
    updateFields.push('updated_at = datetime(\'now\', \'localtime\')');
    updateValues.push(postId);
    
    // 执行更新
    if (updateFields.length > 1) { // 至少有updated_at字段
      await runAsync(`
        UPDATE blog_posts 
        SET ${updateFields.join(', ')}
        WHERE id = ?
      `, updateValues);
    }
    
    // 清除缓存
    clearPostsCache();
    
    // 获取更新后的文章
    const updatedPost = await getAsync(`
      SELECT id, api_name, name, title, slug, excerpt, description,
        html_content, image, category, published, views,
        created_at, updated_at, custom_fields
      FROM blog_posts
      WHERE id = ?
    `, [postId]);
    
    if (!updatedPost) {
      return null;
    }
    
    // 解析 custom_fields
    let updatedCustomFields = {};
    try {
      if (updatedPost.custom_fields) {
        updatedCustomFields = JSON.parse(updatedPost.custom_fields);
      }
    } catch (e) {
      // 忽略解析错误
    }
    
    // 构建返回对象
    const result = {
      id: updatedPost.id,
      name: updatedPost.name,
      title: updatedPost.title || updatedPost.name,
      slug: updatedPost.slug,
      excerpt: updatedPost.excerpt,
      description: updatedPost.description || updatedPost.excerpt,
      htmlContent: updatedPost.html_content,
      image: updatedPost.image,
      category: updatedPost.category,
      _sourceApiName: updatedPost.api_name,
      published: updatedPost.published === 1,
      views: updatedPost.views || 0,
      createdAt: updatedPost.created_at,
      updatedAt: updatedPost.updated_at,
      ...updatedCustomFields
    };
    
    // 获取字段映射配置（如果需要）
    const fieldMapping = await getApiFieldMapping(newApiName);
    if (fieldMapping) {
      return convertApiItemToPost(result, newApiName, fieldMapping);
    }
    
    return result;
  } catch (error) {
    logger.error('更新文章失败', { postId, error: error.message });
    throw error;
  }
}

/**
 * 删除文章
 * @param {string} postId - 文章ID
 * @returns {Promise<boolean>} 是否成功
 */
async function deleteBlogPost(postId) {
  try {
    // 直接从 blog_posts 表删除
    const result = await runAsync('DELETE FROM blog_posts WHERE id = ?', [postId]);
    
    if (result.changes === 0) {
      logger.warn('删除文章失败：未找到文章', { postId });
      return false;
    }
    
    // 清除缓存
    clearPostsCache();
    
    return true;
  } catch (error) {
    logger.error('删除文章失败', { postId, error: error.message });
    throw error;
  }
}

/**
 * 创建分类
 * 在custom_apis表中创建记录，Name作为分类名称，Path作为描述
 * @param {Object} categoryData - 分类数据 {name: 分类名称, path: 分类路径/描述}
 * @returns {Promise<Object>} 创建的分类
 */
async function createBlogCategory(categoryData) {
  try {
    const { name, path, description } = categoryData;
    
    if (!name) {
      throw new Error('分类名称不能为空');
    }
    
    // Path作为描述，如果没有提供path，使用name生成
    const categoryPath = path || `/${name.toLowerCase().replace(/\s+/g, '-')}`;
    
    // 检查是否已存在相同名称的分类
    const existing = await getAsync(
      `SELECT id FROM custom_apis WHERE name = ? AND method = 'GET'`,
      [name]
    );
    
    if (existing) {
      throw new Error('该分类名称已存在');
    }
    
    // 在custom_apis表中创建记录
    // 使用一个简单的响应内容（空数组），因为分类数据直接从表读取
    const result = await runAsync(`
      INSERT INTO custom_apis (name, path, method, requires_token, response_content, description, status)
      VALUES (?, ?, 'GET', 0, ?, ?, 'active')
    `, [
      name,
      categoryPath,
      JSON.stringify({ data: [] }), // 空的响应内容
      description || categoryPath // description字段存储path
    ]);
    
    // 确保 result.id 存在
    if (result.id === undefined || result.id === null) {
      throw new Error('创建分类失败：无法获取新分类的ID');
    }
    
    return {
      id: result.id,
      name: name,
      slug: categoryPath.replace(/^\//, '').replace(/\//g, '-'),
      description: categoryPath,
      postCount: 0,
      createdAt: getCurrentLocalTimeISOString()
    };
  } catch (error) {
    logger.error('创建分类失败', { error: error.message });
    throw error;
  }
}

/**
 * 更新分类
 * @param {number} id - 分类ID（custom_apis表的id）
 * @param {Object} categoryData - 更新的分类数据
 * @returns {Promise<Object|null>} 更新后的分类或null
 */
async function updateBlogCategory(id, categoryData) {
  try {
    // 检查分类是否存在
    const existing = await getAsync(
      `SELECT id, name FROM custom_apis WHERE id = ? AND method = 'GET'`,
      [id]
    );
    
    if (!existing) {
      return null;
    }
    
    const updateFields = [];
    const updateValues = [];
    
    if (categoryData.name !== undefined) {
      // 检查新名称是否与其他分类冲突
      const conflict = await getAsync(
        `SELECT id FROM custom_apis WHERE name = ? AND method = 'GET' AND id != ?`,
        [categoryData.name, id]
      );
      
      if (conflict) {
        throw new Error('该分类名称已被其他分类使用');
      }
      
      updateFields.push('name = ?');
      updateValues.push(categoryData.name);
    }
    
    if (categoryData.path !== undefined) {
      updateFields.push('path = ?');
      updateValues.push(categoryData.path);
      // 同时更新description字段
      updateFields.push('description = ?');
      updateValues.push(categoryData.path);
    } else if (categoryData.description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(categoryData.description);
    }
    
    if (updateFields.length === 0) {
      // 没有要更新的字段
      return await getBlogCategories().then(cats => cats.find(c => c.id === id));
    }
    
    updateFields.push('updated_at = datetime(\'now\', \'localtime\')');
    updateValues.push(id);
    
    await runAsync(
      `UPDATE custom_apis SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );
    
    // 返回更新后的分类
    const updated = await getAsync(
      `SELECT id, name, path, description FROM custom_apis WHERE id = ?`,
      [id]
    );
    
    return {
      id: updated.id,
      name: updated.name,
      slug: updated.path.replace(/^\//, '').replace(/\//g, '-'),
      description: updated.path,
      updatedAt: getCurrentLocalTimeISOString()
    };
  } catch (error) {
    logger.error('更新分类失败', { id, error: error.message });
    throw error;
  }
}

/**
 * 删除分类
 * @param {number} id - 分类ID（custom_apis表的id）
 * @returns {Promise<boolean>} 是否成功
 */
async function deleteBlogCategory(id) {
  try {
    // 检查分类是否存在
    const existing = await getAsync(
      `SELECT id, name FROM custom_apis WHERE id = ? AND method = 'GET'`,
      [id]
    );
    
    if (!existing) {
      return false;
    }
    
    // 检查是否有文章使用此分类
    const posts = await getBlogPosts({ publishedOnly: false });
    const postsUsingCategory = posts.filter(post => post.category === existing.name);
    
    if (postsUsingCategory.length > 0) {
      throw new Error(`无法删除分类：有 ${postsUsingCategory.length} 篇文章正在使用此分类`);
    }
    
    // 删除分类
    await runAsync('DELETE FROM custom_apis WHERE id = ?', [id]);
    
    return true;
  } catch (error) {
    logger.error('删除分类失败', { id, error: error.message });
    throw error;
  }
}

/**
 * 创建评论
 * @param {string} postId - 文章ID
 * @param {Object} commentData - 评论数据
 * @returns {Promise<Object>} 创建的评论
 */
async function createBlogComment(postId, commentData) {
  try {
    const commentsData = await getBlogComments(postId, { approvedOnly: false });
    const allComments = commentsData.comments || [];
    
    // 获取所有评论（包括未审核的）
    const api = await getBlogApi(`/blog/posts/${postId}/comments`);
    let allCommentsList = [];
    if (api && api.response_content && api.response_content.data) {
      allCommentsList = api.response_content.data;
    }
    
    const newComment = {
      id: uuidv4(),
      content: commentData.content,
      authorName: commentData.authorName,
      authorEmail: commentData.authorEmail,
      postId: postId,
      parentId: commentData.parentId || null,
      approved: false, // 默认需要审核
      createdAt: getCurrentLocalTimeISOString(),
      updatedAt: getCurrentLocalTimeISOString()
    };
    
    allCommentsList.push(newComment);
    
    await upsertBlogApi(
      `/blog/posts/${postId}/comments`,
      `文章评论：${postId}`,
      { data: allCommentsList },
      'GET',
      `文章ID ${postId} 的评论列表`
    );
    
    return newComment;
  } catch (error) {
    logger.error('创建评论失败', { postId, error: error.message });
    throw error;
  }
}

/**
 * 审核评论
 * @param {string} commentId - 评论ID
 * @param {boolean} approved - 是否审核通过
 * @returns {Promise<boolean>} 是否成功
 */
async function approveBlogComment(commentId, approved = true) {
  try {
    // 需要找到评论所属的文章
    const posts = await getBlogPosts({ publishedOnly: false });
    
    for (const post of posts) {
      const commentsData = await getBlogComments(post.id, { approvedOnly: false });
      const api = await getBlogApi(`/blog/posts/${post.id}/comments`);
      
      if (api && api.response_content && api.response_content.data) {
        const commentIndex = api.response_content.data.findIndex(c => c.id === commentId);
        
        if (commentIndex !== -1) {
          api.response_content.data[commentIndex].approved = approved;
          api.response_content.data[commentIndex].updatedAt = getCurrentLocalTimeISOString();
          
          await upsertBlogApi(
            `/blog/posts/${post.id}/comments`,
            `文章评论：${post.id}`,
            api.response_content,
            'GET',
            `文章ID ${post.id} 的评论列表`
          );
          
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    logger.error('审核评论失败', { commentId, error: error.message });
    return false;
  }
}

/**
 * 删除评论
 * @param {string} commentId - 评论ID
 * @returns {Promise<boolean>} 是否成功
 */
async function deleteBlogComment(commentId) {
  try {
    const posts = await getBlogPosts({ publishedOnly: false });
    
    for (const post of posts) {
      const api = await getBlogApi(`/blog/posts/${post.id}/comments`);
      
      if (api && api.response_content && api.response_content.data) {
        const updatedComments = api.response_content.data.filter(c => c.id !== commentId);
        
        if (updatedComments.length !== api.response_content.data.length) {
          await upsertBlogApi(
            `/blog/posts/${post.id}/comments`,
            `文章评论：${post.id}`,
            { data: updatedComments },
            'GET',
            `文章ID ${post.id} 的评论列表`
          );
          
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    logger.error('删除评论失败', { commentId, error: error.message });
    return false;
  }
}

module.exports = {
  getAllApiFieldMappings,
  getBlogPosts,
  getBlogPost,
  getBlogCategories,
  getBlogComments,
  incrementPostViews,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  createBlogCategory,
  updateBlogCategory,
  deleteBlogCategory,
  createBlogComment,
  approveBlogComment,
  deleteBlogComment,
  upsertBlogApi,
  getApiFieldMapping,
  clearPostsCache,
  convertApiItemToPost,
  findPostSourceApi,
  cleanPostForPublic
};
