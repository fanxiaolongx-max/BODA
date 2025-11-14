// API基础URL
const API_BASE = '/api';

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

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 初始化多语言
  if (typeof initLanguageSwitcher === 'function') {
    initLanguageSwitcher();
  }
  if (typeof applyTranslations === 'function') {
    applyTranslations();
  }
  
  checkAuth();
  
  // 登录表单提交
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await login();
  });
});

// 应用翻译
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key && typeof t === 'function') {
      el.textContent = t(key);
    }
  });
}

// 检查认证状态
async function checkAuth() {
  try {
    const response = await fetch(`${API_BASE}/auth/admin/me`, {
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      currentAdmin = data.admin;
      showMainPage();
      // 根据admin状态显示/隐藏Developer菜单
      updateDeveloperMenuVisibility();
    } else {
      showLoginPage();
    }
  } catch (error) {
    console.error('认证检查失败:', error);
    showLoginPage();
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
    } else {
      alert(data.message || '登录失败');
    }
  } catch (error) {
    console.error('登录失败:', error);
    alert('登录失败，请重试');
  }
}

// 登出
async function logout() {
  try {
    await fetch(`${API_BASE}/auth/admin/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    currentAdmin = null;
    showLoginPage();
  } catch (error) {
    console.error('登出失败:', error);
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
function switchTab(tabName) {
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
        alert('Access denied. Super admin privileges required.');
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
  if (!confirm('Are you sure you want to end the current cycle and calculate discounts? This action cannot be undone.')) {
    return;
  }
  
  try {
    const response = await fetch(`${API_BASE}/admin/cycles/${cycleId}/confirm`, {
      method: 'POST',
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert(`Cycle confirmed successfully! Discount rate: ${data.discountRate.toFixed(1)}%, updated ${data.orderCount} orders`);
      loadDashboard();
      loadOrders();
    } else {
      alert(data.message || 'Confirmation failed');
    }
  } catch (error) {
    console.error('Failed to confirm cycle:', error);
    alert('Confirmation failed');
  }
}

// 加载系统设置
async function loadSettings() {
  try {
    const response = await fetch(`${API_BASE}/admin/settings`, {
      credentials: 'include'
    });
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
    }
  } catch (error) {
    console.error('加载设置失败:', error);
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
      alert(newStatus === 'true' ? 'Ordering opened' : 'Ordering closed');
    }
  } catch (error) {
    console.error('Failed to toggle ordering status:', error);
    alert('Operation failed');
  }
}

// 计算折扣
async function calculateDiscount() {
  if (!confirm('Are you sure you want to recalculate discounts for all orders?')) return;
  
  try {
    const response = await fetch(`${API_BASE}/public/calculate-discount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    if (data.success) {
      alert('Discount calculation completed! Discount rate: ' + (data.discount_rate * 100) + '%');
      loadDashboard();
      loadOrders();
    }
  } catch (error) {
    console.error('Failed to calculate discount:', error);
    alert('Calculation failed');
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
    alert('Export failed');
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
      
      return `
        <div class="mb-2 p-2 bg-gray-50 rounded text-xs">
          <div class="font-semibold text-gray-900">${item.product_name} × ${item.quantity}</div>
          <div class="mt-1 space-y-0.5 text-gray-600">
            ${item.size ? `<div>Size: ${item.size}</div>` : ''}
            ${item.sugar_level ? `<div>Sweetness: ${sugarLabels[item.sugar_level] || item.sugar_level}%</div>` : ''}
            ${item.ice_level ? `<div>Ice Level: ${iceLabels[item.ice_level] || item.ice_level}</div>` : ''}
            ${toppings.length > 0 ? `<div>Toppings: ${Array.isArray(toppings) ? toppings.join(', ') : toppings}</div>` : ''}
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
      alert('Status updated successfully');
      loadOrders();
      loadDashboard();
    } else {
      alert(data.message || 'Update failed');
    }
  } catch (error) {
    console.error('Failed to update order status:', error);
    alert('Update failed');
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
      <button onclick="showProductModal()" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
        + Add Product
      </button>
    </div>
    
    <div class="bg-white rounded-xl shadow-sm overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Image</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          ${products.length === 0 ? '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No products</td></tr>' : ''}
          ${products.map(product => `
            <tr>
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
              <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
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
            <label class="block text-sm font-medium text-gray-700 mb-2">Available Toppings</label>
            <div id="toppingsContainer" class="border border-gray-300 rounded-lg p-4 bg-gray-50">
              <div class="text-sm text-gray-600 mb-2">Select which toppings are available for this product</div>
              <div id="toppingsList" class="space-y-2"></div>
              <div class="text-xs text-gray-500 mt-2">Toppings are products with description "额外加料" or in "Other" category</div>
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
  
  // 加载所有加料产品
  await loadToppings();
  
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
    
    // 加载可选加料
    loadAvailableToppings(product.available_toppings || '[]');
    
    // 加载冰度选项
    loadIceOptions(product.ice_options || '["normal","less","no","room","hot"]');
    
    if (product.image_url) {
      document.getElementById('currentImage').innerHTML = 
        `<img src="${product.image_url}" class="w-32 h-32 object-cover rounded-lg">`;
    }
  } else {
    title.textContent = 'Add Product';
    document.getElementById('productForm').reset();
    document.getElementById('currentImage').innerHTML = '';
    document.getElementById('sizesList').innerHTML = '';
    document.getElementById('toppingsList').innerHTML = '';
    // 重置冰度选项为全选
    const iceCheckboxes = document.querySelectorAll('.ice-option-checkbox');
    iceCheckboxes.forEach(cb => cb.checked = true);
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
      renderToppingsList();
    }
  } catch (error) {
    console.error('加载加料产品失败:', error);
  }
}

