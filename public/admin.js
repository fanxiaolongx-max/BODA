// API基础URL（如果未定义则定义，避免重复声明）
if (typeof API_BASE === 'undefined') {
  var API_BASE = '/api';
}

// 统一的API请求处理函数（处理401自动跳转）
async function adminApiRequest(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'include'
    });
    
    // 处理401未授权 - 自动跳转到登录页
    if (response.status === 401) {
      stopSessionCheck();
      stopSessionRefresh();
      const wasLoggedIn = currentAdmin !== null; // 记录是否之前已登录
      currentAdmin = null;
      
      // 只有在已经登录的情况下才显示提示（避免首次打开页面时显示）
      if (wasLoggedIn) {
        showToast('Session expired, please login again', 'error');
        setTimeout(() => {
          showLoginPage();
        }, 1000);
      } else {
        // 首次访问或未登录，直接跳转但不显示提示
        showLoginPage();
      }
      throw new Error('Unauthorized. Please login again.');
    }
    
    // 解析JSON响应
    const data = await response.json();
    
    // 如果响应状态不是2xx，且响应包含错误信息，抛出错误
    if (!response.ok && data && !data.success) {
      const error = new Error(data.message || 'Request failed');
      error.response = response;
      error.data = data;
      throw error;
    }
    
    return data;
  } catch (error) {
    // 如果是401错误，已经处理过了，直接抛出
    if (error.message && error.message.includes('Unauthorized')) {
      throw error;
    }
    // 如果是网络错误或JSON解析错误，尝试获取响应信息
    if (error.response && !error.data) {
      try {
        const errorData = await error.response.clone().json();
        error.data = errorData;
      } catch (e) {
        // 如果无法解析JSON，使用状态文本
        error.data = { message: error.response.statusText || error.message };
      }
    }
    // 其他错误继续抛出
    throw error;
  }
}

// Toast 通知系统
function showToast(message, type = 'success') {
  // 确保 Toast 容器存在
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.className = 'fixed top-4 right-4 z-50 space-y-2';
    document.body.appendChild(toastContainer);
  }

  // 类型配置
  const typeConfig = {
    success: { bg: 'bg-green-500', icon: '✓' },
    error: { bg: 'bg-red-500', icon: '✕' },
    warning: { bg: 'bg-yellow-500', icon: '⚠' },
    info: { bg: 'bg-blue-500', icon: 'ℹ' }
  };

  const config = typeConfig[type] || typeConfig.success;
  const duration = type === 'error' ? 5000 : 3000;

  // 创建 Toast 元素
  const toast = document.createElement('div');
  toast.className = `${config.bg} text-white px-6 py-3 rounded-lg shadow-lg fade-in flex items-center space-x-2 min-w-[300px] max-w-[500px]`;
  toast.innerHTML = `
    <span class="font-bold">${config.icon}</span>
    <span class="flex-1">${message}</span>
  `;
  
  toastContainer.appendChild(toast);
  
  // 自动移除
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease-out';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, duration);
}

// 确认对话框
function showConfirmDialog(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
  return new Promise((resolve) => {
    const dialog = document.getElementById('confirmDialog');
    const titleEl = document.getElementById('confirmDialogTitle');
    const messageEl = document.getElementById('confirmDialogMessage');
    const confirmBtn = document.getElementById('confirmDialogConfirm');
    const cancelBtn = document.getElementById('confirmDialogCancel');

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;

    // 移除旧的事件监听器
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    // 添加新的事件监听器
    newConfirmBtn.addEventListener('click', () => {
      dialog.classList.remove('active');
      resolve(true);
    });

    newCancelBtn.addEventListener('click', () => {
      dialog.classList.remove('active');
      resolve(false);
    });

    // 点击背景关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.classList.remove('active');
        resolve(false);
      }
    });

    dialog.classList.add('active');
  });
}

// 按钮 Loading 状态
function setButtonLoading(button, loading) {
  if (typeof button === 'string') {
    button = document.getElementById(button) || document.querySelector(button);
  }
  if (!button) return;

  if (loading) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.innerHTML = `
      <span class="inline-flex items-center">
        <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Loading...
      </span>
    `;
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
}

// 全局 Loading 遮罩
function showGlobalLoading(message = 'Loading...') {
  const loading = document.getElementById('globalLoading');
  const messageEl = document.getElementById('globalLoadingMessage');
  if (loading && messageEl) {
    messageEl.textContent = message;
    loading.classList.remove('hidden');
  }
}

function hideGlobalLoading() {
  const loading = document.getElementById('globalLoading');
  if (loading) {
    loading.classList.add('hidden');
  }
}

// 当前管理员信息
let currentAdmin = null;
let currentSettings = {};
let storeName = 'BOBA TEA'; // 商店名称，从设置中加载
let currencySymbol = 'LE'; // 货币符号，从设置中加载

// 格式化价格显示（使用当前货币符号）
function formatPrice(price) {
  return `${parseFloat(price).toFixed(0)} ${currencySymbol}`;
}

// 格式化价格显示（带小数）
function formatPriceDecimal(price) {
  return `${parseFloat(price).toFixed(2)} ${currencySymbol}`;
}

// 根据价格生成颜色（相同价格相同颜色）
const priceColorCache = new Map(); // 缓存价格到颜色的映射
// 使用高对比度的颜色，确保不同价格有明显区别
// 按色相分组，避免相似颜色相邻
const priceColors = [
  'text-red-600',      // 红色 - 高对比度
  'text-blue-600',     // 蓝色 - 高对比度
  'text-green-600',    // 绿色 - 高对比度
  'text-purple-600',   // 紫色 - 高对比度
  'text-orange-600',   // 橙色 - 高对比度
  'text-pink-600',     // 粉色 - 高对比度
  'text-indigo-600',   // 靛蓝 - 高对比度
  'text-teal-600',     // 青绿 - 高对比度
  'text-red-700',      // 深红
  'text-blue-700',     // 深蓝
  'text-green-700',    // 深绿
  'text-purple-700',   // 深紫
  'text-orange-700',   // 深橙
  'text-pink-700',     // 深粉
  'text-indigo-700',   // 深靛
  'text-teal-700',     // 深青
  'text-red-500',      // 亮红
  'text-blue-500',     // 亮蓝
  'text-green-500',    // 亮绿
  'text-purple-500',   // 亮紫
  'text-orange-500',   // 亮橙
  'text-pink-500',     // 亮粉
  'text-indigo-500',   // 亮靛
  'text-teal-500'      // 亮青
];

function getPriceColor(price) {
  // 使用价格值作为key（四舍五入到整数，确保相同价格得到相同颜色）
  const priceKey = Math.round(parseFloat(price) || 0);
  
  if (!priceColorCache.has(priceKey)) {
    // 改进的哈希函数：使用更大的质数确保更好的分布
    // 并确保相邻价格值映射到明显不同的颜色
    let hash = priceKey;
    // 使用多个质数进行混合，确保更好的分布
    hash = ((hash >> 16) ^ hash) * 0x85ebca6b;
    hash = ((hash >> 16) ^ hash) * 0xc2b2ae35;
    hash = (hash >> 16) ^ hash;
    const index = Math.abs(hash) % priceColors.length;
    const color = priceColors[index];
    priceColorCache.set(priceKey, color);
  }
  
  return priceColorCache.get(priceKey);
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 先加载公开设置（商店名称等），即使未登录也要显示
  loadSettings();
  
  checkAuth();
  
  // 登录表单提交
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await login();
  });
  
  // 远程备份配置表单提交（使用事件委托，确保始终有效）
  const remoteBackupForm = document.getElementById('remoteBackupConfigForm');
  if (remoteBackupForm) {
    remoteBackupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveRemoteBackupConfig();
    });
  }
});

// 检查认证状态
// Session过期检查定时器
let sessionCheckInterval = null;
// Session刷新定时器（rolling session）
let sessionRefreshInterval = null;

async function checkAuth() {
  try {
    // adminApiRequest 已经返回解析后的 JSON 数据，不是 response 对象
    const data = await adminApiRequest(`${API_BASE}/auth/admin/me`, {
      method: 'GET'
    });
    
    // 检查返回的数据是否成功
    if (data && data.success && data.admin) {
      currentAdmin = data.admin;
      showMainPage();
      // 根据admin状态显示/隐藏Developer菜单
      updateDeveloperMenuVisibility();
      
      // 启动session过期检查和刷新
      startSessionCheck();
      startSessionRefresh();
    } else {
      // 数据格式不正确，显示登录页
      showLoginPage();
      // 停止session检查和刷新
      stopSessionCheck();
      stopSessionRefresh();
    }
  } catch (error) {
    // 401错误已经在adminApiRequest中处理了（会跳转到登录页）
    // 这里只处理其他错误
    if (!error.message || !error.message.includes('Unauthorized')) {
      console.error('认证检查失败:', error);
    }
    // 如果还没有跳转到登录页，则跳转
    if (currentAdmin === null) {
      showLoginPage();
      // 停止session检查
      stopSessionCheck();
      stopSessionRefresh();
    }
  }
}

// 刷新session时间（rolling session）
async function refreshSession() {
  try {
    await adminApiRequest(`${API_BASE}/auth/session/refresh`, {
      method: 'POST'
    });
  } catch (error) {
    // 401错误已经在adminApiRequest中处理了，这里只记录其他错误
    if (!error.message || !error.message.includes('Unauthorized')) {
      console.error('Session refresh failed:', error);
    }
  }
}

// 启动session刷新（rolling session）
function startSessionRefresh() {
  // 清除旧的定时器
  stopSessionRefresh();
  
  // 页面加载时立即刷新一次
  refreshSession();
  
  // 每5分钟刷新一次session时间
  sessionRefreshInterval = setInterval(() => {
    refreshSession();
  }, 5 * 60 * 1000); // 5分钟
  
  // 监听用户活动（点击、键盘输入等），延迟刷新session
  let activityTimeout;
  const handleActivity = () => {
    clearTimeout(activityTimeout);
    activityTimeout = setTimeout(() => {
      refreshSession();
    }, 60000); // 用户活动后1分钟刷新session
  };
  
  document.addEventListener('click', handleActivity);
  document.addEventListener('keydown', handleActivity);
  document.addEventListener('scroll', handleActivity);
  
  // 页面可见性变化时刷新
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshSession();
    }
  });
}

// 停止session刷新
function stopSessionRefresh() {
  if (sessionRefreshInterval) {
    clearInterval(sessionRefreshInterval);
    sessionRefreshInterval = null;
  }
}

// 启动session过期检查
function startSessionCheck() {
  // 清除旧的定时器
  stopSessionCheck();
  
  // 每30秒检查一次session状态（平衡服务器压力和及时性）
  sessionCheckInterval = setInterval(async () => {
    try {
      const response = await adminApiRequest(`${API_BASE}/auth/session/info`, {
        method: 'GET'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.session) {
          // 检查管理员session是否即将过期（剩余时间少于5秒）或已过期
          // 使用5秒阈值，配合30秒检查间隔，既能减少服务器压力，又能确保在过期前退出
          // 最坏情况：剩余时间在5-35秒之间时，会在下次检查（30秒后）时退出，此时剩余时间可能还有5-35秒
          // 但这样避免了每5秒检查一次带来的服务器压力
          if (data.session.admin && (data.session.admin.isExpired || data.session.admin.remainingMs <= 5000)) {
            stopSessionCheck();
            stopSessionRefresh();
            showToast('Session expired, please login again', 'error');
            setTimeout(() => {
              currentAdmin = null;
              showLoginPage(); // 直接跳转到登录页
            }, 1000);
          }
        }
      } else if (response.status === 401) {
        // Session已过期 - 直接跳转到登录页
        stopSessionCheck();
        stopSessionRefresh();
        currentAdmin = null;
        showToast('Session expired, please login again', 'error');
        setTimeout(() => {
          showLoginPage();
        }, 1000);
      }
    } catch (error) {
      console.error('Session check failed:', error);
    }
  }, 30000); // 每30秒检查一次，减少服务器压力
}

// 停止session过期检查
function stopSessionCheck() {
  if (sessionCheckInterval) {
    clearInterval(sessionCheckInterval);
    sessionCheckInterval = null;
  }
}

// 更新Developer菜单的可见性（只有super_admin可见）
function updateDeveloperMenuVisibility() {
  const developerMenuItem = document.getElementById('developerMenuItem');
  if (developerMenuItem) {
    if (currentAdmin && currentAdmin.role === 'super_admin') {
      developerMenuItem.style.display = 'block';
    } else {
      developerMenuItem.style.display = 'none';
    }
  }
}

// 检查是否为super_admin
function isSuperAdmin() {
  return currentAdmin && currentAdmin.role === 'super_admin';
}

// 登录
async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  try {
    const response = await fetch(`${API_BASE}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (data.success) {
      currentAdmin = data.admin;
      showMainPage();
      updateDeveloperMenuVisibility();
      // 启动session检查
      startSessionCheck();
    } else {
      showToast(data.message || 'Login failed', 'error');
    }
  } catch (error) {
    console.error('登录失败:', error);
    showToast('Login failed, please try again', 'error');
  }
}

// 登出
async function logout() {
  try {
    // 停止session检查和刷新
    stopSessionCheck();
    stopSessionRefresh();
    
    await adminApiRequest(`${API_BASE}/auth/admin/logout`, {
      method: 'POST'
    });
    currentAdmin = null;
    showLoginPage();
  } catch (error) {
    console.error('登出失败:', error);
    // 即使登出失败，也清除本地状态
    currentAdmin = null;
    showLoginPage();
  }
}

// 显示登录页面
function showLoginPage() {
  document.getElementById('loginPage').classList.remove('hidden');
  document.getElementById('mainPage').classList.add('hidden');
}

// 显示主页面
function showMainPage() {
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('mainPage').classList.remove('hidden');
  document.getElementById('adminName').textContent = currentAdmin.name || currentAdmin.username;
  
  // 根据admin状态显示/隐藏Developer菜单
  updateDeveloperMenuVisibility();
  
  // 加载默认数据
  loadDashboard();
  loadSettings();
}

// 切换标签
let currentTab = 'dashboard'; // 当前激活的标签

function switchTab(tabName) {
  // 更新当前标签
  currentTab = tabName;
  
  // 隐藏所有标签内容
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.add('hidden');
  });
  
  // 移除所有激活状态
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.classList.remove('active');
  });
  
  // 显示选中的标签
  const tabElement = document.getElementById(tabName + 'Tab');
  if (tabElement) {
    tabElement.classList.remove('hidden');
  }
  
  // 激活对应的侧边栏项
  event.target.classList.add('active');
  
  // 加载对应数据
  switch(tabName) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'orders':
      // 先加载周期列表，加载完成后再加载订单（会自动选择活跃周期）
      loadCycles().then(() => {
        // loadCycles完成后会自动调用loadOrders，这里不需要再调用
      });
      break;
    case 'products':
      loadProducts();
      break;
    case 'categories':
      loadCategories();
      break;
    case 'discounts':
      loadDiscounts();
      break;
    case 'settings':
      loadSettingsPage();
      break;
    case 'users':
      loadUsers();
      break;
    case 'balance':
      loadBalanceManagement();
      break;
    case 'admins':
      loadAdmins();
      break;
    case 'logs':
      loadLogs();
      break;
    case 'about':
      loadAboutPage();
      break;
    case 'developer':
      // 只有super_admin可以访问Developer功能
      if (!isSuperAdmin()) {
        showToast('Access denied. Super admin privileges required.', 'error');
        return;
      }
      loadDeveloperPage();
      break;
  }
}

// 加载仪表盘
async function loadDashboard() {
  try {
    const response = await fetch(`${API_BASE}/admin/orders/statistics`, {
      credentials: 'include'
    });
    const data = await response.json();
    
    if (data.success) {
      const stats = data.statistics;
      const cycle = data.cycle;
      
      document.getElementById('totalOrders').textContent = stats.total_orders || 0;
      document.getElementById('totalAmount').textContent = formatPriceDecimal(stats.total_amount || 0);
      document.getElementById('totalDiscount').textContent = formatPriceDecimal(stats.total_discount || 0);
      document.getElementById('finalAmount').textContent = formatPriceDecimal(stats.total_final_amount || 0);
      
      // 显示已付款订单统计
      document.getElementById('paidOrders').textContent = stats.paid_orders || 0;
      document.getElementById('paidTotalAmount').textContent = formatPriceDecimal(stats.paid_total_amount || 0);
      document.getElementById('paidTotalDiscount').textContent = formatPriceDecimal(stats.paid_total_discount || 0);
      document.getElementById('paidFinalAmount').textContent = formatPriceDecimal(stats.paid_final_amount || 0);
      
      // 显示周期信息
      const dashboardTab = document.getElementById('dashboardTab');
      let cycleInfoHtml = '';
      
      if (cycle) {
        const startTime = new Date(cycle.start_time).toLocaleString('en-US');
        const endTime = cycle.end_time ? new Date(cycle.end_time).toLocaleString('en-US') : 'In Progress';
        const statusText = cycle.status === 'active' ? 'In Progress' : cycle.status === 'ended' ? 'Ended' : 'Confirmed';
        const cycleTitle = cycle.status === 'active' ? 'Current Cycle Info' : 'Previous Cycle Info';
        
        cycleInfoHtml = `
          <div class="bg-white p-6 rounded-xl card mt-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">${cycleTitle}</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p class="text-sm text-gray-600">Cycle Number</p>
                <p class="text-lg font-semibold text-gray-900">${cycle.cycle_number}</p>
              </div>
              <div>
                <p class="text-sm text-gray-600">Status</p>
                <p class="text-lg font-semibold ${cycle.status === 'active' ? 'text-green-600' : cycle.status === 'ended' ? 'text-yellow-600' : 'text-blue-600'}">${statusText}</p>
              </div>
              <div>
                <p class="text-sm text-gray-600">Start Time</p>
                <p class="text-lg font-semibold text-gray-900">${startTime}</p>
              </div>
              <div>
                <p class="text-sm text-gray-600">End Time</p>
                <p class="text-lg font-semibold text-gray-900">${endTime}</p>
              </div>
              <div>
                <p class="text-sm text-gray-600">Cycle Total Amount</p>
                <p class="text-lg font-semibold text-blue-600">${formatPriceDecimal(stats.total_amount || cycle.total_amount || 0)}</p>
              </div>
              <div>
                <p class="text-sm text-gray-600">Discount Rate</p>
                <p class="text-lg font-semibold text-green-600">${(cycle.discount_rate || 0).toFixed(1)}%</p>
              </div>
            </div>
            ${cycle.status === 'ended' ? `
              <div class="mt-4 pt-4 border-t border-gray-200">
                <button onclick="confirmCycle(${cycle.id})" 
                        class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition">
                  Confirm Cycle and Calculate Discount
                </button>
              </div>
            ` : ''}
          </div>
        `;
      } else {
        cycleInfoHtml = `
          <div class="bg-white p-6 rounded-xl card mt-6">
            <p class="text-gray-500 text-center">No active cycle</p>
          </div>
        `;
      }
      
      // 移除旧的周期信息
      const oldCycleInfo = dashboardTab.querySelector('.cycle-info');
      if (oldCycleInfo) {
        oldCycleInfo.remove();
      }
      
      // 添加新的周期信息
      const cycleInfoDiv = document.createElement('div');
      cycleInfoDiv.className = 'cycle-info';
      cycleInfoDiv.innerHTML = cycleInfoHtml;
      dashboardTab.appendChild(cycleInfoDiv);
    }
  } catch (error) {
    console.error('加载仪表盘数据失败:', error);
  }
}

// 确认周期
async function confirmCycle(cycleId) {
  const confirmed = await showConfirmDialog(
    'Confirm Cycle and Calculate Discount',
    'Are you sure you want to confirm this cycle and calculate discounts? This will:\n\n1. Calculate and apply discounts to all orders\n2. Automatically cancel all pending orders\n3. Prevent users from uploading payment screenshots for these orders\n\nThis action cannot be undone.',
    'Confirm',
    'Cancel'
  );
  
  if (!confirmed) return;
  
  try {
    const data = await apiPost(`/admin/cycles/${cycleId}/confirm`);
    
    if (data.success) {
      const message = `Cycle confirmed successfully! Discount rate: ${data.discountRate.toFixed(1)}%, updated ${data.orderCount} orders${data.cancelledCount > 0 ? `, cancelled ${data.cancelledCount} pending orders` : ''}`;
      showToast(message, 'success');
      loadDashboard();
      loadOrders();
    } else {
        showToast(data.message || 'Confirmation failed', 'error');
    }
  } catch (error) {
    console.error('Failed to confirm cycle:', error);
      showToast('Confirmation failed', 'error');
  }
}

// 加载系统设置
async function loadSettings() {
  try {
    // 先尝试获取管理员设置（需要登录）
    const response = await fetch(`${API_BASE}/admin/settings`, {
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        currentSettings = data.settings;
        // 更新商店名称
        if (data.settings.store_name) {
          storeName = data.settings.store_name;
        }
        // 更新货币符号
        if (data.settings.currency_symbol) {
          currencySymbol = data.settings.currency_symbol;
        }
        updateStoreName();
        updateOrderButton();
        return; // 成功获取，直接返回
      }
    }
    
    // 如果管理员设置获取失败（401 或其他错误），降级到公开设置
    // 这样即使未登录也能显示正确的商店名称
    console.log('管理员设置获取失败，尝试获取公开设置...');
    const publicResponse = await fetch(`${API_BASE}/public/settings`, {
      credentials: 'include'
    });
    
    if (publicResponse.ok) {
      const publicData = await publicResponse.json();
      if (publicData.success && publicData.settings) {
        // 只更新公开可用的设置（商店名称、货币符号等）
        if (publicData.settings.store_name) {
          storeName = publicData.settings.store_name;
        }
        if (publicData.settings.currency_symbol) {
          currencySymbol = publicData.settings.currency_symbol;
        }
        // 合并到 currentSettings（保留已有的设置）
        currentSettings = { ...currentSettings, ...publicData.settings };
        updateStoreName();
        // 注意：不调用 updateOrderButton()，因为公开设置不包含订单状态
      }
    }
  } catch (error) {
    console.error('加载设置失败:', error);
    // 即使失败，也尝试获取公开设置作为降级方案
    try {
      const publicResponse = await fetch(`${API_BASE}/public/settings`, {
        credentials: 'include'
      });
      if (publicResponse.ok) {
        const publicData = await publicResponse.json();
        if (publicData.success && publicData.settings?.store_name) {
          storeName = publicData.settings.store_name;
          updateStoreName();
        }
      }
    } catch (fallbackError) {
      console.error('降级方案也失败:', fallbackError);
    }
  }
}

// 更新商店名称显示（管理员页面）
function updateStoreName() {
  // 更新页面标题
  const adminPageTitle = document.getElementById('adminPageTitle');
  if (adminPageTitle) {
    adminPageTitle.textContent = `Admin Panel - ${storeName} Ordering System`;
  }
  
  // 更新所有显示商店名称的元素
  const storeNameElements = document.querySelectorAll('[data-store-name]');
  storeNameElements.forEach(el => {
    el.textContent = storeName;
  });
  
  // 更新data-i18n="app_name"的元素
  const appNameElements = document.querySelectorAll('[data-i18n="app_name"]');
  appNameElements.forEach(el => {
    el.textContent = storeName;
  });
}

// 图片拖动相关变量（管理员页面）
let adminIsDragging = false;
let adminDragStartX = 0;
let adminDragStartY = 0;
let adminImageOffsetX = 0;
let adminImageOffsetY = 0;
let adminCurrentImageScale = 1;

// 显示支付截图对话框
function showPaymentImageModal(imageUrl) {
  const modal = document.getElementById('paymentImageModal');
  const img = document.getElementById('paymentImageDisplay');
  const slider = document.getElementById('imageZoomSlider');
  
  if (modal && img) {
    img.src = imageUrl;
    // 重置图片位置和缩放
    adminCurrentImageScale = 1;
    adminImageOffsetX = 0;
    adminImageOffsetY = 0;
    img.style.transform = 'translate(0, 0) scale(1)';
    img.style.transformOrigin = 'center center';
    img.style.cursor = 'grab';
    
    if (slider) {
      slider.value = 100;
      document.getElementById('zoomValue').textContent = '100%';
    }
    modal.classList.add('active');
    
    // 添加拖动事件监听
    setupAdminImageDrag(img);
  }
}

// 设置图片拖动功能（管理员页面）
function setupAdminImageDrag(img) {
  // 移除旧的事件监听器（如果存在）
  if (img._adminDragHandlers) {
    img.removeEventListener('mousedown', img._adminDragHandlers.mousedown);
    document.removeEventListener('mousemove', img._adminDragHandlers.mousemove);
    document.removeEventListener('mouseup', img._adminDragHandlers.mouseup);
    img.removeEventListener('touchstart', img._adminDragHandlers.touchstart);
    document.removeEventListener('touchmove', img._adminDragHandlers.touchmove);
    document.removeEventListener('touchend', img._adminDragHandlers.touchend);
  }
  
  // 鼠标事件
  const handleMouseDown = (e) => {
    if (adminCurrentImageScale <= 1) return; // 只有放大后才能拖动
    adminIsDragging = true;
    adminDragStartX = e.clientX - adminImageOffsetX;
    adminDragStartY = e.clientY - adminImageOffsetY;
    img.style.cursor = 'grabbing';
    e.preventDefault();
  };
  
  const handleMouseMove = (e) => {
    if (!adminIsDragging) return;
    adminImageOffsetX = e.clientX - adminDragStartX;
    adminImageOffsetY = e.clientY - adminDragStartY;
    updateAdminImageTransform(img);
    e.preventDefault();
  };
  
  const handleMouseUp = () => {
    if (adminIsDragging) {
      adminIsDragging = false;
      img.style.cursor = adminCurrentImageScale > 1 ? 'grab' : 'default';
    }
  };
  
  // 触摸事件
  const handleTouchStart = (e) => {
    if (adminCurrentImageScale <= 1) return;
    if (e.touches.length === 1) {
      adminIsDragging = true;
      adminDragStartX = e.touches[0].clientX - adminImageOffsetX;
      adminDragStartY = e.touches[0].clientY - adminImageOffsetY;
      e.preventDefault();
    }
  };
  
  const handleTouchMove = (e) => {
    if (!adminIsDragging || e.touches.length !== 1) return;
    adminImageOffsetX = e.touches[0].clientX - adminDragStartX;
    adminImageOffsetY = e.touches[0].clientY - adminDragStartY;
    updateAdminImageTransform(img);
    e.preventDefault();
  };
  
  const handleTouchEnd = () => {
    adminIsDragging = false;
  };
  
  // 保存事件处理器引用
  img._adminDragHandlers = {
    mousedown: handleMouseDown,
    mousemove: handleMouseMove,
    mouseup: handleMouseUp,
    touchstart: handleTouchStart,
    touchmove: handleTouchMove,
    touchend: handleTouchEnd
  };
  
  // 添加事件监听
  img.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  img.addEventListener('touchstart', handleTouchStart, { passive: false });
  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', handleTouchEnd);
}

// 更新图片变换（管理员页面）
function updateAdminImageTransform(img) {
  img.style.transform = `translate(${adminImageOffsetX}px, ${adminImageOffsetY}px) scale(${adminCurrentImageScale})`;
}

// 更新图片缩放
function updateImageZoom(value) {
  const img = document.getElementById('paymentImageDisplay');
  const zoomValue = document.getElementById('zoomValue');
  
  if (img && zoomValue) {
    const scale = value / 100;
    adminCurrentImageScale = scale;
    
    // 如果缩放回到1，重置位置
    if (scale <= 1) {
      adminImageOffsetX = 0;
      adminImageOffsetY = 0;
      img.style.cursor = 'default';
    } else {
      img.style.cursor = adminIsDragging ? 'grabbing' : 'grab';
    }
    
    updateAdminImageTransform(img);
    img.style.transformOrigin = 'center center';
    zoomValue.textContent = value + '%';
  }
}

// 关闭支付截图对话框
function closePaymentImageModal(event) {
  // 如果点击的是背景（不是对话框内容），则关闭
  if (event && event.target.id === 'paymentImageModal') {
    document.getElementById('paymentImageModal').classList.remove('active');
  } else if (!event) {
    // 直接调用关闭
    document.getElementById('paymentImageModal').classList.remove('active');
  }
}

// 更新点单按钮状态
function updateOrderButton() {
  const btn = document.getElementById('toggleOrderBtn');
  if (currentSettings.ordering_open === 'true') {
    btn.textContent = 'Close Ordering';
    btn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
    btn.classList.add('bg-red-600', 'hover:bg-red-700');
  } else {
    btn.textContent = 'Open Ordering';
    btn.classList.remove('bg-red-600', 'hover:bg-red-700');
    btn.classList.add('bg-blue-600', 'hover:bg-blue-700');
  }
}

// 切换点单状态
async function toggleOrdering() {
  const newStatus = currentSettings.ordering_open === 'true' ? 'false' : 'true';
  
  try {
    const response = await fetch(`${API_BASE}/admin/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ordering_open: newStatus })
    });
    
    const data = await response.json();
    if (data.success) {
      currentSettings.ordering_open = newStatus;
      updateOrderButton();
      showToast(newStatus === 'true' ? 'Ordering opened' : 'Ordering closed', 'success');
    }
  } catch (error) {
    console.error('Failed to toggle ordering status:', error);
      showToast('Operation failed', 'error');
  }
}

