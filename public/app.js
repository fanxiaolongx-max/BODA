// API基础URL（如果未定义则定义，避免重复声明）
if (typeof API_BASE === 'undefined') {
  var API_BASE = '/api';
}

// 当前用户信息
let currentUser = null;
let currentSettings = {};
let categories = [];
let products = [];
let cart = [];
let selectedCategory = null;
let currentPaymentOrderId = null;
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
document.addEventListener('DOMContentLoaded', async () => {
  // 先隐藏所有tab，避免闪烁
  document.getElementById('homeTab')?.classList.add('hidden');
  document.getElementById('menuTab')?.classList.add('hidden');
  document.getElementById('ordersTab')?.classList.add('hidden');
  document.getElementById('profileTab')?.classList.add('hidden');
  
  // 先加载设置，更新商店名称，避免闪烁
  await loadSettings();
  
  // Apply translations (在设置加载之后，确保商店名称已更新)
  if (typeof applyTranslations === 'function') {
    applyTranslations();
  }
  
  // 直接显示主页面，无需登录
  await showMainPage();
  
  // 默认显示Home页面（在设置加载完成后）
  showBottomTab('home');
  
  // 后台检查认证状态（不阻塞页面显示，不弹出登录框）
  // 延迟执行，确保所有脚本都已加载
  setTimeout(() => {
    checkAuth();
  }, 100);
  
  // 登录表单提交
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await login();
  });
  
  // 付款表单提交
  document.getElementById('paymentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await uploadPayment();
  });
});

// 应用翻译
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (key && typeof t === 'function') {
      // 如果是 app_name，跳过（由 updateStoreName 处理）
      if (key === 'app_name') {
        return;
      }
      el.textContent = t(key);
    }
  });
}

// 检查认证状态
async function checkAuth() {
  try {
    // 确保apiGet函数已加载
    if (typeof apiGet === 'undefined') {
      // 如果apiGet未定义，使用fetch
      const response = await fetch(`${API_BASE}/auth/user/me`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.user) {
          currentUser = data.user;
          updateLoginStatus();
        } else {
          currentUser = null;
          updateLoginStatus();
        }
      } else {
        currentUser = null;
        updateLoginStatus();
      }
    } else {
      const data = await apiGet('/auth/user/me', { showError: false });
      if (data && data.user) {
        currentUser = data.user;
        updateLoginStatus();
      } else {
        currentUser = null;
        updateLoginStatus();
      }
    }
  } catch (error) {
    // 认证失败是正常的（用户未登录），不显示错误，也不弹出登录框
    currentUser = null;
    updateLoginStatus();
  }
}

// 登录
async function login() {
  const phone = document.getElementById('phone').value.trim();
  const name = document.getElementById('name').value.trim();
  const codeSection = document.getElementById('verificationCodeSection');
  const isCodeVisible = codeSection && !codeSection.classList.contains('hidden');
  const code = isCodeVisible ? document.getElementById('verificationCode').value.trim() : '';

  // 验证手机号（只验证长度，不限制格式）
  if (!phone) {
    showToast('Please enter phone number', 'error');
    return;
  }
  
  if (phone.length < 8 || phone.length > 15) {
    showToast('Phone number length should be between 8-15 digits', 'error');
    return;
  }
  
  // Only allow digits and + (international prefix)
  if (!/^[+\d]+$/.test(phone)) {
    showToast('Phone number can only contain digits and +', 'error');
    return;
  }

  // 检查是否需要验证码
  const smsEnabled = currentSettings.sms_enabled === 'true';
  
  if (smsEnabled) {
    // 如果启用了短信验证码，必须提供验证码
    if (!code) {
      showToast('Please enter verification code', 'error');
      return;
    }
    
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      showToast('Verification code must be 6 digits', 'error');
      return;
    }
    
    // 使用验证码登录
    await loginWithCode(phone, code, name);
  } else {
    // 使用传统登录
    await loginWithoutCode(phone, name);
  }
}

// 验证码登录
async function loginWithCode(phone, code, name) {
  const loginBtn = document.getElementById('loginSubmitBtn');
  setButtonLoading(loginBtn, true);

  try {
    const response = await fetch(`${API_BASE}/auth/user/login-with-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ 
        phone, 
        code,
        name: name || undefined
      })
    });

    const data = await response.json();

    if (data.success) {
      currentUser = data.user;
      closeLoginModal();
      updateLoginStatus();
      showToast('Login successful!', 'success');
      
      // If cart has items, submit order directly
      if (cart.length > 0) {
        submitOrder();
      } else {
        // If currently on orders page, refresh order list
        if (!document.getElementById('ordersTab').classList.contains('hidden')) {
          loadOrders();
        }
      }
    } else {
      showToast(data.message || 'Login failed', 'error');
    }
  } catch (error) {
    console.error('Login failed:', error);
    showToast('Login failed, please try again', 'error');
  } finally {
    setButtonLoading(loginBtn, false);
  }
}

// 传统登录（无验证码）
async function loginWithoutCode(phone, name) {
  const loginBtn = document.getElementById('loginSubmitBtn');
  setButtonLoading(loginBtn, true);

  try {
    const response = await fetch(`${API_BASE}/auth/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ 
        phone, 
        name: name || undefined
      })
    });

    const data = await response.json();

    if (data.success) {
      currentUser = data.user;
      closeLoginModal();
      updateLoginStatus();
      showToast('Login successful!', 'success');
      
      // If cart has items, submit order directly
      if (cart.length > 0) {
        submitOrder();
      } else {
        // If currently on orders page, refresh order list
        if (!document.getElementById('ordersTab').classList.contains('hidden')) {
          loadOrders();
        }
      }
    } else {
      // 如果返回requiresCode，显示验证码输入框
      if (data.requiresCode) {
        showToast('SMS verification is required', 'info');
        const codeSection = document.getElementById('verificationCodeSection');
        if (codeSection) {
          codeSection.classList.remove('hidden');
        }
        // 自动发送验证码
        await sendVerificationCode();
      } else {
        showToast(data.message || 'Login failed', 'error');
      }
    }
  } catch (error) {
    console.error('Login failed:', error);
    showToast('Login failed, please try again', 'error');
  } finally {
    setButtonLoading(loginBtn, false);
  }
}

// 登出
async function logout() {
  try {
    await fetch(`${API_BASE}/auth/user/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    currentUser = null;
    cart = [];
    updateCartBadge();
    updateLoginStatus();
    showToast('Logged out');
    showTab('menu');
  } catch (error) {
    console.error('登出失败:', error);
  }
}

// 显示登录模态框
function showLoginModal() {
  document.getElementById('loginModal').classList.add('active');
  
  // 根据设置显示/隐藏验证码输入框
  const smsEnabled = currentSettings.sms_enabled === 'true';
  const codeSection = document.getElementById('verificationCodeSection');
  if (codeSection) {
    if (smsEnabled) {
      codeSection.classList.remove('hidden');
    } else {
      codeSection.classList.add('hidden');
    }
  }
}

// 关闭登录模态框
function closeLoginModal() {
  document.getElementById('loginModal').classList.remove('active');
  document.getElementById('loginForm').reset();
  // 重置验证码相关UI
  const codeSection = document.getElementById('verificationCodeSection');
  if (codeSection) {
    codeSection.classList.add('hidden');
  }
  const countdown = document.getElementById('codeCountdown');
  if (countdown) {
    countdown.classList.add('hidden');
  }
  if (codeCountdownTimer) {
    clearInterval(codeCountdownTimer);
    codeCountdownTimer = null;
  }
}

// 验证码倒计时
let codeCountdownTimer = null;
let countdownSeconds = 0;

// 发送验证码
async function sendVerificationCode() {
  const phone = document.getElementById('phone').value.trim();
  
  if (!phone) {
    showToast('Please enter phone number first', 'error');
    return;
  }
  
  if (phone.length < 8 || phone.length > 15) {
    showToast('Phone number length should be between 8-15 digits', 'error');
    return;
  }
  
  if (!/^[+\d]+$/.test(phone)) {
    showToast('Phone number can only contain digits and +', 'error');
    return;
  }

  const sendBtn = document.getElementById('sendCodeBtn');
  setButtonLoading(sendBtn, true);

  try {
    const response = await fetch(`${API_BASE}/auth/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone, type: 'login' })
    });

    const data = await response.json();

    if (data.success) {
      showToast(data.message || 'Verification code sent successfully', 'success');
      
      // 显示验证码输入框
      const codeSection = document.getElementById('verificationCodeSection');
      if (codeSection) {
        codeSection.classList.remove('hidden');
      }
      
      // 开发环境显示验证码（如果返回了）
      if (data.code) {
        console.log('Verification code (dev only):', data.code);
        showToast(`Verification code: ${data.code} (dev only)`, 'info');
      }
      
      // 开始倒计时
      startCountdown();
    } else {
      showToast(data.message || 'Failed to send verification code', 'error');
    }
  } catch (error) {
    console.error('Send verification code failed:', error);
    showToast('Failed to send verification code, please try again', 'error');
  } finally {
    setButtonLoading(sendBtn, false);
  }
}

