// API基础URL（如果未定义则定义，避免重复声明）
if (typeof API_BASE === 'undefined') {
  var API_BASE = '/api';
}

// 上传自定义API图片函数（提前定义，确保全局可用）
window.uploadApiImage = async function uploadApiImage() {
  console.log('=== uploadApiImage 函数开始执行 ===');
  
  const fileInput = document.getElementById('apiImageUpload');
  const statusDiv = document.getElementById('apiImageUploadStatus');
  
  console.log('元素查找结果:', {
    fileInput: fileInput ? '找到' : '未找到',
    statusDiv: statusDiv ? '找到' : '未找到',
    fileInputElement: fileInput,
    statusDivElement: statusDiv
  });
  
  if (!fileInput) {
    console.error('找不到文件输入元素 apiImageUpload');
    showToast('找不到文件输入元素，请刷新页面重试', 'error');
    return;
  }
  
  if (!fileInput.files || !fileInput.files[0]) {
    console.warn('未选择文件');
    showToast('请选择要上传的图片', 'error');
    return;
  }
  
  const selectedFile = fileInput.files[0];
  console.log('选择的文件信息:', {
    name: selectedFile.name,
    size: selectedFile.size,
    type: selectedFile.type
  });
  
  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('image', file);
  
  // 显示上传状态
  if (statusDiv) {
    statusDiv.classList.remove('hidden');
    statusDiv.className = 'mt-2 text-sm text-blue-600';
    statusDiv.textContent = '正在上传...';
  }
  
  try {
    const response = await fetch(`${API_BASE}/admin/custom-apis/upload-image`, {
      method: 'POST',
      headers: {
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: formData,
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (data.success && data.image) {
      const imageUrl = data.image.url;
      
      // 显示成功状态和链接
      if (statusDiv) {
        statusDiv.className = 'mt-2 text-sm';
        statusDiv.innerHTML = `
          <div class="bg-green-50 border border-green-200 rounded-lg p-3">
            <div class="text-green-800 font-medium mb-2">✓ 上传成功！</div>
            <div class="text-sm text-gray-700 mb-2">
              <span class="font-medium">图片链接：</span>
              <code class="bg-gray-100 px-2 py-1 rounded text-xs break-all">${imageUrl}</code>
            </div>
            <button onclick="navigator.clipboard.writeText('${imageUrl}').then(() => { if(typeof showToast === 'function') showToast('链接已复制', 'success'); else alert('链接已复制'); })" 
                    class="text-xs text-blue-600 hover:text-blue-800 underline">
              复制链接
            </button>
          </div>
        `;
      }
      
      // 清空文件输入
      fileInput.value = '';
      
      // 检查是否有JSON内容，如果有则提示是否插入
      const textarea = document.getElementById('apiResponseContent');
      if (textarea && textarea.value) {
        try {
          const jsonContent = JSON.parse(textarea.value);
          
          // 检查是否存在image字段
          let hasImageField = false;
          function checkImageField(obj) {
            if (Array.isArray(obj)) {
              obj.forEach(item => {
                if (typeof item === 'object' && item !== null) {
                  if (item.image !== undefined) {
                    hasImageField = true;
                  }
                  checkImageField(item);
                }
              });
            } else if (typeof obj === 'object' && obj !== null) {
              if (obj.image !== undefined) {
                hasImageField = true;
              }
              Object.keys(obj).forEach(key => {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                  checkImageField(obj[key]);
                }
              });
            }
          }
          checkImageField(jsonContent);
          
          if (hasImageField) {
            // 提示用户是否插入
            const shouldInsert = confirm(`检测到JSON中包含 image 字段，是否自动将所有 image 字段更新为：\n${imageUrl}\n\n点击"确定"更新所有 image 字段，点击"取消"仅复制链接。`);
            
            if (shouldInsert) {
              // 递归更新所有image字段
              function updateImageField(obj, url) {
                if (Array.isArray(obj)) {
                  obj.forEach(item => {
                    if (typeof item === 'object' && item !== null) {
                      if (item.image !== undefined) {
                        item.image = url;
                      }
                      updateImageField(item, url);
                    }
                  });
                } else if (typeof obj === 'object' && obj !== null) {
                  if (obj.image !== undefined) {
                    obj.image = url;
                  }
                  Object.keys(obj).forEach(key => {
                    if (typeof obj[key] === 'object' && obj[key] !== null) {
                      updateImageField(obj[key], url);
                    }
                  });
                }
              }
              
              updateImageField(jsonContent, imageUrl);
              
              // 更新textarea和JSON编辑器
              const updatedJsonString = JSON.stringify(jsonContent, null, 2);
              textarea.value = updatedJsonString;
              
              // 更新JSON编辑器显示
              if (typeof jsonEditorInstance !== 'undefined' && jsonEditorInstance) {
                try {
                  jsonEditorInstance.set(jsonContent);
                  if (typeof showToast === 'function') {
                    showToast('所有 image 字段已更新', 'success');
                  }
                } catch (e) {
                  console.warn('更新JSON编辑器失败:', e);
                  if (typeof showToast === 'function') {
                    showToast('image 字段已更新，请检查JSON编辑器', 'success');
                  }
                }
              } else {
                if (typeof showToast === 'function') {
                  showToast('image 字段已更新', 'success');
                }
              }
            }
          }
        } catch (e) {
          // JSON格式无效，不提示插入
          console.warn('JSON格式无效，跳过自动插入:', e);
        }
      }
      
    } else {
      throw new Error(data.message || '上传失败');
    }
  } catch (error) {
    console.error('上传图片失败:', error);
    if (statusDiv) {
      statusDiv.className = 'mt-2 text-sm text-red-600';
      statusDiv.textContent = '上传失败: ' + (error.message || '未知错误');
    }
    if (typeof showToast === 'function') {
      showToast('上传图片失败: ' + (error.message || '未知错误'), 'error');
    } else {
      alert('上传图片失败: ' + (error.message || '未知错误'));
    }
  }
};

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
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      // JSON解析失败
      const error = new Error(`Failed to parse response: ${jsonError.message}`);
      error.response = response;
      throw error;
    }
    
    // 如果响应状态不是2xx，抛出错误
    if (!response.ok) {
      const error = new Error(data?.message || `Request failed with status ${response.status}`);
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

// 显示危险确认对话框（醒目的样式和大字）
function showDangerConfirmDialog(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
  return new Promise((resolve) => {
    const dialog = document.getElementById('dangerConfirmDialog');
    const titleEl = document.getElementById('dangerConfirmDialogTitle');
    const messageEl = document.getElementById('dangerConfirmDialogMessage');
    const confirmBtn = document.getElementById('dangerConfirmDialogConfirm');
    const cancelBtn = document.getElementById('dangerConfirmDialogCancel');

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
let securityAlertPollInterval = null;

const securityAlertsFilterState = {
  hours: 24,
  limit: 200,
  unreadOnly: false
};

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
  
  // 使用事件委托绑定自定义API图片上传按钮（在文档级别，确保始终有效）
  // 使用capture阶段捕获事件，确保在其他处理器之前执行
  document.addEventListener('click', async (e) => {
    // 检查是否点击了上传按钮或其内部元素
    const uploadBtn = e.target.closest('#apiImageUploadBtn');
    if (uploadBtn) {
      console.log('检测到上传按钮点击事件', {
        target: e.target,
        currentTarget: e.currentTarget,
        uploadBtn: uploadBtn,
        hasFunction: typeof window.uploadApiImage === 'function',
        eventPhase: e.eventPhase
      });
      
      // 阻止事件冒泡，防止触发模态框的关闭事件
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      console.log('准备调用 uploadApiImage 函数');
      
      if (typeof window.uploadApiImage === 'function') {
        try {
          await window.uploadApiImage();
          console.log('uploadApiImage 调用完成');
        } catch (error) {
          console.error('uploadApiImage 调用出错:', error);
          showToast('上传失败: ' + error.message, 'error');
        }
      } else {
        console.error('uploadApiImage 函数未定义', {
          windowUploadApiImage: typeof window.uploadApiImage,
          uploadApiImage: typeof uploadApiImage
        });
        showToast('上传功能未初始化，请刷新页面', 'error');
      }
      return false; // 额外确保阻止默认行为
    }
  }, true); // 使用capture阶段，在其他事件处理器之前执行
});

// 检查认证状态
// Session过期检查定时器
let sessionCheckInterval = null;
// Session刷新定时器（rolling session）
let sessionRefreshInterval = null;

async function checkAuth() {
  try {
    // adminApiRequest 已经返回解析后的 JSON 数据，不是 response 对象
    // 它返回的是 { success: true, admin: {...} } 或抛出错误
    const data = await adminApiRequest(`${API_BASE}/auth/admin/me`, {
      method: 'GET'
    });
    
    // 检查返回的数据是否成功
    if (data && data.success && data.admin) {
      currentAdmin = data.admin;
      
      // 检查是否有重定向参数（从博客管理页面跳转过来的）
      const urlParams = new URLSearchParams(window.location.search);
      const redirectUrl = urlParams.get('redirect');
      
      if (redirectUrl) {
        // 如果有重定向参数，跳转到指定页面
        console.log('检测到 redirect 参数，准备跳转到:', redirectUrl);
        // 使用 setTimeout 确保页面完全加载后再跳转
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 100);
        return;
      }
      
      showMainPage();
      // 根据admin状态显示/隐藏Developer菜单
      updateDeveloperMenuVisibility();
      
      // 启动session过期检查和刷新
      startSessionCheck();
      startSessionRefresh();
      // 认证成功后重新加载设置（使用管理员权限）
      loadSettings();
    } else {
      // 数据格式不正确，显示登录页
      showLoginPage();
      // 停止session检查和刷新
      stopSessionCheck();
      stopSessionRefresh();
    }
  } catch (error) {
    // 401错误已经在adminApiRequest中处理了（会跳转到登录页并显示提示）
    // 这里只处理其他错误，避免重复跳转
    if (!error.message || !error.message.includes('Unauthorized')) {
      console.error('认证检查失败:', error);
      // 只有非401错误才在这里显示登录页
      showLoginPage();
      stopSessionCheck();
      stopSessionRefresh();
    }
    // 如果是401错误，adminApiRequest已经处理了跳转，这里不需要再处理
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
      
      // 检查是否有重定向参数（从博客管理页面跳转过来的）
      const urlParams = new URLSearchParams(window.location.search);
      const redirectUrl = urlParams.get('redirect');
      
      if (redirectUrl) {
        // 如果有重定向参数，跳转到指定页面
        console.log('登录成功，检测到 redirect 参数，准备跳转到:', redirectUrl);
        // 使用 setTimeout 确保页面完全加载后再跳转
        setTimeout(() => {
          window.location.href = redirectUrl;
        }, 100);
        return;
      }
      
      showMainPage();
      updateDeveloperMenuVisibility();
      // 启动session检查
      startSessionCheck();
      // 登录成功后重新加载设置（使用管理员权限）
      loadSettings();
      
      // 立即请求音频权限（用户刚刚点击了登录按钮，这是一个用户交互）
      // 延迟一小段时间确保页面已加载
      setTimeout(() => {
        try {
          requestAudioPermission();
        } catch (error) {
          console.log('请求音频权限失败（不影响功能）:', error);
        }
      }, 100);
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
  // 停止订单通知（非侵入式）
  try {
    stopOrderNotification();
  } catch (error) {
    // 停止通知失败不影响登出
    console.log('停止订单通知失败（不影响功能）:', error);
  }
  
  try {
    // 停止session检查和刷新
    stopSessionCheck();
    stopSessionRefresh();
    stopSecurityAlertsPolling();
    
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
  stopSecurityAlertsPolling();
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
  refreshSecurityAlertsCount();
  startSecurityAlertsPolling();
  
  // 启动订单通知（非侵入式，失败不影响其他功能）
  // 延迟启动，确保页面已完全加载
  setTimeout(() => {
    try {
      startOrderNotification();
    } catch (error) {
      // 通知启动失败不影响登录和页面加载
      console.error('启动订单通知失败（不影响功能）:', error);
    }
  }, 1000);
}

// 切换标签
let currentTab = 'dashboard'; // 当前激活的标签

function setActiveSidebarItem(tabName, triggerElement) {
  // 优先使用触发元素（侧边栏点击）
  if (triggerElement && triggerElement.classList && triggerElement.classList.contains('sidebar-item')) {
    triggerElement.classList.add('active');
    return;
  }

  // 回退：根据 onclick 文本定位对应侧边栏项
  const sidebarItems = document.querySelectorAll('.sidebar-item');
  sidebarItems.forEach((item) => {
    const onclickCode = item.getAttribute('onclick') || '';
    if (onclickCode.includes(`switchTab('${tabName}')`)) {
      item.classList.add('active');
    }
  });
}

function switchTab(tabName, triggerElement = null) {
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
  const eventTarget = typeof event !== 'undefined' && event ? event.target : null;
  setActiveSidebarItem(tabName, triggerElement || eventTarget);
  
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
    case 'dine-in-qr':
      loadDineInQRCodeHistory();
      break;
    case 'showcase-images':
      loadShowcaseImages();
      break;
    case 'delivery-addresses':
      loadDeliveryAddresses();
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
    case 'security-alerts':
      loadSecurityAlerts();
      break;
    case 'api-management':
      loadApiManagement();
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

function openSecurityAlertsTab() {
  switchTab('security-alerts');
}

async function refreshSecurityAlertsCount() {
  const countEl = document.getElementById('securityAlertsCount');
  const buttonEl = document.getElementById('securityAlertsButton');
  const dotEl = document.getElementById('securityAlertsDot');
  if (!countEl || !currentAdmin) return;

  try {
    const params = new URLSearchParams({
      hours: String(securityAlertsFilterState.hours),
      limit: '1',
      sync: 'true'
    });
    const data = await adminApiRequest(`${API_BASE}/admin/security/alerts/high-risk?${params.toString()}`);
    if (data && data.success && data.summary) {
      const unread = Number(data.summary.unread || 0);
      countEl.textContent = String(unread);
      updateSecurityAlertButtonStyle(unread, buttonEl, dotEl);
    }
  } catch (error) {
    console.error('刷新高危告警数量失败:', error);
  }
}

function updateSecurityAlertButtonStyle(unread, buttonEl, dotEl) {
  if (!buttonEl) return;

  buttonEl.classList.remove('bg-gray-100', 'text-gray-700', 'hover:bg-gray-200');
  buttonEl.classList.remove('bg-yellow-50', 'text-yellow-700', 'hover:bg-yellow-100');
  buttonEl.classList.remove('bg-red-50', 'text-red-700', 'hover:bg-red-100');

  if (unread >= 20) {
    buttonEl.classList.add('bg-red-50', 'text-red-700', 'hover:bg-red-100');
  } else if (unread >= 5) {
    buttonEl.classList.add('bg-yellow-50', 'text-yellow-700', 'hover:bg-yellow-100');
  } else {
    buttonEl.classList.add('bg-gray-100', 'text-gray-700', 'hover:bg-gray-200');
  }

  if (dotEl) {
    if (unread > 0) {
      dotEl.classList.remove('hidden');
    } else {
      dotEl.classList.add('hidden');
    }
  }
}

function startSecurityAlertsPolling() {
  stopSecurityAlertsPolling();
  refreshSecurityAlertsCount();
  securityAlertPollInterval = setInterval(() => {
    refreshSecurityAlertsCount();
  }, 60000);
}

function stopSecurityAlertsPolling() {
  if (securityAlertPollInterval) {
    clearInterval(securityAlertPollInterval);
    securityAlertPollInterval = null;
  }
}

// 加载仪表盘
async function loadDashboard() {
  try {
    const data = await adminApiRequest(`${API_BASE}/admin/orders/statistics`);
    
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
                  Confirm All Orders Payment Received
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
  const confirmed = await showDangerConfirmDialog(
    '⚠️ Confirm All Orders Payment Received',
    'Have you confirmed that you have received payment from everyone?\n\nUnpaid orders will be automatically cancelled after confirmation!',
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
    // 只在非401错误时打印日志（401是正常的未登录状态）
    if (response.status !== 401) {
      console.log('管理员设置获取失败，尝试获取公开设置...');
    }
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
  
  // 如果是要关闭订单，显示危险确认提示
  if (newStatus === 'false') {
    const confirmed = await showDangerConfirmDialog(
      '⚠️ Confirm Close Ordering',
      'Are you sure everyone has finished placing orders?',
      'Confirm Close',
      'Cancel'
    );
    
    if (!confirmed) {
      return;
    }
  }
  
  try {
    const data = await adminApiRequest(`${API_BASE}/admin/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordering_open: newStatus })
    });
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
    const data = await adminApiRequest(`${API_BASE}/admin/cycles`);
    
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

// 当前订单列表（用于打印等功能）
let currentOrdersList = [];

// 加载订单列表
async function loadOrders() {
  try {
    const status = document.getElementById('orderStatusFilter')?.value || '';
    const cycleId = document.getElementById('orderCycleFilter')?.value || '';
    
    // 更新过滤状态
    ordersFilterState.status = status;
    ordersFilterState.cycleId = cycleId;
    
    // 构建查询参数
    const params = new URLSearchParams({
      page: ordersFilterState.page.toString(),
      limit: ordersFilterState.limit.toString()
    });
    
    if (status) params.append('status', status);
    if (cycleId) params.append('cycle_id', cycleId);
    
    const data = await adminApiRequest(`${API_BASE}/admin/orders?${params.toString()}`);
    
    if (data.success) {
      // 保存当前订单列表
      currentOrdersList = data.orders || [];
      renderOrders(data.orders, data.pagination);
      // 更新分页状态
      if (data.pagination) {
        ordersFilterState.page = data.pagination.page;
      }
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
    
    // 使用 <a> 标签下载，避免页面跳转
    const link = document.createElement('a');
    link.href = url;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Failed to export orders:', error);
    showToast('Export failed', 'error');
  }
}

// 渲染订单列表
function renderOrders(orders, pagination) {
  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;
  
  if (orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="px-6 py-4 text-center text-gray-500">No orders</td></tr>';
    // 清空分页
    const paginationContainer = document.getElementById('ordersPagination');
    if (paginationContainer) {
      paginationContainer.innerHTML = '';
    }
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
          ${order.order_type === 'dine_in' ? `
            <div class="mt-2 p-2 bg-blue-50 rounded text-xs border border-blue-200">
              <div class="text-blue-700 font-semibold mb-1">🍽️ Dine-In:</div>
              ${order.table_number ? `<div class="text-blue-900 font-medium">Table: ${order.table_number}</div>` : ''}
            </div>
          ` : ''}
          ${order.delivery_address ? `
            <div class="mt-2 p-2 bg-green-50 rounded text-xs border border-green-200">
              <div class="text-green-700 font-semibold mb-1">📍 Delivery Address:</div>
              <div class="text-green-900 font-medium">${order.delivery_address.name}</div>
              ${order.delivery_address.description ? `<div class="text-green-700 mt-1">${order.delivery_address.description}</div>` : ''}
            </div>
          ` : ''}
          ${!order.delivery_address && order.order_type !== 'dine_in' ? `
            <div class="mt-2 p-2 bg-green-50 rounded text-xs border border-green-200">
              <div class="text-green-700 font-semibold mb-1">🚚 Delivery</div>
            </div>
          ` : ''}
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
          <div class="space-y-1">
            <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusColors[order.status]}">
              ${statusText[order.status]}
            </span>
            ${order.payment_method === 'stripe' && order.status === 'paid' && !order.payment_image ? `
              <div class="mt-1">
                <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                  💳 Online Payment
                </span>
              </div>
            ` : ''}
          </div>
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
          <br>
          <button onclick="printOrderReceiptById('${order.id}')" 
                  class="mt-1 px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white rounded text-xs transition-colors">
            🖨️ Print Receipt
          </button>
          ${order.payment_image ? `<br><button onclick="showPaymentImageModal('${order.payment_image}')" class="mt-1 text-blue-600 hover:text-blue-800 text-xs underline">View Payment Screenshot</button>` : ''}
          ${order.payment_method === 'stripe' && order.stripe_payment_intent_id && order.status === 'paid' && !order.payment_image ? `
            <div class="mt-2 text-xs">
              <div class="text-gray-600 font-semibold">Transaction ID:</div>
              <div class="text-gray-800 font-mono text-xs break-all">${order.stripe_payment_intent_id}</div>
            </div>
          ` : ''}
        </td>
      </tr>
    `;
  }).join('');
  
  // 渲染分页控件
  if (pagination) {
    const paginationContainer = document.getElementById('ordersPagination');
    if (paginationContainer) {
      paginationContainer.innerHTML = `
        <div class="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div class="flex items-center justify-between">
            <div class="text-sm text-gray-600">
              Showing <span class="font-semibold">${(pagination.page - 1) * pagination.limit + 1}</span> to 
              <span class="font-semibold">${Math.min(pagination.page * pagination.limit, pagination.total)}</span> of 
              <span class="font-semibold">${pagination.total}</span> orders
            </div>
            
            <div class="flex items-center gap-2">
              <!-- 上一页按钮 -->
              <button 
                onclick="goToOrderPage(${pagination.page - 1})"
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
                  id="orderPageInput"
                  min="1" 
                  max="${pagination.totalPages}"
                  value="${pagination.page}"
                  class="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onkeyup="if(event.key==='Enter') goToOrderPage(parseInt(this.value))"
                />
                <span class="text-sm text-gray-600">of ${pagination.totalPages}</span>
              </div>
              
              <!-- 下一页按钮 -->
              <button 
                onclick="goToOrderPage(${pagination.page + 1})"
                ${pagination.page >= pagination.totalPages ? 'disabled' : ''}
                class="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium ${pagination.page >= pagination.totalPages ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-700 hover:bg-gray-50'} transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      `;
    }
  }
}

// 通过订单ID打印小票
function printOrderReceiptById(orderId) {
  console.log('Print receipt requested for order ID:', orderId);
  console.log('Current orders list:', currentOrdersList);
  
  const order = currentOrdersList.find(o => o.id === orderId);
  if (!order) {
    console.error('Order not found in currentOrdersList. ID:', orderId);
    showToast('Order not found. Please refresh the page.', 'error');
    return;
  }
  
  console.log('Found order for printing:', order);
  printOrderReceipt(order);
}

// 打印订单小票
async function printOrderReceipt(order) {
  try {
    // 调试：检查订单数据
    console.log('Printing order:', order);
    
    if (!order || !order.id) {
      showToast('Invalid order data', 'error');
      console.error('Order data:', order);
      return;
    }

    // 格式化日期时间
    const orderDate = new Date(order.created_at);
    const dateStr = orderDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const timeStr = orderDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    // 商品标签映射
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

    // 调试：检查订单项
    console.log('Order items:', order.items);
    
    // 构建商品列表HTML
    let itemsHtml = '';
    if (order.items && order.items.length > 0) {
      itemsHtml = order.items.map(item => {
        let toppings = [];
        try {
          if (item.toppings) {
            toppings = typeof item.toppings === 'string' ? JSON.parse(item.toppings) : item.toppings;
          }
        } catch (e) {}

        const unitPrice = item.quantity > 0 ? (item.subtotal / item.quantity) : item.product_price;
        
        // 构建规格信息
        let specs = [];
        if (item.size) specs.push(`Size: ${item.size}`);
        if (item.sugar_level) {
          const sugarLabel = sugarLabels[item.sugar_level] || `${item.sugar_level}%`;
          specs.push(`Sweetness: ${sugarLabel}`);
        }
        if (item.ice_level) {
          const iceLabel = iceLabels[item.ice_level] || item.ice_level;
          specs.push(`Ice: ${iceLabel}`);
        }
        if (toppings.length > 0) {
          const toppingNames = toppings.map(t => {
            if (typeof t === 'object' && t !== null && t.name) return t.name;
            return typeof t === 'string' ? t : String(t);
          });
          specs.push(`Toppings: ${toppingNames.join(', ')}`);
        }

        return `
          <div class="receipt-item">
            <div class="receipt-item-name">${item.product_name} × ${item.quantity}</div>
            ${specs.length > 0 ? `<div class="receipt-item-specs">${specs.join(' | ')}</div>` : ''}
            <div class="receipt-item-qty-price">
              ${formatPrice(unitPrice)} × ${item.quantity} = ${formatPrice(item.subtotal)}
            </div>
          </div>
        `;
      }).join('');
    }

    // 计算总金额
    const subtotal = order.total_amount || 0;
    const discount = order.discount_amount || 0;
    const balanceUsed = order.balance_used || 0;
    const finalAmount = order.final_amount || 0;

    // 生成小票HTML
    const receiptHtml = `
      <div class="receipt-header">
        <div class="receipt-store-name">${storeName || 'BOBA TEA'}</div>
      </div>
      
      <div class="receipt-order-info">
        <div>Order: ${order.order_number}</div>
        <div>Date: ${dateStr} ${timeStr}</div>
        ${order.cycle_number ? `<div>Cycle: ${order.cycle_number}</div>` : ''}
      </div>
      
      <div class="receipt-customer-info">
        <div>Customer: ${order.customer_name || 'Anonymous'}</div>
        <div>Phone: ${order.customer_phone || 'N/A'}</div>
        ${order.order_type === 'dine_in' && order.table_number ? `
          <div style="margin-top: 4px;">
            <div><strong>🍽️ Dine-In:</strong></div>
            <div>Table: ${order.table_number}</div>
          </div>
        ` : ''}
        ${order.delivery_address ? `
          <div style="margin-top: 4px;">
            <div><strong>📍 Delivery Address:</strong></div>
            <div>${order.delivery_address.name}</div>
            ${order.delivery_address.description ? `<div style="font-size: 11px; color: #666;">${order.delivery_address.description}</div>` : ''}
          </div>
        ` : ''}
        ${!order.delivery_address && order.order_type !== 'dine_in' ? `
          <div style="margin-top: 4px;">
            <div><strong>🚚 Delivery</strong></div>
          </div>
        ` : ''}
      </div>
      
      <div class="receipt-divider"></div>
      
      <div class="receipt-items">
        ${itemsHtml || '<div class="receipt-item">No items found</div>'}
      </div>
      
      <div class="receipt-divider"></div>
      
      <div class="receipt-totals">
        <div class="receipt-total-line">
          <span>Subtotal:</span>
          <span>${formatPrice(subtotal)}</span>
        </div>
        ${discount > 0 ? `
          <div class="receipt-total-line">
            <span>Discount:</span>
            <span>-${formatPrice(discount)}</span>
          </div>
        ` : ''}
        ${balanceUsed > 0 ? `
          <div class="receipt-total-line">
            <span>Balance Used:</span>
            <span>-${formatPrice(balanceUsed)}</span>
          </div>
        ` : ''}
        <div class="receipt-total-line receipt-total-final">
          <span>TOTAL:</span>
          <span>${formatPrice(finalAmount)}</span>
        </div>
      </div>
      
      <div class="receipt-order-info">
        <div>Status: ${order.status ? order.status.toUpperCase() : 'PENDING'}</div>
        ${order.payment_method === 'stripe' ? '<div>Payment: Online</div>' : ''}
      </div>
      
      ${order.notes ? `
        <div class="receipt-notes">
          <div><strong>Notes:</strong></div>
          <div>${order.notes.replace(/\n/g, '<br>')}</div>
        </div>
      ` : ''}
      
      <div class="receipt-footer">
        <div>Thank you for your order!</div>
      </div>
    `;

    // 尝试静默打印（QZ Tray 或 WebPrint）
    if (typeof silentPrint === 'function') {
      try {
        const printResult = await silentPrint(receiptHtml, {
          printerName: null, // 使用默认打印机，或从设置中获取
          fallbackToWindowPrint: true,
          useHtmlPrint: true
        });
        
        if (printResult.success) {
          showToast(`Printed via ${printResult.method}`, 'success');
          return; // 静默打印成功，直接返回
        }
        
        // 静默打印失败，继续使用标准打印方式
        if (printResult.requiresDialog) {
          console.log('Falling back to window.print()');
          // 继续执行下面的标准打印代码
        }
      } catch (error) {
        console.error('Silent print error:', error);
        // 继续使用标准打印方式
      }
    }
    
    // 标准打印方式（原有的代码）- 作为回退方案
    const printWindow = window.open('', '_blank', 'width=300,height=600');
    if (!printWindow) {
      showToast('Please allow popups to print receipt', 'error');
      return;
    }
    
    // 调试：检查生成的HTML
    console.log('Receipt HTML length:', receiptHtml.length);
    console.log('Items HTML:', itemsHtml);
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Receipt - ${order.order_number || 'Unknown'}</title>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Courier New', 'Consolas', monospace;
            width: 80mm;
            max-width: 80mm;
            padding: 8mm 5mm;
            background: white;
            font-size: 13px;
            line-height: 1.5;
            color: #000;
          }
          .receipt-header {
            text-align: center;
            margin-bottom: 10px;
            border-bottom: 2px dashed #000;
            padding-bottom: 8px;
          }
          .receipt-store-name {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 4px;
            letter-spacing: 0.5px;
          }
          .receipt-order-info {
            font-size: 11px;
            margin: 8px 0;
            line-height: 1.6;
          }
          .receipt-customer-info {
            font-size: 11px;
            margin: 8px 0;
            padding: 6px 0;
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            line-height: 1.6;
          }
          .receipt-items {
            margin: 10px 0;
          }
          .receipt-item {
            margin: 8px 0;
            padding-bottom: 6px;
            border-bottom: 1px dotted #666;
          }
          .receipt-item:last-child {
            border-bottom: none;
          }
          .receipt-item-name {
            font-weight: bold;
            margin-bottom: 3px;
            font-size: 13px;
          }
          .receipt-item-specs {
            font-size: 10px;
            color: #333;
            margin-left: 2px;
            margin-top: 2px;
            line-height: 1.4;
          }
          .receipt-item-qty-price {
            text-align: right;
            margin-top: 3px;
            font-size: 12px;
            font-weight: bold;
          }
          .receipt-divider {
            border-top: 1px dashed #000;
            margin: 10px 0;
            height: 0;
          }
          .receipt-totals {
            margin: 10px 0;
          }
          .receipt-total-line {
            display: flex;
            justify-content: space-between;
            margin: 5px 0;
            font-size: 12px;
          }
          .receipt-total-final {
            font-weight: bold;
            font-size: 16px;
            border-top: 2px solid #000;
            padding-top: 6px;
            margin-top: 6px;
          }
          .receipt-notes {
            margin: 10px 0;
            padding: 8px 0;
            border-top: 1px dashed #000;
            border-bottom: 1px dashed #000;
            font-size: 11px;
            font-style: italic;
            line-height: 1.5;
          }
          .receipt-footer {
            text-align: center;
            margin-top: 15px;
            padding-top: 10px;
            border-top: 1px dashed #000;
            font-size: 11px;
            font-weight: bold;
          }
          @media print {
            body {
              margin: 0;
              padding: 8mm 5mm;
            }
            @page {
              size: 80mm auto;
              margin: 0;
            }
          }
        </style>
      </head>
      <body>
        ${receiptHtml}
        <script>
          // 页面加载后立即打印（业界标准做法：自动打开打印对话框）
          (function() {
            function doPrint() {
              try {
                window.print();
                // 打印对话框关闭后关闭窗口
                // 注意：Chrome等浏览器会阻止自动关闭，但用户关闭打印对话框后窗口会自动关闭
                window.onfocus = function() {
                  setTimeout(function() {
                    window.close();
                  }, 100);
                };
              } catch(e) {
                console.error('Print error:', e);
              }
            }
            
            // 确保DOM完全加载后再打印
            if (document.readyState === 'complete') {
              setTimeout(doPrint, 100);
            } else {
              window.addEventListener('load', function() {
                setTimeout(doPrint, 100);
              });
            }
          })();
        </script>
      </body>
      </html>
    `);
    
    printWindow.document.close();
    
  } catch (error) {
    console.error('Print receipt error:', error);
    showToast('Failed to print receipt: ' + error.message, 'error');
  }
}

// 更新订单状态
async function updateOrderStatus(orderId, newStatus) {
  if (!newStatus) return;
  
  try {
    const data = await adminApiRequest(`${API_BASE}/admin/orders/${orderId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
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
    const data = await adminApiRequest(`${API_BASE}/admin/products`);
    
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
        <button onclick="showProductModal(null, 'drink')" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          + Add Drink
        </button>
        <button onclick="showProductModal(null, 'regular')" class="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">
          + Add Regular Product
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
          
          <div id="sizesSection">
            <label class="block text-sm font-medium text-gray-700 mb-2">Cup Sizes & Prices</label>
            <div id="sizesContainer" class="space-y-2 border border-gray-300 rounded-lg p-4 bg-gray-50">
              <div class="text-sm text-gray-600 mb-2">Add different cup sizes and their prices (e.g., Medium, Large)</div>
              <div id="sizesList" class="space-y-2"></div>
              <button type="button" onclick="addSizeRow()" class="text-sm text-blue-600 hover:text-blue-800 font-medium">
                + Add Size
              </button>
            </div>
          </div>
          
          <div id="sugarLevelsSection">
            <label class="block text-sm font-medium text-gray-700 mb-2">Sweetness Options</label>
            <div id="sugarLevelsContainer" class="space-y-2 border border-gray-300 rounded-lg p-4 bg-gray-50">
              <div class="text-sm text-gray-600 mb-2">Add sweetness levels (e.g., 0%, 30%, 50%, 70%, 100%)</div>
              <div id="sugarLevelsList" class="space-y-2"></div>
              <button type="button" onclick="addSugarLevelRow()" class="text-sm text-blue-600 hover:text-blue-800 font-medium">
                + Add Sweetness Level
              </button>
            </div>
          </div>
          
          <div id="toppingsSection">
            <label class="block text-sm font-medium text-gray-700 mb-2">Available Toppings</label>
            <div id="toppingsContainer" class="space-y-2 border border-gray-300 rounded-lg p-4 bg-gray-50">
              <div class="text-sm text-gray-600 mb-2">Add topping names and prices (e.g., Cheese 芝士: 20 LE, Boba 波霸: 20 LE)</div>
              <div id="toppingsList" class="space-y-2"></div>
              <button type="button" onclick="addToppingRow()" class="text-sm text-blue-600 hover:text-blue-800 font-medium">
                + Add Topping
              </button>
            </div>
          </div>
          
          <div id="iceOptionsSection">
            <label class="block text-sm font-medium text-gray-700 mb-2">Available Ice Options</label>
            <div id="iceOptionsContainer" class="border border-gray-300 rounded-lg p-4 bg-gray-50">
              <div class="text-sm text-gray-600 mb-2">Select which ice level options are available for this product</div>
              <div id="iceOptionsList" class="space-y-2">
                <label class="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" class="ice-option-checkbox" value="normal" checked>
                  <span class="text-sm text-gray-700">Normal Ice</span>
                </label>
                <label class="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" class="ice-option-checkbox" value="less" checked>
                  <span class="text-sm text-gray-700">Less Ice</span>
                </label>
                <label class="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" class="ice-option-checkbox" value="no" checked>
                  <span class="text-sm text-gray-700">No Ice</span>
                </label>
                <label class="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" class="ice-option-checkbox" value="room" checked>
                  <span class="text-sm text-gray-700">Room Temperature</span>
                </label>
                <label class="flex items-center space-x-2 cursor-pointer">
                  <input type="checkbox" class="ice-option-checkbox" value="hot" checked>
                  <span class="text-sm text-gray-700">Hot</span>
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
// productType: 'drink' for drinks (with attributes), 'regular' for regular products (no attributes)
async function showProductModal(product = null, productType = 'drink') {
  // 加载分类列表
  try {
    const data = await adminApiRequest(`${API_BASE}/admin/categories`);
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
  
  // 获取属性配置区域的容器（使用section级别的ID）
  const sizesSection = document.getElementById('sizesSection');
  const sugarLevelsSection = document.getElementById('sugarLevelsSection');
  const toppingsSection = document.getElementById('toppingsSection');
  const iceOptionsSection = document.getElementById('iceOptionsSection');
  
  // 如果是编辑模式，根据商品现有配置判断类型
  let isRegularProduct = false;
  if (product) {
    // 检查商品是否有任何属性配置
    try {
      const sizes = JSON.parse(product.sizes || '{}');
      const sugarLevels = JSON.parse(product.sugar_levels || '[]');
      const toppings = JSON.parse(product.available_toppings || '[]');
      const iceOptions = JSON.parse(product.ice_options || '[]');
      
      const hasSizes = Object.keys(sizes).length > 0;
      const hasSugarLevels = Array.isArray(sugarLevels) && sugarLevels.length > 0;
      const hasToppings = Array.isArray(toppings) && toppings.length > 0;
      const hasIceOptions = Array.isArray(iceOptions) && iceOptions.length > 0;
      
      // 如果没有任何属性配置，认为是普通商品
      isRegularProduct = !hasSizes && !hasSugarLevels && !hasToppings && !hasIceOptions;
    } catch (e) {
      // 解析失败，认为是普通商品
      isRegularProduct = true;
    }
  } else {
    // 新建模式，根据 productType 参数判断
    isRegularProduct = productType === 'regular';
  }
  
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
    loadSugarLevels(product.sugar_levels || '[]');
    
    // 加载可选加料 - 改为可编辑形式（类似甜度选项），完全独立，不依赖任何产品
    await loadAvailableToppings(product.available_toppings || '[]');
    
    // 加载冰度选项
    loadIceOptions(product.ice_options || '[]');
    
    if (product.image_url) {
      document.getElementById('currentImage').innerHTML = 
        `<img src="${product.image_url}" class="w-32 h-32 object-cover rounded-lg">`;
    }
    
    // 编辑模式：根据商品类型显示/隐藏属性配置区域（在加载属性之后）
    if (isRegularProduct) {
      // 隐藏所有属性配置区域
      if (sizesSection) sizesSection.style.display = 'none';
      if (sugarLevelsSection) sugarLevelsSection.style.display = 'none';
      if (toppingsSection) toppingsSection.style.display = 'none';
      if (iceOptionsSection) iceOptionsSection.style.display = 'none';
    } else {
      // 显示所有属性配置区域
      if (sizesSection) sizesSection.style.display = 'block';
      if (sugarLevelsSection) sugarLevelsSection.style.display = 'block';
      if (toppingsSection) toppingsSection.style.display = 'block';
      if (iceOptionsSection) iceOptionsSection.style.display = 'block';
    }
  } else {
    // 新建模式：根据商品类型设置标题和属性配置
    if (isRegularProduct) {
      title.textContent = 'Add Regular Product';
      // 隐藏所有属性配置区域
      if (sizesSection) sizesSection.style.display = 'none';
      if (sugarLevelsSection) sugarLevelsSection.style.display = 'none';
      if (toppingsSection) toppingsSection.style.display = 'none';
      if (iceOptionsSection) iceOptionsSection.style.display = 'none';
      
      // 清空所有属性配置
      document.getElementById('sizesList').innerHTML = '';
      document.getElementById('sugarLevelsList').innerHTML = '';
      document.getElementById('toppingsList').innerHTML = '';
      // 取消所有冰度选项
      const iceCheckboxes = document.querySelectorAll('.ice-option-checkbox');
      iceCheckboxes.forEach(cb => cb.checked = false);
      // 加载空甜度选项
      loadSugarLevels('[]');
    } else {
      title.textContent = 'Add Drink';
      // 显示所有属性配置区域
      if (sizesSection) sizesSection.style.display = 'block';
      if (sugarLevelsSection) sugarLevelsSection.style.display = 'block';
      if (toppingsSection) toppingsSection.style.display = 'block';
      if (iceOptionsSection) iceOptionsSection.style.display = 'block';
      
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
      // 加载空甜度选项（不再默认）
      loadSugarLevels('[]');
    }
  }
  
  // 编辑模式：根据商品类型显示/隐藏属性配置区域
  if (product) {
    if (isRegularProduct) {
      // 隐藏所有属性配置区域
      if (sizesSection) sizesSection.style.display = 'none';
      if (sugarLevelsSection) sugarLevelsSection.style.display = 'none';
      if (toppingsSection) toppingsSection.style.display = 'none';
      if (iceOptionsSection) iceOptionsSection.style.display = 'none';
    } else {
      // 显示所有属性配置区域
      if (sizesSection) sizesSection.style.display = 'block';
      if (sugarLevelsSection) sugarLevelsSection.style.display = 'block';
      if (toppingsSection) toppingsSection.style.display = 'block';
      if (iceOptionsSection) iceOptionsSection.style.display = 'block';
    }
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
  
  let sugarLevels = [];
  try {
    sugarLevels = typeof sugarLevelsJson === 'string' ? JSON.parse(sugarLevelsJson || '[]') : (sugarLevelsJson || []);
    if (!Array.isArray(sugarLevels)) {
      sugarLevels = [];
    }
    
    if (sugarLevels.length > 0) {
      sugarLevels.forEach(level => {
        addSugarLevelRow(level);
      });
    }
  } catch (e) {
    console.error('Failed to parse sugar_levels:', e);
    sugarLevels = [];
  }
  
  // 如果为空数组，显示提示信息
  if (sugarLevels.length === 0) {
    sugarLevelsList.innerHTML += `
      <div class="text-sm text-gray-500 italic p-2 bg-gray-50 rounded mb-2">
        No sugar levels configured. This product will not show sweetness options to customers.
      </div>
    `;
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
  
  // 检查是否为空数组，显示提示信息
  let finalIceOptions = [];
  try {
    finalIceOptions = typeof iceOptionsJson === 'string' ? JSON.parse(iceOptionsJson || '[]') : (iceOptionsJson || []);
    if (!Array.isArray(finalIceOptions)) {
      finalIceOptions = [];
    }
  } catch (e) {
    finalIceOptions = [];
  }
  
  if (finalIceOptions.length === 0) {
    iceOptionsList.innerHTML += `
      <div class="text-sm text-gray-500 italic p-2 bg-gray-50 rounded mb-2">
        No ice options configured. This product will not show ice options to customers.
      </div>
    `;
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
  
  // 检查是否是普通商品（属性配置区域被隐藏）
  const sizesSection = document.getElementById('sizesSection');
  const isRegularProduct = sizesSection && sizesSection.style.display === 'none';
  
  if (isRegularProduct) {
    // 普通商品：所有属性设置为空数组/空对象
    formData.append('sizes', '{}');
    formData.append('sugar_levels', '[]');
    formData.append('available_toppings', '[]');
    formData.append('ice_options', '[]');
    console.log('Saving regular product with empty attributes');
  } else {
    // 饮品商品：收集属性配置
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
  }
  
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
    const data = await adminApiRequest(`${API_BASE}/admin/products/${id}`, {
      method: 'DELETE'
    });
    
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
    const data = await adminApiRequest(`${API_BASE}/admin/categories`);
    
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
    
    const result = await adminApiRequest(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
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
    const data = await adminApiRequest(`${API_BASE}/admin/categories/${id}`, {
      method: 'DELETE'
    });
    
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
    const data = await adminApiRequest(`${API_BASE}/admin/discount-rules`);
    
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
  const data = await adminApiRequest(`${API_BASE}/admin/discount-rules`);
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
    const result = await adminApiRequest(`${API_BASE}/admin/discount-rules/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules })
    });
    
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
  const data = await adminApiRequest(`${API_BASE}/admin/discount-rules`);
  let rules = data.success ? data.rules.filter(r => r.id != id) : [];
  
  try {
    const result = await adminApiRequest(`${API_BASE}/admin/discount-rules/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules })
    });
    
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

// 加载配送地址管理
async function loadDeliveryAddresses() {
  const container = document.getElementById('delivery-addressesTab');
  
  try {
    // 暂时使用占位API路径，等后端实现后再调整
    const data = await adminApiRequest(`${API_BASE}/admin/delivery-addresses`);
    
    if (data.success) {
      const addresses = data.addresses || [];
      
      container.innerHTML = `
        <div class="fade-in">
          <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-gray-900">Delivery Addresses</h2>
            <button onclick="showDeliveryAddressModal()" class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              + Add Delivery Address
            </button>
          </div>
          
          <div class="bg-white rounded-xl shadow-sm overflow-hidden">
            <div class="p-6">
              <p class="text-sm text-gray-600 mb-4">Configure delivery addresses that users can select when placing orders. Only active addresses will be shown to users.</p>
              
              <div id="deliveryAddressesList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${addresses.length === 0 ? 
                  '<div class="col-span-full text-center py-8 text-gray-500">No delivery addresses. Click "Add Delivery Address" to create one.</div>' :
                  addresses.map(address => `
                    <div class="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div class="flex justify-between items-start mb-3">
                        <div class="flex-1">
                          <h3 class="text-lg font-semibold text-gray-900">${escapeHtml(address.name || 'Unnamed')}</h3>
                          ${address.description ? `<p class="text-sm text-gray-600 mt-1">${escapeHtml(address.description)}</p>` : ''}
                        </div>
                        <span class="px-2 py-1 text-xs rounded-full ${address.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                          ${address.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div class="text-xs text-gray-500 mb-3">
                        Sort Order: ${address.sort_order || 0}
                      </div>
                      <div class="flex space-x-2">
                        <button onclick='showDeliveryAddressModal(${JSON.stringify(address).replace(/'/g, "&apos;")})' 
                                class="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                          Edit
                        </button>
                        <button onclick='deleteDeliveryAddress(${address.id})' 
                                class="flex-1 px-3 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">
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
        
        <!-- 配送地址编辑模态框 -->
        <div id="deliveryAddressModal" class="modal">
          <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-8">
            <h3 id="deliveryAddressModalTitle" class="text-2xl font-bold text-gray-900 mb-6">Add Delivery Address</h3>
            <form id="deliveryAddressForm" class="space-y-4">
              <input type="hidden" id="deliveryAddressId">
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Address Name *</label>
                <input type="text" id="deliveryAddressName" required 
                       class="w-full px-4 py-2 border border-gray-300 rounded-lg" 
                       placeholder="e.g., Downtown, Campus, etc.">
                <p class="text-xs text-gray-500 mt-1">A short name to identify this delivery location</p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea id="deliveryAddressDescription" rows="3" 
                          class="w-full px-4 py-2 border border-gray-300 rounded-lg" 
                          placeholder="e.g., Detailed address, landmarks, etc."></textarea>
                <p class="text-xs text-gray-500 mt-1">Optional: More details about this delivery location</p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Sort Order</label>
                <input type="number" id="deliveryAddressSortOrder" value="0" step="1" min="0"
                       class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                <p class="text-xs text-gray-500 mt-1">Lower numbers appear first in the list</p>
              </div>
              
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select id="deliveryAddressStatus" class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <p class="text-xs text-gray-500 mt-1">Only active addresses will be shown to users</p>
              </div>
              
              <div class="flex space-x-3 mt-6">
                <button type="submit" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg">
                  Save
                </button>
                <button type="button" onclick="closeDeliveryAddressModal()" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-3 rounded-lg">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      `;
      
      // 设置表单提交事件
      document.getElementById('deliveryAddressForm')?.addEventListener('submit', saveDeliveryAddress);
    } else {
      container.innerHTML = '<div class="text-center py-12 text-red-500">Load failed</div>';
    }
  } catch (error) {
    console.error('加载配送地址失败:', error);
    container.innerHTML = `
      <div class="text-center py-12">
        <div class="text-red-500 mb-2">加载失败</div>
        <div class="text-sm text-gray-500">请检查后端API是否已实现</div>
      </div>
    `;
  }
}

// 显示配送地址模态框
function showDeliveryAddressModal(address = null) {
  const modal = document.getElementById('deliveryAddressModal');
  const title = document.getElementById('deliveryAddressModalTitle');
  
  if (!modal) {
    console.error('Delivery address modal not found');
    return;
  }
  
  if (address) {
    title.textContent = 'Edit Delivery Address';
    document.getElementById('deliveryAddressId').value = address.id;
    document.getElementById('deliveryAddressName').value = address.name || '';
    document.getElementById('deliveryAddressDescription').value = address.description || '';
    document.getElementById('deliveryAddressSortOrder').value = address.sort_order || 0;
    document.getElementById('deliveryAddressStatus').value = address.status || 'active';
  } else {
    title.textContent = 'Add Delivery Address';
    document.getElementById('deliveryAddressForm').reset();
    document.getElementById('deliveryAddressId').value = '';
    document.getElementById('deliveryAddressStatus').value = 'active';
    document.getElementById('deliveryAddressSortOrder').value = 0;
  }
  
  modal.classList.add('active');
  modal.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// 关闭配送地址模态框
function closeDeliveryAddressModal() {
  const modal = document.getElementById('deliveryAddressModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// 保存配送地址
async function saveDeliveryAddress(e) {
  e.preventDefault();
  
  const id = document.getElementById('deliveryAddressId').value;
  const addressData = {
    name: document.getElementById('deliveryAddressName').value.trim(),
    description: document.getElementById('deliveryAddressDescription').value.trim(),
    sort_order: parseInt(document.getElementById('deliveryAddressSortOrder').value) || 0,
    status: document.getElementById('deliveryAddressStatus').value
  };
  
  if (!addressData.name) {
    showToast('Address name is required', 'warning');
    return;
  }
  
  try {
    const url = id ? `${API_BASE}/admin/delivery-addresses/${id}` : `${API_BASE}/admin/delivery-addresses`;
    const method = id ? 'PUT' : 'POST';
    
    const result = await adminApiRequest(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addressData)
    });
    
    if (result.success) {
      showToast(id ? 'Delivery address updated successfully' : 'Delivery address added successfully', 'success');
      closeDeliveryAddressModal();
      loadDeliveryAddresses();
    } else {
      showToast(result.message || 'Operation failed', 'error');
    }
  } catch (error) {
    console.error('Failed to save delivery address:', error);
    showToast(error.data?.message || 'Operation failed', 'error');
  }
}

// 删除配送地址
async function deleteDeliveryAddress(id) {
  const confirmed = await showConfirmDialog(
    'Delete Delivery Address',
    'Are you sure you want to delete this delivery address? This action cannot be undone. If any orders use this address, deletion will fail.',
    'Delete',
    'Cancel'
  );
  
  if (!confirmed) return;
  
  try {
    const data = await adminApiRequest(`${API_BASE}/admin/delivery-addresses/${id}`, {
      method: 'DELETE'
    });
    
    if (data.success) {
      showToast('Delivery address deleted successfully', 'success');
      loadDeliveryAddresses();
    } else {
      showToast(data.message || 'Delete failed', 'error');
    }
  } catch (error) {
    console.error('Failed to delete delivery address:', error);
    showToast(error.data?.message || 'Delete failed', 'error');
  }
}

// 转义HTML（防止XSS）
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== 现场扫码点单 ====================

// 存储当前二维码信息
let currentQRCodeData = null;

// 生成桌号二维码
async function generateDineInQRCode() {
  const tableNumberInput = document.getElementById('tableNumberInput');
  const qrCodeDisplayArea = document.getElementById('qrCodeDisplayArea');
  const qrCodeContainer = document.getElementById('qrCodeContainer');
  const displayTableNumber = document.getElementById('displayTableNumber');
  
  if (!tableNumberInput || !qrCodeDisplayArea || !qrCodeContainer) {
    showToast('Page elements not found', 'error');
    return;
  }
  
  const tableNumber = tableNumberInput.value.trim();
  
  if (!tableNumber) {
    showToast('Please enter table number', 'error');
    return;
  }
  
  try {
    // 调用后端API生成二维码URL
    const data = await adminApiRequest(`${API_BASE}/admin/dine-in/qr-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table_number: tableNumber })
    });
    
    if (!data.success) {
      showToast(data.message || 'Failed to generate QR code', 'error');
      return;
    }
    
    // 保存二维码数据
    currentQRCodeData = {
      tableNumber: tableNumber,
      qrCodeUrl: data.qr_code_url
    };
    
    // 清空容器
    qrCodeContainer.innerHTML = '';
    
    // 等待二维码库加载（最多等待5秒）
    let attempts = 0;
    const maxAttempts = 50; // 50次 * 100ms = 5秒
    
    const tryGenerateQR = () => {
      attempts++;
      
      // 检查库是否已加载
      if (typeof QRCode !== 'undefined' && typeof QRCode === 'function') {
        try {
          // qrcodejs库：new QRCode(element, options)
          // 它会直接在element中生成canvas
          new QRCode(qrCodeContainer, {
            text: data.qr_code_url,
            width: 256,
            height: 256,
            colorDark: '#000000',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
          });
          
          // 显示桌号
          displayTableNumber.textContent = tableNumber;
          
          // 显示二维码区域
          qrCodeDisplayArea.classList.remove('hidden');
          
          showToast('QR code generated successfully', 'success');
          
          // 刷新历史列表
          loadDineInQRCodeHistory();
          
          return true; // 成功生成
        } catch (qrError) {
          console.error('Failed to generate QR code:', qrError);
          showToast('Failed to generate QR code: ' + (qrError.message || 'Unknown error'), 'error');
          qrCodeContainer.innerHTML = '<p class="text-red-500 text-sm">Failed to generate QR code: ' + (qrError.message || 'Unknown error') + '</p>';
          return false;
        }
      } else if (attempts < maxAttempts) {
        // 库还未加载，继续等待
        if (attempts === 1) {
          qrCodeContainer.innerHTML = '<p class="text-blue-500 text-sm">Loading QR code library, please wait...</p>';
        } else if (attempts % 10 === 0) {
          // 每1秒更新一次提示
          qrCodeContainer.innerHTML = `<p class="text-blue-500 text-sm">Loading QR code library, please wait... (${attempts * 0.1}s)</p>`;
        }
        setTimeout(tryGenerateQR, 100);
        return false;
      } else {
        // 超时，显示错误
        showToast('QR code library loading timeout, please check network connection or refresh page', 'error');
        qrCodeContainer.innerHTML = `
          <div class="text-red-500 text-sm space-y-2 p-4">
            <p class="font-semibold">QR code library loading failed</p>
            <p class="text-xs">Possible reasons:</p>
            <ul class="list-disc list-inside text-xs space-y-1 ml-2">
              <li>Network connection issue</li>
              <li>CDN service unavailable</li>
              <li>Browser blocked external script loading</li>
            </ul>
            <p class="text-xs mt-2 font-semibold">Suggestions:</p>
            <ul class="list-disc list-inside text-xs space-y-1 ml-2">
              <li>Refresh page and try again</li>
              <li>Check network connection</li>
              <li>Check browser console for errors</li>
            </ul>
          </div>
        `;
        console.error('QRCode library not loaded after', maxAttempts * 100, 'ms');
        console.error('Current QRCode type:', typeof QRCode);
        return false;
      }
    };
    
    // 开始尝试生成
    tryGenerateQR();
  } catch (error) {
    console.error('Failed to generate QR code:', error);
    showToast(error.data?.message || 'Failed to generate QR code', 'error');
  }
}

// Load QR code history
async function loadDineInQRCodeHistory() {
  const historyList = document.getElementById('qrCodeHistoryList');
  if (!historyList) return;
  
  try {
    const data = await adminApiRequest(`${API_BASE}/admin/dine-in/qr-codes`);
    
    if (data.success && data.qr_codes && data.qr_codes.length > 0) {
      historyList.innerHTML = data.qr_codes.map(qr => {
        const createdDate = new Date(qr.created_at).toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        return `
          <div class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
            <div class="flex-1">
              <div class="flex items-center space-x-3">
                <span class="font-semibold text-gray-900">Table: ${escapeHtml(qr.table_number)}</span>
                <span class="text-xs text-gray-500">Created: ${createdDate}</span>
              </div>
              <div class="mt-1">
                <a href="${escapeHtml(qr.qr_code_url)}" target="_blank" class="text-xs text-blue-600 hover:underline">
                  ${escapeHtml(qr.qr_code_url)}
                </a>
              </div>
            </div>
            <div class="flex items-center space-x-2 ml-4">
              <button 
                onclick="viewQRCodeFromHistory('${escapeHtml(qr.table_number)}', '${escapeHtml(qr.qr_code_url)}')"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors">
                📱 View QR Code
              </button>
              <button 
                onclick="deleteDineInQRCode('${escapeHtml(qr.table_number)}')"
                class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm transition-colors">
                Delete
              </button>
            </div>
          </div>
        `;
      }).join('');
    } else {
      historyList.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No QR codes generated yet</p>';
    }
  } catch (error) {
    console.error('Failed to load QR code history:', error);
    historyList.innerHTML = '<p class="text-red-500 text-sm text-center py-4">Failed to load QR code history</p>';
  }
}

// View QR code from history
async function viewQRCodeFromHistory(tableNumber, qrCodeUrl) {
  const qrCodeDisplayArea = document.getElementById('qrCodeDisplayArea');
  const qrCodeContainer = document.getElementById('qrCodeContainer');
  const displayTableNumber = document.getElementById('displayTableNumber');
  
  if (!qrCodeDisplayArea || !qrCodeContainer || !displayTableNumber) {
    showToast('Page elements not found', 'error');
    return;
  }
  
  // 保存二维码数据（用于打印和下载）
  currentQRCodeData = {
    tableNumber: tableNumber,
    qrCodeUrl: qrCodeUrl
  };
  
  // 清空容器
  qrCodeContainer.innerHTML = '';
  
  // 等待二维码库加载（最多等待5秒）
  let attempts = 0;
  const maxAttempts = 50; // 50次 * 100ms = 5秒
  
  const tryGenerateQR = () => {
    attempts++;
    
    // 检查库是否已加载
    if (typeof QRCode !== 'undefined' && typeof QRCode === 'function') {
      try {
        // qrcodejs库：new QRCode(element, options)
        new QRCode(qrCodeContainer, {
          text: qrCodeUrl,
          width: 256,
          height: 256,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.H
        });
        
        // 显示桌号
        displayTableNumber.textContent = tableNumber;
        
        // 显示二维码区域
        qrCodeDisplayArea.classList.remove('hidden');
        
        // 滚动到二维码显示区域
        qrCodeDisplayArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        
        showToast('QR code displayed successfully', 'success');
        
        return true; // 成功生成
      } catch (qrError) {
        console.error('Failed to generate QR code:', qrError);
        showToast('Failed to display QR code: ' + (qrError.message || 'Unknown error'), 'error');
        qrCodeContainer.innerHTML = '<p class="text-red-500 text-sm">Failed to display QR code: ' + (qrError.message || 'Unknown error') + '</p>';
        return false;
      }
    } else if (attempts < maxAttempts) {
      // 库还未加载，继续等待
      if (attempts === 1) {
        qrCodeContainer.innerHTML = '<p class="text-blue-500 text-sm">Loading QR code library, please wait...</p>';
      } else if (attempts % 10 === 0) {
        // 每1秒更新一次提示
        qrCodeContainer.innerHTML = `<p class="text-blue-500 text-sm">Loading QR code library, please wait... (${attempts * 0.1}s)</p>`;
      }
      setTimeout(tryGenerateQR, 100);
      return false;
    } else {
      // 超时，显示错误
      qrCodeContainer.innerHTML = `
        <div class="text-red-500 text-sm space-y-2 p-4">
          <p class="font-semibold">QR code library loading failed</p>
          <p class="text-xs">Possible reasons:</p>
          <ul class="text-xs list-disc list-inside space-y-1">
            <li>Network connection issue</li>
            <li>CDN service unavailable</li>
          </ul>
          <p class="text-xs mt-2">Please refresh the page and try again.</p>
        </div>
      `;
      showToast('QR code library loading failed, please refresh the page', 'error');
      return false;
    }
  };
  
  // 开始尝试生成二维码
  tryGenerateQR();
}

// Delete QR code
async function deleteDineInQRCode(tableNumber) {
  if (!confirm(`Are you sure you want to delete QR code for table ${tableNumber}? This will also delete the corresponding table user account.`)) {
    return;
  }
  
  try {
    const data = await adminApiRequest(`${API_BASE}/admin/dine-in/qr-code/${encodeURIComponent(tableNumber)}`, {
      method: 'DELETE'
    });
    
    if (data.success) {
      showToast('QR code and table user deleted successfully', 'success');
      loadDineInQRCodeHistory();
    } else {
      showToast(data.message || 'Failed to delete QR code', 'error');
    }
  } catch (error) {
    console.error('Failed to delete QR code:', error);
    showToast(error.data?.message || 'Failed to delete QR code', 'error');
  }
}

// Print QR code
function printQRCode() {
  if (!currentQRCodeData) {
    showToast('Please generate QR code first', 'error');
    return;
  }
  
  const qrCodeContainer = document.getElementById('qrCodeContainer');
  if (!qrCodeContainer) {
    showToast('QR code container not found', 'error');
    return;
  }
  
  // Create print window
  const printWindow = window.open('', '_blank');
  const tableNumber = currentQRCodeData.tableNumber;
  
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Table ${escapeHtml(tableNumber)} - Dine-In Ordering</title>
      <style>
        @media print {
          @page {
            size: A4;
            margin: 20mm;
          }
        }
        body {
          font-family: Arial, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          padding: 40px;
        }
        .qr-title {
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 20px;
          text-align: center;
        }
        .qr-subtitle {
          font-size: 16px;
          color: #666;
          margin-bottom: 30px;
          text-align: center;
        }
        .qr-code-container {
          border: 2px solid #000;
          padding: 20px;
          background: white;
        }
        .qr-instructions {
          margin-top: 30px;
          text-align: center;
          font-size: 14px;
          color: #333;
        }
      </style>
    </head>
    <body>
      <div class="qr-title">Table ${escapeHtml(tableNumber)}</div>
      <div class="qr-subtitle">Scan to Order</div>
      <div class="qr-code-container">
        ${qrCodeContainer.innerHTML}
      </div>
      <div class="qr-instructions">
        Scan the QR code with your phone to place an order
      </div>
    </body>
    </html>
  `);
  
  printWindow.document.close();
  printWindow.focus();
  
  // Wait for images to load before printing
  setTimeout(() => {
    printWindow.print();
  }, 500);
}

// Download QR code
function downloadQRCode() {
  if (!currentQRCodeData) {
    showToast('Please generate QR code first', 'error');
    return;
  }
  
  const qrCodeContainer = document.getElementById('qrCodeContainer');
  if (!qrCodeContainer) {
    showToast('QR code container not found', 'error');
    return;
  }
  
  // Try to get QR code image from canvas or img
  const canvas = qrCodeContainer.querySelector('canvas');
  const img = qrCodeContainer.querySelector('img');
  
  if (canvas) {
    // Download from canvas
    try {
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Table${currentQRCodeData.tableNumber}-QRCode.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        showToast('QR code downloaded successfully', 'success');
      }, 'image/png');
    } catch (error) {
      console.error('Failed to download QR code:', error);
      showToast('Failed to download QR code', 'error');
    }
  } else if (img && img.src) {
    // Download from img
    try {
      fetch(img.src)
        .then(res => res.blob())
        .then(blob => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `Table${currentQRCodeData.tableNumber}-QRCode.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          
          showToast('QR code downloaded successfully', 'success');
        })
        .catch(error => {
          console.error('Failed to download QR code:', error);
          showToast('Failed to download QR code', 'error');
        });
    } catch (error) {
      console.error('Failed to download QR code:', error);
      showToast('Failed to download QR code', 'error');
    }
  } else {
    showToast('QR code not generated, please generate QR code first', 'error');
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
          <div class="flex justify-between items-center mb-6 relative">
            <h2 class="text-2xl font-bold text-gray-900">System Settings</h2>
            <div class="flex space-x-3 fixed top-20 right-4 z-50 bg-white p-2 rounded-lg shadow-lg border border-gray-200">
              <button type="button" onclick="saveSettings(event)" class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-colors">
                Save Settings
              </button>
              <button type="button" onclick="loadSettingsPage()" class="px-6 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold rounded-lg transition-colors">
                Reset
              </button>
            </div>
          </div>
          
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
              
              <div class="border-t pt-6 mt-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">Payment Settings</h3>
                
                <div class="mb-4">
                  <label class="flex items-center space-x-2">
                    <input type="checkbox" id="instantPaymentEnabled" 
                           class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                           ${settings.instant_payment_enabled === 'true' ? 'checked' : ''}>
                    <span class="text-sm font-medium text-gray-700">Enable Instant Payment</span>
                  </label>
                  <p class="text-xs text-gray-500 mt-1 ml-6">
                    When enabled, users can pay or delete orders immediately without waiting for cycle to end. 
                    Discount feature will be disabled (Discount Amount = 0). Balance can still be used.
                  </p>
                  <div class="mt-2 ml-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p class="text-xs text-yellow-800">
                      <strong>⚠️ Note:</strong> When instant payment is enabled, discount calculations are disabled. 
                      All orders will have Discount Amount = 0, regardless of cycle discount settings.
                    </p>
                  </div>
                </div>
              </div>
              
              <div class="border-t pt-6 mt-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">用户管理设置</h3>
                
                <div class="mb-4">
                  <label class="flex items-center space-x-2">
                    <input type="checkbox" id="userRegistrationDisabled" 
                           class="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                           ${settings.user_registration_disabled === 'true' ? 'checked' : ''}>
                    <span class="text-sm font-medium text-gray-700">临时禁止用户注册</span>
                  </label>
                  <p class="text-xs text-gray-500 mt-1 ml-6">
                    启用后，新用户将无法注册账号。已注册用户不受影响，可以正常登录。
                  </p>
                  <div class="mt-2 ml-6 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p class="text-xs text-red-800">
                      <strong>⚠️ 警告：</strong> 启用此选项将阻止所有新用户注册，请谨慎使用。
                    </p>
                  </div>
                </div>
              </div>
              
              <div class="border-t pt-6 mt-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">博客管理设置</h3>
                
                <div class="mb-4">
                  <label class="flex items-center space-x-2">
                    <input type="checkbox" id="blogPostingDisabled" 
                           class="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                           ${settings.blog_posting_disabled === 'true' ? 'checked' : ''}>
                    <span class="text-sm font-medium text-gray-700">临时禁止发布文章</span>
                  </label>
                  <p class="text-xs text-gray-500 mt-1 ml-6">
                    启用后，所有用户（包括管理员）将无法发布新文章。已发布的文章不受影响。
                  </p>
                  <div class="mt-2 ml-6 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p class="text-xs text-red-800">
                      <strong>⚠️ 警告：</strong> 启用此选项将阻止所有用户发布文章，请谨慎使用。
                    </p>
                  </div>
                </div>
                
                <div class="mb-4">
                  <label class="flex items-center space-x-2">
                    <input type="checkbox" id="blogCommentingDisabled" 
                           class="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                           ${settings.blog_commenting_disabled === 'true' ? 'checked' : ''}>
                    <span class="text-sm font-medium text-gray-700">临时禁止评论</span>
                  </label>
                  <p class="text-xs text-gray-500 mt-1 ml-6">
                    启用后，所有用户将无法发表评论。已存在的评论不受影响。
                  </p>
                  <div class="mt-2 ml-6 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p class="text-xs text-red-800">
                      <strong>⚠️ 警告：</strong> 启用此选项将阻止所有用户发表评论，请谨慎使用。
                    </p>
                  </div>
                </div>
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
                    <input type="password" id="twilioAuthToken" 
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
                      <input type="password" id="emailSmtpPassword" 
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
                <h3 class="text-lg font-semibold text-gray-900 mb-4">Stripe Payment Settings</h3>
                <p class="text-sm text-gray-600 mb-4">Configure Stripe payment gateway for online payments. Users can choose between online payment (Stripe) or uploading payment screenshots.</p>
                
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Stripe Publishable Key</label>
                    <input type="text" id="stripePublishableKey" 
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                           placeholder="pk_test_..."
                           value="${settings.stripe_publishable_key || ''}">
                    <p class="text-xs text-gray-500 mt-1">Your Stripe Publishable Key (starts with pk_test_ or pk_live_). This key is safe to expose to the frontend.</p>
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Stripe Secret Key</label>
                    <input type="password" id="stripeSecretKey" 
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                           placeholder="sk_test_..."
                           value="${settings.stripe_secret_key || ''}">
                    <p class="text-xs text-gray-500 mt-1">Your Stripe Secret Key (starts with sk_test_ or sk_live_). Keep this key secure and never expose it to the frontend.</p>
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Stripe Webhook Secret (Optional)</label>
                    <input type="password" id="stripeWebhookSecret" 
                           class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                           placeholder="whsec_..."
                           value="${settings.stripe_webhook_secret || ''}">
                    <p class="text-xs text-gray-500 mt-1">Your Stripe Webhook Secret (starts with whsec_). Used to verify webhook requests from Stripe. Optional but recommended for production.</p>
                  </div>
                  
                  <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p class="text-xs text-blue-800">
                      <strong>Note:</strong> You can get your Stripe API keys from the <a href="https://dashboard.stripe.com/apikeys" target="_blank" class="underline">Stripe Dashboard</a>. 
                      Use test keys (pk_test_/sk_test_) for development and live keys (pk_live_/sk_live_) for production.
                    </p>
                  </div>
                </div>
              </div>
              
              <div class="border-t pt-6 mt-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">🖨️ QZ Tray Certificate Settings</h3>
                <p class="text-sm text-gray-600 mb-4">Upload QZ Tray certificates for silent printing. Certificates are stored in the database and compatible with cloud platforms like Fly.io.</p>
                
                <div class="space-y-4">
                  <div id="qzCertStatus" class="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p class="text-sm text-gray-600">Loading certificate status...</p>
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Digital Certificate (digital-certificate.txt)</label>
                    <textarea id="qzCertificate" 
                              rows="8"
                              class="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-xs"
                              placeholder="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"></textarea>
                    <p class="text-xs text-gray-500 mt-1">Paste the content of your digital-certificate.txt file here</p>
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Private Key (private-key.pem)</label>
                    <textarea id="qzPrivateKey" 
                              rows="8"
                              class="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-xs"
                              placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"></textarea>
                    <p class="text-xs text-gray-500 mt-1">Paste the content of your private-key.pem file here</p>
                  </div>
                  
                  <div class="flex items-center space-x-4">
                    <button type="button" onclick="saveQZCertificates()" 
                            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">
                      Upload/Update Certificates
                    </button>
                    <button type="button" onclick="loadQZCertificates()" 
                            class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm">
                      Reload Status
                    </button>
                  </div>
                  
                  <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p class="text-xs text-blue-800">
                      <strong>Note:</strong> Certificates are stored in the database, making them compatible with cloud platforms like Fly.io where the filesystem may be read-only. 
                      After uploading, the new certificates will be used for all future print jobs. 
                      If certificates are not uploaded, the system will fall back to reading from the filesystem (for backward compatibility).
                    </p>
                  </div>
                </div>
              </div>
              
              <div class="border-t pt-6 mt-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">🔌 Custom API Token</h3>
                <p class="text-sm text-gray-600 mb-4">Set an API token for custom API authentication. This token is only used for custom APIs and does not affect other system APIs.</p>
                
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">API Token</label>
                    <div class="flex items-center space-x-2">
                      <input type="password" id="customApiToken" 
                             class="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                             placeholder="Enter API token (leave empty to disable)"
                             value="">
                      <input type="hidden" id="customApiTokenOriginal" value="${settings.custom_api_token || ''}">
                      <button type="button" onclick="toggleCustomApiTokenVisibility()" 
                              class="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-sm">
                        <span id="customApiTokenToggleText">Show</span>
                      </button>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">
                      Use this token in custom APIs that require authentication. 
                      Pass it via <code class="bg-gray-100 px-1 rounded">X-API-Token</code> header, 
                      <code class="bg-gray-100 px-1 rounded">Authorization: Bearer &lt;token&gt;</code> header, 
                      or <code class="bg-gray-100 px-1 rounded">?token=&lt;token&gt;</code> query parameter.
                    </p>
                    <p class="text-xs text-yellow-600 mt-2">
                      <strong>Note:</strong> This token only applies to custom APIs. Other system APIs are not affected.
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
              
              <div class="border-t pt-6 mt-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">🔊 TTS语音合成设置</h3>
                <p class="text-sm text-gray-600 mb-4">配置文本转语音（TTS）服务的参数，支持中文和阿拉伯语。</p>
                
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">语速 (Speech Rate)</label>
                    <div class="flex items-center space-x-4">
                      <input type="range" id="ttsRate" 
                             class="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                             min="30" max="200" step="10"
                             value="${settings.tts_rate || '50'}"
                             oninput="document.getElementById('ttsRateValue').textContent = this.value + '%'">
                      <span id="ttsRateValue" class="text-sm font-semibold text-gray-700 w-16 text-right">${settings.tts_rate || '50'}%</span>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">语速范围：30% (很慢) - 200% (很快)，默认：50% (较慢)</p>
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">音调 (Pitch)</label>
                    <div class="flex items-center space-x-4">
                      <input type="range" id="ttsPitch" 
                             class="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                             min="-50" max="50" step="5"
                             value="${settings.tts_pitch || '0'}"
                             oninput="document.getElementById('ttsPitchValue').textContent = (this.value >= 0 ? '+' : '') + this.value + 'Hz'">
                      <span id="ttsPitchValue" class="text-sm font-semibold text-gray-700 w-20 text-right">${(parseInt(settings.tts_pitch) || 0) >= 0 ? '+' : ''}${settings.tts_pitch || '0'}Hz</span>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">音调范围：-50Hz (低) - +50Hz (高)，默认：0Hz (正常)</p>
                  </div>
                  
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">音量 (Volume)</label>
                    <div class="flex items-center space-x-4">
                      <input type="range" id="ttsVolume" 
                             class="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                             min="0" max="100" step="5"
                             value="${settings.tts_volume || '100'}"
                             oninput="document.getElementById('ttsVolumeValue').textContent = this.value + '%'">
                      <span id="ttsVolumeValue" class="text-sm font-semibold text-gray-700 w-16 text-right">${settings.tts_volume || '100'}%</span>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">音量范围：0% (静音) - 100% (最大)，默认：100%</p>
                  </div>
                  
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">中文语音 (Chinese Voice)</label>
                      <select id="ttsVoiceZh" 
                              class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                        <option value="zh-CN-XiaoxiaoNeural" ${(settings.tts_voice_zh || 'zh-CN-XiaoxiaoNeural') === 'zh-CN-XiaoxiaoNeural' ? 'selected' : ''}>晓晓 (女声)</option>
                        <option value="zh-CN-YunxiNeural" ${settings.tts_voice_zh === 'zh-CN-YunxiNeural' ? 'selected' : ''}>云希 (男声)</option>
                        <option value="zh-CN-YunyangNeural" ${settings.tts_voice_zh === 'zh-CN-YunyangNeural' ? 'selected' : ''}>云扬 (男声)</option>
                        <option value="zh-CN-XiaoyiNeural" ${settings.tts_voice_zh === 'zh-CN-XiaoyiNeural' ? 'selected' : ''}>晓伊 (女声)</option>
                      </select>
                      <p class="text-xs text-gray-500 mt-1">选择中文语音合成的声音</p>
                    </div>
                    
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">阿拉伯语语音 (Arabic Voice)</label>
                      <select id="ttsVoiceAr" 
                              class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                        <option value="ar-SA-HamedNeural" ${(settings.tts_voice_ar || 'ar-SA-HamedNeural') === 'ar-SA-HamedNeural' ? 'selected' : ''}>哈米德 (男声)</option>
                        <option value="ar-SA-ZariyahNeural" ${settings.tts_voice_ar === 'ar-SA-ZariyahNeural' ? 'selected' : ''}>扎里亚 (女声)</option>
                        <option value="ar-EG-SalmaNeural" ${settings.tts_voice_ar === 'ar-EG-SalmaNeural' ? 'selected' : ''}>萨尔玛 (女声，埃及)</option>
                        <option value="ar-EG-ShakirNeural" ${settings.tts_voice_ar === 'ar-EG-ShakirNeural' ? 'selected' : ''}>沙基尔 (男声，埃及)</option>
                      </select>
                      <p class="text-xs text-gray-500 mt-1">选择阿拉伯语语音合成的声音</p>
                    </div>
                  </div>
                  
                  <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p class="text-xs text-blue-800">
                      <strong>提示：</strong> 修改设置后，点击"Save Settings"保存。新的设置将在下次TTS请求时生效。
                    </p>
                  </div>
                </div>
              </div>
              
              <div class="border-t pt-6 mt-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">💱 汇率自动更新设置</h3>
                <p class="text-sm text-gray-600 mb-4">配置汇率API密钥，系统将自动定时获取汇率并更新到汇率转换API中。</p>
                
                <div class="space-y-4">
                  <div>
                    <label class="flex items-center space-x-2 mb-2">
                      <input type="checkbox" id="exchangeRateAutoUpdateEnabled" 
                             class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                             ${settings.exchange_rate_auto_update_enabled === 'true' ? 'checked' : ''}
                             onchange="document.getElementById('exchangeRateConfigSection').classList.toggle('hidden', !this.checked)">
                      <span class="text-sm font-medium text-gray-700">启用汇率自动更新</span>
                    </label>
                    <p class="text-xs text-gray-500 ml-6">启用后，系统将根据设置的频率自动获取并更新汇率</p>
                  </div>
                  
                  <div id="exchangeRateConfigSection" class="space-y-4 ${settings.exchange_rate_auto_update_enabled === 'true' ? '' : 'hidden'}">
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">FreeCurrencyAPI API Key</label>
                      <input type="password" id="freecurrencyapiApiKey" 
                             class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                             placeholder="Enter FreeCurrencyAPI API key"
                             value="${settings.freecurrencyapi_api_key || ''}">
                      <p class="text-xs text-gray-500 mt-1">优先使用的汇率API密钥（<a href="https://freecurrencyapi.com/" target="_blank" class="text-blue-600 hover:underline">获取API Key</a>）</p>
                    </div>
                    
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">ExchangeRate-API API Key</label>
                      <input type="password" id="exchangerateApiKey" 
                             class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                             placeholder="Enter ExchangeRate-API key"
                             value="${settings.exchangerate_api_key || ''}">
                      <p class="text-xs text-gray-500 mt-1">备用汇率API密钥（当FreeCurrencyAPI失败时使用，<a href="https://www.exchangerate-api.com/" target="_blank" class="text-blue-600 hover:underline">获取API Key</a>）</p>
                    </div>
                    
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">更新频率</label>
                      <select id="exchangeRateUpdateFrequency" 
                              class="w-full px-4 py-2 border border-gray-300 rounded-lg">
                        <option value="hourly" ${settings.exchange_rate_update_frequency === 'hourly' ? 'selected' : ''}>每小时更新</option>
                        <option value="daily" ${settings.exchange_rate_update_frequency === 'daily' || !settings.exchange_rate_update_frequency ? 'selected' : ''}>每天更新（推荐）</option>
                      </select>
                      <p class="text-xs text-gray-500 mt-1">汇率更新频率，建议每天更新一次以避免API调用限制</p>
                    </div>
                    
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">基础货币列表</label>
                      <input type="text" id="exchangeRateBaseCurrencies" 
                             class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                             placeholder="CNY,USD,EUR,GBP,JPY,SAR,AED,RUB,INR,KRW,THB"
                             value="${settings.exchange_rate_base_currencies || 'CNY,USD,EUR,GBP,JPY,SAR,AED,RUB,INR,KRW,THB'}">
                      <p class="text-xs text-gray-500 mt-1">需要获取汇率的基础货币代码，用逗号分隔（如：CNY,USD,EUR）</p>
                    </div>
                    
                    <div>
                      <label class="block text-sm font-medium text-gray-700 mb-2">目标货币</label>
                      <input type="text" id="exchangeRateTargetCurrency" 
                             class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                             placeholder="EGP"
                             value="${settings.exchange_rate_target_currency || 'EGP'}"
                             maxlength="3">
                      <p class="text-xs text-gray-500 mt-1">目标货币代码（默认：EGP埃及镑）</p>
                    </div>
                    
                    <div class="flex items-center space-x-3 pt-2">
                      <button type="button" id="updateExchangeRateBtn" 
                              onclick="updateExchangeRateManually()"
                              class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">
                        🔄 立即更新汇率
                      </button>
                      <span id="exchangeRateUpdateStatus" class="text-sm text-gray-600"></span>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="border-t pt-6 mt-6">
                <h3 class="text-lg font-semibold text-gray-900 mb-4">🔒 Security Policy Settings</h3>
                
                <div class="space-y-6">
                  <!-- Admin Security Policy -->
                  <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 class="text-md font-semibold text-blue-900 mb-4">Admin Account Security Policy</h4>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Time Window (minutes)</label>
                        <input type="number" id="adminLockoutTimeWindow" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                               value="${settings.admin_lockout_time_window_minutes || '30'}"
                               min="1" max="1440">
                        <p class="text-xs text-gray-500 mt-1">Failed attempts reset after this time window</p>
                      </div>
                      
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Max Lockout (hours)</label>
                        <input type="number" id="adminMaxLockoutHours" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                               value="${settings.admin_max_lockout_hours || '4'}"
                               min="1" max="168">
                        <p class="text-xs text-gray-500 mt-1">Maximum lockout duration</p>
                      </div>
                      
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Threshold 1 (Lock 15min)</label>
                        <input type="number" id="adminLockoutThreshold1" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                               value="${settings.admin_lockout_threshold_1 || '10'}"
                               min="1" max="100">
                        <p class="text-xs text-gray-500 mt-1">Failed attempts to trigger 15min lockout</p>
                      </div>
                      
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Threshold 2 (Lock 30min)</label>
                        <input type="number" id="adminLockoutThreshold2" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                               value="${settings.admin_lockout_threshold_2 || '20'}"
                               min="1" max="100">
                        <p class="text-xs text-gray-500 mt-1">Failed attempts to trigger 30min lockout</p>
                      </div>
                      
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Threshold 3 (Lock 1hr)</label>
                        <input type="number" id="adminLockoutThreshold3" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                               value="${settings.admin_lockout_threshold_3 || '30'}"
                               min="1" max="100">
                        <p class="text-xs text-gray-500 mt-1">Failed attempts to trigger 1hr lockout</p>
                      </div>
                      
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Threshold 4 (Lock Max)</label>
                        <input type="number" id="adminLockoutThreshold4" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                               value="${settings.admin_lockout_threshold_4 || '40'}"
                               min="1" max="100">
                        <p class="text-xs text-gray-500 mt-1">Failed attempts to trigger max lockout</p>
                      </div>
                      
                      <div class="md:col-span-2">
                        <label class="flex items-center space-x-2">
                          <input type="checkbox" id="adminProgressiveDelayEnabled" 
                                 class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                 ${settings.admin_progressive_delay_enabled === 'true' ? 'checked' : ''}>
                          <span class="text-sm font-medium text-gray-700">Enable Progressive Delay</span>
                        </label>
                        <p class="text-xs text-gray-500 mt-1 ml-6">Enable delays before hard lockout (3→5s, 5→15s, 7→30s)</p>
                      </div>
                    </div>
                  </div>
                  
                  <!-- User Security Policy -->
                  <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h4 class="text-md font-semibold text-green-900 mb-4">User Account Security Policy</h4>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Time Window (minutes)</label>
                        <input type="number" id="userLockoutTimeWindow" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                               value="${settings.user_lockout_time_window_minutes || '30'}"
                               min="1" max="1440">
                        <p class="text-xs text-gray-500 mt-1">Failed attempts reset after this time window</p>
                      </div>
                      
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Max Lockout (hours)</label>
                        <input type="number" id="userMaxLockoutHours" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                               value="${settings.user_max_lockout_hours || '4'}"
                               min="1" max="168">
                        <p class="text-xs text-gray-500 mt-1">Maximum lockout duration</p>
                      </div>
                      
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Threshold 1 (Lock 15min)</label>
                        <input type="number" id="userLockoutThreshold1" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                               value="${settings.user_lockout_threshold_1 || '10'}"
                               min="1" max="100">
                        <p class="text-xs text-gray-500 mt-1">Failed attempts to trigger 15min lockout</p>
                      </div>
                      
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Threshold 2 (Lock 30min)</label>
                        <input type="number" id="userLockoutThreshold2" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                               value="${settings.user_lockout_threshold_2 || '20'}"
                               min="1" max="100">
                        <p class="text-xs text-gray-500 mt-1">Failed attempts to trigger 30min lockout</p>
                      </div>
                      
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Threshold 3 (Lock 1hr)</label>
                        <input type="number" id="userLockoutThreshold3" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                               value="${settings.user_lockout_threshold_3 || '30'}"
                               min="1" max="100">
                        <p class="text-xs text-gray-500 mt-1">Failed attempts to trigger 1hr lockout</p>
                      </div>
                      
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Threshold 4 (Lock Max)</label>
                        <input type="number" id="userLockoutThreshold4" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                               value="${settings.user_lockout_threshold_4 || '40'}"
                               min="1" max="100">
                        <p class="text-xs text-gray-500 mt-1">Failed attempts to trigger max lockout</p>
                      </div>
                      
                      <div class="md:col-span-2">
                        <label class="flex items-center space-x-2">
                          <input type="checkbox" id="userProgressiveDelayEnabled" 
                                 class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                 ${settings.user_progressive_delay_enabled === 'true' ? 'checked' : ''}>
                          <span class="text-sm font-medium text-gray-700">Enable Progressive Delay</span>
                        </label>
                        <p class="text-xs text-gray-500 mt-1 ml-6">Enable delays before hard lockout (3→5s, 5→15s, 7→30s)</p>
                      </div>
                    </div>
                  </div>
                  
                  <!-- IP Rate Limiting (Common) -->
                  <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 class="text-md font-semibold text-yellow-900 mb-4">IP Rate Limiting (Common for Admin & User)</h4>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Rate Limit Attempts</label>
                        <input type="number" id="ipRateLimitAttempts" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                               value="${settings.ip_rate_limit_attempts || '5'}"
                               min="1" max="50">
                        <p class="text-xs text-gray-500 mt-1">Max failed attempts per IP in time window</p>
                      </div>
                      
                      <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Rate Limit Window (minutes)</label>
                        <input type="number" id="ipRateLimitWindowMinutes" 
                               class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                               value="${settings.ip_rate_limit_window_minutes || '15'}"
                               min="1" max="1440">
                        <p class="text-xs text-gray-500 mt-1">Time window for IP rate limiting</p>
                      </div>
                    </div>
                  </div>
                  
                  <!-- IP Management -->
                  <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <div class="flex items-center justify-between mb-4">
                      <h4 class="text-md font-semibold text-purple-900">IP Management</h4>
                      <button onclick="loadBlockedIps()" class="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm">
                        🔄 Refresh
                      </button>
                    </div>
                    
                    <div id="blockedIpsList" class="space-y-2">
                      <p class="text-sm text-gray-500">Loading blocked IPs...</p>
                    </div>
                  </div>
                </div>
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
                      <input type="password" id="receiveApiToken" 
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
      
      // 等待 DOM 渲染完成后再加载远程备份配置和IP列表
      setTimeout(() => {
        loadRemoteBackupConfigs();
        loadReceiveConfig();
        loadPushLogs();
        loadReceivedBackups();
        loadBlockedIps();
        loadQZCertificates();
        // 初始化自定义API Token显示
        const customApiToken = settings.custom_api_token || '';
        const customApiTokenInput = document.getElementById('customApiToken');
        const customApiTokenOriginal = document.getElementById('customApiTokenOriginal');
        if (customApiTokenInput && customApiTokenOriginal) {
          customApiTokenOriginal.value = customApiToken;
          if (customApiToken) {
            customApiTokenInput.value = maskApiToken(customApiToken);
            customApiTokenInput.type = 'password';
          }
        }
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
  const instantPaymentEnabled = document.getElementById('instantPaymentEnabled')?.checked || false;
  
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
  
  // 获取安全策略设置
  const adminLockoutTimeWindow = document.getElementById('adminLockoutTimeWindow')?.value || '30';
  const adminMaxLockoutHours = document.getElementById('adminMaxLockoutHours')?.value || '4';
  const adminLockoutThreshold1 = document.getElementById('adminLockoutThreshold1')?.value || '10';
  const adminLockoutThreshold2 = document.getElementById('adminLockoutThreshold2')?.value || '20';
  const adminLockoutThreshold3 = document.getElementById('adminLockoutThreshold3')?.value || '30';
  const adminLockoutThreshold4 = document.getElementById('adminLockoutThreshold4')?.value || '40';
  const adminProgressiveDelayEnabled = document.getElementById('adminProgressiveDelayEnabled')?.checked || false;
  
  const userLockoutTimeWindow = document.getElementById('userLockoutTimeWindow')?.value || '30';
  const userMaxLockoutHours = document.getElementById('userMaxLockoutHours')?.value || '4';
  const userLockoutThreshold1 = document.getElementById('userLockoutThreshold1')?.value || '10';
  const userLockoutThreshold2 = document.getElementById('userLockoutThreshold2')?.value || '20';
  const userLockoutThreshold3 = document.getElementById('userLockoutThreshold3')?.value || '30';
  const userLockoutThreshold4 = document.getElementById('userLockoutThreshold4')?.value || '40';
  const userProgressiveDelayEnabled = document.getElementById('userProgressiveDelayEnabled')?.checked || false;
  
  const ipRateLimitAttempts = document.getElementById('ipRateLimitAttempts')?.value || '5';
  const ipRateLimitWindowMinutes = document.getElementById('ipRateLimitWindowMinutes')?.value || '15';
  
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
    debug_logging_enabled: debugLoggingEnabled ? 'true' : 'false',
    instant_payment_enabled: instantPaymentEnabled ? 'true' : 'false',
    user_registration_disabled: document.getElementById('userRegistrationDisabled')?.checked ? 'true' : 'false',
    blog_posting_disabled: document.getElementById('blogPostingDisabled')?.checked ? 'true' : 'false',
    blog_commenting_disabled: document.getElementById('blogCommentingDisabled')?.checked ? 'true' : 'false',
    stripe_publishable_key: document.getElementById('stripePublishableKey')?.value.trim() || '',
    stripe_secret_key: document.getElementById('stripeSecretKey')?.value.trim() || '',
    stripe_webhook_secret: document.getElementById('stripeWebhookSecret')?.value.trim() || '',
    // Admin security policy
    admin_lockout_time_window_minutes: adminLockoutTimeWindow,
    admin_max_lockout_hours: adminMaxLockoutHours,
    admin_lockout_threshold_1: adminLockoutThreshold1,
    admin_lockout_threshold_2: adminLockoutThreshold2,
    admin_lockout_threshold_3: adminLockoutThreshold3,
    admin_lockout_threshold_4: adminLockoutThreshold4,
    admin_progressive_delay_enabled: adminProgressiveDelayEnabled ? 'true' : 'false',
    // User security policy
    user_lockout_time_window_minutes: userLockoutTimeWindow,
    user_max_lockout_hours: userMaxLockoutHours,
    user_lockout_threshold_1: userLockoutThreshold1,
    user_lockout_threshold_2: userLockoutThreshold2,
    user_lockout_threshold_3: userLockoutThreshold3,
    user_lockout_threshold_4: userLockoutThreshold4,
    user_progressive_delay_enabled: userProgressiveDelayEnabled ? 'true' : 'false',
    // IP rate limiting
    ip_rate_limit_attempts: ipRateLimitAttempts,
    ip_rate_limit_window_minutes: ipRateLimitWindowMinutes,
    // TTS Settings
    tts_rate: document.getElementById('ttsRate')?.value || '50',
    tts_pitch: document.getElementById('ttsPitch')?.value || '0',
    tts_volume: document.getElementById('ttsVolume')?.value || '100',
    tts_voice_zh: document.getElementById('ttsVoiceZh')?.value || 'zh-CN-XiaoxiaoNeural',
    tts_voice_ar: document.getElementById('ttsVoiceAr')?.value || 'ar-SA-HamedNeural',
    // Exchange Rate API Settings
    exchange_rate_auto_update_enabled: document.getElementById('exchangeRateAutoUpdateEnabled')?.checked ? 'true' : 'false',
    freecurrencyapi_api_key: document.getElementById('freecurrencyapiApiKey')?.value.trim() || '',
    exchangerate_api_key: document.getElementById('exchangerateApiKey')?.value.trim() || '',
    exchange_rate_update_frequency: document.getElementById('exchangeRateUpdateFrequency')?.value || 'daily',
    exchange_rate_base_currencies: document.getElementById('exchangeRateBaseCurrencies')?.value.trim() || 'CNY,USD,EUR,GBP,JPY,SAR,AED,RUB,INR,KRW,THB',
    exchange_rate_target_currency: document.getElementById('exchangeRateTargetCurrency')?.value.trim().toUpperCase() || 'EGP',
    // Custom API Token (only for custom APIs)
    custom_api_token: (() => {
      const tokenInput = document.getElementById('customApiToken');
      const originalInput = document.getElementById('customApiTokenOriginal');
      if (!tokenInput) return '';
      
      let apiToken = tokenInput.value.trim();
      
      // 如果当前值是掩码值（前3个字符+星号），使用原始值
      if (apiToken && apiToken.endsWith('***') && originalInput && originalInput.value) {
        apiToken = originalInput.value;
      }
      
      // 如果输入为空，检查是否有原始值（用户可能想保持原值）
      if (!apiToken && originalInput && originalInput.value) {
        apiToken = originalInput.value;
      }
      
      return apiToken;
    })()
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
    
    const data = await adminApiRequest(`${API_BASE}/admin/cleanup/info?${params}`);
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
    
    const data = await adminApiRequest(`${API_BASE}/admin/email/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
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
    const data = await adminApiRequest(`${API_BASE}/admin/users`);
    
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
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Permission</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lock Status</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registered</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Login</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  ${users.length === 0 ? 
                    '<tr><td colspan="11" class="px-6 py-4 text-center text-gray-500">No users</td></tr>' :
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
                        <td class="px-6 py-4 whitespace-nowrap text-sm">
                          <select onchange="updateUserPermission(${user.id}, this.value)" 
                                  class="text-xs border border-gray-300 rounded px-2 py-1 ${(user.permission || 'readwrite') === 'readonly' ? 'bg-yellow-50 text-yellow-800' : 'bg-blue-50 text-blue-800'}">
                            <option value="readonly" ${(user.permission || 'readwrite') === 'readonly' ? 'selected' : ''}>只读</option>
                            <option value="readwrite" ${(user.permission || 'readwrite') === 'readwrite' ? 'selected' : ''}>读写</option>
                          </select>
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm">
                          ${user.isLocked ? `
                            <div class="flex flex-col space-y-1">
                              <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                                🔒 Locked
                              </span>
                              <span class="text-xs text-gray-500">${user.remainingTime} remaining</span>
                              <span class="text-xs text-gray-500">Failed: ${user.failedCount} times</span>
                              ${user.firstAttemptAt ? `<span class="text-xs text-gray-400">First attempt: ${new Date(user.firstAttemptAt.replace(' ', 'T')).toLocaleString()}</span>` : ''}
                            </div>
                          ` : user.failedCount > 0 ? `
                            <div class="flex flex-col space-y-1">
                              <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                ⚠️ ${user.failedCount} failed attempts
                              </span>
                              <span class="text-xs text-gray-500">Lock expired or not yet locked</span>
                              ${user.firstAttemptAt ? `<span class="text-xs text-gray-400">First attempt: ${new Date(user.firstAttemptAt.replace(' ', 'T')).toLocaleString()}</span>` : ''}
                              ${user.lastAttemptAt ? `<span class="text-xs text-gray-400">Last attempt: ${new Date(user.lastAttemptAt.replace(' ', 'T')).toLocaleString()}</span>` : ''}
                            </div>
                          ` : `
                            <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                              ✓ Active
                            </span>
                          `}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.created_at ? new Date(user.created_at).toLocaleString('en-US') : '-'}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${user.last_login ? new Date(user.last_login).toLocaleString('en-US') : '-'}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm">
                          <div class="flex flex-col space-y-1">
                          <div class="flex space-x-2">
                            <button onclick="showEditUserModal(${user.id}, '${(user.phone || '').replace(/'/g, "\\'")}', '${(user.name || '').replace(/'/g, "\\'")}')" 
                                      class="text-blue-600 hover:text-blue-800 text-xs">Edit</button>
                            <button onclick="resetUserPin(${user.id}, '${(user.phone || '').replace(/'/g, "\\'")}')" 
                                      class="text-yellow-600 hover:text-yellow-800 text-xs">Reset PIN</button>
                            <button onclick="deleteUser(${user.id}, '${(user.phone || '').replace(/'/g, "\\'")}')" 
                                      class="text-red-600 hover:text-red-800 text-xs">Delete</button>
                            </div>
                            ${(user.isLocked || user.failedCount > 0) ? `
                              <button onclick="unlockUser('${(user.phone || '').replace(/'/g, "\\'")}', '${(user.name || '').replace(/'/g, "\\'")}', ${user.isLocked}, ${user.failedCount || 0})" 
                                      class="mt-1 text-xs text-green-600 hover:text-green-800 font-semibold">
                                ${user.isLocked ? '🔓 Unlock' : '🧹 Clear Failed Attempts'}
                              </button>
                            ` : ''}
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

// 更新用户权限
async function updateUserPermission(userId, permission) {
  try {
    const data = await adminApiRequest(`${API_BASE}/admin/users/${userId}/permission`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permission })
    });
    
    if (data.success) {
      showToast(`用户权限已更新为：${permission === 'readonly' ? '只读' : '读写'}`, 'success');
      // 重新加载用户列表以更新显示
      await loadUsers();
    } else {
      showToast(data.message || '更新权限失败', 'error');
      // 重新加载用户列表以恢复原值
      await loadUsers();
    }
  } catch (error) {
    console.error('更新用户权限失败:', error);
    showToast('更新权限失败', 'error');
    // 重新加载用户列表以恢复原值
    await loadUsers();
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

// 解锁用户或清除失败记录
async function unlockUser(phone, name, isLocked, failedCount) {
  const actionText = isLocked ? 'unlock' : 'clear login failure records';
  const message = isLocked 
    ? `Are you sure you want to unlock the account for ${name || phone}? This will clear all login failure records (${failedCount} failed attempts) and allow the user to login immediately.`
    : `Are you sure you want to clear login failure records for ${name || phone}? This will reset the failed attempt count (${failedCount} failed attempts) and allow the user to start fresh.`;
  
  const confirmed = await showConfirmDialog(
    isLocked ? 'Unlock User Account' : 'Clear Login Failure Records',
    message,
    isLocked ? 'Unlock' : 'Clear',
    'Cancel'
  );
  
  if (!confirmed) {
    return;
  }
  
  try {
    const response = await adminApiRequest(`${API_BASE}/admin/users/${encodeURIComponent(phone)}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response && response.success) {
      if (response.wasLocked) {
        showToast('User unlocked successfully', 'success');
      } else if (response.hadRecords) {
        showToast('Login failure records cleared successfully', 'success');
      } else {
        showToast('No records to clear', 'info');
      }
      await loadUsers();
    }
  } catch (error) {
    console.error('解锁/清除用户失败记录失败:', error);
    showToast('Failed to unlock/clear user records', 'error');
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
    const data = await adminApiRequest(`${API_BASE}/admin/admins`);
    
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
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Security</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200" id="adminsTableBody">
                  ${admins.length === 0 ? 
                    '<tr><td colspan="9" class="px-6 py-4 text-center text-gray-500">No admins</td></tr>' :
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
                        <td class="px-6 py-4 whitespace-nowrap text-sm">
                          ${admin.isLocked ? `
                            <div class="flex flex-col space-y-1">
                              <span class="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">🔒 Locked</span>
                              <span class="text-xs text-gray-600">${admin.remainingTime || 'Unknown'}</span>
                            </div>
                          ` : admin.failedCount > 0 ? `
                            <div class="flex flex-col space-y-1">
                              <span class="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">⚠️ ${admin.failedCount} failed</span>
                              ${admin.lastAttemptAt ? `<span class="text-xs text-gray-600">Last: ${new Date(admin.lastAttemptAt.replace(' ', 'T')).toLocaleString()}</span>` : ''}
                            </div>
                          ` : `
                            <span class="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">✓ OK</span>
                          `}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${admin.created_at ? new Date(admin.created_at).toLocaleString('en-US') : '-'}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm">
                          ${isSuper ? `
                          <div class="flex items-center space-x-2">
                          <button data-action="edit" data-admin-id="${admin.id}" 
                                    class="text-blue-600 hover:text-blue-800">Edit</button>
                            ${(admin.isLocked || admin.failedCount > 0) ? `
                            <button data-action="unlock" data-admin-username="${admin.username.replace(/'/g, "\\'")}" 
                                    class="text-green-600 hover:text-green-800">Unlock</button>
                            ` : ''}
                          <button data-action="delete" data-admin-id="${admin.id}" 
                                  class="text-red-600 hover:text-red-800">Delete</button>
                          </div>
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
          } else if (e.target.dataset.action === 'unlock') {
            const username = e.target.dataset.adminUsername;
            if (username) {
              unlockAdmin(username);
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
async function unlockAdmin(username) {
  const admin = adminsList.find(a => a.username === username);
  if (!admin) {
    showToast('Admin not found', 'error');
    return;
  }
  
  const isLocked = admin.isLocked;
  const failedCount = admin.failedCount || 0;
  
  let confirmMessage = '';
  if (isLocked) {
    confirmMessage = `Unlock admin "${admin.username}" (${admin.name || 'N/A'})?\n\nThis will:\n- Clear all login failure records\n- Remove account lockout\n- Reactivate the account if it was deactivated`;
  } else if (failedCount > 0) {
    confirmMessage = `Clear login failure records for admin "${admin.username}" (${admin.name || 'N/A'})?\n\nFailed attempts: ${failedCount}`;
  } else {
    showToast('No login failure records to clear', 'info');
    return;
  }
  
  if (!confirm(confirmMessage)) {
    return;
  }
  
  try {
    const response = await adminApiRequest(`${API_BASE}/admin/admins/${encodeURIComponent(username)}/unlock`, {
      method: 'POST'
    });
    
    if (response && response.success) {
      showToast(response.message || 'Admin unlocked successfully', 'success');
      await loadAdmins();
    }
  } catch (error) {
    console.error('解锁管理员失败:', error);
    showToast('Failed to unlock admin', 'error');
  }
}

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

// 订单过滤状态
let ordersFilterState = {
  page: 1,        // 当前页码
  limit: 30,      // 每页条数
  status: '',     // 订单状态
  cycleId: ''     // 周期ID
};

async function loadSecurityAlerts() {
  const container = document.getElementById('security-alertsTab');
  if (!container) return;

  container.innerHTML = '<div class="text-center py-12 text-gray-500">Loading alerts...</div>';

  try {
    const params = new URLSearchParams({
      hours: String(securityAlertsFilterState.hours),
      limit: String(securityAlertsFilterState.limit),
      unread_only: securityAlertsFilterState.unreadOnly ? 'true' : 'false',
      sync: 'true'
    });
    const data = await adminApiRequest(`${API_BASE}/admin/security/alerts/high-risk?${params.toString()}`);
    const telegramConfigResp = await adminApiRequest(`${API_BASE}/admin/security/alerts/telegram-config`);

    if (!data || !data.success) {
      container.innerHTML = '<div class="text-center py-12 text-red-500">Load failed</div>';
      return;
    }

    const summary = data.summary || { total: 0, unread: 0, uniqueIps: 0, returned: 0 };
    const alerts = data.alerts || [];
    const topIps = data.topIps || [];
    const tg = telegramConfigResp?.config || {};

    container.innerHTML = `
      <div class="fade-in">
        <div class="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h2 class="text-2xl font-bold text-gray-900">高危告警</h2>
          <div class="flex items-center gap-2">
            <select
              id="securityAlertHours"
              class="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              onchange="changeSecurityAlertWindow(this.value)"
            >
              <option value="1" ${securityAlertsFilterState.hours === 1 ? 'selected' : ''}>最近1小时</option>
              <option value="6" ${securityAlertsFilterState.hours === 6 ? 'selected' : ''}>最近6小时</option>
              <option value="24" ${securityAlertsFilterState.hours === 24 ? 'selected' : ''}>最近24小时</option>
              <option value="72" ${securityAlertsFilterState.hours === 72 ? 'selected' : ''}>最近72小时</option>
            </select>
            <button onclick="toggleSecurityAlertsUnreadOnly()" class="px-3 py-2 ${securityAlertsFilterState.unreadOnly ? 'bg-orange-600 hover:bg-orange-700' : 'bg-gray-600 hover:bg-gray-700'} text-white rounded-lg text-sm transition">
              ${securityAlertsFilterState.unreadOnly ? '仅看未读' : '全部'}
            </button>
            <button onclick="markAllSecurityAlertsRead()" class="px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition">
              全部标记已读
            </button>
            <button onclick="loadSecurityAlerts()" class="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">
              刷新
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div class="bg-white rounded-xl shadow-sm p-4">
            <p class="text-sm text-gray-600">告警总数（窗口内）</p>
            <p class="text-2xl font-bold text-red-600 mt-2">${escapeHtml(String(summary.total || 0))}</p>
          </div>
          <div class="bg-white rounded-xl shadow-sm p-4">
            <p class="text-sm text-gray-600">未读告警</p>
            <p class="text-2xl font-bold text-orange-600 mt-2">${escapeHtml(String(summary.unread || 0))}</p>
          </div>
          <div class="bg-white rounded-xl shadow-sm p-4">
            <p class="text-sm text-gray-600">唯一来源IP</p>
            <p class="text-2xl font-bold text-gray-900 mt-2">${escapeHtml(String(summary.uniqueIps || 0))}</p>
          </div>
          <div class="bg-white rounded-xl shadow-sm p-4 md:col-span-3">
            <p class="text-sm text-gray-600">当前窗口</p>
            <p class="text-2xl font-bold text-gray-900 mt-2">${escapeHtml(String(summary.hours || securityAlertsFilterState.hours))}h</p>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-4 mb-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-3">Telegram 推送</h3>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <label class="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" id="telegramAlertEnabled" ${tg.enabled ? 'checked' : ''}>
              启用 Telegram 推送
            </label>
            <input type="text" id="telegramBotToken" placeholder="Bot Token" class="px-3 py-2 border border-gray-300 rounded-lg text-sm" value="">
            <input type="text" id="telegramChatId" placeholder="Chat ID" class="px-3 py-2 border border-gray-300 rounded-lg text-sm" value="">
          </div>
          <div class="text-xs text-gray-500 mb-3">
            已保存：Token ${tg.botTokenMasked || '未设置'}，Chat ID ${tg.chatIdMasked || '未设置'}
            （留空则保持当前已保存值）
          </div>
          <div class="flex gap-2">
            <button onclick="saveTelegramAlertConfig(false)" class="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition">保存配置</button>
            <button onclick="saveTelegramAlertConfig(true)" class="px-3 py-2 bg-indigo-100 text-indigo-700 rounded-lg text-sm hover:bg-indigo-200 transition">保存并发送测试</button>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-4 mb-6">
          <h3 class="text-lg font-semibold text-gray-900 mb-3">Top Source IPs</h3>
          <div class="flex flex-wrap gap-2">
            ${topIps.length === 0 ? '<span class="text-sm text-gray-500">No data</span>' : topIps.map(item => `
              <span class="px-2 py-1 text-xs bg-red-50 text-red-700 rounded border border-red-100">
                ${escapeHtml(item.ip)} (${escapeHtml(String(item.count))})
              </span>
            `).join('')}
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Read</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Path</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                  <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody class="bg-white divide-y divide-gray-200">
                ${alerts.length === 0 ? `
                  <tr><td colspan="8" class="px-4 py-8 text-center text-gray-500">当前窗口暂无高危告警</td></tr>
                ` : alerts.map(alert => `
                  <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">${escapeHtml(formatServerTime(alert.timestamp))}</td>
                    <td class="px-4 py-3 text-sm">
                      ${alert.isRead ? '<span class="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">已读</span>' : '<span class="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-700">未读</span>'}
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-900">${escapeHtml(alert.category || '-')}</td>
                    <td class="px-4 py-3 text-sm text-gray-900">${escapeHtml(alert.method || '-')}</td>
                    <td class="px-4 py-3 text-sm text-gray-900 max-w-xl truncate" title="${escapeHtml(alert.path || '-')}">${escapeHtml(alert.path || '-')}</td>
                    <td class="px-4 py-3 text-sm">${renderAlertStatus(alert.statusCode)}</td>
                    <td class="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">${escapeHtml(alert.ip || '-')}</td>
                    <td class="px-4 py-3 text-sm">
                      ${alert.isRead ? '-' : `<button onclick="markSecurityAlertRead(${alert.id})" class="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200">标记已读</button>`}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    const unread = Number(summary.unread || 0);
    const countEl = document.getElementById('securityAlertsCount');
    const buttonEl = document.getElementById('securityAlertsButton');
    const dotEl = document.getElementById('securityAlertsDot');
    if (countEl) countEl.textContent = String(unread);
    updateSecurityAlertButtonStyle(unread, buttonEl, dotEl);
  } catch (error) {
    console.error('加载高危告警失败:', error);
    container.innerHTML = '<div class="text-center py-12 text-red-500">加载失败</div>';
  }
}

function renderAlertStatus(statusCode) {
  if (typeof statusCode !== 'number') return '<span class="text-gray-500">-</span>';
  if (statusCode >= 200 && statusCode < 300) {
    return `<span class="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">${escapeHtml(String(statusCode))}</span>`;
  }
  if (statusCode >= 400) {
    return `<span class="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">${escapeHtml(String(statusCode))}</span>`;
  }
  return `<span class="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">${escapeHtml(String(statusCode))}</span>`;
}

function changeSecurityAlertWindow(hours) {
  const parsed = parseInt(hours, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return;
  securityAlertsFilterState.hours = parsed;
  loadSecurityAlerts();
  refreshSecurityAlertsCount();
}

function toggleSecurityAlertsUnreadOnly() {
  securityAlertsFilterState.unreadOnly = !securityAlertsFilterState.unreadOnly;
  loadSecurityAlerts();
}

async function markSecurityAlertRead(id) {
  try {
    await adminApiRequest(`${API_BASE}/admin/security/alerts/mark-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] })
    });
    loadSecurityAlerts();
    refreshSecurityAlertsCount();
  } catch (error) {
    console.error('标记告警已读失败:', error);
    showToast('标记已读失败', 'error');
  }
}

async function markAllSecurityAlertsRead() {
  try {
    await adminApiRequest(`${API_BASE}/admin/security/alerts/mark-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true, hours: securityAlertsFilterState.hours })
    });
    showToast('已全部标记为已读', 'success');
    loadSecurityAlerts();
    refreshSecurityAlertsCount();
  } catch (error) {
    console.error('全部标记已读失败:', error);
    showToast('操作失败', 'error');
  }
}

async function saveTelegramAlertConfig(testSend) {
  const enabled = document.getElementById('telegramAlertEnabled')?.checked || false;
  const botToken = document.getElementById('telegramBotToken')?.value?.trim() || '';
  const chatId = document.getElementById('telegramChatId')?.value?.trim() || '';

  try {
    await adminApiRequest(`${API_BASE}/admin/security/alerts/telegram-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled,
        botToken,
        chatId,
        test: Boolean(testSend)
      })
    });
    showToast(testSend ? '配置已保存并发送测试消息' : 'Telegram 配置已保存', 'success');
    loadSecurityAlerts();
  } catch (error) {
    console.error('保存 Telegram 配置失败:', error);
    showToast(error.data?.message || '保存配置失败', 'error');
  }
}

// 日志过滤状态
let logsFilterState = {
  page: 1,        // 当前页码
  limit: 30,       // 每页条数
  start_date: '',  // 开始日期
  end_date: '',    // 结束日期
  days: 30,        // 默认显示最近30天（如果未指定日期范围）
  action: '',
  operator: '',
  target_type: '',
  ip_address: '',
  details: ''      // Details模糊匹配
};

// 加载操作日志
async function loadLogs() {
  const container = document.getElementById('logsTab');
  if (!container) return;
  
  // 先清空容器，防止旧内容残留
  container.innerHTML = '';
  
  try {
    // 获取过滤器选项（用于下拉菜单）
    const optionsData = await adminApiRequest(`${API_BASE}/admin/logs/filter-options`);
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
    
    const data = await adminApiRequest(`${API_BASE}/admin/logs?${params.toString()}`);
    
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
              ${escapeHtml(dateRangeText)} | Total: <span class="font-semibold">${escapeHtml(String(pagination.total))}</span> logs
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
                  value="${escapeHtml(logsFilterState.start_date)}"
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onchange="updateLogDateRange()"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">End Date</label>
                <input 
                  type="date" 
                  id="logEndDate"
                  value="${escapeHtml(logsFilterState.end_date)}"
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
                    <option value="${escapeHtml(action)}" ${logsFilterState.action === action ? 'selected' : ''}>${escapeHtml(action)}</option>
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
                    <option value="${escapeHtml(type)}" ${logsFilterState.target_type === type ? 'selected' : ''}>${escapeHtml(type)}</option>
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
                    <option value="${escapeHtml(op)}" ${logsFilterState.operator === op ? 'selected' : ''}>${escapeHtml(op)}</option>
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
                  value="${escapeHtml(logsFilterState.details)}"
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
                  value="${escapeHtml(logsFilterState.ip_address)}"
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
// 格式化时间显示（不进行时区转换，直接显示服务器时间）
// 数据库返回的时间是服务器本地时间（datetime('now', 'localtime')）
// 直接格式化显示，不进行时区转换
function formatServerTime(timeString) {
  if (!timeString) return '-';
  try {
    // 尝试匹配 YYYY-MM-DD HH:mm:ss 格式（SQLite datetime('now', 'localtime') 的格式）
    const match = timeString.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      // 直接格式化显示，不进行时区转换
      const [, year, month, day, hour, minute, second] = match;
      return `${month}/${day}/${year} ${hour}:${minute}:${second}`;
    }
    // 如果不是标准格式，尝试解析为Date对象
    const date = new Date(timeString);
    if (!isNaN(date.getTime())) {
      // 使用原始时间字符串的日期部分，避免时区转换
      // 如果timeString包含时区信息，直接提取日期时间部分
      const dateStr = timeString.split('T')[0]; // 提取日期部分
      const timeStr = timeString.split('T')[1]?.split('.')[0] || timeString.split(' ')[1] || '';
      if (dateStr && timeStr) {
        const [year, month, day] = dateStr.split('-');
        return `${month}/${day}/${year} ${timeStr}`;
      }
      // 最后备选方案：使用Date对象，但显示原始值
      return timeString;
    }
    return timeString;
  } catch (e) {
    return timeString;
  }
}

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
            // 转义value以防止HTML注入（在构建时就转义）
            const valueStr = typeof value === 'string' ? value : (value === null || value === undefined ? '' : String(value));
            const escapedValue = escapeHtml(valueStr);
            return `${displayKey}: ${escapedValue}`;
          })
          .join(', ');
      } else {
        const detailsStr = typeof detailsObj === 'string' ? detailsObj : String(detailsObj);
        detailsText = escapeHtml(detailsStr);
      }
    }
  } catch (e) {
    // 如果解析失败，直接使用原始details并转义
    const rawDetails = log.details || '-';
    detailsText = escapeHtml(rawDetails);
  }
  
  // detailsText已经在构建时进行了转义，这里直接使用
  const escapedDetailsText = detailsText;
  
  // 操作类型显示 - 不同颜色符合网站整体色调
  const actionMap = {
    'CREATE': { text: 'Create', class: 'bg-green-100 text-green-800' },      // 绿色 - 成功/新增操作
    'UPDATE': { text: 'Update', class: 'bg-blue-100 text-blue-800' },        // 蓝色 - 信息/修改操作
    'DELETE': { text: 'Delete', class: 'bg-red-100 text-red-800' },          // 红色 - 危险/删除操作
    'LOGIN': { text: 'Login', class: 'bg-purple-100 text-purple-800' },      // 紫色 - 主色调，登录操作
    'USER_LOGIN': { text: 'User Login', class: 'bg-purple-100 text-purple-800' }  // 紫色 - 主色调，用户登录
  };
  const actionInfo = actionMap[log.action] || { text: log.action, class: 'bg-gray-100 text-gray-800' };
  
  // 操作者显示
  const operatorName = log.admin_username || (log.action === 'USER_LOGIN' ? 'System' : '-');
  
  // 为data属性准备转义后的值（detailsText已经转义，需要再次转义用于HTML属性）
  // 注意：detailsText已经是转义后的HTML实体，但用于HTML属性时还需要确保引号被转义
  const detailsForDataAttr = escapeHtml(detailsText.toLowerCase());
  
  // 限制Details显示长度（100个字符）
  // 注意：detailsText已经是转义后的HTML实体，我们基于转义后的长度来判断
  const MAX_DETAILS_LENGTH = 100;
  const isDetailsLong = escapedDetailsText.length > MAX_DETAILS_LENGTH;
  // 如果内容过长，截断转义后的文本
  const truncatedDetails = isDetailsLong ? escapedDetailsText.substring(0, MAX_DETAILS_LENGTH) + '...' : escapedDetailsText;
  
  // 生成唯一的日志ID用于存储和查找
  const logId = `log-${log.id || Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // 存储日志数据到全局变量（用于显示完整详情）
  if (!window.operationLogsData) {
    window.operationLogsData = {};
  }
  window.operationLogsData[logId] = {
    details: escapedDetailsText,
    fullDetails: log.details || '-',
    created_at: log.created_at,
    action: log.action,
    operator: operatorName,
    target_type: log.target_type || log.resource_type || '-',
    ip_address: log.ip_address || '-'
  };
  
  return `
    <tr class="hover:bg-gray-50 log-row" 
        data-time="${escapeHtml(log.created_at || '')}"
        data-operator="${escapeHtml(operatorName.toLowerCase())}"
        data-action="${escapeHtml(log.action || '')}"
        data-resource="${escapeHtml((log.target_type || log.resource_type || '').toLowerCase())}"
        data-details="${detailsForDataAttr}"
        data-ip="${escapeHtml(log.ip_address || '')}"
    >
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${escapeHtml(formatServerTime(log.created_at))}</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${escapeHtml(operatorName)}</td>
      <td class="px-6 py-4 whitespace-nowrap text-sm">
        <span class="px-2 py-1 text-xs rounded-full ${actionInfo.class}">
          ${escapeHtml(actionInfo.text)}
        </span>
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${escapeHtml(log.target_type || log.resource_type || '-')}</td>
      <td class="px-6 py-4 text-sm text-gray-700 max-w-md">
        <div class="flex items-start gap-2">
          <div class="truncate flex-1" title="${escapedDetailsText}">${truncatedDetails}</div>
          ${isDetailsLong ? `
            <button 
              onclick="showOperationLogDetails('${logId}')" 
              class="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 hover:bg-blue-50 rounded whitespace-nowrap flex-shrink-0"
              title="查看完整内容"
            >
              查看全部
            </button>
          ` : ''}
        </div>
      </td>
      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${escapeHtml(log.ip_address || '-')}</td>
    </tr>
  `;
}

// 显示操作日志的完整Details
function showOperationLogDetails(logId) {
  if (!window.operationLogsData || !window.operationLogsData[logId]) {
    showToast('日志数据未找到', 'error');
    return;
  }
  
  const logData = window.operationLogsData[logId];
  
  // 创建详情模态框
  const detailsModal = document.createElement('div');
  detailsModal.className = 'modal active';
  detailsModal.onclick = function(e) {
    if (e.target === detailsModal) {
      detailsModal.remove();
    }
  };
  
  const detailsHtml = `
    <div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onclick="event.stopPropagation()">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-gray-900">日志详情</h3>
        <button onclick="this.closest('.modal').remove()" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
      </div>
      <div class="space-y-4">
        <div>
          <h4 class="text-sm font-semibold text-gray-700 mb-2">时间</h4>
          <p class="text-sm text-gray-600">${escapeHtml(formatServerTime(logData.created_at))}</p>
        </div>
        <div>
          <h4 class="text-sm font-semibold text-gray-700 mb-2">操作者</h4>
          <p class="text-sm text-gray-600">${escapeHtml(logData.operator)}</p>
        </div>
        <div>
          <h4 class="text-sm font-semibold text-gray-700 mb-2">操作类型</h4>
          <p class="text-sm text-gray-600">${escapeHtml(logData.action)}</p>
        </div>
        <div>
          <h4 class="text-sm font-semibold text-gray-700 mb-2">资源类型</h4>
          <p class="text-sm text-gray-600">${escapeHtml(logData.target_type)}</p>
        </div>
        <div>
          <h4 class="text-sm font-semibold text-gray-700 mb-2">IP地址</h4>
          <p class="text-sm text-gray-600">${escapeHtml(logData.ip_address)}</p>
        </div>
        <div>
          <h4 class="text-sm font-semibold text-gray-700 mb-2">详细信息</h4>
          <div class="p-3 bg-gray-50 rounded text-sm text-gray-700 whitespace-pre-wrap break-words max-h-96 overflow-y-auto">
            ${logData.details}
          </div>
        </div>
      </div>
      <div class="mt-6 flex justify-end">
        <button onclick="this.closest('.modal').remove()" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium">关闭</button>
      </div>
    </div>
  `;
  
  detailsModal.innerHTML = detailsHtml;
  document.body.appendChild(detailsModal);
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

// 订单分页函数
function goToOrderPage(page) {
  const totalPages = parseInt(document.querySelector('#orderPageInput')?.max || 1);
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  
  ordersFilterState.page = page;
  loadOrders();
}

// 重置并加载订单（筛选时重置到第一页）
function resetAndLoadOrders() {
  ordersFilterState.page = 1;
  loadOrders();
}

// 日志分页函数
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
// 加载API管理页面（性能优化：使用DocumentFragment批量插入）
async function loadApiManagement() {
  try {
    const data = await adminApiRequest(`${API_BASE}/admin/custom-apis`);
    
    if (data.success) {
      // 渲染系统API列表（使用DocumentFragment优化）
      const systemApisBody = document.getElementById('systemApisTableBody');
      if (systemApisBody) {
        const fragment = document.createDocumentFragment();
        
        if (data.data.systemApis && data.data.systemApis.length > 0) {
          data.data.systemApis.forEach(api => {
            const row = document.createElement('tr');
            const methodClass = api.method === 'GET' ? 'bg-green-100 text-green-800' :
                              api.method === 'POST' ? 'bg-blue-100 text-blue-800' :
                              api.method === 'PUT' ? 'bg-yellow-100 text-yellow-800' :
                              api.method === 'DELETE' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800';
            
            row.innerHTML = `
              <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">${escapeHtml(api.path)}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded ${methodClass}">${escapeHtml(api.method)}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded ${api.requires_token ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'}">${api.requires_token ? 'Yes' : 'No'}</span>
              </td>
              <td class="px-6 py-4 text-sm text-gray-500">${escapeHtml(api.description || '-')}</td>
            `;
            fragment.appendChild(row);
          });
        } else {
          const row = document.createElement('tr');
          row.innerHTML = '<td colspan="4" class="px-6 py-4 text-center text-gray-500">No system APIs</td>';
          fragment.appendChild(row);
        }
        
        systemApisBody.innerHTML = '';
        systemApisBody.appendChild(fragment);
      }

      // 渲染自定义API列表（使用DocumentFragment优化）
      const customApisBody = document.getElementById('customApisTableBody');
      if (customApisBody) {
        const fragment = document.createDocumentFragment();
        
        if (data.data.customApis && data.data.customApis.length > 0) {
          data.data.customApis.forEach(api => {
            const row = document.createElement('tr');
            const methodClass = api.method === 'GET' ? 'bg-green-100 text-green-800' :
                              api.method === 'POST' ? 'bg-blue-100 text-blue-800' :
                              api.method === 'PUT' ? 'bg-yellow-100 text-yellow-800' :
                              api.method === 'DELETE' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800';
            
            row.innerHTML = `
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${escapeHtml(api.name)}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">/api/custom${escapeHtml(api.path)}</td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded ${methodClass}">${escapeHtml(api.method)}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded ${api.requires_token ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'}">${api.requires_token ? 'Yes' : 'No'}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded ${api.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">${api.status === 'active' ? 'Active' : 'Inactive'}</span>
              </td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <button onclick="viewApiLogs(${api.id})" class="text-green-600 hover:text-green-900 mr-3">📋 Logs</button>
                <button onclick="editApi(${api.id})" class="text-blue-600 hover:text-blue-900 mr-3">Edit</button>
                <button onclick="deleteApi(${api.id})" class="text-red-600 hover:text-red-900">Delete</button>
              </td>
            `;
            fragment.appendChild(row);
          });
        } else {
          const row = document.createElement('tr');
          row.innerHTML = '<td colspan="6" class="px-6 py-4 text-center text-gray-500">No custom APIs. Click "Add Custom API" to create one.</td>';
          fragment.appendChild(row);
        }
        
        customApisBody.innerHTML = '';
        customApisBody.appendChild(fragment);
      }
    }
  } catch (error) {
    console.error('加载API管理页面失败:', error);
    showToast('Failed to load API management: ' + (error.data?.message || error.message), 'error');
  }
}

// 备份自定义API（确保全局作用域）
window.backupCustomApis = async function backupCustomApis() {
  try {
    showToast('正在备份自定义API...', 'info');
    
    const response = await adminApiRequest(`${API_BASE}/admin/custom-apis/backup`, {
      method: 'POST'
    });

    if (response.success && response.data) {
      // 将数据转换为JSON字符串
      const jsonString = JSON.stringify(response.data, null, 2);
      
      // 创建Blob对象
      const blob = new Blob([jsonString], { type: 'application/json' });
      
      // 生成文件名（包含时间戳）
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const fileName = `custom-apis-backup-${timestamp}.json`;
      
      // 创建下载链接
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast(`备份成功！已导出 ${response.data.apiCount} 个API`, 'success');
    } else {
      showToast('备份失败: ' + (response.message || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('备份自定义API失败:', error);
    showToast('备份失败: ' + (error.message || '未知错误'), 'error');
  }
}

// 恢复自定义API（确保全局作用域）
window.restoreCustomApis = async function restoreCustomApis() {
  try {
    // 创建文件输入元素
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    
    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) {
        return;
      }

      // 验证文件类型
      if (!file.name.endsWith('.json')) {
        showToast('请选择JSON格式的备份文件', 'error');
        return;
      }

      // 读取文件内容
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const fileContent = e.target.result;
          const backupData = JSON.parse(fileContent);

          // 验证备份数据格式
          if (!backupData.apis || !Array.isArray(backupData.apis)) {
            showToast('备份文件格式无效：缺少API列表', 'error');
            return;
          }

          // 显示确认对话框
          const confirmed = confirm(
            `⚠️ 警告：恢复操作将清空当前所有自定义API数据！\n\n` +
            `备份信息：\n` +
            `- 备份时间：${backupData.backupTime || '未知'}\n` +
            `- API数量：${backupData.apiCount || backupData.apis.length}\n\n` +
            `确定要继续吗？`
          );

          if (!confirmed) {
            return;
          }

          showToast('正在恢复自定义API...', 'info');

          // 调用恢复API
          const response = await adminApiRequest(`${API_BASE}/admin/custom-apis/restore`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ backupData })
          });

          if (response.success) {
            showToast(
              `恢复成功！已恢复 ${response.data.restoredCount} 个API`,
              'success'
            );
            // 刷新API列表
            loadApiManagement();
          } else {
            showToast('恢复失败: ' + (response.message || '未知错误'), 'error');
          }
        } catch (error) {
          console.error('解析备份文件失败:', error);
          showToast('备份文件格式错误: ' + error.message, 'error');
        }
      };

      reader.onerror = () => {
        showToast('读取文件失败', 'error');
      };

      reader.readAsText(file);
    };

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  } catch (error) {
    console.error('恢复自定义API失败:', error);
    showToast('恢复失败: ' + (error.message || '未知错误'), 'error');
  }
}

// JSONEditor 实例
let jsonEditorInstance = null;

// 初始化 JSONEditor
async function initJSONEditor(containerId, initialContent = null) {
  // 如果编辑器已存在，先销毁
  if (jsonEditorInstance) {
    try {
      jsonEditorInstance.destroy();
    } catch (e) {
      console.warn('Failed to destroy existing editor:', e);
    }
    jsonEditorInstance = null;
  }
  
  const container = document.getElementById(containerId);
  if (!container) {
    console.error('JSONEditor container not found:', containerId);
    return;
  }
  
  try {
    // 动态导入 vanilla-jsoneditor
    const { createJSONEditor } = await import('/js/vanilla-jsoneditor.js');
    
    // 解析初始内容
    let content = { text: '{}' };
    if (initialContent) {
      try {
        const parsed = typeof initialContent === 'string' ? JSON.parse(initialContent) : initialContent;
        content = { json: parsed };
      } catch (e) {
        content = { text: initialContent };
      }
    }
    
    // 创建编辑器
    jsonEditorInstance = createJSONEditor({
      target: container,
      props: {
        content,
        mode: 'tree', // 默认使用树形视图
        onChange: (updatedContent) => {
          // 更新隐藏的 textarea 用于表单提交
          const textarea = document.getElementById('apiResponseContent');
          if (textarea) {
            try {
              if (updatedContent.json) {
                textarea.value = JSON.stringify(updatedContent.json, null, 2);
              } else if (updatedContent.text) {
                textarea.value = updatedContent.text;
              }
            } catch (e) {
              console.warn('Failed to update textarea:', e);
            }
          }
        }
      }
    });
  } catch (error) {
    console.error('Failed to initialize JSONEditor:', error);
    showToast('Failed to load JSON editor. Please refresh the page.', 'error');
  }
}

// 显示API模态框
async function showApiModal(apiId = null) {
  const modal = document.getElementById('apiModal');
  const form = document.getElementById('apiForm');
  const title = document.getElementById('apiModalTitle');
  
  // 重置表单
  form.reset();
  document.getElementById('apiId').value = '';
  document.getElementById('apiRequiresToken').checked = false;
  document.getElementById('apiStatus').value = 'active';
  
  // 上传按钮事件已在DOMContentLoaded中使用全局事件委托绑定，无需在此处绑定
  
  if (apiId) {
    // 编辑模式
    title.textContent = 'Edit Custom API';
    // 先显示模态框，然后加载数据并初始化编辑器
    modal.classList.add('active');
    await loadApiForEdit(apiId);
  } else {
    // 新增模式
    title.textContent = 'Add Custom API';
    // 显示模态框
    modal.classList.add('active');
    // 设置默认JSON并初始化编辑器
    const defaultJson = {
      success: true,
      data: "example"
    };
    await initJSONEditor('apiResponseContentEditor', JSON.stringify(defaultJson, null, 2));
    document.getElementById('apiResponseContent').value = JSON.stringify(defaultJson, null, 2);
  }
}

// 加载API数据用于编辑
async function loadApiForEdit(apiId) {
  try {
    const data = await adminApiRequest(`${API_BASE}/admin/custom-apis`);
    
    if (data.success) {
      const api = data.data.customApis.find(a => a.id === apiId);
      if (api) {
        document.getElementById('apiId').value = api.id;
        document.getElementById('apiName').value = api.name;
        document.getElementById('apiPath').value = api.path;
        document.getElementById('apiMethod').value = api.method;
        document.getElementById('apiRequiresToken').checked = api.requires_token;
        document.getElementById('apiDescription').value = api.description || '';
        document.getElementById('apiStatus').value = api.status;
        
        // 初始化 JSONEditor 并加载数据
        await initJSONEditor('apiResponseContentEditor', api.response_content);
        document.getElementById('apiResponseContent').value = api.response_content;
      }
    }
  } catch (error) {
    console.error('加载API数据失败:', error);
    showToast('Failed to load API data: ' + (error.data?.message || error.message), 'error');
  }
}

// 关闭API模态框
function closeApiModal(event) {
  if (event) {
    // 如果点击的是模态框背景，关闭模态框
    if (event.target === event.currentTarget) {
      const modal = document.getElementById('apiModal');
      modal.classList.remove('active');
      // 清理编辑器实例
      if (jsonEditorInstance) {
        try {
          jsonEditorInstance.destroy();
        } catch (e) {
          console.warn('Failed to destroy editor:', e);
        }
        jsonEditorInstance = null;
      }
    }
  } else {
    // 直接调用关闭
    const modal = document.getElementById('apiModal');
    if (modal) {
      modal.classList.remove('active');
    }
    // 清理编辑器实例
    if (jsonEditorInstance) {
      try {
        jsonEditorInstance.destroy();
      } catch (e) {
        console.warn('Failed to destroy editor:', e);
      }
      jsonEditorInstance = null;
    }
  }
}

// 编辑API
function editApi(apiId) {
  showApiModal(apiId);
}

// 上传自定义API图片函数已在文件开头定义，此处保留注释以避免重复定义

// 删除API
async function deleteApi(apiId) {
  if (!confirm('Are you sure you want to delete this API?')) {
    return;
  }
  
  try {
    const data = await adminApiRequest(`${API_BASE}/admin/custom-apis/${apiId}`, {
      method: 'DELETE'
    });
    
    if (data.success) {
      showToast('API deleted successfully', 'success');
      loadApiManagement();
    }
  } catch (error) {
    console.error('删除API失败:', error);
    showToast('Failed to delete API: ' + (error.data?.message || error.message), 'error');
  }
}

// API日志查看相关变量
let currentApiLogsApiId = null;
let currentApiLogsPage = 1;
let currentApiLogsTotalPages = 1;

// 查看API日志
async function viewApiLogs(apiId) {
  currentApiLogsApiId = apiId;
  currentApiLogsPage = 1;
  
  // 获取API名称
  try {
    const apiData = await adminApiRequest(`${API_BASE}/admin/custom-apis`);
    if (apiData.success && apiData.data.customApis) {
      const api = apiData.data.customApis.find(a => a.id === apiId);
      if (api) {
        document.getElementById('apiLogsModalTitle').textContent = `API Logs - ${api.name}`;
      }
    }
  } catch (error) {
    console.error('获取API信息失败:', error);
  }
  
  await loadApiLogs();
  document.getElementById('apiLogsModal').classList.add('active');
}

// 关闭API日志模态框
function closeApiLogsModal(event) {
  if (event && event.target !== event.currentTarget) {
    return;
  }
  document.getElementById('apiLogsModal').classList.remove('active');
  currentApiLogsApiId = null;
  currentApiLogsPage = 1;
}

// 加载API日志
async function loadApiLogs() {
  if (!currentApiLogsApiId) return;
  
  try {
    const data = await adminApiRequest(`${API_BASE}/admin/custom-apis/${currentApiLogsApiId}/logs?page=${currentApiLogsPage}&limit=20`);
    
    if (data.success) {
      const logs = data.data.logs;
      currentApiLogsTotalPages = data.data.totalPages;
      
      // 更新分页信息
      document.getElementById('apiLogsPaginationInfo').textContent = 
        `Page ${currentApiLogsPage} of ${currentApiLogsTotalPages} (Total: ${data.data.total})`;
      
      // 更新分页按钮
      document.getElementById('apiLogsPrevBtn').disabled = currentApiLogsPage <= 1;
      document.getElementById('apiLogsNextBtn').disabled = currentApiLogsPage >= currentApiLogsTotalPages;
      
      // 渲染日志列表
      const logsTableBody = document.getElementById('apiLogsTableBody');
      if (logs.length === 0) {
        logsTableBody.innerHTML = '<tr><td colspan="7" class="px-4 py-8 text-center text-gray-500">No logs found</td></tr>';
      } else {
        // 存储日志数据到全局变量，使用索引访问
        if (!window.apiLogsData) {
          window.apiLogsData = {};
        }
        
        logsTableBody.innerHTML = logs.map((log, index) => {
          const logId = `log-${log.id || index}`;
          const dataKey = `${currentApiLogsApiId}-${currentApiLogsPage}-${index}`;
          window.apiLogsData[dataKey] = log;
          
          const escapedRequestPath = escapeHtml(log.request_path || '-');
          const escapedRequestMethod = escapeHtml(log.request_method || '-');
          const escapedResponseStatus = escapeHtml(String(log.response_status || '-'));
          const escapedResponseTime = log.response_time_ms ? escapeHtml(String(log.response_time_ms)) + 'ms' : '-';
          const escapedIpAddress = escapeHtml(log.ip_address || '-');
          const escapedDataKey = escapeHtml(dataKey);
          
          return `
            <tr class="hover:bg-gray-50" id="${logId}">
              <td class="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">${escapeHtml(log.created_at || '-')}</td>
              <td class="px-4 py-2 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded ${
                  log.request_method === 'GET' ? 'bg-green-100 text-green-800' :
                  log.request_method === 'POST' ? 'bg-blue-100 text-blue-800' :
                  log.request_method === 'PUT' ? 'bg-yellow-100 text-yellow-800' :
                  log.request_method === 'DELETE' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }">${escapedRequestMethod}</span>
              </td>
              <td class="px-4 py-2 text-xs font-mono text-gray-700 max-w-xs truncate" title="${escapedRequestPath}">${escapedRequestPath}</td>
              <td class="px-4 py-2 whitespace-nowrap">
                <span class="px-2 py-1 text-xs font-semibold rounded ${
                  log.response_status >= 200 && log.response_status < 300 ? 'bg-green-100 text-green-800' :
                  log.response_status >= 400 && log.response_status < 500 ? 'bg-yellow-100 text-yellow-800' :
                  log.response_status >= 500 ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }">${escapedResponseStatus}</span>
              </td>
              <td class="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">${escapedResponseTime}</td>
              <td class="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">${escapedIpAddress}</td>
              <td class="px-4 py-2">
                <button onclick="showLogDetails('${escapedDataKey}')" 
                        class="text-blue-600 hover:text-blue-800 text-xs font-medium px-2 py-1 hover:bg-blue-50 rounded">View</button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (error) {
    console.error('加载API日志失败:', error);
    showToast('Failed to load API logs: ' + (error.data?.message || error.message), 'error');
  }
}

// 加载日志分页
async function loadApiLogsPage(direction) {
  if (direction === 'prev' && currentApiLogsPage > 1) {
    currentApiLogsPage--;
  } else if (direction === 'next' && currentApiLogsPage < currentApiLogsTotalPages) {
    currentApiLogsPage++;
  }
  await loadApiLogs();
}

// 显示日志详情
function showLogDetails(dataKey) {
  if (!window.apiLogsData || !window.apiLogsData[dataKey]) {
    showToast('Log data not found', 'error');
    return;
  }
  
  const log = window.apiLogsData[dataKey];
  
  // 创建详情模态框
  const detailsModal = document.createElement('div');
  detailsModal.className = 'modal active';
  detailsModal.onclick = function(e) {
    if (e.target === detailsModal) {
      detailsModal.remove();
    }
  };
  
  const detailsHtml = `
    <div class="bg-white rounded-2xl shadow-2xl max-w-4xl w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onclick="event.stopPropagation()">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-xl font-bold text-gray-900">Log Details</h3>
        <button onclick="this.closest('.modal').remove()" class="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
      </div>
      <div class="space-y-4">
        <div>
          <h4 class="text-sm font-semibold text-gray-700 mb-2">Request Headers</h4>
          <pre class="p-3 bg-gray-100 rounded text-xs overflow-x-auto max-h-40 overflow-y-auto">${JSON.stringify(log.request_headers || {}, null, 2)}</pre>
        </div>
        ${log.request_query && Object.keys(log.request_query).length > 0 ? `
        <div>
          <h4 class="text-sm font-semibold text-gray-700 mb-2">Query Parameters</h4>
          <pre class="p-3 bg-gray-100 rounded text-xs overflow-x-auto max-h-40 overflow-y-auto">${JSON.stringify(log.request_query, null, 2)}</pre>
        </div>
        ` : ''}
        ${log.request_body && log.request_body !== '{}' && JSON.stringify(log.request_body) !== '{}' ? `
        <div>
          <h4 class="text-sm font-semibold text-gray-700 mb-2">Request Body</h4>
          <pre class="p-3 bg-gray-100 rounded text-xs overflow-x-auto max-h-40 overflow-y-auto">${JSON.stringify(log.request_body, null, 2)}</pre>
        </div>
        ` : ''}
        <div>
          <h4 class="text-sm font-semibold text-gray-700 mb-2">Response Body</h4>
          <pre class="p-3 bg-gray-100 rounded text-xs overflow-x-auto max-h-60 overflow-y-auto">${JSON.stringify(log.response_body || {}, null, 2)}</pre>
        </div>
        ${log.error_message ? `
        <div>
          <h4 class="text-sm font-semibold text-red-700 mb-2">Error Message</h4>
          <div class="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">${escapeHtml(log.error_message)}</div>
        </div>
        ` : ''}
        ${log.user_agent ? `
        <div>
          <h4 class="text-sm font-semibold text-gray-700 mb-2">User Agent</h4>
          <p class="text-xs text-gray-600 break-all">${escapeHtml(log.user_agent)}</p>
        </div>
        ` : ''}
      </div>
      <div class="mt-4 flex justify-end">
        <button onclick="this.closest('.modal').remove()" class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg">Close</button>
      </div>
    </div>
  `;
  
  detailsModal.innerHTML = detailsHtml;
  document.body.appendChild(detailsModal);
}

// 处理API表单提交
document.addEventListener('DOMContentLoaded', () => {
  const apiForm = document.getElementById('apiForm');
  if (apiForm) {
    apiForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const apiId = document.getElementById('apiId').value;
      // 获取Response Content（从隐藏的 textarea，由 JSONEditor 的 onChange 更新）
      let responseContent = document.getElementById('apiResponseContent').value;
      
      // 如果 textarea 为空，尝试从编辑器获取
      if (!responseContent && jsonEditorInstance) {
        try {
          const content = jsonEditorInstance.get();
          if (content.json) {
            responseContent = JSON.stringify(content.json, null, 2);
          } else if (content.text) {
            responseContent = content.text;
          }
        } catch (e) {
          console.warn('Failed to get content from editor:', e);
        }
      }
      
      const formData = {
        name: document.getElementById('apiName').value,
        path: document.getElementById('apiPath').value,
        method: document.getElementById('apiMethod').value,
        requires_token: document.getElementById('apiRequiresToken').checked,
        response_content: responseContent,
        description: document.getElementById('apiDescription').value,
        status: document.getElementById('apiStatus').value
      };
      
      // 验证JSON格式
      try {
        JSON.parse(formData.response_content);
      } catch (e) {
        showToast('Response content must be valid JSON: ' + e.message, 'error');
        return;
      }
      
      try {
        let data;
        if (apiId) {
          // 更新
          data = await adminApiRequest(`${API_BASE}/admin/custom-apis/${apiId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
          });
        } else {
          // 创建
          data = await adminApiRequest(`${API_BASE}/admin/custom-apis`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
          });
        }
        
        if (data.success) {
          showToast(apiId ? 'API updated successfully' : 'API created successfully', 'success');
          closeApiModal();
          loadApiManagement();
        }
      } catch (error) {
        console.error('保存API失败:', error);
        showToast('Failed to save API: ' + (error.data?.message || error.message), 'error');
      }
    });
  }
});

function loadAboutPage() {
  const container = document.getElementById('aboutTab');
  const version = '2.2.0';
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
            <p class="text-gray-700">A comprehensive online ordering system for ${currentStoreName.toLowerCase()} shops with cycle-based order management, discount rules, online payment (Stripe), feedback system, and advanced security features.</p>
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
              <li>Online payment (Stripe - Apple Pay, cards)</li>
              <li>Real-time discount viewing</li>
              <li>Feedback & complaint system</li>
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
              <li>Email configuration (SMTP)</li>
              <li>Security policy management</li>
              <li>IP lockout management</li>
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
              <li>Progressive account lockout</li>
              <li>IP-based rate limiting</li>
              <li>Login audit logging</li>
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
    
    const data = await adminApiRequest(`${API_BASE}/admin/backup/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: type })
    });
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
    const data = await adminApiRequest(`${API_BASE}/admin/backup/list`);
    
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
    // 改为直接使用 <a> 标签下载，避免 blob URL 和 CSP 限制，对大文件更友好
    const downloadUrl = `${API_BASE}/admin/backup/download/${encodeURIComponent(fileName)}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Download started', 'success');
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
    
    // 直接使用 fetch 而不是 adminApiRequest，避免响应体被重复读取
    const response = await fetch(`${API_BASE}/admin/backup/restore`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName })
    });
    
    // 检查响应状态
    if (!response.ok) {
      let errorMessage = `Restore failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        // 如果无法解析JSON，尝试读取文本（但只能读取一次）
        try {
          // 使用 response.clone() 来避免重复读取问题
          const clonedResponse = response.clone();
          const errorText = await clonedResponse.text();
          errorMessage = errorText || errorMessage;
        } catch (e2) {
          // 如果都失败了，使用默认错误消息
        }
      }
      hideGlobalLoading();
      showToast(errorMessage, 'error');
      return;
    }
    
    // 解析成功响应
    let data;
    try {
      data = await response.json();
    } catch (e) {
      hideGlobalLoading();
      showToast('Failed to parse server response', 'error');
      console.error('Failed to parse response:', e);
      return;
    }
    
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
    showToast(error.message || 'Restore failed', 'error');
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
    const data = await adminApiRequest(`${API_BASE}/admin/backup/delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName })
    });
    
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
    
    // 创建 AbortController 用于超时控制（10分钟超时，大文件可能需要较长时间）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000);
    
    let response;
    try {
      response = await fetch(`${API_BASE}/admin/backup/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Upload timeout: File is too large or network is too slow. Please try again.');
      }
      throw fetchError;
    }
    
    // 检查响应状态
    if (!response.ok) {
      let errorMessage = `Upload failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        // 如果无法解析JSON，尝试读取文本（但只能读取一次）
        try {
          // 使用 response.clone() 来避免重复读取问题
          const clonedResponse = response.clone();
          const errorText = await clonedResponse.text();
          errorMessage = errorText || errorMessage;
        } catch (e2) {
          // 如果都失败了，使用默认错误消息
        }
      }
      hideGlobalLoading();
      statusDiv.innerHTML = `<p class="text-red-600 text-sm">✗ ${errorMessage}</p>`;
      showToast(errorMessage, 'error');
      fileInput.value = '';
      return;
    }
    
    // 解析响应数据
    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      hideGlobalLoading();
      const errorMessage = 'Failed to parse server response';
      statusDiv.innerHTML = `<p class="text-red-600 text-sm">✗ ${errorMessage}</p>`;
      showToast(errorMessage, 'error');
      console.error('Failed to parse response:', jsonError);
      fileInput.value = '';
      return;
    }
    
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
    const errorMessage = error.message || 'Upload failed: Unknown error';
    statusDiv.innerHTML = `<p class="text-red-600 text-sm">✗ ${errorMessage}</p>`;
    console.error('Upload backup failed:', error);
    showToast(errorMessage, 'error');
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
    const data = await adminApiRequest(`${API_BASE}/admin/remote-backup/configs`);
    
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
    const data = await adminApiRequest(`${API_BASE}/admin/remote-backup/configs/${id}`, {
      method: 'DELETE'
    });
    
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
    
    const data = await adminApiRequest(`${API_BASE}/admin/remote-backup/configs/${configId}/push`, {
      method: 'POST'
    });
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
    const data = await adminApiRequest(`${API_BASE}/admin/remote-backup/receive-config`);
    
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
    
    const data = await adminApiRequest(`${API_BASE}/admin/remote-backup/receive-config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_token: apiToken,
        auto_restore: autoRestore
      })
    });
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
    const data = await adminApiRequest(`${API_BASE}/admin/remote-backup/push-logs?limit=50`);
    
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

// 加载 QZ Tray 证书状态
async function loadQZCertificates() {
  const statusContainer = document.getElementById('qzCertStatus');
  if (!statusContainer) return;
  
  try {
    const data = await adminApiRequest(`${API_BASE}/admin/qz-certificates`);
    
    if (data.success) {
      const hasCert = data.hasCertificate;
      const hasKey = data.hasPrivateKey;
      const updatedAt = data.updatedAt;
      const source = data.source || 'unknown';
      
      let statusHtml = '';
      if (hasCert && hasKey) {
        statusHtml = `
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-green-700">✅ Certificates loaded</p>
              <p class="text-xs text-gray-600 mt-1">
                Source: ${source === 'database' ? 'Database (recommended for cloud platforms)' : 'Filesystem'}
                ${updatedAt ? ` • Updated: ${new Date(updatedAt).toLocaleString()}` : ''}
              </p>
            </div>
            <span class="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded">Ready</span>
          </div>
        `;
      } else {
        statusHtml = `
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium text-yellow-700">⚠️ Certificates not uploaded</p>
              <p class="text-xs text-gray-600 mt-1">
                ${hasCert ? 'Certificate found, but private key is missing' : 
                  hasKey ? 'Private key found, but certificate is missing' : 
                  'No certificates found. System will fall back to filesystem if files exist.'}
              </p>
            </div>
            <span class="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded">Not Ready</span>
          </div>
        `;
      }
      
      statusContainer.innerHTML = statusHtml;
    } else {
      statusContainer.innerHTML = '<p class="text-sm text-red-600">Failed to load certificate status</p>';
    }
  } catch (error) {
    console.error('Load QZ certificates status failed:', error);
    statusContainer.innerHTML = '<p class="text-sm text-red-600">Failed to load certificate status</p>';
  }
}

// 保存当前表格视图的原始JSON数据（用于展开时获取完整数据）
let currentTableJsonData = null;

// 切换Response Content编辑器视图（表格/JSON）
// 注意：toggleResponseContentEditor 函数已移除，因为只使用树形视图

// 将JSON对象渲染为表格（支持多层嵌套）
function renderResponseContentTable(jsonObj, container = null, parentKey = '', level = 0) {
  const tableContainer = container || document.getElementById('responseContentTableContainer');
  if (!tableContainer) return;
  
  if (level === 0) {
    tableContainer.innerHTML = '';
  }
  
  // 处理根级别是数组的情况
  if (level === 0 && Array.isArray(jsonObj)) {
    // 根级别是数组，创建一个包装对象来渲染
    const wrapperObj = { '[root]': jsonObj };
    // 确保 currentTableJsonData 保存的是原始数组
    if (!currentTableJsonData || !Array.isArray(currentTableJsonData)) {
      currentTableJsonData = jsonObj;
    }
    renderResponseContentTable(wrapperObj, container, '', level);
    return;
  }
  
  if (!jsonObj || typeof jsonObj !== 'object') {
    return;
  }
  
  const keys = Object.keys(jsonObj);
  const indentClass = level > 0 ? `ml-${level * 4}` : '';
  const bgColor = level % 2 === 0 ? 'bg-white' : 'bg-gray-50';
  
  keys.forEach((key) => {
    const value = jsonObj[key];
    const fullKey = parentKey ? `${parentKey}.${key}` : key;
    const rowId = `row-${fullKey.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const isNested = (typeof value === 'object' && value !== null && !Array.isArray(value)) || Array.isArray(value);
    const isExpanded = isNested && (window.expandedKeys && window.expandedKeys.has(fullKey));
    
    // 创建行容器
    const rowWrapper = document.createElement('div');
    rowWrapper.className = `response-content-row-wrapper ${indentClass}`;
    rowWrapper.setAttribute('data-full-key', fullKey);
    rowWrapper.setAttribute('data-level', level);
    
    // 创建主行
    const row = document.createElement('div');
    row.className = `flex items-center space-x-2 p-2 ${bgColor} rounded border border-gray-200`;
    row.id = rowId;
    
    // 缩进指示器（用于嵌套）
    let indentHtml = '';
    if (level > 0) {
      indentHtml = `<div class="flex items-center" style="width: ${level * 20}px;">
        <div class="w-px h-6 bg-gray-300"></div>
      </div>`;
    }
    
    // 展开/折叠按钮（用于嵌套对象和数组）
    let expandBtn = '';
    if (isNested) {
      const itemCount = Array.isArray(value) ? value.length : Object.keys(value).length;
      const typeLabel = Array.isArray(value) ? 'Array' : 'Object';
      expandBtn = `
        <button type="button" 
                onclick="toggleResponseContentNested('${fullKey}')" 
                class="px-2 py-1 text-xs rounded transition ${isExpanded ? 'bg-blue-200 text-blue-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}"
                id="expand-btn-${fullKey.replace(/[^a-zA-Z0-9]/g, '-')}">
          ${isExpanded ? '▼' : '▶'} ${typeLabel} (${itemCount})
        </button>
      `;
    }
    
    let valueInput = '';
    let deleteBtn = `<button type="button" onclick="removeResponseContentRow('${fullKey}')" 
                            class="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200">Delete</button>`;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // 嵌套对象
      if (isExpanded) {
        // 已展开，值输入框显示为只读提示
        valueInput = `
          <span class="text-xs text-gray-500 italic">Nested object (expanded below)</span>
        `;
      } else {
        // 未展开，显示展开按钮和JSON预览
        const preview = JSON.stringify(value).substring(0, 50);
        valueInput = `
          ${expandBtn}
          <span class="text-xs text-gray-400 ml-2">${preview}${JSON.stringify(value).length > 50 ? '...' : ''}</span>
        `;
      }
    } else       if (Array.isArray(value)) {
        // 数组
        if (isExpanded) {
          // 已展开，值输入框显示为只读提示
          valueInput = `
            <span class="text-xs text-gray-500 italic">Array (expanded below)</span>
          `;
        } else {
          // 未展开，显示展开按钮和数组预览
          const preview = JSON.stringify(value).substring(0, 50);
          valueInput = `
            ${expandBtn}
            <span class="text-xs text-gray-400 ml-2">${preview}${JSON.stringify(value).length > 50 ? '...' : ''}</span>
          `;
        }
      } else if (typeof value === 'object' && value !== null) {
        // 嵌套对象（已经在上面处理了）
      } else {
      // 简单值
      const inputType = typeof value === 'number' ? 'number' : 
                       typeof value === 'boolean' ? 'checkbox' : 'text';
      
      if (inputType === 'checkbox') {
        valueInput = `
          <div class="flex items-center space-x-2">
            <input type="checkbox" 
                   data-key="${fullKey}"
                   data-parent-key="${parentKey}"
                   onchange="updateResponseContentValue('${fullKey}', this.checked)"
                   ${value ? 'checked' : ''}
                   class="w-4 h-4 text-blue-600 border-gray-300 rounded">
            <span class="text-xs text-gray-500">${value ? 'true' : 'false'}</span>
          </div>
        `;
      } else {
        const escapedValue = typeof value === 'string' ? value.replace(/"/g, '&quot;').replace(/'/g, '&#39;') : value;
        valueInput = `
          <input type="${inputType}" 
                 data-key="${fullKey}"
                 data-parent-key="${parentKey}"
                 onchange="updateResponseContentValue('${fullKey}', this.value)"
                 value="${escapedValue}"
                 class="flex-1 px-2 py-1 border border-gray-300 rounded text-sm">
        `;
      }
    }
    
    row.innerHTML = `
      ${indentHtml}
      <div class="flex-1 flex items-center space-x-2">
        <input type="text" 
               data-key="${fullKey}"
               data-parent-key="${parentKey}"
               value="${key.replace(/"/g, '&quot;')}"
               onchange="renameResponseContentKey('${fullKey}', this.value)"
               class="w-32 px-2 py-1 border border-gray-300 rounded text-sm font-medium">
        <span class="text-gray-400">:</span>
        ${valueInput}
      </div>
      ${deleteBtn}
    `;
    
    rowWrapper.appendChild(row);
    
    // 如果是嵌套对象/数组且已展开，递归渲染子项
    if (isNested && isExpanded) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'nested-children ml-4';
      childrenContainer.id = `children-${fullKey.replace(/[^a-zA-Z0-9]/g, '-')}`;
      childrenContainer.setAttribute('data-parent-key', fullKey);
      
      if (Array.isArray(value)) {
        // 数组：渲染每个元素
        value.forEach((item, index) => {
          const itemKey = `${fullKey}[${index}]`;
          // 为数组元素创建包装对象
          const itemObj = {};
          if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            // 数组元素是对象，直接展开
            Object.assign(itemObj, item);
          } else {
            // 数组元素是简单值，使用索引作为键（格式：[0], [1]等）
            itemObj[`[${index}]`] = item;
          }
          renderResponseContentTable(itemObj, childrenContainer, itemKey, level + 1);
        });
        // 添加数组元素按钮
        const addItemBtn = document.createElement('button');
        addItemBtn.type = 'button';
        addItemBtn.className = 'mt-2 px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition';
        addItemBtn.textContent = '+ Add Array Item';
        addItemBtn.onclick = () => addResponseContentArrayItem(fullKey);
        childrenContainer.appendChild(addItemBtn);
      } else {
        // 对象：递归渲染
        renderResponseContentTable(value, childrenContainer, fullKey, level + 1);
        // 添加对象字段按钮
        const addFieldBtn = document.createElement('button');
        addFieldBtn.type = 'button';
        addFieldBtn.className = 'mt-2 px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition';
        addFieldBtn.textContent = '+ Add Field';
        addFieldBtn.onclick = () => addResponseContentNestedField(fullKey);
        childrenContainer.appendChild(addFieldBtn);
      }
      
      rowWrapper.appendChild(childrenContainer);
    }
    
    tableContainer.appendChild(rowWrapper);
  });
  
  // 初始化展开状态集合
  if (!window.expandedKeys) {
    window.expandedKeys = new Set();
  }
}

