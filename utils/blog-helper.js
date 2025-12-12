const { getAsync, allAsync, runAsync } = require('../db/database');
const { logger } = require('./logger');
const { v4: uuidv4 } = require('uuid');

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
  const post = {
    id: item[mapping.id] || item.id || uuidv4(), // id现在已经是全局唯一的UUID
    name: item[mapping.name] || item.name || item.title || '未命名',
    title: item[mapping.title] || item.title || item[mapping.name] || item.name,
    slug: item[mapping.slug] || item.slug || (item[mapping.name] || item.name || '').toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'),
    excerpt: item[mapping.excerpt] || item.excerpt || item[mapping.description] || item.description || '',
    description: item[mapping.description] || item.description || '',
    htmlContent: item[mapping.htmlContent] || item.htmlContent || item.html || '',
    image: item[mapping.image] || item.image || null,
    category: apiName, // 分类就是API名称
    tags: item.tags || item.tag ? (Array.isArray(item.tags || item.tag) ? (item.tags || item.tag) : [item.tags || item.tag]) : [],
    published: mapping.published ? (item[mapping.published] !== undefined ? item[mapping.published] : true) : true,
    views: item[mapping.views] || item.views || 0,
    createdAt: item[mapping.createdAt] || item.createdAt || item.created_at || new Date().toISOString(),
    updatedAt: item[mapping.updatedAt] || item.updatedAt || item.updated_at || new Date().toISOString(),
    // 保留原始数据用于更新
    _sourceApiName: apiName,
    _originalData: item
  };
  
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
    for (const api of apis) {
      try {
        const responseContent = JSON.parse(api.response_content);
        let items = [];
        
        // 支持两种格式：{data: [...]} 或直接是数组
        if (Array.isArray(responseContent)) {
          items = responseContent;
        } else if (responseContent.data && Array.isArray(responseContent.data)) {
          items = responseContent.data;
        } else {
          continue; // 跳过无效格式
        }
        
        // 获取字段映射配置
        const fieldMapping = await getApiFieldMapping(api.name);
        
        // 将每个数据项转换为文章格式
        const posts = items.map(item => convertApiItemToPost(item, api.name, fieldMapping));
        allPosts = allPosts.concat(posts);
      } catch (e) {
        logger.warn('解析API响应内容失败', { apiName: api.name, error: e.message });
        continue;
      }
    }
    
    // 筛选已发布的文章
    if (options.publishedOnly !== false) {
      allPosts = allPosts.filter(post => post.published === true);
    }
    
    // 分类筛选（分类就是API名称）
    if (options.category) {
      allPosts = allPosts.filter(post => post.category === options.category);
    }
    
    // 标签筛选
    if (options.tag) {
      allPosts = allPosts.filter(post => {
        if (Array.isArray(post.tags)) {
          return post.tags.some(tag => 
            (typeof tag === 'string' && tag === options.tag) ||
            (typeof tag === 'object' && (tag.name === options.tag || tag.slug === options.tag))
          );
        }
        return false;
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
      isArrayFormat: Array.isArray(responseContent) // 记录原始格式
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
    const apis = await allAsync(`
      SELECT id, name, path, description, status, created_at, updated_at
      FROM custom_apis
      WHERE method = 'GET' AND status = 'active'
      ORDER BY name ASC
    `);
    
    // 获取文章列表以计算每个分类的文章数
    const posts = await getBlogPosts({ publishedOnly: false });
    
    // 统计每个分类的文章数
    const categoryPostCount = {};
    posts.forEach(post => {
      const categoryName = post.category || '';
      if (categoryName) {
        categoryPostCount[categoryName] = (categoryPostCount[categoryName] || 0) + 1;
      }
    });
    
    // 转换为分类格式：name作为分类名称，path作为描述
    const categories = apis.map(api => ({
      id: api.id,
      name: api.name,
      slug: api.path.replace(/^\//, '').replace(/\//g, '-'), // 从path生成slug
      description: api.path, // Path作为描述
      postCount: categoryPostCount[api.name] || 0,
      createdAt: api.created_at,
      updatedAt: api.updated_at
    }));
    
    return categories;
  } catch (error) {
    logger.error('获取分类列表失败', { error: error.message });
    return [];
  }
}

/**
 * 获取标签列表
 * @returns {Promise<Array>} 标签列表
 */
async function getBlogTags() {
  try {
    const api = await getBlogApi('/blog/tags');
    
    if (!api || !api.response_content || !api.response_content.data) {
      return [];
    }
    
    return api.response_content.data;
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
    item.updatedAt = new Date().toISOString();
    
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
      return result.lastID;
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
    
    // 生成slug（如果没有提供）
    let slug = postData.slug;
    if (!slug && postData.name) {
      slug = postData.name
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
    }
    
    // 确保slug唯一
    const posts = await getBlogPosts({ publishedOnly: false });
    let finalSlug = slug;
    let counter = 1;
    while (posts.some(p => p.slug === finalSlug)) {
      finalSlug = `${slug}-${counter}`;
      counter++;
    }
    
    // 生成文章ID（全局唯一的UUID）
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
    
    // 构建文章数据（根据字段映射配置）
    const fieldMapping = await getApiFieldMapping(postData.apiName);
    
    // 构建原始数据项（用于存储到API的response_content中）
    const newItem = {
      id: postId, // id现在是全局唯一的UUID
      name: postData.name || postData.title || '未命名',
      title: postData.title || postData.name,
      slug: finalSlug,
      excerpt: postData.excerpt || '',
      description: postData.description || '',
      htmlContent: postData.htmlContent || '',
      image: postData.image || null,
      tags: Array.isArray(postData.tags) ? postData.tags : (postData.tags ? postData.tags.split(',').map(t => t.trim()) : []),
      published: postData.published !== undefined ? postData.published : false,
      views: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // 解析现有API数据，保持原有格式（数组或对象）
    let responseContent;
    let isArrayFormat = false;
    let items = [];
    
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
    let finalContent;
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
    
    const updatedItem = {
      ...originalItem,
      ...postData,
      id: originalId, // 使用原始ID，确保ID不变（id现在是全局唯一的UUID）
      updatedAt: new Date().toISOString()
    };
    
    // 如果分类改变，需要移动到新的API
    if (postData.apiName && postData.apiName !== apiName) {
      // 从旧API中删除
      sourceApi.items.splice(sourceApi.itemIndex, 1);
      
      // 更新旧API，保持原有格式
      let oldResponseContent;
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
      let newFinalContent;
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
      
      await runAsync(
        `UPDATE custom_apis 
         SET response_content = ?, updated_at = datetime('now', 'localtime')
         WHERE id = ?`,
        [JSON.stringify(newFinalContent), newApi.id]
      );
    } else {
      // 在同一API中更新，保持原有格式
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
      
      await runAsync(
        `UPDATE custom_apis 
         SET response_content = ?, updated_at = datetime('now', 'localtime')
         WHERE id = ?`,
        [JSON.stringify(responseContent), sourceApi.api.id]
      );
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
    
    return {
      id: result.lastID,
      name: name,
      slug: categoryPath.replace(/^\//, '').replace(/\//g, '-'),
      description: categoryPath,
      postCount: 0,
      createdAt: new Date().toISOString()
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
      updatedAt: new Date().toISOString()
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
      createdAt: new Date().toISOString()
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
          api.response_content.data[commentIndex].updatedAt = new Date().toISOString();
          
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