// 渲染加料列表
function renderToppingsList() {
  const toppingsList = document.getElementById('toppingsList');
  if (!toppingsList) return;
  
  if (allToppings.length === 0) {
    toppingsList.innerHTML = '<div class="text-sm text-gray-500">No toppings available. Please add topping products first.</div>';
    return;
  }
  
  toppingsList.innerHTML = allToppings.map(topping => `
    <label class="flex items-center space-x-2 cursor-pointer">
      <input type="checkbox" class="topping-checkbox" value="${topping.id}" 
             data-topping-id="${topping.id}">
      <span class="text-sm text-gray-700">${topping.name} (${formatPrice(topping.price)})</span>
    </label>
  `).join('');
}

// 加载可选加料
function loadAvailableToppings(availableToppingsJson) {
  const toppingsList = document.getElementById('toppingsList');
  if (!toppingsList) return;
  
  try {
    const availableToppings = typeof availableToppingsJson === 'string' 
      ? JSON.parse(availableToppingsJson) 
      : availableToppingsJson;
    
    if (Array.isArray(availableToppings)) {
      availableToppings.forEach(toppingId => {
        const checkbox = toppingsList.querySelector(`.topping-checkbox[value="${toppingId}"]`);
        if (checkbox) {
          checkbox.checked = true;
        }
      });
    }
  } catch (e) {
    console.error('Failed to parse available_toppings:', e);
  }
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
  
  const id = document.getElementById('productId').value;
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
  
  // 收集可选加料
  const availableToppings = [];
  const toppingCheckboxes = document.querySelectorAll('.topping-checkbox:checked');
  toppingCheckboxes.forEach(checkbox => {
    availableToppings.push(parseInt(checkbox.value));
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
    const url = id ? `${API_BASE}/admin/products/${id}` : `${API_BASE}/admin/products`;
    const method = id ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      credentials: 'include',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert(id ? 'Product updated successfully' : 'Product added successfully');
      closeProductModal();
      loadProducts();
    } else {
      alert(data.message || 'Operation failed');
    }
  } catch (error) {
    console.error('Failed to save product:', error);
    alert('Operation failed');
  }
}