// 更新Response Content的值
function updateResponseContentValue(key, value) {
  // 更新data-key属性，以便tableToJson能正确识别
  const row = document.querySelector(`#row-${key.replace(/\./g, '-')}`);
  if (row) {
    const keyInput = row.querySelector('input[data-key]');
    if (keyInput) {
      keyInput.setAttribute('data-key', key);
    }
  }
  
  // 延迟更新保存的JSON数据（避免频繁更新）
  if (window.updateJsonDataTimeout) {
    clearTimeout(window.updateJsonDataTimeout);
  }
  window.updateJsonDataTimeout = setTimeout(() => {
    try {
      const updatedJson = tableToJson();
      currentTableJsonData = JSON.parse(updatedJson);
    } catch (e) {
      console.warn('Failed to update saved JSON data:', e);
    }
  }, 500);
}

// 重命名Response Content的键
function renameResponseContentKey(oldKey, newKey) {
  if (!newKey || !newKey.trim()) {
    // 如果新键名为空，恢复旧值
    const row = document.querySelector(`#row-${oldKey.replace(/\./g, '-')}`);
    if (row) {
      const keyInput = row.querySelector('input[data-key]');
      if (keyInput) {
        keyInput.value = oldKey;
      }
    }
    return;
  }
  
  // 更新行的ID和data-key属性
  const row = document.querySelector(`#row-${oldKey.replace(/\./g, '-')}`);
  if (row) {
    row.id = `row-${newKey.replace(/\./g, '-')}`;
    const keyInput = row.querySelector('input[data-key]');
    if (keyInput) {
      keyInput.setAttribute('data-key', newKey);
    }
  }
  
  // 延迟更新保存的JSON数据（避免频繁更新）
  if (window.updateJsonDataTimeout) {
    clearTimeout(window.updateJsonDataTimeout);
  }
  window.updateJsonDataTimeout = setTimeout(() => {
    try {
      const updatedJson = tableToJson();
      currentTableJsonData = JSON.parse(updatedJson);
    } catch (e) {
      console.warn('Failed to update saved JSON data:', e);
    }
  }, 500);
}

