const https = require('https');
const { logger } = require('./logger');

/**
 * 从FreeCurrencyAPI获取汇率
 * @param {string} apiKey - API密钥
 * @param {string[]} baseCurrencies - 基础货币列表
 * @param {string} targetCurrency - 目标货币
 * @returns {Promise<Object>} 汇率数据对象 {CNY: {EGP: 6.74}, USD: {EGP: 30.5}, ...}
 */
async function fetchRatesFromFreecurrencyAPI(apiKey, baseCurrencies, targetCurrency) {
  if (!apiKey || !baseCurrencies || baseCurrencies.length === 0 || !targetCurrency) {
    throw new Error('缺少必要的参数');
  }

  const exchangeRates = {};
  const errors = [];

  // 为每个基础货币获取汇率
  for (const baseCurrency of baseCurrencies) {
    try {
      const url = `https://api.freecurrencyapi.com/v1/latest?apikey=${encodeURIComponent(apiKey)}&base_currency=${baseCurrency}&currencies=${targetCurrency}`;
      
      const response = await new Promise((resolve, reject) => {
        const req = https.get(url, {
          timeout: 5000,
          headers: {
            'User-Agent': 'BODA Exchange Rate Updater'
          }
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(new Error(`解析响应失败: ${e.message}`));
              }
            } else {
              reject(new Error(`API返回错误: ${res.statusCode} ${res.statusMessage}`));
            }
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('请求超时'));
        });
      });

      // 处理响应格式：{"data": {"EGP": 6.74}}
      if (response.data && response.data[targetCurrency]) {
        const rate = parseFloat(response.data[targetCurrency]);
        if (!isNaN(rate) && rate > 0) {
          if (!exchangeRates[baseCurrency]) {
            exchangeRates[baseCurrency] = {};
          }
          exchangeRates[baseCurrency][targetCurrency] = rate;
          logger.info(`FreeCurrencyAPI: 获取 ${baseCurrency} -> ${targetCurrency} = ${rate}`);
        } else {
          errors.push(`${baseCurrency}: 无效的汇率值`);
        }
      } else {
        errors.push(`${baseCurrency}: API响应中未找到目标货币 ${targetCurrency}`);
      }
    } catch (error) {
      errors.push(`${baseCurrency}: ${error.message}`);
      logger.warn(`FreeCurrencyAPI获取 ${baseCurrency} 汇率失败`, { error: error.message });
    }
  }

  if (Object.keys(exchangeRates).length === 0) {
    throw new Error(`无法获取任何汇率数据。错误: ${errors.join('; ')}`);
  }

  return exchangeRates;
}

/**
 * 从ExchangeRate-API获取汇率
 * @param {string} apiKey - API密钥
 * @param {string[]} baseCurrencies - 基础货币列表
 * @param {string} targetCurrency - 目标货币
 * @returns {Promise<Object>} 汇率数据对象 {CNY: {EGP: 6.74}, USD: {EGP: 30.5}, ...}
 */
async function fetchRatesFromExchangeRateAPI(apiKey, baseCurrencies, targetCurrency) {
  if (!apiKey || !baseCurrencies || baseCurrencies.length === 0 || !targetCurrency) {
    throw new Error('缺少必要的参数');
  }

  const exchangeRates = {};
  const errors = [];

  // 为每个基础货币获取汇率
  for (const baseCurrency of baseCurrencies) {
    try {
      const url = `https://v6.exchangerate-api.com/v6/${encodeURIComponent(apiKey)}/latest/${baseCurrency}`;
      
      const response = await new Promise((resolve, reject) => {
        const req = https.get(url, {
          timeout: 5000,
          headers: {
            'User-Agent': 'BODA Exchange Rate Updater'
          }
        }, (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                resolve(JSON.parse(data));
              } catch (e) {
                reject(new Error(`解析响应失败: ${e.message}`));
              }
            } else {
              reject(new Error(`API返回错误: ${res.statusCode} ${res.statusMessage}`));
            }
          });
        });

        req.on('error', (error) => {
          reject(error);
        });

        req.on('timeout', () => {
          req.destroy();
          reject(new Error('请求超时'));
        });
      });

      // 处理响应格式：{"result": "success", "conversion_rates": {"EGP": 30.5}}
      if (response.result === 'success' && response.conversion_rates && response.conversion_rates[targetCurrency]) {
        const rate = parseFloat(response.conversion_rates[targetCurrency]);
        if (!isNaN(rate) && rate > 0) {
          if (!exchangeRates[baseCurrency]) {
            exchangeRates[baseCurrency] = {};
          }
          exchangeRates[baseCurrency][targetCurrency] = rate;
          logger.info(`ExchangeRate-API: 获取 ${baseCurrency} -> ${targetCurrency} = ${rate}`);
        } else {
          errors.push(`${baseCurrency}: 无效的汇率值`);
        }
      } else {
        const errorMsg = response['error-type'] || '未知错误';
        errors.push(`${baseCurrency}: ${errorMsg}`);
        logger.warn(`ExchangeRate-API获取 ${baseCurrency} 汇率失败`, { 
          error: errorMsg,
          result: response.result 
        });
      }
    } catch (error) {
      errors.push(`${baseCurrency}: ${error.message}`);
      logger.warn(`ExchangeRate-API获取 ${baseCurrency} 汇率失败`, { error: error.message });
    }
  }

  if (Object.keys(exchangeRates).length === 0) {
    throw new Error(`无法获取任何汇率数据。错误: ${errors.join('; ')}`);
  }

  return exchangeRates;
}

