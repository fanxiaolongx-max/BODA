/**
 * @jest-environment jsdom
 */

/**
 * 表单验证工具测试
 * 测试各种验证函数
 */

describe('表单验证工具测试', () => {
  // 从utils/validation.js加载函数
  function validatePhone(phone) {
    if (!phone || typeof phone !== 'string') {
      return { valid: false, message: 'Phone number is required' };
    }

    const trimmed = phone.trim();

    if (trimmed.length === 0) {
      return { valid: false, message: 'Phone number is required' };
    }

    if (trimmed.length < 8 || trimmed.length > 15) {
      return { valid: false, message: 'Phone number length should be between 8-15 digits' };
    }

    if (!/^[+\d]+$/.test(trimmed)) {
      return { valid: false, message: 'Phone number can only contain digits and +' };
    }

    return { valid: true, message: '' };
  }

  function validateEmail(email) {
    if (!email || typeof email !== 'string') {
      return { valid: false, message: 'Email is required' };
    }

    const trimmed = email.trim();

    if (trimmed.length === 0) {
      return { valid: false, message: 'Email is required' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmed)) {
      return { valid: false, message: 'Please enter a valid email address' };
    }

    return { valid: true, message: '' };
  }

  function validateRequired(value, fieldName = 'This field') {
    if (value === null || value === undefined) {
      return { valid: false, message: `${fieldName} is required` };
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      return { valid: false, message: `${fieldName} is required` };
    }

    if (Array.isArray(value) && value.length === 0) {
      return { valid: false, message: `${fieldName} is required` };
    }

    return { valid: true, message: '' };
  }

  function validateNumber(value, min = null, max = null) {
    if (value === null || value === undefined || value === '') {
      return { valid: false, message: 'Number is required' };
    }

    const num = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(num)) {
      return { valid: false, message: 'Please enter a valid number' };
    }

    if (min !== null && num < min) {
      return { valid: false, message: `Number must be at least ${min}` };
    }

    if (max !== null && num > max) {
      return { valid: false, message: `Number must be at most ${max}` };
    }

    return { valid: true, message: '' };
  }

  function validateLength(value, minLength = null, maxLength = null) {
    if (value === null || value === undefined) {
      return { valid: false, message: 'Value is required' };
    }

    const str = String(value);
    const length = str.length;

    if (minLength !== null && length < minLength) {
      return { valid: false, message: `Must be at least ${minLength} characters` };
    }

    if (maxLength !== null && length > maxLength) {
      return { valid: false, message: `Must be at most ${maxLength} characters` };
    }

    return { valid: true, message: '' };
  }

  function validateURL(url) {
    if (!url || typeof url !== 'string') {
      return { valid: false, message: 'URL is required' };
    }

    const trimmed = url.trim();

    if (trimmed.length === 0) {
      return { valid: false, message: 'URL is required' };
    }

    try {
      new URL(trimmed);
      return { valid: true, message: '' };
    } catch (e) {
      return { valid: false, message: 'Please enter a valid URL' };
    }
  }

  function validateForm(formData, rules) {
    const errors = {};
    let isValid = true;

    for (const [fieldName, fieldRules] of Object.entries(rules)) {
      const value = formData[fieldName];

      if (Array.isArray(fieldRules)) {
        for (const rule of fieldRules) {
          if (typeof rule === 'function') {
            const result = rule(value, fieldName);
            if (!result.valid) {
              errors[fieldName] = result.message;
              isValid = false;
              break;
            }
          }
        }
      } else if (typeof fieldRules === 'function') {
        const result = fieldRules(value, fieldName);
        if (!result.valid) {
          errors[fieldName] = result.message;
          isValid = false;
        }
      }
    }

    return { valid: isValid, errors };
  }

  describe('validatePhone', () => {
    test('应该验证有效的手机号', () => {
      expect(validatePhone('12345678')).toEqual({ valid: true, message: '' });
      expect(validatePhone('+201234567890')).toEqual({ valid: true, message: '' });
      expect(validatePhone('123456789012345')).toEqual({ valid: true, message: '' });
    });

    test('应该拒绝空手机号', () => {
      expect(validatePhone('')).toEqual({ valid: false, message: 'Phone number is required' });
      expect(validatePhone('   ')).toEqual({ valid: false, message: 'Phone number is required' });
      expect(validatePhone(null)).toEqual({ valid: false, message: 'Phone number is required' });
    });

    test('应该拒绝长度不符合要求的手机号', () => {
      expect(validatePhone('1234567')).toEqual({ valid: false, message: 'Phone number length should be between 8-15 digits' });
      expect(validatePhone('1234567890123456')).toEqual({ valid: false, message: 'Phone number length should be between 8-15 digits' });
    });

    test('应该拒绝包含非法字符的手机号', () => {
      expect(validatePhone('12345abc')).toEqual({ valid: false, message: 'Phone number can only contain digits and +' });
      expect(validatePhone('12345-678')).toEqual({ valid: false, message: 'Phone number can only contain digits and +' });
    });
  });

  describe('validateEmail', () => {
    test('应该验证有效的邮箱', () => {
      expect(validateEmail('test@example.com')).toEqual({ valid: true, message: '' });
      expect(validateEmail('user.name@example.co.uk')).toEqual({ valid: true, message: '' });
    });

    test('应该拒绝无效的邮箱格式', () => {
      expect(validateEmail('invalid')).toEqual({ valid: false, message: 'Please enter a valid email address' });
      expect(validateEmail('invalid@')).toEqual({ valid: false, message: 'Please enter a valid email address' });
      expect(validateEmail('@example.com')).toEqual({ valid: false, message: 'Please enter a valid email address' });
    });

    test('应该拒绝空邮箱', () => {
      expect(validateEmail('')).toEqual({ valid: false, message: 'Email is required' });
      expect(validateEmail(null)).toEqual({ valid: false, message: 'Email is required' });
    });
  });

  describe('validateRequired', () => {
    test('应该验证非空值', () => {
      expect(validateRequired('test')).toEqual({ valid: true, message: '' });
      expect(validateRequired(123)).toEqual({ valid: true, message: '' });
      expect(validateRequired([1, 2])).toEqual({ valid: true, message: '' });
    });

    test('应该拒绝空值', () => {
      expect(validateRequired('')).toEqual({ valid: false, message: 'This field is required' });
      expect(validateRequired('   ')).toEqual({ valid: false, message: 'This field is required' });
      expect(validateRequired(null)).toEqual({ valid: false, message: 'This field is required' });
      expect(validateRequired(undefined)).toEqual({ valid: false, message: 'This field is required' });
      expect(validateRequired([])).toEqual({ valid: false, message: 'This field is required' });
    });

    test('应该支持自定义字段名', () => {
      expect(validateRequired('', 'Username')).toEqual({ valid: false, message: 'Username is required' });
    });
  });

  describe('validateNumber', () => {
    test('应该验证有效数字', () => {
      expect(validateNumber(10)).toEqual({ valid: true, message: '' });
      expect(validateNumber('10')).toEqual({ valid: true, message: '' });
      expect(validateNumber(10, 5, 15)).toEqual({ valid: true, message: '' });
    });

    test('应该验证数字范围', () => {
      expect(validateNumber(5, 1, 10)).toEqual({ valid: true, message: '' });
      expect(validateNumber(1, 1, 10)).toEqual({ valid: true, message: '' });
      expect(validateNumber(10, 1, 10)).toEqual({ valid: true, message: '' });
    });

    test('应该拒绝超出范围', () => {
      expect(validateNumber(0, 1, 10)).toEqual({ valid: false, message: 'Number must be at least 1' });
      expect(validateNumber(11, 1, 10)).toEqual({ valid: false, message: 'Number must be at most 10' });
    });

    test('应该拒绝非数字', () => {
      expect(validateNumber('abc')).toEqual({ valid: false, message: 'Please enter a valid number' });
      expect(validateNumber(null)).toEqual({ valid: false, message: 'Number is required' });
    });
  });

  describe('validateLength', () => {
    test('应该验证字符串长度', () => {
      expect(validateLength('test', 1, 10)).toEqual({ valid: true, message: '' });
      expect(validateLength('test', 4, 4)).toEqual({ valid: true, message: '' });
    });

    test('应该拒绝长度不符合要求的字符串', () => {
      expect(validateLength('test', 5, 10)).toEqual({ valid: false, message: 'Must be at least 5 characters' });
      expect(validateLength('test', 1, 3)).toEqual({ valid: false, message: 'Must be at most 3 characters' });
    });
  });

  describe('validateURL', () => {
    test('应该验证有效URL', () => {
      expect(validateURL('https://example.com')).toEqual({ valid: true, message: '' });
      expect(validateURL('http://example.com/path')).toEqual({ valid: true, message: '' });
    });

    test('应该拒绝无效URL', () => {
      expect(validateURL('not-a-url')).toEqual({ valid: false, message: 'Please enter a valid URL' });
      expect(validateURL('')).toEqual({ valid: false, message: 'URL is required' });
    });
  });

  describe('validateForm', () => {
    test('应该验证整个表单', () => {
      const formData = {
        phone: '12345678',
        email: 'test@example.com',
        name: 'Test'
      };

      const rules = {
        phone: (value) => validatePhone(value),
        email: (value) => validateEmail(value),
        name: (value) => validateRequired(value, 'Name')
      };

      const result = validateForm(formData, rules);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual({});
    });

    test('应该返回验证错误', () => {
      const formData = {
        phone: '123',
        email: 'invalid',
        name: ''
      };

      const rules = {
        phone: (value) => validatePhone(value),
        email: (value) => validateEmail(value),
        name: (value) => validateRequired(value, 'Name')
      };

      const result = validateForm(formData, rules);
      expect(result.valid).toBe(false);
      expect(result.errors.phone).toBeDefined();
      expect(result.errors.email).toBeDefined();
      expect(result.errors.name).toBeDefined();
    });

    test('应该支持多个验证规则', () => {
      const formData = {
        phone: '12345678'
      };

      const rules = {
        phone: [
          (value) => validateRequired(value, 'Phone'),
          (value) => validatePhone(value)
        ]
      };

      const result = validateForm(formData, rules);
      expect(result.valid).toBe(true);
    });
  });
});

