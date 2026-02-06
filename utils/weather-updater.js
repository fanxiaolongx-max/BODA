const { getAsync, runAsync, allAsync } = require('../db/database');
const { logger } = require('./logger');
const { reloadCustomApiRoutes } = require('./custom-api-router');
const { updateBlogPost } = require('./blog-helper');

async function findWeatherApi() {
  const possiblePaths = ['/weather', '/天气', '/天气路况'];
  for (const p of possiblePaths) {
    const api = await getAsync(
      `SELECT id, name, path, method, response_content, status
       FROM custom_apis
       WHERE path = ? AND method = 'GET' AND status = 'active'
       LIMIT 1`,
      [p]
    );
    if (api) return api;
  }

  const byName = await getAsync(
    `SELECT id, name, path, method, response_content, status
     FROM custom_apis
     WHERE (name LIKE '%天气%' OR name LIKE '%weather%' OR path LIKE '%weather%')
       AND method = 'GET' AND status = 'active'
     LIMIT 1`
  );
  return byName || null;
}

async function updateWeatherAPI(weatherContent) {
  const api = await findWeatherApi();
  if (!api) {
    throw new Error('未找到天气路况API（/weather）');
  }

  const responseContent = JSON.stringify(weatherContent, null, 2);
  await runAsync(
    `UPDATE custom_apis
     SET response_content = ?, updated_at = datetime('now', 'localtime')
     WHERE id = ?`,
    [responseContent, api.id]
  );

  // 同步更新 blog_posts 中的天气路况文章，确保小程序按分类读取也能拿到最新数据
  try {
    const apiNameChinese =
      (api.name && api.name.match(/[\u4e00-\u9fa5]+/g)?.join('').trim()) || '天气路况';

    const weatherPosts = await allAsync(
      `SELECT id, api_name, category
       FROM blog_posts
       WHERE api_name = ?
          OR category = ?
          OR api_name = ?
          OR category = ?
          OR api_name LIKE ?
          OR category LIKE ?
       LIMIT 20`,
      [api.name, api.name, apiNameChinese, apiNameChinese, '%weather%', '%天气%']
    );

    if (weatherPosts.length > 0) {
      let updatedCount = 0;
      for (const post of weatherPosts) {
        try {
          await updateBlogPost(post.id, {
            apiName: post.api_name || api.name,
            _specialData: weatherContent,
            _specialType: 'weather'
          });
          updatedCount += 1;
        } catch (postError) {
          logger.warn('更新 blog_posts 中的天气文章失败', {
            postId: post.id,
            error: postError.message
          });
        }
      }

      logger.info('已同步更新 blog_posts 中的天气路况文章', {
        count: updatedCount
      });
    } else {
      logger.info('未找到 blog_posts 中的天气路况文章，跳过同步');
    }
  } catch (blogError) {
    logger.warn('同步 blog_posts 天气路况文章失败，但 custom_apis 已更新', {
      error: blogError.message
    });
  }

  try {
    await reloadCustomApiRoutes();
  } catch (error) {
    logger.warn('重新加载自定义路由失败（天气更新）', { error: error.message });
  }

  logger.info('天气路况API更新成功', {
    apiId: api.id,
    apiName: api.name,
    path: api.path,
    attractions: Array.isArray(weatherContent?.attractions) ? weatherContent.attractions.length : 0,
    traffic: Array.isArray(weatherContent?.traffic) ? weatherContent.traffic.length : 0
  });

  return {
    success: true,
    apiId: api.id,
    apiName: api.name,
    apiPath: api.path
  };
}

module.exports = {
  updateWeatherAPI,
  findWeatherApi
};