// 删除Response Content的行
function removeResponseContentRow(key) {
  if (!confirm(`Are you sure you want to delete "${key}"?`)) {
    return;
  }
  
  const rowId = `row-${key.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
  }
}

// 添加Response Content的新行（根级别）
function addResponseContentRow() {
  const newKey = prompt('Enter field name:');
  if (!newKey || !newKey.trim()) return;
  
  // 获取当前JSON
  const currentJson = tableToJson();
  try {
    const jsonObj = currentJson ? JSON.parse(currentJson) : {};
    jsonObj[newKey.trim()] = '';
    
    // 重新渲染表格
    renderResponseContentTable(jsonObj);
  } catch (e) {
    showToast('Failed to add field: ' + e.message, 'error');
  }
}

// 切换嵌套对象/数组的展开/折叠
function toggleResponseContentNested(fullKey) {
  if (!window.expandedKeys) {
    window.expandedKeys = new Set();
  }
  
  const rowWrapper = document.querySelector(`[data-full-key="${fullKey}"]`);
  if (!rowWrapper) {
    console.error('Row wrapper not found for key:', fullKey);
    return;
  }
  
  const childrenContainerId = `children-${fullKey.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const childrenContainer = document.getElementById(childrenContainerId);
  const expandBtnId = `expand-btn-${fullKey.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const expandBtn = document.getElementById(expandBtnId);
  
  // 检查是否已展开（通过检查子容器是否存在）
  const isExpanded = childrenContainer !== null && childrenContainer.parentNode === rowWrapper;
  
  if (isExpanded) {
    // 折叠：直接移除子容器
    window.expandedKeys.delete(fullKey);
    if (childrenContainer) {
      childrenContainer.remove();
    }
    if (expandBtn) {
      const typeLabel = expandBtn.textContent.includes('Array') ? 'Array' : 'Object';
      const itemCount = expandBtn.textContent.match(/\((\d+)\)/)?.[1] || '0';
      expandBtn.className = 'px-2 py-1 text-xs rounded transition bg-gray-100 text-gray-700 hover:bg-gray-200';
      expandBtn.innerHTML = `▶ ${typeLabel} (${itemCount})`;
    }
  } else {
    // 展开：获取当前JSON数据，找到对应的值，然后只渲染子项
    // 先检查是否已经有子容器（防止重复创建）
    if (childrenContainer && childrenContainer.parentNode === rowWrapper) {
      // 已经存在，不需要重复创建
      window.expandedKeys.add(fullKey);
      return;
    }
    
    window.expandedKeys.add(fullKey);
    
    // 获取当前JSON数据（优先使用保存的原始数据，如果没有则从表格转换）
    let jsonObj = null;
    if (currentTableJsonData) {
      // 使用保存的原始JSON数据
      jsonObj = JSON.parse(JSON.stringify(currentTableJsonData)); // 深拷贝
    } else {
      // 从表格转换，同时合并未展开的数据
      try {
        // 先尝试从JSON编辑器获取（如果存在）
        const jsonView = document.getElementById('apiResponseContentJsonView');
        if (jsonView && !jsonView.classList.contains('hidden')) {
          const jsonContent = document.getElementById('apiResponseContent').value;
          if (jsonContent) {
            jsonObj = JSON.parse(jsonContent);
            currentTableJsonData = JSON.parse(JSON.stringify(jsonObj)); // 保存
          }
        }
        
        // 如果JSON编辑器没有数据，从表格转换
        if (!jsonObj) {
          const currentJson = tableToJson();
          jsonObj = JSON.parse(currentJson);
          // 保存转换后的数据
          currentTableJsonData = JSON.parse(JSON.stringify(jsonObj));
        }
      } catch (e) {
        console.error('Failed to get JSON data:', e);
        showToast('Failed to expand: Cannot get current data', 'error');
        window.expandedKeys.delete(fullKey);
        return;
      }
    }
    
    try {
      // 解析fullKey路径（支持点号和数组索引，如 "data.items[0].name"）
      let targetValue = jsonObj;
      
      // 特殊处理 [root] 键（根级别数组）
      if (fullKey === '[root]') {
        // 如果 jsonObj 是数组，直接使用
        if (Array.isArray(jsonObj)) {
          targetValue = jsonObj;
        } else if (jsonObj && typeof jsonObj === 'object' && jsonObj['[root]']) {
          // 如果 jsonObj 是包装对象，提取 [root] 的值
          targetValue = jsonObj['[root]'];
        } else {
          console.error('Cannot find [root] value, jsonObj:', jsonObj);
          window.expandedKeys.delete(fullKey);
          return;
        }
      } else {
        // 使用正则表达式解析路径（处理 "key1.key2[0].key3" 这样的格式）
        const pathParts = fullKey.match(/([^.[\]]+)|(\[\d+\])/g) || [];
        
        for (let i = 0; i < pathParts.length; i++) {
          const part = pathParts[i];
          
          if (part.startsWith('[') && part.endsWith(']')) {
            // 数组索引，如 [0]
            const indexStr = part.substring(1, part.length - 1);
            // 检查是否是数字索引
            if (!isNaN(indexStr)) {
              const index = parseInt(indexStr);
              if (Array.isArray(targetValue) && targetValue[index] !== undefined) {
                targetValue = targetValue[index];
              } else {
                console.error('Cannot find array value at index:', index, 'for path:', fullKey, 'current value:', targetValue);
                window.expandedKeys.delete(fullKey);
                return;
              }
            } else {
              // 不是数字索引，可能是特殊键如 [root]
              if (part === '[root]' && targetValue && typeof targetValue === 'object' && targetValue['[root]'] !== undefined) {
                targetValue = targetValue['[root]'];
              } else {
                console.error('Invalid array index:', part, 'for path:', fullKey);
                window.expandedKeys.delete(fullKey);
                return;
              }
            }
          } else {
            // 对象键
            if (targetValue && typeof targetValue === 'object' && targetValue !== null && targetValue[part] !== undefined) {
              targetValue = targetValue[part];
            } else {
              console.error('Cannot find object key:', part, 'for path:', fullKey, 'current value:', targetValue);
              window.expandedKeys.delete(fullKey);
              return;
            }
          }
        }
      }
      
      // 创建子容器
      const level = parseInt(rowWrapper.getAttribute('data-level') || '0');
      const newChildrenContainer = document.createElement('div');
      newChildrenContainer.className = 'nested-children ml-4';
      newChildrenContainer.id = childrenContainerId;
      newChildrenContainer.setAttribute('data-parent-key', fullKey);
      
      // 渲染子项
      if (Array.isArray(targetValue)) {
        // 数组：渲染每个元素
        targetValue.forEach((item, index) => {
          const itemKey = `${fullKey}[${index}]`;
          const itemObj = {};
          if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            Object.assign(itemObj, item);
          } else {
            itemObj[`[${index}]`] = item;
          }
          renderResponseContentTable(itemObj, newChildrenContainer, itemKey, level + 1);
        });
        // 添加数组元素按钮
        const addItemBtn = document.createElement('button');
        addItemBtn.type = 'button';
        addItemBtn.className = 'mt-2 px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition';
        addItemBtn.textContent = '+ Add Array Item';
        addItemBtn.onclick = () => addResponseContentArrayItem(fullKey);
        newChildrenContainer.appendChild(addItemBtn);
      } else if (typeof targetValue === 'object' && targetValue !== null) {
        // 对象：递归渲染
        renderResponseContentTable(targetValue, newChildrenContainer, fullKey, level + 1);
        // 添加对象字段按钮
        const addFieldBtn = document.createElement('button');
        addFieldBtn.type = 'button';
        addFieldBtn.className = 'mt-2 px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition';
        addFieldBtn.textContent = '+ Add Field';
        addFieldBtn.onclick = () => addResponseContentNestedField(fullKey);
        newChildrenContainer.appendChild(addFieldBtn);
      } else {
        // 不是对象也不是数组，无法展开
        console.warn('Cannot expand non-object/non-array value:', targetValue);
        window.expandedKeys.delete(fullKey);
        return;
      }
      
      // 插入子容器到行包装器
      rowWrapper.appendChild(newChildrenContainer);
      
      // 更新展开按钮
      if (expandBtn) {
        const typeLabel = Array.isArray(targetValue) ? 'Array' : 'Object';
        const itemCount = Array.isArray(targetValue) ? targetValue.length : Object.keys(targetValue).length;
        expandBtn.className = 'px-2 py-1 text-xs rounded transition bg-blue-200 text-blue-800';
        expandBtn.innerHTML = `▼ ${typeLabel} (${itemCount})`;
      }
      
      // 不要在这里更新保存的JSON数据，因为tableToJson可能无法正确获取未展开的数据
      // 数据更新会在用户修改值时进行
    } catch (e) {
      console.error('Failed to expand nested content:', e);
      showToast('Failed to expand: ' + e.message, 'error');
      // 回滚展开状态
      window.expandedKeys.delete(fullKey);
      // 如果创建了子容器，移除它
      const createdContainer = document.getElementById(childrenContainerId);
      if (createdContainer) {
        createdContainer.remove();
      }
    }
  }
}

// 添加嵌套对象的字段
function addResponseContentNestedField(parentKey) {
  const newFieldName = prompt('Enter field name:');
  if (!newFieldName || !newFieldName.trim()) return;
  
  // 获取当前JSON
  const currentJson = tableToJson();
  try {
    const jsonObj = JSON.parse(currentJson);
    const keys = parentKey.split('.');
    let target = jsonObj;
    
    // 导航到父对象
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key.includes('[') && key.includes(']')) {
        const arrayKey = key.substring(0, key.indexOf('['));
        const index = parseInt(key.substring(key.indexOf('[') + 1, key.indexOf(']')));
        target = target[arrayKey][index];
      } else {
        target = target[key];
      }
    }
    
    // 添加新字段
    target[newFieldName.trim()] = '';
    
    // 重新渲染表格
    renderResponseContentTable(jsonObj);
    
    // 确保父对象保持展开
    if (!window.expandedKeys) {
      window.expandedKeys = new Set();
    }
    window.expandedKeys.add(parentKey);
  } catch (e) {
    showToast('Failed to add field: ' + e.message, 'error');
  }
}

// 添加数组元素
function addResponseContentArrayItem(parentKey) {
  // 获取当前JSON
  const currentJson = tableToJson();
  try {
    const jsonObj = JSON.parse(currentJson);
    const keys = parentKey.split('.');
    let target = jsonObj;
    
    // 导航到父数组
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key.includes('[') && key.includes(']')) {
        const arrayKey = key.substring(0, key.indexOf('['));
        const index = parseInt(key.substring(key.indexOf('[') + 1, key.indexOf(']')));
        target = target[arrayKey][index];
      } else {
        target = target[key];
      }
    }
    
    // 添加新元素
    if (Array.isArray(target)) {
      target.push('');
    }
    
    // 重新渲染表格
    renderResponseContentTable(jsonObj);
    
    // 确保父数组保持展开
    if (!window.expandedKeys) {
      window.expandedKeys = new Set();
    }
    window.expandedKeys.add(parentKey);
  } catch (e) {
    showToast('Failed to add array item: ' + e.message, 'error');
  }
}

// 将表格视图转换为JSON（支持多层嵌套）
// 对于未展开的部分，从保存的原始数据中获取
function tableToJson() {
  const container = document.getElementById('responseContentTableContainer');
  if (!container) {
    // 如果没有表格容器，返回保存的数据或空对象
    if (currentTableJsonData) {
      return JSON.stringify(currentTableJsonData);
    }
    return '{}';
  }
  
  // 如果有保存的原始数据，先使用它作为基础
  let baseJson = {};
  if (currentTableJsonData) {
    baseJson = JSON.parse(JSON.stringify(currentTableJsonData));
  }
  
  const result = baseJson;
  
  // 递归处理行包装器，只更新已展开或已修改的部分
  function processRowWrapper(wrapper, parentObj, parentFullKey = '') {
    const fullKey = wrapper.getAttribute('data-full-key');
    const level = parseInt(wrapper.getAttribute('data-level') || '0');
    const row = wrapper.querySelector('.flex.items-center');
    if (!row) return;
    
    // 获取键名（从第一个input）
    const keyInputs = row.querySelectorAll('input[data-key]');
    if (keyInputs.length === 0) return;
    
    const keyInput = keyInputs[0];
    let key = keyInput.value.trim();
    
    // 处理数组索引键名（如 "[0]"）
    let isArrayIndex = false;
    if (key.startsWith('[') && key.endsWith(']')) {
      isArrayIndex = true;
    }
    
    if (!key && !isArrayIndex) return;
    
    // 检查是否有展开的子项
    const childrenContainer = wrapper.querySelector('.nested-children');
    let value = null;
    
    if (childrenContainer) {
      // 有子项，需要递归构建
      const childrenRows = childrenContainer.querySelectorAll('.response-content-row-wrapper');
      
      if (isArrayIndex || (childrenRows.length > 0 && childrenRows[0].querySelector('input[data-key]')?.value.trim().startsWith('['))) {
        // 数组：按顺序收集所有子项的值
        value = [];
        childrenRows.forEach((childRow) => {
          const childValue = {};
          processRowWrapper(childRow, childValue, fullKey);
          
          // 提取值
          const childKeys = Object.keys(childValue);
          if (childKeys.length === 1 && childKeys[0].startsWith('[')) {
            // 简单数组元素
            const elementValue = childValue[childKeys[0]];
            if (elementValue !== undefined && elementValue !== null) {
              value.push(elementValue);
            }
          } else if (childKeys.length > 0) {
            // 对象数组元素 - 如果只有一个键且是数组索引，提取值；否则使用整个对象
            if (childKeys.length === 1 && childKeys[0].startsWith('[')) {
              value.push(childValue[childKeys[0]]);
            } else {
              value.push(childValue);
            }
          } else {
            // 空值，尝试获取简单值
            const simpleValue = getValueFromRow(childRow);
            if (simpleValue !== null && simpleValue !== undefined) {
              value.push(simpleValue);
            }
          }
        });
      } else {
        // 对象：递归处理所有子项
        value = {};
        childrenRows.forEach(childRow => {
          processRowWrapper(childRow, value, fullKey);
        });
      }
    } else {
      // 没有子项，获取简单值（从输入框）
      value = getValueFromRow(wrapper);
    }
    
    // 设置值到父对象（使用路径设置）
    if (value !== null) {
      setValueByFullKey(result, fullKey, value);
    }
  }
  
  // 通过完整键路径设置值
  function setValueByFullKey(obj, fullKey, value) {
    // 使用正则表达式解析路径（处理 "key1.key2[0].key3" 这样的格式）
    const pathParts = fullKey.match(/([^.[\]]+)|(\[\d+\])/g) || [];
    
    if (pathParts.length === 0) return;
    
    let current = obj;
    
    // 遍历路径的每一部分（除了最后一部分）
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      
      if (part.startsWith('[') && part.endsWith(']')) {
        // 数组索引
        const index = parseInt(part.substring(1, part.length - 1));
        // 如果当前不是数组，需要先创建数组
        if (!Array.isArray(current)) {
          // 这种情况不应该发生，因为路径应该是连续的
          console.warn('Unexpected array index in path:', fullKey, 'at part:', part);
          return;
        }
        // 确保数组索引存在
        if (current[index] === undefined) {
          // 检查下一个部分是否是数组索引
          const nextPart = pathParts[i + 1];
          if (nextPart && nextPart.startsWith('[') && nextPart.endsWith(']')) {
            current[index] = [];
          } else {
            current[index] = {};
          }
        }
        current = current[index];
      } else {
        // 对象键
        if (!current[part]) {
          // 检查下一个部分是否是数组索引
          const nextPart = pathParts[i + 1];
          if (nextPart && nextPart.startsWith('[') && nextPart.endsWith(']')) {
            current[part] = [];
          } else {
            current[part] = {};
          }
        } else if (typeof current[part] !== 'object' || current[part] === null) {
          // 如果当前值不是对象，需要替换为对象
          const nextPart = pathParts[i + 1];
          if (nextPart && nextPart.startsWith('[') && nextPart.endsWith(']')) {
            current[part] = [];
          } else {
            current[part] = {};
          }
        }
        current = current[part];
      }
    }
    
    // 设置最后一个键的值
    const lastPart = pathParts[pathParts.length - 1];
    if (lastPart.startsWith('[') && lastPart.endsWith(']')) {
      // 数组索引
      const index = parseInt(lastPart.substring(1, lastPart.length - 1));
      if (!Array.isArray(current)) {
        // 如果当前不是数组，需要找到父数组
        // 这种情况不应该发生，但为了安全起见
        console.warn('Cannot set array index, current is not array:', fullKey);
        return;
      }
      // 确保数组足够大
      while (current.length <= index) {
        current.push(undefined);
      }
      current[index] = value;
    } else {
      // 对象键
      current[lastPart] = value;
    }
  }
  
  // 处理所有根级别的行
  const rootRows = container.querySelectorAll('.response-content-row-wrapper[data-level="0"]');
  if (rootRows.length === 0) {
    // 如果没有根级别的行，返回保存的数据或空对象
    if (currentTableJsonData) {
      // 如果保存的数据是数组，直接返回
      if (Array.isArray(currentTableJsonData)) {
        return JSON.stringify(currentTableJsonData);
      }
      return JSON.stringify(currentTableJsonData);
    }
    return '{}';
  }
  
  // 检查根级别是否是数组（通过检查是否有 [root] 键）
  const rootRow = rootRows[0];
  const rootKeyInput = rootRow.querySelector('input[data-key]');
  const isRootArray = rootKeyInput && rootKeyInput.value.trim() === '[root]';
  
  if (isRootArray) {
    // 根级别是数组，需要特殊处理
    // 先处理根行，构建基础结构
    processRowWrapper(rootRow, result);
    
    // 从结果中提取数组
    const rootValue = result['[root]'];
    if (Array.isArray(rootValue)) {
      return JSON.stringify(rootValue);
    } else if (rootValue !== undefined && rootValue !== null) {
      // 如果值存在但不是数组，尝试转换
      return JSON.stringify(rootValue);
    }
    
    // 如果处理失败，尝试从保存的数据中获取并合并已修改的部分
    if (currentTableJsonData && Array.isArray(currentTableJsonData)) {
      // 使用保存的数组作为基础，然后合并已修改的元素
      const mergedArray = JSON.parse(JSON.stringify(currentTableJsonData));
      
      // 尝试从表格中提取已修改的数组元素
      const childrenContainer = rootRow.querySelector('.nested-children');
      if (childrenContainer) {
        const childrenRows = childrenContainer.querySelectorAll('.response-content-row-wrapper');
        childrenRows.forEach((childRow, index) => {
          const childValue = {};
          processRowWrapper(childRow, childValue, '[root]');
          
          // 提取值并更新到数组中
          const childKeys = Object.keys(childValue);
          if (childKeys.length === 1 && childKeys[0].startsWith('[')) {
            const elementValue = childValue[childKeys[0]];
            if (elementValue !== undefined && elementValue !== null) {
              mergedArray[index] = elementValue;
            }
          } else if (childKeys.length > 0) {
            // 对象数组元素
            if (childKeys.length === 1 && childKeys[0].startsWith('[')) {
              mergedArray[index] = childValue[childKeys[0]];
            } else {
              mergedArray[index] = childValue;
            }
          }
        });
      }
      
      return JSON.stringify(mergedArray);
    }
    
    // 如果都没有，返回空数组
    return '[]';
  } else {
    // 普通对象，正常处理
    rootRows.forEach(wrapper => {
      processRowWrapper(wrapper, result);
    });
  }
  
  // 如果结果只有一个 [root] 键且值是数组，返回数组
  if (Object.keys(result).length === 1 && result['[root]'] && Array.isArray(result['[root]'])) {
    return JSON.stringify(result['[root]']);
  }
  
  return JSON.stringify(result);
}

// 通过完整键路径获取值
function getValueByFullKey(obj, fullKey) {
  if (!fullKey) return obj;
  
  // 使用正则表达式解析路径（处理 "key1.key2[0].key3" 这样的格式）
  const pathParts = fullKey.match(/([^.[\]]+)|(\[\d+\])/g) || [];
  
  let current = obj;
  for (let i = 0; i < pathParts.length; i++) {
    const part = pathParts[i];
    
    if (part.startsWith('[') && part.endsWith(']')) {
      // 数组索引
      const index = parseInt(part.substring(1, part.length - 1));
      if (Array.isArray(current) && current[index] !== undefined) {
        current = current[index];
      } else {
        return undefined;
      }
    } else {
      // 对象键
      if (current && typeof current === 'object' && current[part] !== undefined) {
        current = current[part];
      } else {
        return undefined;
      }
    }
  }
  
  return current;
}

// 从行中获取值
function getValueFromRow(rowWrapper) {
  const row = rowWrapper.querySelector('.flex.items-center');
  if (!row) return null;
  
  const valueCheckbox = row.querySelector('input[type="checkbox"][data-key]');
  const valueInputs = row.querySelectorAll('input[data-key]');
  
  if (valueCheckbox) {
    return valueCheckbox.checked;
  } else if (valueInputs.length > 1) {
    const valueInput = valueInputs[1];
    const inputValue = valueInput.value.trim();
    
    if (valueInput.type === 'number') {
      return inputValue === '' ? null : parseFloat(inputValue);
    } else if (inputValue === 'true' || inputValue === 'false') {
      return inputValue === 'true';
    } else if (!isNaN(inputValue) && inputValue !== '') {
      return parseFloat(inputValue);
    } else {
      return inputValue;
    }
  }
  
  return null;
}

// 设置嵌套值（处理点号分隔的键）- 已废弃，使用processRowWrapper代替
function setNestedValue(obj, keys, value) {
  // 这个函数已被processRowWrapper替代，保留用于兼容性
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    let key = keys[i];
    
    // 处理数组索引
    if (key.includes('[') && key.includes(']')) {
      const arrayKey = key.substring(0, key.indexOf('['));
      const index = parseInt(key.substring(key.indexOf('[') + 1, key.indexOf(']')));
      
      if (!current[arrayKey]) {
        current[arrayKey] = [];
      }
      if (!current[arrayKey][index]) {
        current[arrayKey][index] = {};
      }
      current = current[arrayKey][index];
    } else {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }
  }
  
  const lastKey = keys[keys.length - 1];
  if (lastKey.includes('[') && lastKey.includes(']')) {
    const arrayKey = lastKey.substring(0, lastKey.indexOf('['));
    const index = parseInt(lastKey.substring(lastKey.indexOf('[') + 1, lastKey.indexOf(']')));
    if (!current[arrayKey]) {
      current[arrayKey] = [];
    }
    current[arrayKey][index] = value;
  } else {
    current[lastKey] = value;
  }
}

// 切换自定义API Token显示/隐藏
function toggleCustomApiTokenVisibility() {
  const tokenInput = document.getElementById('customApiToken');
  const toggleText = document.getElementById('customApiTokenToggleText');
  const originalToken = document.getElementById('customApiTokenOriginal')?.value || '';
  
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
      // 用户修改了token，保存新值
      document.getElementById('customApiTokenOriginal').value = currentValue;
    }
    tokenInput.type = 'password';
    toggleText.textContent = 'Show';
  }
}

// 保存 QZ Tray 证书
async function saveQZCertificates() {
  const certificate = document.getElementById('qzCertificate')?.value?.trim();
  const privateKey = document.getElementById('qzPrivateKey')?.value?.trim();
  
  if (!certificate) {
    showToast('Please enter the digital certificate', 'warning');
    return;
  }
  
  if (!privateKey) {
    showToast('Please enter the private key', 'warning');
    return;
  }
  
  try {
    showToast('Uploading certificates...', 'info');
    
    const data = await adminApiRequest(`${API_BASE}/admin/qz-certificates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        certificate,
        privateKey
      })
    });
    
    if (data.success) {
      showToast('Certificates uploaded successfully! New certificates will be used for future print jobs.', 'success');
      // 重新加载状态
      await loadQZCertificates();
      // 清空输入框（可选，让用户知道已保存）
      // document.getElementById('qzCertificate').value = '';
      // document.getElementById('qzPrivateKey').value = '';
    } else {
      showToast(data.message || 'Failed to upload certificates', 'error');
    }
  } catch (error) {
    console.error('Save QZ certificates failed:', error);
    showToast('Failed to upload certificates: ' + (error.message || 'Unknown error'), 'error');
  }
}

