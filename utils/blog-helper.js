const { getAsync, allAsync, runAsync } = require('../db/database');
const { logger } = require('./logger');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// 获取当前本地时间字符串（格式：YYYY-MM-DD HH:mm:ss）
// 使用 Node.js 的时区设置（通过 TZ 环境变量，如 Africa/Cairo）
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
  // 优先使用原始ID，确保不会改变已存在的ID
  const postId = isWeatherObject 
    ? `weather-${apiName}` 
    : (item.id || item[mapping.id] || uuidv4()); // 优先使用item.id，避免字段映射改变ID
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
 * 提取HTML内容中的所有图片和视频URL
 * @param {string} htmlContent - HTML内容
 * @returns {Array<string>} 图片和视频URL数组
 */
function extractMediaUrls(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return [];
  }
  
  const urls = [];
  
  // 提取img标签的src属性
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = imgRegex.exec(htmlContent)) !== null) {
    urls.push(match[1]);
  }
  
  // 提取video标签的src属性
  const videoSrcRegex = /<video[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = videoSrcRegex.exec(htmlContent)) !== null) {
    urls.push(match[1]);
  }
  
  // 提取source标签的src属性（在video标签内）
  const sourceRegex = /<source[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = sourceRegex.exec(htmlContent)) !== null) {
    urls.push(match[1]);
  }
  
  // 提取video标签的poster属性（封面图片）
  const posterRegex = /<video[^>]+poster=["']([^"']+)["'][^>]*>/gi;
  while ((match = posterRegex.exec(htmlContent)) !== null) {
    urls.push(match[1]);
  }
  
  return urls;
}

/**
 * 将URL转换为本地文件路径
 * @param {string} url - 文件URL
 * @returns {string|null} 本地文件路径，如果不是本地文件则返回null
 */
function urlToLocalPath(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }
  
  // 支持的数据目录路径
  const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
  
  // 移除协议和域名，只保留路径部分
  let filePath = url;
  
  // 如果是完整URL，提取路径部分
  try {
    const urlObj = new URL(url);
    filePath = urlObj.pathname;
  } catch (e) {
    // 如果不是完整URL，直接使用
  }
  
  // 移除开头的斜杠
  if (filePath.startsWith('/')) {
    filePath = filePath.substring(1);
  }
  
  // 检查是否是uploads目录下的文件
  if (filePath.startsWith('uploads/')) {
    return path.join(DATA_DIR, filePath);
  }
  
  // 如果路径包含uploads，尝试提取
  const uploadsMatch = filePath.match(/uploads\/.+$/);
  if (uploadsMatch) {
    return path.join(DATA_DIR, uploadsMatch[0]);
  }
  
  return null;
}

/**
 * 删除文件（如果存在）
 * @param {string} filePath - 文件路径
 * @returns {boolean} 是否成功删除
 */
function deleteFileIfExists(filePath) {
  if (!filePath) {
    logger.debug('删除文件失败：文件路径为空');
    return false;
  }
  
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info('删除文件成功', { filePath });
      return true;
    } else {
      logger.debug('文件不存在，跳过删除', { filePath });
      return false;
    }
  } catch (error) {
    logger.warn('删除文件失败', { filePath, error: error.message, stack: error.stack });
    return false;
  }
}

/**
 * 清理文章关联的文件（图片和视频）
 * @param {Object} post - 文章对象
 * @returns {number} 删除的文件数量
 */
