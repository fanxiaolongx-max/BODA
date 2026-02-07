const https = require('https');
const { URL } = require('url');
const { logger } = require('./logger');

function buildHeaders(baseHeaders = {}, extra = {}) {
  return {
    ...baseHeaders,
    ...extra
  };
}

function httpsRequestJson(urlString, payload, headers = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const body = JSON.stringify(payload || {});
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          ...headers
        },
        timeout: timeoutMs
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(responseBody);
            return;
          }
          reject(new Error(`AI API ${res.statusCode}: ${responseBody}`));
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('AI request timeout'));
    });
    req.write(body);
    req.end();
  });
}

function normalizeBaseUrl(baseUrl, fallback) {
  if (baseUrl) return baseUrl.replace(/\/$/, '');
  return fallback.replace(/\/$/, '');
}

function getProviderConfig(aiConfig = {}) {
  const provider = String(aiConfig.provider || 'openai').toLowerCase();
  const extraHeaders = aiConfig.extra_headers && typeof aiConfig.extra_headers === 'object'
    ? aiConfig.extra_headers
    : {};
  return {
    provider,
    baseUrl: aiConfig.base_url || '',
    apiKey: aiConfig.api_key || '',
    model: aiConfig.model || '',
    timeoutMs: Number.isFinite(aiConfig.timeout_ms) ? aiConfig.timeout_ms : 15000,
    maxTokens: Number.isFinite(aiConfig.max_tokens) ? aiConfig.max_tokens : 800,
    retryCount: Number.isFinite(aiConfig.retry_count) ? aiConfig.retry_count : 2,
    retryDelayMs: Number.isFinite(aiConfig.retry_delay_ms) ? aiConfig.retry_delay_ms : 1200,
    systemPrompt: aiConfig.system_prompt || '',
    extraHeaders
  };
}

async function withRetry(fn, { retryCount = 2, retryDelayMs = 1200 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retryCount) break;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw lastError;
}

async function callOpenAiCompatible({ baseUrl, apiKey, model, timeoutMs, maxTokens, systemPrompt, extraHeaders }, prompt) {
  const root = normalizeBaseUrl(baseUrl, 'https://api.openai.com');
  const url = root.includes('/v1') ? `${root}/chat/completions` : `${root}/v1/chat/completions`;
  const payload = {
    model: model || 'gpt-4o-mini',
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content: prompt }
    ],
    max_tokens: maxTokens,
    temperature: 0.2
  };
  const headers = buildHeaders(
    apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    extraHeaders
  );
  const response = await httpsRequestJson(url, payload, headers, timeoutMs);
  const data = JSON.parse(response);
  const text = data?.choices?.[0]?.message?.content;
  return text ? String(text).trim() : '';
}

async function callAnthropic({ baseUrl, apiKey, model, timeoutMs, maxTokens, systemPrompt, extraHeaders }, prompt) {
  const root = normalizeBaseUrl(baseUrl, 'https://api.anthropic.com');
  const url = `${root}/v1/messages`;
  const payload = {
    model: model || 'claude-3-5-sonnet-20240620',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
  };
  if (systemPrompt) {
    payload.system = systemPrompt;
  }
  const headers = buildHeaders(
    apiKey ? { 'x-api-key': apiKey } : {},
    {
      'anthropic-version': '2023-06-01',
      ...extraHeaders
    }
  );
  const response = await httpsRequestJson(url, payload, headers, timeoutMs);
  const data = JSON.parse(response);
  const text = data?.content?.[0]?.text;
  return text ? String(text).trim() : '';
}

async function callGemini({ baseUrl, apiKey, model, timeoutMs, maxTokens, systemPrompt, extraHeaders }, prompt) {
  const root = normalizeBaseUrl(baseUrl, 'https://generativelanguage.googleapis.com');
  const modelName = model || 'gemini-1.5-flash';
  const url = `${root}/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey || '')}`;
  const payload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.2
    }
  };
  if (systemPrompt) {
    payload.system_instruction = { parts: [{ text: systemPrompt }] };
  }
  const headers = buildHeaders({}, extraHeaders);
  const response = await httpsRequestJson(url, payload, headers, timeoutMs);
  const data = JSON.parse(response);
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? String(text).trim() : '';
}

async function generateAiSummary(aiConfig, prompt) {
  const config = getProviderConfig(aiConfig);
  if (!config.apiKey && config.provider !== 'proxy') {
    return '';
  }
  if (!prompt) return '';
  try {
    if (config.provider === 'anthropic') {
      return await withRetry(() => callAnthropic(config, prompt), config);
    }
    if (config.provider === 'gemini') {
      return await withRetry(() => callGemini(config, prompt), config);
    }
    if (config.provider === 'proxy') {
      return await withRetry(() => callOpenAiCompatible(config, prompt), config);
    }
    return await withRetry(() => callOpenAiCompatible(config, prompt), config);
  } catch (error) {
    logger.warn('AI 生成失败', { error: error.message });
    return '';
  }
}

async function testAiConfig(aiConfig, prompt) {
  const config = getProviderConfig(aiConfig);
  if (!config.apiKey && config.provider !== 'proxy') {
    throw new Error('API Key 未配置');
  }
  if (!prompt) {
    throw new Error('测试提示词为空');
  }
  if (config.provider === 'anthropic') {
    return await withRetry(() => callAnthropic(config, prompt), config);
  }
  if (config.provider === 'gemini') {
    return await withRetry(() => callGemini(config, prompt), config);
  }
  if (config.provider === 'proxy') {
    return await withRetry(() => callOpenAiCompatible(config, prompt), config);
  }
  return await withRetry(() => callOpenAiCompatible(config, prompt), config);
}

module.exports = {
  generateAiSummary,
  getProviderConfig,
  testAiConfig
};
