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

// Stripe 相关变量
let stripe = null;
let stripeElements = null;
let stripePaymentElement = null; // 使用 Payment Element（支持 Apple Pay 和银行卡）
let currentPaymentMethod = 'screenshot'; // 默认选择上传截图

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

// 智能分割中英文文本（支持序号）
function smartSplitText(text) {
  if (!text) return { en: '', zh: '', number: '' };
  
  // 检测中文字符的正则表达式
  const chineseRegex = /[\u4e00-\u9fa5]/;
  const englishRegex = /[a-zA-Z]/;
  
  // 提取序号（格式：数字. 或 数字.）
  const numberMatch = text.match(/^(\d+)\.\s*/);
  const number = numberMatch ? numberMatch[1] + '.' : '';
  const textWithoutNumber = numberMatch ? text.substring(numberMatch[0].length) : text;
  
  // 如果文本不包含中文，全部作为英文
  if (!chineseRegex.test(textWithoutNumber)) {
    return { en: textWithoutNumber.trim(), zh: '', number };
  }
  
  // 如果文本不包含英文，全部作为中文
  if (!englishRegex.test(textWithoutNumber)) {
    return { en: '', zh: textWithoutNumber.trim(), number };
  }
  
  // 尝试多种分割模式
  // 模式1: "English 中文" 或 "English中文" (英文在前，最常见)
  const pattern1 = /^([a-zA-Z\s&]+?)([\u4e00-\u9fa5]+.*)$/;
  const match1 = textWithoutNumber.match(pattern1);
  if (match1) {
    return { en: match1[1].trim(), zh: match1[2].trim(), number };
  }
  
  // 模式2: "中文 English" 或 "中文English" (中文在前)
  const pattern2 = /^([\u4e00-\u9fa5]+.*?)([a-zA-Z\s&]+)$/;
  const match2 = textWithoutNumber.match(pattern2);
  if (match2) {
    return { en: match2[2].trim(), zh: match2[1].trim(), number };
  }
  
  // 模式3: 混合格式，尝试按空格分割
  const parts = textWithoutNumber.split(/\s+/);
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
    zh: zhParts.join(' ').trim(),
    number
  };
}

// 根据当前语言获取文本（带缓存，支持序号）
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
    // 中文模式：序号 + 中文名（如果没有中文则显示英文）
    const name = split.zh || split.en || text;
    result = split.number ? `${split.number} ${name}` : name;
  } else {
    // 英文模式：序号 + 英文名（如果没有英文则显示中文）
    const name = split.en || split.zh || text;
    result = split.number ? `${split.number} ${name}` : name;
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
  // 初始化反馈按钮位置
  initFeedbackButtonPosition();
  
  // 设置反馈按钮拖动事件（延迟执行，确保DOM已加载）
  setTimeout(() => {
    const feedbackButton = document.getElementById('feedbackButton');
    if (feedbackButton) {
      feedbackButton.addEventListener('mousedown', startDragFeedbackButton);
      feedbackButton.addEventListener('touchstart', startDragFeedbackButton, { passive: false });
    }
  }, 100);
  
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
  
  // 检查是否是扫码登录（堂食模式）
  await checkDineInLogin();
  
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
  
  // 初始化PIN输入框
  initPinInputs();
  
  // 反馈表单提交
  const feedbackForm = document.getElementById('feedbackForm');
  if (feedbackForm) {
    feedbackForm.addEventListener('submit', submitFeedback);
  }
  
  // 反馈内容字符计数
  const feedbackContent = document.getElementById('feedbackContent');
  if (feedbackContent) {
    feedbackContent.addEventListener('input', updateFeedbackCharCount);
  }
  
  // 手机号输入验证和检查PIN状态
  const phoneInput = document.getElementById('phone');
  const phoneError = document.getElementById('phoneError');
  
  if (phoneInput) {
    let phoneCheckTimeout = null;
    
    // 记录上一次的手机号值，用于检测变化
    let lastPhoneValue = '';
    
    // 限制只能输入数字，且必须以0开头
    phoneInput.addEventListener('input', (e) => {
      let phone = phoneInput.value.replace(/\D/g, ''); // 只保留数字
      
      // 如果第一个字符不是0，清空或设置为0
      if (phone.length > 0 && phone[0] !== '0') {
        phone = '0' + phone.replace(/^0+/, ''); // 如果输入的不是0开头，强制以0开头
      }
      
      // 限制最多11位
      if (phone.length > 11) {
        phone = phone.substring(0, 11);
      }
      
      phoneInput.value = phone;
      
      // 检测手机号是否发生变化（长度或数字变化）
      const phoneChanged = phone !== lastPhoneValue;
      lastPhoneValue = phone;
      
      // 如果手机号发生变化，立即隐藏PIN区域
      if (phoneChanged) {
        // 立即隐藏PIN区域
        const pinSection = document.getElementById('pinSection');
        if (pinSection) {
          pinSection.classList.add('hidden');
        }
        const pinConfirmSection = document.getElementById('pinConfirmSection');
        if (pinConfirmSection) {
          pinConfirmSection.classList.add('hidden');
        }
        
        // 清除PIN输入和状态
        clearPinInputs('both');
        loginState.pin = '';
        loginState.pinConfirm = '';
        loginState.checkedPhone = '';
        loginState.requiresPinSetup = false;
      }
      
      // 清除之前的错误提示
      if (phoneError) {
        phoneError.classList.add('hidden');
        phoneError.textContent = '';
      }
      phoneInput.classList.remove('border-red-500');
      
      // 清除之前的检查定时器
      clearTimeout(phoneCheckTimeout);
      
      // 只有当输入完整的11位0开头数字时，才检查PIN状态
      if (phone.length === 11 && phone.startsWith('0')) {
        phoneCheckTimeout = setTimeout(async () => {
          // 再次验证手机号是否还是11位0开头（防止在延迟期间被修改）
          const currentPhone = phoneInput.value.trim();
          if (currentPhone.length === 11 && currentPhone.startsWith('0') && currentPhone === phone) {
            // 如果手机号改变了，需要重新检查PIN状态
            if (loginState.checkedPhone !== phone) {
              // 生成新的请求ID
              const requestId = ++checkPinStatusRequestId;
              await checkPinStatus(phone, requestId);
            }
          }
        }, 300);
      }
    });
    
    // 失去焦点时验证手机号格式
    phoneInput.addEventListener('blur', () => {
      const phone = phoneInput.value.trim();
      
      if (phone) {
        // 验证手机号必须是11位
        if (phone.length !== 11) {
          if (phoneError) {
            phoneError.textContent = t('phone_length_error');
            phoneError.classList.remove('hidden');
          }
          phoneInput.classList.add('border-red-500');
          // 确保PIN区域已隐藏
          const pinSection = document.getElementById('pinSection');
          if (pinSection) {
            pinSection.classList.add('hidden');
          }
          return;
        }
        
        // 验证手机号必须以0开头
        if (!phone.startsWith('0')) {
          if (phoneError) {
            phoneError.textContent = t('phone_invalid_format');
            phoneError.classList.remove('hidden');
          }
          phoneInput.classList.add('border-red-500');
          // 确保PIN区域已隐藏
          const pinSection = document.getElementById('pinSection');
          if (pinSection) {
            pinSection.classList.add('hidden');
          }
          return;
        }
        
        // 验证手机号格式（只允许数字）
        if (!/^\d{11}$/.test(phone)) {
          if (phoneError) {
            phoneError.textContent = t('phone_format_error');
            phoneError.classList.remove('hidden');
          }
          phoneInput.classList.add('border-red-500');
          // 确保PIN区域已隐藏
          const pinSection = document.getElementById('pinSection');
          if (pinSection) {
            pinSection.classList.add('hidden');
          }
          return;
        }
        
        // 格式正确，清除错误提示
        if (phoneError) {
          phoneError.classList.add('hidden');
        }
        phoneInput.classList.remove('border-red-500');
        
        // 如果手机号完整且正确，检查PIN状态
        if (phone.length === 11 && phone.startsWith('0')) {
          clearTimeout(phoneCheckTimeout);
          phoneCheckTimeout = setTimeout(async () => {
            // 再次验证手机号是否还是11位0开头（防止在延迟期间被修改）
            const currentPhone = phoneInput.value.trim();
            if (currentPhone.length === 11 && currentPhone.startsWith('0') && currentPhone === phone) {
              // 如果手机号改变了，需要重新检查PIN状态
              if (loginState.checkedPhone !== phone) {
                // 生成新的请求ID
                const requestId = ++checkPinStatusRequestId;
                await checkPinStatus(phone, requestId);
              }
            }
          }, 300);
        }
      } else {
        // 手机号为空，确保PIN区域已隐藏
        const pinSection = document.getElementById('pinSection');
        if (pinSection) {
          pinSection.classList.add('hidden');
        }
      }
    });
    
    // 获得焦点时清除错误提示
    phoneInput.addEventListener('focus', () => {
      if (phoneError) {
        phoneError.classList.add('hidden');
      }
      phoneInput.classList.remove('border-red-500');
    });
  }
  
  // 关闭登录模态框时重置状态
  const loginModal = document.getElementById('loginModal');
  if (loginModal) {
    // 监听模态框关闭
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const isHidden = loginModal.classList.contains('hidden') || !loginModal.classList.contains('active');
          if (isHidden) {
            resetLoginState();
          }
        }
      });
    });
    observer.observe(loginModal, { attributes: true });
  }
  
  // 付款表单提交
  document.getElementById('paymentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await uploadPayment();
  });
  
  // 文件选择状态提示
  const paymentImageInput = document.getElementById('paymentImage');
  const paymentFileStatus = document.getElementById('paymentFileStatus');
  if (paymentImageInput && paymentFileStatus) {
    paymentImageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        paymentFileStatus.textContent = t('file_selected') + ': ' + file.name;
        paymentFileStatus.classList.remove('text-gray-500');
        paymentFileStatus.classList.add('text-green-600');
      } else {
        paymentFileStatus.textContent = t('no_file_selected');
        paymentFileStatus.classList.remove('text-green-600');
        paymentFileStatus.classList.add('text-gray-500');
      }
    });
  }
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
  
  // 更新"显示更多"按钮文本（如果存在）
  const loadMoreBtn = document.querySelector('#loadMoreOrdersBtn button');
  if (loadMoreBtn && typeof t === 'function') {
    loadMoreBtn.textContent = t('load_more') || '显示更多';
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

// 堂食模式标记
let isDineInMode = false;
let tableNumber = null;

// 检查是否是扫码登录（堂食模式）
async function checkDineInLogin() {
  try {
    // 检查session中是否有堂食标记（通过检查用户信息）
    const data = await apiGet('/auth/user/me', { showError: false });
    
    if (data && data.user) {
      // 检查是否是桌号用户（phone格式：TABLE-桌号）
      if (data.user.phone && data.user.phone.startsWith('TABLE-')) {
        // 提取桌号
        tableNumber = data.user.phone.replace('TABLE-', '');
        isDineInMode = true;
        
        // 更新当前用户信息
        currentUser = data.user;
        updateLoginStatus();
        
        // 启动session检查
        startUserSessionCheck();
        
        console.log('检测到堂食模式', { tableNumber, userId: data.user.id });
        return; // 堂食模式已设置，直接返回
      }
      
      // 如果不是桌号用户，清除堂食模式标记
      isDineInMode = false;
      tableNumber = null;
    }
  } catch (error) {
    // 忽略错误，继续正常流程（用户未登录是正常情况）
    // console.log('检查堂食登录失败（正常情况）:', error);
  }
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
          
          // 检查是否是桌号用户（堂食模式）
          if (data.user.phone && data.user.phone.startsWith('TABLE-')) {
            tableNumber = data.user.phone.replace('TABLE-', '');
            isDineInMode = true;
          } else {
            // 如果不是桌号用户，清除堂食模式标记
            isDineInMode = false;
            tableNumber = null;
          }
          
          updateLoginStatus();
          // 启动session检查和刷新
          startUserSessionCheck();
          startUserSessionRefresh();
        } else {
          currentUser = null;
          // 清除堂食模式标记
          isDineInMode = false;
          tableNumber = null;
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
        
        // 检查是否是桌号用户（堂食模式）
        if (data.user.phone && data.user.phone.startsWith('TABLE-')) {
          tableNumber = data.user.phone.replace('TABLE-', '');
          isDineInMode = true;
        } else {
          // 如果不是桌号用户，清除堂食模式标记
          isDineInMode = false;
          tableNumber = null;
        }
        
        updateLoginStatus();
        // 启动session检查
        startUserSessionCheck();
      } else {
        currentUser = null;
        // 清除堂食模式标记
        isDineInMode = false;
        tableNumber = null;
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

// 登录流程状态
let loginState = {
  step: 'phone', // phone -> pin -> confirm (if new user)
  phone: '',
  name: '',
  code: '',
  pin: '',
  pinConfirm: '',
  requiresPinSetup: false,
  checkedPhone: '' // 记录已检查PIN状态的手机号
};

// 请求ID计数器，用于防止竞态条件（必须在全局作用域）
let checkPinStatusRequestId = 0;

// 初始化PIN输入框
function initPinInputs() {
  // PIN输入框自动跳转
  for (let i = 1; i <= 4; i++) {
    const pinInput = document.getElementById(`pin${i}`);
    const pinConfirmInput = document.getElementById(`pinConfirm${i}`);
    
    if (pinInput) {
      pinInput.addEventListener('input', (e) => {
        handlePinInput(e, i, 'pin');
      });
      pinInput.addEventListener('keydown', (e) => {
        handlePinKeydown(e, i, 'pin');
      });
      pinInput.addEventListener('paste', (e) => {
        handlePinPaste(e, 'pin');
      });
    }
    
    if (pinConfirmInput) {
      pinConfirmInput.addEventListener('input', (e) => {
        handlePinInput(e, i, 'pinConfirm');
      });
      pinConfirmInput.addEventListener('keydown', (e) => {
        handlePinKeydown(e, i, 'pinConfirm');
      });
      pinConfirmInput.addEventListener('paste', (e) => {
        handlePinPaste(e, 'pinConfirm');
      });
    }
  }
}

// 处理PIN输入
function handlePinInput(e, index, type) {
  const input = e.target;
  const value = input.value.replace(/\D/g, ''); // 只保留数字
  
  if (value) {
    input.value = value.charAt(0);
    input.classList.add('filled');
    
    // 自动跳转到下一个输入框
    if (index < 4) {
      const nextInput = document.getElementById(`${type}${index + 1}`);
      if (nextInput) {
        nextInput.focus();
      }
    } else {
      // 最后一个输入框
      if (type === 'pin' && loginState.requiresPinSetup) {
        // 如果是设置PIN模式，输入完成后自动跳转到Confirm PIN的第一个输入框
        const pinConfirm1 = document.getElementById('pinConfirm1');
        if (pinConfirm1) {
          setTimeout(() => {
            pinConfirm1.focus();
          }, 100);
        }
      } else {
        // 其他情况，失去焦点
        input.blur();
      }
    }
  } else {
    input.classList.remove('filled');
  }
  
  updatePinValue(type);
}

// 处理PIN退格键
function handlePinKeydown(e, index, type) {
  if (e.key === 'Backspace' && !e.target.value && index > 1) {
    const prevInput = document.getElementById(`${type}${index - 1}`);
    if (prevInput) {
      prevInput.focus();
      prevInput.value = '';
      prevInput.classList.remove('filled');
      updatePinValue(type);
    }
  }
}

// 处理PIN粘贴
function handlePinPaste(e, type) {
  e.preventDefault();
  const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').substring(0, 4);
  
  for (let i = 0; i < 4; i++) {
    const input = document.getElementById(`${type}${i + 1}`);
    if (input) {
      if (i < pastedData.length) {
        input.value = pastedData[i];
        input.classList.add('filled');
      } else {
        input.value = '';
        input.classList.remove('filled');
      }
    }
  }
  
  if (pastedData.length === 4) {
    const lastInput = document.getElementById(`${type}4`);
    if (lastInput) {
      lastInput.focus();
    }
  } else if (pastedData.length > 0) {
    const nextInput = document.getElementById(`${type}${pastedData.length + 1}`);
    if (nextInput) {
      nextInput.focus();
    }
  }
  
  updatePinValue(type);
}

// 更新PIN值
function updatePinValue(type) {
  let pin = '';
  for (let i = 1; i <= 4; i++) {
    const input = document.getElementById(`${type}${i}`);
    if (input && input.value) {
      pin += input.value;
    }
  }
  
  if (type === 'pin') {
    loginState.pin = pin;
    
    // 如果PIN输入完成（4位）且是验证模式（不是设置模式），自动登录
    // 但需要验证手机号是否已检查完成且未改变
    if (pin.length === 4 && !loginState.requiresPinSetup) {
      const currentPhone = document.getElementById('phone').value.trim();
      // 确保手机号是完整的11位0开头，且已经检查过PIN状态
      if (currentPhone.length === 11 && currentPhone.startsWith('0') && 
          currentPhone === loginState.checkedPhone) {
        // 延迟一小段时间，确保UI更新完成
        setTimeout(async () => {
          // 再次验证手机号未改变
          const verifyPhone = document.getElementById('phone').value.trim();
          if (verifyPhone === loginState.checkedPhone && verifyPhone.length === 11 && verifyPhone.startsWith('0')) {
            await login();
          }
        }, 300);
      }
    }
  } else {
    loginState.pinConfirm = pin;
    
    // 如果是设置PIN模式，且确认PIN输入完成（4位），自动登录
    // 但需要验证手机号是否已检查完成且未改变
    if (pin.length === 4 && loginState.requiresPinSetup && loginState.pin.length === 4) {
      const currentPhone = document.getElementById('phone').value.trim();
      // 确保手机号是完整的11位0开头，且已经检查过PIN状态
      if (currentPhone.length === 11 && currentPhone.startsWith('0') && 
          currentPhone === loginState.checkedPhone) {
        // 延迟一小段时间，确保UI更新完成
        setTimeout(async () => {
          // 再次验证手机号未改变
          const verifyPhone = document.getElementById('phone').value.trim();
          if (verifyPhone === loginState.checkedPhone && verifyPhone.length === 11 && verifyPhone.startsWith('0')) {
            await login();
          }
        }, 300);
      }
    }
  }
}

// 清除PIN输入框
function clearPinInputs(type = 'both') {
  if (type === 'both' || type === 'pin') {
    for (let i = 1; i <= 4; i++) {
      const input = document.getElementById(`pin${i}`);
      if (input) {
        input.value = '';
        input.classList.remove('filled', 'error');
      }
    }
    loginState.pin = '';
  }
  
  if (type === 'both' || type === 'pinConfirm') {
    for (let i = 1; i <= 4; i++) {
      const input = document.getElementById(`pinConfirm${i}`);
      if (input) {
        input.value = '';
        input.classList.remove('filled', 'error');
      }
    }
    loginState.pinConfirm = '';
    const errorMsg = document.getElementById('pinMismatchError');
    if (errorMsg) {
      errorMsg.classList.add('hidden');
    }
  }
}

// 显示PIN错误
function showPinError(type) {
  for (let i = 1; i <= 4; i++) {
    const input = document.getElementById(`${type}${i}`);
    if (input) {
      input.classList.add('error');
      setTimeout(() => {
        input.classList.remove('error');
      }, 500);
    }
  }
}

// 登录
async function login() {
  const phone = document.getElementById('phone').value.trim();
  const name = document.getElementById('name').value.trim();
  const codeSection = document.getElementById('verificationCodeSection');
  const pinSection = document.getElementById('pinSection');
  const isCodeVisible = codeSection && !codeSection.classList.contains('hidden');
  const isPinVisible = pinSection && !pinSection.classList.contains('hidden');
  const code = isCodeVisible ? document.getElementById('verificationCode').value.trim() : '';
  const pin = loginState.pin;
  const pinConfirm = loginState.pinConfirm;

  // 强制要求PIN：如果PIN区域不可见，需要先检查PIN状态
  if (!isPinVisible) {
    // PIN区域不可见，需要先检查PIN状态
    // 验证手机号必须是11位0开头
    const phoneValid = phone && phone.length === 11 && phone.startsWith('0') && /^\d{11}$/.test(phone);
    if (phoneValid) {
      // 生成新的请求ID
      const requestId = ++checkPinStatusRequestId;
      const pinStatus = await checkPinStatus(phone, requestId);
      if (pinStatus) {
        // 需要PIN，但用户还没有输入，提示用户
        showToast(t('pin_required'), 'info');
        return;
      }
    } else {
      // 手机号格式不正确
      if (!phone) {
        showToast(t('please_enter_phone'), 'error');
      } else if (phone.length !== 11) {
        showToast(t('phone_length_error'), 'error');
      } else if (!phone.startsWith('0')) {
        showToast(t('phone_invalid_format'), 'error');
      } else {
        showToast(t('phone_format_error'), 'error');
      }
      return;
    }
  }
  
  // 如果PIN区域可见，说明需要PIN
  if (isPinVisible) {
    if (pin.length !== 4) {
      showToast(t('pin_4_digits'), 'error');
      showPinError('pin');
      return;
    }
    
    // 如果是设置PIN模式，需要确认PIN
    const pinConfirmSection = document.getElementById('pinConfirmSection');
    if (pinConfirmSection && !pinConfirmSection.classList.contains('hidden')) {
      if (pinConfirm.length !== 4) {
        showToast(t('pin_4_digits'), 'error');
        showPinError('pinConfirm');
        return;
      }
      
      if (pin !== pinConfirm) {
        showToast(t('pin_mismatch'), 'error');
        document.getElementById('pinMismatchError').classList.remove('hidden');
        showPinError('pinConfirm');
        clearPinInputs('pinConfirm');
        return;
      }
    }
  } else {
    // PIN区域不可见，但可能用户没有PIN，需要强制要求PIN
    // 这种情况不应该发生，因为checkPinStatus应该已经显示了PIN区域
    // 但为了安全，我们仍然要求PIN
    if (!pin || pin.length !== 4) {
      showToast(t('pin_required'), 'error');
      return;
    }
  }

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
    await loginWithCode(phone, code, name, pin);
  } else {
    // 使用传统登录
    await loginWithoutCode(phone, name, pin);
  }
}

// 验证码登录
async function loginWithCode(phone, code, name, pin) {
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
        name: name || undefined,
        pin: pin || undefined
      })
    });

    const data = await response.json();

    if (data.success) {
      currentUser = data.user;
      
      // 检查是否是桌号用户（堂食模式）
      if (data.user.phone && data.user.phone.startsWith('TABLE-')) {
        tableNumber = data.user.phone.replace('TABLE-', '');
        isDineInMode = true;
      } else {
        // 如果不是桌号用户，清除堂食模式标记
        isDineInMode = false;
        tableNumber = null;
      }
      
      closeLoginModal();
      resetLoginState();
      updateLoginStatus();
      showToast(t('login_success'), 'success');
      
      // 启动session检查
      startUserSessionCheck();
      
      // 加载用户余额
      await loadUserBalance();
      
      // 检查是否有待处理的 Checkout 请求
      const pendingCheckout = sessionStorage.getItem('pendingCheckout');
      if (pendingCheckout === 'true') {
        // 清除标记
        sessionStorage.removeItem('pendingCheckout');
        // 如果购物车有商品，显示购物车让用户确认后提交
        if (cart.length > 0) {
          // 显示购物车，让用户再次点击提交
          await showCart();
          showToast(t('please_confirm_checkout') || 'Please confirm your order and click Submit Order', 'info');
        }
      } else {
        // 如果没有待处理的 Checkout，按原来的逻辑处理
        // If currently on orders page, refresh order list
        if (!document.getElementById('ordersTab').classList.contains('hidden')) {
          loadOrders(false); // 保持分页状态，只刷新数据
        }
      }
    } else {
      // 处理需要PIN的情况
      if (data.requiresPin || data.requiresPinSetup) {
        showPinSection(data.requiresPinSetup);
        if (data.requiresPinSetup) {
          showToast(t('pin_setup_required'), 'info');
        } else {
          showToast(t('pin_required'), 'info');
        }
      } else {
        showToast(data.message || t('login_failed'), 'error');
        if (data.message && data.message.includes('PIN')) {
          clearPinInputs('pin');
          const pin1 = document.getElementById('pin1');
          if (pin1) pin1.focus();
        }
      }
    }
  } catch (error) {
    console.error('Login failed:', error);
    showToast(t('login_failed_retry'), 'error');
  } finally {
    setButtonLoading(loginBtn, false);
  }
}

