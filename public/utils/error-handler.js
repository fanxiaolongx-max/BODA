/**
 * 错误处理工具
 * 提供统一的错误处理和错误消息格式化
 */

/**
 * 处理API错误
 * @param {Error} error - 错误对象
 * @param {Response} response - fetch响应对象（可选）
 * @returns {object} { message: string, status: number, code: string }
 */
function handleApiError(error, response = null) {
  let message = 'An error occurred';
  let status = 500;
  let code = 'UNKNOWN_ERROR';

  // 网络错误
  if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
    message = 'Network error. Please check your connection.';
    code = 'NETWORK_ERROR';
    status = 0;
  }
  // 超时错误
  else if (error.message === 'Request timeout') {
    message = 'Request timeout. Please try again.';
    code = 'TIMEOUT_ERROR';
    status = 408;
  }
  // HTTP错误
  else if (response) {
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
      case 409:
        message = 'Conflict. The resource already exists.';
        code = 'CONFLICT';
        break;
      case 422:
        message = 'Validation error. Please check your input.';
        code = 'VALIDATION_ERROR';
        break;
      case 429:
        message = 'Too many requests. Please try again later.';
        code = 'RATE_LIMIT';
        break;
      case 500:
        message = 'Server error. Please try again later.';
        code = 'SERVER_ERROR';
        break;
      case 503:
        message = 'Service unavailable. Please try again later.';
        code = 'SERVICE_UNAVAILABLE';
        break;
      default:
        message = `Request failed with status ${status}`;
        code = 'HTTP_ERROR';
    }
  }
  // 其他错误
  else if (error.message) {
    message = error.message;
    code = error.code || 'UNKNOWN_ERROR';
    status = error.status || 500;
  }

  // 记录错误（开发环境）
  if (typeof console !== 'undefined' && console.error) {
    console.error('API Error:', {
      message,
      status,
      code,
      error: error.message,
      stack: error.stack
    });
  }

  return { message, status, code };
}

/**
 * 处理网络错误
 * @param {Error} error - 错误对象
 * @returns {object} { message: string, shouldRetry: boolean }
 */
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

/**
 * 获取友好的错误消息
 * @param {Error|object} error - 错误对象或错误数据
 * @returns {string} 友好的错误消息
 */
function getErrorMessage(error) {
  if (!error) {
    return 'An error occurred';
  }

  // 如果是字符串，直接返回
  if (typeof error === 'string') {
    return error;
  }

  // 如果有message属性
  if (error.message) {
    return error.message;
  }

  // 如果是API响应格式 { success: false, message: '...' }
  if (error.data && error.data.message) {
    return error.data.message;
  }

  // 如果是错误对象
  if (error.error) {
    return typeof error.error === 'string' ? error.error : 'An error occurred';
  }

  return 'An error occurred. Please try again.';
}

/**
 * 格式化验证错误
 * @param {object} errors - 验证错误对象 { fieldName: 'error message' }
 * @returns {string} 格式化的错误消息
 */
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

// 导出函数（如果在模块环境中）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    handleApiError,
    handleNetworkError,
    getErrorMessage,
    formatValidationErrors
  };
}

