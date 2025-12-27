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

  // 优化：先测试第一个货币，如果是403权限错误，立即停止，避免浪费时间和资源
  const testCurrency = baseCurrencies[0];
  let hasPermissionError = false;

  // 为每个基础货币获取汇率
  for (const baseCurrency of baseCurrencies) {
    try {
      // 使用查询参数方式传递API密钥（符合官方示例格式）
      const url = `https://api.freecurrencyapi.com/v1/latest?apikey=${encodeURIComponent(apiKey)}&base_currency=${baseCurrency}&currencies=${targetCurrency}`;
      
      const response = await new Promise((resolve, reject) => {
        const req = https.get(url, {
          timeout: 10000, // 增加超时时间到10秒
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
              // 读取错误响应体以便更好地诊断问题
              let errorMsg = `${res.statusCode} ${res.statusMessage}`;
              try {
                const errorData = JSON.parse(data);
                if (errorData.message) {
                  errorMsg += `: ${errorData.message}`;
                }
              } catch (e) {
                // 忽略解析错误
              }
              
              // 如果是403权限错误或422参数错误（如货币不支持），标记并立即停止
              if (res.statusCode === 403 || res.statusCode === 422) {
                hasPermissionError = true;
              }
              
              reject(new Error(`API返回错误: ${errorMsg}`));
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
      
      // 如果是403权限错误或422参数错误（如货币不支持），立即停止尝试其他货币
      if (hasPermissionError || (error.message && (error.message.includes('403') || error.message.includes('422')))) {
        const errorType = error.message.includes('422') ? '422参数错误（可能不支持该货币）' : '403权限错误（API密钥可能无效）';
        logger.warn(`FreeCurrencyAPI返回${errorType}，停止尝试其他货币`);
        break;
      }
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
 * @returns {Promise<Object>} 汇率数据对象 {rates: {CNY: {EGP: 6.74}, ...}, updateTime: "2025-12-26T18:00:00Z"}
 */
async function fetchRatesFromExchangeRateAPI(apiKey, baseCurrencies, targetCurrency) {
  if (!apiKey || !baseCurrencies || baseCurrencies.length === 0 || !targetCurrency) {
    throw new Error('缺少必要的参数');
  }

  const exchangeRates = {};
  let apiUpdateTime = null; // API返回的汇率更新时间

  try {
    // 优化：以目标货币作为base_currency，一次调用获取所有汇率
    // 例如：base=EGP时，返回的是"1 EGP = X 其他货币"
    // 我们需要计算倒数：1 其他货币 = 1/X EGP
    const url = `https://v6.exchangerate-api.com/v6/${encodeURIComponent(apiKey)}/latest/${targetCurrency}`;
    
    logger.info(`ExchangeRate-API: 使用优化方式，以${targetCurrency}作为base获取所有汇率`);
    
    const response = await new Promise((resolve, reject) => {
      const req = https.get(url, {
        timeout: 10000,
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
            // 读取错误响应体以便更好地诊断问题
            let errorMsg = `${res.statusCode} ${res.statusMessage}`;
            try {
              const errorData = JSON.parse(data);
              if (errorData['error-type']) {
                errorMsg += `: ${errorData['error-type']}`;
              } else if (errorData.message) {
                errorMsg += `: ${errorData.message}`;
              }
            } catch (e) {
              // 忽略解析错误
            }
            reject(new Error(`API返回错误: ${errorMsg}`));
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

    // 处理响应格式：{"result": "success", "base_code": "EGP", "time_last_update_utc": "2025-12-26T18:00:00Z", "conversion_rates": {"USD": 0.02107, "CNY": 0.1485, ...}}
    if (response.result === 'success' && response.conversion_rates) {
      const conversionRates = response.conversion_rates;
      let successCount = 0;
      
      // 提取API返回的汇率更新时间
      if (response.time_last_update_utc) {
        apiUpdateTime = response.time_last_update_utc;
        logger.info(`ExchangeRate-API: 汇率更新时间 ${apiUpdateTime}`);
      }
      
      // 从返回的汇率中提取所需的基础货币汇率
      for (const baseCurrency of baseCurrencies) {
        if (conversionRates[baseCurrency]) {
          // 如果base是EGP，返回的是"1 EGP = X 其他货币"
          // 我们需要计算倒数：1 其他货币 = 1/X EGP
          const rateFromTarget = parseFloat(conversionRates[baseCurrency]);
          if (!isNaN(rateFromTarget) && rateFromTarget > 0) {
            const rate = 1 / rateFromTarget; // 计算倒数
            if (!exchangeRates[baseCurrency]) {
              exchangeRates[baseCurrency] = {};
            }
            exchangeRates[baseCurrency][targetCurrency] = rate;
            logger.info(`ExchangeRate-API: 获取 ${baseCurrency} -> ${targetCurrency} = ${rate.toFixed(4)} (从 ${rateFromTarget.toFixed(4)} 计算)`);
            successCount++;
          } else {
            logger.warn(`ExchangeRate-API: ${baseCurrency} 的汇率值无效`, { rate: conversionRates[baseCurrency] });
          }
        } else {
          logger.warn(`ExchangeRate-API: 响应中未找到 ${baseCurrency} 的汇率`);
        }
      }
      
      if (successCount === 0) {
        throw new Error(`无法从响应中提取任何有效的汇率数据`);
      }
      
      logger.info(`ExchangeRate-API: 成功获取 ${successCount}/${baseCurrencies.length} 个货币的汇率`);
    } else {
      const errorMsg = response['error-type'] || '未知错误';
      throw new Error(`API响应格式错误: ${errorMsg}`);
    }
  } catch (error) {
    throw new Error(`ExchangeRate-API获取汇率失败: ${error.message}`);
  }

  if (Object.keys(exchangeRates).length === 0) {
    throw new Error(`无法获取任何汇率数据`);
  }

  // 返回汇率数据和时间信息
  return {
    rates: exchangeRates,
    updateTime: apiUpdateTime // API返回的汇率更新时间
  };
}

/**
 * 获取汇率（优先使用FreeCurrencyAPI，失败时使用ExchangeRate-API）
 * @param {Object} settings - 设置对象
 * @param {string} settings.freecurrencyapi_api_key - FreeCurrencyAPI密钥
 * @param {string} settings.exchangerate_api_key - ExchangeRate-API密钥
 * @param {string} settings.exchange_rate_base_currencies - 基础货币列表（逗号分隔）
 * @param {string} settings.exchange_rate_target_currency - 目标货币
 * @returns {Promise<Object>} 汇率数据对象 {rates: {CNY: {EGP: 6.74}, ...}, updateTime: "2025-12-26T18:00:00Z"} 或直接返回 {CNY: {EGP: 6.74}, ...}（兼容旧格式）
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
      // FreeCurrencyAPI返回的是旧格式，直接返回汇率对象（没有时间信息）
      return rates;
    } catch (error) {
      // 如果是403权限错误，说明API密钥无效，直接跳过，不要浪费时间
      if (error.message && error.message.includes('403')) {
        logger.warn('FreeCurrencyAPI返回403权限错误，密钥可能无效，直接使用ExchangeRate-API', {
          error: error.message
        });
      } else {
        logger.warn('FreeCurrencyAPI获取汇率失败，尝试使用ExchangeRate-API', {
          error: error.message
        });
      }
    }
  }

  // Fallback到ExchangeRate-API
  if (exchangerate_api_key) {
    try {
      logger.info('尝试使用ExchangeRate-API获取汇率', {
        baseCurrencies: baseCurrencies.length,
        targetCurrency
      });
      const result = await fetchRatesFromExchangeRateAPI(
        exchangerate_api_key,
        baseCurrencies,
        targetCurrency
      );
      logger.info('ExchangeRate-API获取汇率成功', {
        currencies: Object.keys(result.rates || result).length,
        updateTime: result.updateTime || '未提供'
      });
      // ExchangeRate-API返回新格式 {rates: {...}, updateTime: "..."}
      return result;
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
