const { getAsync, allAsync, runAsync } = require('../db/database');
const { logger } = require('./logger');
const { v4: uuidv4 } = require('uuid');

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
    category: item.category || apiName, // 分类/标签字段（优先使用item中的category，否则使用apiName）
    tags: item.tags || item.tag ? (Array.isArray(item.tags || item.tag) ? (item.tags || item.tag) : [item.tags || item.tag]) : [],
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
  
  return post;
}

/**
 * 清理文章对象，移除内部字段（不对外暴露）
 * @param {Object} post - 文章对象
 * @returns {Object} 清理后的文章对象
 */
function cleanPostForPublic(post) {
  if (!post) return post;
  
  // 创建副本，保留必要的内部字段供前端使用
  // id字段现在已经是全局唯一的，不需要额外处理
  const cleaned = { ...post };
  // 保留_sourceApiName和_originalData，因为前端可能需要用于更新操作
  
  return cleaned;
}

/**
 * 获取文章列表
 * 从所有custom_apis表的response_content.data中读取并合并
 * @param {Object} options - 查询选项
 * @param {boolean} options.publishedOnly - 仅获取已发布的文章
 * @param {string} options.category - 分类筛选（API名称）
 * @param {string} options.tag - 标签筛选
 * @param {string} options.search - 搜索关键词
 * @returns {Promise<Array>} 文章列表
 */
