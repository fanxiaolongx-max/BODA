/**
 * 修复所有文章的slug，确保唯一性和稳定性
 * 基于文章ID生成稳定的slug，避免重复
 */

const { allAsync, getAsync, runAsync, waitForDbReady } = require('./database');
const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * 生成稳定的slug（基于ID）
 */
function generateStableSlug(name, id) {
  // 基础slug从名称生成
  let baseSlug = name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
  
  // 如果slug为空，使用id的前8位
  if (!baseSlug) {
    baseSlug = String(id).substring(0, 8).replace(/[^a-z0-9]/g, '');
  }
  
  // 添加ID的前8位确保唯一性
  const idSuffix = String(id).substring(0, 8).replace(/[^a-z0-9]/g, '');
  return `${baseSlug}-${idSuffix}`;
}

/**
 * 修复单个API中的文章slug
 */
async function fixSlugsInApi(api) {
  try {
    const responseContent = JSON.parse(api.response_content);
    let items = [];
    let isWeatherObject = false;
    
    // 检查是否是天气路况的对象格式
    if (responseContent.globalAlert && responseContent.attractions && responseContent.traffic) {
      isWeatherObject = true;
      items = [responseContent];
    } else if (Array.isArray(responseContent)) {
      items = responseContent;
    } else if (responseContent.data && Array.isArray(responseContent.data)) {
      items = responseContent.data;
    } else {
      return { fixed: 0, skipped: 0 };
    }
    
    let fixedCount = 0;
    let skippedCount = 0;
    const slugMap = new Map(); // 用于跟踪已使用的slug
    
    // 修复每个item的slug
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // 跳过天气路况对象（它使用特殊的slug）
      if (isWeatherObject && i === 0) {
        if (!item.slug) {
          item.slug = 'weather';
        }
        continue;
      }
      
      // 确保有ID
      if (!item.id) {
        item.id = uuidv4();
        logger.warn(`为文章生成新ID`, { apiName: api.name, itemName: item.name || item.title });
      }
      
      // 生成稳定的slug
      const name = item.name || item.title || '未命名';
      const newSlug = generateStableSlug(name, item.id);
      
      // 检查slug是否已存在
      let finalSlug = newSlug;
      let counter = 1;
      while (slugMap.has(finalSlug)) {
        finalSlug = `${newSlug}-${counter}`;
        counter++;
      }
      
      // 如果slug改变了，更新它
      if (item.slug !== finalSlug) {
        logger.info(`修复slug`, { 
          apiName: api.name, 
          itemName: name,
          oldSlug: item.slug || '(空)',
          newSlug: finalSlug,
          id: item.id
        });
        item.slug = finalSlug;
        fixedCount++;
      }
      
      slugMap.set(finalSlug, item.id);
    }
    
    // 更新API的response_content
    let finalContent;
    if (isWeatherObject) {
      finalContent = items[0];
    } else if (Array.isArray(responseContent)) {
      finalContent = items;
    } else {
      finalContent = { ...responseContent, data: items };
    }
    
    await runAsync(
      `UPDATE custom_apis 
       SET response_content = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [JSON.stringify(finalContent), api.id]
    );
    
    return { fixed: fixedCount, skipped: skippedCount };
  } catch (error) {
    logger.error('修复API中的slug失败', { apiName: api.name, error: error.message });
    return { fixed: 0, skipped: 0, error: error.message };
  }
}

/**
 * 修复所有文章的slug
 */
async function fixAllPostSlugs() {
  await waitForDbReady();
  
  try {
    console.log('开始修复所有文章的slug...');
    
    // 获取所有GET方法的API
    const apis = await allAsync(`
      SELECT id, name, path, response_content
      FROM custom_apis
      WHERE method = 'GET' 
        AND status = 'active'
        AND path NOT LIKE '/blog/%'
      ORDER BY name ASC
    `);
    
    console.log(`找到 ${apis.length} 个API`);
    
    let totalFixed = 0;
    let totalSkipped = 0;
    const results = [];
    
    for (const api of apis) {
      console.log(`处理API: ${api.name}`);
      const result = await fixSlugsInApi(api);
      totalFixed += result.fixed || 0;
      totalSkipped += result.skipped || 0;
      results.push({ apiName: api.name, ...result });
    }
    
    console.log('\n修复完成！');
    console.log(`总计修复: ${totalFixed} 个slug`);
    console.log(`总计跳过: ${totalSkipped} 个`);
    
    // 显示详细结果
    console.log('\n详细结果:');
    results.forEach(r => {
      if (r.fixed > 0 || r.error) {
        console.log(`  ${r.apiName}: 修复 ${r.fixed} 个${r.error ? ` (错误: ${r.error})` : ''}`);
      }
    });
    
    return { success: true, totalFixed, totalSkipped, results };
  } catch (error) {
    logger.error('修复slug失败', { error: error.message });
    console.error('修复失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  fixAllPostSlugs()
    .then(() => {
      console.log('\n修复完成！');
      process.exit(0);
    })
    .catch(error => {
      console.error('修复失败:', error);
      process.exit(1);
    });
}

module.exports = { fixAllPostSlugs, generateStableSlug };
