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
    await runAsync('DELETE FROM verification_codes');
    await runAsync("DELETE FROM settings WHERE key = 'sms_enabled'");
    await runAsync("DELETE FROM settings WHERE key = 'twilio_verify_service_sid'");
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

  describe('POST /api/auth/sms/send', () => {
    beforeEach(async () => {
      await runAsync("DELETE FROM settings WHERE key = 'sms_enabled'");
      await runAsync("DELETE FROM settings WHERE key = 'twilio_verify_service_sid'");
      await runAsync('DELETE FROM verification_codes');
    });

    it('should send verification code when SMS is enabled', async () => {
      await runAsync("INSERT INTO settings (key, value) VALUES ('sms_enabled', 'true')");

      const response = await request(app)
        .post('/api/auth/sms/send')
        .send({
          phone: '13800138000',
          type: 'login'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBeDefined();
      // 开发环境应该返回验证码
      if (response.body.code) {
        expect(response.body.code).toMatch(/^\d{6}$/);
      }
    });

    it('should return error when SMS is not enabled (non-admin)', async () => {
      await runAsync("INSERT INTO settings (key, value) VALUES ('sms_enabled', 'false')");

      const response = await request(app)
        .post('/api/auth/sms/send')
        .send({
          phone: '13800138000',
          type: 'login'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should allow admin to send code even when SMS is disabled', async () => {
      await runAsync("INSERT INTO settings (key, value) VALUES ('sms_enabled', 'false')");
      
      const adminData = await createAdminWithPassword(mockAdmin);
      await runAsync(
        'INSERT INTO admins (username, password, name, email, role, status) VALUES (?, ?, ?, ?, ?, ?)',
        [adminData.username, adminData.password, adminData.name, adminData.email, adminData.role, adminData.status]
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/admin/login')
        .send({ username: mockAdmin.username, password: mockAdmin.password });

      const response = await agent
        .post('/api/auth/sms/send')
        .send({
          phone: '13800138000',
          type: 'login'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should validate phone number format', async () => {
      await runAsync("INSERT INTO settings (key, value) VALUES ('sms_enabled', 'true')");

      const response = await request(app)
        .post('/api/auth/sms/send')
        .send({
          phone: 'invalid',
          type: 'login'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/user/login-with-code', () => {
    beforeEach(async () => {
      await runAsync("DELETE FROM settings WHERE key = 'sms_enabled'");
      await runAsync("DELETE FROM settings WHERE key = 'twilio_verify_service_sid'");
      await runAsync('DELETE FROM verification_codes');
      await runAsync("INSERT INTO settings (key, value) VALUES ('sms_enabled', 'true')");
    });

    it('should login user with valid verification code', async () => {
      // 先发送验证码
      const sendResponse = await request(app)
        .post('/api/auth/sms/send')
        .send({
          phone: '13800138000',
          type: 'login'
        });

      expect(sendResponse.status).toBe(200);
      const code = sendResponse.body.code;

      // 使用验证码登录
      const loginResponse = await request(app)
        .post('/api/auth/user/login-with-code')
        .send({
          phone: '13800138000',
          code: code,
          name: 'Test User'
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body.user).toBeDefined();
      expect(loginResponse.body.user.phone).toBe('13800138000');
    });

    it('should return error with invalid verification code', async () => {
      const response = await request(app)
        .post('/api/auth/user/login-with-code')
        .send({
          phone: '13800138000',
          code: '000000',
          name: 'Test User'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should create new user if not exists', async () => {
      const sendResponse = await request(app)
        .post('/api/auth/sms/send')
        .send({
          phone: '13900139000',
          type: 'login'
        });

      const code = sendResponse.body.code;

      const loginResponse = await request(app)
        .post('/api/auth/user/login-with-code')
        .send({
          phone: '13900139000',
          code: code,
          name: 'New User'
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.user).toBeDefined();
      
      const user = await getAsync('SELECT * FROM users WHERE phone = ?', ['13900139000']);
      expect(user).toBeDefined();
      expect(user.name).toBe('New User');
    });
  });

  describe('GET /api/auth/session/info', () => {
    it('should return session info for guest', async () => {
      const response = await request(app)
        .get('/api/auth/session/info');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.session).toBeDefined();
      expect(response.body.session.isLoggedIn).toBe(false);
      expect(response.body.session.userType).toBe('guest');
    });

    it('should return session info for logged in admin', async () => {
      const adminData = await createAdminWithPassword(mockAdmin);
      await runAsync(
        'INSERT INTO admins (username, password, name, email, role, status) VALUES (?, ?, ?, ?, ?, ?)',
        [adminData.username, adminData.password, adminData.name, adminData.email, adminData.role, adminData.status]
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/admin/login')
        .send({ username: mockAdmin.username, password: mockAdmin.password });

      const response = await agent.get('/api/auth/session/info');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.session.isLoggedIn).toBe(true);
      expect(response.body.session.userType).toBe('admin');
      expect(response.body.session.adminId).toBeDefined();
      expect(response.body.session.admin).toBeDefined();
      expect(response.body.session.admin.expiresAt).toBeDefined();
    });

    it('should return session info for logged in user', async () => {
      await runAsync(
        "INSERT INTO users (phone, name) VALUES (?, ?)",
        [mockUser.phone, mockUser.name]
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent.get('/api/auth/session/info');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.session.isLoggedIn).toBe(true);
      expect(response.body.session.userType).toBe('user');
      expect(response.body.session.userId).toBeDefined();
      expect(response.body.session.user).toBeDefined();
      expect(response.body.session.user.expiresAt).toBeDefined();
    });
  });

  describe('POST /api/auth/session/refresh', () => {
    it('should return 401 if no session', async () => {
      const response = await request(app)
        .post('/api/auth/session/refresh');

      expect(response.status).toBe(401);
    });

    it('should refresh admin session', async () => {
      const adminData = await createAdminWithPassword(mockAdmin);
      await runAsync(
        'INSERT INTO admins (username, password, name, email, role, status) VALUES (?, ?, ?, ?, ?, ?)',
        [adminData.username, adminData.password, adminData.name, adminData.email, adminData.role, adminData.status]
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/admin/login')
        .send({ username: mockAdmin.username, password: mockAdmin.password });

      const response = await agent.post('/api/auth/session/refresh');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should refresh user session', async () => {
      await runAsync(
        "INSERT INTO users (phone, name) VALUES (?, ?)",
        [mockUser.phone, mockUser.name]
      );

      const agent = request.agent(app);
      await agent
        .post('/api/auth/user/login')
        .send({ phone: mockUser.phone, name: mockUser.name });

      const response = await agent.post('/api/auth/session/refresh');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
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