// 加载接收到的备份
async function loadReceivedBackups() {
  const container = document.getElementById('receivedBackupsList');
  if (!container) return;
  
  try {
    const data = await adminApiRequest(`${API_BASE}/admin/remote-backup/received`);
    
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
    
    // 直接使用 fetch 而不是 adminApiRequest，避免响应体被重复读取
    const response = await fetch(`${API_BASE}/admin/remote-backup/received/${id}/restore`, {
      method: 'POST',
      credentials: 'include'
    });
    
    // 检查响应状态
    if (!response.ok) {
      let errorMessage = `Restore failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        // 如果无法解析JSON，尝试读取文本
        try {
          const clonedResponse = response.clone();
          const errorText = await clonedResponse.text();
          errorMessage = errorText || errorMessage;
        } catch (e2) {
          // 如果都失败了，使用默认错误消息
        }
      }
      hideGlobalLoading();
      showToast(errorMessage, 'error');
      return;
    }
    
    // 解析成功响应
    let data;
    try {
      data = await response.json();
    } catch (e) {
      hideGlobalLoading();
      showToast('Failed to parse server response', 'error');
      console.error('Failed to parse response:', e);
      return;
    }
    
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
    showToast(error.message || 'Restore failed', 'error');
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
  // 使用 <a> 标签下载，避免 window.open() 被弹窗阻止策略阻止
  const downloadUrl = `${API_BASE}/admin/developer/files/download?path=${encodeURIComponent(path)}`;
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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
    
    const data = await adminApiRequest(`${API_BASE}/admin/menu/backup`, {
      method: 'POST'
    });
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

// 加载被锁定的IP列表
async function loadBlockedIps() {
  const container = document.getElementById('blockedIpsList');
  if (!container) {
    console.error('loadBlockedIps: blockedIpsList container not found');
    return;
  }
  
  try {
    container.innerHTML = '<p class="text-sm text-gray-500">Loading blocked IPs...</p>';
    
    let data;
    try {
      data = await adminApiRequest(`${API_BASE}/admin/security/blocked-ips`);
    } catch (apiError) {
      console.error('loadBlockedIps: API request failed', apiError);
      const errorMsg = apiError.message || apiError.data?.message || 'Failed to load blocked IPs';
      container.innerHTML = `<p class="text-sm text-red-500">Error: ${errorMsg}</p>`;
      return;
    }
    
    if (!data) {
      container.innerHTML = '<p class="text-sm text-red-500">No response from server</p>';
      return;
    }
    
    if (data && data.success) {
      const blockedIps = data.blockedIps || [];
      const warningIps = data.warningIps || [];
      
      if (blockedIps.length === 0 && warningIps.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500">No blocked IPs</p>';
        return;
      }
      
      let html = '';
      
      // 显示被锁定的IP
      if (blockedIps.length > 0) {
        html += '<div class="mb-4"><h5 class="text-sm font-semibold text-red-700 mb-2">🔒 Blocked IPs</h5>';
        html += '<div class="space-y-2">';
        blockedIps.forEach(ip => {
          html += `
            <div class="bg-red-50 border border-red-200 rounded p-3 flex items-center justify-between">
              <div class="flex-1">
                <div class="flex items-center space-x-2">
                  <span class="font-mono text-sm font-semibold text-red-900">${ip.ipAddress}</span>
                  <span class="px-2 py-1 text-xs bg-red-200 text-red-800 rounded">Blocked</span>
                </div>
                <div class="mt-1 text-xs text-gray-600">
                  <span>Failed: ${ip.failedCount} times</span>
                  <span class="mx-2">•</span>
                  <span>Remaining: ${ip.remainingTime}</span>
                  ${ip.lastAttemptAt ? `<span class="mx-2">•</span><span>Last: ${new Date(ip.lastAttemptAt.replace(' ', 'T')).toLocaleString()}</span>` : ''}
                </div>
              </div>
              <button onclick="unlockIp('${ip.ipAddress.replace(/'/g, "\\'")}')" 
                      class="ml-3 px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded">
                🔓 Unlock
              </button>
            </div>
          `;
        });
        html += '</div></div>';
      }
      
      // 显示警告IP（有失败记录但未锁定）
      if (warningIps.length > 0) {
        html += '<div><h5 class="text-sm font-semibold text-yellow-700 mb-2">⚠️ Warning IPs (Failed attempts but not blocked)</h5>';
        html += '<div class="space-y-2">';
        warningIps.forEach(ip => {
          html += `
            <div class="bg-yellow-50 border border-yellow-200 rounded p-3 flex items-center justify-between">
              <div class="flex-1">
                <div class="flex items-center space-x-2">
                  <span class="font-mono text-sm font-semibold text-yellow-900">${ip.ipAddress}</span>
                  <span class="px-2 py-1 text-xs bg-yellow-200 text-yellow-800 rounded">${ip.failedCount} failed</span>
                </div>
                <div class="mt-1 text-xs text-gray-600">
                  ${ip.lastAttemptAt ? `<span>Last attempt: ${new Date(ip.lastAttemptAt.replace(' ', 'T')).toLocaleString()}</span>` : ''}
                </div>
              </div>
              <button onclick="unlockIp('${ip.ipAddress.replace(/'/g, "\\'")}')" 
                      class="ml-3 px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded">
                🧹 Clear
              </button>
            </div>
          `;
        });
        html += '</div></div>';
      }
      
      container.innerHTML = html;
    } else {
      // API返回了success: false
      const errorMsg = data?.message || data?.error || 'Unknown error';
      container.innerHTML = `<p class="text-sm text-red-500">Failed to load blocked IPs: ${errorMsg}</p>`;
    }
  } catch (error) {
    console.error('loadBlockedIps: Exception caught', error);
    const errorMsg = error.message || error.data?.message || 'Failed to load blocked IPs';
    container.innerHTML = `<p class="text-sm text-red-500">Error: ${errorMsg}</p>`;
  }
}

// 解锁IP地址
async function unlockIp(ipAddress) {
  const confirmed = await showConfirmDialog(
    'Unlock IP Address',
    `Are you sure you want to unlock IP address ${ipAddress}? This will clear all login failure records for this IP and allow login attempts immediately.`,
    'Unlock',
    'Cancel'
  );
  
  if (!confirmed) {
    return;
  }
  
  try {
    const response = await adminApiRequest(`${API_BASE}/admin/security/blocked-ips/${encodeURIComponent(ipAddress)}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response && response.success) {
      showToast('IP address unlocked successfully', 'success');
      await loadBlockedIps();
    }
  } catch (error) {
    console.error('解锁IP失败:', error);
    showToast('Failed to unlock IP address', 'error');
  }
}

