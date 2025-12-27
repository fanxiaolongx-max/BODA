const { getAsync, runAsync, allAsync } = require('../db/database');
const { logger } = require('./logger');
const { reloadCustomApiRoutes } = require('./custom-api-router');
const { updateBlogPost } = require('./blog-helper');

/**
 * 获取当前本地时间的 ISO 格式字符串
 * 使用 Node.js 的时区设置（通过 TZ 环境变量，如 Africa/Cairo）
 * @returns {string} ISO 格式的时间字符串（YYYY-MM-DDTHH:mm:ss.sss+HH:mm）
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
 * 将UTC时间转换为埃及时区ISO格式（UTC+2）
 * @param {string} utcTimeString - UTC时间字符串（如 "2025-12-26T18:00:00Z" 或 "Sat, 27 Dec 2025 00:00:01 +0000"）
 * @returns {string} 埃及时区ISO格式字符串（如 "2025-12-27T02:00:01.000+02:00"）
 */
function convertUTCToLocalISOString(utcTimeString) {
  try {
    const utcDate = new Date(utcTimeString);
    if (isNaN(utcDate.getTime())) {
      // 如果解析失败，返回当前本地时间
      return getCurrentLocalTimeISOString();
    }
    
    // 使用埃及时区（UTC+2）进行转换
    // 获取UTC时间的各个部分
    const utcYear = utcDate.getUTCFullYear();
    const utcMonth = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
    const utcDay = String(utcDate.getUTCDate()).padStart(2, '0');
    const utcHours = utcDate.getUTCHours();
    const utcMinutes = String(utcDate.getUTCMinutes()).padStart(2, '0');
    const utcSeconds = String(utcDate.getUTCSeconds()).padStart(2, '0');
    const utcMilliseconds = String(utcDate.getUTCMilliseconds()).padStart(3, '0');
    
    // 转换为埃及时区（UTC+2）
    const egyptHours = (utcHours + 2) % 24;
    const egyptDay = utcDay;
    const egyptMonth = utcMonth;
    const egyptYear = utcYear;
    
    // 处理跨天的情况
    let finalDay = egyptDay;
    let finalMonth = egyptMonth;
    let finalYear = egyptYear;
    if (utcHours + 2 >= 24) {
      // 需要加一天
      const tempDate = new Date(Date.UTC(utcYear, utcDate.getUTCMonth(), utcDay + 1));
      finalDay = String(tempDate.getUTCDate()).padStart(2, '0');
      finalMonth = String(tempDate.getUTCMonth() + 1).padStart(2, '0');
      finalYear = tempDate.getUTCFullYear();
    }
    
    const finalHours = String(egyptHours).padStart(2, '0');
    
    // 返回 ISO 格式字符串，使用埃及时区（UTC+2）
    return `${finalYear}-${finalMonth}-${finalDay}T${finalHours}:${utcMinutes}:${utcSeconds}.${utcMilliseconds}+02:00`;
  } catch (error) {
    logger.warn('转换UTC时间失败，使用当前时间', { error: error.message, utcTimeString });
    return getCurrentLocalTimeISOString();
  }
}

/**
 * 更新汇率API数据
 * @param {Object} exchangeRates - 汇率数据对象，可能是：
 *   - 旧格式：{CNY: {EGP: 6.74}, USD: {EGP: 30.5}, ...}
 *   - 新格式：{rates: {CNY: {EGP: 6.74}, ...}, updateTime: "2025-12-26T18:00:00Z"}
 * @returns {Promise<Object>} 更新后的API数据
 */
