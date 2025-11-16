/**
 * 前端UI组件测试
 * 测试Toast、确认对话框、按钮加载状态等功能
 * 
 * 注意：这些测试使用jsdom环境，需要在jest.config.frontend.js中配置testEnvironment: 'jsdom'
 * 运行测试：npm run test:frontend
 */

describe('前端UI组件测试', () => {
  beforeEach(() => {
    // 清空body
    document.body.innerHTML = '';
    // 清除所有定时器
    jest.clearAllTimers();
    // 使用fake timers以便控制setTimeout
    jest.useFakeTimers();
  });

  afterEach(() => {
    // 恢复真实定时器
    jest.useRealTimers();
  });

  describe('Toast通知系统', () => {
    // 从app.js中提取的Toast函数
    function showToast(message, type = 'success') {
      let toastContainer = document.getElementById('toastContainer');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toastContainer';
        toastContainer.className = 'fixed top-4 right-4 z-50 space-y-2';
        document.body.appendChild(toastContainer);
      }

      const typeConfig = {
        success: { bg: 'bg-green-500', icon: '✓' },
        error: { bg: 'bg-red-500', icon: '✕' },
        warning: { bg: 'bg-yellow-500', icon: '⚠' },
        info: { bg: 'bg-blue-500', icon: 'ℹ' }
      };

      const config = typeConfig[type] || typeConfig.success;
      const duration = type === 'error' ? 5000 : 3000;

      const toast = document.createElement('div');
      toast.className = `${config.bg} text-white px-6 py-3 rounded-lg shadow-lg fade-in flex items-center space-x-2 min-w-[300px] max-w-[500px]`;
      toast.innerHTML = `
        <span class="font-bold">${config.icon}</span>
        <span class="flex-1">${message}</span>
      `;
      
      toastContainer.appendChild(toast);
      
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease-out';
        setTimeout(() => {
          toast.remove();
        }, 300);
      }, duration);

      return toast;
    }

    test('应该创建Toast容器', () => {
      showToast('Test message');
      const container = document.getElementById('toastContainer');
      expect(container).toBeTruthy();
      expect(container.className).toContain('fixed');
    });

    test('应该显示success类型的Toast', () => {
      const toast = showToast('Success message', 'success');
      expect(toast.className).toContain('bg-green-500');
      expect(toast.innerHTML).toContain('✓');
      expect(toast.innerHTML).toContain('Success message');
    });

    test('应该显示error类型的Toast', () => {
      const toast = showToast('Error message', 'error');
      expect(toast.className).toContain('bg-red-500');
      expect(toast.innerHTML).toContain('✕');
      expect(toast.innerHTML).toContain('Error message');
    });

    test('应该显示warning类型的Toast', () => {
      const toast = showToast('Warning message', 'warning');
      expect(toast.className).toContain('bg-yellow-500');
      expect(toast.innerHTML).toContain('⚠');
      expect(toast.innerHTML).toContain('Warning message');
    });

    test('应该显示info类型的Toast', () => {
      const toast = showToast('Info message', 'info');
      expect(toast.className).toContain('bg-blue-500');
      expect(toast.innerHTML).toContain('ℹ');
      expect(toast.innerHTML).toContain('Info message');
    });

    test('应该支持多个Toast堆叠显示', () => {
      showToast('Message 1');
      showToast('Message 2');
      const container = document.getElementById('toastContainer');
      expect(container.children.length).toBe(2);
    });

    test('默认类型应该是success', () => {
      const toast = showToast('Default message');
      expect(toast.className).toContain('bg-green-500');
    });
  });

  describe('确认对话框', () => {
    // 从app.js中提取的确认对话框函数
    function showConfirmDialog(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
      return new Promise((resolve) => {
        let dialog = document.getElementById('confirmDialog');
        if (!dialog) {
          dialog = document.createElement('div');
          dialog.id = 'confirmDialog';
          dialog.className = 'modal';
          dialog.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6" onclick="event.stopPropagation()">
              <h3 id="confirmDialogTitle" class="text-xl font-bold text-gray-900 mb-4">${title}</h3>
              <p id="confirmDialogMessage" class="text-gray-700 mb-6">${message}</p>
              <div class="flex space-x-3">
                <button id="confirmDialogCancel" class="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-semibold py-2 rounded-lg transition">
                  ${cancelText}
                </button>
                <button id="confirmDialogConfirm" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-lg transition">
                  ${confirmText}
                </button>
              </div>
            </div>
          `;
          document.body.appendChild(dialog);
        }

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

    test('应该创建确认对话框', async () => {
      const promise = showConfirmDialog('Test Title', 'Test Message');
      const dialog = document.getElementById('confirmDialog');
      expect(dialog).toBeTruthy();
      expect(dialog.classList.contains('active')).toBe(true);
      
      // 点击确认按钮
      const confirmBtn = document.getElementById('confirmDialogConfirm');
      confirmBtn.click();
      
      const result = await promise;
      expect(result).toBe(true);
      expect(dialog.classList.contains('active')).toBe(false);
    });

    test('应该显示正确的标题和消息', () => {
      showConfirmDialog('Test Title', 'Test Message');
      const titleEl = document.getElementById('confirmDialogTitle');
      const messageEl = document.getElementById('confirmDialogMessage');
      expect(titleEl.textContent).toBe('Test Title');
      expect(messageEl.textContent).toBe('Test Message');
    });

    test('点击取消按钮应该返回false', async () => {
      const promise = showConfirmDialog('Test', 'Message');
      const cancelBtn = document.getElementById('confirmDialogCancel');
      cancelBtn.click();
      
      const result = await promise;
      expect(result).toBe(false);
    });

    test('点击确认按钮应该返回true', async () => {
      const promise = showConfirmDialog('Test', 'Message');
      const confirmBtn = document.getElementById('confirmDialogConfirm');
      confirmBtn.click();
      
      const result = await promise;
      expect(result).toBe(true);
    });

    test('应该支持自定义按钮文字', () => {
      showConfirmDialog('Test', 'Message', 'Delete', 'Cancel');
      const confirmBtn = document.getElementById('confirmDialogConfirm');
      const cancelBtn = document.getElementById('confirmDialogCancel');
      expect(confirmBtn.textContent).toBe('Delete');
      expect(cancelBtn.textContent).toBe('Cancel');
    });
  });

  describe('按钮加载状态', () => {
    // 从app.js中提取的按钮加载状态函数
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

    test('应该设置按钮为加载状态', () => {
      const button = document.createElement('button');
      button.id = 'testButton';
      button.textContent = 'Submit';
      document.body.appendChild(button);

      setButtonLoading(button, true);

      expect(button.disabled).toBe(true);
      expect(button.dataset.originalText).toBe('Submit');
      expect(button.innerHTML).toContain('Loading...');
      expect(button.innerHTML).toContain('animate-spin');
    });

    test('应该恢复按钮正常状态', () => {
      const button = document.createElement('button');
      button.id = 'testButton';
      button.textContent = 'Submit';
      document.body.appendChild(button);

      setButtonLoading(button, true);
      setButtonLoading(button, false);

      expect(button.disabled).toBe(false);
      expect(button.textContent).toBe('Submit');
      expect(button.dataset.originalText).toBeUndefined();
    });

    test('应该支持通过ID选择按钮', () => {
      const button = document.createElement('button');
      button.id = 'testButton';
      button.textContent = 'Submit';
      document.body.appendChild(button);

      setButtonLoading('testButton', true);

      expect(button.disabled).toBe(true);
    });

    test('应该处理不存在的按钮', () => {
      expect(() => {
        setButtonLoading('nonExistentButton', true);
      }).not.toThrow();
    });

    test('应该处理null按钮', () => {
      expect(() => {
        setButtonLoading(null, true);
      }).not.toThrow();
    });
  });

  describe('全局Loading遮罩', () => {
    // 从app.js中提取的全局Loading函数
    function showGlobalLoading(message = 'Loading...') {
      let loading = document.getElementById('globalLoading');
      if (!loading) {
        loading = document.createElement('div');
        loading.id = 'globalLoading';
        loading.className = 'hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
        loading.innerHTML = `
          <div class="bg-white rounded-lg p-6 flex flex-col items-center space-y-4">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p id="globalLoadingMessage" class="text-gray-700 font-medium">${message}</p>
          </div>
        `;
        document.body.appendChild(loading);
      }

      const messageEl = document.getElementById('globalLoadingMessage');
      if (messageEl) {
        messageEl.textContent = message;
      }
      loading.classList.remove('hidden');
    }

    function hideGlobalLoading() {
      const loading = document.getElementById('globalLoading');
      if (loading) {
        loading.classList.add('hidden');
      }
    }

    test('应该显示全局Loading遮罩', () => {
      showGlobalLoading('Please wait...');
      const loading = document.getElementById('globalLoading');
      expect(loading).toBeTruthy();
      expect(loading.classList.contains('hidden')).toBe(false);
      
      const messageEl = document.getElementById('globalLoadingMessage');
      expect(messageEl.textContent).toBe('Please wait...');
    });

    test('应该隐藏全局Loading遮罩', () => {
      showGlobalLoading();
      hideGlobalLoading();
      const loading = document.getElementById('globalLoading');
      expect(loading.classList.contains('hidden')).toBe(true);
    });

    test('应该使用默认消息', () => {
      showGlobalLoading();
      const messageEl = document.getElementById('globalLoadingMessage');
      expect(messageEl.textContent).toBe('Loading...');
    });
  });
});

