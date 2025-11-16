/**
 * 统一的API请求封装
 * 提供统一的fetch封装，自动处理认证、错误、loading等
 */

// API基础URL（如果未定义则定义，避免重复声明）
if (typeof API_BASE === 'undefined') {
  var API_BASE = '/api';
}
const DEFAULT_TIMEOUT = 30000; // 30秒超时
const MAX_RETRIES = 2; // 最大重试次数

/**
 * 统一的API请求函数
 * @param {string} url - API路径（相对于API_BASE）
 * @param {object} options - fetch选项
 * @param {object} options.method - HTTP方法（GET, POST, PUT, DELETE等）
 * @param {object} options.body - 请求体（会自动JSON.stringify）
 * @param {object} options.headers - 额外的请求头
 * @param {boolean} options.showLoading - 是否显示全局loading（默认false）
 * @param {boolean} options.showError - 是否自动显示错误Toast（默认true）
 * @param {number} options.timeout - 请求超时时间（毫秒，默认30000）
 * @param {number} options.retries - 重试次数（默认0，网络错误时自动重试）
 * @returns {Promise} 返回解析后的JSON数据
 */
async function apiRequest(url, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    showLoading = false,
    showError = true,
    timeout = DEFAULT_TIMEOUT,
    retries = 0,
    ...restOptions
  } = options;

  // 构建完整URL
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;

  // 准备请求选项
  const requestOptions = {
    method,
    credentials: 'include', // 自动包含cookies
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    ...restOptions
  };

  // 处理请求体
  if (body) {
    if (body instanceof FormData) {
      // FormData不需要设置Content-Type，浏览器会自动设置
      delete requestOptions.headers['Content-Type'];
      requestOptions.body = body;
    } else if (typeof body === 'object') {
      requestOptions.body = JSON.stringify(body);
    } else {
      requestOptions.body = body;
    }
  }

  // 显示loading
  if (showLoading && typeof showGlobalLoading === 'function') {
    showGlobalLoading('Loading...');
  }

  let lastError = null;
  let attempt = 0;

  while (attempt <= retries) {
    try {
      // 创建超时Promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), timeout);
      });

      // 执行请求
      const fetchPromise = fetch(fullUrl, requestOptions);
      const response = await Promise.race([fetchPromise, timeoutPromise]);

      // 隐藏loading
      if (showLoading && typeof hideGlobalLoading === 'function') {
        hideGlobalLoading();
      }

      // 处理响应
      const contentType = response.headers.get('content-type');
      let data;

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        // 如果不是JSON，可能是HTML错误页面
        const text = await response.text();
        // 如果返回的是HTML，说明可能是404或其他错误
        if (text.trim().startsWith('<!') || text.trim().startsWith('<html')) {
          throw new Error(`Server returned HTML instead of JSON. Status: ${response.status}. This usually means the API endpoint doesn't exist.`);
        }
        data = text;
      }

      // 处理HTTP错误状态
      if (!response.ok) {
        // 401未授权 - 只在showError为true时自动跳转登录
        if (response.status === 401) {
          if (showError && typeof window !== 'undefined' && window.location) {
            // 用户端跳转到登录页
            if (window.location.pathname.includes('admin')) {
              window.location.href = '/admin.html';
            } else {
              // 用户端显示登录模态框（只在showError为true时）
              if (typeof showLoginModal === 'function') {
                showLoginModal();
              }
            }
          }
          throw new Error('Unauthorized. Please login again.');
        }

        // 其他错误
        const errorMessage = data?.message || data?.error || `Request failed with status ${response.status}`;
        const error = new Error(errorMessage);
        error.status = response.status;
        error.data = data;
        error.response = response;

        if (showError && typeof showToast === 'function') {
          showToast(errorMessage, 'error');
        }

        throw error;
      }

      // 成功返回数据
      return data;

    } catch (error) {
      lastError = error;

      // 网络错误或超时 - 可以重试
      const isNetworkError = error.message === 'Request timeout' || 
                            error.message === 'Failed to fetch' ||
                            error.name === 'TypeError';

      if (isNetworkError && attempt < retries) {
        attempt++;
        // 等待后重试（指数退避）
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }

      // 隐藏loading
      if (showLoading && typeof hideGlobalLoading === 'function') {
        hideGlobalLoading();
      }

      // 处理错误
      if (showError && typeof showToast === 'function') {
        const errorMessage = getErrorMessage(error);
        showToast(errorMessage, 'error');
      }

      // 记录错误（开发环境）
      if (typeof console !== 'undefined' && console.error) {
        console.error('API Request Error:', {
          url: fullUrl,
          method,
          error: error.message,
          status: error.status
        });
      }

      throw error;
    }
  }

  // 如果所有重试都失败
  if (showLoading && typeof hideGlobalLoading === 'function') {
    hideGlobalLoading();
  }

  throw lastError;
}

/**
 * 获取友好的错误消息
 * @param {Error} error - 错误对象
 * @returns {string} 友好的错误消息
 */
function getErrorMessage(error) {
  if (error.message === 'Request timeout') {
    return 'Request timeout. Please try again.';
  }
  if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
    return 'Network error. Please check your connection.';
  }
  if (error.status === 401) {
    return 'Unauthorized. Please login again.';
  }
  if (error.status === 403) {
    return 'Access denied.';
  }
  if (error.status === 404) {
    return 'Resource not found.';
  }
  if (error.status === 500) {
    return 'Server error. Please try again later.';
  }
  return error.message || 'An error occurred. Please try again.';
}

/**
 * GET请求快捷方法
 */
async function apiGet(url, options = {}) {
  return apiRequest(url, { ...options, method: 'GET' });
}

/**
 * POST请求快捷方法
 */
async function apiPost(url, body, options = {}) {
  return apiRequest(url, { ...options, method: 'POST', body });
}

/**
 * PUT请求快捷方法
 */
async function apiPut(url, body, options = {}) {
  return apiRequest(url, { ...options, method: 'PUT', body });
}

/**
 * DELETE请求快捷方法
 */
async function apiDelete(url, options = {}) {
  return apiRequest(url, { ...options, method: 'DELETE' });
}

// 导出函数（如果在模块环境中）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    apiRequest,
    apiGet,
    apiPost,
    apiPut,
    apiDelete,
    getErrorMessage
  };
}

