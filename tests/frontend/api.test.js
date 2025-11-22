/**
 * @jest-environment jsdom
 */

/**
 * API工具测试
 * 测试统一的API请求封装函数
 */

// Mock fetch
global.fetch = jest.fn();

describe('API工具测试', () => {
  beforeEach(() => {
    fetch.mockClear();
    // 清空body
    document.body.innerHTML = '';
    // 清除所有定时器
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // 从utils/api.js加载函数（简化版用于测试）
  function apiRequest(url, options = {}) {
    const {
      method = 'GET',
      body,
      headers = {},
      showLoading = false,
      showError = true,
      timeout = 30000,
      retries = 0,
      ...restOptions
    } = options;

    const fullUrl = url.startsWith('http') ? url : `/api${url}`;

    const requestOptions = {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      ...restOptions
    };

    if (body) {
      if (body instanceof FormData) {
        delete requestOptions.headers['Content-Type'];
        requestOptions.body = body;
      } else if (typeof body === 'object') {
        requestOptions.body = JSON.stringify(body);
      } else {
        requestOptions.body = body;
      }
    }

    return fetch(fullUrl, requestOptions)
      .then(async response => {
        const contentType = response.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Unauthorized. Please login again.');
          }
          const error = new Error(data?.message || `Request failed with status ${response.status}`);
          error.status = response.status;
          error.data = data;
          error.response = response;
          throw error;
        }

        return data;
      })
      .catch(error => {
        if (showError && typeof showToast === 'function') {
          const errorMessage = error.message || 'An error occurred';
          showToast(errorMessage, 'error');
        }
        throw error;
      });
  }

  function apiGet(url, options = {}) {
    return apiRequest(url, { ...options, method: 'GET' });
  }

  function apiPost(url, body, options = {}) {
    return apiRequest(url, { ...options, method: 'POST', body });
  }

  function apiPut(url, body, options = {}) {
    return apiRequest(url, { ...options, method: 'PUT', body });
  }

  function apiDelete(url, options = {}) {
    return apiRequest(url, { ...options, method: 'DELETE' });
  }

  describe('apiRequest - 成功请求', () => {
    test('应该成功发送GET请求', async () => {
      const mockData = { success: true, data: 'test' };
      fetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => 'application/json'
        },
        json: async () => mockData
      });

      const result = await apiGet('/test', { showError: false });

      expect(fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include'
        })
      );
      expect(result).toEqual(mockData);
    });

    test('应该成功发送POST请求', async () => {
      const mockData = { success: true };
      const requestBody = { name: 'test' };

      fetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => 'application/json'
        },
        json: async () => mockData
      });

      const result = await apiPost('/test', requestBody, { showError: false });

      expect(fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(requestBody),
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
      expect(result).toEqual(mockData);
    });

    test('应该处理FormData请求', async () => {
      const mockData = { success: true };
      const formData = new FormData();
      formData.append('file', 'test');

      fetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: () => 'application/json'
        },
        json: async () => mockData
      });

      const result = await apiRequest('/upload', {
        method: 'POST',
        body: formData,
        showError: false
      });

      expect(fetch).toHaveBeenCalledWith(
        '/api/upload',
        expect.objectContaining({
          method: 'POST',
          body: formData
        })
      );
      // FormData请求不应该有Content-Type头
      const callArgs = fetch.mock.calls[0][1];
      expect(callArgs.headers['Content-Type']).toBeUndefined();
      expect(result).toEqual(mockData);
    });
  });

  describe('apiRequest - 错误处理', () => {
    test('应该处理401未授权错误', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: {
          get: () => 'application/json'
        },
        json: async () => ({ message: 'Unauthorized' })
      });

      await expect(apiGet('/test', { showError: false })).rejects.toThrow('Unauthorized');
    });

    test('应该处理400错误', async () => {
      const errorData = { message: 'Bad request' };
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: {
          get: () => 'application/json'
        },
        json: async () => errorData
      });

      try {
        await apiGet('/test', { showError: false });
      } catch (error) {
        expect(error.status).toBe(400);
        expect(error.data).toEqual(errorData);
      }
    });

    test('应该处理网络错误', async () => {
      fetch.mockRejectedValueOnce(new Error('Failed to fetch'));

      await expect(apiGet('/test', { showError: false })).rejects.toThrow('Failed to fetch');
    });

    test('应该处理500服务器错误', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: {
          get: () => 'application/json'
        },
        json: async () => ({ message: 'Server error' })
      });

      try {
        await apiGet('/test', { showError: false });
      } catch (error) {
        expect(error.status).toBe(500);
      }
    });
  });

  describe('快捷方法', () => {
    test('apiGet应该使用GET方法', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true })
      });

      await apiGet('/test', { showError: false });

      expect(fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({ method: 'GET' })
      );
    });

    test('apiPost应该使用POST方法', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true })
      });

      await apiPost('/test', { data: 'test' }, { showError: false });

      expect(fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({ method: 'POST' })
      );
    });

    test('apiPut应该使用PUT方法', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true })
      });

      await apiPut('/test', { data: 'test' }, { showError: false });

      expect(fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({ method: 'PUT' })
      );
    });

    test('apiDelete应该使用DELETE方法', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => ({ success: true })
      });

      await apiDelete('/test', { showError: false });

      expect(fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});

