const request = require('supertest');
const express = require('express');
const session = require('express-session');
const { runAsync, getAsync } = require('../helpers/test-db');
const { createAdminWithPassword, mockAdmin, mockCategory, mockProduct } = require('../helpers/mock-data');

// Mock数据库和logger模块
jest.mock('../../db/database', () => ({
  getAsync: require('../helpers/test-db').getAsync,
  runAsync: require('../helpers/test-db').runAsync,
  allAsync: require('../helpers/test-db').allAsync,
  beginTransaction: require('../helpers/test-db').beginTransaction,
  commit: require('../helpers/test-db').commit,
  rollback: require('../helpers/test-db').rollback
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  logAction: jest.fn().mockResolvedValue(undefined)
}));

// Mock Excel生成和邮件发送（异步操作）
jest.mock('../../utils/email', () => ({
  sendCycleExportEmail: jest.fn().mockResolvedValue({ success: true })
}));

// Mock Excel文件生成函数（在admin.js中）
jest.mock('../../routes/admin', () => {
  const actualModule = jest.requireActual('../../routes/admin');
  // 注意：generateCycleExcelFile是内部函数，不需要mock
  return actualModule;
});

// 创建测试应用
function createApp() {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
    store: new (require('express-session').MemoryStore)()
  }));

  // 添加auth路由（admin路由需要先登录）
  const authRoutes = require('../../routes/auth');
  app.use('/api/auth', authRoutes);

  // 注意：admin路由需要requireAuth中间件，在测试中需要先登录
  const adminRoutes = require('../../routes/admin');
  app.use('/api/admin', adminRoutes);

  const publicRoutes = require('../../routes/public');
  app.use('/api/public', publicRoutes);

  return app;
}