// 计算折扣
async function calculateDiscount() {
  const confirmed = await showConfirmDialog(
    'Recalculate Discounts',
    'Are you sure you want to recalculate discounts for all orders?',
    'Confirm',
    'Cancel'
  );
  
  if (!confirmed) return;
  
  try {
    const response = await fetch(`${API_BASE}/public/calculate-discount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    if (data.success) {
      showToast('Discount calculation completed! Discount rate: ' + (data.discount_rate * 100) + '%', 'success');
      loadDashboard();
      loadOrders();
    }
  } catch (error) {
    console.error('Failed to calculate discount:', error);
      showToast('Calculation failed', 'error');
  }
}

// 加载周期列表
async function loadCycles() {
  try {
    const response = await fetch(`${API_BASE}/admin/cycles`, { credentials: 'include' });
    const data = await response.json();
    
    if (data.success) {
      const cycleFilter = document.getElementById('orderCycleFilter');
      if (cycleFilter) {
        // 保留"全部周期"选项
        cycleFilter.innerHTML = '<option value="">All Cycles</option>';
        
        // 找到当前活跃周期
        let activeCycleId = null;
        data.cycles.forEach(cycle => {
          if (cycle.status === 'active') {
            activeCycleId = cycle.id;
          }
        });
        
        // 如果没有活跃周期，选择最近一个已结束的周期
        if (!activeCycleId && data.cycles.length > 0) {
          // 找到最近一个已结束或已确认的周期
          const endedCycles = data.cycles.filter(c => c.status === 'ended' || c.status === 'confirmed');
          if (endedCycles.length > 0) {
            activeCycleId = endedCycles[0].id; // 第一个就是最近的（已按时间降序排列）
          }
        }
        
        // 添加周期选项
        data.cycles.forEach(cycle => {
          const startTime = new Date(cycle.start_time).toLocaleString('en-US', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          const endTime = cycle.end_time ? new Date(cycle.end_time).toLocaleString('en-US', { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit' 
          }) : 'In Progress';
          const statusText = cycle.status === 'active' ? 'In Progress' : cycle.status === 'ended' ? 'Ended' : 'Confirmed';
          
          const option = document.createElement('option');
          option.value = cycle.id;
          option.textContent = `${cycle.cycle_number} (${startTime} - ${endTime}) [${statusText}]`;
          cycleFilter.appendChild(option);
        });
        
        // 如果有默认周期（活跃周期或最近结束的周期），默认选中它
        if (activeCycleId) {
          cycleFilter.value = activeCycleId;
        }
        
        // 自动加载订单（使用默认选中的周期）
        loadOrders();
      }
    }
  } catch (error) {
    console.error('加载周期列表失败:', error);
  }
}

// 加载订单列表
async function loadOrders() {
  try {
    const status = document.getElementById('orderStatusFilter')?.value || '';
    const cycleId = document.getElementById('orderCycleFilter')?.value || '';
    let url = `${API_BASE}/admin/orders?`;
    const params = [];
    
    if (status) params.push(`status=${status}`);
    if (cycleId) params.push(`cycle_id=${cycleId}`);
    
    if (params.length > 0) {
      url += params.join('&');
    } else {
      url = url.slice(0, -1); // 移除末尾的?
    }
    
    const response = await fetch(url, { credentials: 'include' });
    const data = await response.json();
    
    if (data.success) {
      renderOrders(data.orders);
    }
  } catch (error) {
    console.error('加载订单失败:', error);
  }
}

// 导出订单
async function exportOrders() {
  try {
    const status = document.getElementById('orderStatusFilter')?.value || '';
    const cycleId = document.getElementById('orderCycleFilter')?.value || '';
    let url = `${API_BASE}/admin/orders/export?`;
    const params = [];
    
    if (status) params.push(`status=${status}`);
    if (cycleId) params.push(`cycle_id=${cycleId}`);
    
    if (params.length > 0) {
      url += params.join('&');
    } else {
      url = url.slice(0, -1); // 移除末尾的?
    }
    
    // 使用window.open或创建a标签下载
    window.location.href = url;
  } catch (error) {
    console.error('Failed to export orders:', error);
    showToast('Export failed', 'error');
  }
}

// 渲染订单列表
function renderOrders(orders) {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;
  
  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">No orders</td></tr>';
    return;
  }
  
  tbody.innerHTML = orders.map(order => {
    const statusColors = {
      pending: 'bg-yellow-100 text-yellow-800',
      paid: 'bg-green-100 text-green-800',
      completed: 'bg-blue-100 text-blue-800',
      cancelled: 'bg-red-100 text-red-800'
    };
    
    const statusText = {
      pending: 'Pending Payment',
      paid: 'Paid',
      completed: 'Completed',
      cancelled: 'Cancelled'
    };
    
    const sugarLabels = {
      '0': 'Zero',
      '30': 'Light',
      '50': 'Half',
      '70': 'Less',
      '100': 'Regular'
    };
    
    const iceLabels = {
      'normal': 'Normal Ice',
      'less': 'Less Ice',
      'no': 'No Ice',
      'room': 'Room Temperature',
      'hot': 'Hot'
    };
    
    // 构建商品详情HTML
    const itemsHtml = order.items.map(item => {
      let toppings = [];
      try {
        if (item.toppings) {
          toppings = typeof item.toppings === 'string' ? JSON.parse(item.toppings) : item.toppings;
        }
      } catch (e) {}
      
      const unitPrice = item.quantity > 0 ? (item.subtotal / item.quantity) : item.product_price;
      
      // 计算Size价格和加料总价（用于显示价格分解）
      const actualSizePrice = item.size_price !== undefined && item.size_price !== null && item.size_price > 0
        ? item.size_price
        : (item.size ? Math.max(0, unitPrice - (Array.isArray(toppings) ? toppings.reduce((sum, t) => sum + ((typeof t === 'object' && t !== null && t.price !== undefined) ? t.price : 0), 0) : 0)) : unitPrice);
      
      // 计算加料总价
      let totalToppingPrice = 0;
      if (Array.isArray(toppings) && toppings.length > 0) {
        totalToppingPrice = toppings.reduce((sum, t) => {
          const toppingPrice = (typeof t === 'object' && t !== null && t.price !== undefined) ? t.price : 0;
          return sum + toppingPrice;
        }, 0);
      }
      
      return `
        <div class="mb-2 p-2 bg-gray-50 rounded text-xs">
          <div class="font-semibold text-gray-900">${item.product_name} × ${item.quantity}</div>
          <div class="mt-1 space-y-0.5 text-gray-600">
            ${item.size ? `<div>Size: ${item.size}${actualSizePrice > 0 ? ` (${formatPrice(actualSizePrice)})` : ''}</div>` : ''}
            ${item.sugar_level ? `<div>Sweetness: ${sugarLabels[item.sugar_level] || item.sugar_level}%</div>` : ''}
            ${item.ice_level ? `<div>Ice Level: ${iceLabels[item.ice_level] || item.ice_level}</div>` : ''}
            ${toppings.length > 0 ? `
              <div>
                <div class="text-gray-700 font-medium">Toppings:</div>
                <ul class="ml-2 space-y-0.5">
                  ${Array.isArray(toppings) ? toppings.map(t => {
                    // 检查是否是对象格式（包含价格）
                    const toppingName = typeof t === 'object' && t !== null && t.name ? t.name : (typeof t === 'string' ? t : String(t));
                    const toppingPrice = (typeof t === 'object' && t !== null && t.price !== undefined) ? t.price : 0;
                    return `<li class="text-gray-600">${toppingName}${toppingPrice > 0 ? ` (+${formatPrice(toppingPrice)})` : ''}</li>`;
                  }).join('') : `<li class="text-gray-600">${toppings}</li>`}
                </ul>
              </div>
            ` : ''}
            <div class="text-gray-900 font-medium">
              Price Breakdown: ${actualSizePrice > 0 ? formatPrice(actualSizePrice) : formatPrice(unitPrice)}${totalToppingPrice > 0 ? ` + ${formatPrice(totalToppingPrice)}` : ''}${actualSizePrice > 0 || totalToppingPrice > 0 ? ` = ${formatPrice(unitPrice)}` : ''}
            </div>
            <div class="text-gray-900 font-medium">Unit Price: ${formatPrice(unitPrice)} | Subtotal: ${formatPrice(item.subtotal)}</div>
          </div>
        </div>
      `;
    }).join('');
    
    const isExpired = order.isExpired || false;
    const isActiveCycle = order.isActiveCycle !== false; // 默认为true，如果没有活跃周期
    // 如果不属于活跃周期，显示为灰色
    const inactiveClass = !isActiveCycle ? 'text-gray-400' : '';
    const inactiveRowClass = !isActiveCycle ? 'bg-gray-50 opacity-75' : '';
    const expiredClass = isExpired ? 'text-gray-400' : inactiveClass;
    const expiredRowClass = isExpired ? 'bg-gray-50 opacity-75' : inactiveRowClass;
    
    // 格式化周期信息
    let cycleInfo = '';
    if (order.cycle_id) {
      const startTime = order.cycle_start_time ? new Date(order.cycle_start_time).toLocaleString('en-US') : 'N/A';
      const endTime = order.cycle_end_time ? new Date(order.cycle_end_time).toLocaleString('en-US') : 'Ongoing';
      cycleInfo = `
        <div class="text-xs text-gray-500 mt-1">
          <div>Cycle ID: <span class="font-semibold">${order.cycle_id}</span> | Cycle: <span class="font-semibold">${order.cycle_number || 'N/A'}</span></div>
          <div>Time: ${startTime} - ${endTime}</div>
        </div>
      `;
    }
    
    return `
      <tr class="hover:bg-gray-50 ${expiredRowClass}">
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium ${expiredClass}">
          ${order.order_number}
          ${cycleInfo}
          ${isExpired ? '<br><span class="text-xs text-red-600 font-semibold">⚠️ Expired</span>' : ''}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm ${expiredClass}">
          ${order.customer_name || 'Anonymous'}<br>
          <span class="text-xs">${order.customer_phone}</span>
        </td>
        <td class="px-6 py-4 text-sm ${expiredClass} max-w-md">
          ${itemsHtml}
          ${order.notes ? `
            <div class="mt-2 p-2 bg-blue-50 rounded text-xs border border-blue-200">
              <div class="text-blue-700 font-semibold mb-1">Order Notes:</div>
              <div class="text-blue-900">${order.notes}</div>
            </div>
          ` : ''}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm">
          <div class="space-y-1">
            <div class="${expiredClass || inactiveClass || 'text-gray-600'}">Original: <span class="${expiredClass || inactiveClass}">${formatPrice(order.total_amount)}</span></div>
            ${order.discount_amount > 0 ? `
              <div class="${expiredClass || inactiveClass || 'text-gray-600'}">Discount: <span class="${!isActiveCycle || isExpired ? 'text-gray-500' : 'text-green-600'}">-${formatPrice(order.discount_amount)}</span></div>
            ` : ''}
            <div class="font-bold ${!isActiveCycle || isExpired ? 'text-gray-500' : 'text-red-600'}">Final: ${formatPrice(order.final_amount)}</div>
            ${order.balance_used && order.balance_used > 0 ? `
              <div class="${expiredClass || inactiveClass || 'text-gray-600'} text-xs mt-1">Balance Used: <span class="${expiredClass || inactiveClass || 'text-green-600'} font-semibold">${formatPrice(order.balance_used)}</span></div>
            ` : ''}
          </div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[order.status]}">
            ${statusText[order.status]}
          </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm ${expiredClass}">
          ${new Date(order.created_at).toLocaleString('en-US')}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm">
          <select onchange="updateOrderStatus('${order.id}', this.value)" 
                  class="px-2 py-1 border border-gray-300 rounded text-xs mb-1">
            <option value="">Change Status</option>
            <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pending Payment</option>
            <option value="paid" ${order.status === 'paid' ? 'selected' : ''}>Paid</option>
            <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
          ${order.payment_image ? `<br><button onclick="showPaymentImageModal('${order.payment_image}')" class="text-blue-600 hover:text-blue-800 text-xs underline">View Payment Screenshot</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

// 更新订单状态
async function updateOrderStatus(orderId, newStatus) {
  if (!newStatus) return;
  
  try {
    const response = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: newStatus })
    });
    
    const data = await response.json();
    if (data.success) {
      showToast('Status updated successfully', 'success');
      loadOrders();
      loadDashboard();
    } else {
        showToast(data.message || 'Update failed', 'error');
    }
  } catch (error) {
    console.error('Failed to update order status:', error);
      showToast('Update failed', 'error');
  }
}

// 加载菜品管理
async function loadProducts() {
  try {
    const response = await fetch(`${API_BASE}/admin/products`, { credentials: 'include' });
    const data = await response.json();
    
    if (data.success) {
      renderProducts(data.products);
    }
  } catch (error) {
    console.error('加载菜品失败:', error);
  }
}

// 渲染菜品列表
function renderProducts(products) {
  const container = document.getElementById('productsTab');
  
  container.innerHTML = `
    <div class="mb-6 flex justify-between items-center">
      <h2 class="text-2xl font-bold text-gray-900">Products</h2>
      <div class="flex space-x-2">
        <button onclick="backupMenu()" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
          💾 Backup Menu
        </button>
        <button onclick="importMenu()" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition">
          📥 Import Menu
        </button>
        <button id="batchEditBtn" onclick="showBatchEditModal()" class="hidden px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition">
          ✏️ Batch Edit (<span id="selectedProductsCount">0</span>)
        </button>
        <button onclick="showProductModal()" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          + Add Product
        </button>
      </div>
    </div>
    
    <div class="bg-white rounded-xl shadow-sm overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              <input type="checkbox" id="selectAllProducts" onclick="toggleSelectAllProducts()" class="w-4 h-4">
            </th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Image</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${products.length === 0 ? '<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">No products</td></tr>' : ''}
          ${products.map(product => `
            <tr>
              <td class="px-6 py-4">
                <input type="checkbox" class="product-checkbox" value="${product.id}" data-product-id="${product.id}" onclick="updateSelectedProductsCount()">
              </td>
              <td class="px-6 py-4">
                ${product.image_url ? 
                  `<img src="${product.image_url}" class="w-16 h-16 object-cover rounded-lg">` :
                  `<div class="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center text-2xl">🧋</div>`
                }
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <div class="font-medium text-gray-900">${product.name}</div>
                ${product.description ? `<div class="text-sm text-gray-500">${product.description}</div>` : ''}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${product.category_name || '-'}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold ${getPriceColor(product.price)}">
                ${formatPrice(product.price)}
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs rounded-full ${product.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                  ${product.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <button onclick='showProductModal(${JSON.stringify(product)})' class="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                <button onclick="deleteProduct(${product.id})" class="text-red-600 hover:text-red-800">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    
    <!-- 菜品编辑模态框 -->
    <div id="productModal" class="modal">
      <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 p-8">
        <h3 id="productModalTitle" class="text-2xl font-bold text-gray-900 mb-6">Add Product</h3>
        <form id="productForm" class="space-y-4">
          <input type="hidden" id="productId">
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Product Name *</label>
              <input type="text" id="productName" required class="w-full px-4 py-2 border border-gray-300 rounded-lg">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Price *</label>
              <input type="number" id="productPrice" required step="0.01" min="0" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <input type="text" id="productDescription" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Category</label>
              <select id="productCategory" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                <option value="">No Category</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Status</label>
              <select id="productStatus" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Product Image</label>
            <input type="file" id="productImage" accept="image/*" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
            <div id="currentImage" class="mt-2"></div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Cup Sizes & Prices</label>
            <div id="sizesContainer" class="space-y-2 border border-gray-300 rounded-lg p-4 bg-gray-50">
              <div class="text-sm text-gray-600 mb-2">Add different cup sizes and their prices (e.g., Medium, Large)</div>
              <div id="sizesList" class="space-y-2"></div>
              <button type="button" onclick="addSizeRow()" class="text-sm text-blue-600 hover:text-blue-800 font-medium">
                + Add Size
              </button>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Sweetness Options (甜度选项)</label>
            <div id="sugarLevelsContainer" class="space-y-2 border border-gray-300 rounded-lg p-4 bg-gray-50">
              <div class="text-sm text-gray-600 mb-2">Add sweetness levels (e.g., 0%, 30%, 50%, 70%, 100%)</div>
              <div id="sugarLevelsList" class="space-y-2"></div>
              <button type="button" onclick="addSugarLevelRow()" class="text-sm text-blue-600 hover:text-blue-800 font-medium">
                + Add Sweetness Level
              </button>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Available Toppings (可选加料)</label>
            <div id="toppingsContainer" class="space-y-2 border border-gray-300 rounded-lg p-4 bg-gray-50">
              <div class="text-sm text-gray-600 mb-2">Add topping names and prices (e.g., Cheese 芝士: 20 LE, Boba 波霸: 20 LE)</div>
              <div id="toppingsList" class="space-y-2"></div>
              <button type="button" onclick="addToppingRow()" class="text-sm text-blue-600 hover:text-blue-800 font-medium">
                + Add Topping
              </button>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Available Ice Options</label>
            <div id="iceOptionsContainer" class="border border-gray-300 rounded-lg p-4 bg-gray-50">
              <div class="text-sm text-gray-600 mb-2">Select which ice level options are available for this product</div>
              <div id="iceOptionsList" class="space-y-2">
                <label class="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" class="ice-option-checkbox" value="normal" checked>
                  <span class="text-sm text-gray-700">Normal Ice 正常冰</span>
                </label>
                <label class="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" class="ice-option-checkbox" value="less" checked>
                  <span class="text-sm text-gray-700">Less Ice 少冰</span>
                </label>
                <label class="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" class="ice-option-checkbox" value="no" checked>
                  <span class="text-sm text-gray-700">No Ice 去冰</span>
                </label>
                <label class="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" class="ice-option-checkbox" value="room" checked>
                  <span class="text-sm text-gray-700">Room Temperature 常温</span>
                </label>
                <label class="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" class="ice-option-checkbox" value="hot" checked>
                  <span class="text-sm text-gray-700">Hot 热</span>
                </label>
              </div>
              <div class="text-xs text-gray-500 mt-2">If no options are selected, customers cannot choose ice level for this product</div>
            </div>
          </div>
          
          <div class="flex space-x-3 mt-6">
            <button type="submit" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg">
              Save
            </button>
            <button type="button" onclick="closeProductModal()" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-3 rounded-lg">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  // 设置表单提交事件
  document.getElementById('productForm').addEventListener('submit', saveProduct);
}

// 菜品管理功能
async function showProductModal(product = null) {
  // 加载分类列表
  try {
    const response = await fetch(`${API_BASE}/admin/categories`, { credentials: 'include' });
    const data = await response.json();
    if (data.success) {
      const select = document.getElementById('productCategory');
      select.innerHTML = '<option value="">No Category</option>' +
        data.categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');
    }
  } catch (error) {
    console.error('加载分类失败:', error);
  }
  
  // 不再需要加载加料产品，Available Toppings 现在是完全独立的文本列表
  
  const modal = document.getElementById('productModal');
  const title = document.getElementById('productModalTitle');
  
  if (product) {
    title.textContent = 'Edit Product';
    document.getElementById('productId').value = product.id;
    document.getElementById('productName').value = product.name;
    document.getElementById('productPrice').value = product.price;
    document.getElementById('productDescription').value = product.description || '';
    document.getElementById('productCategory').value = product.category_id || '';
    document.getElementById('productStatus').value = product.status;
    
    // 加载杯型价格
    loadSizes(product.sizes || '{}');
    
    // 加载甜度选项
    loadSugarLevels(product.sugar_levels || '["0","30","50","70","100"]');
    
    // 加载可选加料 - 改为可编辑形式（类似甜度选项），完全独立，不依赖任何产品
    await loadAvailableToppings(product.available_toppings || '[]');
    
    // 加载冰度选项
    loadIceOptions(product.ice_options || '["normal","less","no","room","hot"]');
    
    if (product.image_url) {
      document.getElementById('currentImage').innerHTML = 
        `<img src="${product.image_url}" class="w-32 h-32 object-cover rounded-lg">`;
    }
  } else {
    title.textContent = 'Add Product';
    // 清除productId字段，确保是添加而不是更新
    document.getElementById('productId').value = '';
    document.getElementById('productForm').reset();
    // 再次确保productId被清除（reset可能不会清除隐藏字段）
    document.getElementById('productId').value = '';
    document.getElementById('currentImage').innerHTML = '';
    document.getElementById('sizesList').innerHTML = '';
    document.getElementById('sugarLevelsList').innerHTML = '';
    document.getElementById('toppingsList').innerHTML = '';
    // 重置冰度选项为全选
    const iceCheckboxes = document.querySelectorAll('.ice-option-checkbox');
    iceCheckboxes.forEach(cb => cb.checked = true);
    // 加载默认甜度选项
    loadSugarLevels('["0","30","50","70","100"]');
  }
  
  modal.classList.add('active');
  // 滚动到模态框位置
  modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('active');
}

// 加载杯型价格
function loadSizes(sizesJson) {
  const sizesList = document.getElementById('sizesList');
  if (!sizesList) return;
  
  sizesList.innerHTML = '';
  
  try {
    const sizes = typeof sizesJson === 'string' ? JSON.parse(sizesJson) : sizesJson;
    if (sizes && Object.keys(sizes).length > 0) {
      Object.entries(sizes).forEach(([name, price]) => {
        addSizeRow(name, price);
      });
    }
  } catch (e) {
    console.error('Failed to parse sizes:', e);
  }
}

// 添加杯型行
function addSizeRow(name = '', price = '') {
  const sizesList = document.getElementById('sizesList');
  if (!sizesList) return;
  
  const row = document.createElement('div');
  row.className = 'size-row flex gap-2 items-center';
  row.innerHTML = `
    <input type="text" class="size-name flex-1 px-3 py-2 border border-gray-300 rounded-lg" 
           placeholder="Size name (e.g., Medium, Large)" value="${name}">
    <input type="number" class="size-price w-32 px-3 py-2 border border-gray-300 rounded-lg" 
           placeholder="Price" step="0.01" min="0" value="${price}">
    <button type="button" onclick="this.parentElement.remove()" 
            class="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
      ×
    </button>
  `;
  sizesList.appendChild(row);
}

// 加载甜度选项
function loadSugarLevels(sugarLevelsJson) {
  const sugarLevelsList = document.getElementById('sugarLevelsList');
  if (!sugarLevelsList) return;
  
  sugarLevelsList.innerHTML = '';
  
  try {
    const sugarLevels = typeof sugarLevelsJson === 'string' ? JSON.parse(sugarLevelsJson) : sugarLevelsJson;
    if (Array.isArray(sugarLevels) && sugarLevels.length > 0) {
      sugarLevels.forEach(level => {
        addSugarLevelRow(level);
      });
    } else {
      // 如果没有数据，添加默认值
      ['0', '30', '50', '70', '100'].forEach(level => {
        addSugarLevelRow(level);
      });
    }
  } catch (e) {
    console.error('Failed to parse sugar_levels:', e);
    // 解析失败时添加默认值
    ['0', '30', '50', '70', '100'].forEach(level => {
      addSugarLevelRow(level);
    });
  }
}

// 添加甜度选项行
function addSugarLevelRow(value = '') {
  const sugarLevelsList = document.getElementById('sugarLevelsList');
  if (!sugarLevelsList) return;
  
  const row = document.createElement('div');
  row.className = 'sugar-level-row flex gap-2 items-center';
  row.innerHTML = `
    <input type="text" class="sugar-level-value flex-1 px-3 py-2 border border-gray-300 rounded-lg" 
           placeholder="Sweetness level (e.g., 0, 30, 50, 70, 100)" value="${value}">
    <button type="button" onclick="this.parentElement.remove()" 
            class="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
      ×
    </button>
  `;
  sugarLevelsList.appendChild(row);
}

// 加载所有加料产品
let allToppings = [];
async function loadToppings() {
  try {
    const response = await fetch(`${API_BASE}/admin/products?status=active`, { credentials: 'include' });
    const data = await response.json();
    if (data.success) {
      // 筛选出加料产品（description为"额外加料"或在"Other"分类中）
      allToppings = data.products.filter(p => 
        p.description === '额外加料' || 
        (p.category_name && (p.category_name.includes('Other') || p.category_name.includes('其它') || p.category_name.includes('加料')))
      );
      // 不在这里渲染，让调用者决定何时渲染以及传递选中的 ID
      // renderToppingsList();
    }
  } catch (error) {
    console.error('加载加料产品失败:', error);
  }
}

// 加载可选加料 - 改为可编辑形式（类似甜度选项），完全独立，不依赖任何产品
async function loadAvailableToppings(availableToppingsJson) {
  const toppingsList = document.getElementById('toppingsList');
  if (!toppingsList) return;
  
  toppingsList.innerHTML = '';
  
  try {
    let availableToppings = [];
    
    // 解析 available_toppings
    if (availableToppingsJson) {
      if (typeof availableToppingsJson === 'string') {
        try {
          availableToppings = JSON.parse(availableToppingsJson);
          // 如果解析后仍然是字符串，再次解析
          if (typeof availableToppings === 'string') {
            availableToppings = JSON.parse(availableToppings);
          }
        } catch (e) {
          console.error('Failed to parse available_toppings:', e);
        }
      } else if (Array.isArray(availableToppingsJson)) {
        availableToppings = availableToppingsJson;
      }
    }
    
    // 确保是数组
    if (!Array.isArray(availableToppings)) {
      availableToppings = [];
    }
    
    // 如果是旧的ID格式，转换为名称格式（兼容旧数据）
    // 如果数组中的元素是数字，说明是旧格式（ID），需要查找对应的名称
    const needsConversion = availableToppings.length > 0 && typeof availableToppings[0] === 'number';
    
    if (needsConversion) {
      // 从数据库查询所有产品（不限制分类），将ID转换为名称
      // 这样即使"额外加料"产品被删除，也能找到对应的名称
      try {
        const response = await fetch(`${API_BASE}/admin/products`, { credentials: 'include' });
        const data = await response.json();
        if (data.success) {
          const allProducts = data.products;
          availableToppings = availableToppings.map(id => {
            const product = allProducts.find(p => parseInt(p.id) === parseInt(id));
            // 如果找到产品，使用产品名称；如果找不到（已删除），使用 "Topping #ID" 格式
            return product ? product.name : `Topping #${id}`;
          }).filter(name => name);
        } else {
          // 如果查询失败，使用默认格式
          availableToppings = availableToppings.map(id => `Topping #${id}`);
        }
      } catch (e) {
        console.error('Failed to load products for ID conversion:', e);
        // 如果查询失败，使用默认格式
        availableToppings = availableToppings.map(id => `Topping #${id}`);
      }
    }
    
    // 显示每个加料名称和价格（类似杯型价格）
    if (availableToppings.length > 0) {
      availableToppings.forEach(toppingItem => {
        // 如果是字符串，说明是旧格式（只有名称）
        if (typeof toppingItem === 'string') {
          addToppingRow(toppingItem, '');
        } else if (typeof toppingItem === 'object' && toppingItem !== null) {
          // 新格式：对象格式 {name: "Cheese 芝士", price: 20}
          addToppingRow(toppingItem.name || toppingItem, toppingItem.price || '');
        } else {
          addToppingRow(toppingItem, '');
        }
      });
    }
  } catch (e) {
    console.error('Failed to parse available_toppings:', e);
  }
}

// 添加加料行（类似杯型价格，包含名称和价格）
function addToppingRow(name = '', price = '') {
  const toppingsList = document.getElementById('toppingsList');
  if (!toppingsList) return;
  
  const row = document.createElement('div');
  row.className = 'topping-row flex gap-2 items-center';
  row.innerHTML = `
    <input type="text" class="topping-name flex-1 px-3 py-2 border border-gray-300 rounded-lg" 
           placeholder="Topping name (e.g., Cheese 芝士)" value="${name}">
    <input type="number" class="topping-price w-32 px-3 py-2 border border-gray-300 rounded-lg" 
           placeholder="Price" step="0.01" min="0" value="${price}">
    <button type="button" onclick="this.parentElement.remove()" 
            class="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">
      ×
    </button>
  `;
  toppingsList.appendChild(row);
}

