/**
 * 博客工具函数
 */

const BLOG_API_BASE = '/api/blog';

/**
 * API请求封装
 */
async function apiRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || '请求失败');
    }
    
    return data;
  } catch (error) {
    console.error('API请求失败:', error);
    throw error;
  }
}

/**
 * 获取文章列表
 */
async function getPosts(options = {}) {
  const params = new URLSearchParams();
  
  if (options.page) params.append('page', options.page);
  if (options.pageSize) params.append('pageSize', options.pageSize);
  if (options.category) params.append('category', options.category);
  if (options.search) params.append('search', options.search);
  if (options.published !== undefined) params.append('published', options.published);
  if (options.myPosts !== undefined) params.append('myPosts', options.myPosts);
  
  const url = `${BLOG_API_BASE}/posts${params.toString() ? '?' + params.toString() : ''}`;
  return await apiRequest(url);
}

/**
 * 获取文章详情
 */
async function getPost(slug) {
  return await apiRequest(`${BLOG_API_BASE}/posts/${encodeURIComponent(slug)}`);
}

/**
 * 获取分类列表
 */
async function getCategories() {
  return await apiRequest(`${BLOG_API_BASE}/categories`);
}

/**
 * 获取文章评论
 */
async function getComments(postId, options = {}) {
  const params = new URLSearchParams();
  if (options.page) params.append('page', options.page);
  if (options.pageSize) params.append('pageSize', options.pageSize);
  
  const url = `${BLOG_API_BASE}/posts/${encodeURIComponent(postId)}/comments${params.toString() ? '?' + params.toString() : ''}`;
  return await apiRequest(url);
}

/**
 * 创建评论
 */
async function createComment(postId, commentData) {
  return await apiRequest(`${BLOG_API_BASE}/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    body: JSON.stringify(commentData)
  });
}

/**
 * 搜索文章
 */
async function searchPosts(query, options = {}) {
  const params = new URLSearchParams();
  params.append('q', query);
  if (options.page) params.append('page', options.page);
  if (options.pageSize) params.append('pageSize', options.pageSize);
  
  return await apiRequest(`${BLOG_API_BASE}/search?${params.toString()}`);
}

/**
 * 格式化日期
 */
function formatDate(dateString) {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * 格式化日期时间（中文）
 */
function formatDateTime(dateString) {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}

/**
 * 生成slug
 */
function generateSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * 截取文本
 */
function truncate(text, length = 100) {
  if (!text) return '';
  if (text.length <= length) return text;
  return text.substring(0, length) + '...';
}

/**
 * 转义HTML
 */
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * 显示Toast消息
 */
function showToast(message, type = 'info') {
  // 创建toast元素
  const toast = document.createElement('div');
  toast.className = `blog-toast blog-toast-${type}`;
  toast.textContent = message;
  
  // 添加到页面
  let toastContainer = document.getElementById('blog-toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'blog-toast-container';
    toastContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    document.body.appendChild(toastContainer);
  }
  
  toastContainer.appendChild(toast);
  
  // 添加样式
  toast.style.cssText = `
    padding: 12px 20px;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    animation: slideIn 0.3s ease-out;
  `;
  
  // 添加动画
  if (!document.getElementById('blog-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'blog-toast-styles';
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
      @keyframes slideOut {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(100%);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  // 3秒后移除
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-out';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

/**
 * 显示加载状态
 */
function showLoading(element) {
  if (typeof element === 'string') {
    element = document.querySelector(element);
  }
  
  if (element) {
    element.innerHTML = '<div class="blog-loading">加载中...</div>';
  }
}

/**
 * 隐藏加载状态
 */
function hideLoading(element) {
  if (typeof element === 'string') {
    element = document.querySelector(element);
  }
  
  if (element) {
    const loading = element.querySelector('.blog-loading');
    if (loading) {
      loading.remove();
    }
  }
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getPosts,
    getPost,
    getCategories,
    getComments,
    createComment,
    searchPosts,
    formatDate,
    formatDateTime,
    generateSlug,
    truncate,
    escapeHtml,
    showToast,
    showLoading,
    hideLoading
  };
}
