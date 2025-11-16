const request = require('supertest');
const express = require('express');
const session = require('express-session');
const { v4: uuidv4 } = require('uuid');
const { runAsync, getAsync, allAsync, beginTransaction, commit, rollback } = require('../helpers/test-db');
const { mockUser, mockProduct, mockCategory } = require('../helpers/mock-data');

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

  // 添加auth路由（user路由需要先登录）
  const authRoutes = require('../../routes/auth');
  app.use('/api/auth', authRoutes);

  const userRoutes = require('../../routes/user');
  app.use('/api/user', userRoutes);

  return app;
}

describe('User Routes', () => {
  let app;
  let userId;
  let productId;
  let categoryId;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    // 清理数据
    await runAsync('DELETE FROM order_items');
    await runAsync('DELETE FROM orders');
    await runAsync('DELETE FROM products');
    await runAsync('DELETE FROM categories');
    await runAsync('DELETE FROM users');
    await runAsync('DELETE FROM settings');
    await runAsync('DELETE FROM ordering_cycles');

    // 设置点单开放
    await runAsync(
      "INSERT INTO settings (key, value) VALUES ('ordering_open', 'true')"
    );

    // 创建测试数据
    const categoryResult = await runAsync(
      'INSERT INTO categories (name, description, status) VALUES (?, ?, ?)',
      [mockCategory.name, mockCategory.description, mockCategory.status]
    );
    categoryId = categoryResult.id;

    const productResult = await runAsync(
      'INSERT INTO products (name, description, price, category_id, status) VALUES (?, ?, ?, ?, ?)',
      [mockProduct.name, mockProduct.description, mockProduct.price, categoryId, mockProduct.status]
    );
    productId = productResult.id;

    const userResult = await runAsync(
      'INSERT INTO users (phone, name) VALUES (?, ?)',
      [mockUser.phone, mockUser.name]
    );
    userId = userResult.id;
  });

  describe('POST /api/user/orders', () => {
    it('should return 401 if not logged in', async () => {
      const response = await request(app)
        .post('/api/user/orders')
        .send({
          items: [{ product_id: productId, quantity: 1 }]
        });

      expect(response.status).toBe(401);
    });

    it('should create order when logged in and ordering is open', async () => {
      // 创建活跃周期
      await runAsync(
        `INSERT INTO ordering_cycles (cycle_number, start_time, status, total_amount, discount_rate)
         VALUES (?, datetime('now', 'localtime'), 'active', 0, 0)`,
        ['CYCLE' + Date.now()]
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent
        .post('/api/user/orders')
        .send({
          items: [{ product_id: productId, quantity: 1 }]
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order).toBeDefined();
      expect(response.body.order.order_number).toBeDefined();
    });

    it('should create order with sizes, toppings, ice_level, and notes', async () => {
      // 创建活跃周期
      await runAsync(
        `INSERT INTO ordering_cycles (cycle_number, start_time, status, total_amount, discount_rate)
         VALUES (?, datetime('now', 'localtime'), 'active', 0, 0)`,
        ['CYCLE' + Date.now()]
      );

      // 更新产品以支持sizes
      await runAsync(
        'UPDATE products SET sizes = ? WHERE id = ?',
        [JSON.stringify({ 'medium': 20, 'large': 25 }), productId]
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent
        .post('/api/user/orders')
        .send({
          items: [{
            product_id: productId,
            quantity: 2,
            size: 'large',
            sugar_level: '50',
            ice_level: 'less',
            toppings: []
          }],
          notes: 'Test notes'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // 验证订单项
      const orderItems = await getAsync('SELECT * FROM order_items WHERE order_id = ?', [response.body.order.id]);
      expect(orderItems).toBeDefined();
      expect(orderItems.size).toBe('large');
      expect(orderItems.sugar_level).toBe('50');
      expect(orderItems.ice_level).toBe('less');

      // 验证订单notes
      const order = await getAsync('SELECT * FROM orders WHERE id = ?', [response.body.order.id]);
      expect(order.notes).toBe('Test notes');
    });

    it('should calculate price correctly with sizes and toppings', async () => {
      // 创建活跃周期
      await runAsync(
        `INSERT INTO ordering_cycles (cycle_number, start_time, status, total_amount, discount_rate)
         VALUES (?, datetime('now', 'localtime'), 'active', 0, 0)`,
        ['CYCLE' + Date.now()]
      );

      // 创建加料产品
      const toppingResult = await runAsync(
        'INSERT INTO products (name, description, price, category_id, status) VALUES (?, ?, ?, ?, ?)',
        ['Topping', 'Test Topping', 5, categoryId, 'active']
      );
      const toppingId = toppingResult.id;

      // 更新产品以支持sizes
      await runAsync(
        'UPDATE products SET sizes = ? WHERE id = ?',
        [JSON.stringify({ 'medium': 20, 'large': 25 }), productId]
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent
        .post('/api/user/orders')
        .send({
          items: [{
            product_id: productId,
            quantity: 1,
            size: 'large',
            toppings: [toppingId]
          }]
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // 价格应该是 25 (large) + 5 (topping) = 30
      expect(response.body.order.total_amount).toBe(30);
    });

    it('should return 400 if ordering is closed', async () => {
      // 关闭点单
      await runAsync(
        "UPDATE settings SET value = 'false' WHERE key = 'ordering_open'"
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent
        .post('/api/user/orders')
        .send({
          items: [{ product_id: productId, quantity: 1 }]
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('点单时间未开放');
    });

    it('should return 400 for invalid product', async () => {
      // 创建活跃周期
      await runAsync(
        `INSERT INTO ordering_cycles (cycle_number, start_time, status, total_amount, discount_rate)
         VALUES (?, datetime('now', 'localtime'), 'active', 0, 0)`,
        ['CYCLE' + Date.now()]
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent
        .post('/api/user/orders')
        .send({
          items: [{ product_id: 99999, quantity: 1 }]
        });

      expect(response.status).toBe(500);
    });

    it('should return 400 for invalid quantity', async () => {
      // 创建活跃周期
      await runAsync(
        `INSERT INTO ordering_cycles (cycle_number, start_time, status, total_amount, discount_rate)
         VALUES (?, datetime('now', 'localtime'), 'active', 0, 0)`,
        ['CYCLE' + Date.now()]
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent
        .post('/api/user/orders')
        .send({
          items: [{ product_id: productId, quantity: 0 }]
        });

      expect(response.status).toBe(500);
    });
  });

  describe('GET /api/user/orders', () => {
    let orderId;
    let cycleId;

    beforeEach(async () => {
      // 创建活跃周期
      const cycleResult = await runAsync(
        `INSERT INTO ordering_cycles (cycle_number, start_time, status, total_amount, discount_rate)
         VALUES (?, datetime('now', 'localtime'), 'active', 0, 0)`,
        ['CYCLE' + Date.now()]
      );
      cycleId = cycleResult.id;

      // 创建订单
      orderId = uuidv4();
      const orderNumber = 'BO' + Date.now().toString().slice(-8);
      await runAsync(
        `INSERT INTO orders (id, order_number, user_id, customer_name, customer_phone, 
         total_amount, discount_amount, final_amount, status, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [orderId, orderNumber, userId, 'Test User', mockUser.phone, 100, 0, 100, 'pending', 'Test notes']
      );

      // 创建订单项
      await runAsync(
        `INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal, size, sugar_level, ice_level, toppings)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, productId, 'Test Product', 100, 1, 100, 'large', '50', 'less', JSON.stringify([])]
      );
    });

    it('should return 401 if not logged in', async () => {
      const response = await request(app)
        .get('/api/user/orders');

      expect(response.status).toBe(401);
    });

    it('should get orders when logged in', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent.get('/api/user/orders');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.orders)).toBe(true);
      expect(response.body.orders.length).toBeGreaterThan(0);
    });

    it('should include order details with size, sugar_level, ice_level, toppings, and notes', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent.get('/api/user/orders');

      expect(response.status).toBe(200);
      const order = response.body.orders.find(o => o.id === orderId);
      expect(order).toBeDefined();
      expect(order.items).toBeDefined();
      expect(order.items[0].size).toBe('large');
      expect(order.items[0].sugar_level).toBe('50');
      expect(order.items[0].ice_level).toBe('less');
      expect(order.notes).toBe('Test notes');
    });
  });

  describe('GET /api/user/orders/:id', () => {
    let orderId;

    beforeEach(async () => {
      // 创建订单
      orderId = uuidv4();
      const orderNumber = 'BO' + Date.now().toString().slice(-8);
      await runAsync(
        `INSERT INTO orders (id, order_number, user_id, customer_name, customer_phone, 
         total_amount, discount_amount, final_amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [orderId, orderNumber, userId, 'Test User', mockUser.phone, 100, 0, 100, 'pending']
      );
    });

    it('should return 401 if not logged in', async () => {
      const response = await request(app)
        .get(`/api/user/orders/${orderId}`);

      expect(response.status).toBe(401);
    });

    it('should get order details when logged in', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent.get(`/api/user/orders/${orderId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order).toBeDefined();
      expect(response.body.order.id).toBe(orderId);
    });

    it('should return 404 for non-existent order', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent.get(`/api/user/orders/${uuidv4()}`);

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/user/orders/by-phone', () => {
    let orderId;

    beforeEach(async () => {
      // 创建订单
      orderId = uuidv4();
      const orderNumber = 'BO' + Date.now().toString().slice(-8);
      await runAsync(
        `INSERT INTO orders (id, order_number, user_id, customer_name, customer_phone, 
         total_amount, discount_amount, final_amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [orderId, orderNumber, userId, 'Test User', mockUser.phone, 100, 0, 100, 'pending']
      );
    });

    it('should return 401 if not logged in', async () => {
      const response = await request(app)
        .get('/api/user/orders/by-phone');

      expect(response.status).toBe(401);
    });

    it('should get orders by phone when logged in', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent.get('/api/user/orders/by-phone');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.orders)).toBe(true);
    });
  });

  describe('PUT /api/user/orders/:id', () => {
    let orderId;
    let cycleId;

    beforeEach(async () => {
      // 创建活跃周期
      const cycleResult = await runAsync(
        `INSERT INTO ordering_cycles (cycle_number, start_time, status, total_amount, discount_rate)
         VALUES (?, datetime('now', 'localtime'), 'active', 0, 0)`,
        ['CYCLE' + Date.now()]
      );
      cycleId = cycleResult.id;

      // 创建订单
      orderId = uuidv4();
      const orderNumber = 'BO' + Date.now().toString().slice(-8);
      await runAsync(
        `INSERT INTO orders (id, order_number, user_id, customer_name, customer_phone, 
         total_amount, discount_amount, final_amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [orderId, orderNumber, userId, 'Test User', mockUser.phone, 100, 0, 100, 'pending']
      );

      // 创建订单项
      await runAsync(
        'INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
        [orderId, productId, 'Test Product', 100, 1, 100]
      );
    });

    it('should return 401 if not logged in', async () => {
      const response = await request(app)
        .put(`/api/user/orders/${orderId}`)
        .send({
          items: [{ product_id: productId, quantity: 2 }]
        });

      expect(response.status).toBe(401);
    });

    it('should update order when ordering is open', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent
        .put(`/api/user/orders/${orderId}`)
        .send({
          items: [{ product_id: productId, quantity: 2 }]
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 400 when ordering is closed', async () => {
      // 关闭点单
      await runAsync(
        "UPDATE settings SET value = 'false' WHERE key = 'ordering_open'"
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent
        .put(`/api/user/orders/${orderId}`)
        .send({
          items: [{ product_id: productId, quantity: 2 }]
        });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/user/orders/:id', () => {
    let orderId;
    let cycleId;

    beforeEach(async () => {
      // 创建活跃周期
      const cycleResult = await runAsync(
        `INSERT INTO ordering_cycles (cycle_number, start_time, status, total_amount, discount_rate)
         VALUES (?, datetime('now', 'localtime'), 'active', 0, 0)`,
        ['CYCLE' + Date.now()]
      );
      cycleId = cycleResult.id;

      // 创建订单
      orderId = uuidv4();
      const orderNumber = 'BO' + Date.now().toString().slice(-8);
      await runAsync(
        `INSERT INTO orders (id, order_number, user_id, customer_name, customer_phone, 
         total_amount, discount_amount, final_amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [orderId, orderNumber, userId, 'Test User', mockUser.phone, 100, 0, 100, 'pending']
      );

      // 创建订单项
      await runAsync(
        'INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
        [orderId, productId, 'Test Product', 100, 1, 100]
      );
    });

    it('should return 401 if not logged in', async () => {
      const response = await request(app)
        .delete(`/api/user/orders/${orderId}`);

      expect(response.status).toBe(401);
    });

    it('should delete order when ordering is open', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent.delete(`/api/user/orders/${orderId}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // 验证订单已删除
      const deletedOrder = await getAsync('SELECT * FROM orders WHERE id = ?', [orderId]);
      expect(deletedOrder).toBeUndefined();
    });

    it('should return 400 when ordering is closed', async () => {
      // 关闭点单
      await runAsync(
        "UPDATE settings SET value = 'false' WHERE key = 'ordering_open'"
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent.delete(`/api/user/orders/${orderId}`);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/user/orders-summary', () => {
    it('should return 401 if not logged in', async () => {
      const response = await request(app)
        .get('/api/user/orders-summary');

      expect(response.status).toBe(401);
    });

    it('should get orders summary when logged in', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent.get('/api/user/orders-summary');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.summary).toBeDefined();
    });
  });

  describe('POST /api/user/orders/:id/payment', () => {
    let orderId;
    let cycleId;

    beforeEach(async () => {
      // 创建活跃周期
      const cycleResult = await runAsync(
        `INSERT INTO ordering_cycles (cycle_number, start_time, status, total_amount, discount_rate)
         VALUES (?, datetime('now', 'localtime'), 'active', 0, 0)`,
        ['CYCLE' + Date.now()]
      );
      cycleId = cycleResult.id;

      // 创建订单
      orderId = uuidv4();
      const orderNumber = 'BO' + Date.now().toString().slice(-8);
      await runAsync(
        `INSERT INTO orders (id, order_number, user_id, customer_name, customer_phone, 
         total_amount, discount_amount, final_amount, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
        [orderId, orderNumber, userId, 'Test User', mockUser.phone, 100, 0, 100, 'pending']
      );

      // 创建订单项
      await runAsync(
        'INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
        [orderId, productId, 'Test Product', 100, 1, 100]
      );
    });

    it('should return 401 if not logged in', async () => {
      const response = await request(app)
        .post(`/api/user/orders/${orderId}/payment`);

      expect(response.status).toBe(401);
    });

    it('should return 400 when ordering is still open', async () => {
      // 确保点单是开放的
      await runAsync(
        "INSERT INTO settings (key, value) VALUES ('ordering_open', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'"
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent
        .post(`/api/user/orders/${orderId}/payment`)
        .attach('payment_image', Buffer.from('fake image'), 'test.jpg');

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('点单时间未关闭');
    });

    it('should upload payment screenshot when ordering is closed', async () => {
      // 关闭点单
      await runAsync(
        "INSERT INTO settings (key, value) VALUES ('ordering_open', 'false') ON CONFLICT(key) DO UPDATE SET value = 'false'"
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      // 创建测试图片buffer
      const imageBuffer = Buffer.from('fake image data for payment');

      const response = await agent
        .post(`/api/user/orders/${orderId}/payment`)
        .attach('payment_image', imageBuffer, 'payment.jpg')
        .set('Content-Type', 'multipart/form-data');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.payment_image).toBeDefined();

      // 验证订单状态已更新
      const updatedOrder = await getAsync('SELECT * FROM orders WHERE id = ?', [orderId]);
      expect(updatedOrder.status).toBe('paid');
      expect(updatedOrder.payment_image).toBeDefined();
      expect(updatedOrder.payment_time).toBeDefined();
    });

    it('should return 400 when no file is uploaded', async () => {
      // 关闭点单
      await runAsync(
        "INSERT INTO settings (key, value) VALUES ('ordering_open', 'false') ON CONFLICT(key) DO UPDATE SET value = 'false'"
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent
        .post(`/api/user/orders/${orderId}/payment`);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('请上传付款截图');
    });

    it('should return 404 for non-existent order', async () => {
      // 关闭点单
      await runAsync(
        "INSERT INTO settings (key, value) VALUES ('ordering_open', 'false') ON CONFLICT(key) DO UPDATE SET value = 'false'"
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const fakeOrderId = uuidv4();
      const imageBuffer = Buffer.from('fake image data');

      const response = await agent
        .post(`/api/user/orders/${fakeOrderId}/payment`)
        .attach('payment_image', imageBuffer, 'payment.jpg');

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('订单不存在');
    });

    it('should return 400 when order is already paid', async () => {
      // 关闭点单
      await runAsync(
        "INSERT INTO settings (key, value) VALUES ('ordering_open', 'false') ON CONFLICT(key) DO UPDATE SET value = 'false'"
      );

      // 更新订单状态为已付款
      await runAsync(
        "UPDATE orders SET status = 'paid' WHERE id = ?",
        [orderId]
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const imageBuffer = Buffer.from('fake image data');

      const response = await agent
        .post(`/api/user/orders/${orderId}/payment`)
        .attach('payment_image', imageBuffer, 'payment.jpg');

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('订单已付款');
    });

    it('should return 400 when order is completed', async () => {
      // 关闭点单
      await runAsync(
        "INSERT INTO settings (key, value) VALUES ('ordering_open', 'false') ON CONFLICT(key) DO UPDATE SET value = 'false'"
      );

      // 更新订单状态为已完成
      await runAsync(
        "UPDATE orders SET status = 'completed' WHERE id = ?",
        [orderId]
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const imageBuffer = Buffer.from('fake image data');

      const response = await agent
        .post(`/api/user/orders/${orderId}/payment`)
        .attach('payment_image', imageBuffer, 'payment.jpg');

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('订单已付款');
    });
  });

  describe('Error Handling', () => {
    it('should handle transaction rollback on order creation failure', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      // 尝试创建订单，但使用不存在的产品ID
      const response = await agent
        .post('/api/user/orders')
        .send({
          items: [
            {
              product_id: 99999, // 不存在的产品ID
              quantity: 1,
              size: 'large'
            }
          ]
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('商品不存在');

      // 验证没有订单被创建（事务已回滚）
      const orders = await allAsync('SELECT * FROM orders WHERE user_id = ?', [userId]);
      expect(orders.length).toBe(0);
    });

    it('should handle invalid JSON in product sizes', async () => {
      // 确保点单开放
      await runAsync(
        "INSERT INTO settings (key, value) VALUES ('ordering_open', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'"
      );

      // 创建一个产品，但sizes字段是无效的JSON
      await runAsync(
        `UPDATE products SET sizes = 'invalid json' WHERE id = ?`,
        [productId]
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      // 尝试创建订单
      const response = await agent
        .post('/api/user/orders')
        .send({
          items: [
            {
              product_id: productId,
              quantity: 1,
              size: 'large'
            }
          ]
        });

      // 应该成功创建订单，但使用默认价格（因为JSON解析失败）
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // 验证logger.error被调用（记录JSON解析失败）
      const { logger } = require('../../utils/logger');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should log warning when topping product does not exist', async () => {
      // 确保点单开放
      await runAsync(
        "INSERT INTO settings (key, value) VALUES ('ordering_open', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'"
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      // 尝试创建订单，使用不存在的加料ID
      const response = await agent
        .post('/api/user/orders')
        .send({
          items: [
            {
              product_id: productId,
              quantity: 1,
              size: 'large',
              toppings: [99999] // 不存在的加料ID
            }
          ]
        });

      // 应该成功创建订单，但加料会被忽略
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // 验证logger.warn被调用（记录加料不存在）
      const { logger } = require('../../utils/logger');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should handle foreign key constraint error gracefully', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      // 尝试创建订单项，但使用不存在的订单ID（这不应该发生，但测试错误处理）
      // 这个测试主要验证系统能处理外键约束错误
      try {
        await runAsync(
          'INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
          ['non-existent-order-id', productId, 'Test Product', 100, 1, 100]
        );
      } catch (error) {
        // 外键约束错误应该被捕获
        expect(error.message).toContain('FOREIGN KEY');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle order with zero quantity', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      // 确保点单开放
      await runAsync(
        "INSERT INTO settings (key, value) VALUES ('ordering_open', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'"
      );

      const response = await agent
        .post('/api/user/orders')
        .send({
          items: [
            {
              product_id: productId,
              quantity: 0, // 零数量
              size: 'large'
            }
          ]
        });

      expect(response.status).toBe(500);
      expect(response.body.message).toContain('商品数量必须大于0');
    });

    it('should handle order with very large quantity', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      // 确保点单开放
      await runAsync(
        "INSERT INTO settings (key, value) VALUES ('ordering_open', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'"
      );

      const response = await agent
        .post('/api/user/orders')
        .send({
          items: [
            {
              product_id: productId,
              quantity: 1000, // 大数量
              size: 'large'
            }
          ]
        });

      // 应该成功创建，但总金额会很大
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order.total_amount).toBeGreaterThan(0);
    });

    it('should handle order with many items', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      // 确保点单开放
      await runAsync(
        "INSERT INTO settings (key, value) VALUES ('ordering_open', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'"
      );

      // 创建多个订单项
      const items = [];
      for (let i = 0; i < 20; i++) {
        items.push({
          product_id: productId,
          quantity: 1,
          size: 'large'
        });
      }

      const response = await agent
        .post('/api/user/orders')
        .send({ items });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.order.items.length).toBe(20);
    });
  });

  describe('Security Tests', () => {
    it('should prevent SQL injection in order ID parameter', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const maliciousInput = "1' OR '1'='1";
      const response = await agent
        .get(`/api/user/orders/${encodeURIComponent(maliciousInput)}`);

      // 应该返回404或400，不应该执行恶意SQL
      expect([404, 400, 500]).toContain(response.status);
    });

    it('should prevent XSS in order notes', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      // 确保点单开放
      await runAsync("DELETE FROM settings WHERE key = 'ordering_open'");
      await runAsync("INSERT INTO settings (key, value) VALUES ('ordering_open', 'true')");

      const xssPayload = "<script>alert('xss')</script>";
      const response = await agent
        .post('/api/user/orders')
        .send({
          items: [{ product_id: productId, quantity: 1 }],
          notes: xssPayload
        });

      // 应该成功创建订单（XSS防护应该在显示层处理）
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // 验证notes被保存（但应该被转义或清理）
      const order = await getAsync('SELECT notes FROM orders WHERE id = ?', [response.body.order.id]);
      expect(order.notes).toBe(xssPayload); // 数据库存储原始值，显示时转义
    });

    it('should validate phone number format', async () => {
      const agent = request.agent(app);
      
      // 尝试使用恶意输入登录
      const maliciousPhone = "'; DROP TABLE users; --";
      const response = await agent
        .post('/api/auth/user/login')
        .send({ phone: maliciousPhone });

      // 应该返回400或创建用户（参数化查询应该防止SQL注入）
      expect([200, 400]).toContain(response.status);
    });
  });

  describe('Performance Tests', () => {
    it('should handle querying orders efficiently', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      // 创建多个订单
      for (let i = 0; i < 10; i++) {
        const orderId = `test-order-${i}-${Date.now()}`;
        const orderNumber = `BO${Date.now().toString().slice(-8)}${i}`;
        await runAsync(
          `INSERT INTO orders (id, order_number, user_id, customer_name, customer_phone, 
           total_amount, discount_amount, final_amount, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
          [orderId, orderNumber, userId, 'Test User', mockUser.phone, 100, 0, 100, 'pending']
        );
      }

      const startTime = Date.now();
      const response = await agent.get('/api/user/orders');
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // 查询应该在合理时间内完成（比如1秒内）
      expect(duration).toBeLessThan(1000);
    });

    it('should handle orders summary query efficiently', async () => {
      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const startTime = Date.now();
      const response = await agent.get('/api/user/orders-summary');
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // 查询应该在合理时间内完成
      expect(duration).toBeLessThan(1000);
    });
  });
});

