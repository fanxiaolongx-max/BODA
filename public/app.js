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

// 格式化价格显示（带小数）
function formatPriceDecimal(price) {
  return `${parseFloat(price).toFixed(2)} ${currencySymbol}`;
}

// 智能分割中英文文本
function smartSplitText(text) {
  if (!text) return { en: '', zh: '' };
  
  // 检测中文字符的正则表达式
  const chineseRegex = /[\u4e00-\u9fa5]/;
  const englishRegex = /[a-zA-Z]/;
  
  // 如果文本不包含中文，全部作为英文
  if (!chineseRegex.test(text)) {
    return { en: text.trim(), zh: '' };
  }
  
  // 如果文本不包含英文，全部作为中文
  if (!englishRegex.test(text)) {
    return { en: '', zh: text.trim() };
  }
  
  // 尝试多种分割模式
  // 模式1: "English 中文" 或 "English中文" (英文在前，最常见)
  const pattern1 = /^([a-zA-Z\s]+?)([\u4e00-\u9fa5]+.*)$/;
  const match1 = text.match(pattern1);
  if (match1) {
    return { en: match1[1].trim(), zh: match1[2].trim() };
  }
  
  // 模式2: "中文 English" 或 "中文English" (中文在前)
  const pattern2 = /^([\u4e00-\u9fa5]+.*?)([a-zA-Z\s]+)$/;
  const match2 = text.match(pattern2);
  if (match2) {
    return { en: match2[2].trim(), zh: match2[1].trim() };
  }
  
  // 模式3: 混合格式，尝试按空格分割
  const parts = text.split(/\s+/);
  const enParts = [];
  const zhParts = [];
  
  parts.forEach(part => {
    if (chineseRegex.test(part)) {
      zhParts.push(part);
    } else if (englishRegex.test(part)) {
      enParts.push(part);
    } else if (part.trim()) {
      // 如果既没有中文也没有英文，可能是数字或符号，根据上下文判断
      // 默认放到英文部分
      enParts.push(part);
    }
  });
  
  return {
    en: enParts.join(' ').trim(),
    zh: zhParts.join(' ').trim()
  };
}

// 根据当前语言获取文本（带缓存）
const localizedTextCache = new Map();
function getLocalizedText(text) {
  if (!text) return '';
  
  const lang = typeof getLanguage === 'function' ? getLanguage() : 'en';
  const cacheKey = `${lang}:${text}`;
  
  if (localizedTextCache.has(cacheKey)) {
    return localizedTextCache.get(cacheKey);
  }
  
  const split = smartSplitText(text);
  let result;
  
  if (lang === 'zh') {
    // 优先显示中文，如果没有中文则显示英文
    result = split.zh || split.en || text;
  } else {
    // 优先显示英文，如果没有英文则显示中文
    result = split.en || split.zh || text;
  }
  
  localizedTextCache.set(cacheKey, result);
  return result;
}

// 清除本地化文本缓存（语言切换时调用）
function clearLocalizedTextCache() {
  localizedTextCache.clear();
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
  
  // Load user language preference (在设置加载之后)
  // 优先使用用户手动设置，否则使用浏览器语言
  const savedLanguage = typeof getInitialLanguage === 'function' 
    ? getInitialLanguage() 
    : (localStorage.getItem('language') || 'en');
  if (typeof setLanguage === 'function') {
    setLanguage(savedLanguage);
  } else {
    // 如果 setLanguage 还未加载，直接应用翻译
    if (typeof applyTranslations === 'function') {
      applyTranslations();
    }
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
      // 如果元素是button且内部有span，更新span的文本
      if (el.tagName === 'BUTTON' && el.querySelector('span[data-i18n]')) {
        const span = el.querySelector('span[data-i18n]');
        if (span) {
          span.textContent = t(key);
        }
      } else {
        // 否则直接更新元素文本
        el.textContent = t(key);
      }
    }
  });
  
  // Update placeholder attributes
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key && typeof t === 'function') {
      el.placeholder = t(key);
    }
  });
  
  // Update language display button
  updateLanguageButton();
  
  // 确保Login按钮文本更新（如果按钮可见且没有隐藏）
  const loginBtn = document.getElementById('loginBtn');
  if (loginBtn && !loginBtn.classList.contains('hidden')) {
    const loginSpan = loginBtn.querySelector('span[data-i18n="login"]');
    if (loginSpan && typeof t === 'function') {
      loginSpan.textContent = t('login');
    } else if (typeof t === 'function') {
      // 如果按钮本身有data-i18n属性，直接更新
      if (loginBtn.getAttribute('data-i18n') === 'login') {
        loginBtn.textContent = t('login');
      }
    }
  }
  
  // 确保登录模态框中的提交按钮文本更新
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');
  if (loginSubmitBtn && typeof t === 'function') {
    const loginSubmitSpan = loginSubmitBtn.querySelector('span[data-i18n="login"]');
    if (loginSubmitSpan) {
      loginSubmitSpan.textContent = t('login');
    }
  }
}

// 更新语言切换按钮显示
function updateLanguageButton() {
  const languageBtn = document.getElementById('languageDisplay');
  const languageBtnProfile = document.getElementById('languageDisplayProfile');
  if (typeof getLanguage === 'function') {
    const lang = getLanguage();
    // 显示可以切换到的语言（而不是当前语言）
    // 当前是中文时显示"EN"，当前是英文时显示"中文"
    const displayText = lang === 'zh' ? 'EN' : '中文';
    if (languageBtn) {
      languageBtn.textContent = displayText;
    }
    if (languageBtnProfile) {
      languageBtnProfile.textContent = displayText;
    }
  }
}

// 切换语言
function toggleLanguage() {
  if (typeof getLanguage === 'function' && typeof setLanguage === 'function') {
    const currentLang = getLanguage();
    const newLang = currentLang === 'en' ? 'zh' : 'en';
    setLanguage(newLang);
    // 清除本地化文本缓存
    clearLocalizedTextCache();
  }
}

// Session过期检查定时器（用户）
let userSessionCheckInterval = null;
// Session刷新定时器（rolling session）
let userSessionRefreshInterval = null;

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
          // 启动session检查和刷新
          startUserSessionCheck();
          startUserSessionRefresh();
        } else {
          currentUser = null;
          updateLoginStatus();
          // 停止session检查
          stopUserSessionCheck();
        }
      } else {
        currentUser = null;
        updateLoginStatus();
        // 停止session检查和刷新
        stopUserSessionCheck();
        stopUserSessionRefresh();
      }
    } else {
      const data = await apiGet('/auth/user/me', { showError: false });
      if (data && data.user) {
        currentUser = data.user;
        updateLoginStatus();
        // 启动session检查
        startUserSessionCheck();
      } else {
        currentUser = null;
        updateLoginStatus();
        // 停止session检查和刷新
        stopUserSessionCheck();
        stopUserSessionRefresh();
      }
    }
  } catch (error) {
    // 认证失败是正常的（用户未登录），不显示错误，也不弹出登录框
    currentUser = null;
    updateLoginStatus();
    // 停止session检查
    stopUserSessionCheck();
  }
}

