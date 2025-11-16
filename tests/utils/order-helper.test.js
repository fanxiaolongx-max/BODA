const {
  calculateItemPrice,
  batchGetToppingProducts,
  batchGetOrderItems
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