// 传统登录（无验证码）
async function loginWithoutCode(phone, name, pin) {
  const loginBtn = document.getElementById('loginSubmitBtn');
  setButtonLoading(loginBtn, true);

  try {
    const response = await fetch(`${API_BASE}/auth/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ 
        phone, 
        name: name || undefined,
        pin: pin || undefined
      })
    });

    const data = await response.json();

    if (data.success) {
      currentUser = data.user;
      
      // 检查是否是桌号用户（堂食模式）
      if (data.user.phone && data.user.phone.startsWith('TABLE-')) {
        tableNumber = data.user.phone.replace('TABLE-', '');
        isDineInMode = true;
      } else {
        // 如果不是桌号用户，清除堂食模式标记
        isDineInMode = false;
        tableNumber = null;
      }
      
      closeLoginModal();
      resetLoginState();
      updateLoginStatus();
      showToast(t('login_success'), 'success');
      
      // 启动session检查
      startUserSessionCheck();
      
      // 加载用户余额
      await loadUserBalance();
      
      // 检查是否有待处理的 Checkout 请求
      const pendingCheckout = sessionStorage.getItem('pendingCheckout');
      if (pendingCheckout === 'true') {
        // 清除标记
        sessionStorage.removeItem('pendingCheckout');
        // 如果购物车有商品，显示购物车让用户确认后提交
        if (cart.length > 0) {
          // 显示购物车，让用户再次点击提交
          await showCart();
          showToast(t('please_confirm_checkout') || 'Please confirm your order and click Submit Order', 'info');
        }
      } else {
        // 如果没有待处理的 Checkout，按原来的逻辑处理
        // If currently on orders page, refresh order list
        if (!document.getElementById('ordersTab').classList.contains('hidden')) {
          loadOrders(false); // 保持分页状态，只刷新数据
        }
      }
    } else {
      // 处理需要PIN的情况
      if (data.requiresPin || data.requiresPinSetup) {
        showPinSection(data.requiresPinSetup);
        if (data.requiresPinSetup) {
          showToast(t('pin_setup_required'), 'info');
        } else {
          showToast(t('pin_required'), 'info');
        }
      } else if (data.requiresCode) {
        // 如果返回requiresCode，显示验证码输入框
        showToast(t('sms_verification_required'), 'info');
        const codeSection = document.getElementById('verificationCodeSection');
        if (codeSection) {
          codeSection.classList.remove('hidden');
        }
        // 自动发送验证码
        await sendVerificationCode();
      } else {
        showToast(data.message || t('login_failed'), 'error');
        if (data.message && data.message.includes('PIN')) {
          clearPinInputs('pin');
          const pin1 = document.getElementById('pin1');
          if (pin1) pin1.focus();
        }
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
    // 清除堂食模式标记
    isDineInMode = false;
    tableNumber = null;
    updateCartBadge();
    updateLoginStatus();
    showToast(t('logged_out'));
    showTab('home'); // 登出后跳转到首页
  } catch (error) {
    console.error('登出失败:', error);
    // 即使登出失败，也清除本地状态
    currentUser = null;
    cart = [];
    // 清除堂食模式标记
    isDineInMode = false;
    tableNumber = null;
    updateCartBadge();
    updateLoginStatus();
    showTab('home'); // 登出后跳转到首页
  }
}

// 显示登录模态框
function showLoginModal() {
  const loginModal = document.getElementById('loginModal');
  loginModal.classList.add('active');
  
  // 给body添加modal-open类，阻止页面其他元素交互
  document.body.classList.add('modal-open');
  
  // 阻止模态框背景点击事件传播
  loginModal.addEventListener('click', handleModalBackgroundClick);
  
  resetLoginState();
  
  // 重置标题为默认的"登录以继续"
  const loginModalTitle = document.getElementById('loginModalTitle');
  if (loginModalTitle) {
    loginModalTitle.textContent = t('login_to_continue');
    loginModalTitle.setAttribute('data-i18n', 'login_to_continue');
  }
  
  // 重置Name输入框为显示状态（默认显示，等检查PIN状态后再决定是否隐藏）
  const nameSection = document.getElementById('nameSection');
  if (nameSection) {
    nameSection.classList.remove('hidden');
  }
  
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

// 处理模态框背景点击
function handleModalBackgroundClick(e) {
  // 如果点击的是模态框背景（不是内容区域），阻止事件
  if (e.target.id === 'loginModal') {
    e.preventDefault();
    e.stopPropagation();
    // 可以选择关闭模态框，但通常登录模态框不应该通过点击背景关闭
    // 所以这里只阻止事件，不关闭模态框
  }
}

// 处理模态框背景点击
function handleModalBackgroundClick(e) {
  // 如果点击的是模态框背景（不是内容区域），阻止事件
  if (e.target.id === 'loginModal') {
    e.preventDefault();
    e.stopPropagation();
    // 可以选择关闭模态框，但通常登录模态框不应该通过点击背景关闭
    // 所以这里只阻止事件，不关闭模态框
  }
}

// 显示PIN输入区域
function showPinSection(requiresSetup = false) {
  const pinSection = document.getElementById('pinSection');
  const pinConfirmSection = document.getElementById('pinConfirmSection');
  const pinLabel = document.getElementById('pinLabel');
  
  if (pinSection) {
    pinSection.classList.remove('hidden');
    
    if (requiresSetup) {
      // 首次设置PIN，需要确认
      loginState.requiresPinSetup = true;
      if (pinConfirmSection) {
        pinConfirmSection.classList.remove('hidden');
      }
      if (pinLabel) {
        pinLabel.textContent = t('set_pin');
      }
    } else {
      // 已有PIN，只需输入
      loginState.requiresPinSetup = false;
      if (pinConfirmSection) {
        pinConfirmSection.classList.add('hidden');
      }
      if (pinLabel) {
        pinLabel.textContent = t('enter_pin');
      }
    }
    
    // 聚焦第一个PIN输入框
    setTimeout(() => {
      const pin1 = document.getElementById('pin1');
      if (pin1) {
        pin1.focus();
      }
    }, 100);
  }
}

// 重置登录状态
function resetLoginState() {
  loginState = {
    step: 'phone',
    phone: '',
    name: '',
    code: '',
    pin: '',
    pinConfirm: '',
    requiresPinSetup: false,
    checkedPhone: ''
  };
  
  // 隐藏PIN区域
  const pinSection = document.getElementById('pinSection');
  if (pinSection) {
    pinSection.classList.add('hidden');
  }
  const pinConfirmSection = document.getElementById('pinConfirmSection');
  if (pinConfirmSection) {
    pinConfirmSection.classList.add('hidden');
  }
  
  clearPinInputs('both');
}

// 检查PIN状态（在输入手机号后调用）
// requestId: 请求ID，用于防止竞态条件，只处理最新请求的结果
async function checkPinStatus(phone, requestId = null) {
  try {
    // 如果没有提供requestId，生成一个新的（向后兼容）
    if (requestId === null) {
      requestId = ++checkPinStatusRequestId;
    }
    
    const response = await fetch(`${API_BASE}/auth/user/check-pin-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ phone })
    });
    
    // 检查这个请求是否还是最新的（防止竞态条件）
    // 如果requestId不等于最新的请求ID，说明有更新的请求，忽略这个结果
    if (requestId !== checkPinStatusRequestId) {
      console.log('忽略过期的PIN状态检查请求', { requestId, currentRequestId: checkPinStatusRequestId, phone });
      return false;
    }
    
    // 再次验证手机号是否还是当前输入的值（防止在请求期间手机号被修改）
    const currentPhone = document.getElementById('phone').value.trim();
    if (currentPhone !== phone || currentPhone.length !== 11 || !currentPhone.startsWith('0')) {
      console.log('手机号已改变，忽略PIN状态检查结果', { requestedPhone: phone, currentPhone });
      return false;
    }
    
    // 处理非成功响应（包括IP阻止等错误）
    if (!response.ok) {
      let errorData = {};
      try {
        errorData = await response.json();
      } catch (e) {
        // 如果无法解析JSON，使用状态文本
        errorData = { message: response.statusText || 'Request failed' };
      }
      
      // 如果是IP阻止错误，清除checkedPhone状态，允许用户重新尝试
      if (response.status === 403 && (errorData.message || '').includes('IP')) {
        loginState.checkedPhone = '';
        console.log('IP被阻止，清除PIN检查状态', { phone, errorData });
        // 不显示PIN区域，让用户知道IP被阻止
        return false;
      }
      // 其他错误也清除状态
      loginState.checkedPhone = '';
      console.error('Check PIN status failed:', response.status, errorData);
      return false;
    }
    
    const data = await response.json();
    
    if (data.success) {
      const loginModalTitle = document.getElementById('loginModalTitle');
      
      const nameSection = document.getElementById('nameSection');
      
      // 最后一次验证：确保手机号还是当前值（防止在数据处理期间被修改）
      const verifyPhone = document.getElementById('phone').value.trim();
      if (verifyPhone !== phone) {
        console.log('手机号在处理期间被修改，忽略结果', { requestedPhone: phone, verifyPhone });
        return false;
      }
      
      // 记录当前检查的手机号
      loginState.checkedPhone = phone;
      
      if (data.requiresPinSetup || !data.hasPin) {
        // 需要设置PIN（新用户）
        // 如果之前是验证模式，需要清除PIN输入
        if (!loginState.requiresPinSetup) {
          clearPinInputs('both');
          loginState.pin = '';
          loginState.pinConfirm = '';
        }
        showPinSection(true);
        // 更新标题为注册
        if (loginModalTitle) {
          loginModalTitle.textContent = t('register_new_account');
          loginModalTitle.setAttribute('data-i18n', 'register_new_account');
        }
        // 显示Name输入框（新用户需要）
        if (nameSection) {
          nameSection.classList.remove('hidden');
        }
        return true;
      } else {
        // 需要输入PIN（现有用户）- 已有PIN，不能重新设置
        // 如果之前是设置模式，需要清除PIN输入并切换到验证模式
        if (loginState.requiresPinSetup) {
          clearPinInputs('both');
          loginState.pin = '';
          loginState.pinConfirm = '';
          loginState.requiresPinSetup = false;
        }
        showPinSection(false);
        // 更新标题为登录
        if (loginModalTitle) {
          loginModalTitle.textContent = t('login_to_continue');
          loginModalTitle.setAttribute('data-i18n', 'login_to_continue');
        }
        // 隐藏Name输入框（现有用户不需要）
        if (nameSection) {
          nameSection.classList.add('hidden');
        }
        return true;
      }
    }
  } catch (error) {
    console.error('Check PIN status failed:', error);
    // 发生错误时清除checkedPhone状态，允许用户重新尝试
    loginState.checkedPhone = '';
    return false;
  }
  return false;
}