// 开始倒计时
function startCountdown() {
  countdownSeconds = 60;
  const countdownEl = document.getElementById('codeCountdown');
  const sendBtn = document.getElementById('sendCodeBtn');
  
  if (countdownEl) {
    countdownEl.classList.remove('hidden');
  }
  
  if (sendBtn) {
    sendBtn.disabled = true;
  }
  
  if (codeCountdownTimer) {
    clearInterval(codeCountdownTimer);
  }
  
  codeCountdownTimer = setInterval(() => {
    countdownSeconds--;
    
    if (countdownEl) {
      countdownEl.textContent = `Resend code in ${countdownSeconds} seconds`;
    }
    
    if (countdownSeconds <= 0) {
      clearInterval(codeCountdownTimer);
      codeCountdownTimer = null;
      
      if (countdownEl) {
        countdownEl.classList.add('hidden');
      }
      
      if (sendBtn) {
        sendBtn.disabled = false;
      }
    }
  }, 1000);
}

// 更新商店名称显示
function updateStoreName() {
  // 更新页面标题
  document.title = `${storeName} Ordering System`;
  
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
  
  // 更新Home页面的欢迎文字
  const welcomeTitle = document.getElementById('homeWelcomeTitle');
  if (welcomeTitle) {
    welcomeTitle.textContent = `Welcome to ${storeName}`;
  }
}

// 更新货币符号显示（重新渲染所有价格）
function updateCurrencyDisplay() {
  // 重新加载产品列表和订单列表以更新价格显示
  if (products.length > 0) {
    renderProducts(products);
  }
  // 更新购物车显示（只在购物车已经打开的情况下）
  const cartModal = document.getElementById('cartModal');
  if (cartModal && cartModal.classList.contains('active') && cart.length > 0) {
    showCart();
  }
  // 更新订单显示
  if (document.getElementById('ordersList') && currentUser) {
    loadOrders();
  }
}

// 更新登录状态显示
function updateLoginStatus() {
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const userName = document.getElementById('userName');
  
  if (currentUser) {
    loginBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
    userName.textContent = currentUser.name || currentUser.phone;
  } else {
    loginBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    userName.textContent = 'Guest';
  }
  
  // 同时更新 profile 页面（确保登录状态同步）
  updateProfilePage();
}

// 显示主页面
async function showMainPage() {
  // 加载数据（loadSettings已经在DOMContentLoaded时调用过了）
  await loadCurrencyConfig();
  await loadCategories();
  await loadProducts();
  updateOrderingStatus();
  updateCartBadge();
  
  // 定期刷新订单状态
  setInterval(() => {
    updateOrderingStatus();
  }, 10000); // 每10秒刷新一次
}

// 加载系统设置
async function loadSettings() {
  try {
    const data = await apiGet('/public/settings', { showError: false });
    if (data && data.success) {
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
      updateCurrencyDisplay();
      // 显示系统公告
      updateSystemNotice();
    }
  } catch (error) {
    // 设置加载失败不影响页面显示
  }
}