describe('Integration: Order - Discount - Cycle Confirmation Flow', () => {
  let app;
  let adminId;
  let userId;
  let categoryId;
  let productId;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    // 清理数据（按外键依赖顺序）
    await runAsync('DELETE FROM order_items');
    await runAsync('DELETE FROM orders');
    await runAsync('DELETE FROM ordering_cycles');
    await runAsync('DELETE FROM discount_rules');
    await runAsync('DELETE FROM products');
    await runAsync('DELETE FROM categories');
    await runAsync('DELETE FROM logs');
    await runAsync('DELETE FROM admins');
    await runAsync('DELETE FROM settings');
    await runAsync('DELETE FROM users');

    // 确保没有未提交的事务
    try {
      await runAsync('ROLLBACK');
    } catch (e) {
      // 忽略错误，可能没有活动事务
    }

    // 创建测试管理员
    const adminData = await createAdminWithPassword(mockAdmin);
    const adminResult = await runAsync(
      'INSERT INTO admins (username, password, name, email, role, status) VALUES (?, ?, ?, ?, ?, ?)',
      [adminData.username, adminData.password, adminData.name, adminData.email, adminData.role, adminData.status]
    );
    adminId = adminResult.id;

    // 创建测试用户
    const userResult = await runAsync(
      'INSERT INTO users (phone, name) VALUES (?, ?)',
      ['13800138000', 'Test User']
    );
    userId = userResult.id;

    // 创建测试分类
    const categoryResult = await runAsync(
      'INSERT INTO categories (name, description, status) VALUES (?, ?, ?)',
      [mockCategory.name, mockCategory.description, mockCategory.status]
    );
    categoryId = categoryResult.id;

    // 创建测试产品
    const productResult = await runAsync(
      'INSERT INTO products (name, description, price, category_id, status) VALUES (?, ?, ?, ?, ?)',
      [mockProduct.name, mockProduct.description, mockProduct.price, categoryId, mockProduct.status]
    );
    productId = productResult.id;

    // 设置点单为开放状态
    await runAsync(
      "INSERT INTO settings (key, value) VALUES ('ordering_open', 'true')"
    );
  });

  describe('Complete Flow: Create Order -> Calculate Discount -> Confirm Cycle', () => {
    it('should complete full flow: order creation, discount calculation, and cycle confirmation', async () => {
      const agent = request.agent(app);

      // Step 1: Admin login
      await agent
        .post('/api/auth/admin/login')
        .send({ username: mockAdmin.username, password: mockAdmin.password });

      // Step 2: Create an active cycle
      const cycleResult = await runAsync(
        `INSERT INTO ordering_cycles (cycle_number, start_time, status, total_amount, discount_rate)
         VALUES (?, datetime('now', 'localtime'), 'active', 0, 0)`,
        ['CYCLE' + Date.now()]
      );
      const cycleId = cycleResult.id;

      // Step 3: Create discount rules
      await runAsync(
        'INSERT INTO discount_rules (min_amount, max_amount, discount_rate, description, status) VALUES (?, ?, ?, ?, ?)',
        [100, null, 10, '10% discount for 100+', 'active']
      );

      // Step 4: User creates an order (simulate via direct DB insert for simplicity)
      const orderId = 'test-order-' + Date.now();
      const orderNumber = 'BO' + Date.now().toString().slice(-8);
      await runAsync(
        `INSERT INTO orders (id, order_number, user_id, customer_name, customer_phone, 
         total_amount, discount_amount, final_amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [orderId, orderNumber, userId, 'Test User', '13800138000', 150, 0, 150, 'pending']
      );

      // Step 5: Update cycle total_amount
      await runAsync(
        'UPDATE ordering_cycles SET total_amount = ? WHERE id = ?',
        [150, cycleId]
      );

      // Step 6: Close ordering
      await runAsync(
        "UPDATE settings SET value = 'false' WHERE key = 'ordering_open'"
      );

      // Step 7: End the cycle
      await runAsync(
        `UPDATE ordering_cycles 
         SET end_time = datetime('now', 'localtime'), status = 'ended' 
         WHERE id = ?`,
        [cycleId]
      );

      // Step 8: Calculate discount (via public API)
      const discountResponse = await request(app)
        .post('/api/public/calculate-discount');

      expect(discountResponse.status).toBe(200);
      expect(discountResponse.body.success).toBe(true);
      expect(discountResponse.body.discount_applied).toBe(true);
      expect(discountResponse.body.discount_rate).toBe(0.1);

      // Verify order discount was updated
      let order = await getAsync('SELECT * FROM orders WHERE id = ?', [orderId]);
      expect(order.discount_amount).toBe(15); // 150 * 0.1
      expect(order.final_amount).toBe(135); // 150 - 15
      expect(order.status).toBe('pending'); // Still pending

      // Step 9: Confirm cycle (via admin API)
      const confirmResponse = await agent
        .post(`/api/admin/cycles/${cycleId}/confirm`);

      expect(confirmResponse.status).toBe(200);
      expect(confirmResponse.body.success).toBe(true);
      expect(confirmResponse.body.discountRate).toBe(10); // Percentage format
      expect(confirmResponse.body.orderCount).toBe(1);
      expect(confirmResponse.body.cancelledCount).toBe(1);

      // Verify order was cancelled
      order = await getAsync('SELECT * FROM orders WHERE id = ?', [orderId]);
      expect(order.status).toBe('cancelled');
      // Discount should be recalculated based on cycle total_amount
      // Cycle total_amount is 150, so discount rate is 10%
      expect(order.discount_amount).toBe(15);
      expect(order.final_amount).toBe(135);

      // Verify cycle status
      const cycle = await getAsync('SELECT * FROM ordering_cycles WHERE id = ?', [cycleId]);
      expect(cycle.status).toBe('confirmed');
      expect(cycle.discount_rate).toBe(10);
      expect(cycle.confirmed_at).toBeDefined();
    });

    it('should handle multiple orders in the flow', async () => {
      const agent = request.agent(app);

      // Admin login
      await agent
        .post('/api/auth/admin/login')
        .send({ username: mockAdmin.username, password: mockAdmin.password });

      // Create active cycle with start_time 1 day ago
      const cycleStartTime = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
      const cycleResult = await runAsync(
        `INSERT INTO ordering_cycles (cycle_number, start_time, status, total_amount, discount_rate)
         VALUES (?, ?, 'active', 0, 0)`,
        ['CYCLE' + Date.now(), cycleStartTime]
      );
      const cycleId = cycleResult.id;

      // Create discount rules
      await runAsync(
        'INSERT INTO discount_rules (min_amount, max_amount, discount_rate, description, status) VALUES (?, ?, ?, ?, ?)',
        [200, null, 15, '15% discount for 200+', 'active']
      );
      await runAsync(
        'INSERT INTO discount_rules (min_amount, max_amount, discount_rate, description, status) VALUES (?, ?, ?, ?, ?)',
        [100, null, 10, '10% discount for 100+', 'active']
      );

      // Create multiple orders within cycle time range
      const orderIds = [];
      let totalAmount = 0;
      
      for (let i = 0; i < 3; i++) {
        const orderId = 'test-order-' + Date.now() + '-' + i;
        const orderNumber = 'BO' + (Date.now() + i).toString().slice(-8);
        const orderAmount = 80 + i * 10; // 80, 90, 100
        totalAmount += orderAmount;
        // 使用周期开始时间之后的时间，确保订单在周期范围内（12-14小时前，在周期开始时间之后）
        const orderTime = new Date(Date.now() - (12 + i) * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

        await runAsync(
          `INSERT INTO orders (id, order_number, user_id, customer_name, customer_phone, 
           total_amount, discount_amount, final_amount, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderId, orderNumber, userId, 'Test User', `1380013800${i}`, orderAmount, 0, orderAmount, 'pending', orderTime]
        );
        orderIds.push(orderId);
      }

      // Update cycle total_amount
      await runAsync(
        'UPDATE ordering_cycles SET total_amount = ? WHERE id = ?',
        [totalAmount, cycleId]
      );

      // Close ordering and end cycle (end_time is now)
      await runAsync(
        "UPDATE settings SET value = 'false' WHERE key = 'ordering_open'"
      );
      const cycleEndTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await runAsync(
        `UPDATE ordering_cycles 
         SET end_time = ?, status = 'ended' 
         WHERE id = ?`,
        [cycleEndTime, cycleId]
      );

      // Calculate discount
      const discountResponse = await request(app)
        .post('/api/public/calculate-discount');

      expect(discountResponse.status).toBe(200);
      // 总金额是270（80+90+100），规则按min_amount DESC排序：
      // - 200+ 15%折扣（先匹配）
      // - 100+ 10%折扣
      // 所以应该匹配15%的规则
      expect(discountResponse.body.discount_rate).toBe(0.15); // Total is 270, matches 15% rule (200+)

      // Verify all orders have discount applied
      for (const orderId of orderIds) {
        const order = await getAsync('SELECT * FROM orders WHERE id = ?', [orderId]);
        expect(order.discount_amount).toBeGreaterThan(0);
        expect(order.final_amount).toBeLessThan(order.total_amount);
      }

      // Confirm cycle
      const confirmResponse = await agent
        .post(`/api/admin/cycles/${cycleId}/confirm`);

      expect(confirmResponse.status).toBe(200);
      expect(confirmResponse.body.cancelledCount).toBe(3);

      // Verify all orders are cancelled
      for (const orderId of orderIds) {
        const order = await getAsync('SELECT * FROM orders WHERE id = ?', [orderId]);
        expect(order.status).toBe('cancelled');
      }
    });

    it('should handle mixed order statuses (pending and paid)', async () => {
      const agent = request.agent(app);

      // Admin login
      await agent
        .post('/api/auth/admin/login')
        .send({ username: mockAdmin.username, password: mockAdmin.password });

      // Create active cycle with specific start_time (1 day ago)
      const cycleStartTime = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
      const cycleResult = await runAsync(
        `INSERT INTO ordering_cycles (cycle_number, start_time, status, total_amount, discount_rate)
         VALUES (?, ?, 'active', 0, 0)`,
        ['CYCLE' + Date.now(), cycleStartTime]
      );
      const cycleId = cycleResult.id;

      // Create discount rules
      await runAsync(
        'INSERT INTO discount_rules (min_amount, max_amount, discount_rate, description, status) VALUES (?, ?, ?, ?, ?)',
        [100, null, 10, '10% discount', 'active']
      );

      // Create pending order within cycle time range (12 hours ago, within the cycle)
      const pendingOrderId = 'test-order-pending-' + Date.now();
      const pendingOrderTime = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
      await runAsync(
        `INSERT INTO orders (id, order_number, user_id, customer_name, customer_phone, 
         total_amount, discount_amount, final_amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [pendingOrderId, 'BO' + Date.now().toString().slice(-8), userId, 'Test User', '13800138000', 100, 0, 100, 'pending', pendingOrderTime]
      );

      // Create paid order within cycle time range (11 hours ago, within the cycle)
      const paidOrderId = 'test-order-paid-' + Date.now();
      const paidOrderTime = new Date(Date.now() - 11 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
      await runAsync(
        `INSERT INTO orders (id, order_number, user_id, customer_name, customer_phone, 
         total_amount, discount_amount, final_amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [paidOrderId, 'BO' + (Date.now() + 1).toString().slice(-8), userId, 'Test User', '13800138001', 50, 0, 50, 'paid', paidOrderTime]
      );

      // Update cycle total_amount
      await runAsync(
        'UPDATE ordering_cycles SET total_amount = ? WHERE id = ?',
        [150, cycleId]
      );

      // Close ordering and end cycle (end_time is now)
      await runAsync(
        "UPDATE settings SET value = 'false' WHERE key = 'ordering_open'"
      );
      const cycleEndTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await runAsync(
        `UPDATE ordering_cycles 
         SET end_time = ?, status = 'ended' 
         WHERE id = ?`,
        [cycleEndTime, cycleId]
      );

      // Calculate discount
      const discountResponse = await request(app)
        .post('/api/public/calculate-discount');

      expect(discountResponse.status).toBe(200);
      expect(discountResponse.body.discount_rate).toBe(0.1);

      // Verify pending order has discount
      const pendingOrder = await getAsync('SELECT * FROM orders WHERE id = ?', [pendingOrderId]);
      expect(pendingOrder.discount_amount).toBe(10);
      expect(pendingOrder.final_amount).toBe(90);

      // Verify paid order discount (should be updated by cycle confirmation, not calculate-discount)
      // Note: calculate-discount only updates pending orders

      // Confirm cycle
      const confirmResponse = await agent
        .post(`/api/admin/cycles/${cycleId}/confirm`);

      expect(confirmResponse.status).toBe(200);
      expect(confirmResponse.body.cancelledCount).toBe(1); // Only pending order cancelled

      // Verify pending order is cancelled
      const cancelledOrder = await getAsync('SELECT * FROM orders WHERE id = ?', [pendingOrderId]);
      expect(cancelledOrder.status).toBe('cancelled');

      // Verify paid order status unchanged (but note: cycle confirmation only processes pending orders)
      const paidOrder = await getAsync('SELECT * FROM orders WHERE id = ?', [paidOrderId]);
      expect(paidOrder.status).toBe('paid');
    });
  });

  afterEach(async () => {
    // 确保所有事务都已提交或回滚
    try {
      const { rollback } = require('../helpers/test-db');
      await rollback();
    } catch (e) {
      // 忽略错误，可能没有活动事务
    }
  });
});