// 关闭登录模态框
function closeLoginModal() {
  const loginModal = document.getElementById('loginModal');
  loginModal.classList.remove('active');
  
  // 移除body的modal-open类，恢复页面交互
  document.body.classList.remove('modal-open');
  
  // 移除模态框背景点击事件监听
  loginModal.removeEventListener('click', handleModalBackgroundClick);
  
  document.getElementById('loginForm').reset();
  resetLoginState();
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
async function updateCurrencyDisplay() {
  // 重新加载产品列表和订单列表以更新价格显示
  if (products.length > 0) {
    renderProducts(products);
  }
  // 更新购物车显示（只在购物车已经打开的情况下）
  const cartModal = document.getElementById('cartModal');
  if (cartModal && cartModal.classList.contains('active') && cart.length > 0) {
    await showCart();
  }
  // 更新订单显示（只在订单页面可见时刷新，避免不必要的刷新）
  const ordersTab = document.getElementById('ordersTab');
  const ordersList = document.getElementById('ordersList');
  const isOrdersTabVisible = ordersTab && !ordersTab.classList.contains('hidden');
  
  if (isOrdersTabVisible && ordersList && currentUser) {
    loadOrders(false); // 保持分页状态，只刷新数据（不滚动）
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
  await loadDeliveryAddresses(); // 加载配送地址列表
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
      await updateCurrencyDisplay();
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
      // 确保分类ID是数字类型
      categories = categories.map(cat => ({
        ...cat,
        id: Number(cat.id)
      }));
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
      // 确保category_id是数字类型（如果存在）
      products = products.map(p => ({
        ...p,
        category_id: p.category_id != null ? Number(p.category_id) : null
      }));
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
    // 确保分类ID是数字类型
    const categoryId = Number(cat.id);
    // 使用智能分割获取本地化分类名称
    const localizedName = getLocalizedText(cat.name);
    // 简化分类名称显示（如果名称太长，只显示前几个字符）
    const shortName = localizedName.length > 8 ? localizedName.substring(0, 8) + '...' : localizedName;
    html += `
      <button onclick="filterCategory(${categoryId})" class="category-nav-btn w-full py-4 text-center ${selectedCategory === categoryId ? 'bg-white text-green-600 font-semibold border-l-3 border-green-600' : 'text-gray-600 hover:bg-gray-100'}">
        <div class="text-xs leading-tight px-1">${shortName}</div>
      </button>
    `;
  });
  
  container.innerHTML = html;
}

