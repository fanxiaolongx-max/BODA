const { getAsync, runAsync } = require('../db/database');
const { logger } = require('./logger');
const { reloadCustomApiRoutes } = require('./custom-api-router');

/**
 * 更新汇率API数据
 * @param {Object} exchangeRates - 汇率数据对象 {CNY: {EGP: 6.74}, USD: {EGP: 30.5}, ...}
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

    // 直接添加新的汇率数据（不保留旧的）
    Object.keys(exchangeRates).forEach(baseCurrency => {
      updatedItem[baseCurrency] = exchangeRates[baseCurrency];
    });

    // 更新updateTime字段
    updatedItem.updateTime = new Date().toISOString();
    
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

    // 更新数据库
    const responseContent = JSON.stringify(updatedData, null, 2);
    await runAsync(
      `UPDATE custom_apis 
       SET response_content = ?, updated_at = datetime('now', 'localtime')
       WHERE id = ?`,
      [responseContent, api.id]
    );

    logger.info('汇率API更新成功', {
      apiId: api.id,
      apiName: api.name,
      currencies: Object.keys(exchangeRates).length,
      updatedCurrencies: Object.keys(exchangeRates)
    });

    // 重新加载自定义API路由
    await reloadCustomApiRoutes();

    return {
      success: true,
      apiId: api.id,
      apiName: api.name,
      currencies: Object.keys(exchangeRates).length,
      updatedData: updatedData
    };
  } catch (error) {
    logger.error('更新汇率API失败', { error: error.message });
    throw error;
  }
}

module.exports = {
  updateExchangeRateAPI
};