// 加载冰度选项
function loadIceOptions(iceOptionsJson) {
  const iceOptionsList = document.getElementById('iceOptionsList');
  if (!iceOptionsList) return;
  
  try {
    const iceOptions = typeof iceOptionsJson === 'string' 
      ? JSON.parse(iceOptionsJson) 
      : iceOptionsJson;
    
    // 先取消所有选中
    const checkboxes = iceOptionsList.querySelectorAll('.ice-option-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    
    if (Array.isArray(iceOptions) && iceOptions.length > 0) {
      iceOptions.forEach(option => {
        const checkbox = iceOptionsList.querySelector(`.ice-option-checkbox[value="${option}"]`);
        if (checkbox) {
          checkbox.checked = true;
        }
      });
    }
  } catch (e) {
    console.error('Failed to parse ice_options:', e);
  }
}

async function saveProduct(e) {
  e.preventDefault();
  
  const idInput = document.getElementById('productId');
  const id = idInput ? idInput.value.trim() : '';
  const isEdit = id && id !== '';
  
  const formData = new FormData();
  
  formData.append('name', document.getElementById('productName').value);
  formData.append('price', document.getElementById('productPrice').value);
  formData.append('description', document.getElementById('productDescription').value);
  formData.append('category_id', document.getElementById('productCategory').value);
  formData.append('status', document.getElementById('productStatus').value);
  
  // 收集杯型价格
  const sizes = {};
  const sizeRows = document.querySelectorAll('.size-row');
  sizeRows.forEach(row => {
    const sizeName = row.querySelector('.size-name').value.trim();
    const sizePrice = row.querySelector('.size-price').value.trim();
    if (sizeName && sizePrice) {
      sizes[sizeName] = parseFloat(sizePrice);
    }
  });
  const sizesJson = JSON.stringify(sizes);
  formData.append('sizes', sizesJson);
  console.log('Saving product with sizes:', sizesJson);
  
  // 收集甜度选项
  const sugarLevels = [];
  const sugarLevelRows = document.querySelectorAll('.sugar-level-row');
  sugarLevelRows.forEach(row => {
    const level = row.querySelector('.sugar-level-value').value.trim();
    if (level) {
      sugarLevels.push(level);
    }
  });
  formData.append('sugar_levels', JSON.stringify(sugarLevels));
  console.log('Saving product with sugar_levels:', sugarLevels);
  
  // 收集可选加料（名称和价格形式，类似杯型价格）
  const availableToppings = [];
  const toppingRows = document.querySelectorAll('.topping-row');
  toppingRows.forEach(row => {
    const toppingName = row.querySelector('.topping-name').value.trim();
    const toppingPrice = row.querySelector('.topping-price').value.trim();
    if (toppingName) {
      // 存储为对象格式 {name: "Cheese 芝士", price: 20}
      const price = toppingPrice ? parseFloat(toppingPrice) : 0;
      availableToppings.push({ name: toppingName, price: price });
    }
  });
  formData.append('available_toppings', JSON.stringify(availableToppings));
  console.log('Saving product with available_toppings:', availableToppings);
  
  // 收集冰度选项
  const iceOptions = [];
  const iceCheckboxes = document.querySelectorAll('.ice-option-checkbox:checked');
  iceCheckboxes.forEach(checkbox => {
    iceOptions.push(checkbox.value);
  });
  formData.append('ice_options', JSON.stringify(iceOptions));
  console.log('Saving product with ice_options:', iceOptions);
  
  const imageFile = document.getElementById('productImage').files[0];
  if (imageFile) {
    formData.append('image', imageFile);
  }
  
  try {
    const url = isEdit ? `${API_BASE}/admin/products/${id}` : `${API_BASE}/admin/products`;
    const method = isEdit ? 'PUT' : 'POST';
    
    // 调试日志
    console.log('Saving product:', { isEdit, id, url, method });
    
    const response = await fetch(url, {
      method,
      credentials: 'include',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast(isEdit ? 'Product updated successfully' : 'Product added successfully', 'success');
      closeProductModal();
      loadProducts();
    } else {
        showToast(data.message || 'Operation failed', 'error');
    }
  } catch (error) {
    console.error('Failed to save product:', error);
      showToast('Operation failed', 'error');
  }
}

async function deleteProduct(id) {
  const confirmed = await showConfirmDialog(
    'Delete Product',
    'Are you sure you want to delete this product? This action cannot be undone.',
    'Delete',
    'Cancel'
  );
  
  if (!confirmed) return;
  
  try {
    const response = await fetch(`${API_BASE}/admin/products/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Deleted successfully', 'success');
      loadProducts();
    } else {
        showToast(data.message || 'Delete failed', 'error');
    }
  } catch (error) {
    console.error('Failed to delete product:', error);
    showToast('Delete failed', 'error');
  }
}

// 加载分类管理
async function loadCategories() {
  try {
    const response = await fetch(`${API_BASE}/admin/categories`, { credentials: 'include' });
    const data = await response.json();
    
    if (data.success) {
      renderCategories(data.categories);
    }
  } catch (error) {
    console.error('加载分类失败:', error);
  }
}

// 渲染分类列表
function renderCategories(categories) {
  const container = document.getElementById('categoriesTab');
  
  container.innerHTML = `
    <div class="mb-6 flex justify-between items-center">
      <h2 class="text-2xl font-bold text-gray-900">Categories</h2>
      <div class="flex space-x-2">
        <button onclick="backupMenu()" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
          💾 Backup Menu
        </button>
        <button onclick="importMenu()" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition">
          📥 Import Menu
        </button>
      <button onclick="showCategoryModal()" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
        + Add Category
      </button>
      </div>
    </div>
    
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      ${categories.map(category => `
        <div class="bg-white p-6 rounded-xl shadow-md">
          <div class="flex justify-between items-start mb-4">
            <div>
              <h3 class="text-lg font-bold text-gray-900">${category.name}</h3>
              ${category.description ? `<p class="text-sm text-gray-500 mt-1">${category.description}</p>` : ''}
            </div>
            <span class="px-2 py-1 text-xs rounded-full ${category.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
              ${category.status === 'active' ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div class="flex space-x-2">
            <button onclick='showCategoryModal(${JSON.stringify(category)})' class="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
              Edit
            </button>
            <button onclick="deleteCategory(${category.id})" class="flex-1 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">
              Delete
            </button>
          </div>
        </div>
      `).join('')}
    </div>
    
    <!-- 分类编辑模态框 -->
    <div id="categoryModal" class="modal">
      <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
        <h3 id="categoryModalTitle" class="text-2xl font-bold text-gray-900 mb-6">Add Category</h3>
        <form id="categoryForm" class="space-y-4">
          <input type="hidden" id="categoryId">
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Category Name *</label>
            <input type="text" id="categoryName" required class="w-full px-4 py-2 border border-gray-300 rounded-lg">
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Description</label>
            <textarea id="categoryDescription" rows="3" class="w-full px-4 py-2 border border-gray-300 rounded-lg"></textarea>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Sort Order</label>
            <input type="number" id="categorySortOrder" value="0" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">状态</label>
            <select id="categoryStatus" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          
          <div class="flex space-x-3 mt-6">
            <button type="submit" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg">
              保存
            </button>
            <button type="button" onclick="closeCategoryModal()" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-3 rounded-lg">
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
  
  // 设置表单提交事件
  document.getElementById('categoryForm').addEventListener('submit', saveCategory);
}

// 分类管理功能
function showCategoryModal(category = null) {
  const modal = document.getElementById('categoryModal');
  const title = document.getElementById('categoryModalTitle');
  
  if (category) {
    title.textContent = 'Edit Category';
    document.getElementById('categoryId').value = category.id;
    document.getElementById('categoryName').value = category.name;
    document.getElementById('categoryDescription').value = category.description || '';
    document.getElementById('categorySortOrder').value = category.sort_order;
    document.getElementById('categoryStatus').value = category.status;
  } else {
    title.textContent = 'Add Category';
    document.getElementById('categoryForm').reset();
  }
  
  modal.classList.add('active');
  // 滚动到模态框位置
  modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeCategoryModal() {
  document.getElementById('categoryModal').classList.remove('active');
}

async function saveCategory(e) {
  e.preventDefault();
  
  const id = document.getElementById('categoryId').value;
  const data = {
    name: document.getElementById('categoryName').value,
    description: document.getElementById('categoryDescription').value,
    sort_order: document.getElementById('categorySortOrder').value,
    status: document.getElementById('categoryStatus').value
  };
  
  try {
    const url = id ? `${API_BASE}/admin/categories/${id}` : `${API_BASE}/admin/categories`;
    const method = id ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast(id ? 'Category updated successfully' : 'Category added successfully', 'success');
      closeCategoryModal();
      loadCategories();
    } else {
      showToast(result.message || 'Operation failed', 'error');
    }
  } catch (error) {
    console.error('Failed to save category:', error);
      showToast('Operation failed', 'error');
  }
}

async function deleteCategory(id) {
  const confirmed = await showConfirmDialog(
    'Delete Category',
    'Are you sure you want to delete this category? This action cannot be undone.',
    'Delete',
    'Cancel'
  );
  
  if (!confirmed) return;
  
  try {
    const response = await fetch(`${API_BASE}/admin/categories/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Deleted successfully', 'success');
      loadCategories();
    } else {
        showToast(data.message || 'Delete failed', 'error');
    }
  } catch (error) {
    console.error('Failed to delete category:', error);
    showToast('Delete failed', 'error');
  }
}

// 加载折扣设置
async function loadDiscounts() {
  const container = document.getElementById('discountsTab');
  
  try {
    const response = await fetch(`${API_BASE}/admin/discount-rules`, { credentials: 'include' });
    const data = await response.json();
    
    if (data.success) {
      const rules = data.rules || [];
      
      container.innerHTML = `
        <div class="fade-in">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-gray-900">Discounts</h2>
            <button onclick="showDiscountModal()" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              + Add Discount Rule
            </button>
          </div>
          
          <div class="bg-white rounded-xl shadow-sm overflow-hidden">
            <div class="p-6">
              <p class="text-sm text-gray-600 mb-4">Discount rules are set by order amount range. The system will automatically apply the highest discount that meets the conditions.</p>
              
              <div id="discountRulesList" class="space-y-4">
                ${rules.length === 0 ? 
                  '<div class="text-center py-8 text-gray-500">No discount rules</div>' :
                  rules.map((rule, index) => `
                    <div class="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div class="flex-1">
                        <div class="font-semibold text-gray-900">
                          ${formatPrice(rule.min_amount)}${rule.max_amount ? ` - ${formatPrice(rule.max_amount)}` : ' and above'}
                        </div>
                        <div class="text-sm text-gray-600 mt-1">
                          ${rule.description || 'No description'} | Discount Rate: ${rule.discount_rate}%
                        </div>
                      </div>
                      <div class="flex space-x-2">
                        <button onclick='editDiscountRule(${JSON.stringify(rule).replace(/'/g, "&apos;")})' 
                                class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                          Edit
                        </button>
                        <button onclick='deleteDiscountRule(${rule.id})' 
                                class="px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">
                          Delete
                        </button>
                      </div>
                    </div>
                  `).join('')
                }
              </div>
            </div>
          </div>
        </div>
        
        <!-- 折扣规则编辑模态框 -->
        <div id="discountModal" class="modal">
          <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
            <h3 id="discountModalTitle" class="text-2xl font-bold text-gray-900 mb-6">Add Discount Rule</h3>
            <form id="discountForm" class="space-y-4">
              <input type="hidden" id="discountId">
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Min Amount (${currencySymbol}) *</label>
                <input type="number" id="discountMinAmount" required step="0.01" min="0" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Max Amount (${currencySymbol}) <span class="text-gray-500 text-xs">(Leave empty for no limit)</span></label>
                <input type="number" id="discountMaxAmount" step="0.01" min="0" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Discount Rate (%) *</label>
                <input type="number" id="discountRate" required step="0.1" min="0" max="100" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <input type="text" id="discountDescription" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="e.g., 100 off 10">
              </div>
              
              <div class="flex space-x-3 mt-6">
                <button type="submit" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg">
                  保存
                </button>
                <button type="button" onclick="closeDiscountModal()" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-3 rounded-lg">
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      `;
      
      // 设置表单提交事件
      document.getElementById('discountForm')?.addEventListener('submit', saveDiscountRule);
    } else {
      container.innerHTML = '<div class="text-center py-12 text-red-500">Load failed</div>';
    }
  } catch (error) {
    console.error('加载折扣设置失败:', error);
    container.innerHTML = '<div class="text-center py-12 text-red-500">加载失败</div>';
  }
}

let discountRules = [];

async function showDiscountModal(rule = null) {
  const modal = document.getElementById('discountModal');
  const title = document.getElementById('discountModalTitle');
  
  if (rule) {
    title.textContent = 'Edit Discount Rule';
    document.getElementById('discountId').value = rule.id;
    document.getElementById('discountMinAmount').value = rule.min_amount;
    document.getElementById('discountMaxAmount').value = rule.max_amount || '';
    document.getElementById('discountRate').value = rule.discount_rate;
    document.getElementById('discountDescription').value = rule.description || '';
  } else {
    title.textContent = 'Add Discount Rule';
    document.getElementById('discountForm').reset();
  }
  
  modal.classList.add('active');
  modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeDiscountModal() {
  document.getElementById('discountModal').classList.remove('active');
}

async function saveDiscountRule(e) {
  e.preventDefault();
  
  // 先获取当前所有规则
  const response = await fetch(`${API_BASE}/admin/discount-rules`, { credentials: 'include' });
  const data = await response.json();
  let rules = data.success ? data.rules : [];
  
  const id = document.getElementById('discountId').value;
  const rule = {
    min_amount: parseFloat(document.getElementById('discountMinAmount').value),
    max_amount: document.getElementById('discountMaxAmount').value ? parseFloat(document.getElementById('discountMaxAmount').value) : null,
    discount_rate: parseFloat(document.getElementById('discountRate').value),
    description: document.getElementById('discountDescription').value
  };
  
  if (id) {
    // 更新现有规则
    const index = rules.findIndex(r => r.id == id);
    if (index > -1) {
      rules[index] = { ...rules[index], ...rule };
    }
  } else {
    // 添加新规则
    rules.push(rule);
  }
  
  // 按最低金额排序
  rules.sort((a, b) => a.min_amount - b.min_amount);
  
  try {
    const saveResponse = await fetch(`${API_BASE}/admin/discount-rules/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ rules })
    });
    
    const result = await saveResponse.json();
    
    if (result.success) {
      showToast(id ? 'Discount rule updated successfully' : 'Discount rule added successfully', 'success');
      closeDiscountModal();
      loadDiscounts();
    } else {
      showToast(result.message || 'Operation failed', 'error');
    }
  } catch (error) {
    console.error('Failed to save discount rule:', error);
      showToast('Operation failed', 'error');
  }
}

async function editDiscountRule(rule) {
  showDiscountModal(rule);
}

async function deleteDiscountRule(id) {
  const confirmed = await showConfirmDialog(
    'Delete Discount Rule',
    'Are you sure you want to delete this discount rule? This action cannot be undone.',
    'Delete',
    'Cancel'
  );
  
  if (!confirmed) return;
  
  // 获取当前所有规则，删除指定的
  const response = await fetch(`${API_BASE}/admin/discount-rules`, { credentials: 'include' });
  const data = await response.json();
  let rules = data.success ? data.rules.filter(r => r.id != id) : [];
  
  try {
    const saveResponse = await fetch(`${API_BASE}/admin/discount-rules/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ rules })
    });
    
    const result = await saveResponse.json();
    
    if (result.success) {
      showToast('Discount rule deleted successfully', 'success');
      loadDiscounts();
    } else {
      showToast(result.message || 'Delete failed', 'error');
    }
  } catch (error) {
    console.error('Failed to delete discount rule:', error);
    showToast('Delete failed', 'error');
  }
}

// 加载设置页面
async function loadSettingsPage() {
  const container = document.getElementById('settingsTab');
  
  try {
    const response = await fetch(`${API_BASE}/admin/settings`, { credentials: 'include' });
    const data = await response.json();
    
    if (data.success) {
      const settings = data.settings || {};
      
      container.innerHTML = `
        <div class="fade-in">
          <h2 class="text-2xl font-bold text-gray-900 mb-6">System Settings</h2>
          
          <div class="bg-white rounded-xl shadow-sm p-6">
            <form id="settingsForm" class="space-y-6">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Ordering Status</label>
                <select id="orderingOpen" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                  <option value="true" ${settings.ordering_open === 'true' ? 'selected' : ''}>Open</option>
                  <option value="false" ${settings.ordering_open !== 'true' ? 'selected' : ''}>Closed</option>
                </select>
                <p class="text-xs text-gray-500 mt-1">Control whether users can place orders</p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Store Name</label>
                <input type="text" id="storeName" 
                       class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                       placeholder="Enter store name"
                       value="${settings.store_name || 'BOBA TEA'}"
                       maxlength="50">
                <p class="text-xs text-gray-500 mt-1">Store name will be displayed throughout the application</p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Currency Symbol</label>
                <input type="text" id="currencySymbol" 
                       class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                       placeholder="Enter currency symbol (e.g., LE, ¥, $)"
                       value="${settings.currency_symbol || 'LE'}"
                       maxlength="10">
                <p class="text-xs text-gray-500 mt-1">Currency symbol will be displayed before all prices (e.g., LE, ¥, $)</p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Max Visible Cycles</label>
                <input type="number" id="maxVisibleCycles" 
                       class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                       placeholder="Enter maximum number of visible cycles"
                       value="${settings.max_visible_cycles || '10'}"
                       min="1"
                       max="100">
                <p class="text-xs text-gray-500 mt-1">Maximum number of cycles to display in Orders page. Older cycles will be automatically archived to logs/export folder.</p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">System Notice</label>
                <textarea id="systemNotice" rows="4" 
                          class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                          placeholder="Enter system notice content, users can see it on the homepage">${settings.system_notice || ''}</textarea>
              </div>
              
              <div class="border-t pt-6 mt-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">Session Timeout Settings</h3>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Admin Session Timeout (seconds)</label>
                    <input type="number" id="adminSessionTimeout" 
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                           placeholder="7200"
                           value="${settings.admin_session_timeout || '7200'}"
                           min="60"
                           max="86400">
                    <p class="text-xs text-gray-500 mt-1">Admin session expiration time in seconds (default: 7200 = 2 hours). Minimum: 60 seconds, Maximum: 86400 seconds (24 hours)</p>
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">User Session Timeout (seconds)</label>
                    <input type="number" id="userSessionTimeout" 
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                           placeholder="7200"
                           value="${settings.user_session_timeout || '7200'}"
                           min="60"
                           max="86400">
                    <p class="text-xs text-gray-500 mt-1">User session expiration time in seconds (default: 7200 = 2 hours). Minimum: 60 seconds, Maximum: 86400 seconds (24 hours)</p>
                  </div>
                </div>
                <div class="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p class="text-sm text-blue-800">
                    <strong>Note:</strong> Session time will be automatically refreshed when users interact with the page (clicking buttons, scrolling, etc.). This ensures active users stay logged in.
                  </p>
                </div>
              </div>
              
              <div class="border-t pt-6 mt-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">SMS Verification Settings</h3>
                
                <div class="mb-4">
                  <label class="flex items-center space-x-2">
                    <input type="checkbox" id="smsEnabled" 
                           class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                           ${settings.sms_enabled === 'true' ? 'checked' : ''}>
                    <span class="text-sm font-medium text-gray-700">Enable SMS Verification</span>
                  </label>
                  <p class="text-xs text-gray-500 mt-1 ml-6">Require verification code for user login</p>
                </div>
                
                <div id="smsConfigSection" class="space-y-4 ${settings.sms_enabled === 'true' ? '' : 'hidden'}">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Twilio Account SID</label>
                    <input type="text" id="twilioAccountSid" 
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                           placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                           value="${settings.twilio_account_sid || ''}">
                    <p class="text-xs text-gray-500 mt-1">Your Twilio Account SID</p>
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Twilio Auth Token</label>
                    <input type="password" id="twilioAuthToken" autocomplete="off"
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                           placeholder="Your Twilio Auth Token"
                           value="${settings.twilio_auth_token || ''}">
                    <p class="text-xs text-gray-500 mt-1">Your Twilio Auth Token (hidden for security)</p>
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Twilio Verify Service SID (Recommended)</label>
                    <input type="text" id="twilioVerifyServiceSid" 
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                           placeholder="VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                           value="${settings.twilio_verify_service_sid || ''}">
                    <p class="text-xs text-gray-500 mt-1">Your Twilio Verify Service SID (starts with VA). If set, this will be used instead of phone number.</p>
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Twilio Phone Number (Alternative)</label>
                    <input type="text" id="twilioPhoneNumber" 
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                           placeholder="+1234567890"
                           value="${settings.twilio_phone_number || ''}">
                    <p class="text-xs text-gray-500 mt-1">Your Twilio phone number (E.164 format, e.g., +1234567890). Only used if Verify Service SID is not set.</p>
                  </div>
                  
                  <div>
                    <button type="button" onclick="testSMS()" 
                            class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">
                      Test SMS
                    </button>
                    <p class="text-xs text-gray-500 mt-1">Send a test SMS to verify configuration</p>
                  </div>
                </div>
              </div>
              
              <div class="border-t pt-6 mt-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">Email Settings</h3>
                
                <div class="mb-4">
                  <label class="flex items-center space-x-2">
                    <input type="checkbox" id="emailEnabled" 
                           class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                           ${settings.email_enabled === 'true' ? 'checked' : ''}>
                    <span class="text-sm font-medium text-gray-700">Enable Email Notifications</span>
                  </label>
                  <p class="text-xs text-gray-500 mt-1 ml-6">When enabled, system will automatically send order export emails when confirming cycles</p>
                </div>
                
                <div id="emailConfigSection" class="space-y-4 ${settings.email_enabled === 'true' ? '' : 'hidden'}">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">SMTP Host *</label>
                      <input type="text" id="emailSmtpHost" 
                             class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                             placeholder="smtp.gmail.com"
                             value="${settings.email_smtp_host || ''}">
                      <p class="text-xs text-gray-500 mt-1">SMTP server hostname</p>
                    </div>
                    
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">SMTP Port *</label>
                      <input type="number" id="emailSmtpPort" 
                             class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                             placeholder="587"
                             value="${settings.email_smtp_port || '587'}"
                             min="1"
                             max="65535">
                      <p class="text-xs text-gray-500 mt-1">SMTP server port (587 for TLS, 465 for SSL)</p>
                    </div>
                  </div>
                  
                  <div>
                    <label class="flex items-center space-x-2">
                      <input type="checkbox" id="emailSmtpSecure" 
                             class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                             ${settings.email_smtp_secure === 'true' ? 'checked' : ''}>
                      <span class="text-sm font-medium text-gray-700">Use SSL/TLS</span>
                    </label>
                    <p class="text-xs text-gray-500 mt-1 ml-6">Enable for port 465 (SSL), disable for port 587 (TLS)</p>
                  </div>
                  
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">SMTP Username *</label>
                      <input type="text" id="emailSmtpUser" 
                             class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                             placeholder="your-email@gmail.com"
                             value="${settings.email_smtp_user || ''}">
                      <p class="text-xs text-gray-500 mt-1">SMTP authentication username (usually your email address)</p>
                    </div>
                    
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">SMTP Password *</label>
                      <input type="password" id="emailSmtpPassword" autocomplete="off"
                             class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                             placeholder="Your SMTP password or app password"
                             value="${settings.email_smtp_password || ''}">
                      <p class="text-xs text-gray-500 mt-1">SMTP authentication password (for Gmail, use App Password)</p>
                    </div>
                  </div>
                  
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">From Email Address *</label>
                      <input type="email" id="emailFrom" 
                             class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                             placeholder="noreply@example.com"
                             value="${settings.email_from || ''}">
                      <p class="text-xs text-gray-500 mt-1">Sender email address (usually same as SMTP username)</p>
                    </div>
                    
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">To Email Address *</label>
                      <input type="text" id="emailTo" 
                             class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                             placeholder="recipient@example.com; another@example.com"
                             value="${settings.email_to || ''}">
                      <p class="text-xs text-gray-500 mt-1">Recipient email address(es) for order export notifications. Multiple addresses can be separated by semicolons (;)</p>
                    </div>
                  </div>
                  
                  <div>
                    <button type="button" onclick="testEmail()" 
                            class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm">
                      Test Email
                    </button>
                    <p class="text-xs text-gray-500 mt-1">Send a test email to verify configuration</p>
                  </div>
                  
                  <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p class="text-xs text-blue-800">
                      <strong>Note:</strong> For Gmail, you need to use an App Password instead of your regular password. 
                      Go to Google Account → Security → 2-Step Verification → App passwords to generate one.
                    </p>
                  </div>
                </div>
              </div>
              
              <div class="border-t pt-6 mt-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">Logging Settings</h3>
                
                <div class="mb-4">
                  <label class="flex items-center space-x-2">
                    <input type="checkbox" id="debugLoggingEnabled" 
                           class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                           ${settings.debug_logging_enabled === 'true' ? 'checked' : ''}>
                    <span class="text-sm font-medium text-gray-700">Enable Detailed DEBUG Logging</span>
                  </label>
                  <p class="text-xs text-gray-500 mt-1 ml-6">
                    When enabled, all requests will be logged including static resources (images, CSS, JS) and cached responses (304). 
                    When disabled (default), only API requests, errors, and slow requests (>1s) will be logged.
                  </p>
                  <div class="mt-2 ml-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p class="text-xs text-yellow-800">
                      <strong>⚠️ Warning:</strong> Enabling detailed logging will significantly increase log file size. 
                      Only enable when debugging issues. Default is OFF for production use.
                    </p>
                  </div>
                </div>
              </div>
              
              <div class="flex space-x-3 pt-4">
                <button type="submit" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg">
                  Save Settings
                </button>
                <button type="button" onclick="loadSettingsPage()" class="px-6 py-3 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold rounded-lg">
                  Reset
                </button>
              </div>
            </form>
          </div>
          
          <!-- File Cleanup Section -->
          <div class="bg-white rounded-xl shadow-sm p-6 mt-6">
            <h3 class="text-xl font-bold text-gray-900 mb-4">🧹 File Cleanup</h3>
            <p class="text-sm text-gray-600 mb-4">Clean up old files to free up disk space. This will permanently delete files older than the specified number of days.</p>
            
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Keep Files For (Days)</label>
                <input type="number" id="cleanupDays" 
                       class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                       placeholder="Enter number of days"
                       value="30"
                       min="1"
                       max="365">
                <p class="text-xs text-gray-500 mt-1">Files older than this number of days will be deleted</p>
              </div>
              
              <div class="space-y-2">
                <label class="flex items-center space-x-2">
                  <input type="checkbox" id="cleanPaymentScreenshots" 
                         class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                  <span class="text-sm font-medium text-gray-700">Clean Payment Screenshots</span>
                </label>
                <p class="text-xs text-gray-500 ml-6">Delete payment screenshot files from uploads/payments/</p>
              </div>
              
              <div class="space-y-2">
                <label class="flex items-center space-x-2">
                  <input type="checkbox" id="cleanLogs" 
                         class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                  <span class="text-sm font-medium text-gray-700">Clean Log Files</span>
                </label>
                <p class="text-xs text-gray-500 ml-6">Delete log files from logs/ directory (backup and export folders are excluded)</p>
              </div>
              
              <div id="cleanupPreview" class="hidden bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p class="text-sm font-semibold text-yellow-800 mb-2">Preview:</p>
                <p class="text-sm text-yellow-700" id="cleanupPreviewText"></p>
              </div>
              
              <div class="flex space-x-3">
                <button type="button" onclick="previewCleanup()" 
                        class="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium">
                  Preview Cleanup
                </button>
                <button type="button" onclick="executeCleanup()" 
                        class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">
                  Execute Cleanup
                </button>
              </div>
            </div>
          </div>

          <!-- Remote Backup Configuration -->
          <div class="bg-white rounded-xl shadow-sm p-6 mt-6">
            <h3 class="text-xl font-bold text-gray-900 mb-4">🌐 Remote Backup (Cross-Site Backup)</h3>
            <p class="text-sm text-gray-600 mb-4">Configure automatic backup push to remote sites and receive backups from other sites.</p>
            
            <div class="space-y-6">
              <!-- Push Configuration -->
              <div>
                <div class="flex items-center justify-between mb-4">
                  <h4 class="text-lg font-semibold text-gray-900">📤 Push Configuration</h4>
                  <button onclick="showRemoteBackupConfigModal()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">
                    + Add Push Config
                  </button>
                </div>
                <div id="remoteBackupConfigsList" class="space-y-2">
                  <p class="text-gray-500 text-sm">Loading configurations...</p>
                </div>
              </div>

              <!-- Receive Configuration -->
              <div class="border-t pt-6">
                <h4 class="text-lg font-semibold text-gray-900 mb-4">📥 Receive Configuration</h4>
                <div id="receiveConfigSection" class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">API Token</label>
                    <div class="flex items-center space-x-2">
                      <input type="password" id="receiveApiToken" autocomplete="off"
                             class="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
                             placeholder="Enter API token (must match the token configured on the sending site)">
                      <button type="button" onclick="toggleReceiveApiTokenVisibility()" 
                              class="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm">
                        <span id="receiveApiTokenToggleText">Show</span>
                      </button>
                    </div>
                    <input type="hidden" id="receiveApiTokenOriginal" value="">
                    <p class="text-xs text-gray-500 mt-1">This token must be the same as the one configured on the sending site</p>
                  </div>
                  <div>
                    <label class="flex items-center space-x-2">
                      <input type="checkbox" id="receiveAutoRestore" 
                             class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                      <span class="text-sm font-medium text-gray-700">Auto Restore</span>
                    </label>
                    <p class="text-xs text-gray-500 mt-1 ml-6">Automatically restore received backups (otherwise, save and wait for manual restore)</p>
                  </div>
                  <button onclick="saveReceiveConfig()" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg">
                    Save Receive Config
                  </button>
                </div>
              </div>

              <!-- Push Logs -->
              <div class="border-t pt-6">
                <div class="flex items-center justify-between mb-4">
                  <h4 class="text-lg font-semibold text-gray-900">📋 Push Logs</h4>
                  <button onclick="loadPushLogs()" class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm">
                    Refresh
                  </button>
                </div>
                <div id="pushLogsList" class="space-y-2 max-h-64 overflow-y-auto">
                  <p class="text-gray-500 text-sm">Loading logs...</p>
                </div>
              </div>

              <!-- Received Backups -->
              <div class="border-t pt-6">
                <div class="flex items-center justify-between mb-4">
                  <h4 class="text-lg font-semibold text-gray-900">📦 Received Backups</h4>
                  <button onclick="loadReceivedBackups()" class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm">
                    Refresh
                  </button>
                </div>
                <div id="receivedBackupsList" class="space-y-2 max-h-64 overflow-y-auto">
                  <p class="text-gray-500 text-sm">Loading received backups...</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      
      // 设置表单提交事件
      document.getElementById('settingsForm')?.addEventListener('submit', saveSettings);
      
      // SMS启用/禁用切换
      document.getElementById('smsEnabled')?.addEventListener('change', (e) => {
        const smsSection = document.getElementById('smsConfigSection');
        if (smsSection) {
          if (e.target.checked) {
            smsSection.classList.remove('hidden');
          } else {
            smsSection.classList.add('hidden');
          }
        }
      });
      
      // Email启用/禁用切换
      document.getElementById('emailEnabled')?.addEventListener('change', (e) => {
        const emailSection = document.getElementById('emailConfigSection');
        if (emailSection) {
          if (e.target.checked) {
            emailSection.classList.remove('hidden');
          } else {
            emailSection.classList.add('hidden');
          }
        }
      });
      
      // 等待 DOM 渲染完成后再加载远程备份配置
      setTimeout(() => {
        loadRemoteBackupConfigs();
        loadReceiveConfig();
        loadPushLogs();
        loadReceivedBackups();
      }, 100);
    } else {
      container.innerHTML = '<div class="text-center py-12 text-red-500">Load failed</div>';
    }
  } catch (error) {
    console.error('加载设置失败:', error);
    container.innerHTML = '<div class="text-center py-12 text-red-500">加载失败</div>';
  }
}

async function saveSettings(e) {
  e.preventDefault();
  
  const maxVisibleCycles = parseInt(document.getElementById('maxVisibleCycles').value) || 10;
  if (maxVisibleCycles < 1 || maxVisibleCycles > 100) {
    showToast('Max Visible Cycles must be between 1 and 100', 'warning');
    return;
  }
  
  const smsEnabled = document.getElementById('smsEnabled')?.checked || false;
  const emailEnabled = document.getElementById('emailEnabled')?.checked || false;
  const debugLoggingEnabled = document.getElementById('debugLoggingEnabled')?.checked || false;
  
  // 获取session过期时间配置
  const adminSessionTimeout = document.getElementById('adminSessionTimeout')?.value;
  const userSessionTimeout = document.getElementById('userSessionTimeout')?.value;
  
  // 验证session过期时间
  if (adminSessionTimeout && (parseInt(adminSessionTimeout) < 60 || parseInt(adminSessionTimeout) > 86400)) {
    showToast('Admin session timeout must be between 60 and 86400 seconds', 'error');
    return;
  }
  
  if (userSessionTimeout && (parseInt(userSessionTimeout) < 60 || parseInt(userSessionTimeout) > 86400)) {
    showToast('User session timeout must be between 60 and 86400 seconds', 'error');
    return;
  }
  
  const settings = {
    ordering_open: document.getElementById('orderingOpen').value,
    system_notice: document.getElementById('systemNotice').value,
    store_name: document.getElementById('storeName').value.trim() || 'BOBA TEA',
    currency_symbol: document.getElementById('currencySymbol').value.trim() || 'LE',
    max_visible_cycles: maxVisibleCycles.toString(),
    admin_session_timeout: adminSessionTimeout || '7200',
    user_session_timeout: userSessionTimeout || '7200',
    sms_enabled: smsEnabled ? 'true' : 'false',
    twilio_account_sid: document.getElementById('twilioAccountSid')?.value.trim() || '',
    twilio_auth_token: document.getElementById('twilioAuthToken')?.value.trim() || '',
    twilio_phone_number: document.getElementById('twilioPhoneNumber')?.value.trim() || '',
    twilio_verify_service_sid: document.getElementById('twilioVerifyServiceSid')?.value.trim() || '',
    email_enabled: emailEnabled ? 'true' : 'false',
    email_smtp_host: document.getElementById('emailSmtpHost')?.value.trim() || '',
    email_smtp_port: document.getElementById('emailSmtpPort')?.value.trim() || '587',
    email_smtp_secure: document.getElementById('emailSmtpSecure')?.checked ? 'true' : 'false',
    email_smtp_user: document.getElementById('emailSmtpUser')?.value.trim() || '',
    email_smtp_password: document.getElementById('emailSmtpPassword')?.value.trim() || '',
    email_from: document.getElementById('emailFrom')?.value.trim() || '',
    email_to: document.getElementById('emailTo')?.value.trim() || '',
    debug_logging_enabled: debugLoggingEnabled ? 'true' : 'false'
  };
  
  try {
    const response = await fetch(`${API_BASE}/admin/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(settings)
    });
    
    const result = await response.json();
    
    if (result.success) {
      showToast('Settings saved successfully', 'success');
      currentSettings = settings;
      // 更新商店名称
      if (settings.store_name) {
        storeName = settings.store_name;
        updateStoreName();
      }
      // 更新货币符号
      if (settings.currency_symbol) {
        currencySymbol = settings.currency_symbol;
        // 重新加载仪表盘和订单以更新价格显示
        loadDashboard();
        loadOrders();
      }
      // 如果修改了最大可见周期数，重新加载周期和订单列表
      if (settings.max_visible_cycles) {
        loadCycles();
        loadOrders();
      }
      loadSettingsPage();
    } else {
      showToast(result.message || 'Save failed', 'error');
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
    showToast('Save failed', 'error');
  }
}

// 预览清理
async function previewCleanup() {
  try {
    const days = parseInt(document.getElementById('cleanupDays').value) || 30;
    const cleanPaymentScreenshots = document.getElementById('cleanPaymentScreenshots').checked;
    const cleanLogs = document.getElementById('cleanLogs').checked;
    
    if (!cleanPaymentScreenshots && !cleanLogs) {
      showToast('Please select at least one cleanup option', 'warning');
      return;
    }
    
    showGlobalLoading('Checking files...');
    
    const params = new URLSearchParams({
      days: days.toString(),
      cleanPaymentScreenshots: cleanPaymentScreenshots.toString(),
      cleanLogs: cleanLogs.toString()
    });
    
    const response = await fetch(`${API_BASE}/admin/cleanup/info?${params}`, {
      credentials: 'include'
    });
    
    const data = await response.json();
    hideGlobalLoading();
    
    if (data.success) {
      const info = data.info;
      const previewDiv = document.getElementById('cleanupPreview');
      const previewText = document.getElementById('cleanupPreviewText');
      
      if (info.totalFiles > 0) {
        previewDiv.classList.remove('hidden');
        previewText.textContent = `Found ${info.totalFiles} files (${info.totalSizeMB}MB) that will be deleted.`;
        previewDiv.className = 'bg-yellow-50 border border-yellow-200 rounded-lg p-4';
      } else {
        previewDiv.classList.remove('hidden');
        previewText.textContent = 'No files found matching the criteria.';
        previewDiv.className = 'bg-green-50 border border-green-200 rounded-lg p-4';
      }
    } else {
      showToast(data.message || 'Failed to preview cleanup', 'error');
    }
  } catch (error) {
    hideGlobalLoading();
    console.error('Preview cleanup failed:', error);
    showToast('Failed to preview cleanup', 'error');
  }
}

// 执行清理
async function executeCleanup() {
  const days = parseInt(document.getElementById('cleanupDays').value) || 30;
  const cleanPaymentScreenshots = document.getElementById('cleanPaymentScreenshots').checked;
  const cleanLogs = document.getElementById('cleanLogs').checked;
  
  if (!cleanPaymentScreenshots && !cleanLogs) {
    showToast('Please select at least one cleanup option', 'warning');
    return;
  }
  
  const confirmed = await showConfirmDialog(
    'Execute Cleanup',
    `Are you sure you want to delete files older than ${days} days? This action cannot be undone.`,
    'Delete',
    'Cancel'
  );
  
  if (!confirmed) return;
  
  try {
    showGlobalLoading('Cleaning up files...');
    
    const response = await fetch(`${API_BASE}/admin/cleanup/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        days: days,
        cleanPaymentScreenshots: cleanPaymentScreenshots,
        cleanLogs: cleanLogs
      })
    });
    
    const data = await response.json();
    hideGlobalLoading();
    
    if (data.success) {
      showToast(`Cleanup completed! Deleted ${data.deletedFiles} files, freed ${data.freedSpaceMB}MB`, 'success');
      // 隐藏预览
      document.getElementById('cleanupPreview').classList.add('hidden');
    } else {
      showToast(data.message || 'Cleanup failed', 'error');
    }
  } catch (error) {
    hideGlobalLoading();
    console.error('Execute cleanup failed:', error);
    showToast('Failed to execute cleanup', 'error');
  }
}

