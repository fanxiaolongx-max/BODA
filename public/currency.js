// 货币单位配置
let currencyConfig = {
  currency: 'EGP',
  symbol: '¥'
};

// 格式化价格显示
function formatPrice(price) {
  return `${currencyConfig.symbol}${price.toFixed(0)} ${currencyConfig.currency}`;
}

// 格式化价格显示（简化版，只显示符号和数字）
function formatPriceSimple(price) {
  return `${currencyConfig.symbol}${price.toFixed(0)}`;
}

// 加载货币配置
async function loadCurrencyConfig() {
  try {
    const response = await fetch(`${API_BASE}/public/settings`);
    const data = await response.json();
    if (data.success && data.settings) {
      currencyConfig.currency = data.settings.currency || 'EGP';
      currencyConfig.symbol = data.settings.currency_symbol || '¥';
    }
  } catch (error) {
    console.error('加载货币配置失败:', error);
  }
}

// 导出配置
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { formatPrice, formatPriceSimple, loadCurrencyConfig };
}