async function getBlogPosts(options = {}) {
  try {
    // 从custom_apis表读取所有GET方法的API
    // 排除博客系统专用的API路径（如/blog/posts, /blog/categories等）
    const apis = await allAsync(`
      SELECT id, name, path, response_content, status
      FROM custom_apis
      WHERE method = 'GET' 
        AND status = 'active'
        AND path NOT LIKE '/blog/%'
      ORDER BY name ASC
    `);
    
    let allPosts = [];
    
    // 遍历每个API，读取其response_content.data
    const skippedApis = [];
    const processedApis = [];
    
    for (const api of apis) {
      try {
        const responseContent = JSON.parse(api.response_content);
        
        // 支持多种格式：数组、{data: [...]}、或天气路况的对象格式
        let items = [];
        
        // 优先检查是否是天气路况的对象格式（包含globalAlert、attractions、traffic）
        if (responseContent.globalAlert && responseContent.attractions && responseContent.traffic) {
          // 天气路况的对象格式：将整个对象作为一个"文章"处理，只创建一个文章
          items = [responseContent];
        } else if (Array.isArray(responseContent)) {
          // 数组格式
          items = responseContent;
        } else if (responseContent.data && Array.isArray(responseContent.data)) {
          // 对象格式，包含data数组
          items = responseContent.data;
        } else {
          skippedApis.push({ name: api.name, reason: '无效的数据格式（不是数组、不是{data:[]}、也不是天气对象）', contentType: typeof responseContent });
          continue; // 跳过无效格式
        }
        
        if (items.length === 0) {
          skippedApis.push({ name: api.name, reason: '数据数组为空' });
          continue;
        }
        
        // 获取字段映射配置
        const fieldMapping = await getApiFieldMapping(api.name);
        
        // 将每个数据项转换为文章格式
        const posts = items.map(item => convertApiItemToPost(item, api.name, fieldMapping));
        allPosts = allPosts.concat(posts);
        processedApis.push({ name: api.name, postCount: posts.length });
      } catch (e) {
        skippedApis.push({ name: api.name, reason: '解析失败', error: e.message });
        logger.warn('解析API响应内容失败', { apiName: api.name, error: e.message });
        continue;
      }
    }
    
    // 记录处理结果
    if (skippedApis.length > 0 || processedApis.length > 0) {
      logger.info('API处理统计', {
        总API数: apis.length,
        成功处理的API数: processedApis.length,
        跳过的API数: skippedApis.length,
        跳过的API详情: skippedApis,
        处理的API详情: processedApis.map(a => ({ name: a.name, posts: a.postCount }))
      });
    }
    
    // 筛选已发布的文章
    if (options.publishedOnly !== false) {
      allPosts = allPosts.filter(post => post.published === true);
    }
    
    // 分类筛选（分类就是API名称）
    if (options.category) {
      const categoryLower = options.category.toLowerCase();
      const beforeFilterCount = allPosts.length;
      
      // 收集所有文章的分类信息用于调试（在筛选前）
      const allCategories = new Set();
      const allSourceApiNames = new Set();
      const samplePostsBeforeFilter = [];
      allPosts.forEach((post, index) => {
        if (post.category) allCategories.add(post.category);
        if (post._sourceApiName) allSourceApiNames.add(post._sourceApiName);
        if (index < 5) {
          samplePostsBeforeFilter.push({
            id: post.id,
            name: post.name,
            category: post.category,
            _sourceApiName: post._sourceApiName
          });
        }
      });
      
      allPosts = allPosts.filter(post => {
        // 优先使用_sourceApiName匹配（因为分类是基于API名称的）
        // _sourceApiName应该总是等于api.name，这是最可靠的匹配方式
        const sourceApiName = post._sourceApiName || '';
        if (sourceApiName) {
          const exactMatch = sourceApiName === options.category;
          const caseInsensitiveMatch = sourceApiName.toLowerCase() === categoryLower;
          if (exactMatch || caseInsensitiveMatch) {
            return true;
          }
        }
        
        // 如果_sourceApiName不匹配，检查category字段（可能来自item.category）
        // 但这种情况应该很少见，因为category通常是item.category || apiName
        const category = post.category || '';
        if (category) {
          const exactMatch = category === options.category;
          const caseInsensitiveMatch = category.toLowerCase() === categoryLower;
          if (exactMatch || caseInsensitiveMatch) {
            return true;
          }
        }
        
        return false;
      });
      
      // 调试日志：如果筛选后没有结果，记录详细信息
      if (allPosts.length === 0 && beforeFilterCount > 0) {
        logger.warn('分类筛选结果为空', {
          requestedCategory: options.category,
          requestedCategoryLower: categoryLower,
          beforeFilterCount,
          allCategoriesInPosts: Array.from(allCategories),
          allSourceApiNamesInPosts: Array.from(allSourceApiNames),
          samplePostsBeforeFilter
        });
      }
    }
    
    // 标签筛选（使用category字段作为标签）
    if (options.tag) {
      allPosts = allPosts.filter(post => {
        // 使用category字段作为标签
        const category = post.category || post._sourceApiName || '';
        return category === options.tag || category.toLowerCase() === options.tag.toLowerCase();
      });
    }
    
    // 搜索
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      allPosts = allPosts.filter(post => {
        const name = (post.name || '').toLowerCase();
        const title = (post.title || '').toLowerCase();
        const excerpt = (post.excerpt || '').toLowerCase();
        const description = (post.description || '').toLowerCase();
        const htmlContent = (post.htmlContent || '').toLowerCase();
        return name.includes(searchLower) || 
               title.includes(searchLower) || 
               excerpt.includes(searchLower) ||
               description.includes(searchLower) ||
               htmlContent.includes(searchLower);
      });
    }
    
    // 去重：基于id去重，保留第一个出现的
    const seenIds = new Set();
    const uniquePosts = [];
    for (const post of allPosts) {
      const postId = String(post.id || '');
      if (postId && !seenIds.has(postId)) {
        seenIds.add(postId);
        uniquePosts.push(post);
      } else if (!postId) {
        // 如果没有id，也保留（但这种情况不应该发生）
        uniquePosts.push(post);
      }
    }
    
    // 按分类分组，然后按id排序（确保顺序一致）
    uniquePosts.sort((a, b) => {
      // 首先按分类排序（分类名称）
      const categoryA = (a.category || a._sourceApiName || '').toLowerCase();
      const categoryB = (b.category || b._sourceApiName || '').toLowerCase();
      
      if (categoryA !== categoryB) {
        return categoryA.localeCompare(categoryB);
      }
      
      // 同一分类内，按id排序（确保顺序一致）
      // id现在是UUID格式，可以直接字符串比较
      const idA = String(a.id || '');
      const idB = String(b.id || '');
      return idA.localeCompare(idB);
    });
    
    return uniquePosts;
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
 * 从custom_apis表读取，Name作为分类名称，Path作为分类描述
 * @returns {Promise<Array>} 分类列表
 */
async function getBlogCategories() {
  try {
    // 从custom_apis表直接读取所有记录作为分类
    // 排除博客系统专用的API路径（与getBlogPosts保持一致）
    const apis = await allAsync(`
      SELECT id, name, path, description, status, created_at, updated_at
      FROM custom_apis
      WHERE method = 'GET' 
        AND status = 'active'
        AND path NOT LIKE '/blog/%'
      ORDER BY name ASC
    `);
    
    // 获取文章列表以计算每个分类的文章数
    const posts = await getBlogPosts({ publishedOnly: false });
    
    // 统计每个分类的文章数（按_sourceApiName分组，因为文章是按apiName分组的）
    const categoryPostCount = {};
    const seenPostIds = new Set(); // 用于去重，避免重复统计
    
    posts.forEach(post => {
      const postId = String(post.id || '');
      // 如果已存在相同id，跳过（防止重复统计）
      if (postId && seenPostIds.has(postId)) {
        return;
      }
      seenPostIds.add(postId);
      
      // 使用_sourceApiName作为分类名称（因为文章是按apiName分组的）
      const apiName = post._sourceApiName || post.category || '';
      if (apiName) {
        categoryPostCount[apiName] = (categoryPostCount[apiName] || 0) + 1;
      }
    });
    
    // 转换为分类格式：name作为分类名称，path作为描述
    const categories = apis.map(api => ({
      id: api.id,
      name: api.name,
      slug: api.path.replace(/^\//, '').replace(/\//g, '-'), // 从path生成slug
      description: api.path, // Path作为描述
      postCount: categoryPostCount[api.name] || 0, // 使用api.name匹配_sourceApiName
      createdAt: api.created_at,
      updatedAt: api.updated_at
    }));
    
    // 检查哪些分类有文章，哪些没有
    const categoriesWithPosts = categories.filter(cat => cat.postCount > 0);
    const categoriesWithoutPosts = categories.filter(cat => cat.postCount === 0);
    
    logger.info('分类文章数统计', {
      总分类数: categories.length,
      有文章的分类数: categoriesWithPosts.length,
      无文章的分类数: categoriesWithoutPosts.length,
      总文章数: posts.length,
      去重后文章数: seenPostIds.size,
      分类统计: categoryPostCount,
      有文章的分类: categoriesWithPosts.map(cat => ({ name: cat.name, count: cat.postCount })),
      无文章的分类: categoriesWithoutPosts.map(cat => cat.name),
      所有文章的分类字段: Array.from(new Set(posts.map(p => p._sourceApiName || p.category).filter(Boolean)))
    });
    
    return categories;
  } catch (error) {
    logger.error('获取分类列表失败', { error: error.message });
    return [];
  }
}

/**
 * 获取标签列表（从所有文章的category字段中提取）
 * @returns {Promise<Array>} 标签列表
 */
async function getBlogTags() {
  try {
    // 从所有文章中提取category字段作为标签
    const posts = await getBlogPosts({ publishedOnly: true });
    
    // 统计每个category的文章数量
    const tagCountMap = new Map();
    posts.forEach(post => {
      const category = post.category || post._sourceApiName || '';
      if (category) {
        tagCountMap.set(category, (tagCountMap.get(category) || 0) + 1);
      }
    });
    
    // 转换为标签数组
    const tags = Array.from(tagCountMap.entries()).map(([name, count]) => ({
      id: name, // 使用category名称作为ID
      name: name,
      slug: name.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'),
      postCount: count
    }));
    
    // 按文章数量降序排序
    tags.sort((a, b) => b.postCount - a.postCount);
    
    logger.info('从文章category字段提取标签', { tagCount: tags.length });
    
    return tags;
  } catch (error) {
    logger.error('获取标签列表失败', { error: error.message });
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
    
    const apiName = post._sourceApiName || post.category;
    if (!apiName) {
      return false;
    }
    
    // 查找文章所在的API
    const sourceApi = await findPostSourceApi(post.id, apiName);
    if (!sourceApi) {
      return false;
    }
    
    // 增加阅读量
    const item = sourceApi.items[sourceApi.itemIndex];
    if (!item.views) {
      item.views = 0;
    }
    item.views += 1;
    item.updatedAt = getCurrentLocalTimeISOString();
    
    // 更新API的response_content，保持原有格式
    let responseContent;
    let isArrayFormat = false;
    
    try {
      const parsed = JSON.parse(sourceApi.api.response_content);
      if (Array.isArray(parsed)) {
        // 原始是数组格式，保持数组格式
        isArrayFormat = true;
        responseContent = sourceApi.items;
      } else {
        // 原始是对象格式，保持对象格式
        isArrayFormat = false;
        responseContent = { ...parsed, data: sourceApi.items };
      }
    } catch (e) {
      // 解析失败，默认使用数组格式
      isArrayFormat = true;
      responseContent = sourceApi.items;
    }
    
    await runAsync(
      `UPDATE custom_apis 
       SET response_content = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [JSON.stringify(responseContent), sourceApi.api.id]
    );
    
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
    
    // 查找目标API
    const targetApi = await getAsync(`
      SELECT id, name, path, response_content
      FROM custom_apis
      WHERE name = ? AND method = 'GET' AND status = 'active'
    `, [postData.apiName]);
    
    if (!targetApi) {
      throw new Error(`API "${postData.apiName}" 不存在`);
    }
    
    // 生成文章ID（全局唯一的UUID）- 先生成ID，用于生成稳定的slug
    // UUID格式的正则表达式
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    let postId;
    if (postData.id) {
      // 如果提供了id，验证是否是有效的UUID格式
      const idStr = String(postData.id);
      if (UUID_REGEX.test(idStr)) {
        // 检查是否已存在（确保全局唯一）
        const posts = await getBlogPosts({ publishedOnly: false });
        const exists = posts.some(p => String(p.id) === idStr);
        if (exists) {
          // ID已存在，生成新的UUID
          logger.warn('提供的ID已存在，生成新的UUID', { providedId: idStr });
          postId = uuidv4();
        } else {
          postId = idStr;
        }
      } else {
        // 不是UUID格式，生成新的UUID
        logger.warn('提供的ID不是UUID格式，生成新的UUID', { providedId: idStr });
        postId = uuidv4();
      }
    } else {
      // 没有提供id，生成新的UUID
      postId = uuidv4();
    }
    
    // 生成稳定的slug（基于ID，确保唯一性和稳定性）
    let slug = postData.slug;
    if (!slug && postData.name) {
      // 基础slug从名称生成
      let baseSlug = postData.name
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      
      // 如果slug为空，使用id的前8位
      if (!baseSlug) {
        baseSlug = String(postId).substring(0, 8).replace(/[^a-z0-9]/g, '');
      }
      
      // 添加ID的前8位确保唯一性
      const idSuffix = String(postId).substring(0, 8).replace(/[^a-z0-9]/g, '');
      slug = `${baseSlug}-${idSuffix}`;
    }
    
    // 确保slug唯一（检查是否与其他文章冲突，排除当前文章）
    const posts = await getBlogPosts({ publishedOnly: false });
    let finalSlug = slug;
    let counter = 1;
    while (posts.some(p => p.slug === finalSlug && String(p.id) !== String(postId))) {
      // 如果冲突，在基础slug后添加计数器
      const baseSlug = slug.split('-').slice(0, -1).join('-') || slug;
      finalSlug = `${baseSlug}-${counter}`;
      counter++;
    }
    
    // 构建文章数据（根据字段映射配置）
    const fieldMapping = await getApiFieldMapping(postData.apiName);
    
    // 检查是否是特殊类别
    const isSpecialCategory = (apiName) => {
      if (!apiName) return null;
      const lowerName = apiName.toLowerCase();
      if (lowerName === 'weather' || lowerName.includes('weather')) return 'weather';
      if (lowerName === 'exchange-rate' || lowerName === 'exchangerate' || lowerName.includes('exchange')) return 'exchange-rate';
      if (lowerName === 'translation' || lowerName.includes('translation')) return 'translation';
      return null;
    };
    
    // 生成特殊类别名称的辅助函数
    const generateSpecialCategoryName = (type, data) => {
      if (type === 'translation') {
        return `${data.chinese || ''} / ${data.arabic || ''}`;
      } else if (type === 'weather') {
        return `${data.city || ''} - ${data.temperature || ''}`;
      } else if (type === 'exchange-rate') {
        return `${data.fromCurrency || ''} → ${data.toCurrency || ''}: ${data.rate || ''}`;
      }
      return '未命名';
    };
    
    const specialType = isSpecialCategory(postData.apiName);
    
    // 构建原始数据项（用于存储到API的response_content中）
    let newItem;
    let isWeatherObjectFormat = false;
    
    if (specialType && postData._specialData) {
      if (specialType === 'weather') {
        // 天气路况：整个对象格式，需要特殊处理
        isWeatherObjectFormat = true;
        
        // 构建完整的天气路况对象（只包含globalAlert、attractions、traffic）
        // 只提取需要的字段，不要使用展开运算符，避免包含其他字段
        newItem = {
          globalAlert: postData._specialData.globalAlert ? { ...postData._specialData.globalAlert } : undefined,
          attractions: postData._specialData.attractions ? [...postData._specialData.attractions] : [],
          traffic: postData._specialData.traffic ? [...postData._specialData.traffic] : []
        };
        
        // 确保所有字段都存在
        if (!newItem.globalAlert) {
          throw new Error('天气路况必须包含globalAlert字段');
        }
        if (!Array.isArray(newItem.attractions)) {
          newItem.attractions = [];
        }
        if (!Array.isArray(newItem.traffic)) {
          newItem.traffic = [];
        }
        // 注意：天气路况对象格式不使用slug字段，因为它是整个对象而不是数组中的项
      } else {
        // 其他特殊类别：直接使用特殊数据
        const specialName = postData.name || generateSpecialCategoryName(specialType, postData._specialData);
        // 为特殊类别生成稳定的slug
        let specialSlug = postData.slug;
        if (!specialSlug) {
          let baseSlug = specialName
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();
          
          if (!baseSlug) {
            baseSlug = String(postId).substring(0, 8).replace(/[^a-z0-9]/g, '');
          }
          
          const idSuffix = String(postId).substring(0, 8).replace(/[^a-z0-9]/g, '');
          specialSlug = `${baseSlug}-${idSuffix}`;
        }
        
        // 从特殊数据中排除detailApi字段（已废弃）
        const { detailApi, ...specialDataWithoutDetailApi } = postData._specialData || {};
        newItem = {
          id: postId,
          slug: specialSlug,
          ...specialDataWithoutDetailApi,
          // 为特殊类别生成name字段（用于显示）
          name: specialName
        };
      }
    } else {
      // 普通类别：使用标准格式
      // name和title保持一致
      const nameValue = postData.name || postData.title || '未命名';
      // excerpt和description保持一致
      const excerptValue = postData.excerpt || postData.description || '';
      // 从postData中排除detailApi字段（已废弃）
      const { detailApi: _, ...postDataWithoutDetailApi } = postData;
      newItem = {
        id: postId, // id现在是全局唯一的UUID
        name: nameValue,
        title: nameValue, // name和title保持一致
        slug: finalSlug, // 使用基于ID的稳定slug
        excerpt: excerptValue,
        description: excerptValue, // description和excerpt保持一致
        htmlContent: postData.htmlContent || '',
        image: postData.image || null,
        category: postData.category || postData.apiName, // 分类/标签字段（用于博客展示，替代原来的tags字段）
        // tags字段已废弃，不再使用
        published: postData.published !== undefined ? postData.published : false,
        views: 0,
        createdAt: getCurrentLocalTimeISOString(),
        updatedAt: getCurrentLocalTimeISOString()
      };
      
      // 添加特殊字段（二手市场和租房酒店）
      if (postData.price !== undefined) {
        newItem.price = postData.price;
      }
      if (postData.rooms !== undefined) {
        newItem.rooms = postData.rooms;
      }
      if (postData.area !== undefined) {
        newItem.area = postData.area;
      }
      if (postData.views !== undefined && typeof postData.views === 'number') {
        newItem.views = postData.views;
      }
    }
    
    // 解析现有API数据，保持原有格式（数组或对象）
    let responseContent;
    let isArrayFormat = false;
    let items = [];
    
    // 如果是天气路况的对象格式，直接替换整个对象
    if (isWeatherObjectFormat) {
      finalContent = newItem;
    } else {
      try {
        const parsed = JSON.parse(targetApi.response_content);
        // 检查原始格式
        if (Array.isArray(parsed)) {
          // 原始是数组格式，保持数组格式
          isArrayFormat = true;
          items = parsed;
        } else if (parsed.data && Array.isArray(parsed.data)) {
          // 原始是对象格式，包含data数组
          isArrayFormat = false;
          items = parsed.data;
          responseContent = { ...parsed }; // 保留其他字段
        } else {
          // 其他格式，默认使用对象格式
          isArrayFormat = false;
          items = [];
          responseContent = parsed || {};
        }
      } catch (e) {
        // 解析失败，默认使用数组格式
        isArrayFormat = true;
        items = [];
      }
      
      // 添加新文章到数组
      items.push(newItem);
      
      // 根据原始格式保存
      if (isArrayFormat) {
        // 保持数组格式
        finalContent = items;
      } else {
        // 保持对象格式
        if (!responseContent) {
          responseContent = {};
        }
        responseContent.data = items;
        finalContent = responseContent;
      }
    }
    
    // 更新API的response_content，保持原有格式
    await runAsync(
      `UPDATE custom_apis 
       SET response_content = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [JSON.stringify(finalContent), targetApi.id]
    );
    
    // 返回文章对象（转换为标准格式）
    return convertApiItemToPost(newItem, postData.apiName, fieldMapping);
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
    // 先找到文章（id现在是全局唯一的UUID）
    const posts = await getBlogPosts({ publishedOnly: false });
    const post = posts.find(p => {
      const pId = String(p.id || '');
      const searchId = String(postId || '');
      return pId === searchId;
    });
    
    if (!post) {
      logger.warn('更新文章失败：未找到文章', { postId, availableIds: posts.map(p => p.id) });
      return null;
    }
    
    const apiName = post._sourceApiName || post.category;
    if (!apiName) {
      throw new Error('无法确定文章的源API');
    }
    
    // 直接使用postId查找（id现在是全局唯一的UUID）
    const sourceApi = await findPostSourceApi(postId, apiName);
    if (!sourceApi) {
      throw new Error('无法找到文章的源API');
    }
    
    // 更新文章数据
    // 保留原始ID（现在是全局唯一的UUID）
    const originalItem = sourceApi.items[sourceApi.itemIndex];
    const originalId = originalItem.id;
    
    // 如果是天气路况对象格式，originalItem就是整个对象
    // 优先使用sourceApi的标记，因为这是最准确的
    let isWeatherObjectFormat = sourceApi.isWeatherObject || false;
    
    // 检查是否是特殊类别
    const isSpecialCategory = (apiName) => {
      if (!apiName) return null;
      const lowerName = apiName.toLowerCase();
      if (lowerName === 'weather' || lowerName.includes('weather')) return 'weather';
      if (lowerName === 'exchange-rate' || lowerName === 'exchangerate' || lowerName.includes('exchange')) return 'exchange-rate';
      if (lowerName === 'translation' || lowerName.includes('translation')) return 'translation';
      return null;
    };
    
    const specialType = isSpecialCategory(apiName);
    
    // 如果sourceApi标记为天气路况对象格式，强制设置为true
    if (sourceApi.isWeatherObject) {
      isWeatherObjectFormat = true;
    }
    
    let updatedItem;
    
    // 如果已经是天气路况对象格式，但缺少_specialData，使用原始对象
    if (isWeatherObjectFormat && (!specialType || !postData._specialData)) {
      logger.warn('天气路况对象格式但缺少_specialData，使用原始对象', {
        postId,
        apiName,
        hasSpecialType: !!specialType,
        hasSpecialData: !!postData._specialData
      });
      // 使用原始对象，只更新允许的字段
      updatedItem = { ...originalItem };
      if (postData.name) updatedItem.name = postData.name;
      // 注意：对于天气路况对象格式，不应该直接修改对象结构
    } else if (specialType && postData._specialData) {
      if (specialType === 'weather') {
        // 天气路况：整个对象格式，需要特殊处理
        isWeatherObjectFormat = true; // 确保标记为天气路况对象格式
        
        logger.info('更新天气路况文章', { 
          postId, 
          apiName,
          hasSpecialData: !!postData._specialData,
          specialDataKeys: postData._specialData ? Object.keys(postData._specialData) : []
        });
        
        // 构建完整的天气路况对象（只包含globalAlert、attractions、traffic）
        // 只提取需要的字段，不要使用展开运算符，避免包含其他字段
        updatedItem = {
          globalAlert: postData._specialData.globalAlert ? { ...postData._specialData.globalAlert } : undefined,
          attractions: postData._specialData.attractions ? [...postData._specialData.attractions] : [],
          traffic: postData._specialData.traffic ? [...postData._specialData.traffic] : []
        };
        
        // 确保所有字段都存在
        if (!updatedItem.globalAlert) {
          throw new Error('天气路况必须包含globalAlert字段');
        }
        if (!Array.isArray(updatedItem.attractions)) {
          updatedItem.attractions = [];
        }
        if (!Array.isArray(updatedItem.traffic)) {
          updatedItem.traffic = [];
        }
        
        logger.info('构建天气路况对象', { 
          globalAlert: updatedItem.globalAlert,
          globalAlertMessage: updatedItem.globalAlert?.message,
          attractionsCount: updatedItem.attractions ? updatedItem.attractions.length : 0,
          trafficCount: updatedItem.traffic ? updatedItem.traffic.length : 0,
          finalKeys: Object.keys(updatedItem)
        });
      } else {
        // 其他特殊类别（exchange-rate、translation）：直接使用特殊数据，保留原始ID
        // 从特殊数据中排除detailApi字段（已废弃）
        const { detailApi, ...specialDataWithoutDetailApi } = postData._specialData || {};
        updatedItem = {
          id: originalId,
          ...specialDataWithoutDetailApi,
          // 如果有name字段，更新它
          name: postData.name || originalItem.name
        };
        // 注意：exchange-rate 和 translation 不使用 htmlContent
      }
    } else {
      // 普通类别或需要htmlContent的特殊类别（second-hand、rentals）：使用标准格式
      // name和title保持一致
      const nameValue = postData.name !== undefined ? postData.name : (postData.title !== undefined ? postData.title : originalItem.name);
      // excerpt和description保持一致
      let excerptValue;
      if (postData.excerpt !== undefined) {
        excerptValue = postData.excerpt;
      } else if (postData.description !== undefined) {
        excerptValue = postData.description;
      } else {
        excerptValue = originalItem.excerpt || originalItem.description || '';
      }
      // 从originalItem和postData中排除detailApi字段（已废弃）
      const { detailApi: originalDetailApi, ...originalItemWithoutDetailApi } = originalItem;
      const { detailApi: postDetailApi, ...postDataWithoutDetailApi } = postData;
      updatedItem = {
        ...originalItemWithoutDetailApi,
        ...postDataWithoutDetailApi,
        id: originalId, // 使用原始ID，确保ID不变（id现在是全局唯一的UUID）
        name: nameValue,
        title: nameValue, // name和title保持一致
        excerpt: excerptValue,
        description: excerptValue, // description和excerpt保持一致
        category: postData.category !== undefined ? postData.category : (originalItem.category || apiName), // 分类/标签字段
        updatedAt: getCurrentLocalTimeISOString()
      };
      
      // 确保 htmlContent 被正确更新（对于 second-hand 和 rentals，htmlContent 应该被保留）
      if (postData.htmlContent !== undefined) {
        updatedItem.htmlContent = postData.htmlContent;
      }
      
      // 添加或更新特殊字段（二手市场和租房酒店）
      if (postData.price !== undefined) {
        updatedItem.price = postData.price;
      }
      if (postData.rooms !== undefined) {
        updatedItem.rooms = postData.rooms;
      }
      if (postData.area !== undefined) {
        updatedItem.area = postData.area;
      }
      if (postData.views !== undefined && typeof postData.views === 'number') {
        updatedItem.views = postData.views;
      }
      
      // 处理slug的唯一性和稳定性
      if (postData.slug !== undefined) {
        // 如果提供了新slug，检查唯一性
        const posts = await getBlogPosts({ publishedOnly: false });
        let finalSlug = postData.slug;
        
        // 如果slug为空，基于名称和ID生成
        if (!finalSlug) {
          const name = postData.name || updatedItem.name || updatedItem.title || '未命名';
          let baseSlug = name
            .toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim();
          
          if (!baseSlug) {
            baseSlug = String(originalId).substring(0, 8).replace(/[^a-z0-9]/g, '');
          }
          
          const idSuffix = String(originalId).substring(0, 8).replace(/[^a-z0-9]/g, '');
          finalSlug = `${baseSlug}-${idSuffix}`;
        }
        
        // 确保slug唯一（排除当前文章）
        let counter = 1;
        const originalSlug = originalItem.slug;
        while (posts.some(p => p.slug === finalSlug && String(p.id) !== String(originalId))) {
          const baseSlug = finalSlug.split('-').slice(0, -1).join('-') || finalSlug;
          finalSlug = `${baseSlug}-${counter}`;
          counter++;
        }
        
        updatedItem.slug = finalSlug;
      } else if (!updatedItem.slug) {
        // 如果没有slug，基于名称和ID生成稳定的slug
        const name = updatedItem.name || updatedItem.title || '未命名';
        let baseSlug = name
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim();
        
        if (!baseSlug) {
          baseSlug = String(originalId).substring(0, 8).replace(/[^a-z0-9]/g, '');
        }
        
        const idSuffix = String(originalId).substring(0, 8).replace(/[^a-z0-9]/g, '');
        const newSlug = `${baseSlug}-${idSuffix}`;
        
        // 检查唯一性
        const posts = await getBlogPosts({ publishedOnly: false });
        let finalSlug = newSlug;
        let counter = 1;
        while (posts.some(p => p.slug === finalSlug && String(p.id) !== String(originalId))) {
          const baseSlugPart = newSlug.split('-').slice(0, -1).join('-') || newSlug;
          finalSlug = `${baseSlugPart}-${counter}`;
          counter++;
        }
        
        updatedItem.slug = finalSlug;
      }
    }
    
    // 如果分类改变，需要移动到新的API
    if (postData.apiName && postData.apiName !== apiName) {
      // 从旧API中删除（如果是天气路况对象格式，不需要删除，因为整个对象会被替换）
      let oldResponseContent;
      
      if (isWeatherObjectFormat) {
        // 天气路况：清空整个对象（只包含globalAlert、attractions、traffic）
        oldResponseContent = { globalAlert: { level: 'low', message: '' }, attractions: [], traffic: [] };
      } else {
        // 普通格式：从数组中删除
        sourceApi.items.splice(sourceApi.itemIndex, 1);
        
        // 更新旧API，保持原有格式
        let oldIsArrayFormat = false;
        
        try {
          const parsed = JSON.parse(sourceApi.api.response_content);
          if (Array.isArray(parsed)) {
            // 原始是数组格式，保持数组格式
            oldIsArrayFormat = true;
            oldResponseContent = sourceApi.items;
          } else {
            // 原始是对象格式，保持对象格式
            oldIsArrayFormat = false;
            oldResponseContent = { ...parsed, data: sourceApi.items };
          }
        } catch (e) {
          // 解析失败，默认使用数组格式
          oldIsArrayFormat = true;
          oldResponseContent = sourceApi.items;
        }
      }
      
      await runAsync(
        `UPDATE custom_apis 
         SET response_content = ?, updated_at = datetime('now', 'localtime')
         WHERE id = ?`,
        [JSON.stringify(oldResponseContent), sourceApi.api.id]
      );
      
      // 添加到新API
      const newApi = await getAsync(`
        SELECT id, name, path, response_content
        FROM custom_apis
        WHERE name = ? AND method = 'GET' AND status = 'active'
      `, [postData.apiName]);
      
      if (!newApi) {
        throw new Error(`目标API "${postData.apiName}" 不存在`);
      }
      
      // 添加到新API，保持新API的原有格式
      let newFinalContent;
      
      if (isWeatherObjectFormat) {
        // 天气路况：直接替换整个对象
        newFinalContent = updatedItem;
      } else {
        // 普通格式：解析新API数据
        let newResponseContent;
        let newIsArrayFormat = false;
        let newItems = [];
        
        try {
          const parsed = JSON.parse(newApi.response_content);
          if (Array.isArray(parsed)) {
            // 新API是数组格式，保持数组格式
            newIsArrayFormat = true;
            newItems = parsed;
          } else if (parsed.data && Array.isArray(parsed.data)) {
            // 新API是对象格式，包含data数组
            newIsArrayFormat = false;
            newItems = parsed.data;
            newResponseContent = { ...parsed }; // 保留其他字段
          } else {
            // 其他格式，默认使用对象格式
            newIsArrayFormat = false;
            newItems = [];
            newResponseContent = parsed || {};
          }
        } catch (e) {
          // 解析失败，默认使用数组格式
          newIsArrayFormat = true;
          newItems = [];
        }
        
        // 添加文章到新API
        newItems.push(updatedItem);
        
        // 根据新API的原始格式保存
        if (newIsArrayFormat) {
          // 保持数组格式
          newFinalContent = newItems;
        } else {
          // 保持对象格式
          if (!newResponseContent) {
            newResponseContent = {};
          }
          newResponseContent.data = newItems;
          newFinalContent = newResponseContent;
        }
      }
      
      await runAsync(
        `UPDATE custom_apis 
         SET response_content = ?, updated_at = datetime('now', 'localtime')
         WHERE id = ?`,
        [JSON.stringify(newFinalContent), newApi.id]
      );
    } else {
      // 在同一API中更新，保持原有格式
      let finalContent;
      
      if (isWeatherObjectFormat) {
        // 天气路况：直接替换整个对象
        // 确保updatedItem包含所有必要的字段
        if (!updatedItem || typeof updatedItem !== 'object') {
          logger.error('天气路况updatedItem无效', { updatedItem });
          throw new Error('天气路况更新数据无效');
        }
        
        finalContent = updatedItem;
        
        logger.info('准备保存天气路况对象到数据库', {
          apiId: sourceApi.api.id,
          apiName: sourceApi.api.name,
          finalContentKeys: Object.keys(finalContent),
          hasGlobalAlert: !!finalContent.globalAlert,
          attractionsCount: finalContent.attractions ? finalContent.attractions.length : 0,
          trafficCount: finalContent.traffic ? finalContent.traffic.length : 0,
          hasDataField: finalContent.data !== undefined,
          finalContentPreview: JSON.stringify(finalContent).substring(0, 500)
        });
      } else {
        // 普通格式：更新数组中的项
        sourceApi.items[sourceApi.itemIndex] = updatedItem;
        
        let responseContent;
        let isArrayFormat = false;
        
        try {
          const parsed = JSON.parse(sourceApi.api.response_content);
          if (Array.isArray(parsed)) {
            // 原始是数组格式，保持数组格式
            isArrayFormat = true;
            responseContent = sourceApi.items;
          } else {
            // 原始是对象格式，保持对象格式
            isArrayFormat = false;
            responseContent = { ...parsed, data: sourceApi.items };
          }
        } catch (e) {
          // 解析失败，默认使用数组格式
          isArrayFormat = true;
          responseContent = sourceApi.items;
        }
        
        finalContent = responseContent;
      }
      
      // 确保finalContent是有效的JSON对象
      if (!finalContent || typeof finalContent !== 'object') {
        logger.error('finalContent无效，无法保存到数据库', { 
          finalContent, 
          isWeatherObject: isWeatherObjectFormat,
          apiId: sourceApi.api.id 
        });
        throw new Error('更新内容无效');
      }
      
      const jsonContent = JSON.stringify(finalContent);
      if (!jsonContent || jsonContent === 'null' || jsonContent === 'undefined') {
        logger.error('JSON序列化失败', { finalContent, apiId: sourceApi.api.id });
        throw new Error('无法序列化更新内容');
      }
      
      logger.info('执行数据库更新', {
        apiId: sourceApi.api.id,
        apiName: sourceApi.api.name,
        isWeatherObject: isWeatherObjectFormat,
        jsonLength: jsonContent.length,
        jsonPreview: jsonContent.substring(0, 200)
      });
      
      const updateResult = await runAsync(
        `UPDATE custom_apis 
         SET response_content = ?, updated_at = datetime('now', 'localtime')
         WHERE id = ?`,
        [jsonContent, sourceApi.api.id]
      );
      
      logger.info('数据库更新完成', {
        apiId: sourceApi.api.id,
        changes: updateResult.changes,
        id: updateResult.id,
        isWeatherObject: isWeatherObjectFormat
      });
      
      // 如果changes为0，说明没有行被更新，可能是WHERE条件不匹配
      if (updateResult.changes === 0) {
        logger.warn('数据库更新未影响任何行', {
          apiId: sourceApi.api.id,
          apiName: sourceApi.api.name
        });
        // 验证API是否存在
        const checkApi = await getAsync('SELECT id FROM custom_apis WHERE id = ?', [sourceApi.api.id]);
        if (!checkApi) {
          throw new Error(`API不存在: ${sourceApi.api.id}`);
        }
      }
      
      // 验证更新是否成功
      const verifyApi = await getAsync(
        'SELECT response_content FROM custom_apis WHERE id = ?',
        [sourceApi.api.id]
      );
      
      if (verifyApi) {
        try {
          const verifyContent = JSON.parse(verifyApi.response_content);
          
          // 检查是否有不应该存在的字段
          const allowedFields = ['globalAlert', 'attractions', 'traffic'];
          const extraFields = Object.keys(verifyContent).filter(key => !allowedFields.includes(key));
          
          if (extraFields.length > 0) {
            logger.warn('数据库中存在不应该的字段', {
              apiId: sourceApi.api.id,
              extraFields: extraFields
            });
          }
          
          logger.info('验证数据库更新结果', {
            apiId: sourceApi.api.id,
            hasGlobalAlert: !!verifyContent.globalAlert,
            globalAlertMessage: verifyContent.globalAlert?.message,
            attractionsCount: verifyContent.attractions ? verifyContent.attractions.length : 0,
            trafficCount: verifyContent.traffic ? verifyContent.traffic.length : 0,
            hasDataField: verifyContent.data !== undefined,
            extraFields: extraFields.length > 0 ? extraFields : undefined
          });
          
          // 如果发现不应该的字段，清理它们
          if (extraFields.length > 0 && isWeatherObjectFormat) {
            logger.info('清理不应该的字段', { apiId: sourceApi.api.id, extraFields });
            const cleanedContent = {
              globalAlert: verifyContent.globalAlert,
              attractions: verifyContent.attractions,
              traffic: verifyContent.traffic
            };
            
            const cleanedJson = JSON.stringify(cleanedContent);
            await runAsync(
              `UPDATE custom_apis 
               SET response_content = ?, updated_at = datetime('now', 'localtime')
               WHERE id = ?`,
              [cleanedJson, sourceApi.api.id]
            );
            
            logger.info('已清理不应该的字段', { apiId: sourceApi.api.id });
          }
        } catch (e) {
          logger.error('验证数据库更新结果失败', { error: e.message });
        }
      }
    }
    
    // 返回更新后的文章（转换为标准格式）
    const fieldMapping = await getApiFieldMapping(postData.apiName || apiName);
    return convertApiItemToPost(updatedItem, postData.apiName || apiName, fieldMapping);
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
    // 先找到文章（id现在是全局唯一的UUID）
    const posts = await getBlogPosts({ publishedOnly: false });
    const post = posts.find(p => {
      const pId = String(p.id || '');
      const searchId = String(postId || '');
      return pId === searchId;
    });
    
    if (!post) {
      logger.warn('删除文章失败：未找到文章', { postId, availableIds: posts.map(p => p.id) });
      return false;
    }
    
    const apiName = post._sourceApiName || post.category;
    if (!apiName) {
      throw new Error('无法确定文章的源API');
    }
    
    // 直接使用postId查找（id现在是全局唯一的UUID）
    const sourceApi = await findPostSourceApi(postId, apiName);
    if (!sourceApi) {
      return false;
    }
    
    // 从数组中删除
    sourceApi.items.splice(sourceApi.itemIndex, 1);
    
    // 更新API的response_content，保持原有格式
    let responseContent;
    let isArrayFormat = false;
    
    try {
      const parsed = JSON.parse(sourceApi.api.response_content);
      if (Array.isArray(parsed)) {
        // 原始是数组格式，保持数组格式
        isArrayFormat = true;
        responseContent = sourceApi.items;
      } else {
        // 原始是对象格式，保持对象格式
        isArrayFormat = false;
        responseContent = { ...parsed, data: sourceApi.items };
      }
    } catch (e) {
      // 解析失败，默认使用数组格式
      isArrayFormat = true;
      responseContent = sourceApi.items;
    }
    
    await runAsync(
      `UPDATE custom_apis 
       SET response_content = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [JSON.stringify(responseContent), sourceApi.api.id]
    );
    
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
 * 创建标签
 * @param {Object} tagData - 标签数据
 * @returns {Promise<Object>} 创建的标签
 */
async function createBlogTag(tagData) {
  try {
    const tags = await getBlogTags();
    
    // 生成slug
    let slug = tagData.slug;
    if (!slug && tagData.name) {
      slug = tagData.name
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
    }
    
    const newTag = {
      id: uuidv4(),
      name: tagData.name,
      slug: slug,
      postCount: 0,
      createdAt: getCurrentLocalTimeISOString()
    };
    
    tags.push(newTag);
    
    await upsertBlogApi(
      '/blog/tags',
      '博客标签列表',
      { data: tags },
      'GET',
      '博客标签列表API'
    );
    
    return newTag;
  } catch (error) {
    logger.error('创建标签失败', { error: error.message });
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
  getBlogPosts,
  getBlogPost,
  getBlogCategories,
  getBlogTags,
  getBlogComments,
  incrementPostViews,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  createBlogCategory,
  updateBlogCategory,
  deleteBlogCategory,
  createBlogTag,
  createBlogComment,
  approveBlogComment,
  deleteBlogComment,
  upsertBlogApi,
  getApiFieldMapping,
  convertApiItemToPost,
  findPostSourceApi,
  cleanPostForPublic
};
