/**
 * 网络状态检测工具
 * 检测网络连接状态，离线时显示提示，在线时自动重试失败的请求
 */

let isOnline = navigator.onLine;
let offlineQueue = []; // 离线时的请求队列

/**
 * 初始化网络状态监听
 */
function initNetworkMonitor() {
  // 监听在线事件
  window.addEventListener('online', () => {
    isOnline = true;
    handleOnline();
  });

  // 监听离线事件
  window.addEventListener('offline', () => {
    isOnline = false;
    handleOffline();
  });

  // 初始状态检查
  if (!isOnline) {
    handleOffline();
  }
}

/**
 * 处理在线状态
 */
function handleOnline() {
  // 显示在线提示
  if (typeof showToast === 'function') {
    showToast('Connection restored', 'success');
  }

  // 处理离线队列中的请求
  if (offlineQueue.length > 0 && typeof processOfflineQueue === 'function') {
    processOfflineQueue();
  }
}

/**
 * 处理离线状态
 */
function handleOffline() {
  // 显示离线提示
  if (typeof showToast === 'function') {
    showToast('No internet connection. Some features may not work.', 'warning');
  }
}

/**
 * 检查网络状态
 * @returns {boolean} 是否在线
 */
function checkNetworkStatus() {
  return navigator.onLine;
}

/**
 * 添加到离线队列
 * @param {function} requestFn - 请求函数
 */
function addToOfflineQueue(requestFn) {
  offlineQueue.push(requestFn);
}

/**
 * 清空离线队列
 */
function clearOfflineQueue() {
  offlineQueue = [];
}

/**
 * 获取离线队列长度
 * @returns {number} 队列长度
 */
function getOfflineQueueLength() {
  return offlineQueue.length;
}

// 自动初始化（如果不在Node环境）
if (typeof window !== 'undefined') {
  // 延迟初始化，确保DOM已加载
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNetworkMonitor);
  } else {
    initNetworkMonitor();
  }
}

// 导出函数（如果在模块环境中）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initNetworkMonitor,
    checkNetworkStatus,
    addToOfflineQueue,
    clearOfflineQueue,
    getOfflineQueueLength,
    isOnline: () => isOnline
  };
}

