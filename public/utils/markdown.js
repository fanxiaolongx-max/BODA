/**
 * Markdown渲染工具
 * 使用marked.js库进行Markdown渲染
 */

let markedLoaded = false;
let highlightLoaded = false;

/**
 * 加载marked.js库
 */
function loadMarked() {
  return new Promise((resolve, reject) => {
    if (markedLoaded && window.marked) {
      resolve();
      return;
    }
    
    if (document.querySelector('script[src*="marked"]')) {
      // 如果已经在加载中，等待
      const checkInterval = setInterval(() => {
        if (window.marked) {
          clearInterval(checkInterval);
          markedLoaded = true;
          resolve();
        }
      }, 100);
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js';
    script.onload = () => {
      markedLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * 加载highlight.js库
 */
function loadHighlight() {
  return new Promise((resolve, reject) => {
    if (highlightLoaded && window.hljs) {
      resolve();
      return;
    }
    
    if (document.querySelector('script[src*="highlight"]')) {
      const checkInterval = setInterval(() => {
        if (window.hljs) {
          clearInterval(checkInterval);
          highlightLoaded = true;
          resolve();
        }
      }, 100);
      return;
    }
    
    // 加载CSS
    if (!document.querySelector('link[href*="highlight"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/default.min.css';
      document.head.appendChild(link);
    }
    
    // 加载JS
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js';
    script.onload = () => {
      highlightLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * 初始化Markdown渲染器
 */
async function initMarkdown() {
  await Promise.all([loadMarked(), loadHighlight()]);
  
  // 配置marked
  if (window.marked) {
    window.marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: function(code, lang) {
        if (window.hljs && lang) {
          try {
            return window.hljs.highlight(code, { language: lang }).value;
          } catch (err) {
            return window.hljs.highlightAuto(code).value;
          }
        }
        return code;
      }
    });
  }
}

/**
 * 渲染Markdown为HTML
 */
async function renderMarkdown(markdown) {
  await initMarkdown();
  
  if (!window.marked) {
    throw new Error('Marked.js未加载');
  }
  
  // 转义HTML以防止XSS（marked会自动处理，但我们需要确保安全）
  const html = window.marked.parse(markdown);
  
  // 高亮代码块
  if (window.hljs) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const codeBlocks = tempDiv.querySelectorAll('pre code');
    codeBlocks.forEach(block => {
      window.hljs.highlightElement(block);
    });
    return tempDiv.innerHTML;
  }
  
  return html;
}

/**
 * 渲染Markdown到元素
 */
async function renderMarkdownToElement(markdown, element) {
  try {
    if (typeof element === 'string') {
      element = document.querySelector(element);
    }
    
    if (!element) {
      throw new Error('元素不存在');
    }
    
    const html = await renderMarkdown(markdown);
    element.innerHTML = html;
    
    // 处理Markdown中的图片，确保可以显示
    const images = element.querySelectorAll('img');
    images.forEach(img => {
      const originalSrc = img.getAttribute('src');
      if (originalSrc) {
        const fixedSrc = validateImageUrl(originalSrc);
        img.src = fixedSrc;
        img.onerror = function() {
          img.style.display = 'none';
        };
      }
    });
    
    // 高亮代码块
    if (window.hljs) {
      const codeBlocks = element.querySelectorAll('pre code');
      codeBlocks.forEach(block => {
        window.hljs.highlightElement(block);
      });
    }
    
    return html;
  } catch (error) {
    console.error('渲染Markdown失败:', error);
    if (element) {
      element.innerHTML = '<p class="text-red-500">渲染失败: ' + escapeHtml(error.message) + '</p>';
    }
    throw error;
  }
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
 * 验证图片URL
 */
function validateImageUrl(url) {
  if (!url) return '';
  
  // 如果是相对路径，直接返回
  if (url.startsWith('/') || url.startsWith('./')) {
    return url;
  }
  
  // 如果是http/https，返回
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // 如果是data URI，返回
  if (url.startsWith('data:')) {
    return url;
  }
  
  // 默认添加/uploads前缀
  return '/uploads/' + url;
}

/**
 * 处理Markdown中的图片
 */
function processMarkdownImages(markdown) {
  // 这个函数可以在渲染前预处理图片URL
  // 目前marked会自动处理，这里保留用于扩展
  return markdown;
}

// 导出函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initMarkdown,
    renderMarkdown,
    renderMarkdownToElement,
    escapeHtml,
    validateImageUrl,
    processMarkdownImages
  };
}