// ==================== 新订单通知功能 ====================
// 注意：此功能独立于现有业务，即使出错也不会影响其他功能

// 订单通知相关变量
let orderNotificationInterval = null;
let notifiedOrderIds = new Set(); // 已通知的订单ID集合
let lastCheckTimestamp = null; // 上次检查的时间戳
let isNotificationEnabled = true; // 是否启用通知
let audioContextPermissionGranted = false; // 音频权限是否已授予
let audioContext = null; // 复用的 AudioContext 实例

// 从 localStorage 恢复通知设置
try {
  const savedNotificationEnabled = localStorage.getItem('orderNotificationEnabled');
  if (savedNotificationEnabled !== null) {
    isNotificationEnabled = savedNotificationEnabled === 'true';
  }
} catch (e) {
  // 如果读取失败，使用默认值
  console.log('无法读取通知设置，使用默认值');
}

// 请求并初始化音频权限（需要在用户交互时调用）
async function initAudioContext() {
  try {
    // 如果已经存在且状态是 running，直接返回
    if (audioContext && audioContext.state === 'running') {
      return audioContext;
    }
    
    // 创建 AudioContext（延迟创建，只在需要时创建）
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    // 如果状态是 suspended，需要用户交互来恢复
    if (audioContext.state === 'suspended') {
      // 不尝试自动恢复，等待用户交互
      // 这避免了 "AudioContext was not allowed to start" 错误
      console.log('音频上下文已创建，状态: suspended - 等待用户交互后启动');
      return audioContext; // 返回 suspended 状态的 context，等待用户交互后恢复
    } else if (audioContext.state === 'running') {
      audioContextPermissionGranted = true;
      console.log('音频权限已初始化，状态:', audioContext.state);
    }
    
    return audioContext;
  } catch (error) {
    console.error('初始化音频权限失败:', error);
    audioContextPermissionGranted = false;
    // 不返回 null，而是返回一个标记，让调用者知道需要用户交互
    return null;
  }
}

