/**
 * 表单验证工具
 * 提供常用的表单验证函数
 */

/**
 * 验证手机号
 * @param {string} phone - 手机号
 * @returns {object} { valid: boolean, message: string }
 */
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

  // 只允许数字和+号（国际前缀）
  if (!/^[+\d]+$/.test(trimmed)) {
    return { valid: false, message: 'Phone number can only contain digits and +' };
  }

  return { valid: true, message: '' };
}

/**
 * 验证邮箱
 * @param {string} email - 邮箱地址
 * @returns {object} { valid: boolean, message: string }
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, message: 'Email is required' };
  }

  const trimmed = email.trim();

  if (trimmed.length === 0) {
    return { valid: false, message: 'Email is required' };
  }

  // 简单的邮箱格式验证
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, message: 'Please enter a valid email address' };
  }

  return { valid: true, message: '' };
}

/**
 * 验证必填字段
 * @param {any} value - 字段值
 * @param {string} fieldName - 字段名称（用于错误消息）
 * @returns {object} { valid: boolean, message: string }
 */
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

/**
 * 验证数字范围
 * @param {number|string} value - 数字值
 * @param {number} min - 最小值（可选）
 * @param {number} max - 最大值（可选）
 * @returns {object} { valid: boolean, message: string }
 */
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

/**
 * 验证字符串长度
 * @param {string} value - 字符串值
 * @param {number} minLength - 最小长度（可选）
 * @param {number} maxLength - 最大长度（可选）
 * @returns {object} { valid: boolean, message: string }
 */
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

/**
 * 验证URL
 * @param {string} url - URL地址
 * @returns {object} { valid: boolean, message: string }
 */
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

/**
 * 表单整体验证
 * @param {object} formData - 表单数据对象
 * @param {object} rules - 验证规则对象 { fieldName: [validationFunctions] }
 * @returns {object} { valid: boolean, errors: object }
 */
function validateForm(formData, rules) {
  const errors = {};
  let isValid = true;

  for (const [fieldName, fieldRules] of Object.entries(rules)) {
    const value = formData[fieldName];

    // 如果规则是数组，依次验证
    if (Array.isArray(fieldRules)) {
      for (const rule of fieldRules) {
        if (typeof rule === 'function') {
          const result = rule(value, fieldName);
          if (!result.valid) {
            errors[fieldName] = result.message;
            isValid = false;
            break; // 第一个错误就停止
          }
        }
      }
    } else if (typeof fieldRules === 'function') {
      // 单个验证函数
      const result = fieldRules(value, fieldName);
      if (!result.valid) {
        errors[fieldName] = result.message;
        isValid = false;
      }
    }
  }

  return { valid: isValid, errors };
}

// 导出函数（如果在模块环境中）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validatePhone,
    validateEmail,
    validateRequired,
    validateNumber,
    validateLength,
    validateURL,
    validateForm
  };
}