// 启动用户session过期检查
function startUserSessionCheck() {
  // 清除旧的定时器
  stopUserSessionCheck();
  
  // 每30秒检查一次session状态
  userSessionCheckInterval = setInterval(async () => {
    try {
      const response = await fetch(`${API_BASE}/auth/session/info`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.session) {
          // 检查用户session是否即将过期（剩余时间少于1分钟）或已过期
          if (data.session.user && (data.session.user.isExpired || data.session.user.remainingMs <= 60000)) {
            stopUserSessionCheck();
            showToast(t('session_expired'), 'info');
            setTimeout(async () => {
              // 自动退出登录
              await logout();
              // 跳转到主页
              showBottomTab('home');
            }, 1000);
          }
        }
      } else if (response.status === 401) {
        // Session已过期，检查是否是用户session过期
        if (currentUser) {
          stopUserSessionCheck();
          showToast(t('session_expired'), 'info');
          setTimeout(async () => {
            currentUser = null;
            updateLoginStatus();
            showBottomTab('home');
          }, 1000);
        }
      }
    } catch (error) {
      console.error('Session check failed:', error);
    }
  }, 30000); // 每30秒检查一次
}

// 停止用户session过期检查
function stopUserSessionCheck() {
  if (userSessionCheckInterval) {
    clearInterval(userSessionCheckInterval);
    userSessionCheckInterval = null;
  }
}

// 刷新用户session时间（rolling session）
async function refreshUserSession() {
  try {
    await fetch(`${API_BASE}/auth/session/refresh`, {
      method: 'POST',
      credentials: 'include'
    });
  } catch (error) {
    console.error('Session refresh failed:', error);
  }
}

// 启动用户session刷新（rolling session）
function startUserSessionRefresh() {
  // 清除旧的定时器
  stopUserSessionRefresh();
  
  // 页面加载时立即刷新一次
  refreshUserSession();
  
  // 每5分钟刷新一次session时间
  userSessionRefreshInterval = setInterval(() => {
    refreshUserSession();
  }, 5 * 60 * 1000); // 5分钟
  
  // 监听用户活动（点击、键盘输入等），延迟刷新session
  let activityTimeout;
  const handleActivity = () => {
    clearTimeout(activityTimeout);
    activityTimeout = setTimeout(() => {
      refreshUserSession();
    }, 60000); // 用户活动后1分钟刷新session
  };
  
  document.addEventListener('click', handleActivity);
  document.addEventListener('keydown', handleActivity);
  document.addEventListener('scroll', handleActivity);
  
  // 页面可见性变化时刷新
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshUserSession();
    }
  });
}

// 停止用户session刷新
function stopUserSessionRefresh() {
  if (userSessionRefreshInterval) {
    clearInterval(userSessionRefreshInterval);
    userSessionRefreshInterval = null;
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
    showToast(t('please_enter_phone'), 'error');
    return;
  }
  
  if (phone.length < 8 || phone.length > 15) {
    showToast(t('phone_length_error'), 'error');
    return;
  }
  
  // Only allow digits and + (international prefix)
  if (!/^[+\d]+$/.test(phone)) {
    showToast(t('phone_format_error'), 'error');
    return;
  }

  // 检查是否需要验证码
  const smsEnabled = currentSettings.sms_enabled === 'true';
  
  if (smsEnabled) {
    // 如果启用了短信验证码，必须提供验证码
    if (!code) {
      showToast(t('please_enter_code'), 'error');
      return;
    }
    
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      showToast(t('code_length_error'), 'error');
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
      showToast(t('login_success'), 'success');
      
      // 启动session检查
      startUserSessionCheck();
      
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
      showToast(data.message || t('login_failed'), 'error');
    }
  } catch (error) {
    console.error('Login failed:', error);
    showToast(t('login_failed_retry'), 'error');
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
      showToast(t('login_success'), 'success');
      
      // 启动session检查
      startUserSessionCheck();
      
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
        showToast(t('sms_verification_required'), 'info');
        const codeSection = document.getElementById('verificationCodeSection');
        if (codeSection) {
          codeSection.classList.remove('hidden');
        }
        // 自动发送验证码
        await sendVerificationCode();
      } else {
        showToast(data.message || t('login_failed'), 'error');
      }
    }
  } catch (error) {
    console.error('Login failed:', error);
    showToast(t('login_failed_retry'), 'error');
  } finally {
    setButtonLoading(loginBtn, false);
  }
}

