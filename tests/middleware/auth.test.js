const { requireAuth, requireUserAuth, requireRole } = require('../../middleware/auth');
const { createMockRequest, createMockResponse } = require('../helpers/mock-data');

// Mock session-config to avoid database calls
jest.mock('../../utils/session-config', () => ({
  getAdminSessionTimeoutMs: jest.fn().mockResolvedValue(24 * 60 * 60 * 1000), // 24 hours
  getUserSessionTimeoutMs: jest.fn().mockResolvedValue(7 * 24 * 60 * 60 * 1000) // 7 days
}));

describe('Auth Middleware', () => {
  describe('requireAuth', () => {
    it('should return 401 if not logged in', async () => {
      const req = createMockRequest({ session: {} });
      const res = createMockResponse();
      const next = jest.fn();

      await requireAuth(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('请先登录');
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next if admin is logged in', async () => {
      const req = createMockRequest({
        session: { adminId: 1, adminUsername: 'admin', _adminLoginTime: Date.now() }
      });
      const res = createMockResponse();
      const next = jest.fn();

      await requireAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.statusCode).toBe(200);
    });

    it('should return 401 if session is null', async () => {
      const req = { session: null };
      const res = createMockResponse();
      const next = jest.fn();

      await requireAuth(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireUserAuth', () => {
    it('should return 401 if user not logged in', async () => {
      const req = createMockRequest({ session: {} });
      const res = createMockResponse();
      const next = jest.fn();

      await requireUserAuth(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('请先输入手机号登录');
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next if user is logged in', async () => {
      const req = createMockRequest({
        session: { userId: 1, userPhone: '13800138000', _userLoginTime: Date.now() }
      });
      const res = createMockResponse();
      const next = jest.fn();

      await requireUserAuth(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireRole', () => {
    it('should return 401 if not logged in', () => {
      const req = createMockRequest({ session: {} });
      const res = createMockResponse();
      const next = jest.fn();

      const middleware = requireRole(['admin']);
      middleware(req, res, next);

      expect(res.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 403 if role not in allowed roles', () => {
      const req = createMockRequest({
        session: { adminId: 1, adminRole: 'user' }
      });
      const res = createMockResponse();
      const next = jest.fn();

      const middleware = requireRole(['admin']);
      middleware(req, res, next);

      expect(res.statusCode).toBe(403);
      expect(res.body.message).toBe('权限不足');
      expect(next).not.toHaveBeenCalled();
    });

    it('should call next if role is allowed', () => {
      const req = createMockRequest({
        session: { adminId: 1, adminRole: 'admin' }
      });
      const res = createMockResponse();
      const next = jest.fn();

      const middleware = requireRole(['admin']);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('should allow any role if roles array is empty', () => {
      const req = createMockRequest({
        session: { adminId: 1, adminRole: 'any_role' }
      });
      const res = createMockResponse();
      const next = jest.fn();

      const middleware = requireRole([]);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});