// 测试SMS发送
async function testSMS() {
  const phone = prompt('Enter a phone number to test SMS (E.164 format, e.g., +201234567890):');
  if (!phone) {
    return;
  }
  
  if (!/^\+?\d{10,15}$/.test(phone.replace(/\s/g, ''))) {
    showToast('Invalid phone number format', 'error');
    return;
  }
  
  try {
    showGlobalLoading('Sending test SMS...');
    
    const response = await fetch(`${API_BASE}/auth/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone, type: 'login' })
    });
    
    const data = await response.json();
    
    hideGlobalLoading();
    
    if (data.success) {
      showToast(`Test SMS sent successfully! ${data.code ? `Code: ${data.code} (dev only)` : ''}`, 'success');
    } else {
      showToast(data.message || 'Failed to send test SMS', 'error');
    }
  } catch (error) {
    hideGlobalLoading();
    console.error('Test SMS failed:', error);
    showToast('Failed to send test SMS', 'error');
  }
}

// 测试邮件发送
async function testEmail() {
  try {
    showGlobalLoading('Sending test email...');
    
    const response = await fetch(`${API_BASE}/admin/email/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    
    const data = await response.json();
    
    hideGlobalLoading();
    
    if (data.success) {
      showToast('Test email sent successfully! Please check your inbox.', 'success');
    } else {
      showToast(data.message || 'Failed to send test email', 'error');
    }
  } catch (error) {
    hideGlobalLoading();
    console.error('Failed to send test email:', error);
    showToast('Failed to send test email', 'error');
  }
}

// 加载用户管理
async function loadUsers() {
  const container = document.getElementById('usersTab');
  
  try {
    const response = await fetch(`${API_BASE}/admin/users`, { credentials: 'include' });
    const data = await response.json();
    
    if (data.success) {
      const users = data.users || [];
      
      container.innerHTML = `
        <div class="fade-in">
          <h2 class="text-2xl font-bold text-gray-900 mb-6">Users</h2>
          
          <div class="bg-white rounded-xl shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Orders</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Spent</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registered</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Login</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  ${users.length === 0 ? 
                    '<tr><td colspan="9" class="px-6 py-4 text-center text-gray-500">No users</td></tr>' :
                    users.map(user => `
                      <tr class="hover:bg-gray-50">
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.id}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.phone}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.name || 'Not set'}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold ${(user.balance || 0) > 0 ? 'text-green-600' : 'text-gray-500'}">
                          ${formatPriceDecimal(user.balance || 0)}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.order_count || 0}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatPriceDecimal(user.total_spent || 0)}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.created_at ? new Date(user.created_at).toLocaleString('en-US') : '-'}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.last_login ? new Date(user.last_login).toLocaleString('en-US') : '-'}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm">
                          <div class="flex space-x-2">
                            <button onclick="showEditUserModal(${user.id}, '${(user.phone || '').replace(/'/g, "\\'")}', '${(user.name || '').replace(/'/g, "\\'")}')" 
                                    class="text-blue-600 hover:text-blue-800">Edit</button>
                            <button onclick="resetUserPin(${user.id}, '${(user.phone || '').replace(/'/g, "\\'")}')" 
                                    class="text-yellow-600 hover:text-yellow-800">Reset PIN</button>
                            <button onclick="deleteUser(${user.id}, '${(user.phone || '').replace(/'/g, "\\'")}')" 
                                    class="text-red-600 hover:text-red-800">Delete</button>
                          </div>
                        </td>
                      </tr>
                    `).join('')
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = '<div class="text-center py-12 text-red-500">Load failed</div>';
    }
  } catch (error) {
    console.error('加载用户列表失败:', error);
    container.innerHTML = '<div class="text-center py-12 text-red-500">加载失败</div>';
  }
}

// 显示编辑用户模态框
function showEditUserModal(userId, phone, name) {
  const newPhone = prompt(`Edit phone number for user ${phone}:`, phone);
  if (newPhone === null) return; // 用户取消
  
  const newName = prompt(`Edit name for user ${phone}:`, name || '');
  if (newName === null) return; // 用户取消
  
  (async () => {
    try {
      const response = await adminApiRequest(`${API_BASE}/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: newPhone,
          name: newName || null
        })
      });
      
      if (response && response.success) {
        showToast('User updated successfully', 'success');
        await loadUsers();
      }
    } catch (error) {
      console.error('更新用户失败:', error);
      showToast('Failed to update user', 'error');
    }
  })();
}

// 重置用户 PIN
async function resetUserPin(userId, phone) {
  if (!confirm(`Are you sure you want to reset PIN for user ${phone}? The user will need to set a new PIN on next login.`)) {
    return;
  }
  
  try {
    const response = await adminApiRequest(`${API_BASE}/admin/users/${userId}/reset-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response && response.success) {
      showToast('User PIN reset successfully', 'success');
      await loadUsers();
    }
  } catch (error) {
    console.error('重置用户PIN失败:', error);
    showToast('Failed to reset user PIN', 'error');
  }
}

// 删除用户
async function deleteUser(userId, phone) {
  const confirmed = await showConfirmDialog(
    'Delete User',
    `Are you sure you want to delete user ${phone}? This will permanently delete:\n\n- All orders and order items\n- All balance transaction records\n- User account and balance\n\nThis action cannot be undone!`,
    'Delete',
    'Cancel'
  );
  
  if (!confirmed) {
    return;
  }
  
  try {
    const response = await adminApiRequest(`${API_BASE}/admin/users/${userId}`, {
      method: 'DELETE'
    });
    
    if (response && response.success) {
      const message = response.deletedOrdersCount > 0 || response.deletedTransactionsCount > 0
        ? `User deleted successfully. Deleted ${response.deletedOrdersCount || 0} orders and ${response.deletedTransactionsCount || 0} balance transactions.`
        : 'User deleted successfully';
      showToast(message, 'success');
      await loadUsers();
    }
  } catch (error) {
    console.error('删除用户失败:', error);
    // 尝试从响应中获取错误信息
    let errorMessage = 'Failed to delete user';
    if (error.response) {
      try {
        const errorData = await error.response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        // 如果响应不是JSON，使用状态文本
        errorMessage = error.response.statusText || errorMessage;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    showToast(errorMessage, 'error');
  }
}

// 加载余额管理
async function loadBalanceManagement() {
  await loadUserBalanceList();
  await loadBalanceTransactions();
  await loadCyclesForRecharge();
}

// 加载用户余额列表
async function loadUserBalanceList() {
  try {
    const response = await adminApiRequest(`${API_BASE}/admin/users/balance`, {
      method: 'GET'
    });
    
    if (!response) {
      throw new Error('No response from server');
    }
    
    if (response.success) {
      const users = response.users || [];
      const tbody = document.getElementById('userBalanceTableBody');
      
      if (tbody) {
        tbody.innerHTML = users.length === 0
          ? '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No users</td></tr>'
          : users.map(user => `
            <tr class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                <input type="checkbox" class="user-balance-checkbox" data-user-id="${user.id}" onchange="updateSelectedUsers()">
                ${user.id}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.phone || '-'}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.name || 'Not set'}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold ${(user.balance || 0) > 0 ? 'text-green-600' : 'text-gray-500'}">
                ${formatPriceDecimal(user.balance || 0)}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${user.last_transaction_time ? new Date(user.last_transaction_time).toLocaleString('en-US') : '-'}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <button onclick="showRechargeModal(${user.id}, '${user.phone || ''}', '${(user.name || '').replace(/'/g, "\\'")}')" 
                        class="text-blue-600 hover:text-blue-800 mr-2">Recharge</button>
                <button onclick="showDeductModal(${user.id}, '${user.phone || ''}', '${(user.name || '').replace(/'/g, "\\'")}')" 
                        class="text-red-600 hover:text-red-800 mr-2">Deduct</button>
                <button onclick="showBalanceTransactions(${user.id})" 
                        class="text-gray-600 hover:text-gray-800">History</button>
              </td>
            </tr>
          `).join('');
      }
    }
  } catch (error) {
    console.error('加载用户余额列表失败:', error);
    const tbody = document.getElementById('userBalanceTableBody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-red-500">Load failed</td></tr>';
    }
  }
}

// 加载余额变动历史
let balanceTransactionsPage = 1;
async function loadBalanceTransactions() {
  try {
    const typeFilter = document.getElementById('balanceTransactionTypeFilter')?.value || '';
    const startDate = document.getElementById('balanceStartDate')?.value || '';
    const endDate = document.getElementById('balanceEndDate')?.value || '';
    
    let url = `${API_BASE}/admin/balance/transactions?page=${balanceTransactionsPage}&limit=30`;
    if (typeFilter) url += `&type=${typeFilter}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    
    const response = await adminApiRequest(url, { method: 'GET' });
    
    if (!response) {
      throw new Error('No response from server');
    }
    
    if (response.success) {
      const transactions = response.transactions || [];
      const total = response.total || 0;
      const totalPages = Math.ceil(total / 30);
      
      const tbody = document.getElementById('balanceTransactionsTableBody');
      if (tbody) {
        tbody.innerHTML = transactions.length === 0
          ? '<tr><td colspan="9" class="px-6 py-4 text-center text-gray-500">No transactions</td></tr>'
          : transactions.map(t => `
            <tr class="hover:bg-gray-50">
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${t.created_at ? new Date(t.created_at).toLocaleString('en-US') : '-'}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                ${t.user_phone || '-'} ${t.user_name ? `(${t.user_name})` : ''}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm">
                <span class="px-2 py-1 rounded text-xs ${
                  t.type === 'recharge' ? 'bg-green-100 text-green-800' :
                  t.type === 'deduct' ? 'bg-red-100 text-red-800' :
                  t.type === 'use' ? 'bg-blue-100 text-blue-800' :
                  'bg-gray-100 text-gray-800'
                }">${t.type || '-'}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold ${
                (t.amount || 0) > 0 ? 'text-green-600' : 'text-red-600'
              }">
                ${(t.amount || 0) > 0 ? '+' : ''}${formatPriceDecimal(t.amount || 0)}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatPriceDecimal(t.balance_before || 0)}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">${formatPriceDecimal(t.balance_after || 0)}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                ${t.order_number ? `<a href="#" onclick="switchTab('orders'); return false;" class="text-blue-600 hover:text-blue-800">${t.order_number}</a>` : '-'}
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${t.admin_name || '-'}</td>
              <td class="px-6 py-4 text-sm text-gray-500">${t.notes || '-'}</td>
            </tr>
          `).join('');
      }
      
      // 更新分页
      const pagination = document.getElementById('balanceTransactionsPagination');
      if (pagination) {
        pagination.innerHTML = `
          <div class="flex items-center justify-between">
            <div class="text-sm text-gray-700">
              Page ${balanceTransactionsPage} of ${totalPages} (Total: ${total})
            </div>
            <div class="flex space-x-2">
              <button onclick="balanceTransactionsPage = Math.max(1, balanceTransactionsPage - 1); loadBalanceTransactions();" 
                      ${balanceTransactionsPage <= 1 ? 'disabled' : ''} 
                      class="px-3 py-1 border border-gray-300 rounded-lg text-sm ${balanceTransactionsPage <= 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}">
                Previous
              </button>
              <button onclick="balanceTransactionsPage = Math.min(${totalPages}, balanceTransactionsPage + 1); loadBalanceTransactions();" 
                      ${balanceTransactionsPage >= totalPages ? 'disabled' : ''} 
                      class="px-3 py-1 border border-gray-300 rounded-lg text-sm ${balanceTransactionsPage >= totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}">
                Next
              </button>
            </div>
          </div>
        `;
      }
    }
  } catch (error) {
    console.error('加载余额变动历史失败:', error);
    const tbody = document.getElementById('balanceTransactionsTableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="9" class="px-6 py-4 text-center text-red-500">Load failed: ${error.message || 'Unknown error'}</td></tr>`;
    }
    const pagination = document.getElementById('balanceTransactionsPagination');
    if (pagination) {
      pagination.innerHTML = '';
    }
  }
}

// 加载周期列表（用于批量充值）
async function loadCyclesForRecharge() {
  try {
    const response = await adminApiRequest(`${API_BASE}/admin/cycles`, { method: 'GET' });
    
    if (response.success) {
      const cycles = response.cycles || [];
      const select = document.getElementById('cycleRechargeCycle');
      
      if (select) {
        select.innerHTML = '<option value="">Select Cycle</option>' + cycles.map(cycle => `
          <option value="${cycle.id}">${cycle.cycle_number} (${cycle.status})</option>
        `).join('');
      }
    }
  } catch (error) {
    console.error('加载周期列表失败:', error);
  }
}

// 批量充值选中的用户
async function batchRechargeSelected() {
  const checkboxes = document.querySelectorAll('.user-balance-checkbox:checked');
  if (checkboxes.length === 0) {
    showToast('Please select at least one user', 'warning');
    return;
  }
  
  const amount = parseFloat(document.getElementById('batchRechargeAmount')?.value);
  if (!amount || amount <= 0) {
    showToast('Please enter a valid amount', 'warning');
    return;
  }
  
  const notes = document.getElementById('batchRechargeNotes')?.value || '批量充值';
  
  const users = Array.from(checkboxes).map(cb => ({
    userId: parseInt(cb.dataset.userId),
    amount: amount,
    notes: notes
  }));
  
  if (!confirm(`Are you sure you want to recharge ${amount} to ${users.length} user(s)?`)) {
    return;
  }
  
  try {
    const response = await adminApiRequest(`${API_BASE}/admin/users/balance/batch-recharge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users })
    });
    
    if (response.success) {
      showToast(response.message, 'success');
      await loadUserBalanceList();
      // 清空选中状态
      checkboxes.forEach(cb => cb.checked = false);
      document.getElementById('batchRechargeAmount').value = '';
      document.getElementById('batchRechargeNotes').value = '';
    }
  } catch (error) {
    console.error('批量充值失败:', error);
  }
}

// 根据周期批量充值已付款用户
async function rechargeCyclePaidUsers() {
  const cycleId = document.getElementById('cycleRechargeCycle')?.value;
  if (!cycleId) {
    showToast('Please select a cycle', 'warning');
    return;
  }
  
  const amount = parseFloat(document.getElementById('cycleRechargeAmount')?.value);
  if (!amount || amount <= 0) {
    showToast('Please enter a valid amount', 'warning');
    return;
  }
  
  const notes = document.getElementById('cycleRechargeNotes')?.value || '';
  
  if (!confirm(`Are you sure you want to recharge ${amount} to all paid users in this cycle?`)) {
    return;
  }
  
  try {
    const response = await adminApiRequest(`${API_BASE}/admin/cycles/${cycleId}/balance/recharge-paid-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, notes })
    });
    
    if (response.success) {
      showToast(response.message, 'success');
      await loadUserBalanceList();
      document.getElementById('cycleRechargeAmount').value = '';
      document.getElementById('cycleRechargeNotes').value = '';
    }
  } catch (error) {
    console.error('周期批量充值失败:', error);
  }
}

// 更新选中的用户数量
function updateSelectedUsers() {
  const checked = document.querySelectorAll('.user-balance-checkbox:checked').length;
  // 可以在这里显示选中数量提示
}

// 显示充值模态框
function showRechargeModal(userId, phone, name) {
  const amount = prompt(`Recharge amount for user ${phone} (${name}):`);
  if (!amount || parseFloat(amount) <= 0) return;
  
  const notes = prompt('Notes (optional):') || '';
  
  (async () => {
    try {
      const response = await adminApiRequest(`${API_BASE}/admin/users/${userId}/balance/recharge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(amount), notes })
      });
      
      if (response.success) {
        showToast('Recharge successful', 'success');
        await loadUserBalanceList();
      }
    } catch (error) {
      console.error('充值失败:', error);
    }
  })();
}

// 显示扣减模态框
function showDeductModal(userId, phone, name) {
  const amount = prompt(`Deduct amount for user ${phone} (${name}):`);
  if (!amount || parseFloat(amount) <= 0) return;
  
  const notes = prompt('Notes (optional):') || '';
  
  (async () => {
    try {
      const response = await adminApiRequest(`${API_BASE}/admin/users/${userId}/balance/deduct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(amount), notes })
      });
      
      if (response.success) {
        showToast('Deduct successful', 'success');
        await loadUserBalanceList();
      }
    } catch (error) {
      console.error('扣减失败:', error);
    }
  })();
}

// 显示余额变动历史
function showBalanceTransactions(userId) {
  // 可以打开一个模态框显示该用户的余额变动历史
  // 这里简化处理，直接跳转到余额管理页面并过滤
  switchTab('balance');
  // 可以添加过滤逻辑
}

// 加载管理员管理
let adminsList = []; // 保存管理员列表，供事件委托使用

async function loadAdmins() {
  const container = document.getElementById('adminsTab');
  
  try {
    const response = await fetch(`${API_BASE}/admin/admins`, { credentials: 'include' });
    const data = await response.json();
    
    if (data.success) {
      const admins = data.admins || [];
      adminsList = admins; // 保存到全局变量
      const isSuper = isSuperAdmin();
      
      container.innerHTML = `
        <div class="fade-in">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-gray-900">Admins</h2>
            <button onclick="showAdminModal()" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              + Add Admin
            </button>
          </div>
          
          <div class="bg-white rounded-xl shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200" id="adminsTableBody">
                  ${admins.length === 0 ? 
                    '<tr><td colspan="8" class="px-6 py-4 text-center text-gray-500">No admins</td></tr>' :
                    admins.map((admin, index) => `
                      <tr class="hover:bg-gray-50" data-admin-index="${index}">
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${admin.id}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${admin.username}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${admin.name || '-'}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${admin.email || '-'}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${admin.role || 'admin'}</td>
                        <td class="px-6 py-4 whitespace-nowrap">
                          <span class="px-2 py-1 text-xs rounded-full ${admin.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
                            ${admin.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${admin.created_at ? new Date(admin.created_at).toLocaleString('en-US') : '-'}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm">
                          ${isSuper ? `
                          <button data-action="edit" data-admin-id="${admin.id}" 
                                  class="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                          <button data-action="delete" data-admin-id="${admin.id}" 
                                  class="text-red-600 hover:text-red-800">Delete</button>
                          ` : `
                          <span class="text-gray-400 text-xs">No permission</span>
                          `}
                        </td>
                      </tr>
                    `).join('')
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        <!-- 管理员编辑模态框 -->
        <div id="adminModal" class="modal">
          <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
            <h3 id="adminModalTitle" class="text-2xl font-bold text-gray-900 mb-6">Add Admin</h3>
            <form id="adminForm" class="space-y-4">
              <input type="hidden" id="adminId">
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Username *</label>
                <input type="text" id="adminUsername" required class="w-full px-4 py-2 border border-gray-300 rounded-lg">
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Password <span id="passwordLabel">*</span></label>
                <input type="password" id="adminPassword" required autocomplete="new-password"
                       class="w-full px-4 py-2 border border-gray-300 rounded-lg">
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Name</label>
                <input type="text" id="adminModalName" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input type="email" id="adminEmail" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
              </div>
              
              ${isSuper ? `
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <select id="adminRole" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              ` : ''}
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select id="adminStatus" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              
              <div class="flex space-x-3 mt-6">
                <button type="submit" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg">
                  保存
                </button>
                <button type="button" onclick="closeAdminModal()" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-3 rounded-lg">
                  取消
                </button>
              </div>
            </form>
          </div>
        </div>
      `;
      
      // 设置表单提交事件（移除旧的监听器，避免重复添加）
      const adminForm = document.getElementById('adminForm');
      if (adminForm) {
        // 克隆表单以移除所有旧的事件监听器
        const newForm = adminForm.cloneNode(true);
        adminForm.parentNode.replaceChild(newForm, adminForm);
        // 添加新的事件监听器
        newForm.addEventListener('submit', saveAdmin);
      }
      
      // 设置编辑和删除按钮事件委托（使用事件委托避免JSON.stringify转义问题）
      const adminsTableBody = document.getElementById('adminsTableBody');
      if (adminsTableBody) {
        // 移除旧的事件监听器（如果存在）
        const newAdminsTableBody = adminsTableBody.cloneNode(true);
        adminsTableBody.parentNode.replaceChild(newAdminsTableBody, adminsTableBody);
        
        // 添加新的事件监听器
        newAdminsTableBody.addEventListener('click', (e) => {
          if (e.target.dataset.action === 'edit') {
            const adminId = parseInt(e.target.dataset.adminId);
            const admin = adminsList.find(a => a.id === adminId);
            console.log('Edit button clicked, admin data:', admin);
            if (admin) {
              editAdmin(admin);
            } else {
              console.error('Admin not found in adminsList:', adminId, adminsList);
            }
          } else if (e.target.dataset.action === 'delete') {
            const adminId = parseInt(e.target.dataset.adminId);
            if (adminId) {
              deleteAdmin(adminId);
            }
          }
        });
      }
    } else {
      container.innerHTML = '<div class="text-center py-12 text-red-500">Load failed</div>';
    }
  } catch (error) {
    console.error('加载管理员列表失败:', error);
    container.innerHTML = '<div class="text-center py-12 text-red-500">加载失败</div>';
  }
}

function showAdminModal(admin = null) {
  // 只有super_admin可以管理其他admin
  if (!isSuperAdmin()) {
    showToast('Access denied. Only super admin can manage other admins.', 'error');
    return;
  }
  
  const modal = document.getElementById('adminModal');
  if (!modal) {
    console.error('adminModal element not found');
    showToast('Modal element not found', 'error');
    return;
  }
  
  const title = document.getElementById('adminModalTitle');
  if (!title) {
    console.error('adminModalTitle element not found');
    return;
  }
  
  if (admin) {
    console.log('Showing edit modal for admin:', admin);
    title.textContent = 'Edit Admin';
    
    // 先显示模态框，确保DOM元素存在
    modal.classList.add('active');
    
    // 使用双重 requestAnimationFrame 确保DOM已完全渲染
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // 设置基本字段
        const adminIdEl = document.getElementById('adminId');
        const adminUsernameEl = document.getElementById('adminUsername');
        const adminPasswordEl = document.getElementById('adminPassword');
        const passwordLabelEl = document.getElementById('passwordLabel');
        
        if (adminIdEl) adminIdEl.value = admin.id || '';
        if (adminUsernameEl) adminUsernameEl.value = admin.username || '';
        if (adminPasswordEl) {
          adminPasswordEl.required = false;
          adminPasswordEl.value = '';
        }
        if (passwordLabelEl) passwordLabelEl.textContent = '(Leave empty to keep unchanged)';
        
        // 设置name字段 - 这是关键
        const nameInput = document.getElementById('adminModalName');
        if (nameInput) {
          // 直接设置值
          nameInput.value = admin.name || '';
          console.log('Setting admin name - admin.name:', admin.name, 'nameInput.value:', nameInput.value, 'nameInput:', nameInput);
          
          // 使用多种方式确保值被设置
          nameInput.setAttribute('value', admin.name || '');
          
          // 触发change和input事件确保值被正确设置
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
          nameInput.dispatchEvent(new Event('change', { bubbles: true }));
          
          // 强制浏览器重新渲染
          nameInput.style.display = 'none';
          nameInput.offsetHeight; // 触发重排
          nameInput.style.display = '';
        } else {
          console.error('adminModalName input element not found after modal shown');
        }
        
        // 设置email字段
        const emailInput = document.getElementById('adminEmail');
        if (emailInput) {
          emailInput.value = admin.email || '';
          emailInput.setAttribute('value', admin.email || '');
          emailInput.dispatchEvent(new Event('input', { bubbles: true }));
          emailInput.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          console.error('adminEmail input element not found after modal shown');
        }
        
        // 设置role和status
        const roleSelect = document.getElementById('adminRole');
        if (roleSelect) {
          roleSelect.value = admin.role || 'admin';
        }
        const statusSelect = document.getElementById('adminStatus');
        if (statusSelect) {
          statusSelect.value = admin.status || 'active';
        }
        
        // 再次验证name字段的值（多次检查）
        setTimeout(() => {
          const nameInputCheck = document.getElementById('adminModalName');
          if (nameInputCheck) {
            console.log('Final check - nameInput.value:', nameInputCheck.value, 'admin.name:', admin.name);
            if (nameInputCheck.value !== (admin.name || '')) {
              console.warn('Name value mismatch! Setting again...');
              nameInputCheck.value = admin.name || '';
              nameInputCheck.setAttribute('value', admin.name || '');
              nameInputCheck.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
        }, 50);
        
        setTimeout(() => {
          const nameInputCheck2 = document.getElementById('adminModalName');
          if (nameInputCheck2) {
            console.log('Second check - nameInput.value:', nameInputCheck2.value);
            if (nameInputCheck2.value !== (admin.name || '')) {
              console.warn('Name value still mismatch! Forcing set...');
              nameInputCheck2.value = admin.name || '';
              nameInputCheck2.setAttribute('value', admin.name || '');
            }
          }
        }, 200);
      });
    });
  } else {
    title.textContent = 'Add Admin';
    document.getElementById('adminForm').reset();
    const adminPasswordEl = document.getElementById('adminPassword');
    if (adminPasswordEl) adminPasswordEl.required = true;
    const passwordLabelEl = document.getElementById('passwordLabel');
    if (passwordLabelEl) passwordLabelEl.textContent = '*';
    const roleSelect = document.getElementById('adminRole');
    if (roleSelect) {
      roleSelect.value = 'admin';
    }
    modal.classList.add('active');
  }
  
  modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeAdminModal() {
  document.getElementById('adminModal').classList.remove('active');
}