// 登出
async function logout() {
  try {
    // 停止session检查和刷新
    stopUserSessionCheck();
    stopUserSessionRefresh();
    
    await fetch(`${API_BASE}/auth/user/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    currentUser = null;
    cart = [];
    updateCartBadge();
    updateLoginStatus();
    showToast(t('logged_out'));
    showTab('home'); // 登出后跳转到首页
  } catch (error) {
    console.error('登出失败:', error);
    // 即使登出失败，也清除本地状态
    currentUser = null;
    cart = [];
    updateCartBadge();
    updateLoginStatus();
    showTab('home'); // 登出后跳转到首页
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
    showToast(t('please_enter_phone_first'), 'error');
    return;
  }
  
  if (phone.length < 8 || phone.length > 15) {
    showToast(t('phone_length_error'), 'error');
    return;
  }
  
  if (!/^[+\d]+$/.test(phone)) {
    showToast(t('phone_format_error'), 'error');
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
      showToast(data.message || t('verification_code_sent'), 'success');
      
      // 显示验证码输入框
      const codeSection = document.getElementById('verificationCodeSection');
      if (codeSection) {
        codeSection.classList.remove('hidden');
      }
      
      // 开发环境显示验证码（如果返回了）
      if (data.code) {
        console.log('Verification code (dev only):', data.code);
        showToast(t('verification_code_dev', { code: data.code }), 'info');
      }
      
      // 开始倒计时
      startCountdown();
    } else {
      showToast(data.message || t('failed_send_code'), 'error');
    }
  } catch (error) {
    console.error('Send verification code failed:', error);
    showToast(t('failed_send_code_retry'), 'error');
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
      countdownEl.textContent = t('resend_code_in', { seconds: countdownSeconds });
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
  document.title = t('store_ordering_system', { storeName: storeName });
  
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
    welcomeTitle.textContent = t('welcome_to_store', { storeName: storeName });
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
    if (loginBtn) loginBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (userName) userName.textContent = currentUser.name || currentUser.phone;
  } else {
    if (loginBtn) {
      loginBtn.classList.remove('hidden');
      // 确保Login按钮文本使用当前语言
      const loginSpan = loginBtn.querySelector('span[data-i18n="login"]');
      if (loginSpan && typeof t === 'function') {
        loginSpan.textContent = t('login');
      } else if (typeof t === 'function') {
        // 如果按钮本身有data-i18n属性，直接更新按钮文本
        loginBtn.textContent = t('login');
      }
    }
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (userName) userName.textContent = t('guest');
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
      <div class="text-xs">${t('all')}</div>
    </button>
  `;
  
  categories.forEach(cat => {
    // 使用智能分割获取本地化分类名称
    const localizedName = getLocalizedText(cat.name);
    // 简化分类名称显示（如果名称太长，只显示前几个字符）
    const shortName = localizedName.length > 8 ? localizedName.substring(0, 8) + '...' : localizedName;
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
    container.innerHTML = `<div class="col-span-full text-center py-12 text-gray-500">${t('no_products')}</div>`;
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
      html += `<h3 class="text-sm font-bold text-gray-700 mb-3 px-2">${getLocalizedText(catName)}</h3>`;
    }
    
    prods.forEach(product => {
      // 解析杯型价格
      let sizes = {};
      try {
        sizes = JSON.parse(product.sizes || '{}');
      } catch (e) {
        sizes = {};
      }
      
      // 获取最低价格（用于显示和颜色）
      const prices = Object.values(sizes);
      const minPrice = prices.length > 0 ? Math.min(...prices) : product.price;
      const hasMultipleSizes = prices.length > 1;
      
      // 使用显示的最低价格来确定颜色（相同价格相同颜色）
      const priceForColor = minPrice;
      
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
            <h4 class="text-sm font-bold text-gray-900 line-clamp-1">${getLocalizedText(product.name)}</h4>
            ${product.description && !product.description.includes('支持多种') ? 
              `<p class="text-xs text-gray-500 mt-1 line-clamp-1">${getLocalizedText(product.description)}</p>` : 
              ''}
            <div class="flex items-center justify-between mt-2">
              <div>
                <span class="${getPriceColor(priceForColor)} font-bold text-base">${formatPrice(minPrice)}</span>
                ${hasMultipleSizes ? '<span class="text-xs text-gray-500 ml-1">起</span>' : ''}
              </div>
              <button onclick='showProductDetail(${JSON.stringify(product).replace(/'/g, "&apos;")})' 
                      class="px-4 py-1.5 ${currentSettings.ordering_open === 'true' ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-400 cursor-not-allowed'} text-white font-semibold rounded-full transition text-xs"
                      ${currentSettings.ordering_open !== 'true' ? 'disabled' : ''}>
                ${currentSettings.ordering_open === 'true' ? t('select') : t('closed')}
              </button>
            </div>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
  });
  
  container.innerHTML = html || `<div class="text-center py-12 text-gray-500">${t('no_products_chinese')}</div>`;
  
  // 设置滚动监听，实现左侧分类自动高亮
  setupCategoryScrollHighlight();
}

// 设置分类滚动高亮（使用 Intersection Observer API - 业界推荐方案）
function setupCategoryScrollHighlight() {
  const productsScroll = document.getElementById('productsScroll');
  if (!productsScroll) return;
  
  // 清理旧的 Observer
  if (productsScroll._categoryObserver) {
    productsScroll._categoryObserver.disconnect();
    productsScroll._categoryObserver = null;
  }
  
  // 移除旧的滚动监听器（如果存在）
  if (productsScroll._scrollHandler) {
    productsScroll.removeEventListener('scroll', productsScroll._scrollHandler);
    productsScroll._scrollHandler = null;
  }
  
  // 获取所有分类区域
  const categoryElements = document.querySelectorAll('[id^="category-"]');
  if (categoryElements.length === 0) return;
  
  // 存储每个分类的可见性状态
  const categoryVisibility = new Map();
  
  // 创建 Intersection Observer
  // rootMargin: 顶部偏移，让分类在进入视口前就开始高亮
  // threshold: 当元素可见度达到 10% 时就触发
  const observerOptions = {
    root: productsScroll,
    rootMargin: '-20% 0px -70% 0px', // 顶部20%到70%的区域视为"激活区域"
    threshold: [0, 0.1, 0.5, 1.0] // 多个阈值，更精确的检测
  };
  
  productsScroll._categoryObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const categoryName = entry.target.id.replace('category-', '');
      // 记录可见性，使用 intersectionRatio 判断可见程度
      categoryVisibility.set(categoryName, {
        isIntersecting: entry.isIntersecting,
        ratio: entry.intersectionRatio,
        boundingClientRect: entry.boundingClientRect
      });
    });
    
    // 找到最合适的激活分类
    let activeCategory = findActiveCategory(categoryVisibility, productsScroll);
    
    // 更新高亮
    if (activeCategory !== null) {
      highlightCategory(activeCategory);
    }
  }, observerOptions);
  
  // 观察所有分类元素
  categoryElements.forEach(element => {
    productsScroll._categoryObserver.observe(element);
  });
  
  // 添加滚动开始/结束检测，防止误触购物车按钮
  productsScroll._scrollHandler = () => {
    isScrolling = true;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      isScrolling = false;
    }, 150);
  };
  
  productsScroll.addEventListener('scroll', productsScroll._scrollHandler, { passive: true });
  
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
    
    if (deltaY > 10 || deltaTime > 300) {
      isScrolling = true;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        isScrolling = false;
      }, 150);
    }
  }, { passive: true });
  
  // 初始触发一次（延迟确保DOM已渲染）
  setTimeout(() => {
    const activeCategory = findActiveCategory(categoryVisibility, productsScroll);
    if (activeCategory !== null) {
      highlightCategory(activeCategory);
    }
  }, 200);
}