// 播放订单通知音频（使用音频文件）
let notificationAudio = null; // 缓存音频对象
let audioLoadAttempted = false; // 是否已尝试加载音频

async function playDingSound() {
  try {
    // 如果音频对象不存在，创建并加载
    if (!notificationAudio && !audioLoadAttempted) {
      audioLoadAttempted = true;
      notificationAudio = new Audio('/newoder.mp3');
      notificationAudio.volume = 0.8; // 设置音量（0.0 - 1.0）
      
      // 预加载音频
      notificationAudio.preload = 'auto';
      
      // 添加错误处理
      notificationAudio.addEventListener('error', (e) => {
        console.error('音频文件加载失败:', e);
        notificationAudio = null; // 重置，下次尝试重新加载
        audioLoadAttempted = false;
      });
      
      // 添加加载完成事件
      notificationAudio.addEventListener('canplaythrough', () => {
        console.log('订单通知音频已加载完成');
      });
      
      // 尝试加载音频
      try {
        await notificationAudio.load();
      } catch (loadError) {
        console.warn('音频预加载失败，将在播放时加载:', loadError);
      }
    }
    
    // 如果音频对象仍然不存在，说明加载失败
    if (!notificationAudio) {
      console.warn('音频文件未加载，跳过播放');
      return;
    }
    
    // 重置音频到开始位置（如果正在播放）
    notificationAudio.currentTime = 0;
    
    // 播放音频
    const playPromise = notificationAudio.play();
    
    if (playPromise !== undefined) {
      await playPromise;
      console.log('✅ 播放订单通知音频: newoder.mp3');
    }
  } catch (error) {
    // 如果播放失败，尝试重新加载
    if (error.name === 'NotAllowedError') {
      console.warn('音频播放被阻止，可能需要用户交互');
    } else if (error.name === 'NotSupportedError') {
      console.error('浏览器不支持音频播放');
    } else {
      console.error('播放订单通知音频失败（不影响功能）:', error);
      // 重置音频对象，下次尝试重新加载
      notificationAudio = null;
      audioLoadAttempted = false;
    }
  }
}

