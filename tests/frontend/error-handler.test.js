/**
 * 错误处理工具测试
 * 测试错误处理和错误消息格式化
 */

describe('错误处理工具测试', () => {
  // 从utils/error-handler.js加载函数
  function handleApiError(error, response = null) {
    let message = 'An error occurred';
    let status = 500;
    let code = 'UNKNOWN_ERROR';

    if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
      message = 'Network error. Please check your connection.';
      code = 'NETWORK_ERROR';
      status = 0;
    } else if (error.message === 'Request timeout') {
      message = 'Request timeout. Please try again.';
      code = 'TIMEOUT_ERROR';
      status = 408;
    } else if (response) {
      status = response.status;
      
      switch (status) {
        case 400:
          message = 'Invalid request. Please check your input.';
          code = 'BAD_REQUEST';
          break;
        case 401:
          message = 'Unauthorized. Please login again.';
          code = 'UNAUTHORIZED';
          break;
        case 403:
          message = 'Access denied.';
          code = 'FORBIDDEN';
          break;
        case 404:
          message = 'Resource not found.';
          code = 'NOT_FOUND';
          break;
        case 500:
          message = 'Server error. Please try again later.';
          code = 'SERVER_ERROR';
          break;
        default:
          message = `Request failed with status ${status}`;
          code = 'HTTP_ERROR';
      }
    } else if (error.message) {
      message = error.message;
      code = error.code || 'UNKNOWN_ERROR';
      status = error.status || 500;
    }

    return { message, status, code };
  }

  function handleNetworkError(error) {
    const isNetworkError = error.message === 'Failed to fetch' || 
                          error.name === 'TypeError' ||
                          error.message === 'Request timeout';

    if (isNetworkError) {
      return {
        message: 'Network error. Please check your connection and try again.',
        shouldRetry: true
      };
    }

    return {
      message: error.message || 'An error occurred',
      shouldRetry: false
    };
  }

  function getErrorMessage(error) {
    if (!error) {
      return 'An error occurred';
    }

    if (typeof error === 'string') {
      return error;
    }

    if (error.message) {
      return error.message;
    }

    if (error.data && error.data.message) {
      return error.data.message;
    }

    if (error.error) {
      return typeof error.error === 'string' ? error.error : 'An error occurred';
    }

    return 'An error occurred. Please try again.';
  }

  function formatValidationErrors(errors) {
    if (!errors || typeof errors !== 'object') {
      return 'Validation failed';
    }

    const errorMessages = Object.values(errors).filter(msg => msg);
    
    if (errorMessages.length === 0) {
      return 'Validation failed';
    }

    if (errorMessages.length === 1) {
      return errorMessages[0];
    }

    return `Multiple errors: ${errorMessages.join(', ')}`;
  }

  describe('handleApiError', () => {
    test('应该处理网络错误', () => {
      const error = new Error('Failed to fetch');
      error.name = 'TypeError';
      const result = handleApiError(error);
      
      expect(result.code).toBe('NETWORK_ERROR');
      expect(result.status).toBe(0);
      expect(result.message).toContain('Network error');
    });

    test('应该处理超时错误', () => {
      const error = new Error('Request timeout');
      const result = handleApiError(error);
      
      expect(result.code).toBe('TIMEOUT_ERROR');
      expect(result.status).toBe(408);
    });

    test('应该处理401未授权错误', () => {
      const error = new Error('Unauthorized');
      const response = { status: 401 };
      const result = handleApiError(error, response);
      
      expect(result.code).toBe('UNAUTHORIZED');
      expect(result.status).toBe(401);
      expect(result.message).toContain('Unauthorized');
    });

    test('应该处理403禁止访问错误', () => {
      const error = new Error('Forbidden');
      const response = { status: 403 };
      const result = handleApiError(error, response);
      
      expect(result.code).toBe('FORBIDDEN');
      expect(result.status).toBe(403);
    });

    test('应该处理404未找到错误', () => {
      const error = new Error('Not found');
      const response = { status: 404 };
      const result = handleApiError(error, response);
      
      expect(result.code).toBe('NOT_FOUND');
      expect(result.status).toBe(404);
    });

    test('应该处理500服务器错误', () => {
      const error = new Error('Server error');
      const response = { status: 500 };
      const result = handleApiError(error, response);
      
      expect(result.code).toBe('SERVER_ERROR');
      expect(result.status).toBe(500);
    });

    test('应该处理400错误请求', () => {
      const error = new Error('Bad request');
      const response = { status: 400 };
      const result = handleApiError(error, response);
      
      expect(result.code).toBe('BAD_REQUEST');
      expect(result.status).toBe(400);
    });
  });

  describe('handleNetworkError', () => {
    test('应该识别网络错误并建议重试', () => {
      const error = new Error('Failed to fetch');
      error.name = 'TypeError';
      const result = handleNetworkError(error);
      
      expect(result.shouldRetry).toBe(true);
      expect(result.message).toContain('Network error');
    });

    test('应该识别超时错误并建议重试', () => {
      const error = new Error('Request timeout');
      const result = handleNetworkError(error);
      
      expect(result.shouldRetry).toBe(true);
    });

    test('应该识别非网络错误', () => {
      const error = new Error('Some other error');
      const result = handleNetworkError(error);
      
      expect(result.shouldRetry).toBe(false);
      expect(result.message).toBe('Some other error');
    });
  });

  describe('getErrorMessage', () => {
    test('应该从错误对象获取消息', () => {
      const error = new Error('Test error');
      expect(getErrorMessage(error)).toBe('Test error');
    });

    test('应该从字符串获取消息', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    test('应该从API响应格式获取消息', () => {
      const error = {
        data: { message: 'API error message' }
      };
      expect(getErrorMessage(error)).toBe('API error message');
    });

    test('应该处理null/undefined', () => {
      expect(getErrorMessage(null)).toBe('An error occurred');
      expect(getErrorMessage(undefined)).toBe('An error occurred');
    });

    test('应该处理空错误对象', () => {
      expect(getErrorMessage({})).toBe('An error occurred. Please try again.');
    });
  });

  describe('formatValidationErrors', () => {
    test('应该格式化单个错误', () => {
      const errors = { phone: 'Phone is required' };
      expect(formatValidationErrors(errors)).toBe('Phone is required');
    });

    test('应该格式化多个错误', () => {
      const errors = {
        phone: 'Phone is required',
        email: 'Email is invalid'
      };
      const result = formatValidationErrors(errors);
      expect(result).toContain('Multiple errors');
      expect(result).toContain('Phone is required');
      expect(result).toContain('Email is invalid');
    });

    test('应该处理空错误对象', () => {
      expect(formatValidationErrors({})).toBe('Validation failed');
      expect(formatValidationErrors(null)).toBe('Validation failed');
    });
  });
});