async function updateExchangeRateAPI(exchangeRates) {
  try {
    // 查找exchange-rate API记录
    const api = await getAsync(
      `SELECT id, name, path, method, response_content, status 
       FROM custom_apis 
       WHERE path = ? AND method = 'GET' AND status = 'active'`,
      ['/exchange-rate']
    );

    if (!api) {
      throw new Error('未找到 /exchange-rate API记录，请先在博客管理中创建汇率转换API');
    }

    // 解析现有的response_content
    let existingData = {};
    try {
      existingData = JSON.parse(api.response_content);
    } catch (e) {
      logger.warn('解析现有汇率数据失败，将创建新数据', { error: e.message });
      existingData = {};
    }

    // 保留标准字段（id, name, title等）
    const standardFields = ['id', 'name', 'title', 'slug', 'excerpt', 'description', 
                            'htmlContent', 'image', 'category', 'tags', 'published', 
                            'views', 'createdAt', 'updatedAt', 'detailApi'];
    
    // 检查数据结构：可能是数组、对象（带"0"键）或直接对象
    let targetItem = null;
    let isArray = false;
    let isObjectWithNumericKey = false;
    
    if (Array.isArray(existingData)) {
      // 如果是数组，使用第一个元素
      isArray = true;
      targetItem = existingData[0] || {};
    } else if (existingData && typeof existingData === 'object') {
      // 检查是否有数字键（如"0"）
      const numericKeys = Object.keys(existingData).filter(key => /^\d+$/.test(key));
      if (numericKeys.length > 0) {
        // 有数字键，使用第一个数字键对应的对象
        isObjectWithNumericKey = true;
        const firstKey = numericKeys[0];
        targetItem = existingData[firstKey] || {};
      } else {
        // 直接是对象，使用对象本身
        targetItem = existingData;
      }
    } else {
      // 空数据，创建新对象
      targetItem = {};
    }
    
    // 创建更新后的数据项
    const updatedItem = {};
    
    // 只保留标准字段，清除所有旧的汇率数据
    standardFields.forEach(field => {
      if (targetItem[field] !== undefined) {
        updatedItem[field] = targetItem[field];
      }
    });

    // 处理汇率数据：支持新格式 {rates: {...}, updateTime: "..."} 和旧格式 {...}
    let ratesData = exchangeRates;
    let apiUpdateTime = null;
    
    if (exchangeRates && exchangeRates.rates && typeof exchangeRates.rates === 'object') {
      // 新格式：{rates: {...}, updateTime: "..."}
      ratesData = exchangeRates.rates;
      apiUpdateTime = exchangeRates.updateTime || null;
      logger.info('检测到新格式汇率数据，使用API返回的时间', { updateTime: apiUpdateTime });
    } else {
      // 旧格式：直接是汇率对象
      ratesData = exchangeRates;
      logger.info('使用旧格式汇率数据，将使用当前时间');
    }

    // 直接添加新的汇率数据（不保留旧的）
    Object.keys(ratesData).forEach(baseCurrency => {
      updatedItem[baseCurrency] = ratesData[baseCurrency];
    });

    // 更新updateTime字段：优先使用API返回的时间，否则使用当前时间
    if (apiUpdateTime) {
      // 将API返回的UTC时间转换为本地时区格式
      updatedItem.updateTime = convertUTCToLocalISOString(apiUpdateTime);
      logger.info('使用API返回的汇率更新时间', { 
        apiTime: apiUpdateTime, 
        localTime: updatedItem.updateTime 
      });
    } else {
      // 如果没有API时间，使用当前本地时间
      updatedItem.updateTime = getCurrentLocalTimeISOString();
      logger.info('使用当前时间作为汇率更新时间');
    }
    
    // 根据原始数据结构重建响应数据
    let updatedData;
    if (isArray) {
      // 如果是数组，更新第一个元素
      updatedData = [updatedItem];
    } else if (isObjectWithNumericKey) {
      // 如果是对象带数字键，保持结构
      updatedData = {};
      const firstKey = Object.keys(existingData).find(key => /^\d+$/.test(key)) || '0';
      updatedData[firstKey] = updatedItem;
    } else {
      // 直接是对象，使用更新后的对象
      updatedData = updatedItem;
    }

    // 更新 custom_apis 表
    const responseContent = JSON.stringify(updatedData, null, 2);
    await runAsync(
      `UPDATE custom_apis 
       SET response_content = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [responseContent, api.id]
    );

    // 同时更新 blog_posts 表中的汇率文章，确保从 blog_posts 读取时也是最新数据
    try {
      // 查找汇率相关的文章（支持中文名称和完整名称）
      const apiNameChinese = api.name.match(/[\u4e00-\u9fa5]+/)?.[0] || '';
      const exchangePosts = await allAsync(
        `SELECT id FROM blog_posts 
         WHERE (api_name = ? OR api_name = ? OR category = ? OR category = ?)
           AND (custom_fields LIKE '%"exchange-rate"%' OR custom_fields LIKE '%"汇率转换"%')
         LIMIT 10`,
        [api.name, apiNameChinese || '汇率转换', api.name, apiNameChinese || '汇率转换']
      );

      if (exchangePosts.length > 0) {
        // 构建更新数据：将汇率数据存储到 custom_fields._specialData
        const specialData = {};
        Object.keys(ratesData).forEach(baseCurrency => {
          specialData[baseCurrency] = ratesData[baseCurrency];
        });
        specialData.updateTime = updatedItem.updateTime;

        // 更新每篇文章
        for (const post of exchangePosts) {
          try {
            // 获取现有的 custom_fields
            const existingPost = await getAsync(
              `SELECT custom_fields FROM blog_posts WHERE id = ?`,
              [post.id]
            );

            let customFields = {};
            if (existingPost && existingPost.custom_fields) {
              try {
                customFields = JSON.parse(existingPost.custom_fields);
              } catch (e) {
                logger.warn('解析现有 custom_fields 失败', { postId: post.id, error: e.message });
              }
            }

            // 获取文章的 api_name，确保使用正确的 API 名称
            const postInfo = await getAsync(
              `SELECT api_name FROM blog_posts WHERE id = ?`,
              [post.id]
            );
            const postApiName = postInfo?.api_name || api.name;

            // 构建更新数据：将汇率数据存储到 custom_fields._specialData
            const updateData = {
              apiName: postApiName, // 确保传递 apiName，这样 updateBlogPost 才能正确识别类型
              _specialData: specialData,
              _specialType: 'exchange-rate'
            };

            // 如果 updatedItem 中有标准字段，也更新
            if (updatedItem.name) updateData.name = updatedItem.name;
            if (updatedItem.title) updateData.title = updatedItem.title;

            await updateBlogPost(post.id, updateData);

            logger.info('已更新 blog_posts 中的汇率文章', {
              postId: post.id,
              updateTime: updatedItem.updateTime
            });
          } catch (postError) {
            logger.warn('更新 blog_posts 中的汇率文章失败', {
              postId: post.id,
              error: postError.message
            });
          }
        }
      } else {
        logger.info('未找到 blog_posts 中的汇率文章，跳过更新');
      }
    } catch (blogError) {
      // 如果更新 blog_posts 失败，不影响主流程，只记录警告
      logger.warn('更新 blog_posts 表失败，但 custom_apis 已更新', {
        error: blogError.message
      });
    }

    logger.info('汇率API更新成功', {
      apiId: api.id,
      apiName: api.name,
      currencies: Object.keys(ratesData).length,
      updatedCurrencies: Object.keys(ratesData),
      updateTime: updatedItem.updateTime,
      apiUpdateTime: apiUpdateTime || '未提供'
    });

    // 重新加载自定义API路由
    await reloadCustomApiRoutes();

    return {
      success: true,
      apiId: api.id,
      apiName: api.name,
      currencies: Object.keys(ratesData).length,
      updatedData: updatedData,
      updateTime: updatedItem.updateTime
    };
  } catch (error) {
    logger.error('更新汇率API失败', { error: error.message });
    throw error;
  }
}

module.exports = {
  updateExchangeRateAPI
};