// 筛选分类
function filterCategory(categoryId) {
  // 确保类型一致：转换为数字或null
  selectedCategory = categoryId === null ? null : Number(categoryId);
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
    // 使用类型转换确保比较正确：SQLite返回的category_id可能是字符串或数字
    filteredProducts = products.filter(p => {
      const productCategoryId = p.category_id != null ? Number(p.category_id) : null;
      return productCategoryId === selectedCategory;
    });
    
    // 调试信息（仅在开发环境）
    if (filteredProducts.length === 0 && products.length > 0) {
      console.warn('分类过滤结果为空', {
        selectedCategory,
        selectedCategoryType: typeof selectedCategory,
        totalProducts: products.length,
        sampleProductCategoryIds: products.slice(0, 5).map(p => ({
          id: p.id,
          name: p.name,
          category_id: p.category_id,
          category_id_type: typeof p.category_id
        }))
      });
    }
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
                ${hasMultipleSizes ? `<span class="text-xs text-gray-500 ml-1">${t('starting_from')}</span>` : ''}
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
  
  console.log('[updateOrderingStatus] 开始更新点单状态（每10秒）:', {
    timestamp: new Date().toISOString()
  });
  
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
  selectedSugar = null; // 改为 null，不再默认 '100'
  selectedToppings = [];
  toppingPricesMap.clear(); // 重置加料价格映射
  selectedIce = null; // 重置冰度选择
  detailQuantity = 1; // 确保每次打开都重置为1
  
  // 重置所有区域为可见（让各个渲染函数决定是否隐藏）
  document.getElementById('sizeSection').style.display = 'block';
  document.getElementById('sugarSection').style.display = 'block';
  document.getElementById('toppingSection').style.display = 'block';
  document.getElementById('iceSection').style.display = 'block';
  
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
  const section = document.getElementById('sizeSection');
  let sizes = {};
  
  try {
    sizes = JSON.parse(product.sizes || '{}');
  } catch (e) {
    sizes = {};
  }
  
  // 如果没有配置杯型，隐藏区域（使用商品基础价格）
  if (Object.keys(sizes).length === 0) {
    section.style.display = 'none';
    selectedSize = null;
    return;
  }
  
  // 显示区域并渲染选项
  section.style.display = 'block';
  
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
  const section = document.getElementById('sugarSection');
  let sugarLevels = [];
  
  try {
    sugarLevels = JSON.parse(product.sugar_levels || '[]');
  } catch (e) {
    sugarLevels = [];
  }
  
  // 如果没有配置甜度选项，隐藏整个区域
  if (sugarLevels.length === 0) {
    section.style.display = 'none';
    selectedSugar = null; // 清空选择
    return;
  }
  
  // 显示区域并渲染选项
  section.style.display = 'block';
  
  const sugarLabels = {
    '0': t('sugar_zero'),
    '30': t('sugar_light'),
    '50': t('sugar_half'),
    '70': t('sugar_less'),
    '100': t('sugar_regular')
  };
  
  // 默认选中第一个选项
  if (!selectedSugar && sugarLevels.length > 0) {
    selectedSugar = sugarLevels[0];
  }
  
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
  
  // 如果没有配置加料，隐藏整个区域
  if (availableToppingNames.length === 0) {
    document.getElementById('toppingSection').style.display = 'none';
    container.innerHTML = '';
    return;
  }
  
  // 显示区域
  document.getElementById('toppingSection').style.display = 'block';
  
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
  const section = document.getElementById('iceSection');
  let iceOptions = [];
  
  try {
    iceOptions = JSON.parse(product.ice_options || '[]');
  } catch (e) {
    iceOptions = [];
  }
  
  // 如果产品不允许选择冰度，隐藏整个区域
  if (iceOptions.length === 0) {
    section.style.display = 'none';
    selectedIce = null;
    return;
  }
  
  section.style.display = 'block';
  
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
  
  // 基础价格（杯型价格，如果没有配置杯型或未选择，使用商品基础价格）
  const basePrice = selectedSize && sizes[selectedSize] ? sizes[selectedSize] : currentDetailProduct.price;
  
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
  if (!currentDetailProduct) {
    showToast(t('please_select_specs'), 'warning');
    return;
  }
  
  // 检查是否有必需的属性未选择（杯型是必需的，但如果商品没有配置杯型，则不要求）
  let sizes = {};
  try {
    sizes = JSON.parse(currentDetailProduct.sizes || '{}');
  } catch (e) {
    sizes = {};
  }
  
  // 如果商品配置了杯型，但没有选择，则提示
  if (Object.keys(sizes).length > 0 && !selectedSize) {
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
  
  // 获取杯型价格（如果没有配置杯型，使用商品基础价格）
  // 重用上面已声明的 sizes 变量
  const sizePrice = selectedSize && sizes[selectedSize] ? sizes[selectedSize] : currentDetailProduct.price;
  
  // 构建购物车项（只包含已选择的属性）
  const cartItem = {
    product_id: currentDetailProduct.id,
    name: currentDetailProduct.name,
    size: selectedSize || null,
    size_price: sizePrice, // 保存Size的基础价格
    sugar_level: selectedSugar || null,
    ice_level: selectedIce || null,
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
  selectedSugar = null; // 改为 null
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

// 配送地址列表
let deliveryAddresses = [];

// 加载配送地址列表
async function loadDeliveryAddresses() {
  try {
    const data = await apiGet('/public/delivery-addresses', { showError: false });
    if (data && data.success) {
      deliveryAddresses = data.addresses || [];
      updateDeliveryAddressSelect();
    }
  } catch (error) {
    console.error('加载配送地址失败:', error);
    deliveryAddresses = [];
    updateDeliveryAddressSelect();
  }
}

// 更新配送地址下拉框
function updateDeliveryAddressSelect() {
  const select = document.getElementById('deliveryAddress');
  if (!select) return;
  
  // 保存当前选中的值
  const currentValue = select.value;
  
  // 清空选项（保留第一个默认选项）
  select.innerHTML = `<option value="">${t('select_delivery_address')}</option>`;
  
  // 只显示激活状态的配送地址
  const activeAddresses = deliveryAddresses.filter(addr => addr.status === 'active');
  
  // 按排序顺序添加选项
  activeAddresses
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .forEach(address => {
      const option = document.createElement('option');
      option.value = address.id;
      option.textContent = address.name + (address.description ? ` - ${address.description}` : '');
      select.appendChild(option);
    });
  
  // 恢复之前选中的值
  if (currentValue) {
    select.value = currentValue;
  }
}

// 显示购物车
async function showCart(event) {
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
  
  // 根据是否堂食模式决定是否加载配送地址
  const deliveryAddressSection = document.getElementById('deliveryAddressSection');
  const dineInInfoSection = document.getElementById('dineInInfoSection');
  const dineInTableNumber = document.getElementById('dineInTableNumber');
  
  if (isDineInMode && tableNumber) {
    // 堂食模式：隐藏配送地址选择，显示堂食信息
    if (deliveryAddressSection) {
      deliveryAddressSection.style.display = 'none';
    }
    if (dineInInfoSection) {
      dineInInfoSection.classList.remove('hidden');
    }
    if (dineInTableNumber) {
      dineInTableNumber.textContent = `${t('table_number_colon')} ${tableNumber}`;
    }
  } else {
    // 外卖模式：显示配送地址选择，隐藏堂食信息
    if (deliveryAddressSection) {
      deliveryAddressSection.style.display = 'block';
    }
    if (dineInInfoSection) {
      dineInInfoSection.classList.add('hidden');
    }
    
    // 刷新配送地址列表（如果为空，重新加载）
    if (deliveryAddresses.length === 0) {
      await loadDeliveryAddresses();
    } else {
      updateDeliveryAddressSelect();
    }
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
  // 异步加载余额（使用缓存，避免频繁请求）
  await loadUserBalance(false); // 不强制刷新，使用缓存
  updateCartBalanceDisplay(); // 更新余额显示
  document.getElementById('cartModal').classList.add('active');
}

// 更新购物车商品数量
async function updateCartItemQuantity(index, delta) {
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
      await showCart();
    }
  }
  
  updateCartBadge();
}

// 从购物车移除
async function removeFromCart(index) {
  cart.splice(index, 1);
  
  if (cart.length === 0) {
    closeCart();
  } else {
    // 只有在购物车已经打开的情况下才更新显示
    const cartModal = document.getElementById('cartModal');
    if (cartModal && cartModal.classList.contains('active')) {
      await showCart();
    }
  }
  
  updateCartBadge();
}

// 更新购物车总计
function updateCartTotal() {
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartTotalEl = document.getElementById('cartTotal');
  const useBalanceCheckbox = document.getElementById('useBalanceCheckbox');
  
  if (cartTotalEl) {
    // 如果使用余额，显示剩余需要支付的金额
    if (useBalanceCheckbox && useBalanceCheckbox.checked && userBalance > 0) {
      const actualBalanceUsed = Math.min(userBalance, total);
      const remainingToPay = Math.max(0, total - userBalance);
      cartTotalEl.textContent = formatPrice(remainingToPay);
    } else {
      cartTotalEl.textContent = formatPrice(total);
    }
  }
}

// 去结算（显示购物车让用户检查订单）
async function goToCheckout(event) {
  // 如果是滚动过程中，忽略点击
  if (isScrolling) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    return;
  }
  
  // 检查是否登录
  if (!currentUser) {
    // 未登录，提示用户登录
    showToast(t('please_login_to_checkout') || 'Please login to checkout', 'info');
    showLoginModal();
    // 标记用户是因为 Checkout 而需要登录的
    sessionStorage.setItem('pendingCheckout', 'true');
    return;
  }
  
  // 已登录，显示购物车让用户检查订单内容
  await showCart(event);
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
    const useBalanceCheckbox = document.getElementById('useBalanceCheckbox');
    const useBalance = useBalanceCheckbox && useBalanceCheckbox.checked;
    
    // 如果使用余额，先重新获取最新余额（确保从数据库实时读取）
    if (useBalance) {
      await loadUserBalance(true); // 强制刷新余额
      // 检查余额是否大于0（允许部分使用，后端会处理）
      if (userBalance <= 0) {
        showToast(t('balance_insufficient'), 'warning');
        setButtonLoading(submitBtn, false);
        return;
      }
    }
    
    // 根据是否堂食模式决定配送地址和订单类型
    let deliveryAddressId = null;
    let orderType = 'delivery';
    
    if (isDineInMode && tableNumber) {
      // 堂食模式：不需要配送地址，设置订单类型为堂食
      orderType = 'dine_in';
    } else {
      // 外卖模式：必须选择配送地址
      deliveryAddressId = document.getElementById('deliveryAddress')?.value || null;
      
      if (!deliveryAddressId) {
        showToast(t('delivery_address_required') || 'Please select a delivery address', 'warning');
        setButtonLoading(submitBtn, false);
        clearTimeout(timeoutId);
        return;
      }
    }
    
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
      notes: orderNotes,
      use_balance: useBalance,
      delivery_address_id: deliveryAddressId,
      order_type: orderType,
      table_number: isDineInMode ? tableNumber : null
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
      // 如果使用了余额，刷新余额
      if (useBalance) {
        // 先取消勾选，避免 updateBalanceUsageDisplay 检查余额时显示错误提示
        const useBalanceCheckbox = document.getElementById('useBalanceCheckbox');
        if (useBalanceCheckbox) {
          useBalanceCheckbox.checked = false;
        }
        // 更新余额显示（清除余额使用信息，此时已取消勾选，不会检查余额）
        updateBalanceUsageDisplay();
        // 然后刷新余额
        await loadUserBalance(true); // 强制刷新余额
      }
      
      const message = data.order.status === 'paid' && data.order.balance_used > 0
        ? t('balance_payment_success')
        : t('order_submitted_success', { orderNumber: data.order.order_number });
      showToast(message, 'success');
      cart = [];
      updateCartBadge();
      // 清空备注输入框和配送地址选择
      const orderNotesInput = document.getElementById('orderNotes');
      if (orderNotesInput) {
        orderNotesInput.value = '';
      }
      const deliveryAddressSelect = document.getElementById('deliveryAddress');
      if (deliveryAddressSelect) {
        deliveryAddressSelect.value = '';
      }
      closeCart();
      showTab('orders');
      
      // 延迟一下再加载订单，确保数据库已更新
      // 重置分页，从第一页开始加载，确保新订单显示在最前面
      // loadOrders(true) 会设置 shouldScrollToTopOnOrdersLoad 标志，renderOrders 会自动滚动到顶部
      setTimeout(() => {
        loadOrders(true); // 重置分页，显示最新订单（会自动滚动到顶部）
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
      loadOrders(true); // 首次切换到订单页面，需要重置分页
      break;
    case 'profile':
      document.getElementById('profileTab').classList.remove('hidden');
      document.getElementById('profileNav').className = 'flex flex-col items-center space-y-1 px-4 py-2 text-green-600 font-semibold';
      updateProfilePage();
      break;
  }
}

// 确保函数在全局作用域中可用
if (typeof window !== 'undefined') {
  window.showBottomTab = showBottomTab;
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
  const profileBalance = document.getElementById('profileBalance');
  const balanceAmount = document.getElementById('balanceAmount');
  const profileLogoutBtn = document.getElementById('profileLogoutBtn');
  
  if (currentUser) {
    document.getElementById('profileName').textContent = currentUser.name || t('user_chinese');
    if (profilePhone) {
      profilePhone.textContent = currentUser.phone;
      // 移除点击事件（已登录用户不需要）
      profilePhone.style.cursor = 'default';
      profilePhone.onclick = null;
      profilePhone.classList.remove('cursor-pointer', 'hover:text-blue-600', 'underline', 'transition');
    }
    // 显示余额
    if (profileBalance) {
      profileBalance.style.display = 'block';
      loadUserBalance();
    }
    // 显示登出按钮
    if (profileLogoutBtn) {
      profileLogoutBtn.classList.remove('hidden');
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
    // 隐藏余额
    if (profileBalance) {
      profileBalance.style.display = 'none';
    }
    // 隐藏登出按钮
    if (profileLogoutBtn) {
      profileLogoutBtn.classList.add('hidden');
    }
  }
}

// 加载用户余额（带缓存和防抖）
let userBalance = 0;
let balanceLoading = false;
let balanceLastLoad = 0;
const BALANCE_CACHE_TIME = 5000; // 5秒缓存

async function loadUserBalance(forceRefresh = false) {
  if (!currentUser) return;
  
  // 如果正在加载且不是强制刷新，等待当前加载完成
  if (balanceLoading && !forceRefresh) {
    // 等待最多2秒
    let waitCount = 0;
    while (balanceLoading && waitCount < 20) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitCount++;
    }
    // 如果等待后仍然在加载，直接返回（使用当前缓存的余额）
    if (balanceLoading) {
      return;
    }
  }
  
  // 如果缓存有效且不是强制刷新，直接返回
  const now = Date.now();
  if (!forceRefresh && (now - balanceLastLoad) < BALANCE_CACHE_TIME && balanceLastLoad > 0) {
    // 更新显示（使用缓存的余额）
    const balanceAmountEl = document.getElementById('balanceAmount');
    if (balanceAmountEl) {
      balanceAmountEl.textContent = formatPrice(userBalance);
    }
    updateCartBalanceDisplay();
    return;
  }
  
  // 如果强制刷新，即使正在加载也要重新加载
  if (balanceLoading && forceRefresh) {
    // 等待当前加载完成，然后重新加载
    let waitCount = 0;
    while (balanceLoading && waitCount < 20) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitCount++;
    }
  }
  
  balanceLoading = true;
  
  try {
    const response = await fetch(`${API_BASE}/user/balance`, {
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        // 确保余额是数字类型
        userBalance = parseFloat(data.balance) || 0;
        balanceLastLoad = now;
        const balanceAmountEl = document.getElementById('balanceAmount');
        if (balanceAmountEl) {
          balanceAmountEl.textContent = formatPrice(userBalance);
        }
        // 更新购物车中的余额显示（不触发新的API调用）
        updateCartBalanceDisplay();
      }
    }
  } catch (error) {
    console.error('获取余额失败:', error);
    // 如果是429错误，不更新缓存时间，允许稍后重试
    if (error.status !== 429) {
      balanceLastLoad = now;
    }
  } finally {
    balanceLoading = false;
  }
}

// 更新购物车中的余额显示（仅更新显示，不触发API调用）
function updateCartBalanceDisplay() {
  const availableBalanceEl = document.getElementById('availableBalance');
  const balanceSection = document.getElementById('balanceSection');
  
  if (currentUser && balanceSection) {
    balanceSection.classList.remove('hidden');
    if (availableBalanceEl) {
      availableBalanceEl.textContent = formatPrice(userBalance);
    }
    // 更新余额使用提示（不重新获取余额）
    updateBalanceUsageDisplay();
  } else if (balanceSection) {
    balanceSection.classList.add('hidden');
  }
}

// 更新购物车中的余额显示（兼容旧函数名）
function updateCartBalance() {
  updateCartBalanceDisplay();
}

// 更新余额使用显示（不触发API调用）
function updateBalanceUsageDisplay() {
  const useBalanceCheckbox = document.getElementById('useBalanceCheckbox');
  const balanceWarning = document.getElementById('balanceWarning');
  const balanceInfo = document.getElementById('balanceInfo');
  const balanceUsedAmount = document.getElementById('balanceUsedAmount');
  const remainingAmount = document.getElementById('remainingAmount');
  const cartTotalEl = document.getElementById('cartTotal');
  
  if (!useBalanceCheckbox || !cartTotalEl) return;
  
  const useBalance = useBalanceCheckbox.checked;
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  if (useBalance) {
    // 使用 parseFloat 确保数值比较正确
    const currentBalance = parseFloat(userBalance) || 0;
    const cartTotal = parseFloat(total) || 0;
    
    // 添加调试日志
    console.log('余额检查:', { 
      currentBalance, 
      cartTotal, 
      userBalance, 
      total,
      comparison: currentBalance >= cartTotal 
    });
    
    // 检查余额是否大于0（允许部分使用余额）
    if (currentBalance <= 0) {
      // 余额为0或负数，不允许使用
      useBalanceCheckbox.checked = false;
      if (balanceWarning) {
        balanceWarning.classList.remove('hidden');
      }
      if (balanceInfo) {
        balanceInfo.classList.add('hidden');
      }
      showToast(t('balance_insufficient'), 'warning');
      return;
    }
    
    // 余额大于0，允许使用（支持部分使用）
    if (balanceWarning) {
      balanceWarning.classList.add('hidden');
    }
    if (balanceInfo) {
      balanceInfo.classList.remove('hidden');
    }
    
    // 计算实际使用的余额和剩余金额
    const actualBalanceUsed = Math.min(currentBalance, cartTotal); // 使用余额和总价中的较小值
    const remainingToPay = Math.max(0, cartTotal - currentBalance); // 剩余需要支付的金额
    
    if (balanceUsedAmount) {
      balanceUsedAmount.textContent = formatPrice(actualBalanceUsed);
    }
    if (remainingAmount) {
      remainingAmount.textContent = formatPrice(remainingToPay);
    }
    
    // 更新购物车总价显示（显示剩余需要支付的金额）
    updateCartTotal();
  } else {
    if (balanceWarning) {
      balanceWarning.classList.add('hidden');
    }
    if (balanceInfo) {
      balanceInfo.classList.add('hidden');
    }
    // 不使用余额时，恢复显示原始总价
    updateCartTotal();
  }
}

// 切换使用余额（带API刷新，仅在用户主动勾选时调用）
async function toggleUseBalance() {
  const useBalanceCheckbox = document.getElementById('useBalanceCheckbox');
  if (!useBalanceCheckbox) return;
  
  // 如果用户勾选了使用余额，强制刷新余额以确保最新
  if (useBalanceCheckbox.checked) {
    await loadUserBalance(true); // 强制刷新
    // 等待一小段时间确保 userBalance 已更新
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // 更新显示
  updateBalanceUsageDisplay();
}

// 切换标签页（保留兼容）
function showTab(tabName) {
  showBottomTab(tabName);
}

// 加载我的订单
// 订单加载状态管理（防止重复请求）
let ordersLoading = false;
let ordersLoadTimeout = null;
let ordersLoaded = 0; // 已加载的订单数量
let ordersHasMore = false; // 是否还有更多订单
let allOrders = []; // 存储所有已加载的订单

async function loadOrders(resetPagination = true) {
  const container = document.getElementById('ordersList');
  const ordersTab = document.getElementById('ordersTab');
  
  // 设置是否需要滚动到顶部的标志
  // resetPagination=true 表示新订单或首次加载，需要滚动到顶部
  // resetPagination=false 表示刷新，保持当前位置
  // 注意：必须在函数开始就设置，即使后续可能因为防抖而提前返回
  window.shouldScrollToTopOnOrdersLoad = resetPagination;
  
  // 防抖：如果正在加载，取消之前的请求
  if (ordersLoading) {
    return; // 如果正在加载，直接返回，避免重复请求
  }
  
  // 清除之前的防抖定时器
  if (ordersLoadTimeout) {
    clearTimeout(ordersLoadTimeout);
  }
  
  // 设置防抖延迟（300ms）
  return new Promise((resolve) => {
    ordersLoadTimeout = setTimeout(async () => {
      try {
        // 先检查是否登录
        if (!currentUser) {
          container.innerHTML = `<div class="text-center py-12"><p class="text-gray-500 mb-4">${t('please_login_view_orders')}</p><button onclick="showLoginModal()" class="px-6 py-2 bg-blue-600 text-white rounded-lg">${t('login')}</button></div>`;
          ordersLoading = false;
          resolve();
          return;
        }
        
        ordersLoading = true;
        
        // 只有在明确要求重置分页时才重置（比如首次加载、切换标签页）
        if (resetPagination) {
          ordersLoaded = 0;
          allOrders = [];
        }
        
        // 使用统一的API封装，只尝试一个接口（优先使用 /user/orders）
        try {
          if (resetPagination) {
            // 重置模式：请求前10条
            const data = await apiGet('/user/orders?limit=10&offset=0', { showError: false });
            
            if (data && data.success) {
              if (data.orders && data.orders.length > 0) {
                allOrders = data.orders;
                ordersLoaded = data.orders.length;
                ordersHasMore = data.hasMore || false;
                renderOrders(allOrders, true);
              } else {
                container.innerHTML = `<div class="text-center py-12 text-gray-500">${t('you_have_no_orders')}</div>`;
                ordersHasMore = false;
              }
            } else {
              container.innerHTML = `<div class="text-center py-12 text-red-500">${data?.message || t('failed_load_orders_refresh')}</div>`;
              ordersHasMore = false;
            }
          } else {
            // 刷新模式：请求所有已加载的订单，保持分页状态
            // 如果还没有加载任何订单，就加载前10条
            const limit = ordersLoaded > 0 ? ordersLoaded : 10;
            const data = await apiGet(`/user/orders?limit=${limit}&offset=0`, { showError: false });
            
            if (data && data.success) {
              if (data.orders && data.orders.length > 0) {
                // 更新所有已加载订单的数据
                allOrders = data.orders;
                // 保持当前的ordersLoaded数量不变
                // 更新hasMore状态（基于总数判断）
                const total = data.total || data.orders.length;
                ordersHasMore = ordersLoaded < total;
                
                // 重新渲染所有已加载的订单
                const ordersToShow = allOrders.slice(0, ordersLoaded);
                renderOrders(ordersToShow, true);
              } else {
                // 如果订单被删光了，清空显示
                container.innerHTML = `<div class="text-center py-12 text-gray-500">${t('you_have_no_orders')}</div>`;
                ordersLoaded = 0;
                allOrders = [];
                ordersHasMore = false;
              }
            }
            // 刷新模式下，如果请求失败，不改变当前显示
          }
        } catch (error) {
          if (error.status === 401) {
            currentUser = null;
            updateLoginStatus();
            container.innerHTML = `<div class="text-center py-12"><p class="text-gray-500 mb-4">${t('login_expired_please_login')}</p><button onclick="showLoginModal()" class="px-6 py-2 bg-blue-600 text-white rounded-lg">${t('login')}</button></div>`;
          } else if (error.status === 429) {
            // 429错误：请求过于频繁，显示友好提示
            container.innerHTML = `<div class="text-center py-12 text-yellow-600">
              <p class="mb-2">${t('request_too_frequent') || '请求过于频繁，请稍后再试'}</p>
              <button onclick="setTimeout(() => loadOrders(false), 2000)" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm mt-2">${t('retry') || '重试'}</button>
            </div>`;
          } else {
            console.error('加载订单失败:', error);
            container.innerHTML = `<div class="text-center py-12 text-red-500">${t('failed_load_orders_error', { error: error.message || t('network_error') })}</div>`;
          }
        }
      } catch (error) {
        console.error('加载订单失败:', error);
        container.innerHTML = '<div class="text-center py-12 text-red-500">Failed to load orders: ' + (error.message || 'Network error') + '</div>';
      } finally {
        ordersLoading = false;
        resolve();
      }
    }, 300); // 300ms防抖延迟
  });
}

// 渲染订单列表
function renderOrders(orders, isInitial = false) {
  const container = document.getElementById('ordersList');
  
  if (orders.length === 0) {
    container.innerHTML = `<div class="text-center py-12 text-gray-500">${t('no_orders_chinese')}</div>`;
    return;
  }
  
  // 如果是初始加载，清空容器；否则追加
  if (isInitial) {
    container.innerHTML = '';
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
  const instantPaymentEnabled = currentSettings.instant_payment_enabled === 'true';
  
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
  
  const ordersHTMLNew = orders.map(order => {
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
        <div class="p-2 bg-gray-50 rounded text-xs border border-gray-200">
          <div class="text-gray-700 font-semibold mb-1">📅 ${t('cycle_id')}: <span class="font-bold">${order.cycle_id}</span></div>
          <div class="text-gray-600">${t('cycle_number')}: <span class="font-semibold">${order.cycle_number || 'N/A'}</span></div>
          <div class="text-gray-600 mt-1">${t('cycle_time')}: ${startTime} - ${endTime}</div>
        </div>
      `;
    }
    
    return `
    <div class="${expiredBgClass} rounded-xl shadow-md p-4 sm:p-6 ${!isActiveCycle || isExpired ? 'opacity-75' : ''}">
      <!-- 订单头部：订单号和状态（移动端垂直布局，桌面端水平布局） -->
      <div class="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-4 gap-3">
        <div class="flex-1">
          <div class="flex items-center justify-between gap-2 mb-2">
            <h3 class="text-lg font-bold ${expiredClass}">${t('order_number_label')} ${order.order_number}</h3>
            <!-- 移动端：状态标签显示在订单号右侧 -->
            <div class="flex flex-col items-end space-y-1 sm:hidden">
              <span class="px-2 py-1 rounded-full text-xs font-semibold ${statusColors[order.status]}">
                ${statusText[order.status]}
              </span>
              ${order.payment_method === 'stripe' && order.status === 'paid' && !order.payment_image ? `
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                  💳 ${t('online_payment_badge')}
                </span>
              ` : ''}
            </div>
          </div>
          <p class="text-sm ${expiredClass || 'text-gray-500'} mb-2">${new Date(order.created_at).toLocaleString('en-US')}</p>
        </div>
        <!-- 桌面端：状态标签显示在右侧 -->
        <div class="hidden sm:flex sm:flex-col sm:items-end sm:space-y-2">
          <span class="px-3 py-1 rounded-full text-sm font-semibold ${statusColors[order.status]}">
            ${statusText[order.status]}
          </span>
          ${order.payment_method === 'stripe' && order.status === 'paid' && !order.payment_image ? `
            <span class="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
              💳 ${t('online_payment_badge')}
            </span>
          ` : ''}
        </div>
      </div>
      
      <!-- 周期信息、订单类型、地址等信息（使用网格布局，移动端单列，桌面端可多列） -->
      <div class="space-y-2 mb-4">
        ${cycleInfo}
        ${isExpired ? `<p class="text-sm text-red-600 font-semibold">⚠️ ${t('order_expired')}</p>` : ''}
        ${order.order_type === 'dine_in' ? `
          <div class="p-2 bg-blue-50 rounded text-xs border border-blue-200">
            <div class="text-blue-700 font-semibold mb-1">🍽️ ${t('dine_in') || 'Dine-In'}:</div>
            ${order.table_number ? `<div class="text-blue-900 font-medium">${t('table_number_colon')} ${order.table_number}</div>` : ''}
          </div>
        ` : ''}
        ${order.delivery_address ? `
          <div class="p-2 bg-green-50 rounded text-xs border border-green-200">
            <div class="text-green-700 font-semibold mb-1">📍 ${t('delivery_address') || 'Delivery Address'}:</div>
            <div class="text-green-900 font-medium">${order.delivery_address.name}</div>
            ${order.delivery_address.description ? `<div class="text-green-700 mt-1">${order.delivery_address.description}</div>` : ''}
          </div>
        ` : ''}
        ${!order.delivery_address && order.order_type !== 'dine_in' ? `
          <div class="p-2 bg-green-50 rounded text-xs border border-green-200">
            <div class="text-green-700 font-semibold mb-1">🚚 ${t('delivery') || 'Delivery'}</div>
          </div>
        ` : ''}
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
                  <span class="${expiredClass || inactiveClass} font-medium text-right">${formatPrice(unitPrice)}</span>
                </div>
                <div class="flex justify-between text-xs">
                  <span class="${expiredClass || inactiveClass || 'text-gray-600'}">${t('subtotal')}</span>
                  <span class="${!isActiveCycle || isExpired ? 'text-gray-500' : 'text-red-600'} font-bold text-right">${formatPrice(item.subtotal)}</span>
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
            <span class="${expiredClass || inactiveClass} font-medium text-right">${formatPrice(order.total_amount)}</span>
          </div>
          ${order.discount_amount > 0 ? `
            <div class="flex justify-between items-center text-sm">
              <span class="${expiredClass || inactiveClass || 'text-gray-600'}">${t('discount_label')}</span>
              <span class="${!isActiveCycle || isExpired ? 'text-gray-500' : 'text-green-600'} font-medium text-right">-${formatPrice(order.discount_amount)}</span>
            </div>
          ` : ''}
          ${order.balance_used && order.balance_used > 0 ? `
            <div class="flex justify-between items-center text-sm">
              <span class="${expiredClass || inactiveClass || 'text-gray-600'}" data-i18n="balance_used">Balance Used</span>
              <span class="${expiredClass || inactiveClass || 'text-green-600'} font-medium text-right">-${formatPrice(order.balance_used)}</span>
            </div>
            <div class="flex justify-between items-center text-sm pt-1 border-t border-gray-200">
              <span class="${expiredClass || inactiveClass || 'text-gray-600'}">${t('subtotal')}</span>
              <span class="${expiredClass || inactiveClass || 'text-gray-700'} font-medium text-right">
                ${formatPrice(order.total_amount)}${order.discount_amount > 0 ? ` - ${formatPrice(order.discount_amount)}` : ''} - ${formatPrice(order.balance_used)} = <span class="font-bold">${formatPrice(order.final_amount)}</span>
              </span>
            </div>
          ` : ''}
          <div class="flex justify-between items-center text-lg font-bold pt-2 border-t ${!isActiveCycle || isExpired ? 'border-gray-300' : 'border-gray-300'}">
            <span class="${expiredClass || inactiveClass}">${t('final_amount_label')}</span>
            <span class="${!isActiveCycle || isExpired ? 'text-gray-500' : 'text-red-600'} text-xl text-right">${formatPrice(order.final_amount)}</span>
          </div>
          ${order.notes ? `
            <div class="mt-3 pt-3 border-t ${!isActiveCycle || isExpired ? 'border-gray-300' : 'border-gray-200'}">
              <div class="text-xs text-gray-500 mb-1">${t('order_notes')}</div>
              <div class="text-sm ${expiredClass || inactiveClass || 'text-gray-700'} bg-gray-50 p-2 rounded">${order.notes}</div>
            </div>
          ` : ''}
          ${order.payment_method === 'stripe' && order.stripe_payment_intent_id && order.status === 'paid' && !order.payment_image ? `
            <div class="mt-3 pt-3 border-t ${!isActiveCycle || isExpired ? 'border-gray-300' : 'border-gray-200'}">
              <div class="text-xs text-gray-500 mb-1">${t('transaction_id')}:</div>
              <div class="text-xs ${expiredClass || inactiveClass || 'text-gray-700'} font-mono break-all bg-gray-50 p-2 rounded">${order.stripe_payment_intent_id}</div>
            </div>
          ` : ''}
        </div>
      </div>
      
      ${order.status === 'pending' ? `
        <div class="flex ${canEdit || instantPaymentEnabled ? 'space-x-2' : ''} mt-4">
          ${(canEdit || instantPaymentEnabled) ? `
            <button onclick="deleteOrder('${order.id}')" 
                    class="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition">
              ${t('delete_order')}
            </button>
          ` : ''}
          ${instantPaymentEnabled ? `
            <!-- 即时支付模式：随时可以支付 -->
            <button onclick="showPaymentModal('${order.id}')" 
                    class="${(canEdit || instantPaymentEnabled) ? 'flex-1' : 'w-full'} bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition">
              ${t('payment_button')}
            </button>
          ` : currentSettings.ordering_open === 'true' ? `
            <!-- 传统模式：点单开放时不能支付，需要等待周期结束 -->
            <button disabled
                    class="${canEdit ? 'flex-1' : 'w-full'} bg-gray-400 text-white font-semibold py-3 rounded-lg transition cursor-not-allowed relative">
              <div class="flex flex-col items-center">
                <span>${t('payment_button')}</span>
                <span class="text-xs font-normal mt-1 opacity-90">${t('wait_close_ordering')}</span>
              </div>
            </button>
          ` : `
            <!-- 传统模式：点单关闭后可以支付 -->
            <button onclick="showPaymentModal('${order.id}')" 
                    class="${canEdit ? 'flex-1' : 'w-full'} bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition">
              ${t('payment_button')}
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
  
  // 如果是初始加载，清空容器并设置内容；否则追加
  if (isInitial) {
    // 获取可滚动容器
      const ordersTab = document.getElementById('ordersTab');
    const isOrdersTabVisible = ordersTab && !ordersTab.classList.contains('hidden');
    
    // 检查是否需要滚动到顶部（点单后）
    const shouldScrollToTop = window.shouldScrollToTopOnOrdersLoad === true;
    
    container.innerHTML = ordersHTMLNew;
    
    // 简单的滚动处理：只在点单后滚动到顶部，刷新时不操作滚动位置
    if (shouldScrollToTop && isOrdersTabVisible && ordersTab) {
      // 点单后：滚动到顶部显示最新订单
      // 使用 requestAnimationFrame 确保 DOM 已更新
      requestAnimationFrame(() => {
        ordersTab.scrollTop = 0;
        window.shouldScrollToTopOnOrdersLoad = false; // 重置标志
      });
      }
    // 刷新时：不进行任何滚动操作，让浏览器保持用户的滚动位置
  } else {
    // 追加模式：先移除旧的"显示更多"按钮，然后追加新订单
    const oldButton = container.querySelector('#loadMoreOrdersBtn');
    if (oldButton) {
      oldButton.remove();
    }
    container.innerHTML += ordersHTMLNew;
  }
  
  // 添加或更新"显示更多"按钮
  updateLoadMoreButton();
}

// 更新"显示更多"按钮
function updateLoadMoreButton() {
  const container = document.getElementById('ordersList');
  if (!container) return;
  
  // 移除旧的按钮
  const oldButton = container.querySelector('#loadMoreOrdersBtn');
  if (oldButton) {
    oldButton.remove();
  }
  
  // 如果还有更多订单，显示按钮
  if (ordersHasMore) {
    const button = document.createElement('div');
    button.id = 'loadMoreOrdersBtn';
    button.className = 'text-center py-4';
    button.innerHTML = `
      <button onclick="loadMoreOrders()" 
              class="px-6 py-2 text-gray-600 hover:text-gray-800 text-sm font-normal border border-gray-300 hover:border-gray-400 rounded-lg transition bg-white hover:bg-gray-50">
        ${t('load_more') || '显示更多'}
      </button>
    `;
    container.appendChild(button);
  }
}

// 加载更多订单
async function loadMoreOrders() {
  if (ordersLoading || !ordersHasMore) {
    return;
  }
  
  const button = document.getElementById('loadMoreOrdersBtn');
  if (button) {
    const btn = button.querySelector('button');
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('loading') || '加载中...';
    }
  }
  
  try {
    ordersLoading = true;
    
    const data = await apiGet(`/user/orders?limit=10&offset=${ordersLoaded}`, { showError: false });
    
    if (data && data.success && data.orders && data.orders.length > 0) {
      // 追加新订单到已有列表
      allOrders = allOrders.concat(data.orders);
      ordersLoaded += data.orders.length;
      ordersHasMore = data.hasMore || false;
      
      // 渲染新订单（追加模式）
      renderOrders(data.orders, false);
    } else {
      ordersHasMore = false;
      updateLoadMoreButton();
    }
  } catch (error) {
    console.error('加载更多订单失败:', error);
    showToast(t('failed_load_orders') || '加载订单失败', 'error');
  } finally {
    ordersLoading = false;
    if (button) {
      const btn = button.querySelector('button');
      if (btn) {
        btn.disabled = false;
        btn.textContent = t('load_more') || '显示更多';
      }
    }
  }
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
      loadOrders(true); // 删除订单后重置分页，因为订单数量变了
    } else {
      showToast(data.message || t('delete_failed_retry'), 'error');
    }
  } catch (error) {
    console.error('Failed to delete order:', error);
    showToast(t('delete_failed_retry'), 'error');
  }
}

// 初始化 Stripe
async function initStripe() {
  try {
    // 检查 Stripe.js 是否已加载（尝试多种方式）
    let StripeConstructor = window.Stripe || (typeof Stripe !== 'undefined' ? Stripe : null);
    
    if (!StripeConstructor) {
      console.warn('Stripe.js 未加载，等待加载...');
      // 等待最多 5 秒让 Stripe.js 加载
      let attempts = 0;
      while (attempts < 50 && !window.Stripe && typeof Stripe === 'undefined') {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        StripeConstructor = window.Stripe || (typeof Stripe !== 'undefined' ? Stripe : null);
        if (StripeConstructor) break;
      }
      
      if (!StripeConstructor) {
        console.error('Stripe.js 加载超时，请检查网络连接');
        return false;
      }
    }
    
    const response = await fetch(`${API_BASE}/user/stripe-config`, { credentials: 'include' });
    const data = await response.json();
    
    console.log('Stripe 配置响应:', data); // 调试信息
    
    // 检查配置是否有效（publishableKey 不为空且以 pk_ 开头）
    if (data.success && data.publishableKey && data.publishableKey.trim() && data.publishableKey.trim().startsWith('pk_')) {
      stripe = StripeConstructor(data.publishableKey.trim());
      return true;
    }
    console.warn('Stripe 配置无效:', { 
      success: data.success, 
      publishableKey: data.publishableKey ? (data.publishableKey.substring(0, 10) + '...') : 'empty',
      enabled: data.enabled 
    });
    return false;
  } catch (error) {
    console.error('初始化 Stripe 失败:', error);
    return false;
  }
}

// 选择支付方式
function selectPaymentMethod(method) {
  currentPaymentMethod = method;
  const stripeSection = document.getElementById('stripePaymentSection');
  const screenshotSection = document.getElementById('screenshotPaymentSection');
  const stripeBtn = document.getElementById('selectStripePayment');
  const screenshotBtn = document.getElementById('selectScreenshotPayment');
  
  // 更新按钮样式
  if (stripeBtn && screenshotBtn) {
    if (method === 'stripe') {
      stripeBtn.classList.add('border-blue-500', 'bg-blue-50');
      stripeBtn.classList.remove('border-gray-300');
      screenshotBtn.classList.remove('border-blue-500', 'bg-blue-50');
      screenshotBtn.classList.add('border-gray-300');
    } else {
      screenshotBtn.classList.add('border-blue-500', 'bg-blue-50');
      screenshotBtn.classList.remove('border-gray-300');
      stripeBtn.classList.remove('border-blue-500', 'bg-blue-50');
      stripeBtn.classList.add('border-gray-300');
    }
  }
  
  // 显示/隐藏对应的表单
  if (method === 'stripe') {
    stripeSection.classList.remove('hidden');
    screenshotSection.classList.add('hidden');
    screenshotSection.style.display = 'none'; // 确保隐藏
    initStripeElements();
  } else {
    stripeSection.classList.add('hidden');
    screenshotSection.classList.remove('hidden');
    screenshotSection.style.display = 'block'; // 确保显示
  }
}

// 初始化 Stripe Elements
async function initStripeElements() {
  if (!stripe || stripePaymentElement) return; // 已经初始化过
  
  try {
    // 创建 Payment Intent
    const response = await fetch(`${API_BASE}/user/orders/${currentPaymentOrderId}/create-payment-intent`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    });
    
    const data = await response.json();
    
    if (!data.success) {
      showToast(data.message || t('create_payment_failed'), 'error');
      return;
    }
    
    // 获取当前语言设置（用于 Stripe Payment Element 的 locale）
    const currentLang = typeof getLanguage === 'function' ? getLanguage() : 'en';
    const stripeLocale = currentLang === 'zh' ? 'zh' : 'en';
    
    // 创建 Payment Element（支持 Apple Pay 和银行卡）
    stripeElements = stripe.elements({ 
      clientSecret: data.clientSecret,
      appearance: {
        theme: 'stripe',
        locale: stripeLocale, // 设置语言
      }
    });
    
    // 使用 Payment Element 替代 Card Element
    // Payment Element 自动支持 Apple Pay、Google Pay 等多种支付方式
    // 参考：https://docs.stripe.com/payments/payment-element
    // Payment Element 会自动检测设备支持的支付方式并优先显示
    stripePaymentElement = stripeElements.create('payment', {
      layout: 'tabs', // 使用标签页布局
      // Payment Element 会自动检测并显示设备支持的所有支付方式
      // 在支持的设备上，Apple Pay 会自动显示在最前面
      // 对于本地开发（localhost），Apple Pay 可能不可用，但银行卡可以正常工作
    });
    
    stripePaymentElement.mount('#stripePaymentElement');
    
    // 监听错误
    stripePaymentElement.on('change', (event) => {
      const displayError = document.getElementById('stripeCardErrors');
      if (event.error) {
        // 翻译 Stripe 错误消息
        displayError.textContent = translateStripeErrorMessage(event.error.message);
      } else {
        displayError.textContent = '';
      }
    });
    
    // 设置支付按钮事件
    const payButton = document.getElementById('stripePayButton');
    if (payButton) {
      payButton.onclick = handleStripePayment;
    }
    
  } catch (error) {
    console.error('初始化 Stripe Elements 失败:', error);
    showToast(t('init_payment_failed'), 'error');
  }
}

// 处理 Stripe 支付
async function handleStripePayment() {
  if (!stripe || !stripePaymentElement) {
    showToast(t('payment_not_initialized'), 'error');
    return;
  }
  
  const payButton = document.getElementById('stripePayButton');
  setButtonLoading(payButton, true);
  
  try {
    // 使用 Payment Element 确认支付（支持 Apple Pay 和银行卡）
    const { error: submitError, paymentIntent } = await stripe.confirmPayment({
      elements: stripeElements,
      confirmParams: {
        return_url: window.location.origin + window.location.pathname, // 支付完成后的返回地址
      },
      redirect: 'if_required', // 如果不需要重定向（如 Apple Pay），则不重定向
    });
    
    if (submitError) {
      // 翻译 Stripe 错误消息
      const translatedError = translateStripeErrorMessage(submitError.message);
      showToast(translatedError, 'error');
      setButtonLoading(payButton, false);
      return;
    }
    
    // 检查支付状态
    if (paymentIntent && paymentIntent.status === 'succeeded') {
      // 通知后端确认支付
      const response = await fetch(`${API_BASE}/user/orders/${currentPaymentOrderId}/confirm-stripe-payment`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: paymentIntent.id })
      });
      
      const data = await response.json();
      
      if (data.success) {
        showToast(t('payment_success'), 'success');
        closePayment();
        loadOrders(false);
      } else {
        showToast(data.message || t('confirm_payment_failed'), 'error');
      }
    } else if (paymentIntent && paymentIntent.status === 'requires_action') {
      // 需要额外验证（如 3D Secure），Stripe 会自动处理
      showToast(t('payment_requires_action'), 'info');
    }
  } catch (error) {
    console.error('Stripe 支付失败:', error);
    showToast(t('payment_failed_retry'), 'error');
  } finally {
    setButtonLoading(payButton, false);
  }
}