async function saveAdmin(e) {
  e.preventDefault();
  
  // 只有super_admin可以管理其他admin
  if (!isSuperAdmin()) {
    showToast('Access denied. Only super admin can manage other admins.', 'error');
    return;
  }
  
  const id = document.getElementById('adminId').value;
  
  // 获取表单值 - 直接从DOM元素获取最新值（不缓存引用）
  const usernameInput = document.getElementById('adminUsername');
  const nameInput = document.getElementById('adminModalName');
  const emailInput = document.getElementById('adminEmail');
  const statusInput = document.getElementById('adminStatus');
  
  if (!usernameInput || !nameInput || !emailInput || !statusInput) {
    console.error('Form elements not found:', { usernameInput, nameInput, emailInput, statusInput });
    showToast('Form elements not found', 'error');
    return;
  }
  
  // 确保获取到正确的值（直接从输入框获取，不缓存）
  const username = usernameInput.value || '';
  const nameValue = nameInput.value ? nameInput.value.trim() : '';
  const emailValue = emailInput.value ? emailInput.value.trim() : '';
  const status = statusInput.value || 'active';
  
  console.log('Saving admin data:', { 
    id, 
    username, 
    name: nameValue, 
    email: emailValue,
    nameInputValue: nameInput.value, // 调试：显示原始值
    nameInputElement: nameInput // 调试：显示元素
  });
  
  const data = {
    username: username,
    name: nameValue, // 确保即使是空字符串也发送
    email: emailValue, // 确保即使是空字符串也发送
    status: status
  };
  
  // 只有super_admin可以设置role
  const roleSelect = document.getElementById('adminRole');
  if (roleSelect) {
    data.role = roleSelect.value;
  }
  
  const password = document.getElementById('adminPassword').value;
  if (password) {
    data.password = password;
  }
  
  try {
    const result = id
      ? await apiPut(`/admin/admins/${id}`, data)
      : await apiPost('/admin/admins', data);
    
    if (result.success) {
      showToast(id ? 'Admin updated successfully' : 'Admin added successfully', 'success');
      closeAdminModal();
      loadAdmins();
    } else {
      showToast(result.message || 'Operation failed', 'error');
    }
  } catch (error) {
    console.error('Failed to save admin:', error);
      showToast('Operation failed', 'error');
  }
}

function editAdmin(admin) {
  showAdminModal(admin);
}

// 删除管理员
async function deleteAdmin(adminId) {
  // 只有super_admin可以管理其他admin
  if (!isSuperAdmin()) {
    showToast('Access denied. Only super admin can manage other admins.', 'error');
    return;
  }
  
  // 确认删除
  const confirmed = await showConfirmDialog(
    'Delete Admin',
    'Are you sure you want to delete this admin? This action cannot be undone.',
    'Delete',
    'Cancel'
  );
  
  if (!confirmed) {
    return;
  }
  
  try {
    const result = await apiDelete(`/admin/admins/${adminId}`);
    
    if (result.success) {
      showToast('Admin deleted successfully', 'success');
      loadAdmins();
    } else {
      showToast(result.message || 'Delete failed', 'error');
    }
  } catch (error) {
    console.error('Failed to delete admin:', error);
    showToast('Delete failed', 'error');
  }
}

// 日志过滤状态
let logsFilterState = {
  page: 1,        // 当前页码
  limit: 30,       // 每页条数
  start_date: '',  // 开始日期
  end_date: '',    // 结束日期
  days: 3,         // 默认显示最近3天（如果未指定日期范围）
  action: '',
  operator: '',
  target_type: '',
  ip_address: '',
  details: ''      // Details模糊匹配
};

// 加载操作日志
async function loadLogs() {
  const container = document.getElementById('logsTab');
  
  try {
    // 获取过滤器选项（用于下拉菜单）
    const optionsResponse = await fetch(`${API_BASE}/admin/logs/filter-options`, { credentials: 'include' });
    const optionsData = await optionsResponse.json();
    const filterOptions = optionsData.success ? optionsData.options : { actions: [], resourceTypes: [], operators: [] };
    
    // 构建查询参数
    const params = new URLSearchParams({
      page: logsFilterState.page.toString(),
      limit: logsFilterState.limit.toString()
    });
    
    // 日期范围（优先使用start_date和end_date）
    if (logsFilterState.start_date && logsFilterState.end_date) {
      params.append('start_date', logsFilterState.start_date);
      params.append('end_date', logsFilterState.end_date);
    } else if (logsFilterState.start_date) {
      params.append('start_date', logsFilterState.start_date);
    } else if (logsFilterState.end_date) {
      params.append('end_date', logsFilterState.end_date);
    } else {
      params.append('days', logsFilterState.days.toString());
    }
    
    // 其他过滤条件
    if (logsFilterState.action) params.append('action', logsFilterState.action);
    if (logsFilterState.operator) params.append('operator', logsFilterState.operator);
    if (logsFilterState.target_type) params.append('target_type', logsFilterState.target_type);
    if (logsFilterState.ip_address) params.append('ip_address', logsFilterState.ip_address);
    if (logsFilterState.details) params.append('details', logsFilterState.details);
    
    const response = await fetch(`${API_BASE}/admin/logs?${params.toString()}`, { credentials: 'include' });
    const data = await response.json();
    
    if (data.success) {
      const logs = data.logs || [];
      const pagination = data.pagination || { page: 1, limit: 30, total: 0, totalPages: 1 };
      
      // 计算日期范围显示文本
      let dateRangeText = '';
      if (logsFilterState.start_date && logsFilterState.end_date) {
        dateRangeText = `${logsFilterState.start_date} to ${logsFilterState.end_date}`;
      } else if (logsFilterState.start_date) {
        dateRangeText = `From ${logsFilterState.start_date}`;
      } else if (logsFilterState.end_date) {
        dateRangeText = `Until ${logsFilterState.end_date}`;
      } else {
        dateRangeText = `Last ${logsFilterState.days} day${logsFilterState.days !== 1 ? 's' : ''}`;
      }
      
      container.innerHTML = `
        <div class="fade-in">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-2xl font-bold text-gray-900">Logs</h2>
            <div class="text-sm text-gray-600">
              ${dateRangeText} | Total: <span class="font-semibold">${pagination.total}</span> logs
            </div>
          </div>
          
          <!-- 过滤器区域 -->
          <div class="bg-white rounded-xl shadow-sm p-6 mb-6">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <!-- 日期范围选择 -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                <input 
                  type="date" 
                  id="logStartDate"
                  value="${logsFilterState.start_date}"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onchange="updateLogDateRange()"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                <input 
                  type="date" 
                  id="logEndDate"
                  value="${logsFilterState.end_date}"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onchange="updateLogDateRange()"
                />
              </div>
              <div class="flex items-end">
                <button 
                  onclick="clearLogDateRange()"
                  class="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Clear Date Range
                </button>
              </div>
              
              <!-- Action Type 下拉菜单 -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Action Type</label>
                <select 
                  id="logActionFilter"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onchange="filterLogsByAction(this.value)"
                >
                  <option value="">All Actions</option>
                  ${filterOptions.actions.map(action => `
                    <option value="${action}" ${logsFilterState.action === action ? 'selected' : ''}>${action}</option>
                  `).join('')}
                </select>
              </div>
              
              <!-- Resource Type 下拉菜单 -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Resource Type</label>
                <select 
                  id="logResourceTypeFilter"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onchange="filterLogsByResourceType(this.value)"
                >
                  <option value="">All Types</option>
                  ${filterOptions.resourceTypes.map(type => `
                    <option value="${type}" ${logsFilterState.target_type === type ? 'selected' : ''}>${type}</option>
                  `).join('')}
                </select>
              </div>
              
              <!-- Operator 下拉菜单 -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Operator</label>
                <select 
                  id="logOperatorFilter"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onchange="filterLogsByOperator(this.value)"
                >
                  <option value="">All Operators</option>
                  ${filterOptions.operators.map(op => `
                    <option value="${op}" ${logsFilterState.operator === op ? 'selected' : ''}>${op}</option>
                  `).join('')}
                </select>
              </div>
              
              <!-- Details 模糊匹配输入框 -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Details (Fuzzy Match)</label>
                <input 
                  type="text" 
                  id="logDetailsFilter"
                  placeholder="Search in details..."
                  value="${logsFilterState.details}"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onkeyup="debounceFilterLogsByDetails(this.value)"
                />
              </div>
              
              <!-- IP Address 模糊匹配输入框 -->
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">IP Address (Fuzzy Match)</label>
                <input 
                  type="text" 
                  id="logIPFilter"
                  placeholder="Search IP address..."
                  value="${logsFilterState.ip_address}"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onkeyup="debounceFilterLogsByIP(this.value)"
                />
              </div>
              
              <!-- 清除所有过滤器 -->
              <div class="flex items-end">
                <button 
                  onclick="clearAllLogFilters()"
                  class="w-full px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Clear All Filters
                </button>
              </div>
            </div>
          </div>
          
          <!-- 日志表格 -->
          <div class="bg-white rounded-xl shadow-sm overflow-hidden">
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operator</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action Type</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Resource Type</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200" id="logsTableBody">
                  ${logs.length === 0 ? 
                    '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No logs found</td></tr>' :
                    logs.map(log => renderLogRow(log)).join('')
                  }
                </tbody>
              </table>
            </div>
            
            <!-- 分页控件 -->
            <div class="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div class="flex items-center justify-between">
                <div class="text-sm text-gray-600">
                  Showing <span class="font-semibold">${(pagination.page - 1) * pagination.limit + 1}</span> to 
                  <span class="font-semibold">${Math.min(pagination.page * pagination.limit, pagination.total)}</span> of 
                  <span class="font-semibold">${pagination.total}</span> logs
                </div>
                
                <div class="flex items-center gap-2">
                  <!-- 上一页按钮 -->
                  <button 
                    onclick="goToLogPage(${pagination.page - 1})"
                    ${pagination.page <= 1 ? 'disabled' : ''}
                    class="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium ${pagination.page <= 1 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50'} transition-colors"
                  >
                    Previous
                  </button>
                  
                  <!-- 页码显示和输入 -->
                  <div class="flex items-center gap-2">
                    <span class="text-sm text-gray-600">Page</span>
                    <input 
                      type="number" 
                      id="logPageInput"
                      min="1" 
                      max="${pagination.totalPages}"
                      value="${pagination.page}"
                      class="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      onkeyup="if(event.key==='Enter') goToLogPage(parseInt(this.value))"
                    />
                    <span class="text-sm text-gray-600">of ${pagination.totalPages}</span>
                  </div>
                  
                  <!-- 下一页按钮 -->
                  <button 
                    onclick="goToLogPage(${pagination.page + 1})"
                    ${pagination.page >= pagination.totalPages ? 'disabled' : ''}
                    class="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium ${pagination.page >= pagination.totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50'} transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = '<div class="text-center py-12 text-red-500">Load failed</div>';
    }
  } catch (error) {
    console.error('加载日志失败:', error);
    container.innerHTML = '<div class="text-center py-12 text-red-500">加载失败</div>';
  }
}

// 渲染日志行
function renderLogRow(log) {
  // 解析操作详情
  let detailsText = '-';
  let detailsObj = null;
  try {
    if (log.details) {
      detailsObj = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
      if (typeof detailsObj === 'object' && detailsObj !== null) {
        detailsText = Object.entries(detailsObj)
          .map(([key, value]) => {
            const keyMap = {
              'action': 'Action',
              'name': 'Name',
              'price': 'Price',
              'count': 'Count',
              'username': 'Username',
              'phone': 'Phone',
              'role': 'Role',
              'isNewUser': 'Is New User',
              'discountRate': 'Discount Rate',
              'orderCount': 'Order Count',
              'status': 'Status'
            };
            const displayKey = keyMap[key] || key;
            return `${displayKey}: ${value}`;
          })
          .join(', ');
      } else {
        detailsText = String(detailsObj);
      }
    }
  } catch (e) {
    detailsText = log.details || '-';
  }
  
  // 操作类型显示
  const actionMap = {
    'CREATE': { text: 'Create', class: 'bg-green-100 text-green-800' },
    'UPDATE': { text: 'Update', class: 'bg-blue-100 text-blue-800' },
    'DELETE': { text: 'Delete', class: 'bg-red-100 text-red-800' },
    'LOGIN': { text: 'Login', class: 'bg-purple-100 text-purple-800' },
    'USER_LOGIN': { text: 'User Login', class: 'bg-indigo-100 text-indigo-800' }
  };
  const actionInfo = actionMap[log.action] || { text: log.action, class: 'bg-gray-100 text-gray-800' };
  
  // 操作者显示
  const operatorName = log.admin_username || (log.action === 'USER_LOGIN' ? 'System' : '-');
  
  return `
    <tr class="hover:bg-gray-50 log-row" 
        data-time="${log.created_at || ''}"
        data-operator="${operatorName.toLowerCase()}"
        data-action="${log.action || ''}"
        data-resource="${(log.target_type || log.resource_type || '').toLowerCase()}"
        data-details="${detailsText.toLowerCase()}"
        data-ip="${log.ip_address || ''}"
    >
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${log.created_at ? new Date(log.created_at).toLocaleString('en-US') : '-'}</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${operatorName}</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm">
        <span class="px-2 py-1 text-xs rounded-full ${actionInfo.class}">
          ${actionInfo.text}
        </span>
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${log.target_type || log.resource_type || '-'}</td>
      <td class="px-6 py-4 text-sm text-gray-700 max-w-md">
        <div class="truncate" title="${detailsText}">${detailsText}</div>
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${log.ip_address || '-'}</td>
    </tr>
  `;
}

// 更新日期范围
function updateLogDateRange() {
  const startDate = document.getElementById('logStartDate').value;
  const endDate = document.getElementById('logEndDate').value;
  
  logsFilterState.start_date = startDate || '';
  logsFilterState.end_date = endDate || '';
  logsFilterState.page = 1; // 重置到第一页
  loadLogs();
}

// 清除日期范围
function clearLogDateRange() {
  logsFilterState.start_date = '';
  logsFilterState.end_date = '';
  logsFilterState.page = 1;
  document.getElementById('logStartDate').value = '';
  document.getElementById('logEndDate').value = '';
  loadLogs();
}

// 清除所有过滤器
function clearAllLogFilters() {
  logsFilterState = {
    page: 1,
    limit: 30,
    start_date: '',
    end_date: '',
    days: 3,
    action: '',
    operator: '',
    target_type: '',
    ip_address: '',
    details: ''
  };
  loadLogs();
}

// 分页函数
function goToLogPage(page) {
  const totalPages = parseInt(document.querySelector('#logPageInput')?.max || 1);
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  
  logsFilterState.page = page;
  loadLogs();
}

// 过滤函数
function filterLogsByAction(value) {
  logsFilterState.action = value || '';
  logsFilterState.page = 1; // 重置到第一页
  loadLogs();
}

function filterLogsByResourceType(value) {
  logsFilterState.target_type = value || '';
  logsFilterState.page = 1;
  loadLogs();
}

function filterLogsByOperator(value) {
  logsFilterState.operator = value || '';
  logsFilterState.page = 1;
  loadLogs();
}

// Details和IP的防抖过滤
let detailsFilterTimeout = null;
function debounceFilterLogsByDetails(value) {
  clearTimeout(detailsFilterTimeout);
  detailsFilterTimeout = setTimeout(() => {
    logsFilterState.details = value || '';
    logsFilterState.page = 1;
    loadLogs();
  }, 500); // 500ms防抖
}

let ipFilterTimeout = null;
function debounceFilterLogsByIP(value) {
  clearTimeout(ipFilterTimeout);
  ipFilterTimeout = setTimeout(() => {
    logsFilterState.ip_address = value || '';
    logsFilterState.page = 1;
    loadLogs();
  }, 500); // 500ms防抖
}

// 加载关于页面
function loadAboutPage() {
  const container = document.getElementById('aboutTab');
  const version = '2.1.0';
  const currentStoreName = storeName || 'BOBA TEA'; // 使用当前商店名称，如果没有则使用默认值
  
  container.innerHTML = `
    <div class="space-y-6">
      <!-- 系统信息 -->
      <div class="bg-white rounded-xl shadow-sm p-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-4">🧋 ${currentStoreName} Ordering System</h2>
        <div class="space-y-4">
          <div>
            <p class="text-sm text-gray-600 mb-2">Version</p>
            <p class="text-lg font-semibold text-gray-900">v${version}</p>
          </div>
          <div>
            <p class="text-sm text-gray-600 mb-2">Description</p>
            <p class="text-gray-700">A comprehensive online ordering system for ${currentStoreName.toLowerCase()} shops with cycle-based order management, discount rules, and payment tracking.</p>
          </div>
        </div>
      </div>

      <!-- 主要功能 -->
      <div class="bg-white rounded-xl shadow-sm p-6">
        <h3 class="text-xl font-bold text-gray-900 mb-4">✨ Main Features</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 class="font-semibold text-gray-900 mb-3">👥 User Features</h4>
            <ul class="list-disc list-inside space-y-1.5 text-sm text-gray-700 ml-2">
              <li>Phone number quick login (no password required)</li>
              <li>Browse menu with category filtering</li>
              <li>Product customization (cup size, sugar, ice, toppings)</li>
              <li>Shopping cart management</li>
              <li>Order creation and tracking</li>
              <li>Payment screenshot upload</li>
              <li>Real-time discount viewing</li>
            </ul>
          </div>
          <div>
            <h4 class="font-semibold text-gray-900 mb-3">🔐 Admin Features</h4>
            <ul class="list-disc list-inside space-y-1.5 text-sm text-gray-700 ml-2">
              <li>Dashboard with statistics</li>
              <li>Menu and category management</li>
              <li>Order management and status updates</li>
              <li>Discount rules configuration</li>
              <li>User and admin management</li>
              <li>Operation logs</li>
              <li>System settings</li>
            </ul>
          </div>
          </div>
          </div>

      <!-- 技术栈 -->
      <div class="bg-white rounded-xl shadow-sm p-6">
        <h3 class="text-xl font-bold text-gray-900 mb-4">🛠️ Technology Stack</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
          <div>
            <h4 class="font-semibold text-gray-900 mb-2">Backend</h4>
            <ul class="list-disc list-inside space-y-1 ml-4">
              <li>Node.js + Express</li>
              <li>SQLite3 (WAL mode)</li>
              <li>bcryptjs (password hashing)</li>
              <li>express-session (session management)</li>
              <li>Winston (logging)</li>
            </ul>
          </div>
          <div>
            <h4 class="font-semibold text-gray-900 mb-2">Frontend</h4>
            <ul class="list-disc list-inside space-y-1 ml-4">
              <li>Vanilla JavaScript</li>
              <li>Tailwind CSS</li>
              <li>Responsive design</li>
            </ul>
          </div>
          </div>
          </div>

      <!-- 安全特性 -->
      <div class="bg-white rounded-xl shadow-sm p-6">
        <h3 class="text-xl font-bold text-gray-900 mb-4">🔒 Security Features</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
          <div>
            <ul class="list-disc list-inside space-y-1 ml-4">
              <li>Password encryption (bcrypt)</li>
              <li>Session-based authentication</li>
              <li>Rate limiting (API protection)</li>
              <li>SQL injection prevention</li>
              <li>XSS protection (Helmet)</li>
            </ul>
          </div>
          <div>
            <ul class="list-disc list-inside space-y-1 ml-4">
              <li>Input validation</li>
              <li>File upload security</li>
              <li>Role-based access control</li>
              <li>HSTS enabled</li>
              <li>Comprehensive logging</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- 数据库备份和恢复 -->
      <div class="bg-white rounded-xl shadow-sm p-6">
        <h3 class="text-xl font-bold text-gray-900 mb-4">💾 Database Backup & Restore</h3>
        <div class="space-y-4">
          <div class="flex flex-wrap gap-3">
            <button onclick="createBackup('db')" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
              Create DB Backup
            </button>
            <button onclick="createBackup('full')" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg">
              Create Full Backup
            </button>
            <button onclick="loadBackupList()" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg">
              Refresh List
            </button>
            <label class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg cursor-pointer">
              <input type="file" id="backupFileInput" accept=".db,.zip" class="hidden" onchange="uploadBackupFile()">
              Upload Backup
            </label>
        </div>
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <p class="font-semibold mb-1">📝 Backup Types:</p>
            <ul class="list-disc list-inside space-y-1">
              <li><strong>DB Backup:</strong> Database only (smaller, faster)</li>
              <li><strong>Full Backup:</strong> Database + all files (products images, payment screenshots, showcase images)</li>
            </ul>
          </div>
          <div id="backupUploadStatus" class="hidden"></div>
          <div id="backupList" class="space-y-2">
            <p class="text-gray-500 text-sm">Loading backup list...</p>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // 等待 DOM 渲染完成后再加载数据
  setTimeout(() => {
    // 加载备份列表
    loadBackupList();
  }, 100);
}

// ==================== 开发者工具 ====================

let currentTableName = null;
let tableData = [];
let tableSchema = [];
let editedRows = new Set();
let deletedRows = new Set();
let newRows = [];

// 数据库表说明映射
const tableDescriptions = {
  'admins': 'Administrator accounts and login credentials',
  'users': 'Customer user accounts (phone-based identification)',
  'categories': 'Product categories for menu organization',
  'products': 'Menu items/products with prices, sizes, and customization options',
  'discount_rules': 'Discount rules based on total order amount thresholds',
  'settings': 'System configuration settings (store name, currency, ordering status, etc.)',
  'orders': 'Customer orders with payment status and cycle information',
  'order_items': 'Individual items within each order (products, quantities, customizations like size, sugar level, ice level, toppings)',
  'logs': 'System operation logs for admin actions and user activities',
  'ordering_cycles': 'Ordering cycle management (start/end times, total amounts, discount rates)'
};

// 加载开发者页面
async function loadDeveloperPage() {
  // 检查当前激活的Developer子标签
  const dbTab = document.getElementById('developerDbTab');
  const fileTab = document.getElementById('developerFileTab');
  const testTab = document.getElementById('developerTestTab');
  
  // 检查哪个子标签是激活的（通过样式判断）
  let activeSubTab = 'db';
  if (testTab && testTab.classList.contains('bg-blue-600')) {
    activeSubTab = 'tests';
  } else if (fileTab && fileTab.classList.contains('bg-blue-600')) {
    activeSubTab = 'files';
  }
  
  // 如果已经有激活的子标签，保持当前状态
  if (activeSubTab === 'tests') {
    // 确保测试内容可见
    const testContent = document.getElementById('developerTestContent');
    if (testContent) {
      testContent.classList.remove('hidden');
    }
    if (!window.testSuitesLoaded) {
      loadTestSuites();
      window.testSuitesLoaded = true;
    }
  } else if (activeSubTab === 'files') {
    // 确保文件内容可见
    const fileContent = document.getElementById('developerFileContent');
    if (fileContent) {
      fileContent.classList.remove('hidden');
    }
    if (currentFileManagerPath === '') {
      loadFileManager('/');
    }
  } else {
    // 默认显示数据库表标签
    switchDeveloperTab('db');
    // 确保db内容可见
    const dbContent = document.getElementById('developerDbContent');
    if (dbContent) {
      dbContent.classList.remove('hidden');
    }
    await loadTablesList();
  }
}

// 加载数据库表列表
async function loadTablesList() {
  try {
    const container = document.getElementById('tablesList');
    if (!container) {
      console.error('tablesList container not found');
      return;
    }
    
    // 显示加载状态
    container.innerHTML = '<div class="text-center py-4 text-gray-500 text-xs">Loading tables...</div>';
    
    const response = await fetch(`${API_BASE}/admin/developer/tables`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.success && data.tables) {
      if (data.tables.length === 0) {
        container.innerHTML = '<div class="text-center py-4 text-gray-500 text-xs">No tables found</div>';
      } else {
        container.innerHTML = data.tables.map(table => {
          const description = tableDescriptions[table.name] || 'Database table';
          return `
          <div class="mb-0.5">
            <div 
              class="table-item px-2 py-1 rounded cursor-pointer hover:bg-gray-100 transition"
              ondblclick="loadTableData('${table.name}')"
              onclick="toggleTableItem(this)"
            >
              <div class="flex items-center justify-between mb-0.5">
                <span class="text-xs font-medium text-gray-700">${table.name}</span>
                <span class="text-xs text-gray-500">${table.rowCount}</span>
              </div>
              <div class="text-xs text-gray-400 leading-tight">${description}</div>
            </div>
          </div>
        `;
        }).join('');
      }
    } else {
      container.innerHTML = '<div class="text-center py-4 text-red-500 text-xs">Failed to load tables: ' + (data.message || 'Unknown error') + '</div>';
    }
  } catch (error) {
    console.error('加载表列表失败:', error);
    const container = document.getElementById('tablesList');
    if (container) {
      container.innerHTML = '<div class="text-center py-4 text-red-500 text-xs">Error loading tables: ' + error.message + '</div>';
    }
  }
}

// 切换表项（用于展开/收缩，当前简单实现）
function toggleTableItem(element) {
  // 可以在这里添加展开/收缩逻辑
}

// 加载表数据
async function loadTableData(tableName) {
  try {
    currentTableName = tableName;
    editedRows.clear();
    deletedRows.clear();
    newRows = [];
    
    // 加载表结构和数据
    const [schemaResponse, dataResponse] = await Promise.all([
      fetch(`${API_BASE}/admin/developer/table-schema/${tableName}`, { credentials: 'include' }),
      fetch(`${API_BASE}/admin/developer/table-data/${tableName}`, { credentials: 'include' })
    ]);
    
    const schemaData = await schemaResponse.json();
    const dataData = await dataResponse.json();
    
    if (schemaData.success && dataData.success) {
      tableSchema = schemaData.schema;
      tableData = dataData.data;
      
      // 更新UI
      document.getElementById('currentTableName').textContent = tableName;
      document.getElementById('tableInfo').textContent = `${tableData.length} rows × ${tableSchema.length} cols`;
      document.getElementById('saveTableBtn').classList.remove('hidden');
      
      renderTableData();
    }
  } catch (error) {
    console.error('加载表数据失败:', error);
    showToast('Failed to load table data', 'error');
  }
}

// 渲染表数据
function renderTableData() {
  const container = document.getElementById('tableDataContainer');
  
  if (tableData.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded shadow p-3 text-center">
        <p class="text-xs text-gray-500">No data in this table</p>
        <button onclick="addNewRow()" class="mt-2 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition">
          Add New Row
        </button>
      </div>
    `;
    return;
  }
  
  // 生成表头
  const headers = tableSchema.map(col => `
    <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
      ${col.name}
      <div class="text-xs text-gray-400 font-normal">${col.type || ''}</div>
    </th>
  `).join('');
  
  // 生成表行
  const rows = tableData.map((row, rowIndex) => {
    const isDeleted = deletedRows.has(rowIndex);
    const isEdited = editedRows.has(rowIndex);
    const rowClass = isDeleted ? 'bg-red-50 opacity-50' : isEdited ? 'bg-yellow-50' : '';
    
    const cells = tableSchema.map(col => {
      let value = row[col.name];
      // 处理 null 和 undefined
      if (value === null || value === undefined) {
        value = '';
      } else if (typeof value === 'object') {
        // 如果是对象，转换为JSON字符串
        value = JSON.stringify(value);
      } else {
        // 转换为字符串
        value = String(value);
      }
      
      const isPrimaryKey = col.pk === 1;
      // 更宽松的TEXT类型判断：检查类型字符串或字段名
      const colType = (col.type || '').toUpperCase();
      const colName = (col.name || '').toLowerCase();
      const isTextType = colType.includes('TEXT') || 
                        colType.includes('VARCHAR') || 
                        colType.includes('CHAR') ||
                        colType === '' || // SQLite中某些TEXT字段可能type为空
                        colName.includes('description') ||
                        colName.includes('details') ||
                        colName.includes('notes') ||
                        colName.includes('toppings') ||
                        colName.includes('sizes') ||
                        colName.includes('size') ||
                        colName.includes('ice_level') ||
                        colName.includes('sugar_level');
      const isLongText = value.length > 50; // 降低阈值，更早使用textarea
      
      if (isDeleted) {
        return `<td class="px-2 py-1 border-b border-gray-200 text-xs text-gray-500 line-through whitespace-nowrap">${escapeHtml(value)}</td>`;
      }
      
      if (isPrimaryKey) {
        return `<td class="px-2 py-1 border-b border-gray-200 text-xs text-gray-900 font-medium whitespace-nowrap">${escapeHtml(value)}</td>`;
      }
      
      // 对于长文本或TEXT类型，使用textarea
      if (isTextType || isLongText) {
        // 计算合适的行数，确保能显示完整内容
        const estimatedRows = value.length > 0 ? Math.min(Math.max(1, Math.ceil(value.length / 50)), 6) : 1;
        return `<td class="px-2 py-1 border-b border-gray-200">
          <textarea 
            class="w-full px-1 py-0.5 border border-gray-300 rounded text-xs resize-y"
            rows="${estimatedRows}"
            style="min-height: 40px; max-height: 150px;"
            onchange="markRowEdited(${rowIndex})"
            data-row="${rowIndex}"
            data-column="${col.name}"
          >${escapeHtml(value)}</textarea>
        </td>`;
      }
      
      return `<td class="px-2 py-1 border-b border-gray-200">
        <input 
          type="text" 
          value="${escapeHtml(value)}" 
          class="w-full px-1 py-0.5 border border-gray-300 rounded text-xs"
          onchange="markRowEdited(${rowIndex})"
          data-row="${rowIndex}"
          data-column="${col.name}"
        />
      </td>`;
    }).join('');
    
    return `
      <tr class="${rowClass}">
        ${cells}
        <td class="px-2 py-1 border-b border-gray-200">
          <button 
            onclick="deleteRow(${rowIndex})" 
            class="px-1.5 py-0.5 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition"
          >
            Del
          </button>
        </td>
      </tr>
    `;
  }).join('');
  
  // 新行
  const newRowsHtml = newRows.map((newRow, newRowIndex) => {
    const cells = tableSchema.map(col => {
      const isPrimaryKey = col.pk === 1;
      let value = newRow[col.name] || '';
      if (typeof value === 'object') {
        value = JSON.stringify(value);
      } else {
        value = String(value);
      }
      
      // 更宽松的TEXT类型判断：检查类型字符串或字段名
      const colType = (col.type || '').toUpperCase();
      const colName = (col.name || '').toLowerCase();
      const isTextType = colType.includes('TEXT') || 
                        colType.includes('VARCHAR') || 
                        colType.includes('CHAR') ||
                        colType === '' || // SQLite中某些TEXT字段可能type为空
                        colName.includes('description') ||
                        colName.includes('details') ||
                        colName.includes('notes') ||
                        colName.includes('toppings') ||
                        colName.includes('sizes') ||
                        colName.includes('size') ||
                        colName.includes('ice_level') ||
                        colName.includes('sugar_level');
      
      if (isPrimaryKey) {
        return `<td class="px-2 py-1 border-b border-gray-200 text-xs text-gray-500 italic whitespace-nowrap">Auto</td>`;
      }
      
      // 对于TEXT类型，使用textarea
      if (isTextType) {
        const estimatedRows = value.length > 0 ? Math.min(Math.max(1, Math.ceil(value.length / 50)), 6) : 1;
        return `<td class="px-2 py-1 border-b border-gray-200">
          <textarea 
            class="w-full px-1 py-0.5 border border-green-300 rounded text-xs bg-green-50 resize-y"
            rows="${estimatedRows}"
            style="min-height: 40px; max-height: 150px;"
            onchange="updateNewRow(${newRowIndex}, '${col.name}', this.value)"
            data-new-row="${newRowIndex}"
            data-column="${col.name}"
          >${escapeHtml(value)}</textarea>
        </td>`;
      }
      
      return `<td class="px-2 py-1 border-b border-gray-200">
        <input 
          type="text" 
          value="${escapeHtml(value)}" 
          class="w-full px-1 py-0.5 border border-green-300 rounded text-xs bg-green-50"
          onchange="updateNewRow(${newRowIndex}, '${col.name}', this.value)"
          data-new-row="${newRowIndex}"
          data-column="${col.name}"
        />
      </td>`;
    }).join('');
    
    return `
      <tr class="bg-green-50">
        ${cells}
        <td class="px-2 py-1 border-b border-gray-200">
          <button 
            onclick="removeNewRow(${newRowIndex})" 
            class="px-1.5 py-0.5 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition"
          >
            Cancel
          </button>
        </td>
      </tr>
    `;
  }).join('');
  
  container.innerHTML = `
    <div class="bg-white rounded shadow overflow-hidden">
      <div class="p-2 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 class="text-xs font-semibold text-gray-900">Table Data</h3>
          <p class="text-xs text-gray-500 mt-0.5">
            ${editedRows.size} edited, ${deletedRows.size} deleted, ${newRows.length} new
          </p>
        </div>
        <button onclick="addNewRow()" class="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition">
          + Add Row
        </button>
      </div>
      <div style="overflow-x: scroll; overflow-y: scroll; max-height: calc(100vh - 200px);">
        <table class="min-w-full divide-y divide-gray-200" style="min-width: max-content;">
          <thead class="bg-gray-50 sticky top-0 z-10">
            <tr>
              ${headers}
              <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase bg-gray-50 border-b border-gray-200 sticky right-0 bg-gray-50">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            ${rows}
            ${newRowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 转义HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 标记行已编辑
function markRowEdited(rowIndex) {
  editedRows.add(rowIndex);
  updateRowStyle(rowIndex);
}

// 更新行样式
function updateRowStyle(rowIndex) {
  const inputs = document.querySelectorAll(`input[data-row="${rowIndex}"], textarea[data-row="${rowIndex}"]`);
  inputs.forEach(input => {
    const row = input.closest('tr');
    if (deletedRows.has(rowIndex)) {
      row.className = 'bg-red-50 opacity-50';
    } else if (editedRows.has(rowIndex)) {
      row.className = 'bg-yellow-50';
    }
  });
}

// 删除行
function deleteRow(rowIndex) {
  showConfirmDialog(
    'Delete Row',
    'Are you sure you want to delete this row?',
    'Delete',
    'Cancel'
  ).then(confirmed => {
    if (confirmed) {
      deletedRows.add(rowIndex);
      editedRows.delete(rowIndex);
      renderTableData();
    }
  });
}

// 添加新行
function addNewRow() {
  const newRow = {};
  tableSchema.forEach(col => {
    if (col.pk !== 1) {
      newRow[col.name] = '';
    }
  });
  newRows.push(newRow);
  renderTableData();
}

// 更新新行数据
function updateNewRow(newRowIndex, column, value) {
  if (newRows[newRowIndex]) {
    newRows[newRowIndex][column] = value;
  }
  // 标记为已编辑（虽然这是新行，但可以用于跟踪）
}

// 移除新行
function removeNewRow(newRowIndex) {
  newRows.splice(newRowIndex, 1);
  renderTableData();
}

// 保存表更改
async function saveTableChanges() {
  if (editedRows.size === 0 && deletedRows.size === 0 && newRows.length === 0) {
    showToast('No changes to save', 'info');
    return;
  }
  
  const confirmed = await showConfirmDialog(
    'Save Changes',
    `Save changes? ${editedRows.size} edited, ${deletedRows.size} deleted, ${newRows.length} new rows`,
    'Save',
    'Cancel'
  );
  
  if (!confirmed) return;
  
  try {
    // 收集更改
    const changes = {
      updates: [],
      deletes: [],
      inserts: []
    };
    
    // 收集更新的行
    editedRows.forEach(rowIndex => {
      if (!deletedRows.has(rowIndex)) {
        const row = tableData[rowIndex];
        const updatedRow = {};
        tableSchema.forEach(col => {
          const input = document.querySelector(`input[data-row="${rowIndex}"][data-column="${col.name}"], textarea[data-row="${rowIndex}"][data-column="${col.name}"]`);
          if (input) {
            updatedRow[col.name] = input.value;
          } else {
            updatedRow[col.name] = row[col.name];
          }
        });
        changes.updates.push(updatedRow);
      }
    });
    
    // 收集删除的行
    deletedRows.forEach(rowIndex => {
      const row = tableData[rowIndex];
      const primaryKey = tableSchema.find(col => col.pk === 1);
      if (primaryKey) {
        changes.deletes.push(row[primaryKey.name]);
      }
    });
    
    // 收集新插入的行
    changes.inserts = newRows;
    
    const response = await fetch(`${API_BASE}/admin/developer/table-data/${currentTableName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(changes)
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Changes saved successfully', 'success');
      // 重新加载数据
      await loadTableData(currentTableName);
    } else {
      showToast('Failed to save changes: ' + (data.message || 'Unknown error'), 'error');
    }
  } catch (error) {
    console.error('保存失败:', error);
    showToast('Failed to save changes', 'error');
  }
}

// 显示SQL模态框
function showSqlModal() {
  document.getElementById('sqlModal').classList.add('active');
  document.getElementById('sqlQuery').value = '';
  document.getElementById('sqlResult').classList.add('hidden');
}

// 关闭SQL模态框
function closeSqlModal(event) {
  if (!event || event.target.id === 'sqlModal') {
    document.getElementById('sqlModal').classList.remove('active');
  }
}

// 执行SQL查询
async function executeSqlQuery() {
  const sql = document.getElementById('sqlQuery').value.trim();
  
  if (!sql) {
    showToast('Please enter a SQL query', 'warning');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/admin/developer/execute-sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ sql })
    });
    
    const data = await response.json();
    
    const resultDiv = document.getElementById('sqlResult');
    const resultContent = document.getElementById('sqlResultContent');
    
    if (data.success) {
      resultContent.textContent = JSON.stringify(data.result, null, 2);
      resultDiv.classList.remove('hidden');
    } else {
      resultContent.textContent = 'Error: ' + (data.message || 'Unknown error');
      resultDiv.classList.remove('hidden');
    }
  } catch (error) {
    console.error('执行SQL失败:', error);
    showToast('Failed to execute SQL query', 'error');
  }
}


// 创建数据库备份
async function createBackup(type = 'db') {
  try {
    const backupType = type === 'full' ? 'Full' : 'Database';
    showGlobalLoading(`Creating ${backupType.toLowerCase()} backup...`);
    
    const response = await fetch(`${API_BASE}/admin/backup/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ type: type })
    });
    
    const data = await response.json();
    hideGlobalLoading();
    
    if (data.success) {
      showToast(`${backupType} backup created successfully: ${data.fileName} (${data.sizeMB}MB)`, 'success');
      loadBackupList();
    } else {
      showToast(data.message || 'Backup failed', 'error');
    }
  } catch (error) {
    hideGlobalLoading();
    console.error('Create backup failed:', error);
    showToast('Create backup failed', 'error');
  }
}

// 加载备份列表
async function loadBackupList() {
  const container = document.getElementById('backupList');
  if (!container) return;
  
  try {
    const response = await fetch(`${API_BASE}/admin/backup/list`, {
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.success) {
      const backups = data.backups || [];
      
      if (backups.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No backups found</p>';
        return;
      }
      
      container.innerHTML = `
        <div class="space-y-2">
          ${backups.map(backup => {
            const typeBadge = backup.type === 'full' 
              ? '<span class="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs font-semibold rounded">FULL</span>'
              : '<span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">DB</span>';
            return `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  ${typeBadge}
                  <p class="font-medium text-gray-900">${backup.fileName}</p>
                </div>
                <p class="text-sm text-gray-500">
                  ${backup.sizeMB}MB • ${new Date(backup.created).toLocaleString()}
                </p>
              </div>
              <div class="flex space-x-2">
                <button onclick="downloadBackup('${backup.fileName}')" 
                        class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">
                  Download
                </button>
                <button onclick="restoreBackup('${backup.fileName}')" 
                        class="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm">
                  Restore
                </button>
                <button onclick="deleteBackupFile('${backup.fileName}')" 
                        class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm">
                  Delete
                </button>
              </div>
            </div>
          `;
          }).join('')}
        </div>
      `;
    } else {
      container.innerHTML = '<p class="text-red-500 text-sm">Failed to load backup list</p>';
    }
  } catch (error) {
    console.error('Load backup list failed:', error);
    container.innerHTML = '<p class="text-red-500 text-sm">Failed to load backup list</p>';
  }
}

// 下载备份文件
async function downloadBackup(fileName) {
  try {
    const response = await fetch(`${API_BASE}/admin/backup/download/${encodeURIComponent(fileName)}`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      const data = await response.json();
      showToast(data.message || 'Download failed', 'error');
      return;
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    showToast('Backup downloaded successfully', 'success');
  } catch (error) {
    console.error('Download backup failed:', error);
    showToast('Download failed', 'error');
  }
}

// 恢复数据库
async function restoreBackup(fileName) {
  const confirmed = await showConfirmDialog(
    'Restore Database',
    `Are you sure you want to restore from "${fileName}"? This will replace the current database. A backup of the current database will be created automatically.`,
    'Restore',
    'Cancel'
  );
  
  if (!confirmed) return;
  
  try {
    showGlobalLoading('Restoring database... This may take a moment.');
    
    const response = await fetch(`${API_BASE}/admin/backup/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ fileName })
    });
    
    const data = await response.json();
    hideGlobalLoading();
    
    if (data.success) {
      showToast('Database restored successfully. Please refresh the page.', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } else {
      showToast(data.message || 'Restore failed', 'error');
    }
  } catch (error) {
    hideGlobalLoading();
    console.error('Restore backup failed:', error);
    showToast('Restore failed', 'error');
  }
}

// 删除备份文件
async function deleteBackupFile(fileName) {
  const confirmed = await showConfirmDialog(
    'Delete Backup',
    `Are you sure you want to delete "${fileName}"?`,
    'Delete',
    'Cancel'
  );
  
  if (!confirmed) return;
  
  try {
    const response = await fetch(`${API_BASE}/admin/backup/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ fileName })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Backup deleted successfully', 'success');
      loadBackupList();
    } else {
      showToast(data.message || 'Delete failed', 'error');
    }
  } catch (error) {
    console.error('Delete backup failed:', error);
    showToast('Delete failed', 'error');
  }
}

// 上传备份文件
async function uploadBackupFile() {
  const fileInput = document.getElementById('backupFileInput');
  const statusDiv = document.getElementById('backupUploadStatus');
  
  if (!fileInput.files || fileInput.files.length === 0) {
    return;
  }
  
  const file = fileInput.files[0];
  
  // 验证文件类型（支持 .db 和 .zip）
  if (!file.name.endsWith('.db') && !file.name.endsWith('.zip')) {
    showToast('Only .db or .zip backup files are allowed', 'error');
    fileInput.value = '';
    return;
  }
  
  // 验证文件大小（500MB限制，完整备份可能较大）
  if (file.size > 500 * 1024 * 1024) {
    showToast('File size exceeds 500MB limit', 'error');
    fileInput.value = '';
    return;
  }
  
  try {
    showGlobalLoading(`Uploading backup file: ${file.name}...`);
    statusDiv.classList.remove('hidden');
    statusDiv.innerHTML = `<p class="text-blue-600 text-sm">Uploading ${file.name}...</p>`;
    
    const formData = new FormData();
    formData.append('backupFile', file);
    
    const response = await fetch(`${API_BASE}/admin/backup/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    
    const data = await response.json();
    hideGlobalLoading();
    
    if (data.success) {
      statusDiv.innerHTML = `<p class="text-green-600 text-sm">✓ Upload successful: ${data.fileName} (${data.sizeMB}MB)</p>`;
      showToast(`Backup uploaded successfully: ${data.fileName} (${data.sizeMB}MB)`, 'success');
      fileInput.value = '';
      loadBackupList();
      
      // 3秒后隐藏状态信息
      setTimeout(() => {
        statusDiv.classList.add('hidden');
        statusDiv.innerHTML = '';
      }, 3000);
    } else {
      statusDiv.innerHTML = `<p class="text-red-600 text-sm">✗ Upload failed: ${data.message}</p>`;
      showToast(data.message || 'Upload failed', 'error');
      fileInput.value = '';
    }
  } catch (error) {
    hideGlobalLoading();
    statusDiv.innerHTML = `<p class="text-red-600 text-sm">✗ Upload failed: ${error.message}</p>`;
    console.error('Upload backup failed:', error);
    showToast('Upload failed', 'error');
    fileInput.value = '';
  }
}

// ==================== 远程备份功能 ====================

// 更新计划字段显示
function updateScheduleFields() {
  const scheduleType = document.getElementById('remoteBackupConfigScheduleType').value;
  const timeField = document.getElementById('scheduleTimeField');
  const dayField = document.getElementById('scheduleDayField');
  const dayLabel = document.getElementById('scheduleDayLabel');
  const dayHint = document.getElementById('scheduleDayHint');
  
  if (scheduleType === 'hourly' || scheduleType === 'manual') {
    timeField.classList.add('hidden');
    dayField.classList.add('hidden');
  } else {
    timeField.classList.remove('hidden');
    if (scheduleType === 'daily') {
      dayField.classList.add('hidden');
    } else {
      dayField.classList.remove('hidden');
      if (scheduleType === 'weekly') {
        dayLabel.textContent = 'Day of Week (0=Sunday, 6=Saturday)';
        dayHint.textContent = 'For weekly: 0=Sunday, 1=Monday, ..., 6=Saturday';
        document.getElementById('remoteBackupConfigScheduleDay').min = 0;
        document.getElementById('remoteBackupConfigScheduleDay').max = 6;
      } else if (scheduleType === 'monthly') {
        dayLabel.textContent = 'Day of Month (1-31)';
        dayHint.textContent = 'For monthly: 1-31 (day of the month)';
        document.getElementById('remoteBackupConfigScheduleDay').min = 1;
        document.getElementById('remoteBackupConfigScheduleDay').max = 31;
      }
    }
  }
}

// 显示远程备份配置模态框
function showRemoteBackupConfigModal(config = null) {
  const modal = document.getElementById('remoteBackupConfigModal');
  const form = document.getElementById('remoteBackupConfigForm');
  const title = document.getElementById('remoteBackupConfigModalTitle');
  
  if (config) {
    title.textContent = 'Edit Push Configuration';
    document.getElementById('remoteBackupConfigId').value = config.id;
    document.getElementById('remoteBackupConfigName').value = config.name;
    document.getElementById('remoteBackupConfigUrl').value = config.target_url;
    document.getElementById('remoteBackupConfigToken').value = config.api_token;
    document.getElementById('remoteBackupConfigScheduleType').value = config.schedule_type || 'manual';
    document.getElementById('remoteBackupConfigScheduleTime').value = config.schedule_time || '';
    document.getElementById('remoteBackupConfigScheduleDay').value = config.schedule_day || '';
    document.getElementById('remoteBackupConfigEnabled').checked = config.enabled;
    updateScheduleFields();
  } else {
    title.textContent = 'Add Push Configuration';
    form.reset();
    document.getElementById('remoteBackupConfigId').value = '';
    document.getElementById('remoteBackupConfigEnabled').checked = true;
    updateScheduleFields();
  }
  
  modal.classList.add('active');
}

// 关闭远程备份配置模态框
function closeRemoteBackupConfigModal(event) {
  if (!event || event.target.id === 'remoteBackupConfigModal') {
    document.getElementById('remoteBackupConfigModal').classList.remove('active');
  }
}

// 加载远程备份配置列表
async function loadRemoteBackupConfigs() {
  const container = document.getElementById('remoteBackupConfigsList');
  if (!container) return;
  
  try {
    const response = await fetch(`${API_BASE}/admin/remote-backup/configs`, {
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.success) {
      const configs = data.configs || [];
      
      if (configs.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No push configurations. Click "+ Add Push Config" to create one.</p>';
        return;
      }
      
      container.innerHTML = configs.map(config => {
        const scheduleText = config.schedule_type === 'manual' ? 'Manual Only' :
          config.schedule_type === 'hourly' ? 'Every Hour' :
          config.schedule_type === 'daily' ? `Daily at ${config.schedule_time || 'N/A'}` :
          config.schedule_type === 'weekly' ? `Weekly on ${getDayName(config.schedule_day)} at ${config.schedule_time || 'N/A'}` :
          config.schedule_type === 'monthly' ? `Monthly on day ${config.schedule_day} at ${config.schedule_time || 'N/A'}` :
          'Unknown';
        
        return `
          <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-2">
                  <h5 class="font-semibold text-gray-900">${config.name}</h5>
                  ${config.enabled ? 
                    '<span class="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">Enabled</span>' :
                    '<span class="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-semibold rounded">Disabled</span>'
                  }
                </div>
                <p class="text-sm text-gray-600 mb-1"><strong>Target:</strong> ${config.target_url}</p>
                <p class="text-sm text-gray-600"><strong>Schedule:</strong> ${scheduleText}</p>
              </div>
              <div class="flex space-x-2 ml-4">
                <button onclick="triggerManualPush(${config.id})" 
                        class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">
                  Push Now
                </button>
                <button onclick="showRemoteBackupConfigModal(${JSON.stringify(config).replace(/"/g, '&quot;')})" 
                        class="px-3 py-1 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-sm">
                  Edit
                </button>
                <button onclick="deleteRemoteBackupConfig(${config.id})" 
                        class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm">
                  Delete
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = '<p class="text-red-500 text-sm">Failed to load configurations</p>';
    }
  } catch (error) {
    console.error('Load remote backup configs failed:', error);
    container.innerHTML = '<p class="text-red-500 text-sm">Failed to load configurations</p>';
  }
}