async function deleteProduct(id) {
  if (!confirm('Are you sure you want to delete this product?')) return;
  
  try {
    const response = await fetch(`${API_BASE}/admin/products/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert('Deleted successfully');
      loadProducts();
    } else {
      alert(data.message || 'Delete failed');
    }
  } catch (error) {
    console.error('Failed to delete product:', error);
    alert('Delete failed');
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
      <button onclick="showCategoryModal()" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
        + Add Category
      </button>
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
      alert(id ? 'Category updated successfully' : 'Category added successfully');
      closeCategoryModal();
      loadCategories();
    } else {
      alert(result.message || '操作失败');
    }
  } catch (error) {
    console.error('Failed to save category:', error);
    alert('Operation failed');
  }
}

async function deleteCategory(id) {
  if (!confirm('Are you sure you want to delete this category?')) return;
  
  try {
    const response = await fetch(`${API_BASE}/admin/categories/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert('Deleted successfully');
      loadCategories();
    } else {
      alert(data.message || 'Delete failed');
    }
  } catch (error) {
    console.error('Failed to delete category:', error);
    alert('Delete failed');
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
      alert(id ? 'Discount rule updated successfully' : 'Discount rule added successfully');
      closeDiscountModal();
      loadDiscounts();
    } else {
      alert(result.message || '操作失败');
    }
  } catch (error) {
    console.error('Failed to save discount rule:', error);
    alert('Operation failed');
  }
}

async function editDiscountRule(rule) {
  showDiscountModal(rule);
}

async function deleteDiscountRule(id) {
  if (!confirm('Are you sure you want to delete this discount rule?')) return;
  
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
      alert('Discount rule deleted successfully');
      loadDiscounts();
    } else {
      alert(result.message || 'Delete failed');
    }
  } catch (error) {
    console.error('Failed to delete discount rule:', error);
    alert('Delete failed');
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
        </div>
      `;
      
      // 设置表单提交事件
      document.getElementById('settingsForm')?.addEventListener('submit', saveSettings);
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
    alert('Max Visible Cycles must be between 1 and 100');
    return;
  }
  
  const settings = {
    ordering_open: document.getElementById('orderingOpen').value,
    system_notice: document.getElementById('systemNotice').value,
    store_name: document.getElementById('storeName').value.trim() || 'BOBA TEA',
    currency_symbol: document.getElementById('currencySymbol').value.trim() || 'LE',
    max_visible_cycles: maxVisibleCycles.toString()
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
      alert('Settings saved successfully');
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
      alert(result.message || 'Save failed');
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
    alert('Save failed');
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
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Orders</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Spent</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registered</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Login</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  ${users.length === 0 ? 
                    '<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">No users</td></tr>' :
                    users.map(user => `
                      <tr class="hover:bg-gray-50">
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.id}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.phone}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.name || 'Not set'}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.order_count || 0}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatPriceDecimal(user.total_spent || 0)}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.created_at ? new Date(user.created_at).toLocaleString('en-US') : '-'}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.last_login ? new Date(user.last_login).toLocaleString('en-US') : '-'}</td>
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

