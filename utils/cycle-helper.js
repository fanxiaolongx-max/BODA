const { getAsync } = require('../db/database');

/**
 * 查找订单所属的周期
 * @param {string} orderCreatedAt - 订单创建时间
 * @returns {Promise<Object|null>} 订单所属的周期对象，如果不存在则返回null
 */
async function findOrderCycle(orderCreatedAt) {
  // 查找包含订单时间的周期
  const cycle = await getAsync(
    `SELECT * FROM ordering_cycles 
     WHERE start_time <= ? 
     AND (end_time IS NULL OR end_time >= ?)
     ORDER BY start_time DESC LIMIT 1`,
    [orderCreatedAt, orderCreatedAt]
  );
  return cycle;
}

/**
 * 批量查找订单所属的周期
 * @param {Array<string>} orderCreatedAts - 订单创建时间数组
 * @returns {Promise<Map<string, Object>>} 订单时间到周期对象的映射
 */
async function findOrderCyclesBatch(orderCreatedAts) {
  if (!orderCreatedAts || orderCreatedAts.length === 0) {
    return new Map();
  }

  // 获取所有可能的周期（包含这些订单时间的周期）
  const minTime = orderCreatedAts.reduce((min, time) => 
    time < min ? time : min, orderCreatedAts[0]);
  const maxTime = orderCreatedAts.reduce((max, time) => 
    time > max ? time : max, orderCreatedAts[0]);

  const { allAsync } = require('../db/database');
  const cycles = await allAsync(
    `SELECT * FROM ordering_cycles 
     WHERE start_time <= ? 
     AND (end_time IS NULL OR end_time >= ?)
     ORDER BY start_time DESC`,
    [maxTime, minTime]
  );

  // 为每个订单时间找到对应的周期
  const cycleMap = new Map();
  for (const orderTime of orderCreatedAts) {
    // 找到包含该订单时间的周期（按开始时间降序，取第一个匹配的）
    const cycle = cycles.find(c => {
      const startTime = new Date(c.start_time);
      const endTime = c.end_time ? new Date(c.end_time) : new Date('9999-12-31');
      const orderDate = new Date(orderTime);
      return orderDate >= startTime && orderDate <= endTime;
    });
    if (cycle) {
      cycleMap.set(orderTime, cycle);
    }
  }

  return cycleMap;
}

/**
 * 判断订单是否属于活跃周期
 * @param {Object} orderCycle - 订单所属的周期
 * @param {Object|null} activeCycle - 当前活跃周期
 * @returns {boolean} 是否属于活跃周期
 */
function isActiveCycle(orderCycle, activeCycle) {
  if (!orderCycle) {
    return !activeCycle; // 如果没有找到周期，且没有活跃周期，则认为是当前周期
  }
  if (!activeCycle) {
    return true; // 如果没有活跃周期，所有订单都属于"当前周期"
  }
  return orderCycle.id === activeCycle.id;
}

/**
 * 判断订单是否已过期
 * @param {Object} order - 订单对象
 * @param {Object|null} activeCycle - 当前活跃周期
 * @param {Object|null} latestEndedCycle - 最近一个已结束的周期
 * @returns {boolean} 是否已过期
 */
function isOrderExpired(order, activeCycle, latestEndedCycle) {
  if (activeCycle) {
    // 如果存在活跃周期，检查订单是否在当前活跃周期之前
    const orderTime = new Date(order.created_at);
    const cycleStart = new Date(activeCycle.start_time);
    return orderTime < cycleStart;
  } else if (latestEndedCycle) {
    // 如果没有活跃周期，但有最近一个已结束的周期
    // 只有属于最近一个已结束周期的订单不标记为过期，其他都标记为过期
    const orderCycle = order.cycle_id;
    if (orderCycle && orderCycle !== latestEndedCycle.id) {
      return true;
    }
    if (!orderCycle) {
      return true; // 如果订单不属于任何周期，标记为过期
    }
    return false;
  } else {
    // 如果没有活跃周期，也没有已结束的周期，所有订单都不标记为过期
    return false;
  }
}

module.exports = {
  findOrderCycle,
  findOrderCyclesBatch,
  isActiveCycle,
  isOrderExpired
};