// 获取星期名称
function getDayName(day) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[day] || `Day ${day}`;
}

// 保存远程备份配置
async function saveRemoteBackupConfig() {
  const id = document.getElementById('remoteBackupConfigId')?.value || '';
  const name = document.getElementById('remoteBackupConfigName')?.value || '';
  const targetUrl = document.getElementById('remoteBackupConfigUrl')?.value || '';
  const apiToken = document.getElementById('remoteBackupConfigToken')?.value || '';
  const scheduleType = document.getElementById('remoteBackupConfigScheduleType')?.value || 'manual';
  const scheduleTime = document.getElementById('remoteBackupConfigScheduleTime')?.value || '';
  const scheduleDay = document.getElementById('remoteBackupConfigScheduleDay')?.value || '';
  const enabled = document.getElementById('remoteBackupConfigEnabled')?.checked || false;
  
  // 基本验证
  if (!name || !name.trim()) {
    showToast('Name is required', 'error');
    return;
  }
  
  if (!targetUrl || !targetUrl.trim()) {
    showToast('Target URL is required', 'error');
    return;
  }
  
  if (!apiToken || !apiToken.trim()) {
    showToast('API Token is required', 'error');
    return;
  }
  
  // 验证URL格式
  try {
    new URL(targetUrl);
  } catch (e) {
    showToast('Invalid URL format', 'error');
    return;
  }
  
  try {
    showGlobalLoading('Saving configuration...');
    
    const url = id ? 
      `${API_BASE}/admin/remote-backup/configs/${id}` :
      `${API_BASE}/admin/remote-backup/configs`;
    
    const response = await fetch(url, {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: name.trim(),
        target_url: targetUrl.trim(),
        api_token: apiToken.trim(),
        schedule_type: scheduleType,
        schedule_time: scheduleTime || null,
        schedule_day: scheduleDay ? parseInt(scheduleDay) : null,
        enabled
      })
    });
    
    const data = await response.json();
    hideGlobalLoading();
    
    if (data.success) {
      showToast('Configuration saved successfully', 'success');
      closeRemoteBackupConfigModal();
      // 重新加载配置列表（如果在 Settings 或 About 页面）
      if (document.getElementById('remoteBackupConfigsList')) {
        loadRemoteBackupConfigs();
      }
    } else {
      showToast(data.message || 'Save failed', 'error');
    }
  } catch (error) {
    hideGlobalLoading();
    console.error('Save remote backup config failed:', error);
    showToast('Save failed: ' + (error.message || 'Network error'), 'error');
  }
}

// 删除远程备份配置
async function deleteRemoteBackupConfig(id) {
  const confirmed = await showConfirmDialog(
    'Delete Push Configuration',
    'Are you sure you want to delete this push configuration? This action cannot be undone.'
  );
  
  if (!confirmed) return;
  
  try {
    const response = await fetch(`${API_BASE}/admin/remote-backup/configs/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Configuration deleted successfully', 'success');
      loadRemoteBackupConfigs();
    } else {
      showToast(data.message || 'Delete failed', 'error');
    }
  } catch (error) {
    console.error('Delete remote backup config failed:', error);
    showToast('Delete failed', 'error');
  }
}

// 手动触发推送
async function triggerManualPush(configId) {
  const confirmed = await showConfirmDialog(
    'Trigger Manual Push',
    'Are you sure you want to trigger a manual push now? This will create a full backup and push it to the target site.'
  );
  
  if (!confirmed) return;
  
  try {
    showGlobalLoading('Triggering manual push...');
    
    const response = await fetch(`${API_BASE}/admin/remote-backup/configs/${configId}/push`, {
      method: 'POST',
      credentials: 'include'
    });
    
    const data = await response.json();
    hideGlobalLoading();
    
    if (data.success) {
      showToast('Push started. Check logs for status.', 'success');
      setTimeout(() => loadPushLogs(), 2000);
    } else {
      showToast(data.message || 'Push failed', 'error');
    }
  } catch (error) {
    hideGlobalLoading();
    console.error('Trigger manual push failed:', error);
    showToast('Push failed', 'error');
  }
}

// 切换接收 API Token 的显示/隐藏
function toggleReceiveApiTokenVisibility() {
  const tokenInput = document.getElementById('receiveApiToken');
  const toggleText = document.getElementById('receiveApiTokenToggleText');
  const originalToken = document.getElementById('receiveApiTokenOriginal')?.value || '';
  
  if (!tokenInput) return;
  
  const currentValue = tokenInput.value;
  const isPassword = tokenInput.type === 'password';
  
  if (isPassword) {
    // 显示明文
    // 如果当前值是掩码值（前3个字符+星号），则显示原始值
    if (originalToken && currentValue && currentValue.length > 3 && currentValue.endsWith('***')) {
      tokenInput.value = originalToken;
    }
    tokenInput.type = 'text';
    toggleText.textContent = 'Hide';
  } else {
    // 隐藏为密码
    // 如果当前值是原始值，保存到隐藏字段，然后显示掩码
    if (originalToken && currentValue === originalToken) {
      tokenInput.value = maskApiToken(originalToken);
    } else if (currentValue && !currentValue.endsWith('***')) {
      // 如果用户修改了值，保存新值
      document.getElementById('receiveApiTokenOriginal').value = currentValue;
    }
    tokenInput.type = 'password';
    toggleText.textContent = 'Show';
  }
}

// 掩码 API Token（只显示前3个字符）
function maskApiToken(token) {
  if (!token || token.length <= 3) {
    return '***';
  }
  return token.substring(0, 3) + '***';
}

// 加载接收配置
async function loadReceiveConfig() {
  try {
    const response = await fetch(`${API_BASE}/admin/remote-backup/receive-config`, {
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.success && data.config) {
      const apiToken = data.config.api_token || '';
      const tokenInput = document.getElementById('receiveApiToken');
      const originalInput = document.getElementById('receiveApiTokenOriginal');
      const toggleText = document.getElementById('receiveApiTokenToggleText');
      
      if (tokenInput && originalInput) {
        // 保存原始值到隐藏字段
        originalInput.value = apiToken;
        
        // 显示掩码值（前3个字符+星号）
        if (apiToken) {
          tokenInput.value = maskApiToken(apiToken);
          tokenInput.type = 'password';
          if (toggleText) {
            toggleText.textContent = 'Show';
          }
        } else {
          tokenInput.value = '';
        }
      }
      
      const autoRestoreCheckbox = document.getElementById('receiveAutoRestore');
      if (autoRestoreCheckbox) {
        autoRestoreCheckbox.checked = data.config.auto_restore || false;
      }
    }
  } catch (error) {
    console.error('Load receive config failed:', error);
  }
}

// 保存接收配置
async function saveReceiveConfig() {
  const tokenInput = document.getElementById('receiveApiToken');
  const originalInput = document.getElementById('receiveApiTokenOriginal');
  const autoRestore = document.getElementById('receiveAutoRestore')?.checked || false;
  
  if (!tokenInput) {
    showToast('API token input not found', 'error');
    return;
  }
  
  let apiToken = tokenInput.value.trim();
  
  // 如果当前值是掩码值（前3个字符+星号），使用原始值
  if (apiToken && apiToken.endsWith('***') && originalInput && originalInput.value) {
    apiToken = originalInput.value;
  }
  
  // 如果输入为空，检查是否有原始值
  if (!apiToken && originalInput && originalInput.value) {
    apiToken = originalInput.value;
  }
  
  if (!apiToken) {
    showToast('API token is required', 'error');
    return;
  }
  
  try {
    showGlobalLoading('Saving receive config...');
    
    const response = await fetch(`${API_BASE}/admin/remote-backup/receive-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        api_token: apiToken,
        auto_restore: autoRestore
      })
    });
    
    const data = await response.json();
    hideGlobalLoading();
    
    if (data.success) {
      showToast('Receive config saved successfully', 'success');
      // 重新加载配置以显示掩码值
      setTimeout(() => {
        loadReceiveConfig();
      }, 500);
    } else {
      showToast(data.message || 'Save failed', 'error');
    }
  } catch (error) {
    hideGlobalLoading();
    console.error('Save receive config failed:', error);
    showToast('Save failed: ' + (error.message || 'Network error'), 'error');
  }
}