// 显示付款模态框
async function showPaymentModal(orderId) {
  currentPaymentOrderId = orderId;
  
  // 查找订单信息
  fetch(`${API_BASE}/user/orders/${orderId}`, { credentials: 'include' })
    .then(res => res.json())
    .then(async (data) => {
      if (data.success) {
        const order = data.order;
        document.getElementById('paymentOrderInfo').innerHTML = `
          <p class="font-semibold"><span data-i18n="order_number_label">Order Number</span>: ${order.order_number}</p>
          <p class="text-2xl font-bold text-blue-600 mt-2"><span data-i18n="amount_due">Amount Due</span>: ${formatPriceDecimal(order.final_amount)}</p>
        `;
        
        // 检查 Stripe 配置（在显示模态框时再次检查，确保获取最新状态）
        let isStripeEnabled = false;
        try {
          const configResponse = await fetch(`${API_BASE}/user/stripe-config`, { credentials: 'include' });
          const configData = await configResponse.json();
          console.log('Stripe 配置检查:', configData); // 调试信息
          
          isStripeEnabled = configData.success && 
                           configData.publishableKey && 
                           configData.publishableKey.trim() && 
                           configData.publishableKey.trim().startsWith('pk_');
          
          // 如果配置有效，初始化 Stripe
          if (isStripeEnabled && !stripe) {
            // 检查 Stripe.js 是否已加载（尝试多种方式）
            let StripeConstructor = null;
            
            // 尝试获取 Stripe 构造函数
            if (typeof window.Stripe !== 'undefined') {
              StripeConstructor = window.Stripe;
            } else if (typeof Stripe !== 'undefined') {
              StripeConstructor = Stripe;
            }
            
            if (!StripeConstructor) {
              console.warn('Stripe.js 未加载，尝试等待加载...');
              // 等待最多 5 秒
              let attempts = 0;
              while (attempts < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
                
                if (typeof window.Stripe !== 'undefined') {
                  StripeConstructor = window.Stripe;
                  break;
                } else if (typeof Stripe !== 'undefined') {
                  StripeConstructor = Stripe;
                  break;
                }
              }
              
              if (!StripeConstructor) {
                console.error('Stripe.js 加载超时，请检查网络连接或刷新页面');
                console.log('当前 window.Stripe:', typeof window.Stripe);
                console.log('当前 Stripe:', typeof Stripe);
                isStripeEnabled = false; // 标记为未启用，因为无法使用
              } else {
                stripe = StripeConstructor(configData.publishableKey.trim());
                console.log('Stripe 实例已初始化（延迟加载）');
              }
            } else {
              stripe = StripeConstructor(configData.publishableKey.trim());
              console.log('Stripe 实例已初始化');
            }
          }
        } catch (error) {
          console.error('检查 Stripe 配置失败:', error);
        }
        
        // 检查是否启用即时支付
        const instantPaymentEnabled = currentSettings.instant_payment_enabled === 'true';
        
        // 如果启用即时支付，只显示在线支付，隐藏上传截图选项
        if (instantPaymentEnabled) {
          // 隐藏支付方式选择按钮（直接通过 ID 隐藏）
          const stripeBtn = document.getElementById('selectStripePayment');
          const screenshotBtn = document.getElementById('selectScreenshotPayment');
          if (stripeBtn) stripeBtn.style.display = 'none';
          if (screenshotBtn) screenshotBtn.style.display = 'none';
          
          // 隐藏支付方式选择区域的标签
          const paymentMethodLabel = document.querySelector('#paymentModal label[data-i18n="payment_method"]');
          if (paymentMethodLabel) {
            const labelContainer = paymentMethodLabel.closest('.mb-4');
            if (labelContainer) labelContainer.style.display = 'none';
          }
          
          // 隐藏上传截图表单
          const screenshotSection = document.getElementById('screenshotPaymentSection');
          if (screenshotSection) {
            screenshotSection.style.display = 'none';
          }
          
          // 如果 Stripe 已启用，直接显示 Stripe 支付表单
          if (isStripeEnabled) {
            const stripeSection = document.getElementById('stripePaymentSection');
            if (stripeSection) {
              stripeSection.classList.remove('hidden');
              // 初始化 Stripe Elements
              initStripeElements();
            }
          } else {
            // Stripe 未配置，显示错误提示
            const stripeNotConfigured = document.getElementById('stripeNotConfigured');
            if (stripeNotConfigured) {
              stripeNotConfigured.classList.remove('hidden');
              stripeNotConfigured.style.display = 'block';
              stripeNotConfigured.style.marginTop = '1rem';
            }
          }
        } else {
          // 传统模式：显示两种支付方式选择
          const stripeBtn = document.getElementById('selectStripePayment');
          const screenshotBtn = document.getElementById('selectScreenshotPayment');
          if (stripeBtn) stripeBtn.style.display = 'block';
          if (screenshotBtn) screenshotBtn.style.display = 'block';
          
          // 显示支付方式选择区域的标签
          const paymentMethodLabel = document.querySelector('#paymentModal label[data-i18n="payment_method"]');
          if (paymentMethodLabel) {
            const labelContainer = paymentMethodLabel.closest('.mb-4');
            if (labelContainer) labelContainer.style.display = 'block';
          }
          
          // 如果 Stripe 未启用，显示提示并禁用按钮
          const stripeNotConfigured = document.getElementById('stripeNotConfigured');
          if (!isStripeEnabled) {
            if (stripeBtn) {
              stripeBtn.disabled = true;
              stripeBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
            if (stripeNotConfigured) {
              stripeNotConfigured.classList.remove('hidden');
            }
          } else {
            if (stripeBtn) {
              stripeBtn.disabled = false;
              stripeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            if (stripeNotConfigured) {
              stripeNotConfigured.classList.add('hidden');
            }
          }
          
          // 默认选择上传截图方式
          selectPaymentMethod('screenshot');
        }
        
        // 应用翻译
        applyTranslations();
        
        // 显示模态框
        document.getElementById('paymentModal').classList.add('active');
      }
    });
}

// 关闭付款模态框
function closePayment() {
  document.getElementById('paymentModal').classList.remove('active');
  currentPaymentOrderId = null;
  currentPaymentMethod = 'screenshot';
  
  // 重置表单
  document.getElementById('paymentForm').reset();
  
  // 重置 Stripe Elements
  if (stripePaymentElement) {
    stripePaymentElement.unmount();
    stripePaymentElement = null;
    stripeElements = null;
  }
  
  // 重置文件选择状态
  const paymentFileStatus = document.getElementById('paymentFileStatus');
  if (paymentFileStatus) {
    paymentFileStatus.textContent = t('no_file_selected');
    paymentFileStatus.classList.remove('text-green-600');
    paymentFileStatus.classList.add('text-gray-500');
  }
  
  // 重置支付方式显示和按钮样式
  const stripeSection = document.getElementById('stripePaymentSection');
  const screenshotSection = document.getElementById('screenshotPaymentSection');
  if (stripeSection) stripeSection.classList.add('hidden');
  if (screenshotSection) {
    screenshotSection.classList.remove('hidden');
    screenshotSection.style.display = 'block'; // 确保显示
  }
  
  // 重置支付方式选择按钮显示
  const stripeBtn = document.getElementById('selectStripePayment');
  const screenshotBtn = document.getElementById('selectScreenshotPayment');
  if (stripeBtn) {
    stripeBtn.style.display = 'block';
    stripeBtn.disabled = false;
    stripeBtn.classList.remove('border-blue-500', 'bg-blue-50', 'opacity-50', 'cursor-not-allowed');
    stripeBtn.classList.add('border-gray-300');
  }
  if (screenshotBtn) {
    screenshotBtn.style.display = 'block';
    screenshotBtn.classList.add('border-blue-500', 'bg-blue-50');
    screenshotBtn.classList.remove('border-gray-300');
  }
  
  // 重置支付方式选择区域的标签显示
  const paymentMethodLabel = document.querySelector('#paymentModal label[data-i18n="payment_method"]');
  if (paymentMethodLabel) {
    const labelContainer = paymentMethodLabel.closest('.mb-4');
    if (labelContainer) labelContainer.style.display = 'block';
  }
  
  // 隐藏 Stripe 未配置提示
  const stripeNotConfigured = document.getElementById('stripeNotConfigured');
  if (stripeNotConfigured) {
    stripeNotConfigured.classList.add('hidden');
  }
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
      loadOrders(false); // 保持分页状态，只刷新数据
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
// 翻译 Stripe 错误消息
function translateStripeErrorMessage(message) {
  if (!message || typeof message !== 'string') {
    return message;
  }
  
  // Stripe 错误消息到翻译键的映射
  const stripeMessageMap = {
    '您的银行卡卡号不完整。': 'card_number_incomplete',
    '您的银行卡卡号无效。': 'card_number_invalid',
    '您的银行卡已过期。': 'card_expired',
    '您的银行卡 CVC 不完整。': 'card_cvc_incomplete',
    '您的银行卡 CVC 无效。': 'card_cvc_invalid',
    '您的邮政编码不完整。': 'postal_code_incomplete',
    '您的邮政编码无效。': 'postal_code_invalid',
  };
  
  // 检查是否有精确匹配
  if (stripeMessageMap[message] && typeof t === 'function') {
    return t(stripeMessageMap[message]);
  }
  
  // 检查部分匹配（处理 Stripe 可能返回的变体）
  for (const [key, translationKey] of Object.entries(stripeMessageMap)) {
    if (message.includes(key.replace(/[。.]/g, ''))) {
      if (typeof t === 'function') {
        return t(translationKey);
      }
    }
  }
  
  // 如果没有匹配，尝试使用 getLocalizedText 处理
  return getLocalizedText(message);
}

// 翻译后端返回的中文错误消息
function translateBackendMessage(message) {
  if (!message || typeof message !== 'string') {
    return message;
  }
  
  // 后端消息到翻译键的映射
  const messageMap = {
    '该周期已确认，无法支付': 'cycle_confirmed_cannot_pay',
    '订单已付款': 'order_already_paid',
    '订单不存在': 'order_not_found',
    'Stripe 未配置，请联系管理员': 'stripe_not_configured_contact_admin',
    '创建支付失败': 'create_payment_failed',
    '初始化支付失败': 'init_payment_failed',
    '支付未初始化': 'payment_not_initialized',
    '支付成功！': 'payment_success',
    '确认支付失败': 'confirm_payment_failed',
    '支付需要额外验证，请按照提示操作': 'payment_requires_action',
    '支付失败，请重试': 'payment_failed_retry',
  };
  
  // 检查是否有匹配的翻译键
  if (messageMap[message] && typeof t === 'function') {
    return t(messageMap[message]);
  }
  
  // 如果没有匹配，尝试使用 getLocalizedText 处理（如果消息包含中英文混合）
  return getLocalizedText(message);
}

function showToast(message, type = 'success') {
  // 翻译后端返回的消息
  const translatedMessage = translateBackendMessage(message);
  // 确保 Toast 容器存在
  let toastContainer = document.getElementById('toastContainer');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toastContainer';
    toastContainer.className = 'fixed top-4 right-4 space-y-2';
    toastContainer.style.zIndex = '10000'; // 确保在所有模态框之上
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
    <span class="flex-1">${translatedMessage}</span>
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
// 反馈按钮拖动功能（业界成熟方案：使用left/top定位，requestAnimationFrame优化）
let feedbackButtonDragState = {
  isDragging: false,
  startX: 0,
  startY: 0,
  startLeft: 0,
  startTop: 0,
  hasMoved: false,
  rafId: null
};

// 初始化反馈按钮位置
function initFeedbackButtonPosition() {
  const button = document.getElementById('feedbackButton');
  if (!button) return;
  
  // 从localStorage读取保存的位置
  const savedPosition = localStorage.getItem('feedbackButtonPosition');
  if (savedPosition) {
    try {
      const { x, y } = JSON.parse(savedPosition);
      setButtonPosition(button, x, y);
      return;
    } catch (e) {
      console.error('Failed to parse saved feedback button position:', e);
    }
  }
  
  // 默认位置：左侧，距离底部120px（避免覆盖购物车和结算按钮）
  const defaultX = 16; // 左边距16px
  const defaultY = window.innerHeight - 120; // 距离底部120px
  setButtonPosition(button, defaultX, defaultY);
}

// 设置按钮位置（使用left/top，更直观）
function setButtonPosition(button, x, y) {
  // 限制在屏幕范围内
  const buttonWidth = button.offsetWidth || 56;
  const buttonHeight = button.offsetHeight || 56;
  const minX = 0;
  const maxX = window.innerWidth - buttonWidth;
  const minY = 60; // 避免覆盖底部导航栏
  const maxY = window.innerHeight - buttonHeight;
  
  x = Math.max(minX, Math.min(x, maxX));
  y = Math.max(minY, Math.min(y, maxY));
  
  // 使用left和top定位
  button.style.left = `${x}px`;
  button.style.top = `${y}px`;
  button.style.right = 'auto';
  button.style.bottom = 'auto';
}

// 保存反馈按钮位置
function saveFeedbackButtonPosition() {
  const button = document.getElementById('feedbackButton');
  if (!button) return;
  
  const rect = button.getBoundingClientRect();
  const position = {
    x: rect.left,
    y: rect.top
  };
  
  localStorage.setItem('feedbackButtonPosition', JSON.stringify(position));
}

// 获取指针位置（统一处理鼠标和触摸）
function getPointerPosition(event) {
  if (event.touches && event.touches.length > 0) {
    return { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
  if (event.changedTouches && event.changedTouches.length > 0) {
    return { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  }
  return { x: event.clientX, y: event.clientY };
}

// 开始拖动反馈按钮
function startDragFeedbackButton(event) {
  event.preventDefault();
  event.stopPropagation();
  
  const button = document.getElementById('feedbackButton');
  if (!button) return;
  
  const state = feedbackButtonDragState;
  state.isDragging = true;
  state.hasMoved = false;
  
  // 获取按钮当前位置（使用getBoundingClientRect，最准确）
  const rect = button.getBoundingClientRect();
  state.startLeft = rect.left;
  state.startTop = rect.top;
  
  // 获取初始指针位置
  const pointer = getPointerPosition(event);
  state.startX = pointer.x;
  state.startY = pointer.y;
  
  // 添加拖动事件监听
  document.addEventListener('mousemove', handleDragMove, { passive: false });
  document.addEventListener('mouseup', handleDragEnd, { passive: false });
  document.addEventListener('touchmove', handleDragMove, { passive: false });
  document.addEventListener('touchend', handleDragEnd, { passive: false });
  document.addEventListener('touchcancel', handleDragEnd, { passive: false });
  
  // 添加拖动样式
  button.style.transition = 'none';
  button.style.cursor = 'grabbing';
  button.style.userSelect = 'none';
  document.body.style.userSelect = 'none';
}

// 拖动移动处理（使用requestAnimationFrame优化性能）
function handleDragMove(event) {
  const state = feedbackButtonDragState;
  if (!state.isDragging) return;
  
  event.preventDefault();
  event.stopPropagation();
  
  // 取消之前的动画帧
  if (state.rafId !== null) {
    cancelAnimationFrame(state.rafId);
  }
  
  // 使用requestAnimationFrame确保流畅的拖动
  state.rafId = requestAnimationFrame(() => {
    const button = document.getElementById('feedbackButton');
    if (!button) return;
    
    const pointer = getPointerPosition(event);
    
    // 计算移动距离
    const deltaX = pointer.x - state.startX;
    const deltaY = pointer.y - state.startY;
    
    // 检测是否移动（用于区分点击和拖动）
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      state.hasMoved = true;
    }
    
    // 计算新位置
    let newX = state.startLeft + deltaX;
    let newY = state.startTop + deltaY;
    
    // 限制在屏幕范围内
    const buttonWidth = button.offsetWidth || 56;
    const buttonHeight = button.offsetHeight || 56;
    const minX = 0;
    const maxX = window.innerWidth - buttonWidth;
    const minY = 60; // 避免覆盖底部导航栏
    const maxY = window.innerHeight - buttonHeight;
    
    newX = Math.max(minX, Math.min(newX, maxX));
    newY = Math.max(minY, Math.min(newY, maxY));
    
    // 设置新位置
    button.style.left = `${newX}px`;
    button.style.top = `${newY}px`;
    button.style.right = 'auto';
    button.style.bottom = 'auto';
    
    state.rafId = null;
  });
}

// 停止拖动反馈按钮
function handleDragEnd(event) {
  const state = feedbackButtonDragState;
  if (!state.isDragging) return;
  
  state.isDragging = false;
  
  // 取消动画帧
  if (state.rafId !== null) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
  
  const button = document.getElementById('feedbackButton');
  if (button) {
    // 恢复样式
    button.style.transition = 'all 0.3s ease';
    button.style.cursor = 'move';
    button.style.userSelect = '';
    document.body.style.userSelect = '';
    
    // 保存位置
    saveFeedbackButtonPosition();
  }
  
  // 移除事件监听
  document.removeEventListener('mousemove', handleDragMove);
  document.removeEventListener('mouseup', handleDragEnd);
  document.removeEventListener('touchmove', handleDragMove);
  document.removeEventListener('touchend', handleDragEnd);
  document.removeEventListener('touchcancel', handleDragEnd);
  
  // 检查是否点击（不是拖动）
  if (!state.hasMoved) {
    // 延迟执行点击，避免与拖动冲突
    setTimeout(() => {
      showFeedbackModal();
    }, 10);
  }
  
  // 重置状态
  state.hasMoved = false;
}

// 显示反馈/投诉模态框
async function showFeedbackModal() {
  const modal = document.getElementById('feedbackModal');
  if (!modal) return;
  
  modal.classList.add('active');
  document.body.classList.add('modal-open');
  
  // 重置表单
  document.getElementById('feedbackForm').reset();
  document.getElementById('feedbackCharCount').textContent = '0';
  
  // 设置默认选中Feedback
  updateFeedbackTypeUI('feedback');
  
  // 设置字符计数
  const contentInput = document.getElementById('feedbackContent');
  if (contentInput) {
    contentInput.addEventListener('input', updateFeedbackCharCount);
    updateFeedbackCharCount();
  }
  
  // 加载最近的订单列表
  await loadFeedbackOrderOptions();
  
  // 设置radio按钮点击事件
  setupFeedbackTypeListeners();
  
  // 应用翻译
  applyTranslations();
}

// 设置反馈类型选择监听器
function setupFeedbackTypeListeners() {
  const feedbackRadio = document.querySelector('input[name="feedbackType"][value="feedback"]');
  const complaintRadio = document.querySelector('input[name="feedbackType"][value="complaint"]');
  const feedbackDiv = document.getElementById('feedbackTypeFeedback');
  const complaintDiv = document.getElementById('feedbackTypeComplaint');
  
  if (feedbackDiv) {
    feedbackDiv.onclick = () => {
      feedbackRadio.checked = true;
      updateFeedbackTypeUI('feedback');
    };
  }
  
  if (complaintDiv) {
    complaintDiv.onclick = () => {
      complaintRadio.checked = true;
      updateFeedbackTypeUI('complaint');
    };
  }
}

// 更新反馈类型UI样式
function updateFeedbackTypeUI(selectedType) {
  const feedbackDiv = document.getElementById('feedbackTypeFeedback');
  const complaintDiv = document.getElementById('feedbackTypeComplaint');
  
  if (feedbackDiv && complaintDiv) {
    if (selectedType === 'feedback') {
      feedbackDiv.className = 'p-3 border-2 border-blue-500 rounded-lg text-center bg-blue-50 transition';
      complaintDiv.className = 'p-3 border-2 border-gray-300 rounded-lg text-center bg-white transition';
    } else {
      feedbackDiv.className = 'p-3 border-2 border-gray-300 rounded-lg text-center bg-white transition';
      complaintDiv.className = 'p-3 border-2 border-red-500 rounded-lg text-center bg-red-50 transition';
    }
  }
}

// 加载反馈表单的订单选项
async function loadFeedbackOrderOptions() {
  const orderSelect = document.getElementById('feedbackOrderNumber');
  if (!orderSelect) return;
  
  // 检查是否登录
  if (!currentUser) {
    orderSelect.innerHTML = `<option value="">-- ${t('please_login_first')} --</option>`;
    return;
  }
  
  try {
    // 使用与 loadOrders 相同的 API 调用方式
    let data;
    if (typeof apiGet !== 'undefined') {
      // 使用统一的 API 封装
      data = await apiGet('/user/orders?limit=5', { showError: false });
    } else {
      // 回退到直接 fetch
      const response = await fetch(`${API_BASE}/user/orders?limit=5`, {
        credentials: 'include'
      });
      
      // 检查响应状态
      if (!response.ok) {
        // 如果是401未授权，提示需要登录
        if (response.status === 401) {
          orderSelect.innerHTML = `<option value="">-- ${t('please_login_first')} --</option>`;
          return;
        }
        // 其他错误
        const errorText = await response.text();
        console.error('Failed to load orders for feedback:', response.status, errorText);
        orderSelect.innerHTML = `<option value="">-- ${t('failed_to_load_orders')} --</option>`;
        return;
      }
      
      // 尝试解析JSON
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('Failed to parse JSON response:', jsonError);
        orderSelect.innerHTML = `<option value="">-- ${t('failed_to_load_orders')} --</option>`;
        return;
      }
    }
    
    if (data && data.success && data.orders && data.orders.length > 0) {
      orderSelect.innerHTML = `<option value="">-- ${t('select_order')} --</option>`;
      data.orders.forEach(order => {
        const option = document.createElement('option');
        option.value = order.order_number || order.id;
        const date = new Date(order.created_at).toLocaleDateString();
        const total = order.total_amount || 0;
        option.textContent = `${order.order_number || order.id} - ${date} - ${formatPrice(total)}`;
        orderSelect.appendChild(option);
      });
    } else {
      orderSelect.innerHTML = `<option value="">-- ${t('no_orders_found')} --</option>`;
    }
  } catch (error) {
    console.error('Failed to load orders for feedback:', error);
    orderSelect.innerHTML = `<option value="">-- ${t('failed_to_load_orders')} --</option>`;
  }
}

// 关闭反馈/投诉模态框
function closeFeedbackModal(event) {
  // 如果提供了 event 参数，检查是否点击了模态框背景
  if (event) {
    if (event.target !== event.currentTarget) {
      return; // 点击模态框内容时不关闭
    }
  }
  
  const modal = document.getElementById('feedbackModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
  }
  
  // 重置表单
  const form = document.getElementById('feedbackForm');
  if (form) {
    form.reset();
    const charCount = document.getElementById('feedbackCharCount');
    if (charCount) {
      charCount.textContent = '0';
    }
  }
}

// 更新字符计数
function updateFeedbackCharCount() {
  const contentInput = document.getElementById('feedbackContent');
  const charCount = document.getElementById('feedbackCharCount');
  if (contentInput && charCount) {
    const count = contentInput.value.length;
    charCount.textContent = count;
    if (count > 100) {
      charCount.classList.add('text-red-600');
    } else {
      charCount.classList.remove('text-red-600');
    }
  }
}

// 提交反馈/投诉
async function submitFeedback(e) {
  e.preventDefault();
  
  // 检查是否登录
  if (!currentUser) {
    closeFeedbackModal();
    showLoginModal();
    showToast(t('please_login_to_checkout'), 'info');
    return;
  }
  
  const type = document.querySelector('input[name="feedbackType"]:checked')?.value;
  const orderNumber = document.getElementById('feedbackOrderNumber')?.value.trim();
  const content = document.getElementById('feedbackContent')?.value.trim();
  
  if (!content) {
    showToast(t('feedback_required'), 'error');
    return;
  }
  
  if (content.length > 100) {
    showToast('Content exceeds 100 characters', 'error');
    return;
  }
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  setButtonLoading(submitBtn, true);
  
  try {
    const response = await fetch(`${API_BASE}/user/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        type: type,
        orderNumber: orderNumber || null,
        content: content
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      showToast(t('feedback_success'), 'success');
      closeFeedbackModal();
    } else {
      // 如果是未登录错误，显示登录提示
      if (response.status === 401) {
        closeFeedbackModal();
        showLoginModal();
        showToast(t('please_login_to_checkout'), 'info');
      } else {
        showToast(data.message || t('feedback_failed'), 'error');
      }
    }
  } catch (error) {
    console.error('Submit feedback failed:', error);
    showToast(t('feedback_failed'), 'error');
  } finally {
    setButtonLoading(submitBtn, false);
  }
}

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

