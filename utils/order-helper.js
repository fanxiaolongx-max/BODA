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
  let sizePrice = product.price; // 默认使用产品基础价格
  if (size) {
    try {
      const sizes = JSON.parse(product.sizes || '{}');
      if (sizes[size]) {
        itemPrice = sizes[size];
        sizePrice = sizes[size]; // 保存Size的基础价格
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

  // 计算加料价格 - 支持ID数组和名称数组两种格式
  let toppingPrice = 0;
  let toppingNames = [];
  if (toppingIds && Array.isArray(toppingIds) && toppingIds.length > 0) {
    for (const toppingItem of toppingIds) {
      let topping = null;
      let toppingName = null;
      
      // 检查是名称（字符串）还是ID（数字）或对象
      if (typeof toppingItem === 'string') {
        // 新格式：名称字符串，需要通过名称查找产品
        toppingName = toppingItem;
        if (toppingProductsMap && toppingProductsMap.has(toppingName)) {
          topping = toppingProductsMap.get(toppingName);
        } else {
          // 通过名称查找产品
          const { getAsync } = require('../db/database');
          topping = await getAsync('SELECT * FROM products WHERE name = ? AND status = ?', [toppingName, 'active']);
        }
      } else if (typeof toppingItem === 'number' || (typeof toppingItem === 'string' && !isNaN(toppingItem))) {
        // 旧格式：ID（数字或数字字符串），通过ID查找产品
        const toppingId = typeof toppingItem === 'string' ? parseInt(toppingItem) : toppingItem;
        if (toppingProductsMap && toppingProductsMap.has(toppingId)) {
          topping = toppingProductsMap.get(toppingId);
        } else {
          const { getAsync } = require('../db/database');
          topping = await getAsync('SELECT * FROM products WHERE id = ?', [toppingId]);
        }
      } else if (typeof toppingItem === 'object' && toppingItem !== null) {
        // 对象格式：包含 name 或 id，可能还包含 price
        if (toppingItem.name) {
          toppingName = toppingItem.name;
          
          // 如果对象中已经包含价格，直接使用（优先）
          if (toppingItem.price !== undefined && toppingItem.price !== null && toppingItem.price > 0) {
            toppingPrice += toppingItem.price;
            toppingNames.push(toppingName);
            continue; // 跳过数据库查询
          }
          
          // 否则通过名称查找产品获取价格
          if (toppingProductsMap && toppingProductsMap.has(toppingItem.name)) {
            topping = toppingProductsMap.get(toppingItem.name);
          } else {
            const { getAsync } = require('../db/database');
            topping = await getAsync('SELECT * FROM products WHERE name = ? AND status = ?', [toppingItem.name, 'active']);
          }
        } else if (toppingItem.id) {
          // 通过ID查找
          const toppingId = typeof toppingItem.id === 'string' ? parseInt(toppingItem.id) : toppingItem.id;
          if (toppingProductsMap && toppingProductsMap.has(toppingId)) {
            topping = toppingProductsMap.get(toppingId);
          } else {
            const { getAsync } = require('../db/database');
            topping = await getAsync('SELECT * FROM products WHERE id = ?', [toppingId]);
          }
        }
      }
      
      if (topping) {
        toppingPrice += topping.price;
        toppingNames.push(topping.name);
      } else {
        // 如果没有找到产品，但有名称为，使用名称（价格设为0）
        if (toppingName) {
          toppingNames.push(toppingName);
          // 记录警告日志，加料产品不存在
          logger.warn('加料产品不存在（使用名称）', { 
            toppingName, 
            productId: product.id,
            productName: product.name
          });
        } else {
          // 记录警告日志，加料产品不存在
          logger.warn('加料产品不存在', { 
            toppingItem, 
            productId: product.id,
            productName: product.name
          });
        }
      }
    }
  }

  // 最终单价 = 基础价格 + 加料价格
  const finalPrice = itemPrice + toppingPrice;
  
  // 构建包含价格信息的加料数组（用于保存到订单）
  const toppingsWithPrice = [];
  if (toppingIds && Array.isArray(toppingIds) && toppingIds.length > 0) {
    for (let i = 0; i < toppingIds.length; i++) {
      const toppingItem = toppingIds[i];
      const toppingName = toppingNames[i];
      
      if (!toppingName) continue;
      
      // 如果原始数据是对象且包含价格，使用原始价格
      if (typeof toppingItem === 'object' && toppingItem !== null && toppingItem.price !== undefined && toppingItem.price !== null) {
        toppingsWithPrice.push({
          name: toppingName,
          price: toppingItem.price
        });
      } else {
        // 否则查找产品获取价格
        let topping = null;
        if (toppingProductsMap) {
          if (typeof toppingItem === 'string' && toppingProductsMap.has(toppingItem)) {
            topping = toppingProductsMap.get(toppingItem);
          } else if (typeof toppingItem === 'number' && toppingProductsMap.has(toppingItem)) {
            topping = toppingProductsMap.get(toppingItem);
          } else if (typeof toppingItem === 'object' && toppingItem !== null) {
            if (toppingItem.name && toppingProductsMap.has(toppingItem.name)) {
              topping = toppingProductsMap.get(toppingItem.name);
            } else if (toppingItem.id && toppingProductsMap.has(toppingItem.id)) {
              topping = toppingProductsMap.get(toppingItem.id);
            }
          }
        }
        
        // 如果找到了产品，使用产品价格；否则价格为0
        const price = topping ? topping.price : 0;
        toppingsWithPrice.push({
          name: toppingName,
          price: price
        });
      }
    }
  }
  
  return {
    price: finalPrice,
    toppingNames,
    toppingsWithPrice, // 新增：包含价格信息的加料数组
    sizePrice // 新增：Size的基础价格
  };
}

/**
 * 批量查询加料产品 - 支持ID数组和名称数组两种格式
 * @param {Array<string|number|object>} toppingIds - 加料ID或名称数组（或对象数组）
 * @returns {Promise<Map<string|number, Object>>} 加料ID/名称到产品对象的映射
 */
async function batchGetToppingProducts(toppingIds) {
  if (!toppingIds || toppingIds.length === 0) {
    return new Map();
  }

  // 分离ID和名称
  const ids = [];
  const names = [];
  toppingIds.forEach(item => {
    if (typeof item === 'number' || (typeof item === 'string' && !isNaN(item) && item.trim() !== '')) {
      ids.push(typeof item === 'string' ? parseInt(item) : item);
    } else if (typeof item === 'string') {
      names.push(item);
    } else if (typeof item === 'object' && item !== null) {
      if (item.id) {
        ids.push(typeof item.id === 'string' ? parseInt(item.id) : item.id);
      } else if (item.name) {
        names.push(item.name);
      }
    }
  });
  
  const productMap = new Map();
  
  // 通过ID批量查询
  if (ids.length > 0) {
    const uniqueIds = [...new Set(ids)];
    const placeholders = uniqueIds.map(() => '?').join(',');
    const products = await allAsync(
      `SELECT * FROM products WHERE id IN (${placeholders}) AND status = ?`,
      [...uniqueIds, 'active']
    );
    products.forEach(product => {
      // 同时用ID作为key
      productMap.set(product.id, product);
    });
  }
  
  // 通过名称批量查询
  if (names.length > 0) {
    const uniqueNames = [...new Set(names)];
    const placeholders = uniqueNames.map(() => '?').join(',');
    const products = await allAsync(
      `SELECT * FROM products WHERE name IN (${placeholders}) AND status = ?`,
      [...uniqueNames, 'active']
    );
    products.forEach(product => {
      // 同时用ID和名称作为key，方便查找
      productMap.set(product.id, product);
      productMap.set(product.name, product);
    });
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

