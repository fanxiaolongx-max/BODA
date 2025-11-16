const { allAsync } = require('../db/database');
const { logger } = require('./logger');

/**
 * 计算商品价格（考虑杯型和加料）
 * @param {Object} product - 商品对象
 * @param {string|null} size - 杯型
 * @param {Array<string>} toppingIds - 加料ID数组
 * @param {Object} toppingProductsMap - 加料产品映射表（ID -> 产品对象）
 * @returns {Promise<{price: number, toppingNames: Array<string>}>} 价格和加料名称
 */
async function calculateItemPrice(product, size, toppingIds, toppingProductsMap = null) {
  // 计算基础价格（根据杯型）
  let itemPrice = product.price;
  if (size) {
    try {
      const sizes = JSON.parse(product.sizes || '{}');
      if (sizes[size]) {
        itemPrice = sizes[size];
      }
    } catch (e) {
      // 记录错误日志，便于排查数据问题
      logger.error('产品价格JSON解析失败', { 
        productId: product.id,
        productName: product.name,
        sizes: product.sizes,
        requestedSize: size,
        error: e.message
      });
      // 继续使用默认价格
    }
  }

  // 计算加料价格
  let toppingPrice = 0;
  let toppingNames = [];
  if (toppingIds && Array.isArray(toppingIds) && toppingIds.length > 0) {
    for (const toppingId of toppingIds) {
      let topping = null;
      
      // 如果提供了加料产品映射表，直接使用
      if (toppingProductsMap && toppingProductsMap.has(toppingId)) {
        topping = toppingProductsMap.get(toppingId);
      } else {
        // 否则需要查询数据库（不推荐，应该使用批量查询）
        const { getAsync } = require('../db/database');
        topping = await getAsync('SELECT * FROM products WHERE id = ?', [toppingId]);
      }
      
      if (topping) {
        toppingPrice += topping.price;
        toppingNames.push(topping.name);
      } else {
        // 记录警告日志，加料产品不存在
        logger.warn('加料产品不存在', { 
          toppingId, 
          productId: product.id,
          productName: product.name
        });
      }
    }
  }

  // 最终单价 = 基础价格 + 加料价格
  const finalPrice = itemPrice + toppingPrice;
  
  return {
    price: finalPrice,
    toppingNames
  };
}

/**
 * 批量查询加料产品
 * @param {Array<string>} toppingIds - 加料ID数组
 * @returns {Promise<Map<string, Object>>} 加料ID到产品对象的映射
 */
async function batchGetToppingProducts(toppingIds) {
  if (!toppingIds || toppingIds.length === 0) {
    return new Map();
  }

  // 去重
  const uniqueIds = [...new Set(toppingIds)];
  
  // 批量查询
  const placeholders = uniqueIds.map(() => '?').join(',');
  const products = await allAsync(
    `SELECT * FROM products WHERE id IN (${placeholders})`,
    uniqueIds
  );

  // 构建映射表
  const productMap = new Map();
  for (const product of products) {
    productMap.set(product.id, product);
  }

  return productMap;
}

/**
 * 批量获取订单项
 * @param {Array<string>} orderIds - 订单ID数组
 * @returns {Promise<Map<string, Array<Object>>>} 订单ID到订单项数组的映射
 */
async function batchGetOrderItems(orderIds) {
  if (!orderIds || orderIds.length === 0) {
    return new Map();
  }

  // 去重
  const uniqueIds = [...new Set(orderIds)];
  
  // 批量查询所有订单项
  const placeholders = uniqueIds.map(() => '?').join(',');
  const items = await allAsync(
    `SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY order_id, id`,
    uniqueIds
  );

  // 按订单ID分组
  const itemsMap = new Map();
  for (const item of items) {
    if (!itemsMap.has(item.order_id)) {
      itemsMap.set(item.order_id, []);
    }
    itemsMap.get(item.order_id).push(item);
  }

  // 确保所有订单ID都有对应的数组（即使为空）
  for (const orderId of uniqueIds) {
    if (!itemsMap.has(orderId)) {
      itemsMap.set(orderId, []);
    }
  }

  return itemsMap;
}

module.exports = {
  calculateItemPrice,
  batchGetToppingProducts,
  batchGetOrderItems
};

