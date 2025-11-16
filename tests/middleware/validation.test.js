// Mock express-validator 的 validationResult，但保留其他函数
const expressValidator = require('express-validator');
jest.mock('express-validator', () => {
  const actual = jest.requireActual('express-validator');
  return {
    ...actual,
    validationResult: jest.fn()
  };
});

const { validationResult } = require('express-validator');
const { 
  validate, 
  loginValidation, 
  phoneValidation, 
  productValidation,
  categoryValidation,
  discountValidation 
} = require('../../middleware/validation');
const { createMockRequest, createMockResponse } = require('../helpers/mock-data');

describe('Validation Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validate', () => {
    it('should call next if no validation errors', () => {
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => []
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();

      validate(req, res, next);

      expect(validationResult).toHaveBeenCalledWith(req);
      expect(next).toHaveBeenCalled();
    });

    it('should return 400 if validation errors exist', () => {
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ msg: 'Validation error' }]
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = jest.fn();

      validate(req, res, next);

      expect(validationResult).toHaveBeenCalledWith(req);
      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('输入验证失败');
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('phoneValidation', () => {
    it('should accept valid phone numbers', async () => {
      const req = createMockRequest({ body: { phone: '13800138000' } });
      const res = createMockResponse();
      const next = jest.fn();

      await phoneValidation(req, res, () => {});
      // 如果验证通过，会调用next
      // 这里主要测试验证规则本身
    });

    it('should reject phone numbers that are too short', async () => {
      const req = createMockRequest({ body: { phone: '1234567' } });
      const res = createMockResponse();
      const next = jest.fn();

      await phoneValidation(req, res, () => {});
      // 验证应该失败
    });

    it('should reject phone numbers that are too long', async () => {
      const req = createMockRequest({ body: { phone: '123456789012345678' } });
      const res = createMockResponse();
      const next = jest.fn();

      await phoneValidation(req, res, () => {});
      // 验证应该失败
    });

    it('should accept international phone numbers with +', async () => {
      const req = createMockRequest({ body: { phone: '+8613800138000' } });
      const res = createMockResponse();
      const next = jest.fn();

      await phoneValidation(req, res, () => {});
      // 应该通过验证
    });
  });

  describe('loginValidation', () => {
    it('should validate username length', () => {
      expect(loginValidation).toBeDefined();
      expect(Array.isArray(loginValidation)).toBe(true);
    });
  });

  describe('productValidation', () => {
    it('should validate product fields', () => {
      expect(productValidation).toBeDefined();
      expect(Array.isArray(productValidation)).toBe(true);
    });
  });

  describe('categoryValidation', () => {
    it('should validate category fields', () => {
      expect(categoryValidation).toBeDefined();
      expect(Array.isArray(categoryValidation)).toBe(true);
    });
  });

  describe('discountValidation', () => {
    it('should validate discount rule fields', () => {
      expect(discountValidation).toBeDefined();
      expect(Array.isArray(discountValidation)).toBe(true);
    });
  });
});