// 语音提示
function speakNotification(message) {
  try {
    if (!('speechSynthesis' in window)) {
      return; // 浏览器不支持，静默返回
    }
    
    // 取消之前的语音（如果有）
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'en-US'; // 可以根据设置调整
    utterance.rate = 1.0;     // 语速
    utterance.pitch = 1.0;    // 音调
    utterance.volume = 0.8;   // 音量
    
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    // 语音失败不影响其他功能
    console.log('语音提示失败（不影响功能）:', error);
  }
}

// 显示订单通知
async function showOrderNotification(order) {
  try {
    console.log('显示新订单通知:', order.order_number);
    
    // 1. 播放订单通知音频（包含叮咚声和语音朗读）
    await playDingSound();
    
    // 2. Toast 通知（音频文件已包含语音，这里只显示视觉通知）
    const customerName = order.customer_name || 'Anonymous';
    const amount = formatPrice(order.final_amount);
    
    showToast(
      `🛒 New Order: ${order.order_number}<br>` +
      `Customer: ${customerName}<br>` +
      `Amount: ${amount}`,
      'info'
    );
    
    // 3. 如果当前在订单页面，延迟刷新（避免频繁刷新）
    if (currentTab === 'orders') {
      setTimeout(() => {
        try {
          console.log('自动刷新订单列表');
          loadOrders();
        } catch (e) {
          // 刷新失败不影响通知
          console.error('自动刷新订单列表失败（不影响功能）:', e);
        }
      }, 2000);
    }
  } catch (error) {
    // 通知显示失败不影响其他功能
    console.error('显示订单通知失败（不影响功能）:', error);
  }
}