// 加载推送日志
async function loadPushLogs() {
  const container = document.getElementById('pushLogsList');
  if (!container) return;
  
  try {
    const response = await fetch(`${API_BASE}/admin/remote-backup/push-logs?limit=50`, {
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.success) {
      const logs = data.logs || [];
      
      if (logs.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No push logs</p>';
        return;
      }
      
      container.innerHTML = logs.map(log => {
        const statusColor = log.status === 'success' ? 'green' :
          log.status === 'failed' ? 'red' : 'yellow';
        const statusText = log.status === 'success' ? 'Success' :
          log.status === 'failed' ? 'Failed' : 'Retrying';
        
        return `
          <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="px-2 py-1 bg-${statusColor}-100 text-${statusColor}-800 text-xs font-semibold rounded">${statusText}</span>
                  <span class="text-sm text-gray-600">${log.target_url}</span>
                </div>
                <p class="text-xs text-gray-500">${log.backup_file_name || 'N/A'}</p>
                ${log.error_message ? `<p class="text-xs text-red-600 mt-1">${log.error_message}</p>` : ''}
                <p class="text-xs text-gray-400 mt-1">${new Date(log.created_at).toLocaleString()}</p>
              </div>
              ${log.retry_count > 0 ? `<span class="text-xs text-gray-500">Retries: ${log.retry_count}</span>` : ''}
            </div>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = '<p class="text-red-500 text-sm">Failed to load logs</p>';
    }
  } catch (error) {
    console.error('Load push logs failed:', error);
    container.innerHTML = '<p class="text-red-500 text-sm">Failed to load logs</p>';
  }
}

// 加载接收到的备份
async function loadReceivedBackups() {
  const container = document.getElementById('receivedBackupsList');
  if (!container) return;
  
  try {
    const response = await fetch(`${API_BASE}/admin/remote-backup/received`, {
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.success) {
      const backups = data.backups || [];
      
      if (backups.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-sm">No received backups</p>';
        return;
      }
      
      container.innerHTML = backups.map(backup => {
        const statusColor = backup.status === 'restored' ? 'green' :
          backup.status === 'failed' ? 'red' : 'blue';
        const statusText = backup.status === 'restored' ? 'Restored' :
          backup.status === 'failed' ? 'Failed' : 'Received';
        
        return `
          <div class="p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div class="flex items-start justify-between">
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="px-2 py-1 bg-${statusColor}-100 text-${statusColor}-800 text-xs font-semibold rounded">${statusText}</span>
                  <span class="text-sm font-medium text-gray-900">${backup.backup_file_name}</span>
                </div>
                <p class="text-xs text-gray-600">From: ${backup.source_url || 'Unknown'}</p>
                <p class="text-xs text-gray-500">Size: ${backup.sizeMB}MB</p>
                <p class="text-xs text-gray-400 mt-1">${new Date(backup.created_at).toLocaleString()}</p>
                ${backup.restored_at ? `<p class="text-xs text-green-600 mt-1">Restored: ${new Date(backup.restored_at).toLocaleString()}</p>` : ''}
              </div>
              ${backup.status === 'received' ? `
                <button onclick="restoreReceivedBackup(${backup.id})" 
                        class="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm">
                  Restore
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = '<p class="text-red-500 text-sm">Failed to load received backups</p>';
    }
  } catch (error) {
    console.error('Load received backups failed:', error);
    container.innerHTML = '<p class="text-red-500 text-sm">Failed to load received backups</p>';
  }
}

// 恢复接收到的备份
async function restoreReceivedBackup(id) {
  const confirmed = await showConfirmDialog(
    'Restore Received Backup',
    'Are you sure you want to restore this backup? This will replace the current database and files. Make sure you have a backup of the current state.'
  );
  
  if (!confirmed) return;
  
  try {
    showGlobalLoading('Restoring backup...');
    
    const response = await fetch(`${API_BASE}/admin/remote-backup/received/${id}/restore`, {
      method: 'POST',
      credentials: 'include'
    });
    
    const data = await response.json();
    hideGlobalLoading();
    
    if (data.success) {
      showToast('Backup restored successfully. The page will reload.', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } else {
      showToast(data.message || 'Restore failed', 'error');
    }
  } catch (error) {
    hideGlobalLoading();
    console.error('Restore received backup failed:', error);
    showToast('Restore failed', 'error');
  }
}

// ==================== 文件管理 ====================

let currentFileManagerPath = '';
let currentEditingFile = null;
let currentFileContent = null;
let selectedFiles = new Set(); // 存储选中的文件路径

// 切换Developer标签
function switchDeveloperTab(tab) {
  const dbTab = document.getElementById('developerDbTab');
  const fileTab = document.getElementById('developerFileTab');
  const testTab = document.getElementById('developerTestTab');
  const dbContent = document.getElementById('developerDbContent');
  const fileContent = document.getElementById('developerFileContent');
  const testContent = document.getElementById('developerTestContent');
  
  // 重置所有标签样式
  [dbTab, fileTab, testTab].forEach(t => {
    if (t) {
      t.classList.remove('bg-blue-600', 'text-white');
      t.classList.add('bg-gray-200', 'text-gray-700');
    }
  });
  
  // 隐藏所有内容
  [dbContent, fileContent, testContent].forEach(c => {
    if (c) c.classList.add('hidden');
  });
  
  // 显示选中的标签和内容
  if (tab === 'db') {
    if (dbTab) {
      dbTab.classList.remove('bg-gray-200', 'text-gray-700');
      dbTab.classList.add('bg-blue-600', 'text-white');
    }
    if (dbContent) {
      dbContent.classList.remove('hidden');
    }
    // 确保加载表列表
    if (!window.tablesListLoaded) {
      loadTablesList();
      window.tablesListLoaded = true;
    }
  } else if (tab === 'files') {
    if (fileTab) {
      fileTab.classList.remove('bg-gray-200', 'text-gray-700');
      fileTab.classList.add('bg-blue-600', 'text-white');
    }
    if (fileContent) {
      fileContent.classList.remove('hidden');
    }
    
    // 加载文件列表
    if (currentFileManagerPath === '') {
      loadFileManager('/');
    }
  } else if (tab === 'tests') {
    if (testTab) {
      testTab.classList.remove('bg-gray-200', 'text-gray-700');
      testTab.classList.add('bg-blue-600', 'text-white');
    }
    if (testContent) {
      testContent.classList.remove('hidden');
    }
    if (!window.testSuitesLoaded) {
      loadTestSuites();
      window.testSuitesLoaded = true;
    }
  }
}

// 加载文件列表
async function loadFileManager(path) {
  try {
    // 如果切换了目录，清空选中状态
    if (currentFileManagerPath !== path) {
      selectedFiles.clear();
    }
    currentFileManagerPath = path;
    document.getElementById('fileManagerPath').textContent = path || '/';
    
    const response = await fetch(`${API_BASE}/admin/developer/files/list?path=${encodeURIComponent(path)}`, {
      credentials: 'include'
    });
    const data = await response.json();
    
    if (data.success) {
      const container = document.getElementById('fileManagerList');
      container.innerHTML = data.items.map(item => {
        const icon = item.isDirectory ? '📁' : getFileIcon(item.name);
        const size = item.isDirectory ? '' : formatFileSize(item.size);
        const modified = new Date(item.modified).toLocaleString();
        const isSelected = selectedFiles.has(item.path);
        const checkboxId = `fileCheckbox_${item.path.replace(/[^a-zA-Z0-9]/g, '_')}`;
        // 转义路径用于HTML属性
        const escapedPath = item.path.replace(/'/g, "\\'");
        
        return `
          <div class="flex items-center justify-between p-2 bg-white rounded border border-gray-200 hover:bg-gray-50 ${isSelected ? 'bg-blue-50 border-blue-300' : ''}"
               ${item.isDirectory ? `ondblclick="fileManagerOpenFolder('${escapedPath}')"` : `ondblclick="fileManagerOpenFile('${escapedPath}')"`}>
            <div class="flex items-center space-x-2 flex-1 min-w-0">
              <input type="checkbox" 
                     id="${checkboxId}"
                     data-path="${escapeHtml(item.path)}"
                     data-is-directory="${item.isDirectory}"
                     ${isSelected ? 'checked' : ''}
                     onclick="event.stopPropagation(); fileManagerToggleSelect('${escapedPath}', ${item.isDirectory}, this)"
                     class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
              <span class="text-lg">${icon}</span>
              <div class="flex-1 min-w-0">
                <div class="text-xs font-medium text-gray-900 truncate">${escapeHtml(item.name)}</div>
                <div class="text-xs text-gray-500">${size} • ${modified}</div>
              </div>
            </div>
            <div class="flex items-center space-x-1">
              ${!item.isDirectory ? `
                <button onclick="event.stopPropagation(); fileManagerDownload('${escapedPath}')" 
                        class="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 transition">
                  ⬇️
                </button>
              ` : ''}
              <button onclick="event.stopPropagation(); fileManagerDelete('${escapedPath}', ${item.isDirectory})" 
                      class="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition">
                🗑️
              </button>
            </div>
          </div>
        `;
      }).join('');
      
      // 更新选中数量显示
      updateSelectedCount();
    } else {
      showToast(data.message || 'Failed to load files', 'error');
    }
  } catch (error) {
    console.error('Load file manager failed:', error);
    showToast('Failed to load files', 'error');
  }
}

// 获取文件图标
function getFileIcon(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const iconMap = {
    'js': '📜', 'json': '📋', 'html': '🌐', 'css': '🎨', 'md': '📝',
    'log': '📄', 'txt': '📄', 'sql': '🗄️', 'sh': '⚙️', 'py': '🐍',
    'jpg': '🖼️', 'jpeg': '🖼️', 'png': '🖼️', 'gif': '🖼️', 'svg': '🖼️',
    'pdf': '📕', 'zip': '📦', 'tar': '📦', 'gz': '📦'
  };
  return iconMap[ext] || '📄';
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// 转义HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 打开文件夹
function fileManagerOpenFolder(path) {
  loadFileManager(path);
}

// 检查是否为图片文件
function isImageFile(fileName) {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.bmp', '.ico'];
  const ext = '.' + fileName.split('.').pop().toLowerCase();
  return imageExtensions.includes(ext);
}

// 打开文件
async function fileManagerOpenFile(path) {
  try {
    currentEditingFile = path;
    const fileName = path.split('/').pop();
    const isImage = isImageFile(fileName);
    
    // 如果是图片，直接显示预览
    if (isImage) {
      // 先获取文件信息以显示大小
      const infoResponse = await fetch(`${API_BASE}/admin/developer/files/read?path=${encodeURIComponent(path)}`, {
        credentials: 'include'
      });
      const infoData = await infoResponse.json();
      
      document.getElementById('fileEditorName').textContent = fileName;
      document.getElementById('fileEditorSize').textContent = infoData.success ? formatFileSize(infoData.size) : '';
      
      // 隐藏所有编辑器
      document.getElementById('fileEditorContent').classList.add('hidden');
      document.getElementById('fileEditorBinary').classList.add('hidden');
      document.getElementById('fileEditorImage').classList.remove('hidden');
      
      // 设置图片源（使用下载接口的预览模式）
      const imageUrl = `${API_BASE}/admin/developer/files/download?path=${encodeURIComponent(path)}&preview=true`;
      document.getElementById('fileEditorImagePreview').src = imageUrl;
      currentFileContent = null;
      
      // 隐藏保存按钮（图片不能编辑）
      document.getElementById('fileEditorSaveBtn').classList.add('hidden');
      
      document.getElementById('fileEditorPanel').classList.remove('hidden');
      return;
    }
    
    // 非图片文件，使用原有逻辑
    const response = await fetch(`${API_BASE}/admin/developer/files/read?path=${encodeURIComponent(path)}`, {
      credentials: 'include'
    });
    const data = await response.json();
    
    if (data.success) {
      document.getElementById('fileEditorName').textContent = fileName;
      document.getElementById('fileEditorSize').textContent = formatFileSize(data.size);
      
      // 隐藏图片预览
      document.getElementById('fileEditorImage').classList.add('hidden');
      
      if (data.isTextFile) {
        document.getElementById('fileEditorContent').value = data.content;
        document.getElementById('fileEditorContent').classList.remove('hidden');
        document.getElementById('fileEditorBinary').classList.add('hidden');
        currentFileContent = data.content;
        // 显示保存按钮
        document.getElementById('fileEditorSaveBtn').classList.remove('hidden');
      } else {
        document.getElementById('fileEditorContent').classList.add('hidden');
        document.getElementById('fileEditorBinary').classList.remove('hidden');
        currentFileContent = null;
        // 隐藏保存按钮（二进制文件不能编辑）
        document.getElementById('fileEditorSaveBtn').classList.add('hidden');
      }
      
      document.getElementById('fileEditorPanel').classList.remove('hidden');
    } else {
      showToast(data.message || 'Failed to read file', 'error');
    }
  } catch (error) {
    console.error('Open file failed:', error);
    showToast('Failed to read file', 'error');
  }
}

// 保存文件
async function fileEditorSave() {
  if (!currentEditingFile || currentFileContent === null) {
    showToast('Cannot save binary file', 'error');
    return;
  }
  
  try {
    const newContent = document.getElementById('fileEditorContent').value;
    
    const response = await fetch(`${API_BASE}/admin/developer/files/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        path: currentEditingFile,
        content: newContent
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      currentFileContent = newContent;
      showToast('File saved successfully', 'success');
    } else {
      showToast(data.message || 'Failed to save file', 'error');
    }
  } catch (error) {
    console.error('Save file failed:', error);
    showToast('Failed to save file', 'error');
  }
}

// 关闭编辑器
function fileEditorClose() {
  // 检查是否有未保存的文本文件更改
  const textEditor = document.getElementById('fileEditorContent');
  if (!textEditor.classList.contains('hidden') && currentFileContent !== null && currentFileContent !== textEditor.value) {
    if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
      return;
    }
  }
  
  // 清除图片预览
  document.getElementById('fileEditorImagePreview').src = '';
  
  document.getElementById('fileEditorPanel').classList.add('hidden');
  currentEditingFile = null;
  currentFileContent = null;
}

// 下载文件
function fileManagerDownload(path) {
  window.open(`${API_BASE}/admin/developer/files/download?path=${encodeURIComponent(path)}`, '_blank');
}

// 删除文件/目录
async function fileManagerDelete(path, isDirectory) {
  if (!confirm(`Are you sure you want to delete this ${isDirectory ? 'directory' : 'file'}?`)) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/admin/developer/files?path=${encodeURIComponent(path)}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Deleted successfully', 'success');
      loadFileManager(currentFileManagerPath);
    } else {
      showToast(data.message || 'Failed to delete', 'error');
    }
  } catch (error) {
    console.error('Delete file failed:', error);
    showToast('Failed to delete', 'error');
  }
}

// 返回上一级
function fileManagerGoUp() {
  if (currentFileManagerPath === '/' || currentFileManagerPath === '') {
    return;
  }
  
  const parts = currentFileManagerPath.split('/').filter(p => p);
  parts.pop();
  const newPath = parts.length > 0 ? '/' + parts.join('/') : '/';
  loadFileManager(newPath);
}

// 刷新
function fileManagerRefresh() {
  loadFileManager(currentFileManagerPath);
}

// 新建文件夹
async function fileManagerNewFolder() {
  const folderName = prompt('Enter folder name:');
  if (!folderName) {
    return;
  }
  
  try {
    const newPath = currentFileManagerPath === '/' 
      ? `/${folderName}` 
      : `${currentFileManagerPath}/${folderName}`;
    
    const response = await fetch(`${API_BASE}/admin/developer/files/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ path: newPath })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Folder created successfully', 'success');
      loadFileManager(currentFileManagerPath);
    } else {
      showToast(data.message || 'Failed to create folder', 'error');
    }
  } catch (error) {
    console.error('Create folder failed:', error);
    showToast('Failed to create folder', 'error');
  }
}

// 上传文件
function fileManagerUpload() {
  document.getElementById('fileUploadInput').click();
}

// 处理文件上传
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }
  
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', currentFileManagerPath === '/' 
      ? `/${file.name}` 
      : `${currentFileManagerPath}/${file.name}`);
    
    const response = await fetch(`${API_BASE}/admin/developer/files/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('File uploaded successfully', 'success');
      loadFileManager(currentFileManagerPath);
    } else {
      showToast(data.message || 'Failed to upload file', 'error');
    }
  } catch (error) {
    console.error('Upload file failed:', error);
    showToast('Failed to upload file', 'error');
  }
  
  // 重置input
  event.target.value = '';
}

// 下载文件（编辑器中的二进制文件）
function fileEditorDownload() {
  if (currentEditingFile) {
    fileManagerDownload(currentEditingFile);
  }
}

// ==================== 文件多选功能 ====================

// 切换文件选中状态
function fileManagerToggleSelect(filePath, isDirectory, checkbox) {
  if (checkbox.checked) {
    selectedFiles.add(filePath);
  } else {
    selectedFiles.delete(filePath);
  }
  updateSelectedCount();
}

// 全选
function fileManagerSelectAll() {
  const checkboxes = document.querySelectorAll('#fileManagerList input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    const path = checkbox.getAttribute('data-path');
    checkbox.checked = true;
    selectedFiles.add(path);
  });
  updateSelectedCount();
  // 重新渲染以更新样式
  loadFileManager(currentFileManagerPath);
}

// 取消全选
function fileManagerDeselectAll() {
  // 只清空当前目录的选中项
  const checkboxes = document.querySelectorAll('#fileManagerList input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    const path = checkbox.getAttribute('data-path');
    checkbox.checked = false;
    selectedFiles.delete(path);
  });
  updateSelectedCount();
  // 重新渲染以更新样式
  loadFileManager(currentFileManagerPath);
}

// 更新选中数量显示
function updateSelectedCount() {
  const count = selectedFiles.size;
  const countSpan = document.getElementById('fileManagerSelectedCount');
  const deleteBtn = document.getElementById('fileManagerDeleteSelectedBtn');
  
  if (countSpan) {
    countSpan.textContent = count;
  }
  
  if (deleteBtn) {
    if (count > 0) {
      deleteBtn.classList.remove('hidden');
    } else {
      deleteBtn.classList.add('hidden');
    }
  }
}

// 批量删除选中的文件
async function fileManagerDeleteSelected() {
  if (selectedFiles.size === 0) {
    showToast('No files selected', 'error');
    return;
  }
  
  const filesToDelete = Array.from(selectedFiles);
  const fileCount = filesToDelete.length;
  
  if (!confirm(`Are you sure you want to delete ${fileCount} item(s)?`)) {
    return;
  }
  
  try {
    showGlobalLoading();
    
    // 逐个删除文件
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    
    for (const filePath of filesToDelete) {
      try {
        const response = await fetch(`${API_BASE}/admin/developer/files?path=${encodeURIComponent(filePath)}`, {
          method: 'DELETE',
          credentials: 'include'
        });
        
        const data = await response.json();
        if (data.success) {
          successCount++;
        } else {
          failCount++;
          errors.push(`${filePath}: ${data.message}`);
        }
      } catch (error) {
        failCount++;
        errors.push(`${filePath}: ${error.message}`);
      }
    }
    
    hideGlobalLoading();
    
    // 清空选中状态
    selectedFiles.clear();
    updateSelectedCount();
    
    // 显示结果
    if (failCount === 0) {
      showToast(`Successfully deleted ${successCount} item(s)`, 'success');
    } else {
      showToast(`Deleted ${successCount} item(s), failed ${failCount} item(s)`, 'error');
      console.error('Delete errors:', errors);
    }
    
    // 刷新文件列表
    loadFileManager(currentFileManagerPath);
  } catch (error) {
    hideGlobalLoading();
    console.error('Batch delete failed:', error);
    showToast('Failed to delete files', 'error');
  }
}

// ==================== 菜单备份/导入功能 ====================

// 备份菜单（产品和分类）
async function backupMenu() {
  try {
    showGlobalLoading();
    
    const response = await fetch(`${API_BASE}/admin/menu/backup`, {
      method: 'POST',
      credentials: 'include'
    });
    
    const data = await response.json();
    hideGlobalLoading();
    
    if (data.success) {
      // 下载备份文件（使用直接下载方式，避免多次重试）
      const downloadUrl = `${API_BASE}/admin/menu/backup/download?fileName=${encodeURIComponent(data.fileName)}`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = data.fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showToast(`Backup created successfully! ${data.categories} categories, ${data.products} products, ${data.images} images`, 'success');
    } else {
      showToast(data.message || 'Backup failed', 'error');
    }
  } catch (error) {
    hideGlobalLoading();
    console.error('Backup menu failed:', error);
    showToast('Backup failed', 'error');
  }
}

// 导入菜单
function importMenu() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.zip';
  input.onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      return;
    }
    
    if (!file.name.endsWith('.zip')) {
      showToast('Please select a valid backup file (.zip)', 'error');
      return;
    }
    
    // 显示导入选项对话框
    showImportMenuDialog(file);
  };
  
  input.click();
}

// ==================== 产品批量编辑功能 ====================

let selectedProductIds = new Set();

// 更新选中产品数量
function updateSelectedProductsCount() {
  const checkboxes = document.querySelectorAll('.product-checkbox:checked');
  selectedProductIds.clear();
  checkboxes.forEach(cb => {
    selectedProductIds.add(parseInt(cb.value));
  });
  
  const count = selectedProductIds.size;
  const countElement = document.getElementById('selectedProductsCount');
  if (countElement) {
    countElement.textContent = count;
  }
  
  const batchEditBtn = document.getElementById('batchEditBtn');
  if (batchEditBtn) {
    if (count > 0) {
      batchEditBtn.classList.remove('hidden');
    } else {
      batchEditBtn.classList.add('hidden');
    }
  }
}

// 全选/取消全选
function toggleSelectAllProducts() {
  const selectAll = document.getElementById('selectAllProducts');
  const checkboxes = document.querySelectorAll('.product-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = selectAll.checked;
  });
  updateSelectedProductsCount();
}

// 显示批量编辑模态框
function showBatchEditModal() {
  if (selectedProductIds.size === 0) {
    showToast('Please select at least one product', 'error');
    return;
  }
  
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'batchEditModal';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl max-w-3xl w-full mx-4 p-8 max-h-[90vh] overflow-y-auto">
      <h3 class="text-2xl font-bold text-gray-900 mb-4">Batch Edit Products</h3>
      <p class="text-gray-600 mb-6">Editing <span class="font-semibold">${selectedProductIds.size}</span> product(s)</p>
      
      <form id="batchEditForm" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Category</label>
          <select id="batchCategory" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
            <option value="">-- No Change --</option>
          </select>
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <select id="batchStatus" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
            <option value="">-- No Change --</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Price Adjustment</label>
          <div class="flex gap-2">
            <select id="batchPriceAction" class="px-4 py-2 border border-gray-300 rounded-lg">
              <option value="">-- No Change --</option>
              <option value="set">Set to</option>
              <option value="add">Add</option>
              <option value="multiply">Multiply by</option>
            </select>
            <input type="number" id="batchPriceValue" step="0.01" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg" placeholder="Value">
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Sort Order</label>
          <input type="number" id="batchSortOrder" class="w-full px-4 py-2 border border-gray-300 rounded-lg" placeholder="-- No Change --">
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Cup Sizes & Prices</label>
          <div class="space-y-2 border border-gray-300 rounded-lg p-4 bg-gray-50 max-h-48 overflow-y-auto">
            <div class="text-sm text-gray-600 mb-2">Leave empty to keep current values. Format: SizeName:Price (e.g., Medium:120, Large:150)</div>
            <textarea id="batchSizes" class="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" 
                      rows="3" placeholder="Medium:120, Large:150"></textarea>
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Sweetness Options (甜度选项)</label>
          <div class="space-y-2 border border-gray-300 rounded-lg p-4 bg-gray-50">
            <div class="text-sm text-gray-600 mb-2">Leave empty to keep current values. Separate with commas (e.g., 0, 30, 50, 70, 100)</div>
            <input type="text" id="batchSugarLevels" class="w-full px-4 py-2 border border-gray-300 rounded-lg" 
                   placeholder="0, 30, 50, 70, 100">
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Available Toppings (可选加料)</label>
          <div class="space-y-2 border border-gray-300 rounded-lg p-4 bg-gray-50">
            <div class="text-sm text-gray-600 mb-2">Leave empty to keep current values. Format: Name:Price (e.g., Cheese 芝士:20, Boba 波霸:20) or Name only</div>
            <input type="text" id="batchAvailableToppings" class="w-full px-4 py-2 border border-gray-300 rounded-lg" 
                   placeholder="Cheese 芝士:20, Boba 波霸:20, Cream 奶盖:20">
          </div>
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Available Ice Options</label>
          <div class="border border-gray-300 rounded-lg p-4 bg-gray-50">
            <div class="text-sm text-gray-600 mb-2">Select options (leave unchecked to keep current values)</div>
            <div class="space-y-2">
              <label class="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" class="batch-ice-option" value="normal">
                <span class="text-sm text-gray-700">Normal Ice 正常冰</span>
              </label>
              <label class="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" class="batch-ice-option" value="less">
                <span class="text-sm text-gray-700">Less Ice 少冰</span>
              </label>
              <label class="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" class="batch-ice-option" value="no">
                <span class="text-sm text-gray-700">No Ice 去冰</span>
              </label>
              <label class="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" class="batch-ice-option" value="room">
                <span class="text-sm text-gray-700">Room Temperature 常温</span>
              </label>
              <label class="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" class="batch-ice-option" value="hot">
                <span class="text-sm text-gray-700">Hot 热</span>
              </label>
            </div>
            <div class="mt-2">
              <label class="flex items-center space-x-2 cursor-pointer">
                <input type="checkbox" id="batchIceOptionsSet">
                <span class="text-xs text-gray-600">Set these options (otherwise keep current values)</span>
              </label>
            </div>
          </div>
        </div>
        
        <div class="flex space-x-3 mt-6">
          <button type="button" onclick="closeBatchEditModal()" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-3 rounded-lg">
            Cancel
          </button>
          <button type="submit" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg">
            Apply Changes
          </button>
        </div>
      </form>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // 加载分类列表
  loadCategoriesForBatchEdit();
  
  // 设置表单提交事件
  document.getElementById('batchEditForm').addEventListener('submit', saveBatchEdit);
  
  // 添加关闭事件
  modal.querySelector('.bg-white').addEventListener('click', (e) => e.stopPropagation());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeBatchEditModal();
    }
  });
}

// 加载分类列表（用于批量编辑）
async function loadCategoriesForBatchEdit() {
  try {
    const response = await fetch(`${API_BASE}/admin/categories`, { credentials: 'include' });
    const data = await response.json();
    if (data.success) {
      const select = document.getElementById('batchCategory');
      select.innerHTML = '<option value="">-- No Change --</option>' +
        data.categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join('');
    }
  } catch (error) {
    console.error('加载分类失败:', error);
  }
}

// 关闭批量编辑模态框
function closeBatchEditModal() {
  const modal = document.getElementById('batchEditModal');
  if (modal) {
    modal.remove();
  }
}

