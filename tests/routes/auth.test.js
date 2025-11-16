const request = require('supertest');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { runAsync, getAsync } = require('../helpers/test-db');
const { createAdminWithPassword, mockAdmin, mockUser } = require('../helpers/mock-data');

// Mock数据库和logger模块（必须在文件顶部）
jest.mock('../../db/database', () => ({
  getAsync: require('../helpers/test-db').getAsync,
  runAsync: require('../helpers/test-db').runAsync,
  allAsync: require('../helpers/test-db').allAsync
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

  const authRoutes = require('../../routes/auth');
  app.use('/api/auth', authRoutes);

  return app;
}

describe('Auth Routes', () => {
  let app;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    // 清理数据
    await runAsync('DELETE FROM users');
    await runAsync('DELETE FROM admins');
  });

  describe('POST /api/auth/admin/login', () => {
    it('should login admin with correct credentials', async () => {
      // 创建测试管理员
      const adminData = await createAdminWithPassword(mockAdmin);
      await runAsync(
        'INSERT INTO admins (username, password, name, email, role, status) VALUES (?, ?, ?, ?, ?, ?)',
        [adminData.username, adminData.password, adminData.name, adminData.email, adminData.role, adminData.status]
      );

      const response = await request(app)
        .post('/api/auth/admin/login')
        .send({
          username: mockAdmin.username,
          password: mockAdmin.password
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.admin).toBeDefined();
      expect(response.body.admin.username).toBe(mockAdmin.username);
    });

    it('should return 401 with incorrect password', async () => {
      const adminData = await createAdminWithPassword(mockAdmin);
      await runAsync(
        'INSERT INTO admins (username, password, name, email, role, status) VALUES (?, ?, ?, ?, ?, ?)',
        [adminData.username, adminData.password, adminData.name, adminData.email, adminData.role, adminData.status]
      );

      const response = await request(app)
        .post('/api/auth/admin/login')
        .send({
          username: mockAdmin.username,
          password: 'wrongpassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should return 401 with non-existent username', async () => {
      const response = await request(app)
        .post('/api/auth/admin/login')
        .send({
          username: 'nonexistent',
          password: 'password'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should return 400 with invalid input', async () => {
      const response = await request(app)
        .post('/api/auth/admin/login')
        .send({
          username: 'ab', // 太短
          password: '123' // 太短
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/admin/logout', () => {
    it('should logout admin successfully', async () => {
      const response = await request(app)
        .post('/api/auth/admin/logout');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/auth/admin/me', () => {
    it('should return 401 if not logged in', async () => {
      const response = await request(app)
        .get('/api/auth/admin/me');

      expect(response.status).toBe(401);
    });

    it('should return admin info if logged in', async () => {
      // 创建管理员
      const adminData = await createAdminWithPassword(mockAdmin);
      await runAsync(
        'INSERT INTO admins (username, password, name, email, role, status) VALUES (?, ?, ?, ?, ?, ?)',
        [adminData.username, adminData.password, adminData.name, adminData.email, adminData.role, adminData.status]
      );

      const agent = request.agent(app);
      
      // 先登录
      const loginResponse = await agent
        .post('/api/auth/admin/login')
        .send({
          username: mockAdmin.username,
          password: mockAdmin.password
        });

      expect(loginResponse.status).toBe(200);

      // 然后获取信息
      const response = await agent.get('/api/auth/admin/me');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.admin).toBeDefined();
    });
  });

  describe('POST /api/auth/user/login', () => {
    it('should create new user and login', async () => {
      const response = await request(app)
        .post('/api/auth/user/login')
        .send({
          phone: mockUser.phone,
          name: mockUser.name
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.phone).toBe(mockUser.phone);

      // 验证用户已创建
      const user = await getAsync('SELECT * FROM users WHERE phone = ?', [mockUser.phone]);
      expect(user).toBeDefined();
    });

    it('should login existing user', async () => {
      // 先创建用户
      await runAsync(
        "INSERT INTO users (phone, name) VALUES (?, ?)",
        [mockUser.phone, mockUser.name]
      );

      const response = await request(app)
        .post('/api/auth/user/login')
        .send({
          phone: mockUser.phone,
          name: 'Updated Name'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 400 with invalid phone', async () => {
      const response = await request(app)
        .post('/api/auth/user/login')
        .send({
          phone: '123', // 太短
          name: 'Test'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/user/logout', () => {
    it('should logout user successfully', async () => {
      const response = await request(app)
        .post('/api/auth/user/logout');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/auth/user/me', () => {
    it('should return 401 if not logged in', async () => {
      const response = await request(app)
        .get('/api/auth/user/me');

      expect(response.status).toBe(401);
    });

    it('should return user info if logged in', async () => {
      // 先创建用户
      await runAsync(
        "INSERT INTO users (phone, name) VALUES (?, ?)",
        [mockUser.phone, mockUser.name]
      );

      const agent = request.agent(app);
      
      // 先登录
      const loginResponse = await agent
        .post('/api/auth/user/login')
        .send({
          phone: mockUser.phone,
          name: mockUser.name
        });

      expect(loginResponse.status).toBe(200);

      // 然后获取信息
      const response = await agent.get('/api/auth/user/me');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.phone).toBe(mockUser.phone);
    });

    it('should return 401 if user does not exist', async () => {
      const agent = request.agent(app);
      
      // 先登录
      await agent
        .post('/api/auth/user/login')
        .send({
          phone: mockUser.phone,
          name: mockUser.name
        });

      // 删除用户
      await runAsync('DELETE FROM users WHERE phone = ?', [mockUser.phone]);

      // 尝试获取信息
      const response = await agent.get('/api/auth/user/me');

      expect(response.status).toBe(401);
    });
  });

  describe('User Login Extended', () => {
    it('should update name when existing user logs in with new name', async () => {
      // 先创建用户
      await runAsync(
        "INSERT INTO users (phone, name) VALUES (?, ?)",
        [mockUser.phone, 'Old Name']
      );

      const response = await request(app)
        .post('/api/auth/user/login')
        .send({
          phone: mockUser.phone,
          name: 'New Name'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // 验证name已更新
      const user = await getAsync('SELECT * FROM users WHERE phone = ?', [mockUser.phone]);
      expect(user.name).toBe('New Name');
    });

    it('should update last_login when existing user logs in', async () => {
      // 先创建用户
      await runAsync(
        "INSERT INTO users (phone, name) VALUES (?, ?)",
        [mockUser.phone, mockUser.name]
      );

      const response = await request(app)
        .post('/api/auth/user/login')
        .send({
          phone: mockUser.phone,
          name: mockUser.name
        });

      expect(response.status).toBe(200);

      // 验证last_login已更新
      const user = await getAsync('SELECT * FROM users WHERE phone = ?', [mockUser.phone]);
      expect(user.last_login).toBeDefined();
    });

    it('should create new user with empty name', async () => {
      const response = await request(app)
        .post('/api/auth/user/login')
        .send({
          phone: '13900139000',
          name: ''
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // 验证用户已创建
      const user = await getAsync('SELECT * FROM users WHERE phone = ?', ['13900139000']);
      expect(user).toBeDefined();
      expect(user.name).toBe('');
    });
  });

  describe('Error Handling', () => {
    it('should handle error when admin login fails', async () => {
      // 测试不存在的用户（更实际的场景）
      const response = await request(app)
        .post('/api/auth/admin/login')
        .send({
          username: 'nonexistent',
          password: 'password'
        });

      // 不存在的用户应该返回401
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should handle error when admin does not exist after login', async () => {
      // 创建管理员并登录
      const adminData = await createAdminWithPassword(mockAdmin);
      await runAsync(
        'INSERT INTO admins (username, password, name, email, role, status) VALUES (?, ?, ?, ?, ?, ?)',
        [adminData.username, adminData.password, adminData.name, adminData.email, adminData.role, adminData.status]
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/admin/login')
        .send({
          username: mockAdmin.username,
          password: mockAdmin.password
        });

      // 删除管理员（模拟管理员被删除的情况）
      await runAsync('DELETE FROM admins WHERE username = ?', [mockAdmin.username]);

      // 尝试获取信息
      const response = await agent.get('/api/auth/admin/me');

      // 应该返回401，因为管理员不存在
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});