/**
 * 获取汇率（优先使用FreeCurrencyAPI，失败时使用ExchangeRate-API）
 * @param {Object} settings - 设置对象
 * @param {string} settings.freecurrencyapi_api_key - FreeCurrencyAPI密钥
 * @param {string} settings.exchangerate_api_key - ExchangeRate-API密钥
 * @param {string} settings.exchange_rate_base_currencies - 基础货币列表（逗号分隔）
 * @param {string} settings.exchange_rate_target_currency - 目标货币
 * @returns {Promise<Object>} 汇率数据对象 {CNY: {EGP: 6.74}, USD: {EGP: 30.5}, ...}
 */
async function fetchExchangeRates(settings) {
  const {
    freecurrencyapi_api_key,
    exchangerate_api_key,
    exchange_rate_base_currencies = 'CNY,USD,EUR,GBP,JPY,SAR,AED,RUB,INR,KRW,THB',
    exchange_rate_target_currency = 'EGP'
  } = settings;

  // 解析基础货币列表
  const baseCurrencies = exchange_rate_base_currencies
    .split(',')
    .map(c => c.trim().toUpperCase())
    .filter(c => c.length === 3);

  if (baseCurrencies.length === 0) {
    throw new Error('基础货币列表为空');
  }

  const targetCurrency = exchange_rate_target_currency.trim().toUpperCase();
  if (targetCurrency.length !== 3) {
    throw new Error('目标货币代码格式不正确（应为3位大写字母）');
  }

  // 优先使用FreeCurrencyAPI
  if (freecurrencyapi_api_key) {
    try {
      logger.info('尝试使用FreeCurrencyAPI获取汇率', {
        baseCurrencies: baseCurrencies.length,
        targetCurrency
      });
      const rates = await fetchRatesFromFreecurrencyAPI(
        freecurrencyapi_api_key,
        baseCurrencies,
        targetCurrency
      );
      logger.info('FreeCurrencyAPI获取汇率成功', {
        currencies: Object.keys(rates).length
      });
      return rates;
    } catch (error) {
      logger.warn('FreeCurrencyAPI获取汇率失败，尝试使用ExchangeRate-API', {
        error: error.message
      });
    }
  }

  // Fallback到ExchangeRate-API
  if (exchangerate_api_key) {
    try {
      logger.info('尝试使用ExchangeRate-API获取汇率', {
        baseCurrencies: baseCurrencies.length,
        targetCurrency
      });
      const rates = await fetchRatesFromExchangeRateAPI(
        exchangerate_api_key,
        baseCurrencies,
        targetCurrency
      );
      logger.info('ExchangeRate-API获取汇率成功', {
        currencies: Object.keys(rates).length
      });
      return rates;
    } catch (error) {
      logger.error('ExchangeRate-API获取汇率失败', {
        error: error.message
      });
      throw new Error(`所有汇率API都失败: ${error.message}`);
    }
  }

  throw new Error('未配置任何汇率API密钥');
}

module.exports = {
  fetchRatesFromFreecurrencyAPI,
  fetchRatesFromExchangeRateAPI,
  fetchExchangeRates
};