// 找到当前最应该激活的分类
function findActiveCategory(categoryVisibility, container) {
  if (categoryVisibility.size === 0) return null;
  
  const containerRect = container.getBoundingClientRect();
  const containerCenter = containerRect.top + containerRect.height * 0.3; // 视口上方30%位置作为激活点
  
  let bestCategory = null;
  let bestScore = -1;
  
  // 遍历所有可见的分类
  categoryVisibility.forEach((visibility, categoryName) => {
    if (!visibility.isIntersecting) return;
    
    const element = document.getElementById(`category-${categoryName}`);
    if (!element) return;
    
    const rect = element.getBoundingClientRect();
    const elementCenter = rect.top + rect.height / 2;
    
    // 计算分数：距离激活点越近，分数越高
    // 同时考虑可见度比例
    const distanceFromCenter = Math.abs(elementCenter - containerCenter);
    const visibilityScore = visibility.ratio;
    
    // 综合分数：可见度权重70%，距离权重30%
    const score = visibilityScore * 0.7 + (1 - Math.min(distanceFromCenter / containerRect.height, 1)) * 0.3;
    
    if (score > bestScore) {
      bestScore = score;
      bestCategory = categoryName;
    }
  });
  
  return bestCategory;
}

// 高亮指定分类（优化版本，支持防抖和更准确的匹配）
let highlightTimeout = null;
function highlightCategory(categoryName) {
  // 防抖处理，避免频繁更新
  if (highlightTimeout) {
    clearTimeout(highlightTimeout);
  }
  
  highlightTimeout = setTimeout(() => {
    const navButtons = document.querySelectorAll('.category-nav-btn');
    let hasActive = false;
    
    navButtons.forEach(btn => {
      const btnText = btn.textContent.trim();
      let shouldHighlight = false;
      
      // 如果是"全部"按钮
      if (categoryName === null) {
        shouldHighlight = btnText === t('all');
      } else {
        // 查找匹配的分类（categoryName 是原始分类名称，如 "TOP DRINKS 人气推荐"）
        const matchedCategory = categories.find(cat => cat.name === categoryName);
        
        if (matchedCategory) {
          // 获取本地化后的名称
          const localizedName = getLocalizedText(matchedCategory.name);
          const shortName = localizedName.length > 8 ? localizedName.substring(0, 8) + '...' : localizedName;
          
          // 检查按钮文本是否匹配（支持完整名称和截断名称）
          shouldHighlight = btnText === localizedName || btnText === shortName;
        }
      }
      
      // 更新按钮样式
      if (shouldHighlight) {
        hasActive = true;
        btn.classList.add('bg-white', 'text-green-600', 'font-semibold', 'border-l-3', 'border-green-600');
        btn.classList.remove('text-gray-600', 'hover:bg-gray-100');
      } else {
        btn.classList.remove('bg-white', 'text-green-600', 'font-semibold', 'border-l-3', 'border-green-600');
        btn.classList.add('text-gray-600', 'hover:bg-gray-100');
      }
    });
    
    // 如果没有找到匹配的按钮，可能是分类名称不匹配，尝试直接匹配
    if (!hasActive && categoryName !== null) {
      // 尝试通过原始名称直接匹配（作为后备方案）
      navButtons.forEach(btn => {
        const btnText = btn.textContent.trim();
        const matchedCategory = categories.find(cat => {
          const localizedName = getLocalizedText(cat.name);
          const shortName = localizedName.length > 8 ? localizedName.substring(0, 8) + '...' : localizedName;
          return (cat.name === categoryName) && (btnText === localizedName || btnText === shortName);
        });
        
        if (matchedCategory) {
          btn.classList.add('bg-white', 'text-green-600', 'font-semibold', 'border-l-3', 'border-green-600');
          btn.classList.remove('text-gray-600', 'hover:bg-gray-100');
        }
      });
    }
  }, 50); // 50ms 防抖
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
      container.innerHTML = t('ordering_open_welcome');
    } else {
      container.className = 'mb-6 p-4 rounded-lg bg-yellow-100 border border-yellow-300 text-yellow-800';
      container.innerHTML = t('ordering_closed_notification');
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
  toppingPricesMap.clear(); // 重置加料价格映射
  selectedIce = null; // 重置冰度选择
  detailQuantity = 1; // 确保每次打开都重置为1
  
  // 加载所有产品（用于查找加料价格）
  // 不再依赖特定的加料产品，而是通过名称匹配所有产品
  if (allToppings.length === 0) {
    try {
      const response = await fetch(`${API_BASE}/public/products`);
      const data = await response.json();
      if (data.success) {
        // 加载所有产品，用于按名称查找加料价格
        // 不再筛选特定的加料产品，而是保存所有产品以便按名称查找
        allToppings = data.products;
      }
    } catch (error) {
      console.error('加载产品失败:', error);
    }
  }
  
  // 设置商品名称和描述
  document.getElementById('detailProductName').textContent = getLocalizedText(product.name);
  document.getElementById('detailProductDesc').textContent = getLocalizedText(product.description || '');
  
  // 渲染杯型选择
  renderSizeOptions(product);
  
  // 渲染甜度选择
  renderSugarOptions(product);
  
  // 渲染加料选择（异步）
  await renderToppingOptions(product);
  
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
    // 使用翻译的默认值，但需要保存原始key以便后续查找
    const defaultKey = '默认';
    sizes = { [defaultKey]: product.price };
  }
  
  // 默认选中第一个杯型
  if (!selectedSize) {
    selectedSize = Object.keys(sizes)[0];
  }
  
  container.innerHTML = Object.entries(sizes).map(([sizeName, price]) => `
    <button onclick="selectSize('${sizeName}')" 
            class="size-option px-6 py-3 border-2 rounded-lg transition ${selectedSize === sizeName ? 'border-yellow-500 bg-yellow-50 text-yellow-700 font-semibold' : 'border-gray-300 text-gray-700 hover:border-yellow-400'}">
      ${getLocalizedText(sizeName)} <span class="text-sm">${formatPrice(price)}</span>
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
    '0': t('sugar_zero'),
    '30': t('sugar_light'),
    '50': t('sugar_half'),
    '70': t('sugar_less'),
    '100': t('sugar_regular')
  };
  
  container.innerHTML = sugarLevels.map(level => `
    <button onclick="selectSugar('${level}')" 
            class="sugar-option px-5 py-2 border-2 rounded-lg transition text-sm ${selectedSugar === level ? 'border-yellow-500 bg-yellow-50 text-yellow-700 font-semibold' : 'border-gray-300 text-gray-700 hover:border-yellow-400'}">
      ${sugarLabels[level]} ${level}%${level === '100' ? ' ' + t('sugar_recommended') : ''}
    </button>
  `).join('');
}

// 渲染加料选择 - 支持名称数组格式（不再依赖产品记录）
async function renderToppingOptions(product) {
  const container = document.getElementById('toppingOptions');
  let availableToppingNames = [];
  
  try {
    const availableToppings = JSON.parse(product.available_toppings || '[]');
    
    // 检查格式类型
    if (Array.isArray(availableToppings) && availableToppings.length > 0) {
      const firstItem = availableToppings[0];
      
      if (typeof firstItem === 'number') {
        // 旧格式1：ID数组，需要查找产品名称
        try {
          const response = await fetch(`${API_BASE}/public/products`);
          const data = await response.json();
          if (data.success) {
            const allProducts = data.products;
            availableToppingNames = availableToppings.map(id => {
              const product = allProducts.find(p => parseInt(p.id) === parseInt(id));
              return product ? { name: product.name, price: product.price } : { name: `Topping #${id}`, price: 0 };
            }).filter(item => item.name);
          }
        } catch (e) {
          console.error('Failed to load products for ID conversion:', e);
          availableToppingNames = availableToppings.map(id => ({ name: `Topping #${id}`, price: 0 }));
        }
      } else if (typeof firstItem === 'string') {
        // 旧格式2：名称数组（字符串），转换为对象格式
        availableToppingNames = availableToppings.map(name => ({ name: name, price: 0 }));
      } else if (typeof firstItem === 'object' && firstItem !== null) {
        // 新格式：对象数组 [{name: "Cheese 芝士", price: 20}, ...]
        availableToppingNames = availableToppings.map(item => ({
          name: item.name || item,
          price: item.price || 0
        })).filter(item => item.name);
      }
    }
  } catch (e) {
    console.error('Failed to parse available_toppings:', e);
    availableToppingNames = [];
  }
  
  if (availableToppingNames.length === 0) {
    container.innerHTML = `<p class="text-sm text-gray-500">${t('no_toppings_available')}</p>`;
    return;
  }
  
  // 加载所有产品以查找价格（通过名称匹配）
  let toppingPricesMap = new Map();
  try {
    const response = await fetch(`${API_BASE}/public/products`);
    const data = await response.json();
    if (data.success) {
      data.products.forEach(p => {
        // 按名称匹配加料产品
        if (availableToppingNames.includes(p.name)) {
          toppingPricesMap.set(p.name, p.price);
        }
      });
    }
  } catch (e) {
    console.error('Failed to load products for price lookup:', e);
  }
  
  // 检查是否是新的对象格式（包含价格）
  const isObjectFormat = availableToppingNames.length > 0 && typeof availableToppingNames[0] === 'object';
  
  container.innerHTML = availableToppingNames.map(toppingItem => {
    let toppingName, toppingPrice;
    
    if (isObjectFormat && typeof toppingItem === 'object' && toppingItem !== null) {
      // 新格式：对象格式 {name: "Cheese 芝士", price: 20}
      toppingName = toppingItem.name || toppingItem;
      toppingPrice = toppingItem.price || 0;
    } else {
      // 旧格式：字符串名称，尝试从产品中查找价格
      toppingName = typeof toppingItem === 'string' ? toppingItem : (toppingItem.name || toppingItem);
      toppingPrice = toppingPricesMap.get(toppingName) || 0;
    }
    
    const isSelected = selectedToppings.includes(toppingName);
    
    return `
      <label class="flex items-center justify-between p-3 border-2 rounded-lg cursor-pointer transition ${isSelected ? 'border-yellow-500 bg-yellow-50' : 'border-gray-300 hover:border-yellow-400'}">
        <div class="flex items-center">
          <input type="checkbox" 
                 onchange="toggleTopping('${toppingName.replace(/'/g, "\\'")}', ${toppingPrice})" 
                 ${isSelected ? 'checked' : ''}
                 class="w-5 h-5 text-yellow-500 rounded">
          <span class="ml-3 font-medium text-gray-900">${getLocalizedText(toppingName)}</span>
        </div>
        ${toppingPrice > 0 ? `<span class="text-sm text-gray-600">+${formatPrice(toppingPrice)}</span>` : ''}
      </label>
    `;
  }).join('');
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
    'normal': t('ice_normal'),
    'less': t('ice_less'),
    'no': t('ice_no'),
    'room': t('ice_room'),
    'hot': t('ice_hot')
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