// 检查新订单
async function checkNewOrders(isInitialCheck = false) {
  // 如果通知被禁用，直接返回
  if (!isNotificationEnabled) {
    return;
  }
  
  try {
    const params = new URLSearchParams();
    if (lastCheckTimestamp && !isInitialCheck) {
      // 只在使用 since 参数时使用时间戳格式
      // 后端期望的是 ISO 格式或 SQLite datetime 格式
      params.append('since', lastCheckTimestamp);
    }
    
    console.log('检查新订单...', { lastCheckTimestamp, isInitialCheck });
    
    const data = await adminApiRequest(`${API_BASE}/admin/orders/new?${params.toString()}`);
    
    console.log('检查新订单响应:', { 
      success: data.success, 
      ordersCount: data.orders?.length || 0,
      timestamp: data.timestamp 
    });
    
    if (data.success && data.orders && data.orders.length > 0) {
      // 过滤出未通知的订单
      const newOrders = data.orders.filter(order => !notifiedOrderIds.has(order.id));
      
      console.log('发现新订单:', { 
        total: data.orders.length, 
        new: newOrders.length,
        alreadyNotified: data.orders.length - newOrders.length 
      });
      
      // 如果是初始化检查，只记录订单ID，不通知
      if (isInitialCheck) {
        data.orders.forEach(order => {
          notifiedOrderIds.add(order.id);
        });
        console.log('初始化检查完成，已记录', data.orders.length, '个订单');
      } else {
        // 按时间排序，确保按顺序通知
        newOrders.sort((a, b) => {
          try {
            const timeA = new Date(a.payment_time || a.created_at);
            const timeB = new Date(b.payment_time || b.created_at);
            return timeA - timeB;
          } catch (e) {
            return 0;
          }
        });
        
        // 通知每个新订单（间隔通知，避免同时播放多个声音）
        newOrders.forEach((order, index) => {
          setTimeout(() => {
            try {
              notifiedOrderIds.add(order.id);
              showOrderNotification(order);
            } catch (e) {
              // 单个订单通知失败不影响其他订单
              console.error('通知单个订单失败（不影响功能）:', e);
            }
          }, index * 1500); // 每个订单间隔1.5秒
        });
      }
    }
    
    // 更新最后检查时间（使用 ISO 格式）
    if (data.timestamp) {
      // 转换 SQLite datetime 格式为 ISO 格式
      const timestampStr = data.timestamp;
      if (timestampStr.includes(' ')) {
        // SQLite 格式: "2024-01-01 12:00:00" -> ISO: "2024-01-01T12:00:00"
        lastCheckTimestamp = timestampStr.replace(' ', 'T');
      } else {
        lastCheckTimestamp = timestampStr;
      }
    } else {
      // 如果没有返回时间戳，使用当前时间
      lastCheckTimestamp = new Date().toISOString();
    }
    
    // 清理旧的已通知订单ID（只保留最近100个）
    if (notifiedOrderIds.size > 100) {
      const orderIdsArray = Array.from(notifiedOrderIds);
      notifiedOrderIds = new Set(orderIdsArray.slice(-50));
    }
  } catch (error) {
    // 检查新订单失败不影响其他功能，但记录错误
    console.error('检查新订单失败（不影响功能）:', error);
  }
}

// 启动订单通知
async function startOrderNotification() {
  try {
    // 停止之前的轮询（如果存在）
    if (orderNotificationInterval) {
      clearInterval(orderNotificationInterval);
    }
    
    // 只在管理员已登录时启动
    if (!currentAdmin) {
      console.log('管理员未登录，无法启动订单通知');
      return;
    }
    
    console.log('正在启动订单通知...');
    
    // 初始化音频上下文（延迟到用户交互后，不在这里主动初始化）
    // 音频上下文将在用户首次与页面交互时自动初始化
    // 这避免了 "AudioContext was not allowed to start" 错误
    
    // 初始化：检查最近5分钟的订单（但只记录，不通知）
    await checkNewOrders(true).then(() => {
      // 之后每5秒检查一次新订单
      orderNotificationInterval = setInterval(() => {
        try {
          checkNewOrders(false);
        } catch (e) {
          // 轮询失败不影响其他功能
          console.error('订单通知轮询失败（不影响功能）:', e);
        }
      }, 5000); // 5秒检查一次
      
      console.log('✅ 订单通知已启动，每5秒检查一次新订单');
    }).catch((error) => {
      // 初始化失败不影响其他功能
      console.error('订单通知初始化失败（不影响功能）:', error);
      // 即使初始化失败，也启动轮询
      orderNotificationInterval = setInterval(() => {
        try {
          checkNewOrders(false);
        } catch (e) {
          console.error('订单通知轮询失败（不影响功能）:', e);
        }
      }, 5000);
    });
  } catch (error) {
    // 启动通知失败不影响其他功能
    console.error('启动订单通知失败（不影响功能）:', error);
  }
}

// 停止订单通知
function stopOrderNotification() {
  try {
    if (orderNotificationInterval) {
      clearInterval(orderNotificationInterval);
      orderNotificationInterval = null;
      console.log('订单通知已停止');
    }
  } catch (error) {
    // 停止失败不影响其他功能
    console.log('停止订单通知失败（不影响功能）:', error);
  }
}

// ==================== 展示图片管理功能 ====================

// 加载展示图片列表
async function loadShowcaseImages() {
  const container = document.getElementById('showcaseImagesList');
  if (!container) return;
  
  try {
    const data = await adminApiRequest(`${API_BASE}/admin/showcase-images`);
    
    if (data.success) {
      const images = data.images || [];
      
      if (images.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-8 col-span-full">No showcase images. Upload images to display on the home page.</div>';
        return;
      }
      
      container.innerHTML = images.map((img, index) => {
        // 转义文件名中的特殊字符，防止XSS和JavaScript注入
        const safeFilename = escapeHtml(img.filename).replace(/'/g, "\\'");
        const displayFilename = escapeHtml(img.filename);
        const safeUrl = escapeHtml(img.url);
        
        return `
        <div class="bg-gray-50 rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow">
          <div class="relative aspect-[4/5] bg-gray-200 w-full">
            <img 
              src="${safeUrl}" 
              alt="Showcase ${index + 1}" 
              class="w-full h-full object-cover"
              onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22500%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22400%22 height=%22500%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%239ca3af%22 font-family=%22sans-serif%22 font-size=%2218%22%3EImage%3C/text%3E%3C/svg%3E'"
            >
          </div>
          <div class="p-3">
            <p class="text-xs text-gray-600 mb-2 truncate" title="${displayFilename}">${displayFilename}</p>
            <button 
              onclick="deleteShowcaseImage('${safeFilename}')" 
              class="w-full px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-xs"
            >
              🗑️ Delete
            </button>
          </div>
        </div>
      `;
      }).join('');
    } else {
      container.innerHTML = '<div class="text-center text-red-500 py-8 col-span-full">Failed to load images</div>';
    }
  } catch (error) {
    console.error('加载展示图片失败:', error);
    container.innerHTML = '<div class="text-center text-red-500 py-8 col-span-full">Failed to load images</div>';
  }
}

// 存储选中的图片文件
let selectedShowcaseFiles = [];

// 处理图片选择（支持多选）
function handleShowcaseImageSelect(event) {
  const files = Array.from(event.target.files || []);
  const previewContainer = document.getElementById('selectedImagesPreview');
  const previewList = document.getElementById('selectedImagesList');
  const uploadBtn = document.getElementById('uploadShowcaseImageBtn');
  const countSpan = document.getElementById('selectedImageCount');
  
  if (files.length === 0) {
    selectedShowcaseFiles = [];
    previewContainer.classList.add('hidden');
    uploadBtn.style.display = 'none';
    return;
  }
  
  // 验证所有文件
  const validFiles = [];
  const errors = [];
  
  files.forEach((file, index) => {
    // 验证文件类型
    const allowedTypes = /image\/(jpeg|jpg|png|gif|webp)/;
    if (!allowedTypes.test(file.type)) {
      errors.push(`${file.name}: Invalid file type`);
      return;
    }
    
    // 验证文件大小（10MB）
    if (file.size > 10 * 1024 * 1024) {
      errors.push(`${file.name}: File size exceeds 10MB`);
      return;
    }
    
    validFiles.push(file);
  });
  
  // 显示错误信息
  if (errors.length > 0) {
    showToast(errors.join('; '), 'error');
  }
  
  // 如果没有有效文件，清空选择
  if (validFiles.length === 0) {
    event.target.value = '';
    selectedShowcaseFiles = [];
    previewContainer.classList.add('hidden');
    uploadBtn.style.display = 'none';
    return;
  }
  
  selectedShowcaseFiles = validFiles;
  
  // 显示选中数量
  countSpan.textContent = validFiles.length;
  
  // 显示预览
  previewList.innerHTML = validFiles.map((file, index) => {
    const reader = new FileReader();
    const previewId = `preview-${index}-${Date.now()}`;
    
    reader.onload = (e) => {
      const img = document.getElementById(previewId);
      if (img) {
        img.src = e.target.result;
      }
    };
    reader.readAsDataURL(file);
    
    return `
      <div class="relative bg-gray-100 rounded-lg overflow-hidden">
        <div class="aspect-[4/5] bg-gray-200">
          <img 
            id="${previewId}" 
            src="" 
            alt="${escapeHtml(file.name)}" 
            class="w-full h-full object-cover"
          >
        </div>
        <div class="p-2 bg-white border-t border-gray-200">
          <p class="text-xs text-gray-600 truncate" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</p>
          <p class="text-xs text-gray-400">${(file.size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
      </div>
    `;
  }).join('');
  
  previewContainer.classList.remove('hidden');
  uploadBtn.style.display = 'inline-block';
}

// 上传展示图片
// 批量上传展示图片
async function uploadShowcaseImages() {
  if (!selectedShowcaseFiles || selectedShowcaseFiles.length === 0) {
    showToast('Please select at least one image file', 'error');
    return;
  }
  
  const uploadBtn = document.getElementById('uploadShowcaseImageBtn');
  const fileInput = document.getElementById('showcaseImageInput');
  
  try {
    setButtonLoading(uploadBtn, true);
    
    let successCount = 0;
    let failCount = 0;
    const errors = [];
    
    // 逐个上传图片
    for (let i = 0; i < selectedShowcaseFiles.length; i++) {
      const file = selectedShowcaseFiles[i];
      
      try {
        const formData = new FormData();
        formData.append('image', file);
        
        const response = await fetch(`${API_BASE}/admin/showcase-images`, {
          method: 'POST',
          credentials: 'include',
          body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
          successCount++;
        } else {
          failCount++;
          errors.push(`${file.name}: ${data.message || 'Upload failed'}`);
        }
      } catch (error) {
        failCount++;
        errors.push(`${file.name}: ${error.message}`);
      }
    }
    
    setButtonLoading(uploadBtn, false);
    
    // 显示上传结果
    if (successCount > 0) {
      showToast(`Successfully uploaded ${successCount} image(s)${failCount > 0 ? `, ${failCount} failed` : ''}`, 
                failCount > 0 ? 'warning' : 'success');
      
      if (errors.length > 0) {
        console.error('Upload errors:', errors);
      }
    } else {
      showToast('All uploads failed: ' + (errors[0] || 'Unknown error'), 'error');
    }
    
    // 清空选择
    selectedShowcaseFiles = [];
    fileInput.value = '';
    document.getElementById('selectedImagesPreview').classList.add('hidden');
    document.getElementById('uploadShowcaseImageBtn').style.display = 'none';
    
    // 刷新图片列表
    await loadShowcaseImages();
  } catch (error) {
    console.error('批量上传展示图片失败:', error);
    setButtonLoading(uploadBtn, false);
    showToast('Upload failed: ' + error.message, 'error');
  }
}

// 删除展示图片
async function deleteShowcaseImage(filename) {
  if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
    return;
  }
  
  try {
    const data = await adminApiRequest(`${API_BASE}/admin/showcase-images/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
    
    if (data.success) {
      showToast('Image deleted successfully', 'success');
      loadShowcaseImages();
    } else {
      showToast(data.message || 'Delete failed', 'error');
    }
  } catch (error) {
    console.error('删除展示图片失败:', error);
    showToast('Delete failed', 'error');
  }
}

// 请求音频权限（通过播放一个静音的测试音）
async function requestAudioPermission() {
  try {
    console.log('请求音频权限...');
    const ctx = await initAudioContext();
    if (ctx) {
      // 播放一个非常短且音量很小的测试音来激活音频上下文
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      
      // 播放一个几乎听不见的测试音（0.01音量，0.05秒）
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = 200; // 低频率
      oscillator.type = 'sine';
      
      const now = ctx.currentTime;
      gainNode.gain.setValueAtTime(0.01, now); // 非常小的音量
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      
      oscillator.start(now);
      oscillator.stop(now + 0.05);
      
      console.log('音频权限已请求，状态:', ctx.state);
      audioContextPermissionGranted = true;
    }
  } catch (error) {
    console.warn('请求音频权限失败（不影响功能）:', error);
    audioContextPermissionGranted = false;
  }
}

// 切换通知状态（可选功能，可以添加到设置中）
function toggleOrderNotification() {
  try {
    isNotificationEnabled = !isNotificationEnabled;
    if (isNotificationEnabled) {
      startOrderNotification();
      showToast('订单通知已开启', 'success');
    } else {
      stopOrderNotification();
      showToast('订单通知已关闭', 'info');
    }
    
    // 保存到 localStorage
    try {
      localStorage.setItem('orderNotificationEnabled', isNotificationEnabled.toString());
    } catch (e) {
      // 保存失败不影响功能
      console.log('保存通知设置失败（不影响功能）');
    }
  } catch (error) {
    // 切换失败不影响其他功能
    console.error('切换订单通知失败（不影响功能）:', error);
  }
}

// 手动更新汇率
async function updateExchangeRateManually() {
  const btn = document.getElementById('updateExchangeRateBtn');
  const statusSpan = document.getElementById('exchangeRateUpdateStatus');
  
  if (!btn || !statusSpan) {
    showToast('无法找到更新按钮或状态显示元素', 'error');
    return;
  }
  
  try {
    // 禁用按钮并显示加载状态
    btn.disabled = true;
    btn.textContent = '更新中...';
    statusSpan.textContent = '';
    
    const response = await fetch(`${API_BASE}/admin/exchange-rate/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    
    const result = await response.json();
    
    if (result.success) {
      statusSpan.textContent = '✓ 更新成功';
      statusSpan.className = 'text-sm text-green-600';
      showToast('汇率更新成功', 'success');
      
      // 3秒后清除状态
      setTimeout(() => {
        statusSpan.textContent = '';
        statusSpan.className = 'text-sm text-gray-600';
      }, 3000);
    } else {
      statusSpan.textContent = '✗ 更新失败: ' + (result.message || '未知错误');
      statusSpan.className = 'text-sm text-red-600';
      showToast('汇率更新失败: ' + (result.message || '未知错误'), 'error');
    }
  } catch (error) {
    console.error('手动更新汇率失败:', error);
    statusSpan.textContent = '✗ 更新失败: ' + error.message;
    statusSpan.className = 'text-sm text-red-600';
    showToast('汇率更新失败: ' + error.message, 'error');
  } finally {
    // 恢复按钮状态
    btn.disabled = false;
    btn.textContent = '🔄 立即更新汇率';
  }
}