// 保存批量编辑
async function saveBatchEdit(e) {
  e.preventDefault();
  
  const categoryId = document.getElementById('batchCategory').value;
  const status = document.getElementById('batchStatus').value;
  const priceAction = document.getElementById('batchPriceAction').value;
  const priceValue = document.getElementById('batchPriceValue').value;
  const sortOrder = document.getElementById('batchSortOrder').value;
  
  // 收集杯型价格
  const sizesText = document.getElementById('batchSizes').value.trim();
  let sizes = null;
  if (sizesText) {
    try {
      sizes = {};
      // 解析格式: "Medium:120, Large:150" 或 "Medium:120,Large:150"
      const pairs = sizesText.split(',').map(p => p.trim());
      pairs.forEach(pair => {
        const [name, price] = pair.split(':').map(s => s.trim());
        if (name && price) {
          sizes[name] = parseFloat(price);
        }
      });
    } catch (e) {
      showToast('Invalid sizes format. Use: SizeName:Price (e.g., Medium:120, Large:150)', 'error');
      return;
    }
  }
  
  // 收集甜度选项
  const sugarLevelsText = document.getElementById('batchSugarLevels').value.trim();
  let sugarLevels = null;
  if (sugarLevelsText) {
    sugarLevels = sugarLevelsText.split(',').map(s => s.trim()).filter(s => s);
  }
  
  // 收集可选加料（名称和价格格式：Name:Price,Name:Price 或 Name,Name）
  const toppingsText = document.getElementById('batchAvailableToppings').value.trim();
  let availableToppings = null;
  if (toppingsText) {
    try {
      // 解析格式: "Cheese 芝士:20, Boba 波霸:20" 或 "Cheese 芝士, Boba 波霸"
      availableToppings = toppingsText.split(',').map(s => {
        const trimmed = s.trim();
        if (trimmed.includes(':')) {
          // 有价格的格式：Name:Price
          const [name, price] = trimmed.split(':').map(p => p.trim());
          return { name: name, price: price ? parseFloat(price) : 0 };
        } else {
          // 只有名称的格式：Name
          return { name: trimmed, price: 0 };
        }
      }).filter(t => t.name);
    } catch (e) {
      showToast('Invalid toppings format. Use: Name:Price (e.g., Cheese 芝士:20, Boba 波霸:20)', 'error');
      return;
    }
  }
  
  // 收集冰度选项
  const iceOptionsSet = document.getElementById('batchIceOptionsSet').checked;
  let iceOptions = null;
  if (iceOptionsSet) {
    const selectedIceOptions = [];
    document.querySelectorAll('.batch-ice-option:checked').forEach(cb => {
      selectedIceOptions.push(cb.value);
    });
    if (selectedIceOptions.length > 0) {
      iceOptions = selectedIceOptions;
    }
  }
  
  const updates = {};
  if (categoryId) updates.category_id = categoryId;
  if (status) updates.status = status;
  if (priceAction && priceValue) {
    updates.price_action = priceAction;
    updates.price_value = parseFloat(priceValue);
  }
  if (sortOrder !== '') updates.sort_order = parseInt(sortOrder);
  if (sizes !== null) updates.sizes = sizes;
  if (sugarLevels !== null) updates.sugar_levels = sugarLevels;
  if (availableToppings !== null) updates.available_toppings = availableToppings;
  if (iceOptions !== null) updates.ice_options = iceOptions;
  
  if (Object.keys(updates).length === 0) {
    showToast('Please select at least one field to update', 'error');
    return;
  }
  
  try {
    showGlobalLoading();
    
    const response = await fetch(`${API_BASE}/admin/products/batch-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        product_ids: Array.from(selectedProductIds),
        updates: updates
      })
    });
    
    const data = await response.json();
    hideGlobalLoading();
    
    if (data.success) {
      showToast(`Successfully updated ${data.updated} product(s)`, 'success');
      closeBatchEditModal();
      selectedProductIds.clear();
      updateSelectedProductsCount();
      loadProducts();
    } else {
      showToast(data.message || 'Batch update failed', 'error');
    }
  } catch (error) {
    hideGlobalLoading();
    console.error('Batch update failed:', error);
    showToast('Batch update failed', 'error');
  }
}

// 显示导入菜单选项对话框
function showImportMenuDialog(file) {
  // 创建模态框
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
      <h3 class="text-2xl font-bold text-gray-900 mb-4">Import Menu</h3>
      <p class="text-gray-600 mb-6">File: <span class="font-semibold">${file.name}</span></p>
      
      <div class="mb-6">
        <label class="block text-sm font-medium text-gray-700 mb-3">Import Mode:</label>
        <div class="space-y-3">
          <label class="flex items-start p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
            <input type="radio" name="importMode" value="merge" class="mt-1 mr-3" checked>
            <div>
              <div class="font-semibold text-gray-900">Merge (Keep Existing)</div>
              <div class="text-sm text-gray-500">Keep current data. Duplicate items (by name) will be replaced.</div>
            </div>
          </label>
          <label class="flex items-start p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
            <input type="radio" name="importMode" value="replace" class="mt-1 mr-3">
            <div>
              <div class="font-semibold text-gray-900">Replace (Clear All)</div>
              <div class="text-sm text-gray-500">Clear all existing categories and products, then import from backup.</div>
            </div>
          </label>
        </div>
      </div>
      
      <div class="flex space-x-3">
        <button onclick="closeImportMenuDialog()" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-3 rounded-lg">
          Cancel
        </button>
        <button onclick="confirmImportMenu(event)" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg">
          Import
        </button>
      </div>
    </div>
  `;
  
  // 存储文件引用
  modal.dataset.file = JSON.stringify({ name: file.name, size: file.size });
  modal.dataset.fileInput = 'temp'; // 标记需要重新获取文件
  
  // 添加关闭事件
  modal.querySelector('.bg-white').addEventListener('click', (e) => e.stopPropagation());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeImportMenuDialog();
    }
  });
  
  document.body.appendChild(modal);
  
  // 存储文件到全局变量（因为input会丢失文件引用）
  window._pendingImportFile = file;
}

// 关闭导入对话框
function closeImportMenuDialog() {
  const modal = document.querySelector('.modal.active');
  if (modal && modal.querySelector('input[name="importMode"]')) {
    modal.remove();
  }
  window._pendingImportFile = null;
}

// 确认导入
async function confirmImportMenu(event) {
  const modal = event.target.closest('.modal');
  if (!modal) return;
  
  const importMode = modal.querySelector('input[name="importMode"]:checked').value;
  const clearExisting = importMode === 'replace';
  
  const file = window._pendingImportFile;
  if (!file) {
    showToast('File not found', 'error');
    closeImportMenuDialog();
    return;
  }
  
  closeImportMenuDialog();
  
  try {
    showGlobalLoading();
    
    const formData = new FormData();
    formData.append('backupFile', file);
    formData.append('clearExisting', clearExisting.toString());
    
    const response = await fetch(`${API_BASE}/admin/menu/import`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    
    const data = await response.json();
    hideGlobalLoading();
    
    if (data.success) {
      const modeText = clearExisting ? 'replaced' : 'merged';
      showToast(`Menu imported successfully (${modeText})! ${data.categories} categories, ${data.products} products`, 'success');
      // 刷新页面数据
      if (currentTab === 'products') {
        loadProducts();
      } else if (currentTab === 'categories') {
        loadCategories();
      }
    } else {
      showToast(data.message || 'Import failed', 'error');
    }
  } catch (error) {
    hideGlobalLoading();
    console.error('Import menu failed:', error);
    showToast('Import failed', 'error');
  } finally {
    window._pendingImportFile = null;
  }
}

// ==================== 业务测试用例管理 ====================

let testSuites = [];
let selectedTestSuites = new Set();
let testRunning = false;
let testProgressInterval = null;
let testLogsCache = [];
let lastLogCount = 0; // 跟踪已处理的日志数量
let logsFullscreenMode = false; // 全屏模式状态

// 加载测试套件列表
async function loadTestSuites() {
  try {
    const response = await fetch(`${API_BASE}/admin/developer/test-suites`, {
      credentials: 'include'
    });
    const data = await response.json();
    
    if (data.success) {
      testSuites = data.suites || [];
      renderTestSuites();
    } else {
      showToast('Failed to load test suites', 'error');
    }
  } catch (error) {
    console.error('Load test suites failed:', error);
    showToast('Failed to load test suites', 'error');
  }
}

// 渲染测试套件列表
function renderTestSuites() {
  const container = document.getElementById('testSuitesList');
  if (!container) return;
  
  container.innerHTML = testSuites.map(suite => `
    <label class="flex items-center space-x-2 p-2 bg-white rounded border border-gray-200 hover:bg-gray-50 cursor-pointer">
      <input 
        type="checkbox" 
        value="${suite.name}" 
        onchange="toggleTestSuite('${suite.name}')"
        class="test-suite-checkbox rounded"
        ${selectedTestSuites.has(suite.name) ? 'checked' : ''}
      >
      <div class="flex-1">
        <div class="text-sm font-medium text-gray-900">${escapeHtml(suite.displayName || suite.name)}</div>
        <div class="text-xs text-gray-500">${suite.testCount || 0} tests</div>
      </div>
    </label>
  `).join('');
  
  updateSelectedCount();
}

// 切换测试套件选择
function toggleTestSuite(suiteName) {
  if (selectedTestSuites.has(suiteName)) {
    selectedTestSuites.delete(suiteName);
  } else {
    selectedTestSuites.add(suiteName);
  }
  updateSelectedCount();
}

// 全选/取消全选
function toggleAllTestSuites() {
  const selectAll = document.getElementById('selectAllTestSuites');
  if (selectAll.checked) {
    testSuites.forEach(suite => selectedTestSuites.add(suite.name));
  } else {
    selectedTestSuites.clear();
  }
  renderTestSuites();
}

// 更新选中数量
function updateSelectedCount() {
  const countEl = document.getElementById('selectedTestSuitesCount');
  if (countEl) {
    countEl.textContent = `已选择: ${selectedTestSuites.size}`;
  }
  const selectAll = document.getElementById('selectAllTestSuites');
  if (selectAll) {
    selectAll.checked = selectedTestSuites.size === testSuites.length && testSuites.length > 0;
  }
}

// 运行全部测试
async function runAllTests() {
  selectedTestSuites.clear();
  testSuites.forEach(suite => selectedTestSuites.add(suite.name));
  await runSelectedTests();
}

// 运行选中测试
async function runSelectedTests() {
  if (selectedTestSuites.size === 0) {
    showToast('Please select at least one test suite', 'warning');
    return;
  }
  
  if (testRunning) {
    showToast('Tests are already running', 'warning');
    return;
  }
  
  testRunning = true;
  const stopBtn = document.getElementById('stopTestsBtn');
  const progressPanel = document.getElementById('testProgressPanel');
  const reportPanel = document.getElementById('testReportContent');
  
  // 清空日志缓存
  testLogsCache = [];
  lastLogCount = 0; // 重置已处理的日志数量
  const logsText = document.getElementById('testLogsText');
  const logsContainer = document.getElementById('testLogsContainer');
  const logsContent = document.getElementById('testLogsContent');
  const toggleBtn = document.getElementById('toggleLogsBtn');
  
  if (logsText) logsText.textContent = '';
  if (logsContainer) logsContainer.classList.add('hidden');
  if (logsContent) logsContent.classList.add('hidden');
  if (toggleBtn) toggleBtn.textContent = '展开';
  
  if (stopBtn) stopBtn.classList.remove('hidden');
  // 隐藏进度面板，直接显示日志
  if (progressPanel) progressPanel.classList.add('hidden');
  // 显示日志容器并默认展开
  if (logsContainer) {
    logsContainer.classList.remove('hidden');
  }
  if (logsContent) {
    logsContent.classList.remove('hidden');
  }
  if (toggleBtn) {
    toggleBtn.textContent = '收起';
  }
  if (reportPanel) {
      const placeholder = document.getElementById('testReportPlaceholder');
      const iframe = document.getElementById('testReportIframe');
      if (placeholder) {
        // 在占位符中显示日志容器
         placeholder.innerHTML = `
           <div class="w-full h-full flex flex-col" style="height: 100%; min-height: 500px;">
             <!-- 报告按钮区域（在日志上方） -->
             <div id="testReportButton" class="mb-3 text-center px-2 hidden flex-shrink-0">
               <button onclick="loadTestReport()" class="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-md">
                 📊 在新窗口打开测试报告
               </button>
             </div>
             <!-- 日志头部 -->
             <div class="flex items-center justify-between mb-2 px-2 flex-shrink-0">
               <span class="text-sm font-semibold text-gray-700">测试日志</span>
               <div class="flex items-center space-x-2">
                 <button onclick="toggleTestLogsFullscreen()" id="fullscreenLogsBtn" class="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 border border-blue-300 rounded hover:bg-blue-50 transition" title="全屏显示日志">
                   ⛶ 全屏
                 </button>
                 <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                 <span class="text-xs text-gray-500">运行中...</span>
               </div>
             </div>
             <!-- 日志内容区域 -->
             <div id="testLogsContentPlaceholder" class="bg-gray-900 text-gray-100 font-mono text-xs p-3 rounded-lg overflow-y-auto text-left flex-1 relative" style="font-size: 11px; line-height: 1.6; min-height: 0; flex: 1 1 auto;">
               <div id="testLogsTextPlaceholder" class="whitespace-pre-wrap text-left"></div>
             </div>
           </div>
         `;
        placeholder.style.display = 'block';
      }
      if (iframe) {
        iframe.style.display = 'none';
      }
    }
  
  try {
    const response = await fetch(`${API_BASE}/admin/developer/run-tests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        suites: Array.from(selectedTestSuites)
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to start tests');
    }
    
    // 轮询测试进度和日志（使用更频繁的轮询以获得实时日志）
    // 业界最佳实践：100-200ms 轮询间隔，确保实时性
    testProgressInterval = setInterval(async () => {
      try {
        const progressResponse = await fetch(`${API_BASE}/admin/developer/test-progress?t=${Date.now()}`, {
          credentials: 'include',
          cache: 'no-cache'
        });
        if (progressResponse.ok) {
          const progressData = await progressResponse.json();
          if (progressData.success) {
            // 不再更新进度条，只更新日志
            // updateTestProgress(progressData);
            // 更新测试日志（服务器端已经添加了时间戳）
            if (progressData.logs && Array.isArray(progressData.logs)) {
              updateTestLogs(progressData.logs);
            }
            
            // 如果测试已完成，停止轮询并更新占位符
            if (progressData.completed) {
              clearInterval(testProgressInterval);
              testProgressInterval = null;
              testRunning = false;
              const stopBtn = document.getElementById('stopTestsBtn');
              if (stopBtn) stopBtn.classList.add('hidden');
              
              // 更新占位符，显示完成状态和下载按钮
              const placeholder = document.getElementById('testReportPlaceholder');
              if (placeholder) {
                const statusDiv = placeholder.querySelector('.flex.items-center.justify-between');
                if (statusDiv) {
                  const statusText = statusDiv.querySelector('.text-xs.text-gray-500');
                  if (statusText) {
                    statusText.innerHTML = '<span class="text-green-500">✓ 测试完成</span>';
                  }
                  const pulseDiv = statusDiv.querySelector('.animate-pulse');
                  if (pulseDiv) {
                    pulseDiv.classList.remove('animate-pulse', 'bg-blue-500');
                    pulseDiv.classList.add('bg-green-500');
                  }
                }
                
                 // 显示报告按钮（在日志上方）
                 const reportButton = placeholder.querySelector('#testReportButton');
                 if (reportButton) {
                   reportButton.classList.remove('hidden');
                   // 确保按钮在日志上方（通过调整顺序）
                   const logsHeader = placeholder.querySelector('.flex.items-center.justify-between');
                   if (logsHeader && reportButton.parentNode) {
                     reportButton.parentNode.insertBefore(reportButton, logsHeader);
                   }
                 }
                 
                 // 更新状态指示器
                 const statusText = statusDiv.querySelector('.text-xs.text-gray-500');
                 if (statusText) {
                   statusText.innerHTML = '<span class="text-green-500">✓ 测试完成</span>';
                 }
                 const pulseDiv = statusDiv.querySelector('.animate-pulse');
                 if (pulseDiv) {
                   pulseDiv.classList.remove('animate-pulse', 'bg-blue-500');
                   pulseDiv.classList.add('bg-green-500');
                 }
              }
            }
            
            // 检查测试是否完成（已在上面处理）
          }
        }
      } catch (e) {
        console.error('Get test progress failed:', e);
      }
    }, 150); // 每150ms轮询一次，获得更实时的日志更新（业界最佳实践）
    
  } catch (error) {
    console.error('Run tests failed:', error);
    showToast('Failed to run tests', 'error');
    if (reportPanel) {
      const placeholder = document.getElementById('testReportPlaceholder');
      const iframe = document.getElementById('testReportIframe');
      if (placeholder) {
        placeholder.innerHTML = '<div class="text-center py-8 text-red-500">Failed to run tests</div>';
        placeholder.style.display = 'block';
      }
      if (iframe) {
        iframe.style.display = 'none';
      }
    }
    testRunning = false;
    if (stopBtn) stopBtn.classList.add('hidden');
    if (testProgressInterval) {
      clearInterval(testProgressInterval);
      testProgressInterval = null;
    }
  }
}

// 更新测试进度
function updateTestProgress(data) {
  const progressBar = document.getElementById('testProgressBar');
  const progressText = document.getElementById('testProgressText');
  const progressPercentage = document.getElementById('testProgressPercentage');
  const progressBarLabel = document.getElementById('testProgressBarLabel');
  const progressBarPercentage = document.getElementById('testProgressBarPercentage');
  const currentTestName = document.getElementById('testCurrentTestName');
  const currentSuite = document.getElementById('testCurrentSuite');
  
  if (data.progress) {
    const { current, total, currentTest: testName, currentSuite: suiteName } = data.progress;
    // 如果 total 为 0，说明测试还没开始或总数未知，显示 0%
    const safeTotal = Math.max(total || 0, 0);
    const safeCurrent = Math.max(current || 0, 0);
    let percentage = 0;
    let percentageText = '0.0';
    
    if (safeTotal > 0) {
      percentage = Math.min((safeCurrent / safeTotal) * 100, 100);
      percentageText = percentage.toFixed(1);
    } else if (safeCurrent > 0) {
      // 如果总数未知但已有完成的测试，显示一个小的进度（表示正在运行）
      percentage = Math.min(safeCurrent * 2, 10); // 最多显示10%
      percentageText = percentage.toFixed(1);
    }
    
    // 更新进度条
    if (progressBar) {
      progressBar.style.width = `${percentage}%`;
      // 如果进度条足够宽，在进度条上显示百分比
      if (progressBarLabel && progressBarPercentage) {
        if (percentage > 15) {
          progressBarLabel.style.display = 'flex';
          progressBarPercentage.textContent = `${percentageText}%`;
        } else {
          progressBarLabel.style.display = 'none';
        }
      }
    }
    
    // 更新进度文本
    if (progressText) {
      progressText.textContent = `${safeCurrent} / ${safeTotal}`;
    }
    
    // 更新百分比显示
    if (progressPercentage) {
      progressPercentage.textContent = `${percentageText}%`;
      // 根据进度改变颜色
      if (percentage >= 100) {
        progressPercentage.classList.remove('text-blue-600');
        progressPercentage.classList.add('text-green-600');
      } else if (percentage >= 75) {
        progressPercentage.classList.remove('text-blue-600', 'text-green-600');
        progressPercentage.classList.add('text-indigo-600');
      } else {
        progressPercentage.classList.remove('text-indigo-600', 'text-green-600');
        progressPercentage.classList.add('text-blue-600');
      }
    }
    
    // 更新当前测试信息
    if (currentTestName) {
      if (testName && testName !== 'Running tests...' && testName !== 'Starting tests...' && testName !== 'All tests completed') {
        // 显示测试名称，如果太长则截断
        const displayName = testName.length > 80 ? testName.substring(0, 77) + '...' : testName;
        currentTestName.textContent = `正在运行: ${displayName}`;
        currentTestName.classList.remove('text-gray-500');
        currentTestName.classList.add('text-gray-700');
      } else if (safeCurrent > 0 && safeCurrent < safeTotal) {
        currentTestName.textContent = `正在运行测试... (${safeCurrent}/${safeTotal})`;
        currentTestName.classList.remove('text-gray-500');
        currentTestName.classList.add('text-gray-700');
      } else if (safeCurrent >= safeTotal) {
        currentTestName.textContent = '✅ 所有测试已完成';
        currentTestName.classList.remove('text-gray-700');
        currentTestName.classList.add('text-green-600', 'font-semibold');
      } else {
        currentTestName.textContent = '准备开始测试...';
        currentTestName.classList.remove('text-green-600', 'font-semibold');
        currentTestName.classList.add('text-gray-500');
      }
    }
    
    // 更新当前测试套件信息
    if (currentSuite) {
      if (suiteName) {
        currentSuite.textContent = `测试套件: ${suiteName}`;
      } else if (safeCurrent > 0) {
        currentSuite.textContent = `已完成 ${safeCurrent} 个测试`;
      } else {
        currentSuite.textContent = '正在初始化测试环境...';
      }
    }
  } else if (data.running) {
    // 如果正在运行但没有进度信息，显示运行中
    if (currentTestName) {
      currentTestName.textContent = '正在启动测试...';
      currentTestName.classList.remove('text-green-600', 'font-semibold');
      currentTestName.classList.add('text-gray-500');
    }
    if (currentSuite) {
      currentSuite.textContent = '正在加载测试套件...';
    }
    if (progressBar) {
      progressBar.style.width = '5%'; // 显示一个小的进度指示
    }
    if (progressPercentage) {
      progressPercentage.textContent = '0%';
    }
  }
}

// 保存原始更新函数（用于全屏模式）
if (typeof window.originalUpdateLogs === 'undefined') {
  window.originalUpdateLogs = null;
}

// 保存原始更新函数（用于全屏模式）
if (typeof window.originalUpdateLogs === 'undefined') {
  window.originalUpdateLogs = null;
}

// 更新测试日志（简化版本，服务器端已经添加了时间戳）
function updateTestLogs(logs) {
  if (!logs || !Array.isArray(logs)) {
    return;
  }
  
  // 只处理新日志（从上次处理的位置开始）
  const newLogs = logs.slice(lastLogCount);
  if (newLogs.length === 0) {
    return; // 没有新日志
  }
  
  // 更新已处理的日志数量
  lastLogCount = logs.length;
  
  // 直接将新日志添加到缓存（服务器端已经添加了时间戳）
  newLogs.forEach(log => {
    if (typeof log === 'string' && log.trim()) {
      testLogsCache.push(log);
    } else if (log && typeof log === 'object') {
      // 处理对象格式的日志
      const logMessage = log.message || log.text || String(log);
      if (logMessage) {
        testLogsCache.push(logMessage);
      }
    }
  });
  
  // 限制日志缓存大小（保留最后1000行）
  if (testLogsCache.length > 1000) {
    testLogsCache = testLogsCache.slice(-1000);
  }
  
  // 更新日志显示 - 优先显示在占位符中
  const logsTextPlaceholder = document.getElementById('testLogsTextPlaceholder');
  const logsContentPlaceholder = document.getElementById('testLogsContentPlaceholder');
  
  // 如果占位符存在，显示在占位符中
  if (logsTextPlaceholder) {
    logsTextPlaceholder.textContent = testLogsCache.join('\n');
    // 自动滚动到底部
    if (logsContentPlaceholder) {
      // 使用 requestAnimationFrame 确保 DOM 更新后再滚动
      requestAnimationFrame(() => {
        logsContentPlaceholder.scrollTop = logsContentPlaceholder.scrollHeight;
      });
    }
    
    // 如果全屏模式开启，同步更新全屏视图
    if (typeof logsFullscreenMode !== 'undefined' && logsFullscreenMode) {
      const fullscreenLogsText = document.getElementById('testLogsTextFullscreen');
      const fullscreenContainer = document.getElementById('testLogsFullscreenContainer');
      const fullscreenContent = fullscreenContainer?.querySelector('.flex-1.overflow-y-auto');
      if (fullscreenLogsText) {
        fullscreenLogsText.textContent = testLogsCache.join('\n');
        if (fullscreenContent) {
          requestAnimationFrame(() => {
            fullscreenContent.scrollTop = fullscreenContent.scrollHeight;
          });
        }
      }
    }
  } else {
    // 如果占位符不存在，使用原来的日志容器
    const logsText = document.getElementById('testLogsText');
    const logsContainer = document.getElementById('testLogsContainer');
    const logsContent = document.getElementById('testLogsContent');
    
    if (logsText) {
      logsText.textContent = testLogsCache.join('\n');
      // 自动滚动到底部
      if (logsContent && !logsContent.classList.contains('hidden')) {
        // 使用 requestAnimationFrame 确保 DOM 更新后再滚动
        requestAnimationFrame(() => {
          logsContent.scrollTop = logsContent.scrollHeight;
        });
      }
    }
    
    // 确保日志容器可见
    if (logsContainer) {
      logsContainer.classList.remove('hidden');
    }
    if (logsContent) {
      logsContent.classList.remove('hidden');
    }
  }
}

// 切换测试日志显示/隐藏
function toggleTestLogs() {
  const logsContent = document.getElementById('testLogsContent');
  const toggleBtn = document.getElementById('toggleLogsBtn');
  
  if (!logsContent || !toggleBtn) {
    return;
  }
  
  const isHidden = logsContent.classList.contains('hidden');
  
  if (isHidden) {
    logsContent.classList.remove('hidden');
    toggleBtn.textContent = '收起';
    // 滚动到底部
    setTimeout(() => {
      logsContent.scrollTop = logsContent.scrollHeight;
    }, 100);
  } else {
    logsContent.classList.add('hidden');
    toggleBtn.textContent = '展开';
  }
}

// 停止测试
async function stopTests() {
  if (!testRunning) {
    showToast('没有正在运行的测试', 'warning');
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/admin/developer/stop-tests`, {
      method: 'POST',
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      testRunning = false;
      const stopBtn = document.getElementById('stopTestsBtn');
      if (stopBtn) stopBtn.classList.add('hidden');
      if (testProgressInterval) {
        clearInterval(testProgressInterval);
        testProgressInterval = null;
      }
      showToast('测试已停止', 'success');
      // 添加停止日志
      updateTestLogs(['[INFO] 测试已手动停止']);
    } else {
      showToast('停止测试失败: ' + (data.message || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('Stop tests failed:', error);
    showToast('停止测试失败: ' + error.message, 'error');
  }
}

// 加载测试报告
async function loadTestReport() {
  try {
    // 等待报告生成（最多等待10秒）
    let retries = 0;
    const maxRetries = 20;
    
    while (retries < maxRetries) {
      try {
        const response = await fetch(`${API_BASE}/admin/developer/test-report`, {
          credentials: 'include'
        });
        
        if (response.ok) {
          const html = await response.text();
          // 检查是否是有效的HTML报告
          if (html.length > 1000 && (html.includes('测试报告') || html.includes('test-report') || html.includes('Test Suites') || html.includes('测试结果') || html.includes('<!DOCTYPE html'))) {
            // 在新窗口中打开测试报告
            // 添加时间戳确保获取最新内容
            const reportUrl = `${API_BASE}/admin/developer/test-report?t=${Date.now()}`;
            const newWindow = window.open(reportUrl, '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
            
            if (newWindow) {
              console.log('Test report opened in new window');
              showToast('测试报告已在新窗口中打开', 'success');
            } else {
              // 如果弹窗被阻止，提示用户
              showToast('无法打开新窗口，请检查浏览器弹窗设置', 'warning');
              // 作为备选方案，在当前窗口打开
              window.location.href = reportUrl;
            }
            
            return;
          }
        }
      } catch (fetchError) {
        console.error('Fetch error:', fetchError);
        // 继续重试
      }
      
      // 等待500ms后重试
      await new Promise(resolve => setTimeout(resolve, 500));
      retries++;
    }
    
    // 如果重试后仍然失败，显示错误
    showToast('测试报告尚未生成，请稍候再试', 'warning');
    
  } catch (error) {
    console.error('Load test report failed:', error);
    showToast('加载测试报告失败: ' + error.message, 'error');
  }
}

// 显示报告错误（已废弃，现在使用toast提示）
function showReportError(message) {
  // 不再使用iframe显示错误，直接使用toast提示
  showToast(message, 'error');
}

// 切换日志全屏显示
function toggleTestLogsFullscreen() {
  const logsContentPlaceholder = document.getElementById('testLogsContentPlaceholder');
  const placeholder = document.getElementById('testReportPlaceholder');
  const fullscreenBtn = document.getElementById('fullscreenLogsBtn');
  
  if (!logsContentPlaceholder || !placeholder) {
    return;
  }
  
  if (!logsFullscreenMode) {
    // 进入全屏模式
    logsFullscreenMode = true;
    
    // 创建全屏容器
    const fullscreenContainer = document.createElement('div');
    fullscreenContainer.id = 'testLogsFullscreenContainer';
    fullscreenContainer.className = 'fixed inset-0 z-50 bg-gray-900 flex flex-col';
    fullscreenContainer.style.cssText = 'top: 0; left: 0; right: 0; bottom: 0;';
    
    // 创建全屏头部
    const fullscreenHeader = document.createElement('div');
    fullscreenHeader.className = 'bg-gray-800 text-white p-4 flex items-center justify-between flex-shrink-0 border-b border-gray-700';
    fullscreenHeader.innerHTML = `
      <div class="flex items-center space-x-3">
        <span class="text-lg font-semibold">测试日志（全屏模式）</span>
        <span id="fullscreenLogsStatus" class="text-sm text-gray-400"></span>
      </div>
      <div class="flex items-center space-x-2">
        <button onclick="toggleTestLogsFullscreen()" class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition">
          ✕ 退出全屏
        </button>
      </div>
    `;
    
    // 创建全屏内容区域
    const fullscreenContent = document.createElement('div');
    fullscreenContent.className = 'flex-1 overflow-y-auto bg-gray-900 text-gray-100 font-mono text-xs p-4';
    fullscreenContent.style.cssText = 'font-size: 13px; line-height: 1.6;';
    
    // 复制日志内容
    const logsTextPlaceholder = document.getElementById('testLogsTextPlaceholder');
    if (logsTextPlaceholder) {
      const fullscreenLogsText = document.createElement('div');
      fullscreenLogsText.className = 'whitespace-pre-wrap text-left';
      fullscreenLogsText.id = 'testLogsTextFullscreen';
      fullscreenLogsText.textContent = logsTextPlaceholder.textContent || testLogsCache.join('\n');
      fullscreenContent.appendChild(fullscreenLogsText);
    }
    
    // 组装全屏容器
    fullscreenContainer.appendChild(fullscreenHeader);
    fullscreenContainer.appendChild(fullscreenContent);
    
    // 添加到body
    document.body.appendChild(fullscreenContainer);
    
    // 更新按钮文本
    if (fullscreenBtn) {
      fullscreenBtn.textContent = '退出全屏';
    }
    
    // 滚动到底部
    setTimeout(() => {
      fullscreenContent.scrollTop = fullscreenContent.scrollHeight;
    }, 100);
    
  } else {
    // 退出全屏模式
    logsFullscreenMode = false;
    const fullscreenContainer = document.getElementById('testLogsFullscreenContainer');
    if (fullscreenContainer) {
      fullscreenContainer.remove();
    }
    
    // 更新按钮文本
    if (fullscreenBtn) {
      fullscreenBtn.textContent = '⛶ 全屏';
    }
  }
}