// 切换加料 - 现在使用名称，并保存价格信息
// 加料格式：字符串（名称）或对象 {name: "Cheese 芝士", price: 20}
let toppingPricesMap = new Map(); // 存储每个加料名称对应的价格

function toggleTopping(toppingName, price = 0) {
  const index = selectedToppings.indexOf(toppingName);
  if (index > -1) {
    selectedToppings.splice(index, 1);
    toppingPricesMap.delete(toppingName);
  } else {
    selectedToppings.push(toppingName);
    if (price > 0) {
      toppingPricesMap.set(toppingName, price);
    }
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
  
  // 加料价格 - 优先使用配置的价格，如果没有则查找产品价格
  let toppingPrice = 0;
  if (selectedToppings.length > 0) {
    selectedToppings.forEach(toppingName => {
      // 优先使用配置的价格（来自 toppingPricesMap）
      const configuredPrice = toppingPricesMap.get(toppingName);
      if (configuredPrice !== undefined && configuredPrice > 0) {
        toppingPrice += configuredPrice;
      } else if (allToppings.length > 0) {
        // 如果没有配置价格，尝试从产品中查找
        const topping = allToppings.find(t => t.name === toppingName);
        if (topping) {
          toppingPrice += topping.price;
          // 缓存价格到 toppingPricesMap
          toppingPricesMap.set(toppingName, topping.price);
        }
      }
    });
  }
  
  // 总价 = (基础价格 + 加料价格) × 数量
  const totalPrice = (basePrice + toppingPrice) * detailQuantity;
  
  document.getElementById('detailTotalPrice').textContent = formatPrice(totalPrice);
}

// 从详情页加入购物车
function addToCartFromDetail() {
  if (!currentDetailProduct || !selectedSize) {
    showToast(t('please_select_specs'), 'warning');
    return;
  }
  
  // 获取选中的加料信息 - 优先使用配置的价格，如果没有则查找产品价格
  const selectedToppingItems = selectedToppings.map(toppingName => {
    // 优先使用配置的价格（来自 toppingPricesMap）
    const configuredPrice = toppingPricesMap.get(toppingName);
    if (configuredPrice !== undefined && configuredPrice > 0) {
      return { name: toppingName, price: configuredPrice, id: null };
    }
    
    // 如果没有配置价格，尝试查找产品记录
    const topping = allToppings.find(t => t.name === toppingName);
    if (topping) {
      return { name: toppingName, price: topping.price, id: topping.id };
    }
    
    // 如果都找不到，返回名称和默认价格0
    return { name: toppingName, price: 0, id: null };
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
    size_price: sizePrice, // 保存Size的基础价格
    sugar_level: selectedSugar,
    ice_level: selectedIce || null, // 添加冰度选择
    toppings: selectedToppingItems,
    base_price: sizePrice,
    topping_price: selectedToppingItems.reduce((sum, t) => sum + t.price, 0),
    price: sizePrice + selectedToppingItems.reduce((sum, t) => sum + t.price, 0),
    quantity: detailQuantity
  };
  
  // 检查是否已有相同配置的商品
  // 比较加料时，使用名称数组而不是ID数组
  const existingIndex = cart.findIndex(item => {
    const itemToppingNames = (item.toppings || []).map(t => (typeof t === 'string' ? t : t.name || t.id)).sort();
    const cartToppingNames = (cartItem.toppings || []).map(t => (typeof t === 'string' ? t : t.name || t.id)).sort();
    
    return item.product_id === cartItem.product_id &&
      item.size === cartItem.size &&
      item.sugar_level === cartItem.sugar_level &&
      item.ice_level === cartItem.ice_level &&
      JSON.stringify(itemToppingNames) === JSON.stringify(cartToppingNames);
  });
  
  if (existingIndex > -1) {
    cart[existingIndex].quantity += cartItem.quantity;
  } else {
    cart.push(cartItem);
  }
  
  updateCartBadge();
  closeProductDetail();
  showToast(t('added_to_cart'));
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
    showToast(t('cart_empty'), 'warning');
    return;
  }
  
  const container = document.getElementById('cartItems');
  const sugarLabels = {
    '0': t('sugar_zero'),
    '30': t('sugar_light'),
    '50': t('sugar_half'),
    '70': t('sugar_less'),
    '100': t('sugar_regular')
  };
  
  const iceLabels = {
    'normal': t('ice_normal'),
    'less': t('ice_less'),
    'no': t('ice_no'),
    'room': t('ice_room'),
    'hot': t('ice_hot')
  };
  
  container.innerHTML = cart.map((item, index) => `
    <div class="p-4 bg-gray-50 rounded-lg">
      <div class="flex items-start justify-between mb-2">
        <div class="flex-1">
          <h4 class="font-semibold text-gray-900">${getLocalizedText(item.name)}</h4>
          <div class="text-xs text-gray-600 mt-1 space-y-0.5">
            <p>${t('size_label_colon')} ${getLocalizedText(item.size || t('default'))}${item.size_price !== undefined && item.size_price !== null && item.size_price > 0 ? ` (${formatPrice(item.size_price)})` : ''}</p>
            <p>${t('sugar_label_colon')} ${sugarLabels[item.sugar_level] || t('regular')}</p>
            ${item.ice_level ? `<p>${t('ice_label_colon')} ${iceLabels[item.ice_level] || getLocalizedText(item.ice_level)}</p>` : ''}
            ${item.toppings && item.toppings.length > 0 ? 
              `<div class="mt-1">
                <p class="text-xs font-medium text-gray-700">${t('toppings_label_colon')}</p>
                <ul class="text-xs text-gray-600 ml-2 space-y-0.5">
                  ${item.toppings.map(t => {
                    const toppingName = typeof t === 'string' ? t : (t.name || t.id || t);
                    const toppingPrice = (typeof t === 'object' && t !== null && t.price !== undefined) ? t.price : 0;
                    return `<li>${getLocalizedText(toppingName)}${toppingPrice > 0 ? ` (+${formatPrice(toppingPrice)})` : ''}</li>`;
                  }).join('')}
                </ul>
              </div>` : 
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

// 去结算（显示购物车让用户检查订单）
function goToCheckout(event) {
  // 如果是滚动过程中，忽略点击
  if (isScrolling) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }
  // 显示购物车让用户检查订单内容
  showCart(event);
}

// 关闭购物车
function closeCart() {
  document.getElementById('cartModal').classList.remove('active');
}

// 提交订单
async function submitOrder() {
  if (cart.length === 0) {
    showToast(t('cart_empty'), 'warning');
    return;
  }
  
  if (currentSettings.ordering_open !== 'true') {
    showToast(t('ordering_closed_warning'), 'warning');
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
      showToast(t('processing_order'), 'info');
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
        // 支持新格式（对象数组，包含名称和价格）和旧格式（名称数组或ID数组）
        toppings: item.toppings ? item.toppings.map(t => {
          // 如果是对象，保留完整信息（包含价格）
          if (typeof t === 'object' && t !== null) {
            // 如果对象有 name 和 price，保留完整对象
            if (t.name && t.price !== undefined) {
              return { name: t.name, price: t.price };
            }
            // 否则只返回 name 或 id
            return t.name || t.id || t;
          }
          // 如果是字符串，直接使用（新格式：名称数组）
          if (typeof t === 'string') {
            return t;
          }
          // 其他情况直接使用
          return t;
        }) : [],
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
      showToast(t('order_submitted_success', { orderNumber: data.order.order_number }), 'success');
      cart = [];
      updateCartBadge();
      // 清空备注输入框
      const orderNotesInput = document.getElementById('orderNotes');
      if (orderNotesInput) {
        orderNotesInput.value = '';
      }
      closeCart();
      showTab('orders');
      
      // 延迟一下再加载订单，确保数据库已更新
      setTimeout(() => {
        loadOrders();
      }, 500);
    } else {
      showToast(data.message || t('order_submission_failed'), 'error');
    }
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Order submission failed:', error);
    // apiPost 已经处理了错误提示，这里只在回退方案时显示
    if (typeof apiPost === 'undefined') {
      showToast(t('order_submission_failed_retry'), 'error');
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
      container.innerHTML = `<div class="text-center text-gray-500 py-8 w-full">${t('no_images_available')}</div>`;
    }
  } catch (error) {
    console.error('加载展示图片失败:', error);
    container.innerHTML = `<div class="text-center text-gray-500 py-8 w-full">${t('failed_load_images')}</div>`;
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
      document.getElementById('zoomValue').textContent = t('zoom_percent', { value: '100' });
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
    zoomValue.textContent = t('zoom_percent', { value: value });
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
  const profilePhone = document.getElementById('profilePhone');
  if (currentUser) {
    document.getElementById('profileName').textContent = currentUser.name || t('user_chinese');
    if (profilePhone) {
      profilePhone.textContent = currentUser.phone;
      // 移除点击事件（已登录用户不需要）
      profilePhone.style.cursor = 'default';
      profilePhone.onclick = null;
      profilePhone.classList.remove('cursor-pointer', 'hover:text-blue-600', 'underline', 'transition');
    }
  } else {
    document.getElementById('profileName').textContent = t('guest_chinese');
    if (profilePhone) {
      profilePhone.textContent = t('click_login_chinese');
      // 添加点击事件，点击后显示登录模态框
      profilePhone.style.cursor = 'pointer';
      profilePhone.onclick = showLoginModal;
      profilePhone.classList.add('cursor-pointer', 'hover:text-blue-600', 'underline', 'transition');
      profilePhone.title = t('click_to_login') || t('click_login_chinese');
    }
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
      container.innerHTML = `<div class="text-center py-12"><p class="text-gray-500 mb-4">${t('please_login_view_orders')}</p><button onclick="showLoginModal()" class="px-6 py-2 bg-blue-600 text-white rounded-lg">${t('login')}</button></div>`;
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
          container.innerHTML = `<div class="text-center py-12 text-gray-500">${t('you_have_no_orders')}</div>`;
        }
        return;
      }
    } catch (error) {
      // 如果按手机号查询失败，尝试普通查询
      if (error.status === 401) {
        currentUser = null;
        updateLoginStatus();
        container.innerHTML = `<div class="text-center py-12"><p class="text-gray-500 mb-4">${t('login_expired_please_login')}</p><button onclick="showLoginModal()" class="px-6 py-2 bg-blue-600 text-white rounded-lg">${t('login')}</button></div>`;
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
          container.innerHTML = `<div class="text-center py-12 text-gray-500">${t('you_have_no_orders')}</div>`;
        }
      } else {
        container.innerHTML = `<div class="text-center py-12 text-red-500">${data?.message || t('failed_load_orders_refresh')}</div>`;
      }
    } catch (error) {
      if (error.status === 401) {
        currentUser = null;
        updateLoginStatus();
        container.innerHTML = `<div class="text-center py-12"><p class="text-gray-500 mb-4">${t('login_expired_please_login')}</p><button onclick="showLoginModal()" class="px-6 py-2 bg-blue-600 text-white rounded-lg">${t('login')}</button></div>`;
      } else {
        console.error('加载订单失败:', error);
        container.innerHTML = `<div class="text-center py-12 text-red-500">${t('failed_load_orders_error', { error: error.message || t('network_error') })}</div>`;
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
    container.innerHTML = `<div class="text-center py-12 text-gray-500">${t('no_orders_chinese')}</div>`;
    return;
  }
  
  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    paid: 'bg-green-100 text-green-800',
    completed: 'bg-blue-100 text-blue-800',
    cancelled: 'bg-red-100 text-red-800'
  };
  
  const statusText = {
    pending: t('status_pending'),
    paid: t('status_paid'),
    completed: t('status_completed'),
    cancelled: t('status_cancelled')
  };
  
  const canEdit = currentSettings.ordering_open === 'true';
  
  const sugarLabels = {
    '0': t('sugar_zero'),
    '30': t('sugar_light'),
    '50': t('sugar_half'),
    '70': t('sugar_less'),
    '100': t('sugar_regular')
  };
  
  const iceLabels = {
    'normal': t('ice_normal'),
    'less': t('ice_less'),
    'no': t('ice_no'),
    'room': t('ice_room'),
    'hot': t('ice_hot')
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
      const endTime = order.cycle_end_time ? new Date(order.cycle_end_time).toLocaleString('en-US') : t('ongoing');
      cycleInfo = `
        <div class="mt-2 p-2 bg-blue-50 rounded text-xs">
          <div class="text-gray-600">${t('cycle_id')} <span class="font-semibold">${order.cycle_id}</span> | ${t('cycle_number')}: <span class="font-semibold">${order.cycle_number || 'N/A'}</span></div>
          <div class="text-gray-600 mt-1">${t('cycle_time')} ${startTime} - ${endTime}</div>
        </div>
      `;
    }
    
    return `
    <div class="${expiredBgClass} rounded-xl shadow-md p-6 ${!isActiveCycle || isExpired ? 'opacity-75' : ''}">
      <div class="flex justify-between items-start mb-4">
        <div class="flex-1">
          <h3 class="text-lg font-bold ${expiredClass}">${t('order_number_label')} ${order.order_number}</h3>
          <p class="text-sm ${expiredClass || 'text-gray-500'}">${new Date(order.created_at).toLocaleString('en-US')}</p>
          ${cycleInfo}
          ${isExpired ? `<p class="text-sm text-red-600 font-semibold mt-1">⚠️ ${t('order_expired')}</p>` : ''}
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
          
          // 计算Size价格和加料总价（用于显示价格分解）
          const sizePrice = item.size_price !== undefined && item.size_price !== null && item.size_price > 0 
            ? item.size_price 
            : (item.size ? unitPrice : 0); // 如果没有size_price，尝试从unitPrice推断（不准确，但至少显示）
          
          // 计算加料总价
          let totalToppingPrice = 0;
          if (Array.isArray(toppings) && toppings.length > 0) {
            totalToppingPrice = toppings.reduce((sum, t) => {
              const toppingPrice = (typeof t === 'object' && t !== null && t.price !== undefined) ? t.price : 0;
              return sum + toppingPrice;
            }, 0);
          }
          
          // 如果size_price存在，使用它；否则从unitPrice减去加料价格来推断
          const actualSizePrice = item.size_price !== undefined && item.size_price !== null && item.size_price > 0
            ? item.size_price
            : (item.size ? Math.max(0, unitPrice - totalToppingPrice) : unitPrice);
          
          return `
            <div class="py-3 border-b border-gray-100 last:border-0 bg-gray-50 rounded-lg p-3">
              <div class="flex justify-between items-start mb-2">
                <div class="flex-1">
                  <p class="font-semibold ${expiredClass || inactiveClass} text-base">${getLocalizedText(item.product_name)}</p>
                  <p class="text-sm ${expiredClass || inactiveClass || 'text-gray-500'} mt-1">${t('quantity_label')} ${item.quantity}</p>
                </div>
                <span class="${expiredClass || inactiveClass} font-bold text-lg">${formatPrice(item.subtotal)}</span>
              </div>
              
              <div class="${!isActiveCycle || isExpired ? 'bg-gray-50' : 'bg-white'} rounded p-2 mt-2 space-y-1">
                ${item.size ? `
                  <div class="flex justify-between text-xs">
                    <span class="${expiredClass || inactiveClass || 'text-gray-600'}">${t('size_label')}</span>
                    <span class="${expiredClass || inactiveClass} font-medium">${item.size}${actualSizePrice > 0 ? ` (${formatPrice(actualSizePrice)})` : ''}</span>
                  </div>
                ` : ''}
                ${item.sugar_level ? `
                  <div class="flex justify-between text-xs">
                    <span class="${expiredClass || inactiveClass || 'text-gray-600'}">${t('sweetness_label')}</span>
                    <span class="${expiredClass || inactiveClass} font-medium">${sugarLabels[item.sugar_level] || item.sugar_level}%</span>
                  </div>
                ` : ''}
                ${toppings.length > 0 ? `
                  <div class="text-xs">
                    <span class="${expiredClass || inactiveClass || 'text-gray-600'}">${t('toppings_label')}</span>
                    <ul class="ml-2 mt-0.5 space-y-0.5">
                      ${Array.isArray(toppings) ? toppings.map(t => {
                        // 检查是否是对象格式（包含价格）
                        const toppingName = typeof t === 'object' && t !== null && t.name ? t.name : (typeof t === 'string' ? t : String(t));
                        const toppingPrice = (typeof t === 'object' && t !== null && t.price !== undefined) ? t.price : 0;
                        return `<li class="${expiredClass || inactiveClass || 'text-gray-600'}">${getLocalizedText(toppingName)}${toppingPrice > 0 ? ` <span class="${expiredClass || inactiveClass} font-medium">(+${formatPrice(toppingPrice)})</span>` : ''}</li>`;
                      }).join('') : `<li class="${expiredClass || inactiveClass || 'text-gray-600'}">${toppings}</li>`}
                    </ul>
                  </div>
                ` : ''}
                ${item.ice_level ? `
                  <div class="flex justify-between text-xs">
                    <span class="${expiredClass || inactiveClass || 'text-gray-600'}">${t('ice_level_label')}</span>
                    <span class="${expiredClass || inactiveClass} font-medium">${iceLabels[item.ice_level] || getLocalizedText(item.ice_level)}</span>
                  </div>
                ` : ''}
                <div class="flex justify-between text-xs pt-1 border-t ${!isActiveCycle || isExpired ? 'border-gray-300' : 'border-gray-200'} mt-1">
                  <span class="${expiredClass || inactiveClass || 'text-gray-600'}">${t('price_breakdown')}</span>
                  <span class="${expiredClass || inactiveClass} font-medium text-xs">
                    ${actualSizePrice > 0 ? formatPrice(actualSizePrice) : formatPrice(unitPrice)}
                    ${totalToppingPrice > 0 ? ` + ${formatPrice(totalToppingPrice)}` : ''}
                    ${actualSizePrice > 0 || totalToppingPrice > 0 ? ` = ${formatPrice(unitPrice)}` : ''}
                  </span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="${expiredClass || inactiveClass || 'text-gray-600'}">${t('unit_price')}</span>
                  <span class="${expiredClass || inactiveClass} font-medium">${formatPrice(unitPrice)}</span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="${expiredClass || inactiveClass || 'text-gray-600'}">${t('subtotal')}</span>
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
            <span class="${expiredClass || inactiveClass || 'text-gray-600'}">${t('original_price')}</span>
            <span class="${expiredClass || inactiveClass} font-medium">${formatPrice(order.total_amount)}</span>
          </div>
          ${order.discount_amount > 0 ? `
            <div class="flex justify-between items-center text-sm">
              <span class="${expiredClass || inactiveClass || 'text-gray-600'}">${t('discount_label')}</span>
              <span class="${!isActiveCycle || isExpired ? 'text-gray-500' : 'text-green-600'} font-medium">-${formatPrice(order.discount_amount)}</span>
            </div>
          ` : ''}
          <div class="flex justify-between items-center text-lg font-bold pt-2 border-t ${!isActiveCycle || isExpired ? 'border-gray-300' : 'border-gray-300'}">
            <span class="${expiredClass || inactiveClass}">${t('final_amount_label')}</span>
            <span class="${!isActiveCycle || isExpired ? 'text-gray-500' : 'text-red-600'} text-xl">${formatPrice(order.final_amount)}</span>
          </div>
          ${order.notes ? `
            <div class="mt-3 pt-3 border-t ${!isActiveCycle || isExpired ? 'border-gray-300' : 'border-gray-200'}">
              <div class="text-xs text-gray-500 mb-1">${t('order_notes')}</div>
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
              ${t('delete_order')}
            </button>
          ` : ''}
          ${currentSettings.ordering_open === 'true' ? `
            <button disabled
                    class="${canEdit ? 'flex-1' : 'w-full'} bg-gray-400 text-white font-semibold py-3 rounded-lg transition cursor-not-allowed relative">
              <div class="flex flex-col items-center">
                <span>${t('upload_payment_screenshot')}</span>
                <span class="text-xs font-normal mt-1 opacity-90">${t('wait_close_ordering')}</span>
              </div>
            </button>
          ` : `
            <button onclick="showPaymentModal('${order.id}')" 
                    class="${canEdit ? 'flex-1' : 'w-full'} bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition">
              ${t('upload_payment_screenshot')}
            </button>
          `}
        </div>
      ` : ''}
      
      ${order.payment_image ? `
        <div class="mt-4">
          <p class="text-sm text-gray-600 mb-2">${t('payment_screenshot')}:</p>
          <button onclick="showPaymentImageModal('${order.payment_image}')" class="text-blue-600 hover:text-blue-800 text-sm underline">${t('view_payment_screenshot')}</button>
        </div>
      ` : ''}
    </div>
  `;
  }).join('');
}

// 删除订单
async function deleteOrder(orderId) {
  const confirmed = await showConfirmDialog(
    t('delete_order_confirm'),
    t('delete_order_message'),
    t('delete'),
    t('cancel')
  );
  
  if (!confirmed) return;
  
  try {
    const response = await fetch(`${API_BASE}/user/orders/${orderId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast(t('order_deleted'), 'success');
      loadOrders();
    } else {
      showToast(data.message || t('delete_failed_retry'), 'error');
    }
  } catch (error) {
    console.error('Failed to delete order:', error);
    showToast(t('delete_failed_retry'), 'error');
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
    showToast(t('please_select_payment'), 'warning');
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
      showToast(t('payment_upload_success'), 'success');
      closePayment();
      loadOrders();
    } else {
      showToast(data.message || 'Upload failed', 'error');
    }
  } catch (error) {
    console.error('上传付款截图失败:', error);
    showToast(t('upload_failed_retry'), 'error');
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
    // 保存原始HTML结构（包括span元素），而不仅仅是textContent
    button.dataset.originalHTML = button.innerHTML;
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
    if (button.dataset.originalHTML) {
      // 恢复原始HTML结构（包括span元素）
      button.innerHTML = button.dataset.originalHTML;
      delete button.dataset.originalHTML;
      // 恢复后，如果按钮有data-i18n的span，确保文本使用当前语言
      const i18nSpan = button.querySelector('span[data-i18n]');
      if (i18nSpan && typeof t === 'function') {
        const key = i18nSpan.getAttribute('data-i18n');
        if (key) {
          i18nSpan.textContent = t(key);
        }
      }
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

