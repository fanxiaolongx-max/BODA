const request = require('supertest');
const express = require('express');
const session = require('express-session');
const { runAsync, getAsync, allAsync } = require('../helpers/test-db');

// Mock数据库和logger模块
jest.mock('../../db/database', () => ({
  getAsync: require('../helpers/test-db').getAsync,
  runAsync: require('../helpers/test-db').runAsync,
  allAsync: require('../helpers/test-db').allAsync
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../utils/custom-api-router', () => ({
  initCustomApiRouter: jest.fn(),
  reloadCustomApiRoutes: jest.fn().mockResolvedValue(undefined)
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

  const externalRoutes = require('../../routes/external');
  app.use('/api/external', externalRoutes);

  return app;
}

describe('External API Routes', () => {
  let app;
  let apiToken = 'test-api-token-12345';
  let customApiId;

  beforeAll(async () => {
    app = createApp();
    
    // 确保custom_apis表存在
    try {
      await runAsync(`
        CREATE TABLE IF NOT EXISTS custom_apis (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          path TEXT NOT NULL UNIQUE,
          method TEXT NOT NULL DEFAULT 'GET',
          requires_token INTEGER DEFAULT 0,
          response_content TEXT NOT NULL,
          description TEXT,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
        )
      `);
      
      await runAsync('CREATE INDEX IF NOT EXISTS idx_custom_apis_path ON custom_apis(path)');
      await runAsync('CREATE INDEX IF NOT EXISTS idx_custom_apis_status ON custom_apis(status)');
      
      // 创建custom_api_logs表
      await runAsync(`
        CREATE TABLE IF NOT EXISTS custom_api_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          api_id INTEGER NOT NULL,
          request_method TEXT NOT NULL,
          request_path TEXT NOT NULL,
          request_headers TEXT,
          request_query TEXT,
          request_body TEXT,
          response_status INTEGER,
          response_body TEXT,
          response_time_ms INTEGER,
          ip_address TEXT,
          user_agent TEXT,
          error_message TEXT,
          created_at DATETIME DEFAULT (datetime('now', 'localtime')),
          FOREIGN KEY (api_id) REFERENCES custom_apis(id) ON DELETE CASCADE
        )
      `);
    } catch (error) {
      console.error('Error creating tables:', error);
    }
  });

  beforeEach(async () => {
    // 清理数据
    await runAsync('DELETE FROM custom_api_logs');
    await runAsync('DELETE FROM custom_apis');
    await runAsync('DELETE FROM settings');
    
    // 设置API Token
    await runAsync(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['custom_api_token', apiToken]
    );
    
    // 创建测试用的自定义API
    const result = await runAsync(`
      INSERT INTO custom_apis (name, path, method, requires_token, response_content, description, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      '测试API',
      '/test',
      'GET',
      0,
      JSON.stringify({ message: 'Hello', data: { items: [{ id: 1, name: 'Item 1' }] } }),
      '测试接口',
      'active'
    ]);
    customApiId = result.id;
  });

  describe('GET /api/external/custom-apis', () => {
    it('应该返回API列表（需要Token认证）', async () => {
      const response = await request(app)
        .get('/api/external/custom-apis')
        .set('X-API-Token', apiToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('apis');
      expect(response.body.data.apis).toBeInstanceOf(Array);
      expect(response.body.data.apis.length).toBeGreaterThan(0);
      expect(response.body.data.apis[0]).toHaveProperty('id');
      expect(response.body.data.apis[0]).toHaveProperty('name');
      expect(response.body.data.apis[0]).toHaveProperty('path');
    });

    it('应该拒绝没有Token的请求', async () => {
      const response = await request(app)
        .get('/api/external/custom-apis')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('应该拒绝无效Token的请求', async () => {
      const response = await request(app)
        .get('/api/external/custom-apis')
        .set('X-API-Token', 'invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('应该支持分页', async () => {
      // 创建更多API
      for (let i = 0; i < 5; i++) {
        await runAsync(`
          INSERT INTO custom_apis (name, path, method, response_content, status)
          VALUES (?, ?, ?, ?, ?)
        `, [`API ${i}`, `/api${i}`, 'GET', '{}', 'active']);
      }

      const response = await request(app)
        .get('/api/external/custom-apis?page=1&limit=3')
        .set('X-API-Token', apiToken)
        .expect(200);

      expect(response.body.data.apis.length).toBe(3);
      expect(response.body.data.page).toBe(1);
      expect(response.body.data.limit).toBe(3);
      expect(response.body.data.total).toBe(6); // 1个初始 + 5个新增
    });

    it('应该支持状态过滤', async () => {
      await runAsync(`
        INSERT INTO custom_apis (name, path, method, response_content, status)
        VALUES (?, ?, ?, ?, ?)
      `, ['Inactive API', '/inactive', 'GET', '{}', 'inactive']);

      const response = await request(app)
        .get('/api/external/custom-apis?status=inactive')
        .set('X-API-Token', apiToken)
        .expect(200);

      expect(response.body.data.apis.every(api => api.status === 'inactive')).toBe(true);
    });

    it('应该支持方法过滤', async () => {
      await runAsync(`
        INSERT INTO custom_apis (name, path, method, response_content, status)
        VALUES (?, ?, ?, ?, ?)
      `, ['POST API', '/post', 'POST', '{}', 'active']);

      const response = await request(app)
        .get('/api/external/custom-apis?method=POST')
        .set('X-API-Token', apiToken)
        .expect(200);

      expect(response.body.data.apis.every(api => api.method === 'POST')).toBe(true);
    });
  });

  describe('GET /api/external/custom-apis/:id', () => {
    it('应该返回API详情', async () => {
      const response = await request(app)
        .get(`/api/external/custom-apis/${customApiId}`)
        .set('X-API-Token', apiToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id', customApiId);
      expect(response.body.data).toHaveProperty('name', '测试API');
      expect(response.body.data).toHaveProperty('path', '/test');
      expect(response.body.data).toHaveProperty('response_content');
    });

    it('应该返回404当API不存在', async () => {
      const response = await request(app)
        .get('/api/external/custom-apis/99999')
        .set('X-API-Token', apiToken)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/external/custom-apis', () => {
    it('应该创建新的自定义API', async () => {
      const newApi = {
        name: '新API',
        path: '/new-api',
        method: 'GET',
        requires_token: false,
        response_content: JSON.stringify({ message: 'New API' }),
        description: '新创建的API',
        status: 'active'
      };

      const response = await request(app)
        .post('/api/external/custom-apis')
        .set('X-API-Token', apiToken)
        .send(newApi)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');

      // 验证API已创建
      const api = await getAsync('SELECT * FROM custom_apis WHERE id = ?', [response.body.data.id]);
      expect(api).toBeTruthy();
      expect(api.name).toBe(newApi.name);
      expect(api.path).toBe(newApi.path);
    });

    it('应该拒绝无效的JSON格式', async () => {
      const response = await request(app)
        .post('/api/external/custom-apis')
        .set('X-API-Token', apiToken)
        .send({
          name: '测试',
          path: '/test2',
          method: 'GET',
          response_content: 'invalid json'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('INVALID_JSON');
    });

    it('应该拒绝路径不以/开头', async () => {
      const response = await request(app)
        .post('/api/external/custom-apis')
        .set('X-API-Token', apiToken)
        .send({
          name: '测试',
          path: 'test-path',
          method: 'GET',
          response_content: '{}'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });

    it('应该拒绝重复的路径和方法组合', async () => {
      const response = await request(app)
        .post('/api/external/custom-apis')
        .set('X-API-Token', apiToken)
        .send({
          name: '重复API',
          path: '/test',
          method: 'GET',
          response_content: '{}'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('DUPLICATE_PATH');
    });
  });

  describe('PUT /api/external/custom-apis/:id', () => {
    it('应该更新API', async () => {
      const response = await request(app)
        .put(`/api/external/custom-apis/${customApiId}`)
        .set('X-API-Token', apiToken)
        .send({
          name: '更新的API',
          status: 'inactive'
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // 验证更新
      const api = await getAsync('SELECT * FROM custom_apis WHERE id = ?', [customApiId]);
      expect(api.name).toBe('更新的API');
      expect(api.status).toBe('inactive');
    });

    it('应该拒绝至少提供一个字段的要求', async () => {
      const response = await request(app)
        .put(`/api/external/custom-apis/${customApiId}`)
        .set('X-API-Token', apiToken)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/external/custom-apis/:id', () => {
    it('应该删除API', async () => {
      const response = await request(app)
        .delete(`/api/external/custom-apis/${customApiId}`)
        .set('X-API-Token', apiToken)
        .expect(200);

      expect(response.body.success).toBe(true);

      // 验证已删除
      const api = await getAsync('SELECT * FROM custom_apis WHERE id = ?', [customApiId]);
      expect(api).toBeFalsy();
    });

    it('应该返回404当API不存在', async () => {
      const response = await request(app)
        .delete('/api/external/custom-apis/99999')
        .set('X-API-Token', apiToken)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /api/external/custom-apis/:id/content', () => {
    it('应该更新字段值', async () => {
      const response = await request(app)
        .patch(`/api/external/custom-apis/${customApiId}/content`)
        .set('X-API-Token', apiToken)
        .send({
          operation: 'update',
          path: 'message',
          value: 'Updated Message'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // 验证更新
      const api = await getAsync('SELECT response_content FROM custom_apis WHERE id = ?', [customApiId]);
      const content = JSON.parse(api.response_content);
      expect(content.message).toBe('Updated Message');
    });

    it('应该追加元素到数组', async () => {
      const response = await request(app)
        .patch(`/api/external/custom-apis/${customApiId}/content`)
        .set('X-API-Token', apiToken)
        .send({
          operation: 'append',
          path: 'data.items',
          value: { id: 2, name: 'Item 2' }
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // 验证追加
      const api = await getAsync('SELECT response_content FROM custom_apis WHERE id = ?', [customApiId]);
      const content = JSON.parse(api.response_content);
      expect(content.data.items.length).toBe(2);
      expect(content.data.items[1]).toEqual({ id: 2, name: 'Item 2' });
    });

    it('应该删除数组元素（通过索引）', async () => {
      const response = await request(app)
        .patch(`/api/external/custom-apis/${customApiId}/content`)
        .set('X-API-Token', apiToken)
        .send({
          operation: 'delete',
          path: 'data.items.0'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // 验证删除
      const api = await getAsync('SELECT response_content FROM custom_apis WHERE id = ?', [customApiId]);
      const content = JSON.parse(api.response_content);
      expect(content.data.items.length).toBe(0);
    });

    it('应该删除字段', async () => {
      const response = await request(app)
        .patch(`/api/external/custom-apis/${customApiId}/content`)
        .set('X-API-Token', apiToken)
        .send({
          operation: 'remove',
          path: 'message'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      
      // 验证删除
      const api = await getAsync('SELECT response_content FROM custom_apis WHERE id = ?', [customApiId]);
      const content = JSON.parse(api.response_content);
      expect(content.message).toBeUndefined();
    });

    it('应该拒绝无效的操作类型', async () => {
      const response = await request(app)
        .patch(`/api/external/custom-apis/${customApiId}/content`)
        .set('X-API-Token', apiToken)
        .send({
          operation: 'invalid',
          path: 'message',
          value: 'test'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/external/custom-apis/:id/logs', () => {
    beforeEach(async () => {
      // 创建一些日志
      await runAsync(`
        INSERT INTO custom_api_logs 
        (api_id, request_method, request_path, response_status, response_time_ms, ip_address, created_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
      `, [customApiId, 'GET', '/api/custom/test', 200, 15, '127.0.0.1']);
    });

    it('应该返回API日志列表', async () => {
      const response = await request(app)
        .get(`/api/external/custom-apis/${customApiId}/logs`)
        .set('X-API-Token', apiToken)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('logs');
      expect(response.body.data.logs).toBeInstanceOf(Array);
      expect(response.body.data.logs.length).toBeGreaterThan(0);
    });

    it('应该支持分页', async () => {
      const response = await request(app)
        .get(`/api/external/custom-apis/${customApiId}/logs?page=1&limit=10`)
        .set('X-API-Token', apiToken)
        .expect(200);

      expect(response.body.data.page).toBe(1);
      expect(response.body.data.limit).toBe(10);
    });
  });
});