// 更新系统公告显示（只显示系统公告，不显示折扣信息）
function updateSystemNotice() {
  const banner = document.getElementById('systemNoticeBanner');
  const noticeText = document.getElementById('noticeText');
  
  let noticeContent = '';
  
  // 只添加系统公告
  if (currentSettings.system_notice && currentSettings.system_notice.trim()) {
    noticeContent = currentSettings.system_notice;
  }
  
  if (noticeContent) {
    noticeText.textContent = noticeContent;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// 折扣信息功能已移除，不再显示折扣信息

// 加载分类
async function loadCategories() {
  try {
    const response = await fetch(`${API_BASE}/public/categories`);
    const data = await response.json();
    if (data.success) {
      categories = data.categories;
      renderCategoryFilter();
    }
  } catch (error) {
    console.error('加载分类失败:', error);
  }
}

// 加载菜品
async function loadProducts() {
  try {
    const response = await fetch(`${API_BASE}/public/products`);
    const data = await response.json();
    if (data.success) {
      products = data.products;
      renderProducts();
    }
  } catch (error) {
    console.error('加载菜品失败:', error);
  }
}

// 渲染分类导航（左侧）
function renderCategoryFilter() {
  const container = document.getElementById('categoryNav');
  
  // 添加"全部"选项
  let html = `
    <button onclick="filterCategory(null)" class="category-nav-btn w-full py-4 text-center ${selectedCategory === null ? 'bg-white text-green-600 font-semibold border-l-3 border-green-600' : 'text-gray-600 hover:bg-gray-100'}">
      <div class="text-xs">All</div>
    </button>
  `;
  
  categories.forEach(cat => {
    // 简化分类名称显示
    const shortName = cat.name.includes(' ') ? cat.name.split(' ')[1] || cat.name.split(' ')[0] : cat.name;
    html += `
      <button onclick="filterCategory(${cat.id})" class="category-nav-btn w-full py-4 text-center ${selectedCategory === cat.id ? 'bg-white text-green-600 font-semibold border-l-3 border-green-600' : 'text-gray-600 hover:bg-gray-100'}">
        <div class="text-xs leading-tight px-1">${shortName}</div>
      </button>
    `;
  });
  
  container.innerHTML = html;
}

// 筛选分类
function filterCategory(categoryId) {
  selectedCategory = categoryId;
  renderCategoryFilter();
  renderProducts();
  
  // 滚动到顶部
  document.getElementById('productsScroll').scrollTop = 0;
}

// 渲染菜品
function renderProducts() {
  const container = document.getElementById('productsList');
  
  let filteredProducts = products;
  if (selectedCategory !== null) {
    filteredProducts = products.filter(p => p.category_id === selectedCategory);
  }
  
  if (filteredProducts.length === 0) {
    container.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500">No products</div>';
    return;
  }
  
  // 按分类分组
  const groupedProducts = {};
  filteredProducts.forEach(product => {
    const catName = product.category_name || 'Uncategorized';
    if (!groupedProducts[catName]) {
      groupedProducts[catName] = [];
    }
    groupedProducts[catName].push(product);
  });
  
  // 获取分类排序信息，确保"其它"或"加料"分类在最后
  const categoryMap = {};
  categories.forEach(cat => {
    categoryMap[cat.name] = cat.sort_order || 999;
  });
  
  // 对分类进行排序，"其它"、"加料"等分类放在最后
  const sortedCategories = Object.keys(groupedProducts).sort((a, b) => {
    const aOrder = categoryMap[a] || 999;
    const bOrder = categoryMap[b] || 999;
    
    // If contains "Other", "Toppings" keywords, put at the end
    const aIsOther = a.includes('其它') || a.includes('加料') || a.includes('ADD') || a.includes('OTHER') || a.includes('Other') || a.includes('Toppings');
    const bIsOther = b.includes('其它') || b.includes('加料') || b.includes('ADD') || b.includes('OTHER') || b.includes('Other') || b.includes('Toppings');
    
    if (aIsOther && !bIsOther) return 1;
    if (!aIsOther && bIsOther) return -1;
    
    return aOrder - bOrder;
  });
  
  let html = '';
  
  sortedCategories.forEach(catName => {
    const prods = groupedProducts[catName];
    html += `<div class="mb-4" id="category-${catName}">`;
    if (selectedCategory === null) {
      html += `<h3 class="text-sm font-bold text-gray-700 mb-3 px-2">${catName}</h3>`;
    }
    
    prods.forEach(product => {
      // 解析杯型价格
      let sizes = {};
      try {
        sizes = JSON.parse(product.sizes || '{}');
      } catch (e) {
        sizes = {};
      }
      
      // 获取最低价格
      const prices = Object.values(sizes);
      const minPrice = prices.length > 0 ? Math.min(...prices) : product.price;
      const hasMultipleSizes = prices.length > 1;
      
      html += `
        <div class="flex items-center p-3 bg-white hover:bg-gray-50 border-b border-gray-100">
          <!-- 商品图片 -->
          <div class="w-20 h-20 flex-shrink-0 mr-3">
            ${product.image_url ? 
              `<img src="${product.image_url}" alt="${product.name}" class="w-full h-full object-cover rounded-lg">` :
              `<div class="w-full h-full bg-gradient-to-br from-orange-100 to-yellow-100 rounded-lg flex items-center justify-center text-3xl">🧋</div>`
            }
          </div>
          
          <!-- 商品信息 -->
          <div class="flex-1 min-w-0">
            <h4 class="text-sm font-bold text-gray-900 line-clamp-1">${product.name}</h4>
            ${product.description && !product.description.includes('支持多种') ? 
              `<p class="text-xs text-gray-500 mt-1 line-clamp-1">${product.description}</p>` : 
              ''}
            <div class="flex items-center justify-between mt-2">
              <div>
                <span class="text-red-500 font-bold text-base">${formatPrice(minPrice)}</span>
                ${hasMultipleSizes ? '<span class="text-xs text-gray-500 ml-1">起</span>' : ''}
              </div>
              <button onclick='showProductDetail(${JSON.stringify(product).replace(/'/g, "&apos;")})' 
                      class="px-4 py-1.5 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-full transition text-xs"
                      ${currentSettings.ordering_open !== 'true' ? 'disabled' : ''}>
                ${currentSettings.ordering_open === 'true' ? t('select_spec') : t('ordering_closed')}
              </button>
            </div>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
  });
  
  container.innerHTML = html || '<div class="text-center py-12 text-gray-500">暂无商品</div>';
  
  // 设置滚动监听，实现左侧分类自动高亮
  setupCategoryScrollHighlight();
}

// 设置分类滚动高亮
function setupCategoryScrollHighlight() {
  const productsScroll = document.getElementById('productsScroll');
  if (!productsScroll) return;
  
  // 移除旧的监听器（如果存在）
  if (productsScroll._scrollHandler) {
    productsScroll.removeEventListener('scroll', productsScroll._scrollHandler);
  }
  
  // 创建新的滚动监听器
  productsScroll._scrollHandler = () => {
    const scrollTop = productsScroll.scrollTop;
    const clientHeight = productsScroll.clientHeight;
    
    // 获取所有分类区域（从DOM中获取）
    const categoryElements = document.querySelectorAll('[id^="category-"]');
    const categorySections = [];
    
    categoryElements.forEach(element => {
      const rect = element.getBoundingClientRect();
      const containerRect = productsScroll.getBoundingClientRect();
      
      categorySections.push({
        name: element.id.replace('category-', ''),
        element: element,
        top: rect.top - containerRect.top + scrollTop,
        bottom: rect.bottom - containerRect.top + scrollTop,
        height: rect.height
      });
    });
    
    if (categorySections.length === 0) return;
    
    // 找到当前可见的分类
    const viewportTop = scrollTop;
    const viewportBottom = scrollTop + clientHeight;
    const viewportCenter = scrollTop + clientHeight / 2;
    
    let activeCategory = null;
    
    // 优先选择视口中心附近的分类
    for (const section of categorySections) {
      if (viewportCenter >= section.top && viewportCenter <= section.bottom) {
        activeCategory = section.name;
        break;
      }
    }
    
    // 如果没有找到，选择视口顶部附近的分类
    if (!activeCategory) {
      for (const section of categorySections) {
        if (viewportTop >= section.top && viewportTop <= section.bottom) {
          activeCategory = section.name;
          break;
        }
      }
    }
    
    // 如果还是没有找到，选择第一个可见的分类
    if (!activeCategory) {
      for (const section of categorySections) {
        if (section.top < viewportBottom && section.bottom > viewportTop) {
          activeCategory = section.name;
          break;
        }
      }
    }
    
    // 更新左侧分类高亮
    if (activeCategory !== null) {
      highlightCategory(activeCategory);
    }
  };
  
  // 添加滚动监听
  productsScroll.addEventListener('scroll', productsScroll._scrollHandler, { passive: true });
  
  // 添加滚动开始/结束检测，防止误触购物车按钮
  productsScroll.addEventListener('scroll', () => {
    isScrolling = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      isScrolling = false;
    }, 150); // 滚动结束后150ms才允许点击
  }, { passive: true });
  
  // 添加触摸事件检测
  productsScroll.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }, { passive: true });
  
  productsScroll.addEventListener('touchmove', () => {
    isScrolling = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      isScrolling = false;
    }, 150);
  }, { passive: true });
  
  productsScroll.addEventListener('touchend', (e) => {
    const touchEndY = e.changedTouches[0].clientY;
    const touchEndTime = Date.now();
    const deltaY = Math.abs(touchEndY - touchStartY);
    const deltaTime = touchEndTime - touchStartTime;
    
    // 如果移动距离大于10px或时间超过300ms，认为是滚动
    if (deltaY > 10 || deltaTime > 300) {
      isScrolling = true;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        isScrolling = false;
      }, 150);
    }
  }, { passive: true });
  
  // 初始触发一次
  setTimeout(() => productsScroll._scrollHandler(), 100);
}

// 高亮指定分类
function highlightCategory(categoryName) {
  const navButtons = document.querySelectorAll('.category-nav-btn');
  navButtons.forEach(btn => {
    const btnText = btn.textContent.trim();
    // 获取分类名称（可能是简化后的名称）
    const fullCategoryName = categories.find(cat => {
      const shortName = cat.name.includes(' ') ? cat.name.split(' ')[1] || cat.name.split(' ')[0] : cat.name;
      return shortName === btnText || cat.name === btnText;
    });
    
    const isMatch = (categoryName === null && btnText === '全部') ||
                    (fullCategoryName && fullCategoryName.name === categoryName) ||
                    btnText === categoryName;
    
    if (isMatch) {
      btn.classList.add('bg-white', 'text-green-600', 'font-semibold', 'border-l-3', 'border-green-600');
      btn.classList.remove('text-gray-600', 'hover:bg-gray-100');
    } else {
      btn.classList.remove('bg-white', 'text-green-600', 'font-semibold', 'border-l-3', 'border-green-600');
      btn.classList.add('text-gray-600', 'hover:bg-gray-100');
    }
  });
}

// 更新点单状态显示（简单显示，无倒计时）
async function updateOrderingStatus() {
  const container = document.getElementById('orderingStatus');
  if (!container) return;
  
  try {
    await loadSettings();
    const isOpen = currentSettings.ordering_open === 'true';
    
    if (isOpen) {
      container.className = 'mb-6 p-4 rounded-lg bg-green-100 border border-green-300 text-green-800';
      container.innerHTML = '✅ Ordering is open, welcome to order!';
    } else {
      container.className = 'mb-6 p-4 rounded-lg bg-yellow-100 border border-yellow-300 text-yellow-800';
      container.innerHTML = '⚠️ Ordering is closed, please wait for notification';
    }
  } catch (error) {
    console.error('Failed to get ordering status:', error);
    container.className = 'mb-6 p-4 rounded-lg bg-yellow-100 border border-yellow-300 text-yellow-800';
    container.innerHTML = '⚠️ Ordering is closed, please wait for notification';
  }
}

// 商品详情相关变量
let currentDetailProduct = null;
let selectedSize = null;
let selectedSugar = '100';
let selectedToppings = [];
let selectedIce = null; // 选中的冰度
let detailQuantity = 1;
let allToppings = []; // 所有加料商品

// 显示商品详情
async function showProductDetail(product) {
  currentDetailProduct = product;
  selectedSize = null;
  selectedSugar = '100';
  selectedToppings = [];
  selectedIce = null; // 重置冰度选择
  detailQuantity = 1; // 确保每次打开都重置为1
  
  // 加载所有加料商品
  if (allToppings.length === 0) {
    try {
      const response = await fetch(`${API_BASE}/public/products`);
      const data = await response.json();
      if (data.success) {
        // 筛选出价格为20的商品作为加料（简单判断）
        allToppings = data.products.filter(p => 
          p.price === 20 && (p.name.includes('Cheese') || p.name.includes('Jelly') || 
                             p.name.includes('Boba') || p.name.includes('Cream'))
        );
      }
    } catch (error) {
      console.error('加载加料失败:', error);
    }
  }
  
  // 设置商品名称和描述
  document.getElementById('detailProductName').textContent = product.name;
  document.getElementById('detailProductDesc').textContent = product.description || '';
  
  // 渲染杯型选择
  renderSizeOptions(product);
  
  // 渲染甜度选择
  renderSugarOptions(product);
  
  // 渲染加料选择
  renderToppingOptions(product);
  
  // 渲染冰度选择
  renderIceOptions(product);
  
  // 更新数量显示
  const quantityEl = document.getElementById('detailQuantity');
  if (quantityEl) {
    quantityEl.textContent = detailQuantity;
  }
  
  // 更新价格
  updateDetailPrice();
  
  // 显示模态框
  const modal = document.getElementById('productDetailModal');
  if (modal) {
    modal.classList.add('active');
  }
}

// 渲染杯型选择
function renderSizeOptions(product) {
  const container = document.getElementById('sizeOptions');
  let sizes = {};
  
  try {
    sizes = JSON.parse(product.sizes || '{}');
  } catch (e) {
    sizes = {};
  }
  
  if (Object.keys(sizes).length === 0) {
    sizes = { '默认': product.price };
  }
  
  // 默认选中第一个杯型
  if (!selectedSize) {
    selectedSize = Object.keys(sizes)[0];
  }
  
  container.innerHTML = Object.entries(sizes).map(([sizeName, price]) => `
    <button onclick="selectSize('${sizeName}')" 
            class="size-option px-6 py-3 border-2 rounded-lg transition ${selectedSize === sizeName ? 'border-yellow-500 bg-yellow-50 text-yellow-700 font-semibold' : 'border-gray-300 text-gray-700 hover:border-yellow-400'}">
      ${sizeName} <span class="text-sm">${formatPrice(price)}</span>
    </button>
  `).join('');
}

// 渲染甜度选择
function renderSugarOptions(product) {
  const container = document.getElementById('sugarOptions');
  let sugarLevels = [];
  
  try {
    sugarLevels = JSON.parse(product.sugar_levels || '[]');
  } catch (e) {
    sugarLevels = [];
  }
  
  if (sugarLevels.length === 0) {
    sugarLevels = ['0', '30', '50', '70', '100'];
  }
  
  const sugarLabels = {
    '0': 'Zero',
    '30': 'Light',
    '50': 'Half',
    '70': 'Less',
    '100': 'Regular'
  };
  
  container.innerHTML = sugarLevels.map(level => `
    <button onclick="selectSugar('${level}')" 
            class="sugar-option px-5 py-2 border-2 rounded-lg transition text-sm ${selectedSugar === level ? 'border-yellow-500 bg-yellow-50 text-yellow-700 font-semibold' : 'border-gray-300 text-gray-700 hover:border-yellow-400'}">
      ${sugarLabels[level]} ${level}%${level === '100' ? ' (推荐)' : ''}
    </button>
  `).join('');
}

// 渲染加料选择
function renderToppingOptions(product) {
  const container = document.getElementById('toppingOptions');
  let availableToppingIds = [];
  
  try {
    availableToppingIds = JSON.parse(product.available_toppings || '[]');
  } catch (e) {
    availableToppingIds = [];
  }
  
  const availableToppings = allToppings.filter(t => availableToppingIds.includes(t.id));
  
  if (availableToppings.length === 0) {
    container.innerHTML = '<p class="text-sm text-gray-500">此商品无可选加料</p>';
    return;
  }
  
  container.innerHTML = availableToppings.map(topping => `
    <label class="flex items-center justify-between p-3 border-2 rounded-lg cursor-pointer transition ${selectedToppings.includes(topping.id) ? 'border-yellow-500 bg-yellow-50' : 'border-gray-300 hover:border-yellow-400'}">
      <div class="flex items-center">
        <input type="checkbox" 
               onchange="toggleTopping(${topping.id})" 
               ${selectedToppings.includes(topping.id) ? 'checked' : ''}
               class="w-5 h-5 text-yellow-500 rounded">
        <span class="ml-3 font-medium text-gray-900">${topping.name}</span>
      </div>
      <span class="text-sm text-gray-600">+${formatPrice(topping.price)}</span>
    </label>
  `).join('');
}

// 选择杯型
function selectSize(sizeName) {
  selectedSize = sizeName;
  renderSizeOptions(currentDetailProduct);
  updateDetailPrice();
}

// 选择甜度
function selectSugar(level) {
  selectedSugar = level;
  renderSugarOptions(currentDetailProduct);
}

// 渲染冰度选择
function renderIceOptions(product) {
  const container = document.getElementById('iceOptions');
  let iceOptions = [];
  
  try {
    iceOptions = JSON.parse(product.ice_options || '["normal","less","no","room","hot"]');
  } catch (e) {
    iceOptions = ['normal', 'less', 'no', 'room', 'hot'];
  }
  
  // 如果产品不允许选择冰度，隐藏整个区域
  if (iceOptions.length === 0) {
    document.getElementById('iceSection').style.display = 'none';
    return;
  }
  
  document.getElementById('iceSection').style.display = 'block';
  
  const iceLabels = {
    'normal': 'Normal Ice 正常冰',
    'less': 'Less Ice 少冰',
    'no': 'No Ice 去冰',
    'room': 'Room Temperature 常温',
    'hot': 'Hot 热'
  };
  
  // 如果没有选中，默认选中第一个选项
  if (!selectedIce && iceOptions.length > 0) {
    selectedIce = iceOptions[0];
  }
  
  container.innerHTML = iceOptions.map(option => `
    <button onclick="selectIce('${option}')" 
            class="ice-option px-5 py-2 border-2 rounded-lg transition text-sm ${selectedIce === option ? 'border-yellow-500 bg-yellow-50 text-yellow-700 font-semibold' : 'border-gray-300 text-gray-700 hover:border-yellow-400'}">
      ${iceLabels[option] || option}
    </button>
  `).join('');
}

// 选择冰度
function selectIce(iceLevel) {
  selectedIce = iceLevel;
  renderIceOptions(currentDetailProduct);
}

// 切换加料
function toggleTopping(toppingId) {
  const index = selectedToppings.indexOf(toppingId);
  if (index > -1) {
    selectedToppings.splice(index, 1);
  } else {
    selectedToppings.push(toppingId);
  }
  updateDetailPrice();
}

// 更新数量
function updateDetailQuantity(delta) {
  detailQuantity += delta;
  if (detailQuantity < 1) detailQuantity = 1;
  const quantityEl = document.getElementById('detailQuantity');
  if (quantityEl) {
    quantityEl.textContent = detailQuantity;
  }
  updateDetailPrice();
}

// 更新价格
function updateDetailPrice() {
  if (!currentDetailProduct) return;
  
  let sizes = {};
  try {
    sizes = JSON.parse(currentDetailProduct.sizes || '{}');
  } catch (e) {
    sizes = { '默认': currentDetailProduct.price };
  }
  
  // 基础价格（杯型价格）
  const basePrice = sizes[selectedSize] || currentDetailProduct.price;
  
  // 加料价格
  let toppingPrice = 0;
  selectedToppings.forEach(toppingId => {
    const topping = allToppings.find(t => t.id === toppingId);
    if (topping) {
      toppingPrice += topping.price;
    }
  });
  
  // 总价 = (基础价格 + 加料价格) × 数量
  const totalPrice = (basePrice + toppingPrice) * detailQuantity;
  
  document.getElementById('detailTotalPrice').textContent = formatPrice(totalPrice);
}

// 从详情页加入购物车
function addToCartFromDetail() {
  if (!currentDetailProduct || !selectedSize) {
    showToast('Please select specifications', 'warning');
    return;
  }
  
  // 获取选中的加料信息
  const selectedToppingItems = selectedToppings.map(toppingId => {
    const topping = allToppings.find(t => t.id === toppingId);
    return topping;
  }).filter(t => t);
  
  // 获取杯型价格
  let sizes = {};
  try {
    sizes = JSON.parse(currentDetailProduct.sizes || '{}');
  } catch (e) {
    sizes = { '默认': currentDetailProduct.price };
  }
  const sizePrice = sizes[selectedSize] || currentDetailProduct.price;
  
  // 构建购物车项
  const cartItem = {
    product_id: currentDetailProduct.id,
    name: currentDetailProduct.name,
    size: selectedSize,
    sugar_level: selectedSugar,
    ice_level: selectedIce || null, // 添加冰度选择
    toppings: selectedToppingItems,
    base_price: sizePrice,
    topping_price: selectedToppingItems.reduce((sum, t) => sum + t.price, 0),
    price: sizePrice + selectedToppingItems.reduce((sum, t) => sum + t.price, 0),
    quantity: detailQuantity
  };
  
  // 检查是否已有相同配置的商品
  const existingIndex = cart.findIndex(item => 
    item.product_id === cartItem.product_id &&
    item.size === cartItem.size &&
    item.sugar_level === cartItem.sugar_level &&
    item.ice_level === cartItem.ice_level &&
    JSON.stringify(item.toppings.map(t => t.id).sort()) === JSON.stringify(cartItem.toppings.map(t => t.id).sort())
  );
  
  if (existingIndex > -1) {
    cart[existingIndex].quantity += cartItem.quantity;
  } else {
    cart.push(cartItem);
  }
  
  updateCartBadge();
  closeProductDetail();
  showToast('Added to cart');
}

// 关闭商品详情
function closeProductDetail() {
  document.getElementById('productDetailModal').classList.remove('active');
  currentDetailProduct = null;
  selectedSize = null;
  selectedSugar = '100';
  selectedToppings = [];
  detailQuantity = 1;
}

// 旧的添加到购物车（保留兼容）
function addToCart(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  showProductDetail(product);
}

// 更新购物车徽章和底部栏
function updateCartBadge() {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  // 更新底部购物车栏
  const cartBar = document.getElementById('cartBar');
  const cartBarBadge = document.getElementById('cartBarBadge');
  const cartBarTotal = document.getElementById('cartBarTotal');
  
  if (totalItems > 0) {
    cartBar.classList.remove('hidden');
    cartBarBadge.textContent = totalItems;
    cartBarTotal.textContent = formatPrice(totalPrice);
  } else {
    cartBar.classList.add('hidden');
  }
}

// 防止误触的变量
let isScrolling = false;
let scrollTimer = null;
let touchStartY = 0;
let touchStartTime = 0;

// 显示购物车
function showCart(event) {
  // 如果是滚动过程中，忽略点击
  if (isScrolling) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }
  
  if (cart.length === 0) {
    showToast('Cart is empty', 'warning');
    return;
  }
  
  const container = document.getElementById('cartItems');
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
  
  container.innerHTML = cart.map((item, index) => `
    <div class="p-4 bg-gray-50 rounded-lg">
      <div class="flex items-start justify-between mb-2">
        <div class="flex-1">
          <h4 class="font-semibold text-gray-900">${item.name}</h4>
          <div class="text-xs text-gray-600 mt-1 space-y-0.5">
            <p>Size: ${item.size || 'Default'}</p>
            <p>Sugar: ${sugarLabels[item.sugar_level] || 'Regular'}</p>
            ${item.ice_level ? `<p>Ice: ${iceLabels[item.ice_level] || item.ice_level}</p>` : ''}
            ${item.toppings && item.toppings.length > 0 ? 
              `<p>Toppings: ${item.toppings.map(t => t.name).join(', ')}</p>` : 
              ''}
          </div>
        </div>
        <button onclick="removeFromCart(${index})" 
                class="text-red-500 hover:text-red-700 font-bold text-xl ml-2">×</button>
      </div>
      <div class="flex items-center justify-between">
        <div class="text-sm text-gray-600">
          <span>${formatPrice(item.base_price)}</span>
          ${item.topping_price > 0 ? `<span> + ${formatPrice(item.topping_price)}</span>` : ''}
          <span class="font-semibold text-gray-900 ml-2">= ${formatPrice(item.price)}</span>
        </div>
        <div class="flex items-center space-x-3">
          <button onclick="updateCartItemQuantity(${index}, -1)" 
                  class="w-8 h-8 bg-gray-200 hover:bg-gray-300 rounded-full font-bold">-</button>
          <span class="font-semibold w-8 text-center">${item.quantity}</span>
          <button onclick="updateCartItemQuantity(${index}, 1)" 
                  class="w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white rounded-full font-bold">+</button>
        </div>
      </div>
    </div>
  `).join('');
  
  updateCartTotal();
  document.getElementById('cartModal').classList.add('active');
}

// 更新购物车商品数量
function updateCartItemQuantity(index, delta) {
  cart[index].quantity += delta;
  if (cart[index].quantity <= 0) {
    cart.splice(index, 1);
  }
  
  if (cart.length === 0) {
    closeCart();
  } else {
    // 只有在购物车已经打开的情况下才更新显示
    const cartModal = document.getElementById('cartModal');
    if (cartModal && cartModal.classList.contains('active')) {
      showCart();
    }
  }
  
  updateCartBadge();
}

// 从购物车移除
function removeFromCart(index) {
  cart.splice(index, 1);
  
  if (cart.length === 0) {
    closeCart();
  } else {
    // 只有在购物车已经打开的情况下才更新显示
    const cartModal = document.getElementById('cartModal');
    if (cartModal && cartModal.classList.contains('active')) {
      showCart();
    }
  }
  
  updateCartBadge();
}

// 更新购物车总计
function updateCartTotal() {
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  document.getElementById('cartTotal').textContent = formatPrice(total);
}

// 去结算（直接提交订单）
function goToCheckout(event) {
  // 如果是滚动过程中，忽略点击
  if (isScrolling) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }
  submitOrder();
}

// 关闭购物车
function closeCart() {
  document.getElementById('cartModal').classList.remove('active');
}

// 提交订单
async function submitOrder() {
  if (cart.length === 0) {
    showToast('Cart is empty', 'warning');
    return;
  }
  
  if (currentSettings.ordering_open !== 'true') {
    showToast('Ordering is closed', 'warning');
    return;
  }
  
  // 检查是否登录
  if (!currentUser) {
    closeCart();
    showLoginModal();
    return;
  }
  
  const submitBtn = document.querySelector('#cartModal button[onclick="submitOrder()"]');
  setButtonLoading(submitBtn, true);
  
  // 添加超时提示（如果3秒后还在处理，显示友好提示）
  const timeoutId = setTimeout(() => {
    if (submitBtn && submitBtn.disabled) {
      showToast('Processing your order, please wait...', 'info');
    }
  }, 3000);
  
  try {
    const orderNotes = document.getElementById('orderNotes')?.value || '';
    
    const orderData = {
      items: cart.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        size: item.size,
        sugar_level: item.sugar_level,
        toppings: item.toppings ? item.toppings.map(t => t.id) : [],
        ice_level: item.ice_level || null
      })),
      customer_name: currentUser.name || '',
      notes: orderNotes
    };
    
    // 使用统一的 API 封装（有超时保护和错误处理）
    // 如果 apiPost 未定义，回退到 fetch（兼容性）
    let data;
    if (typeof apiPost === 'function') {
      data = await apiPost('/user/orders', orderData, {
        showLoading: false,  // 已经有按钮 loading，不需要全局 loading
        showError: true,     // 自动显示错误提示
        timeout: 60000       // 60秒超时（足够数据库等待5秒）
      });
    } else {
      // 回退方案：使用 fetch（兼容旧代码）
      const response = await fetch(`${API_BASE}/user/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(orderData)
      });
      data = await response.json();
    }
    
    clearTimeout(timeoutId);
    
    if (data.success) {
      showToast('Order submitted successfully! Order number: ' + data.order.order_number, 'success');
      cart = [];
      updateCartBadge();
      closeCart();
      showTab('orders');
      
      // 延迟一下再加载订单，确保数据库已更新
      setTimeout(() => {
        loadOrders();
      }, 500);
    } else {
      showToast(data.message || 'Order submission failed', 'error');
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Order submission failed:', error);
    // apiPost 已经处理了错误提示，这里只在回退方案时显示
    if (typeof apiPost === 'undefined') {
      showToast('Order submission failed, please try again', 'error');
    }
  } finally {
    const submitBtn = document.querySelector('#cartModal button[onclick="submitOrder()"]');
    if (submitBtn) setButtonLoading(submitBtn, false);
  }
}

// 底部导航栏切换
function showBottomTab(tabName) {
  // 隐藏所有页面
  document.getElementById('homeTab').classList.add('hidden');
  document.getElementById('menuTab').classList.add('hidden');
  document.getElementById('ordersTab').classList.add('hidden');
  document.getElementById('profileTab').classList.add('hidden');
  
  // 重置所有导航按钮样式
  ['homeNav', 'menuNav', 'ordersNav', 'profileNav'].forEach(id => {
    const btn = document.getElementById(id);
    btn.className = 'flex flex-col items-center space-y-1 px-4 py-2 text-gray-600';
  });
  
  // 根据选择显示对应页面
  switch(tabName) {
    case 'home':
      document.getElementById('homeTab').classList.remove('hidden');
      document.getElementById('homeNav').className = 'flex flex-col items-center space-y-1 px-4 py-2 text-green-600 font-semibold';
      loadShowcaseImages();
      break;
    case 'menu':
      document.getElementById('menuTab').classList.remove('hidden');
      document.getElementById('menuNav').className = 'flex flex-col items-center space-y-1 px-4 py-2 text-green-600 font-semibold';
      break;
    case 'orders':
      // 查看订单需要登录
      if (!currentUser) {
        showLoginModal();
        document.getElementById('menuTab').classList.remove('hidden');
        document.getElementById('menuNav').className = 'flex flex-col items-center space-y-1 px-4 py-2 text-green-600 font-semibold';
        return;
      }
      document.getElementById('ordersTab').classList.remove('hidden');
      document.getElementById('ordersNav').className = 'flex flex-col items-center space-y-1 px-4 py-2 text-green-600 font-semibold';
      loadOrders();
      break;
    case 'profile':
      document.getElementById('profileTab').classList.remove('hidden');
      document.getElementById('profileNav').className = 'flex flex-col items-center space-y-1 px-4 py-2 text-green-600 font-semibold';
      updateProfilePage();
      break;
  }
}

// 加载新品展示图片
async function loadShowcaseImages() {
  const container = document.getElementById('showcaseContainer');
  if (!container) return;
  
  try {
    const response = await fetch(`${API_BASE}/public/show-images`);
    const data = await response.json();
    
    if (data.success && data.images && data.images.length > 0) {
      // 创建图片元素
      container.innerHTML = data.images.map((img, index) => `
        <div class="showcase-item fade-in-up" style="animation-delay: ${index * 0.1}s;">
          <div class="relative w-64 h-80 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-105">
            <img 
              src="${img.url}" 
              alt="New Product ${index + 1}" 
              class="w-full h-full object-cover"
              loading="lazy"
              onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22256%22 height=%22320%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22256%22 height=%22320%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%239ca3af%22 font-family=%22sans-serif%22 font-size=%2218%22%3EImage%3C/text%3E%3C/svg%3E'"
            >
            <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300"></div>
          </div>
        </div>
      `).join('');
      
      // 如果图片数量较少，复制一份以实现无缝循环效果
      if (data.images.length < 4) {
        const clonedImages = data.images.map((img, index) => `
          <div class="showcase-item">
            <div class="relative w-64 h-80 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:scale-105">
              <img 
                src="${img.url}" 
                alt="New Product ${index + 1}" 
                class="w-full h-full object-cover"
                loading="lazy"
                onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22256%22 height=%22320%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22256%22 height=%22320%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%239ca3af%22 font-family=%22sans-serif%22 font-size=%2218%22%3EImage%3C/text%3E%3C/svg%3E'"
              >
              <div class="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300"></div>
            </div>
          </div>
        `).join('');
        container.innerHTML += clonedImages;
      }
      
      // 添加自动滚动功能（可选）
      setupAutoScroll(container);
    } else {
      container.innerHTML = '<div class="text-center text-gray-500 py-8 w-full">No images available</div>';
    }
  } catch (error) {
    console.error('加载展示图片失败:', error);
    container.innerHTML = '<div class="text-center text-gray-500 py-8 w-full">Failed to load images</div>';
  }
}

// 设置自动滚动（平滑滚动）
let autoScrollAnimationId = null;
let isAutoScrollPaused = false;

function setupAutoScroll(container) {
  // 清除之前的动画
  if (autoScrollAnimationId) {
    cancelAnimationFrame(autoScrollAnimationId);
  }
  
  let scrollPosition = 0;
  let scrollDirection = 1;
  const scrollSpeed = 0.3; // 滚动速度（像素/帧）
  
  function autoScroll() {
    if (isAutoScrollPaused) {
      autoScrollAnimationId = requestAnimationFrame(autoScroll);
      return;
    }
    
    const maxScroll = container.scrollWidth - container.clientWidth;
    
    if (maxScroll <= 0) {
      // 如果不需要滚动，退出
      return;
    }
    
    scrollPosition += scrollSpeed * scrollDirection;
    
    // 到达边界时反向
    if (scrollPosition >= maxScroll) {
      scrollDirection = -1;
      scrollPosition = maxScroll;
    } else if (scrollPosition <= 0) {
      scrollDirection = 1;
      scrollPosition = 0;
    }
    
    container.scrollLeft = scrollPosition;
    autoScrollAnimationId = requestAnimationFrame(autoScroll);
  }
  
  // 鼠标悬停时暂停滚动
  container.addEventListener('mouseenter', () => {
    isAutoScrollPaused = true;
  });
  
  container.addEventListener('mouseleave', () => {
    isAutoScrollPaused = false;
  });
  
  // 用户手动滚动时暂停自动滚动
  let userScrollTimeout;
  container.addEventListener('scroll', () => {
    if (!isAutoScrollPaused) {
      isAutoScrollPaused = true;
      clearTimeout(userScrollTimeout);
      userScrollTimeout = setTimeout(() => {
        scrollPosition = container.scrollLeft;
        isAutoScrollPaused = false;
      }, 2000); // 2秒后恢复自动滚动
    }
  });
  
  // 开始自动滚动
  autoScrollAnimationId = requestAnimationFrame(autoScroll);
}

// 图片拖动相关变量
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let imageOffsetX = 0;
let imageOffsetY = 0;
let currentImageScale = 1;

// 显示支付截图对话框（用户页面）
function showPaymentImageModal(imageUrl) {
  const modal = document.getElementById('paymentImageModal');
  const img = document.getElementById('paymentImageDisplay');
  const slider = document.getElementById('imageZoomSlider');
  
  if (modal && img) {
    img.src = imageUrl;
    // 重置图片位置和缩放
    currentImageScale = 1;
    imageOffsetX = 0;
    imageOffsetY = 0;
    img.style.transform = 'translate(0, 0) scale(1)';
    img.style.transformOrigin = 'center center';
    img.style.cursor = 'grab';
    
    if (slider) {
      slider.value = 100;
      document.getElementById('zoomValue').textContent = '100%';
    }
    modal.classList.add('active');
    
    // 添加拖动事件监听
    setupImageDrag(img);
  }
}

// 设置图片拖动功能
function setupImageDrag(img) {
  // 移除旧的事件监听器（如果存在）
  if (img._dragHandlers) {
    img.removeEventListener('mousedown', img._dragHandlers.mousedown);
    document.removeEventListener('mousemove', img._dragHandlers.mousemove);
    document.removeEventListener('mouseup', img._dragHandlers.mouseup);
    img.removeEventListener('touchstart', img._dragHandlers.touchstart);
    document.removeEventListener('touchmove', img._dragHandlers.touchmove);
    document.removeEventListener('touchend', img._dragHandlers.touchend);
  }
  
  // 鼠标事件
  const handleMouseDown = (e) => {
    if (currentImageScale <= 1) return; // 只有放大后才能拖动
    isDragging = true;
    dragStartX = e.clientX - imageOffsetX;
    dragStartY = e.clientY - imageOffsetY;
    img.style.cursor = 'grabbing';
    e.preventDefault();
  };
  
  const handleMouseMove = (e) => {
    if (!isDragging) return;
    imageOffsetX = e.clientX - dragStartX;
    imageOffsetY = e.clientY - dragStartY;
    updateImageTransform(img);
    e.preventDefault();
  };
  
  const handleMouseUp = () => {
    if (isDragging) {
      isDragging = false;
      img.style.cursor = currentImageScale > 1 ? 'grab' : 'default';
    }
  };
  
  // 触摸事件
  const handleTouchStart = (e) => {
    if (currentImageScale <= 1) return;
    if (e.touches.length === 1) {
      isDragging = true;
      dragStartX = e.touches[0].clientX - imageOffsetX;
      dragStartY = e.touches[0].clientY - imageOffsetY;
      e.preventDefault();
    }
  };
  
  const handleTouchMove = (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    imageOffsetX = e.touches[0].clientX - dragStartX;
    imageOffsetY = e.touches[0].clientY - dragStartY;
    updateImageTransform(img);
    e.preventDefault();
  };
  
  const handleTouchEnd = () => {
    isDragging = false;
  };
  
  // 保存事件处理器引用
  img._dragHandlers = {
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

// 更新图片变换
function updateImageTransform(img) {
  img.style.transform = `translate(${imageOffsetX}px, ${imageOffsetY}px) scale(${currentImageScale})`;
}

// 更新图片缩放（用户页面）
function updateImageZoom(value) {
  const img = document.getElementById('paymentImageDisplay');
  const zoomValue = document.getElementById('zoomValue');
  
  if (img && zoomValue) {
    const scale = value / 100;
    currentImageScale = scale;
    
    // 如果缩放回到1，重置位置
    if (scale <= 1) {
      imageOffsetX = 0;
      imageOffsetY = 0;
      img.style.cursor = 'default';
    } else {
      img.style.cursor = isDragging ? 'grabbing' : 'grab';
    }
    
    updateImageTransform(img);
    img.style.transformOrigin = 'center center';
    zoomValue.textContent = value + '%';
  }
}

// 关闭支付截图对话框（用户页面）
function closePaymentImageModal(event) {
  // 如果点击的是背景（不是对话框内容），则关闭
  if (event && event.target.id === 'paymentImageModal') {
    document.getElementById('paymentImageModal').classList.remove('active');
  } else if (!event) {
    // 直接调用关闭
    document.getElementById('paymentImageModal').classList.remove('active');
  }
}

// 更新个人中心页面
function updateProfilePage() {
  if (currentUser) {
    document.getElementById('profileName').textContent = currentUser.name || '用户';
    document.getElementById('profilePhone').textContent = currentUser.phone;
  } else {
    document.getElementById('profileName').textContent = '访客';
    document.getElementById('profilePhone').textContent = '点击登录';
  }
}

// 切换标签页（保留兼容）
function showTab(tabName) {
  showBottomTab(tabName);
}

// 加载我的订单
async function loadOrders() {
  const container = document.getElementById('ordersList');
  
  try {
    // 先检查是否登录
    if (!currentUser) {
      container.innerHTML = '<div class="text-center py-12"><p class="text-gray-500 mb-4">Please login to view orders</p><button onclick="showLoginModal()" class="px-6 py-2 bg-blue-600 text-white rounded-lg">Login</button></div>';
      return;
    }
    
    // 使用统一的API封装
    try {
      // 先尝试按手机号查询
      let data = await apiGet('/user/orders/by-phone', { showError: false });
      
      if (data && data.success) {
        if (data.orders && data.orders.length > 0) {
          renderOrders(data.orders);
        } else {
          container.innerHTML = '<div class="text-center py-12 text-gray-500">You have no orders yet</div>';
        }
        return;
      }
    } catch (error) {
      // 如果按手机号查询失败，尝试普通查询
      if (error.status === 401) {
        currentUser = null;
        updateLoginStatus();
        container.innerHTML = '<div class="text-center py-12"><p class="text-gray-500 mb-4">Login expired, please login again</p><button onclick="showLoginModal()" class="px-6 py-2 bg-blue-600 text-white rounded-lg">Login</button></div>';
        return;
      }
    }
    
    // 尝试普通订单查询接口
    try {
      const data = await apiGet('/user/orders', { showError: false });
      
      if (data && data.success) {
        if (data.orders && data.orders.length > 0) {
          renderOrders(data.orders);
        } else {
          container.innerHTML = '<div class="text-center py-12 text-gray-500">You have no orders yet</div>';
        }
      } else {
        container.innerHTML = '<div class="text-center py-12 text-red-500">' + (data?.message || 'Failed to load orders, please refresh and try again') + '</div>';
      }
    } catch (error) {
      if (error.status === 401) {
        currentUser = null;
        updateLoginStatus();
        container.innerHTML = '<div class="text-center py-12"><p class="text-gray-500 mb-4">Login expired, please login again</p><button onclick="showLoginModal()" class="px-6 py-2 bg-blue-600 text-white rounded-lg">Login</button></div>';
      } else {
        console.error('加载订单失败:', error);
        container.innerHTML = '<div class="text-center py-12 text-red-500">Failed to load orders: ' + (error.message || 'Network error') + '</div>';
      }
    }
  } catch (error) {
    console.error('加载订单失败:', error);
    container.innerHTML = '<div class="text-center py-12 text-red-500">Failed to load orders: ' + (error.message || 'Network error') + '</div>';
  }
}

// 渲染订单列表
function renderOrders(orders) {
  const container = document.getElementById('ordersList');
  
  if (orders.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-gray-500">您还没有订单</div>';
    return;
  }
  
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
  
  const canEdit = currentSettings.ordering_open === 'true';
  
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
  
  container.innerHTML = orders.map(order => {
    const isExpired = order.isExpired || false;
    const isActiveCycle = order.isActiveCycle !== false; // 默认为true，如果没有活跃周期
    // 如果不属于活跃周期，显示为灰色（活跃周期内的订单不显示为灰色）
    const inactiveClass = !isActiveCycle ? 'text-gray-400' : '';
    const inactiveBgClass = !isActiveCycle ? 'bg-gray-100' : 'bg-white';
    const expiredClass = isExpired ? 'text-gray-400' : inactiveClass;
    const expiredBgClass = isExpired ? 'bg-gray-100' : inactiveBgClass;
    
    // 格式化周期时间
    let cycleInfo = '';
    if (order.cycle_id) {
      const startTime = order.cycle_start_time ? new Date(order.cycle_start_time).toLocaleString('en-US') : 'N/A';
      const endTime = order.cycle_end_time ? new Date(order.cycle_end_time).toLocaleString('en-US') : 'Ongoing';
      cycleInfo = `
        <div class="mt-2 p-2 bg-blue-50 rounded text-xs">
          <div class="text-gray-600">Cycle ID: <span class="font-semibold">${order.cycle_id}</span> | Cycle Number: <span class="font-semibold">${order.cycle_number || 'N/A'}</span></div>
          <div class="text-gray-600 mt-1">Cycle Time: ${startTime} - ${endTime}</div>
        </div>
      `;
    }
    
    return `
    <div class="${expiredBgClass} rounded-xl shadow-md p-6 ${!isActiveCycle || isExpired ? 'opacity-75' : ''}">
      <div class="flex justify-between items-start mb-4">
        <div class="flex-1">
          <h3 class="text-lg font-bold ${expiredClass}">Order Number: ${order.order_number}</h3>
          <p class="text-sm ${expiredClass || 'text-gray-500'}">${new Date(order.created_at).toLocaleString('en-US')}</p>
          ${cycleInfo}
          ${isExpired ? '<p class="text-sm text-red-600 font-semibold mt-1">⚠️ Order Expired</p>' : ''}
        </div>
        <span class="px-3 py-1 rounded-full text-sm font-semibold ${statusColors[order.status]}">
          ${statusText[order.status]}
        </span>
      </div>
      
      <div class="border-t border-gray-200 pt-4 mb-4 space-y-3">
        ${order.items.map(item => {
          let toppings = [];
          try {
            if (item.toppings) {
              toppings = typeof item.toppings === 'string' ? JSON.parse(item.toppings) : item.toppings;
            }
          } catch (e) {}
          
          // 计算单价（不含数量）
          const unitPrice = item.quantity > 0 ? (item.subtotal / item.quantity) : item.product_price;
          
          return `
            <div class="py-3 border-b border-gray-100 last:border-0 bg-gray-50 rounded-lg p-3">
              <div class="flex justify-between items-start mb-2">
                <div class="flex-1">
                  <p class="font-semibold ${expiredClass || inactiveClass} text-base">${item.product_name}</p>
                  <p class="text-sm ${expiredClass || inactiveClass || 'text-gray-500'} mt-1">Quantity: ${item.quantity}</p>
                </div>
                <span class="${expiredClass || inactiveClass} font-bold text-lg">${formatPrice(item.subtotal)}</span>
              </div>
              
              <div class="${!isActiveCycle || isExpired ? 'bg-gray-50' : 'bg-white'} rounded p-2 mt-2 space-y-1">
                ${item.size ? `
                  <div class="flex justify-between text-xs">
                    <span class="${expiredClass || inactiveClass || 'text-gray-600'}">Size:</span>
                    <span class="${expiredClass || inactiveClass} font-medium">${item.size}</span>
                  </div>
                ` : ''}
                ${item.sugar_level ? `
                  <div class="flex justify-between text-xs">
                    <span class="${expiredClass || inactiveClass || 'text-gray-600'}">Sweetness:</span>
                    <span class="${expiredClass || inactiveClass} font-medium">${sugarLabels[item.sugar_level] || item.sugar_level}%</span>
                  </div>
                ` : ''}
                ${toppings.length > 0 ? `
                  <div class="flex justify-between text-xs">
                    <span class="${expiredClass || inactiveClass || 'text-gray-600'}">Toppings:</span>
                    <span class="${expiredClass || inactiveClass} font-medium">${Array.isArray(toppings) ? toppings.join(', ') : toppings}</span>
                  </div>
                ` : ''}
                ${item.ice_level ? `
                  <div class="flex justify-between text-xs">
                    <span class="${expiredClass || inactiveClass || 'text-gray-600'}">Ice Level:</span>
                    <span class="${expiredClass || inactiveClass} font-medium">${iceLabels[item.ice_level] || item.ice_level}</span>
                  </div>
                ` : ''}
                <div class="flex justify-between text-xs pt-1 border-t ${!isActiveCycle || isExpired ? 'border-gray-300' : 'border-gray-200'} mt-1">
                  <span class="${expiredClass || inactiveClass || 'text-gray-600'}">Unit Price:</span>
                  <span class="${expiredClass || inactiveClass} font-medium">${formatPrice(unitPrice)}</span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="${expiredClass || inactiveClass || 'text-gray-600'}">Subtotal:</span>
                  <span class="${!isActiveCycle || isExpired ? 'text-gray-500' : 'text-red-600'} font-bold">${formatPrice(item.subtotal)}</span>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      
      <div class="border-t ${!isActiveCycle || isExpired ? 'border-gray-300' : 'border-gray-200'} pt-4 mb-4 ${!isActiveCycle || isExpired ? 'bg-gray-50' : 'bg-gray-50'} rounded-lg p-4">
        <div class="space-y-2">
          <div class="flex justify-between items-center text-sm">
            <span class="${expiredClass || inactiveClass || 'text-gray-600'}">Original Price:</span>
            <span class="${expiredClass || inactiveClass} font-medium">${formatPrice(order.total_amount)}</span>
          </div>
          ${order.discount_amount > 0 ? `
            <div class="flex justify-between items-center text-sm">
              <span class="${expiredClass || inactiveClass || 'text-gray-600'}">Discount:</span>
              <span class="${!isActiveCycle || isExpired ? 'text-gray-500' : 'text-green-600'} font-medium">-${formatPrice(order.discount_amount)}</span>
            </div>
          ` : ''}
          <div class="flex justify-between items-center text-lg font-bold pt-2 border-t ${!isActiveCycle || isExpired ? 'border-gray-300' : 'border-gray-300'}">
            <span class="${expiredClass || inactiveClass}">Final Amount:</span>
            <span class="${!isActiveCycle || isExpired ? 'text-gray-500' : 'text-red-600'} text-xl">${formatPrice(order.final_amount)}</span>
          </div>
          ${order.notes ? `
            <div class="mt-3 pt-3 border-t ${!isActiveCycle || isExpired ? 'border-gray-300' : 'border-gray-200'}">
              <div class="text-xs text-gray-500 mb-1">Order Notes:</div>
              <div class="text-sm ${expiredClass || inactiveClass || 'text-gray-700'} bg-gray-50 p-2 rounded">${order.notes}</div>
            </div>
          ` : ''}
        </div>
      </div>
      
      ${order.status === 'pending' ? `
        <div class="flex ${canEdit ? 'space-x-2' : ''} mt-4">
          ${canEdit ? `
            <button onclick="deleteOrder('${order.id}')" 
                    class="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition">
              Delete Order
            </button>
          ` : ''}
          ${currentSettings.ordering_open === 'true' ? `
            <button disabled
                    class="${canEdit ? 'flex-1' : 'w-full'} bg-gray-400 text-white font-semibold py-3 rounded-lg transition cursor-not-allowed relative">
              <div class="flex flex-col items-center">
                <span>Upload Payment Screenshot</span>
                <span class="text-xs font-normal mt-1 opacity-90">Please wait for Close Ordering and final price calculation</span>
              </div>
            </button>
          ` : `
            <button onclick="showPaymentModal('${order.id}')" 
                    class="${canEdit ? 'flex-1' : 'w-full'} bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition">
              Upload Payment Screenshot
            </button>
          `}
        </div>
      ` : ''}
      
      ${order.payment_image ? `
        <div class="mt-4">
          <p class="text-sm text-gray-600 mb-2">Payment Screenshot:</p>
          <button onclick="showPaymentImageModal('${order.payment_image}')" class="text-blue-600 hover:text-blue-800 text-sm underline">View Payment Screenshot</button>
        </div>
      ` : ''}
    </div>
  `;
  }).join('');
}

// 删除订单
async function deleteOrder(orderId) {
  const confirmed = await showConfirmDialog(
    'Delete Order',
    'Are you sure you want to delete this order? This action cannot be undone.',
    'Delete',
    'Cancel'
  );
  
  if (!confirmed) return;
  
  try {
    const response = await fetch(`${API_BASE}/user/orders/${orderId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Order deleted', 'success');
      loadOrders();
    } else {
      showToast(data.message || 'Delete failed', 'error');
    }
  } catch (error) {
    console.error('Failed to delete order:', error);
    showToast('Delete failed, please try again', 'error');
  }
}

// 显示付款模态框
function showPaymentModal(orderId) {
  currentPaymentOrderId = orderId;
  
  // 查找订单信息
  fetch(`${API_BASE}/user/orders/${orderId}`, { credentials: 'include' })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        const order = data.order;
        document.getElementById('paymentOrderInfo').innerHTML = `
          <p class="font-semibold">订单号: ${order.order_number}</p>
          <p class="text-2xl font-bold text-blue-600 mt-2">应付: ${formatPriceDecimal(order.final_amount)}</p>
        `;
        document.getElementById('paymentModal').classList.add('active');
      }
    });
}

// 关闭付款模态框
function closePayment() {
  document.getElementById('paymentModal').classList.remove('active');
  currentPaymentOrderId = null;
  document.getElementById('paymentForm').reset();
}

// 上传付款截图
async function uploadPayment() {
  const uploadBtn = document.querySelector('#paymentForm button[type="submit"]');
  setButtonLoading(uploadBtn, true);
  
  const fileInput = document.getElementById('paymentImage');
  const file = fileInput.files[0];
  
  if (!file) {
    showToast('Please select payment screenshot', 'warning');
    setButtonLoading(uploadBtn, false);
    return;
  }
  
  const formData = new FormData();
  formData.append('payment_image', file);
  
  try {
    const response = await fetch(`${API_BASE}/user/orders/${currentPaymentOrderId}/payment`, {
      method: 'POST',
      credentials: 'include',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast('Payment screenshot uploaded successfully!', 'success');
      closePayment();
      loadOrders();
    } else {
      showToast(data.message || 'Upload failed', 'error');
    }
  } catch (error) {
    console.error('上传付款截图失败:', error);
    showToast('Upload failed, please try again', 'error');
  } finally {
    setButtonLoading(uploadBtn, false);
  }
}

// 显示提示
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