// 加载管理员管理
async function loadAdmins() {
  const container = document.getElementById('adminsTab');
  
  try {
    const response = await fetch(`${API_BASE}/admin/admins`, { credentials: 'include' });
    const data = await response.json();
    
    if (data.success) {
      const admins = data.admins || [];
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
                <tbody class="bg-white divide-y divide-gray-200">
                  ${admins.length === 0 ? 
                    '<tr><td colspan="8" class="px-6 py-4 text-center text-gray-500">No admins</td></tr>' :
                    admins.map(admin => `
                      <tr class="hover:bg-gray-50">
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
                          <button onclick='editAdmin(${JSON.stringify(admin).replace(/'/g, "&apos;")})' 
                                  class="text-blue-600 hover:text-blue-800 mr-3">Edit</button>
                          <button onclick='deleteAdmin(${admin.id})' 
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
                <input type="password" id="adminPassword" required 
                       class="w-full px-4 py-2 border border-gray-300 rounded-lg">
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Name</label>
                <input type="text" id="adminName" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
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
      
      // 设置表单提交事件
      document.getElementById('adminForm')?.addEventListener('submit', saveAdmin);
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
    alert('Access denied. Only super admin can manage other admins.');
    return;
  }
  
  const modal = document.getElementById('adminModal');
  const title = document.getElementById('adminModalTitle');
  
  if (admin) {
    title.textContent = 'Edit Admin';
    document.getElementById('adminId').value = admin.id;
    document.getElementById('adminUsername').value = admin.username;
    document.getElementById('adminPassword').required = false;
    document.getElementById('adminPassword').value = '';
    document.getElementById('passwordLabel').textContent = '(Leave empty to keep unchanged)';
    document.getElementById('adminName').value = admin.name || '';
    document.getElementById('adminEmail').value = admin.email || '';
    const roleSelect = document.getElementById('adminRole');
    if (roleSelect) {
      roleSelect.value = admin.role || 'admin';
    }
    document.getElementById('adminStatus').value = admin.status || 'active';
  } else {
    title.textContent = 'Add Admin';
    document.getElementById('adminForm').reset();
    document.getElementById('adminPassword').required = true;
    document.getElementById('passwordLabel').textContent = '*';
    const roleSelect = document.getElementById('adminRole');
    if (roleSelect) {
      roleSelect.value = 'admin';
    }
  }
  
  modal.classList.add('active');
  modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeAdminModal() {
  document.getElementById('adminModal').classList.remove('active');
}

async function saveAdmin(e) {
  e.preventDefault();
  
  // 只有super_admin可以管理其他admin
  if (!isSuperAdmin()) {
    alert('Access denied. Only super admin can manage other admins.');
    return;
  }
  
  const id = document.getElementById('adminId').value;
  const data = {
    username: document.getElementById('adminUsername').value,
    name: document.getElementById('adminName').value,
    email: document.getElementById('adminEmail').value,
    status: document.getElementById('adminStatus').value
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
    const url = id ? `${API_BASE}/admin/admins/${id}` : `${API_BASE}/admin/admins`;
    const method = id ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert(id ? 'Admin updated successfully' : 'Admin added successfully');
      closeAdminModal();
      loadAdmins();
    } else {
      alert(result.message || '操作失败');
    }
  } catch (error) {
    console.error('Failed to save admin:', error);
    alert('Operation failed');
  }
}

function editAdmin(admin) {
  showAdminModal(admin);
}

// 加载操作日志
async function loadLogs() {
  const container = document.getElementById('logsTab');
  
  try {
    const response = await fetch(`${API_BASE}/admin/logs?limit=100`, { credentials: 'include' });
    const data = await response.json();
    
    if (data.success) {
      const logs = data.logs || [];
      
      container.innerHTML = `
        <div class="fade-in">
          <h2 class="text-2xl font-bold text-gray-900 mb-6">Logs</h2>
          
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
                <tbody class="bg-white divide-y divide-gray-200">
                  ${logs.length === 0 ? 
                    '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No logs</td></tr>' :
                    logs.map(log => {
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
                        <tr class="hover:bg-gray-50">
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
                    }).join('')
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
    console.error('加载日志失败:', error);
    container.innerHTML = '<div class="text-center py-12 text-red-500">加载失败</div>';
  }
}

// 加载关于页面
function loadAboutPage() {
  const container = document.getElementById('aboutTab');
  const version = '1.0.0';
  const currentStoreName = storeName || 'BOBA TEA'; // 使用当前商店名称，如果没有则使用默认值
  
  container.innerHTML = `
    <div class="space-y-6">
      <div class="bg-white rounded-xl shadow-sm p-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-4">🧋 ${currentStoreName} Ordering System</h2>
        <div class="space-y-4">
          <div>
            <p class="text-sm text-gray-600 mb-2">Version</p>
            <p class="text-lg font-semibold text-gray-900">${version}</p>
          </div>
          <div>
            <p class="text-sm text-gray-600 mb-2">Description</p>
            <p class="text-gray-700">A comprehensive online ordering system for ${currentStoreName.toLowerCase()} shops with cycle-based order management, discount rules, and payment tracking.</p>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm p-6">
        <h3 class="text-xl font-bold text-gray-900 mb-4">📋 User Order Logic</h3>
        <div class="space-y-4 text-gray-700">
          <div>
            <h4 class="font-semibold text-gray-900 mb-2">1. User Registration & Login</h4>
            <ul class="list-disc list-inside space-y-1 ml-4 text-sm">
              <li>Users can browse the menu without logging in</li>
              <li>When placing an order, users must provide a phone number (required, 8-15 digits)</li>
              <li>Name field is optional</li>
              <li>Phone number is used as the unique identifier for users</li>
              <li>If a phone number already exists, the system will use the existing user account</li>
            </ul>
          </div>

          <div>
            <h4 class="font-semibold text-gray-900 mb-2">2. Order Placement</h4>
            <ul class="list-disc list-inside space-y-1 ml-4 text-sm">
              <li>Users can add products to cart and customize:
                <ul class="list-circle list-inside ml-6 mt-1 space-y-1">
                  <li>Cup size (Small, Medium, Large) - affects base price</li>
                  <li>Sugar level (0%, 30%, 50%, 70%, 100%)</li>
                  <li>Ice level (Normal Ice, Less Ice, No Ice, Room Temperature, Hot) - if allowed by product</li>
                  <li>Extra toppings - each topping adds to the price</li>
                  <li>Order notes (optional text field)</li>
                </ul>
              </li>
              <li>Real-time price calculation based on selections</li>
              <li>Orders can only be placed when ordering is open (admin-controlled)</li>
              <li>Each order gets a unique order number (e.g., BO12345678)</li>
            </ul>
          </div>

          <div>
            <h4 class="font-semibold text-gray-900 mb-2">3. Order Status Flow</h4>
            <ul class="list-disc list-inside space-y-1 ml-4 text-sm">
              <li><strong>Pending Payment</strong>: Initial status when order is placed
                <ul class="list-circle list-inside ml-6 mt-1">
                  <li>Users can modify or delete orders during the ordering open period</li>
                  <li>Users can upload payment screenshots (only after ordering is closed)</li>
                </ul>
              </li>
              <li><strong>Paid</strong>: Admin marks order as paid after verifying payment screenshot</li>
              <li><strong>Completed</strong>: Admin marks order as completed after fulfillment</li>
              <li><strong>Cancelled</strong>: Order is cancelled (by user or admin)</li>
            </ul>
          </div>

          <div>
            <h4 class="font-semibold text-gray-900 mb-2">4. Order Modification & Deletion</h4>
            <ul class="list-disc list-inside space-y-1 ml-4 text-sm">
              <li>Users can only modify/delete orders with "Pending Payment" status</li>
              <li>Modification is only allowed during the ordering open period</li>
              <li>Once ordering is closed, users can only upload payment screenshots</li>
            </ul>
          </div>

          <div>
            <h4 class="font-semibold text-gray-900 mb-2">5. Payment Screenshot Upload</h4>
            <ul class="list-disc list-inside space-y-1 ml-4 text-sm">
              <li>Upload button is disabled and grayed out while ordering is open</li>
              <li>Users can upload payment screenshots only after admin closes ordering</li>
              <li>Payment screenshots can be viewed by both users and admins</li>
              <li>Admin verifies payment and updates order status to "Paid"</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm p-6">
        <h3 class="text-xl font-bold text-gray-900 mb-4">🔄 Order Cycle Logic</h3>
        <div class="space-y-4 text-gray-700">
          <div>
            <h4 class="font-semibold text-gray-900 mb-2">1. Cycle Creation</h4>
            <ul class="list-disc list-inside space-y-1 ml-4 text-sm">
              <li>When admin opens ordering (Settings → Ordering Open = ON), a new cycle is automatically created</li>
              <li>Each cycle has a unique ID and cycle number (e.g., CYCLE1763034929647)</li>
              <li>Cycle status is set to "active"</li>
              <li>Cycle start time is recorded as the current local time</li>
            </ul>
          </div>

          <div>
            <h4 class="font-semibold text-gray-900 mb-2">2. Active Cycle Period</h4>
            <ul class="list-disc list-inside space-y-1 ml-4 text-sm">
              <li>All orders placed during this period belong to the active cycle</li>
              <li>Orders are automatically associated with the cycle based on their creation time</li>
              <li>Users can place, modify, and delete orders freely</li>
              <li>Total order amount for the cycle is calculated in real-time</li>
            </ul>
          </div>

          <div>
            <h4 class="font-semibold text-gray-900 mb-2">3. Cycle Closure</h4>
            <ul class="list-disc list-inside space-y-1 ml-4 text-sm">
              <li>When admin closes ordering (Settings → Ordering Open = OFF), the cycle is automatically ended</li>
              <li>Cycle end time is recorded as the current local time</li>
              <li>Cycle status changes from "active" to "ended"</li>
              <li>System automatically calculates the total amount for all "Pending Payment" orders in this cycle</li>
            </ul>
          </div>

          <div>
            <h4 class="font-semibold text-gray-900 mb-2">4. Automatic Discount Calculation</h4>
            <ul class="list-disc list-inside space-y-1 ml-4 text-sm">
              <li>When a cycle ends, the system automatically calculates discounts based on:
                <ul class="list-circle list-inside ml-6 mt-1">
                  <li>Total amount of all orders in the cycle (sum of final_amount)</li>
                  <li>Discount rules configured in the Discounts section</li>
                </ul>
              </li>
              <li>Discount rules are evaluated in descending order of min_amount</li>
              <li>The first matching rule (where total_amount >= min_amount) is applied</li>
              <li>Discount is applied to all "Pending Payment" orders in the cycle:
                <ul class="list-circle list-inside ml-6 mt-1">
                  <li>discount_amount = total_amount × discount_rate</li>
                  <li>final_amount = total_amount - discount_amount</li>
                </ul>
              </li>
              <li>Cycle discount_rate is updated to reflect the applied discount</li>
            </ul>
          </div>

          <div>
            <h4 class="font-semibold text-gray-900 mb-2">5. Payment Verification Period</h4>
            <ul class="list-disc list-inside space-y-1 ml-4 text-sm">
              <li>After cycle closure, users can upload payment screenshots</li>
              <li>Admin reviews payment screenshots and marks orders as "Paid"</li>
              <li>Once all orders are verified, admin can confirm the cycle (Dashboard → Confirm Cycle)</li>
              <li>Cycle status changes from "ended" to "confirmed"</li>
            </ul>
          </div>

          <div>
            <h4 class="font-semibold text-gray-900 mb-2">6. Order Cycle Association</h4>
            <ul class="list-disc list-inside space-y-1 ml-4 text-sm">
              <li>Orders are associated with cycles based on their created_at timestamp</li>
              <li>An order belongs to a cycle if: cycle.start_time <= order.created_at <= cycle.end_time (or current time if cycle is active)</li>
              <li>If no active cycle exists, all orders are considered part of the "current cycle" (not grayed out)</li>
              <li>Orders from previous cycles are displayed in gray when a new cycle starts</li>
            </ul>
          </div>

          <div>
            <h4 class="font-semibold text-gray-900 mb-2">7. Cycle Archiving</h4>
            <ul class="list-disc list-inside space-y-1 ml-4 text-sm">
              <li>Only the most recent N cycles are displayed (configurable in Settings → Max Visible Cycles, default: 10)</li>
              <li>Older cycles are automatically archived to CSV files in logs/export/ directory</li>
              <li>Archived cycles are no longer visible in the Orders page</li>
              <li>Archived CSV files contain all order details including cycle information</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm p-6">
        <h3 class="text-xl font-bold text-gray-900 mb-4">⚙️ System Features</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
          <div>
            <h4 class="font-semibold text-gray-900 mb-2">Product Management</h4>
            <ul class="list-disc list-inside space-y-1 ml-4">
              <li>Product categories with custom sorting</li>
              <li>Multiple cup sizes with individual pricing</li>
              <li>Customizable sugar levels per product</li>
              <li>Ice level options (configurable per product)</li>
              <li>Extra toppings management</li>
              <li>Product images support</li>
            </ul>
          </div>
          <div>
            <h4 class="font-semibold text-gray-900 mb-2">Discount System</h4>
            <ul class="list-disc list-inside space-y-1 ml-4">
              <li>Flexible discount rules based on total amount</li>
              <li>Automatic discount calculation per cycle</li>
              <li>Discount applied to all orders in a cycle</li>
            </ul>
          </div>
          <div>
            <h4 class="font-semibold text-gray-900 mb-2">User Management</h4>
            <ul class="list-disc list-inside space-y-1 ml-4">
              <li>Phone-based user identification</li>
              <li>User order history</li>
              <li>Order status tracking</li>
            </ul>
          </div>
          <div>
            <h4 class="font-semibold text-gray-900 mb-2">Admin Features</h4>
            <ul class="list-disc list-inside space-y-1 ml-4">
              <li>Order management and status updates</li>
              <li>Payment screenshot verification</li>
              <li>Cycle management and confirmation</li>
              <li>Comprehensive operation logs</li>
              <li>Order export to CSV</li>
            </ul>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm p-6">
        <h3 class="text-xl font-bold text-gray-900 mb-4">🔒 Security & Data</h3>
        <div class="space-y-2 text-sm text-gray-700">
          <p><strong>Database:</strong> SQLite with WAL mode for better concurrency</p>
          <p><strong>Authentication:</strong> Session-based with bcrypt password hashing</p>
          <p><strong>Rate Limiting:</strong> API rate limiting to prevent abuse</p>
          <p><strong>Logging:</strong> Comprehensive logging with daily rotation</p>
          <p><strong>Time Zone:</strong> Uses server local time (datetime('now', 'localtime'))</p>
        </div>
      </div>
    </div>
  `;
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
  await loadTablesList();
}

// 加载数据库表列表
async function loadTablesList() {
  try {
    const response = await fetch(`${API_BASE}/admin/developer/tables`, {
      credentials: 'include'
    });
    const data = await response.json();
    
    if (data.success) {
      const container = document.getElementById('tablesList');
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
  } catch (error) {
    console.error('加载表列表失败:', error);
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
    alert('Failed to load table data');
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
  if (confirm('Are you sure you want to delete this row?')) {
    deletedRows.add(rowIndex);
    editedRows.delete(rowIndex);
    renderTableData();
  }
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
    alert('No changes to save');
    return;
  }
  
  if (!confirm(`Save changes? ${editedRows.size} edited, ${deletedRows.size} deleted, ${newRows.length} new rows`)) {
    return;
  }
  
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
      alert('Changes saved successfully');
      // 重新加载数据
      await loadTableData(currentTableName);
    } else {
      alert('Failed to save changes: ' + (data.message || 'Unknown error'));
    }
  } catch (error) {
    console.error('保存失败:', error);
    alert('Failed to save changes');
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
    alert('Please enter a SQL query');
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
    alert('Failed to execute SQL query');
  }
}