function cleanupPostFiles(post) {
  if (!post) {
    return 0;
  }
  
  let deletedCount = 0;
  
  // 删除文章封面图片（image字段）
  // 支持多种字段名格式：image（数据库字段名）或 image（转换后的字段名）
  const coverImage = post.image || post.image_url || post.coverImage || post.cover_image;
  logger.debug('检查封面图片', { 
    postId: post.id, 
    hasImage: !!post.image, 
    coverImage, 
    coverImageType: typeof coverImage,
    coverImageLength: coverImage ? coverImage.length : 0
  });
  
  if (coverImage && typeof coverImage === 'string' && coverImage.trim() !== '') {
    const imagePath = urlToLocalPath(coverImage);
    logger.debug('封面图片路径转换', { coverImage, imagePath, postId: post.id });
    
    if (imagePath) {
      if (deleteFileIfExists(imagePath)) {
        deletedCount++;
        logger.info('删除文章封面图片成功', { imagePath, postId: post.id, imageUrl: coverImage });
      } else {
        logger.warn('删除文章封面图片失败', { imagePath, postId: post.id, imageUrl: coverImage });
      }
    } else {
      logger.info('封面图片不是本地文件，跳过删除', { imageUrl: coverImage, postId: post.id });
    }
  } else {
    logger.debug('文章没有封面图片或封面图片为空', { postId: post.id, coverImage });
  }
  
  // 删除HTML内容中的图片和视频
  const htmlContent = post.htmlContent || post.html_content || '';
  if (htmlContent && typeof htmlContent === 'string' && htmlContent.trim() !== '') {
    const mediaUrls = extractMediaUrls(htmlContent);
    
    for (const url of mediaUrls) {
      const mediaPath = urlToLocalPath(url);
      if (mediaPath && deleteFileIfExists(mediaPath)) {
        deletedCount++;
      }
    }
  }
  
  return deletedCount;
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
  
  // 确保 image 字段被保留（博客主页需要显示图片）
  // image 字段不会被删除，即使为空也会保留
  if (cleaned.image === undefined) {
    logger.debug('文章缺少image字段', { postId: cleaned.id, postName: cleaned.name });
  }
  
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
      logger.debug('添加已发布筛选条件', { publishedOnly: options.publishedOnly });
    }
    
    // 分类筛选（api_name字段）
    // 支持单个类别或多个类别（数组或逗号分隔的字符串）
    // 支持精确匹配和中文名称匹配（兼容不同格式的api_name）
    if (options.category) {
      // 提取中文名称用于匹配（兼容不同格式的api_name）
      const extractChineseName = (name) => {
        if (!name) return '';
        const chineseRegex = /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]+/g;
        const chineseMatches = name.match(chineseRegex);
        return chineseMatches && chineseMatches.length > 0 
          ? chineseMatches.join('').trim() 
          : name;
      };
      
      // 处理多个类别：支持数组或逗号分隔的字符串
      let categories = [];
      if (Array.isArray(options.category)) {
        categories = options.category;
      } else if (typeof options.category === 'string') {
        // 支持逗号分隔的多个类别：category=类别1,类别2,类别3
        categories = options.category.split(',').map(c => c.trim()).filter(c => c);
      } else {
        categories = [options.category];
      }
      
      logger.debug('分类筛选', { 
        originalCategory: options.category, 
        categoriesCount: categories.length,
        categories: categories 
      });
      
      // 如果只有一个类别，使用原来的逻辑（兼容性）
      if (categories.length === 1) {
        const category = categories[0];
        const categoryChinese = extractChineseName(category);
        
        whereConditions.push(`(
          api_name = ? OR 
          category = ? OR 
          api_name = ? OR 
          category = ? OR
          api_name LIKE ? OR
          category LIKE ?
        )`);
        queryParams.push(
          category,           // 精确匹配 api_name
          category,           // 精确匹配 category
          categoryChinese,   // 中文名称匹配 api_name
          categoryChinese,   // 中文名称匹配 category
          `%${categoryChinese}%`,    // LIKE 匹配 api_name（包含中文名称）
          `%${categoryChinese}%`     // LIKE 匹配 category（包含中文名称）
        );
      } else if (categories.length > 1) {
        // 多个类别：优化查询逻辑
        // 收集所有需要匹配的值（去重）
        const exactMatches = new Set();
        const likePatterns = new Set();
        
        categories.forEach(category => {
          const categoryChinese = extractChineseName(category);
          // 精确匹配值
          exactMatches.add(category);
          if (categoryChinese !== category) {
            exactMatches.add(categoryChinese);
          }
          // LIKE匹配模式
          likePatterns.add(`%${categoryChinese}%`);
        });
        
        const exactMatchArray = Array.from(exactMatches);
        const likePatternArray = Array.from(likePatterns);
        
        // 构建查询条件
        const categoryConditions = [];
        
        // 精确匹配条件（使用IN子句，更高效）
        if (exactMatchArray.length > 0) {
          const placeholders = exactMatchArray.map(() => '?').join(',');
          categoryConditions.push(`api_name IN (${placeholders})`);
          categoryConditions.push(`category IN (${placeholders})`);
          queryParams.push(...exactMatchArray, ...exactMatchArray);
        }
        
        // LIKE匹配条件
        likePatternArray.forEach(pattern => {
          categoryConditions.push('api_name LIKE ?');
          categoryConditions.push('category LIKE ?');
          queryParams.push(pattern, pattern);
        });
        
        // 组合所有条件
        if (categoryConditions.length > 0) {
          whereConditions.push(`(${categoryConditions.join(' OR ')})`);
        }
        
        logger.debug('多类别筛选条件', { 
          categoriesCount: categories.length,
          exactMatchesCount: exactMatchArray.length,
          likePatternsCount: likePatternArray.length,
          totalConditions: categoryConditions.length,
          categories: categories.slice(0, 5) // 只记录前5个类别
        });
      }
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
    
    // 记录查询信息用于调试
    logger.info('文章列表查询', {
      whereClause,
      queryParamsCount: queryParams.length,
      queryParams: queryParams.slice(0, 20), // 记录前20个参数
      hasCategory: !!options.category,
      category: options.category,
      publishedOnly: options.publishedOnly,
      hasSearch: !!options.search
    });
    
    // 从 blog_posts 表查询
    // 排序规则：按修改时间降序，其次按创建时间降序
    const rows = await allAsync(`
      SELECT 
        id, api_name, name, title, slug, excerpt, description,
        html_content, image, category, published, views,
        COALESCE(likes_count, 0) as likes_count,
        COALESCE(favorites_count, 0) as favorites_count,
        COALESCE(comments_count, 0) as comments_count,
        created_at, updated_at, custom_fields
      FROM blog_posts
      ${whereClause}
      ORDER BY updated_at DESC, created_at DESC
    `, queryParams);
    
    logger.info('文章列表查询结果', {
      rowsCount: rows ? rows.length : 0,
      hasCategory: !!options.category,
      category: options.category,
      publishedOnly: options.publishedOnly,
      sampleApiNames: rows && rows.length > 0 ? rows.slice(0, 5).map(r => ({ id: r.id, api_name: r.api_name, category: r.category, published: r.published })) : []
    });
    
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
        likesCount: row.likes_count || 0,
        favoritesCount: row.favorites_count || 0,
        commentsCount: row.comments_count || 0,
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
      
      // 小程序用户和设备信息字段
      if (customFields.nickname !== undefined) post.nickname = customFields.nickname;
      if (customFields.deviceModel !== undefined) post.deviceModel = customFields.deviceModel;
      if (customFields.deviceId !== undefined) post.deviceId = customFields.deviceId;
      if (customFields.deviceIp !== undefined) post.deviceIp = customFields.deviceIp;
      
      // 添加其他自定义字段
      for (const key in customFields) {
        if (!['price', 'rooms', 'area', 'phone', 'address', 'latitude', 'longitude', 
              'nickname', 'deviceModel', 'deviceId', 'deviceIp'].includes(key)) {
          post[key] = customFields[key];
        }
      }
      
      // 应用字段映射（如果需要）
      if (fieldMapping) {
        return convertApiItemToPost(post, row.api_name, fieldMapping);
      }
      
      return post;
    });
    
    // 主页场景（没有分类筛选）：过滤掉空内容的文章和特殊分类的文章
    // 分类页场景（有分类筛选）：保留所有文章，包括空内容的
    // 管理后台：始终包含所有文章，包括空内容的
    let filteredPosts = allPosts;
    
    // 如果明确指定 includeEmptyContent 为 true，或者有分类筛选，则不过滤空内容和特殊分类
    const shouldIncludeEmpty = options.includeEmptyContent === true || options.category;
    
    if (!shouldIncludeEmpty) {
      // 主页场景：过滤掉空内容的文章和特殊分类的文章
      // 特殊分类：翻译卡片、汇率转换、天气路况（这些分类在主页不显示，但点击分类时可以显示）
      const excludedCategories = ['汇率转换', '翻译卡片', '翻译', '天气', '天气路况', 'exchange-rate', 'translation', 'weather'];
      
      filteredPosts = allPosts.filter(post => {
        // 过滤空内容的文章
        const hasHtmlContent = post.htmlContent && post.htmlContent.trim() !== '';
        const hasExcerpt = post.excerpt && post.excerpt.trim() !== '';
        const hasDescription = post.description && post.description.trim() !== '';
        const hasContent = hasHtmlContent || hasExcerpt || hasDescription;
        
        if (!hasContent) {
          return false;
        }
        
        // 过滤特殊分类的文章（只在主页场景过滤，分类列表需要显示这些分类）
        const apiName = post._sourceApiName || post.category || '';
        const apiNameLower = apiName.toLowerCase();
        
        const isExcluded = excludedCategories.some(excluded => {
          if (apiName === excluded) return true;
          if (apiNameLower.includes(excluded.toLowerCase())) return true;
          // 特殊匹配规则
          if (excluded === '汇率转换' && (apiName.includes('汇率') || apiName.includes('exchange'))) return true;
          if ((excluded === '翻译' || excluded === '翻译卡片') && (apiName.includes('翻译') || apiName.includes('translation'))) return true;
          if ((excluded === '天气' || excluded === '天气路况') && (apiName.includes('天气') || apiName.includes('weather'))) return true;
          return false;
        });
        
        return !isExcluded;
      });
    }
    // 如果有分类筛选，或者明确指定 includeEmptyContent，不过滤空内容和特殊分类，显示所有文章
    
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
    // 优先直接通过ID或slug查询数据库，确保获取到最新创建的文章
    // 这样可以避免缓存问题，特别是对于刚创建的文章
    logger.debug('查询文章', { slug, timestamp: new Date().toISOString() });
    const row = await getAsync(`
      SELECT 
        id, api_name, name, title, slug, excerpt, description,
        html_content, image, category, published, views,
        COALESCE(likes_count, 0) as likes_count,
        COALESCE(favorites_count, 0) as favorites_count,
        COALESCE(comments_count, 0) as comments_count,
        created_at, updated_at, custom_fields
      FROM blog_posts
      WHERE id = ? OR slug = ?
      LIMIT 1
    `, [slug, slug]);
    
    if (!row) {
      logger.warn('数据库查询未找到文章', { slug, timestamp: new Date().toISOString() });
      return null;
    }
    
    logger.debug('数据库查询找到文章', { id: row.id, name: row.name, apiName: row.api_name });
    
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
    const fieldMapping = await getApiFieldMapping(row.api_name);
    
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
      likesCount: row.likes_count || 0,
      favoritesCount: row.favorites_count || 0,
      commentsCount: row.comments_count || 0,
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
    
    // 小程序用户和设备信息字段
    if (customFields.nickname !== undefined) post.nickname = customFields.nickname;
    if (customFields.deviceModel !== undefined) post.deviceModel = customFields.deviceModel;
    if (customFields.deviceId !== undefined) post.deviceId = customFields.deviceId;
    if (customFields.deviceIp !== undefined) post.deviceIp = customFields.deviceIp;
    
    // 添加其他自定义字段
    for (const key in customFields) {
      if (!['price', 'rooms', 'area', 'phone', 'address', 'latitude', 'longitude', 
            'nickname', 'deviceModel', 'deviceId', 'deviceIp'].includes(key)) {
        post[key] = customFields[key];
      }
    }
    
    // 应用字段映射（如果需要）
    if (fieldMapping) {
      return convertApiItemToPost(post, row.api_name, fieldMapping);
    }
    
    return post;
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
    const { allAsync } = require('../db/database');
    
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
    
    // 直接从数据库查询所有分类（包括特殊分类），而不是从过滤后的文章列表提取
    // 这样可以确保分类栏显示所有分类，即使主页不显示这些分类的文章
    const whereClause = includeUnpublished ? '' : 'WHERE published = 1';
    const rows = await allAsync(`
      SELECT DISTINCT 
        api_name, 
        category,
        COUNT(*) as post_count,
        MAX(created_at) as latest_post_date
      FROM blog_posts
      ${whereClause}
      GROUP BY api_name, category
      ORDER BY api_name
    `);
    
    // 统计每个分类的文章数
    const categoryMap = new Map(); // 使用Map存储分类信息，key为分类名称
    
    rows.forEach(row => {
      // 使用 api_name 或 category 作为分类名称
      const apiName = row.api_name || row.category || '';
      if (apiName) {
        // 提取中文名称（统一使用中文名称作为分类标识）
        const chineseApiName = extractChineseName(apiName);
        const categoryName = chineseApiName || apiName;
        
        // 如果该分类已存在，累加文章数；否则创建新分类
        if (categoryMap.has(categoryName)) {
          const category = categoryMap.get(categoryName);
          category.postCount += row.post_count || 0;
          // 更新最新文章的创建时间（用于排序）
          if (row.latest_post_date && (!category.latestPostDate || row.latest_post_date > category.latestPostDate)) {
            category.latestPostDate = row.latest_post_date;
          }
        } else {
          // 创建新分类
          categoryMap.set(categoryName, {
            name: categoryName,
            slug: categoryName.toLowerCase().replace(/\s+/g, '-').replace(/[^\u4e00-\u9fa5a-z0-9-]/g, ''),
            description: categoryName,
            postCount: row.post_count || 0,
            latestPostDate: row.latest_post_date || null
          });
        }
      }
    });
    
    // 转换为数组并按名称排序
    const categories = Array.from(categoryMap.values()).sort((a, b) => {
      // 按分类名称排序
      return a.name.localeCompare(b.name, 'zh-CN');
    });
    
    // 为每个分类添加id（使用索引+1作为临时ID）
    categories.forEach((cat, index) => {
      cat.id = index + 1;
    });
    
    logger.info('分类文章数统计（从数据库直接查询）', {
      包含未发布: includeUnpublished,
      总分类数: categories.length,
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
    const { allAsync } = require('../db/database');
    
    logger.debug('getBlogComments 开始', { postId, options });
    
    // 构建查询条件（包含点赞数）
    let query = `
      SELECT 
        c.*,
        COALESCE(c.likes_count, 0) as likes_count
      FROM blog_comments c
      WHERE c.post_id = ?
    `;
    const params = [postId];
    
    // 默认返回所有评论（无需审核）
    // 如果明确指定 approvedOnly 为 true，则只返回已审核的评论
    if (options.approvedOnly === true) {
      query += ' AND c.approved = 1';
    }
    
    // 按更新时间倒序排序（有新回复或点赞的评论会排到前面）
    query += ' ORDER BY c.updated_at DESC, c.created_at DESC';
    
    logger.debug('getBlogComments 查询SQL', { query, params });
    
    // 获取所有评论
    const allComments = await allAsync(query, params);
    
    logger.debug('getBlogComments 查询结果', { 
      postId, 
      commentsCount: allComments ? allComments.length : 0,
      comments: allComments ? allComments.map(c => ({ id: c.id, content: c.content?.substring(0, 20) })) : []
    });
    
    // 转换格式以保持兼容性
    const comments = (allComments || []).map(comment => ({
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
      updatedAt: comment.updated_at
    }));
    
    // 计算总数（按平铺结构，包括所有评论和回复）
    const total = comments.length;
    
    // 分页计算（按平铺结构）
    const page = options.page || 1;
    const pageSize = options.pageSize || 10;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    
    // 如果 options.flat 为 true，返回平铺结构
    if (options.flat === true) {
      const paginatedComments = comments.slice(startIndex, endIndex);
      
      const result = {
        comments: paginatedComments,
        total,
        totalPages,
        currentPage: page
      };
      
      logger.debug('getBlogComments 返回结果（平铺）', { 
        postId, 
        total, 
        currentPage: page,
        pageSize,
        paginatedCount: paginatedComments.length
      });
      
      return result;
    }
    
    // 否则返回树形结构
    // 先对当前页的评论进行分页（按平铺结构）
    const paginatedComments = comments.slice(startIndex, endIndex);
    
    // 然后组织成树形结构
    // 为了正确组织层级关系，需要包含所有相关的评论（当前页的评论及其所有父评论链）
    const commentMap = new Map();
    const rootComments = [];
    const includedCommentIds = new Set();
    
    // 第一遍：收集当前页的评论ID
    paginatedComments.forEach(comment => {
      includedCommentIds.add(comment.id);
    });
    
    // 第二遍：递归查找所有父评论（包括不在当前页的），直到找到根评论
    const allRelatedComments = [...paginatedComments];
    const findAndIncludeParents = (commentId) => {
      const comment = comments.find(c => c.id === commentId);
      if (!comment) return;
      
      if (comment.parentId) {
        const parentComment = comments.find(c => c.id === comment.parentId);
        if (parentComment && !includedCommentIds.has(parentComment.id)) {
          // 父评论不在当前页，但需要包含它来组织层级关系
          allRelatedComments.push(parentComment);
          includedCommentIds.add(parentComment.id);
          // 递归查找父评论的父评论
          findAndIncludeParents(parentComment.id);
        }
      }
    };
    
    paginatedComments.forEach(comment => {
      if (comment.parentId) {
        findAndIncludeParents(comment.id);
      }
    });
    
    // 第三遍：创建评论映射（包含所有相关评论）
    allRelatedComments.forEach(comment => {
      commentMap.set(comment.id, { ...comment, replies: [] });
    });
    
    // 第四遍：组织层级关系
    allRelatedComments.forEach(comment => {
      const commentNode = commentMap.get(comment.id);
      if (comment.parentId && commentMap.has(comment.parentId)) {
        // 有父评论且父评论在映射中，添加到父评论的replies中
        const parentNode = commentMap.get(comment.parentId);
        parentNode.replies.push(commentNode);
      } else if (!comment.parentId) {
        // 没有父评论，是根评论
        rootComments.push(commentNode);
      }
      // 如果父评论不在映射中（理论上不应该发生），忽略该评论
    });
    
    // 第五遍：只返回包含当前页评论的根评论（如果根评论的所有子评论都不在当前页，则不返回该根评论）
    const currentPageRootComments = rootComments.filter(rootComment => {
      // 检查根评论本身是否在当前页
      if (paginatedComments.some(c => c.id === rootComment.id)) {
        return true;
      }
      // 检查根评论的子树中是否有当前页的评论
      const hasCurrentPageComment = (node) => {
        if (paginatedComments.some(c => c.id === node.id)) {
          return true;
        }
        if (node.replies && node.replies.length > 0) {
          return node.replies.some(reply => hasCurrentPageComment(reply));
        }
        return false;
      };
      return hasCurrentPageComment(rootComment);
    });
    
    // 对根评论和回复按更新时间排序（有新回复或点赞的会排到前面）
    currentPageRootComments.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt);
      const dateB = new Date(b.updatedAt || b.createdAt);
      return dateB - dateA; // 按更新时间倒序
    });
    currentPageRootComments.forEach(comment => {
      if (comment.replies && comment.replies.length > 0) {
        comment.replies.sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt);
          const dateB = new Date(b.updatedAt || b.createdAt);
          return dateB - dateA; // 按更新时间倒序
        });
      }
    });
    
    // 计算根评论数（所有评论中的根评论数，不只是当前页）
    const allRootComments = comments.filter(c => !c.parentId);
    
    const result = {
      comments: currentPageRootComments,
      total: total, // 总评论数（包括回复，按平铺计算）
      rootCount: allRootComments.length, // 所有根评论数
      totalPages: totalPages, // 总页数（按平铺计算）
      currentPage: page
    };
    
    logger.debug('getBlogComments 返回结果（树形+分页）', { 
      postId, 
      total: total,
      rootCount: allRootComments.length,
      currentPage: page,
      totalPages: totalPages,
      currentPageRootCount: rootComments.length,
      hasReplies: rootComments.some(c => c.replies && c.replies.length > 0)
    });
    
    return result;
  } catch (error) {
    logger.error('获取评论失败', { postId, error: error.message, stack: error.stack });
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
    
    // 直接从 blog_posts 表更新阅读量（不更新 updated_at，因为查看不应该改变修改时间）
    await runAsync(
      `UPDATE blog_posts 
       SET views = views + 1
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
    // 确保htmlContent被正确获取（即使是空字符串也要保留）
    const htmlContent = postData.htmlContent !== undefined && postData.htmlContent !== null 
                      ? String(postData.htmlContent) 
                      : '';
    
    logger.debug('createBlogPost处理htmlContent', {
      provided: postData.htmlContent !== undefined,
      length: htmlContent.length,
      isEmpty: htmlContent === '',
      preview: htmlContent.substring(0, 100)
    });
    
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
    
    // 小程序用户和设备信息字段
    if (postData.nickname !== undefined) customFields.nickname = postData.nickname;
    if (postData.deviceModel !== undefined) customFields.deviceModel = postData.deviceModel;
    if (postData.deviceId !== undefined) customFields.deviceId = postData.deviceId;
    if (postData.deviceIp !== undefined) customFields.deviceIp = postData.deviceIp;
    
    // 处理特殊类别数据（天气、汇率、翻译等）
    const isSpecialCategory = (apiName) => {
      if (!apiName) return null;
      const rawName = String(apiName);
      const lowerName = rawName.toLowerCase();
      if (lowerName === 'weather' || lowerName.includes('weather') || rawName.includes('天气')) return 'weather';
      if (lowerName === 'exchange-rate' || lowerName === 'exchangerate' || lowerName.includes('exchange') || rawName.includes('汇率')) return 'exchange-rate';
      if (lowerName === 'translation' || lowerName.includes('translation') || rawName.includes('翻译')) return 'translation';
      return null;
    };

    const specialType = postData._specialType || isSpecialCategory(postData.apiName);
    if (specialType && postData._specialData) {
      // 将特殊数据存储到 custom_fields
      customFields._specialType = specialType;
      customFields._specialData = postData._specialData;
    }
    
    // 添加其他未映射的字段到 custom_fields
    const excludedFields = ['id', 'name', 'title', 'slug', 'excerpt', 'description', 
      'htmlContent', 'image', 'category', 'apiName', 'published', 'views',
      'price', 'rooms', 'area', 'phone', 'address', 'latitude', 'longitude',
      'nickname', 'deviceModel', 'deviceId', 'deviceIp', // 小程序字段也存储到custom_fields
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
      const mappedPost = convertApiItemToPost(newPost, postData.apiName, fieldMapping);
      // 确保返回的文章ID与数据库中的ID一致（字段映射不应该改变ID）
      if (mappedPost.id !== postId) {
        logger.warn('字段映射改变了文章ID，恢复原始ID', { 
          originalId: postId, 
          mappedId: mappedPost.id,
          apiName: postData.apiName 
        });
        mappedPost.id = postId; // 恢复原始ID
      }
      return mappedPost;
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
    
    // 记录需要清理的旧文件
    const filesToCleanup = [];
    
    const protectedUrls = new Set();
    const currentImageUrl = postData.image !== undefined ? postData.image : post.image;
    if (currentImageUrl) {
      protectedUrls.add(currentImageUrl);
    }
    
    const normalizeCarouselImages = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value.filter(Boolean);
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return [];
        try {
          const parsed = JSON.parse(trimmed);
          return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch (e) {
          return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
        }
      }
      return [];
    };
    
    const addProtectedCarouselUrls = (value) => {
      const urls = normalizeCarouselImages(value);
      for (const url of urls) {
        protectedUrls.add(url);
      }
    };
    
    const resolveCarouselValue = (key) => {
      if (Object.prototype.hasOwnProperty.call(postData, key)) {
        return postData[key];
      }
      if (customFields && Object.prototype.hasOwnProperty.call(customFields, key)) {
        return customFields[key];
      }
      return undefined;
    };
    
    const carouselFieldKeys = ['carouselImages', 'imageList', 'images'];
    for (const key of carouselFieldKeys) {
      const value = resolveCarouselValue(key);
      if (value !== undefined) {
        addProtectedCarouselUrls(value);
      }
    }

    let newHtmlMediaUrls = null;

    if (postData.htmlContent !== undefined) {
      // 如果HTML内容改变，需要清理旧内容中的文件
      const oldHtmlContent = post.html_content || '';
      const newHtmlContent = postData.htmlContent || '';
      
      if (oldHtmlContent !== newHtmlContent) {
        // 提取旧HTML内容中的所有媒体URL
        const oldMediaUrls = extractMediaUrls(oldHtmlContent);
        // 提取新HTML内容中的所有媒体URL
        newHtmlMediaUrls = extractMediaUrls(newHtmlContent);
        
        // 找出不再使用的文件
        for (const oldUrl of oldMediaUrls) {
          if (protectedUrls.has(oldUrl)) {
            continue;
          }
          if (!newHtmlMediaUrls.includes(oldUrl)) {
            const oldPath = urlToLocalPath(oldUrl);
            if (oldPath) {
              filesToCleanup.push(oldPath);
            }
          }
        }
      }
      
      updateFields.push('html_content = ?');
      updateValues.push(postData.htmlContent);
    }
    
    if (postData.image !== undefined) {
      // 如果图片改变，需要清理旧图片
      if (post.image && post.image !== postData.image) {
        const oldImageUrl = post.image;
        if (newHtmlMediaUrls && newHtmlMediaUrls.includes(oldImageUrl)) {
          // 旧封面仍在内容中引用，跳过清理
        } else {
          const oldImagePath = urlToLocalPath(oldImageUrl);
          if (oldImagePath) {
            filesToCleanup.push(oldImagePath);
          }
        }
      }
      
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
      'createdAt', 'updatedAt', '_specialData', '_specialType'];
    
    // 标准custom_fields字段列表（这些字段需要特殊处理）
    const standardCustomFields = ['price', 'rooms', 'area', 'phone', 'address', 'latitude', 'longitude',
                                   'nickname', 'deviceModel', 'deviceId', 'deviceIp'];
    
    let customFieldsUpdated = false;
    
    // 先处理标准custom_fields字段（包括小程序字段）
    for (const key of standardCustomFields) {
      if (postData[key] !== undefined) {
        if (postData[key] === null || postData[key] === '') {
          delete customFields[key];
          logger.debug('删除custom_fields字段', { postId, key });
        } else {
          customFields[key] = postData[key];
          logger.debug('更新custom_fields字段', { postId, key, value: postData[key] });
        }
        customFieldsUpdated = true;
      }
    }
    
    // 然后处理其他自定义字段
    for (const key in postData) {
      if (!excludedFields.includes(key) && !standardCustomFields.includes(key) && postData[key] !== undefined) {
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
        const rawName = String(apiName);
        const lowerName = rawName.toLowerCase();
        if (lowerName === 'weather' || lowerName.includes('weather') || rawName.includes('天气')) return 'weather';
        if (lowerName === 'exchange-rate' || lowerName === 'exchangerate' || lowerName.includes('exchange') || rawName.includes('汇率')) return 'exchange-rate';
        if (lowerName === 'translation' || lowerName.includes('translation') || rawName.includes('翻译')) return 'translation';
        return null;
      };

      const specialType = postData._specialType || isSpecialCategory(newApiName);
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
    
    // 清理不再使用的文件
    if (filesToCleanup.length > 0) {
      let cleanedCount = 0;
      for (const filePath of filesToCleanup) {
        if (deleteFileIfExists(filePath)) {
          cleanedCount++;
        }
      }
      if (cleanedCount > 0) {
        logger.info('清理文章更新后的旧文件', { postId, cleanedCount, totalFiles: filesToCleanup.length });
      }
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
    // 先获取文章信息，以便删除关联的文件
    const post = await getAsync(`
      SELECT id, image, html_content
      FROM blog_posts
      WHERE id = ?
    `, [postId]);
    
    if (!post) {
      logger.warn('删除文章失败：未找到文章', { postId });
      return false;
    }
    
    // 记录文章信息，用于调试
    logger.info('准备删除文章及其关联文件', { 
      postId, 
      hasImage: !!post.image, 
      imageUrl: post.image,
      hasHtmlContent: !!post.html_content 
    });
    
    // 删除关联的文件（图片和视频）
    const deletedFilesCount = cleanupPostFiles(post);
    logger.info('删除文章关联文件完成', { postId, deletedFilesCount, imageUrl: post.image });
    
    // 从 blog_posts 表删除
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
    const { runAsync, getAsync } = require('../db/database');
    
    // 检查文章是否存在
    const post = await getAsync('SELECT id FROM blog_posts WHERE id = ?', [postId]);
    if (!post) {
      throw new Error('文章不存在');
    }
    
    // 检查评论层级限制（最多2级）
    if (commentData.parentId) {
      // 获取父评论
      const parentComment = await getAsync(
        'SELECT id, parent_id FROM blog_comments WHERE id = ?',
        [commentData.parentId]
      );
      
      if (!parentComment) {
        throw new Error('父评论不存在');
      }
      
      // 检查父评论的层级
      let level = 1; // 父评论是第1级
      if (parentComment.parent_id) {
        // 父评论也有父评论，说明父评论是第2级，不能再回复
        level = 2;
      }
      
      if (level >= 2) {
        throw new Error('评论最多支持2级，无法继续回复');
      }
    }
    
    // 获取用户手机号（如果已登录）
    let userPhone = null;
    let userId = null;
    
    // 尝试从session或token获取用户信息
    if (commentData.userPhone) {
      userPhone = commentData.userPhone;
    }
    if (commentData.userId) {
      userId = commentData.userId;
    }
    
    // 创建评论
    const commentId = uuidv4();
    // 使用 Node.js 的时间（已通过 TZ 环境变量设置为 Africa/Cairo）
    // 格式化为 'YYYY-MM-DD HH:MM:SS' 格式，与数据库格式一致
    const now = getCurrentLocalTimeString();
    
    await runAsync(
      `INSERT INTO blog_comments 
       (id, post_id, content, author_name, author_email, author_phone, user_id, parent_id, approved, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        commentId,
        postId,
        commentData.content,
        commentData.authorName,
        commentData.authorEmail || null,
        userPhone,
        userId,
        commentData.parentId || null,
        1, // 默认已审核通过（无需审核）
        now,
        now
      ]
    );
    
    // 如果有父评论，更新父评论的 updated_at 时间（使其排序到前面）
    if (commentData.parentId) {
      await runAsync(
        'UPDATE blog_comments SET updated_at = ? WHERE id = ?',
        [now, commentData.parentId]
      );
      
      // 如果父评论还有父评论（第1级），也要更新第1级的 updated_at
      const parentComment = await getAsync(
        'SELECT parent_id FROM blog_comments WHERE id = ?',
        [commentData.parentId]
      );
      if (parentComment && parentComment.parent_id) {
        await runAsync(
          'UPDATE blog_comments SET updated_at = ? WHERE id = ?',
          [now, parentComment.parent_id]
        );
      }
    }
    
    // 获取创建的评论
    const newComment = await getAsync(
      'SELECT * FROM blog_comments WHERE id = ?',
      [commentId]
    );
    
    // 转换格式以保持兼容性
    const comment = {
      id: newComment.id,
      content: newComment.content,
      authorName: newComment.author_name,
      authorEmail: newComment.author_email,
      authorPhone: newComment.author_phone,
      userId: newComment.user_id,
      postId: newComment.post_id,
      parentId: newComment.parent_id,
      approved: newComment.approved === 1,
      createdAt: newComment.created_at,
      updatedAt: newComment.updated_at
    };
    
    return comment;
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
    const { runAsync, getAsync } = require('../db/database');
    
    // 获取评论信息
    const comment = await getAsync(
      'SELECT post_id FROM blog_comments WHERE id = ?',
      [commentId]
    );
    
    if (!comment) {
      return false;
    }
    
    const postId = comment.post_id;
    
    // 更新评论审核状态
    // 使用 Node.js 的时间（已通过 TZ 环境变量设置为 Africa/Cairo）
    const now = getCurrentLocalTimeString();
    
    await runAsync(
      'UPDATE blog_comments SET approved = ?, updated_at = ? WHERE id = ?',
      [approved ? 1 : 0, now, commentId]
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
    
    return true;
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
    const { runAsync, getAsync } = require('../db/database');
    
    // 获取评论信息
    const comment = await getAsync(
      'SELECT post_id FROM blog_comments WHERE id = ?',
      [commentId]
    );
    
    if (!comment) {
      return false;
    }
    
    const postId = comment.post_id;
    
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
    
    return true;
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
