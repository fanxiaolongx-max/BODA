const {
  calculateItemPrice,
  batchGetToppingProducts,
  batchGetOrderItems,
  roundAmount
} = require('../../utils/order-helper');
const { allAsync, runAsync } = require('../helpers/test-db');

// Mock数据库和logger模块
jest.mock('../../db/database', () => ({
  getAsync: require('../helpers/test-db').getAsync,
  allAsync: require('../helpers/test-db').allAsync
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn()
  }
}));

describe('Order Helper', () => {
  beforeEach(async () => {
    // 清理数据
    await runAsync('DELETE FROM order_items');
    await runAsync('DELETE FROM orders');
    await runAsync('DELETE FROM products');
  });

  describe('roundAmount', () => {
    it('should round amount to 2 decimal places correctly', () => {
      expect(roundAmount(100.456)).toBe(100.46);
      expect(roundAmount(100.454)).toBe(100.45);
      expect(roundAmount(100.455)).toBe(100.46); // 四舍五入
    });

    it('should handle zero', () => {
      expect(roundAmount(0)).toBe(0);
      expect(roundAmount(0.0)).toBe(0);
    });

    it('should handle negative numbers', () => {
      expect(roundAmount(-100.456)).toBe(-100.46);
      expect(roundAmount(-0.01)).toBe(-0.01);
    });

    it('should handle large numbers', () => {
      expect(roundAmount(999999.999)).toBe(1000000);
      expect(roundAmount(1234567.89)).toBe(1234567.89);
    });

    it('should handle floating point precision issues', () => {
      // 经典的浮点数精度问题
      expect(roundAmount(0.1 + 0.2)).toBe(0.3);
      expect(roundAmount(0.1 * 3)).toBe(0.3);
      expect(roundAmount(0.3 - 0.1)).toBe(0.2);
    });

    it('should handle invalid inputs gracefully', () => {
      expect(roundAmount(null)).toBe(0);
      expect(roundAmount(undefined)).toBe(0);
      expect(roundAmount('')).toBe(0);
      expect(roundAmount('100.50')).toBe(100.5);
    });

    it('should handle numbers with more than 2 decimal places', () => {
      expect(roundAmount(100.999)).toBe(101);
      expect(roundAmount(100.995)).toBe(101);
      expect(roundAmount(100.994)).toBe(100.99);
      expect(roundAmount(0.001)).toBe(0);
      expect(roundAmount(0.005)).toBe(0.01);
    });

    it('should handle exact 2 decimal places', () => {
      expect(roundAmount(100.00)).toBe(100);
      expect(roundAmount(100.10)).toBe(100.1);
      expect(roundAmount(100.11)).toBe(100.11);
    });
  });

  describe('calculateItemPrice', () => {
    it('should calculate price with default product price', async () => {
      const product = { id: 1, name: 'Test Product', price: 100, sizes: '{}' };
      const result = await calculateItemPrice(product, null, []);
      
      expect(result.price).toBe(100);
      expect(result.toppingNames).toEqual([]);
    });

    it('should calculate price with size', async () => {
      const product = {
        id: 1,
        name: 'Test Product',
        price: 100,
        sizes: JSON.stringify({ large: 150, medium: 120 })
      };
      const result = await calculateItemPrice(product, 'large', []);
      
      expect(result.price).toBe(150);
    });

    it('should use default price if size not found', async () => {
      const product = {
        id: 1,
        name: 'Test Product',
        price: 100,
        sizes: JSON.stringify({ large: 150 })
      };
      const result = await calculateItemPrice(product, 'medium', []);
      
      expect(result.price).toBe(100);
    });

    it('should calculate price with toppings', async () => {
      const product = { id: 1, name: 'Test Product', price: 100, sizes: '{}' };
      
      // 创建加料产品
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [2, 'Topping 1', 20, 'active']
      );
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [3, 'Topping 2', 15, 'active']
      );

      const toppingMap = new Map();
      toppingMap.set('2', { id: 2, name: 'Topping 1', price: 20 });
      toppingMap.set('3', { id: 3, name: 'Topping 2', price: 15 });

      const result = await calculateItemPrice(product, null, ['2', '3'], toppingMap);
      
      expect(result.price).toBe(135); // 100 + 20 + 15
      expect(result.toppingNames).toEqual(['Topping 1', 'Topping 2']);
    });

    it('should handle invalid sizes JSON gracefully', async () => {
      const product = {
        id: 1,
        name: 'Test Product',
        price: 100,
        sizes: 'invalid json'
      };
      const result = await calculateItemPrice(product, 'large', []);
      
      expect(result.price).toBe(100); // 使用默认价格
    });

    it('should calculate price with topping objects containing price field', async () => {
      const product = { id: 1, name: 'Test Product', price: 100, sizes: '{}' };
      
      const toppingObjects = [
        { name: 'Topping 1', price: 20 },
        { name: 'Topping 2', price: 15 }
      ];
      
      const result = await calculateItemPrice(product, null, toppingObjects);
      
      expect(result.price).toBe(135); // 100 + 20 + 15
      expect(result.toppingNames).toEqual(['Topping 1', 'Topping 2']);
      expect(result.toppingsWithPrice).toEqual([
        { name: 'Topping 1', price: 20 },
        { name: 'Topping 2', price: 15 }
      ]);
    });

    it('should calculate price with topping names (string format)', async () => {
      const product = { id: 1, name: 'Test Product', price: 100, sizes: '{}' };
      
      // 创建加料产品
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [2, 'Pearl', 10, 'active']
      );
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [3, 'Jelly', 15, 'active']
      );
      
      const result = await calculateItemPrice(product, null, ['Pearl', 'Jelly']);
      
      expect(result.price).toBe(125); // 100 + 10 + 15
      expect(result.toppingNames).toEqual(['Pearl', 'Jelly']);
    });

    it('should calculate price with topping IDs (number format)', async () => {
      const product = { id: 1, name: 'Test Product', price: 100, sizes: '{}' };
      
      // 创建加料产品
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [2, 'Topping 1', 20, 'active']
      );
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [3, 'Topping 2', 15, 'active']
      );
      
      const toppingMap = new Map();
      toppingMap.set(2, { id: 2, name: 'Topping 1', price: 20 });
      toppingMap.set(3, { id: 3, name: 'Topping 2', price: 15 });
      
      const result = await calculateItemPrice(product, null, [2, 3], toppingMap);
      
      expect(result.price).toBe(135); // 100 + 20 + 15
      expect(result.toppingNames).toEqual(['Topping 1', 'Topping 2']);
    });

    it('should calculate price with mixed topping formats', async () => {
      const product = { id: 1, name: 'Test Product', price: 100, sizes: '{}' };
      
      // 创建加料产品
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [2, 'Topping 1', 20, 'active']
      );
      
      const toppingMap = new Map();
      toppingMap.set(2, { id: 2, name: 'Topping 1', price: 20 });
      toppingMap.set('Topping 2', { id: 3, name: 'Topping 2', price: 15 });
      
      // 混合格式：ID、名称、对象
      const mixedToppings = [
        2, // ID
        'Topping 2', // 名称
        { name: 'Topping 3', price: 10 } // 对象带价格
      ];
      
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [3, 'Topping 2', 15, 'active']
      );
      
      const result = await calculateItemPrice(product, null, mixedToppings, toppingMap);
      
      expect(result.price).toBe(145); // 100 + 20 + 15 + 10
      expect(result.toppingNames.length).toBe(3);
    });

    it('should handle non-existent topping products gracefully', async () => {
      const product = { id: 1, name: 'Test Product', price: 100, sizes: '{}' };
      
      const result = await calculateItemPrice(product, null, ['NonExistentTopping']);
      
      expect(result.price).toBe(100); // 基础价格不变
      expect(result.toppingNames).toEqual(['NonExistentTopping']); // 名称仍然保留
      expect(result.toppingsWithPrice[0].price).toBe(0); // 价格为0
    });

    it('should accumulate multiple topping prices correctly', async () => {
      const product = { id: 1, name: 'Test Product', price: 100, sizes: '{}' };
      
      // 创建多个加料产品
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [2, 'Topping 1', 10, 'active']
      );
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [3, 'Topping 2', 20, 'active']
      );
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [4, 'Topping 3', 30, 'active']
      );
      
      const toppingMap = new Map();
      toppingMap.set(2, { id: 2, name: 'Topping 1', price: 10 });
      toppingMap.set(3, { id: 3, name: 'Topping 2', price: 20 });
      toppingMap.set(4, { id: 4, name: 'Topping 3', price: 30 });
      
      const result = await calculateItemPrice(product, null, [2, 3, 4], toppingMap);
      
      expect(result.price).toBe(160); // 100 + 10 + 20 + 30
      expect(result.toppingNames.length).toBe(3);
    });

    it('should return correct sizePrice value', async () => {
      const product = {
        id: 1,
        name: 'Test Product',
        price: 100,
        sizes: JSON.stringify({ large: 150, medium: 120 })
      };
      
      const result = await calculateItemPrice(product, 'large', []);
      
      expect(result.sizePrice).toBe(150);
      expect(result.price).toBe(150);
    });

    it('should return default price as sizePrice when size not found', async () => {
      const product = {
        id: 1,
        name: 'Test Product',
        price: 100,
        sizes: JSON.stringify({ large: 150 })
      };
      
      const result = await calculateItemPrice(product, 'medium', []);
      
      expect(result.sizePrice).toBe(100); // 使用默认价格
      expect(result.price).toBe(100);
    });

    it('should handle empty topping array', async () => {
      const product = { id: 1, name: 'Test Product', price: 100, sizes: '{}' };
      
      const result = await calculateItemPrice(product, null, []);
      
      expect(result.price).toBe(100);
      expect(result.toppingNames).toEqual([]);
      expect(result.toppingsWithPrice).toEqual([]);
    });

    it('should handle null toppings', async () => {
      const product = { id: 1, name: 'Test Product', price: 100, sizes: '{}' };
      
      const result = await calculateItemPrice(product, null, null);
      
      expect(result.price).toBe(100);
      expect(result.toppingNames).toEqual([]);
      expect(result.toppingsWithPrice).toEqual([]);
    });

    it('should build toppingsWithPrice array correctly', async () => {
      const product = { id: 1, name: 'Test Product', price: 100, sizes: '{}' };
      
      // 创建加料产品
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [2, 'Topping 1', 20, 'active']
      );
      
      const toppingMap = new Map();
      toppingMap.set(2, { id: 2, name: 'Topping 1', price: 20 });
      
      const result = await calculateItemPrice(product, null, [2], toppingMap);
      
      expect(result.toppingsWithPrice).toHaveLength(1);
      expect(result.toppingsWithPrice[0]).toEqual({
        name: 'Topping 1',
        price: 20
      });
    });

    it('should use roundAmount for final price calculation', async () => {
      const product = { id: 1, name: 'Test Product', price: 100.456, sizes: '{}' };
      
      // 创建加料产品，价格也有小数
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [2, 'Topping 1', 20.333, 'active']
      );
      
      const toppingMap = new Map();
      toppingMap.set(2, { id: 2, name: 'Topping 1', price: 20.333 });
      
      const result = await calculateItemPrice(product, null, [2], toppingMap);
      
      // 应该使用 roundAmount 处理精度
      expect(result.price).toBe(120.79); // 100.456 + 20.333 = 120.789 -> 120.79
    });
  });

  describe('batchGetToppingProducts', () => {
    it('should batch get topping products', async () => {
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [1, 'Topping 1', 20, 'active']
      );
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [2, 'Topping 2', 15, 'active']
      );

      const productMap = await batchGetToppingProducts(['1', '2']);
      
      expect(productMap.size).toBe(2);
      // 注意：SQLite返回的ID可能是数字类型
      const product1 = productMap.get('1') || productMap.get(1);
      const product2 = productMap.get('2') || productMap.get(2);
      expect(product1.name).toBe('Topping 1');
      expect(product2.name).toBe('Topping 2');
    });

    it('should handle duplicate IDs', async () => {
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [1, 'Topping 1', 20, 'active']
      );

      const productMap = await batchGetToppingProducts(['1', '1', '1']);
      
      expect(productMap.size).toBe(1);
      // 注意：SQLite返回的ID可能是数字类型
      const product1 = productMap.get('1') || productMap.get(1);
      expect(product1.name).toBe('Topping 1');
    });

    it('should return empty map for empty input', async () => {
      const productMap = await batchGetToppingProducts([]);
      expect(productMap.size).toBe(0);
    });

    it('should return empty map for null input', async () => {
      const productMap = await batchGetToppingProducts(null);
      expect(productMap.size).toBe(0);
    });

    it('should not include non-existent products', async () => {
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [1, 'Topping 1', 20, 'active']
      );

      const productMap = await batchGetToppingProducts(['1', '999']);
      
      expect(productMap.size).toBe(1);
      expect(productMap.has('999')).toBe(false);
    });

    it('should batch get products by name (string format)', async () => {
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [1, 'Pearl', 10, 'active']
      );
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [2, 'Jelly', 15, 'active']
      );

      const productMap = await batchGetToppingProducts(['Pearl', 'Jelly']);
      
      expect(productMap.size).toBeGreaterThanOrEqual(2);
      // 产品可以通过ID或名称访问
      const pearl = productMap.get(1) || productMap.get('Pearl');
      const jelly = productMap.get(2) || productMap.get('Jelly');
      expect(pearl.name).toBe('Pearl');
      expect(jelly.name).toBe('Jelly');
    });

    it('should batch get products by object format with id field', async () => {
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [1, 'Topping 1', 20, 'active']
      );
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [2, 'Topping 2', 15, 'active']
      );

      const productMap = await batchGetToppingProducts([
        { id: 1 },
        { id: 2 }
      ]);
      
      expect(productMap.size).toBeGreaterThanOrEqual(2);
      const product1 = productMap.get(1);
      const product2 = productMap.get(2);
      expect(product1.name).toBe('Topping 1');
      expect(product2.name).toBe('Topping 2');
    });

    it('should batch get products by object format with name field', async () => {
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [1, 'Pearl', 10, 'active']
      );
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [2, 'Jelly', 15, 'active']
      );

      const productMap = await batchGetToppingProducts([
        { name: 'Pearl' },
        { name: 'Jelly' }
      ]);
      
      expect(productMap.size).toBeGreaterThanOrEqual(2);
      const pearl = productMap.get(1) || productMap.get('Pearl');
      const jelly = productMap.get(2) || productMap.get('Jelly');
      expect(pearl.name).toBe('Pearl');
      expect(jelly.name).toBe('Jelly');
    });

    it('should handle mixed format input (ID and name)', async () => {
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [1, 'Topping 1', 20, 'active']
      );
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [2, 'Pearl', 10, 'active']
      );

      const productMap = await batchGetToppingProducts([
        1, // ID
        'Pearl', // Name
        { id: 2 }, // Object with ID
        { name: 'Topping 1' } // Object with name
      ]);
      
      expect(productMap.size).toBeGreaterThanOrEqual(2);
      const product1 = productMap.get(1);
      const product2 = productMap.get(2);
      expect(product1.name).toBe('Topping 1');
      expect(product2.name).toBe('Pearl');
    });

    it('should filter out inactive products', async () => {
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [1, 'Active Topping', 20, 'active']
      );
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [2, 'Inactive Topping', 15, 'inactive']
      );

      const productMap = await batchGetToppingProducts([1, 2]);
      
      // 只应该返回活跃的产品
      expect(productMap.has(1)).toBe(true);
      expect(productMap.has(2)).toBe(false);
    });

    it('should handle large batch queries efficiently', async () => {
      // 创建大量加料产品
      const products = [];
      for (let i = 1; i <= 100; i++) {
        await runAsync(
          'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
          [i, `Topping ${i}`, 10 + i, 'active']
        );
        products.push(i);
      }

      const startTime = Date.now();
      const productMap = await batchGetToppingProducts(products);
      const endTime = Date.now();
      
      expect(productMap.size).toBe(100);
      // 批量查询应该在合理时间内完成（< 1秒）
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle string IDs correctly', async () => {
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [1, 'Topping 1', 20, 'active']
      );

      const productMap = await batchGetToppingProducts(['1']); // 字符串ID
      
      expect(productMap.size).toBeGreaterThanOrEqual(1);
      const product = productMap.get(1) || productMap.get('1');
      expect(product.name).toBe('Topping 1');
    });
  });

  describe('batchGetOrderItems', () => {
    it('should batch get order items', async () => {
      // 创建订单
      const orderId1 = 'order-1';
      const orderId2 = 'order-2';
      
      await runAsync(
        `INSERT INTO orders (id, order_number, customer_phone, total_amount, final_amount, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId1, 'BO12345678', '13800138000', 100, 100, 'pending']
      );
      await runAsync(
        `INSERT INTO orders (id, order_number, customer_phone, total_amount, final_amount, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId2, 'BO12345679', '13800138001', 150, 150, 'pending']
      );

      // 创建产品
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [1, 'Product 1', 100, 'active']
      );

      // 创建订单项
      await runAsync(
        `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId1, 1, 'Product 1', 100, 1, 100]
      );
      await runAsync(
        `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId2, 1, 'Product 1', 100, 1, 100]
      );
      await runAsync(
        `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId2, 1, 'Product 1', 50, 1, 50]
      );

      const itemsMap = await batchGetOrderItems([orderId1, orderId2]);
      
      expect(itemsMap.size).toBe(2);
      expect(itemsMap.get(orderId1).length).toBe(1);
      expect(itemsMap.get(orderId2).length).toBe(2);
    });

    it('should return empty array for order with no items', async () => {
      const orderId = 'order-empty';
      await runAsync(
        `INSERT INTO orders (id, order_number, customer_phone, total_amount, final_amount, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, 'BO12345678', '13800138000', 0, 0, 'pending']
      );

      const itemsMap = await batchGetOrderItems([orderId]);
      
      expect(itemsMap.size).toBe(1);
      expect(itemsMap.get(orderId)).toEqual([]);
    });

    it('should handle duplicate order IDs', async () => {
      const orderId = 'order-1';
      await runAsync(
        `INSERT INTO orders (id, order_number, customer_phone, total_amount, final_amount, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, 'BO12345678', '13800138000', 100, 100, 'pending']
      );
      await runAsync(
        'INSERT INTO products (id, name, price, status) VALUES (?, ?, ?, ?)',
        [1, 'Product 1', 100, 'active']
      );
      await runAsync(
        `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, 1, 'Product 1', 100, 1, 100]
      );

      const itemsMap = await batchGetOrderItems([orderId, orderId, orderId]);
      
      expect(itemsMap.size).toBe(1);
      expect(itemsMap.get(orderId).length).toBe(1);
    });

    it('should return empty map for empty input', async () => {
      const itemsMap = await batchGetOrderItems([]);
      expect(itemsMap.size).toBe(0);
    });

    it('should return empty map for null input', async () => {
      const itemsMap = await batchGetOrderItems(null);
      expect(itemsMap.size).toBe(0);
    });
  });
});

