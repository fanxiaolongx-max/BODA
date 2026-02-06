const https = require('https');
const { logger } = require('./logger');

const DEFAULT_ATTRACTIONS = [
  { id: 1, name: '金字塔', lat: 29.9792, lon: 31.1342 },
  { id: 2, name: '黑白沙漠', lat: 27.3912, lon: 28.1738 },
  { id: 3, name: '卢克索神庙', lat: 25.6996, lon: 32.6396 },
  { id: 4, name: '帝王谷', lat: 25.7402, lon: 32.6014 },
  { id: 5, name: '赫尔格达', lat: 27.2579, lon: 33.8116 }
];

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        timeout: 12000,
        headers: {
          'User-Agent': 'BODA Weather Updater'
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 300)}`));
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(new Error(`JSON parse failed: ${error.message}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
  });
}

function containsArabic(text) {
  if (!text || typeof text !== 'string') return false;
  return /[\u0600-\u06FF]/.test(text);
}

function containsChinese(text) {
  if (!text || typeof text !== 'string') return false;
  return /[\u4e00-\u9fff]/.test(text);
}

const trafficTranslateCache = new Map();

async function translateToChinese(text, sourceLang = 'en') {
  if (!text || typeof text !== 'string') return '';
  const source = text.trim();
  if (!source) return '';
  const cacheKey = `${sourceLang}:${source}`;
  if (trafficTranslateCache.has(cacheKey)) return trafficTranslateCache.get(cacheKey);

  try {
    // 免费公开接口，失败时回退原文，不影响主流程
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      source
    )}&langpair=${encodeURIComponent(sourceLang)}|zh-CN`;
    const data = await httpsGetJson(url);
    const translated = data?.responseData?.translatedText ? String(data.responseData.translatedText).trim() : '';
    if (translated) {
      trafficTranslateCache.set(cacheKey, translated);
      return translated;
    }
  } catch (error) {
    logger.warn('路况翻译失败，保留原文', { error: error.message, sourceLang });
  }

  trafficTranslateCache.set(cacheKey, '');
  return '';
}

function detectSourceLang(text) {
  if (containsChinese(text)) return 'zh-CN';
  if (containsArabic(text)) return 'ar';
  return 'en';
}

function formatBilingual(original, chinese) {
  if (!original) return '';
  if (!chinese || chinese === original) return original;
  return `${original}\n${chinese}`;
}

function mapWeatherCodeToVisibility(weatherCode) {
  // Open-Meteo weather_code 映射为可读能见度等级
  if ([0, 1].includes(weatherCode)) return '高';
  if ([2, 3, 45, 48].includes(weatherCode)) return '中';
  return '低';
}

function buildSuggestion({ temperature, uvIndex, windSpeed, visibility }) {
  const tips = [];
  if (temperature >= 35) tips.push('建议上午出行并加强补水防晒');
  if (uvIndex >= 8) tips.push('紫外线较强，建议佩戴遮阳装备');
  if (windSpeed >= 25) tips.push('风力较大，注意防风和沙尘');
  if (visibility === '低') tips.push('能见度较低，建议减速慢行');
  if (tips.length === 0) tips.push('天气总体平稳，可正常安排出行');
  return tips.join('；');
}

function formatWindSpeedKmh(windSpeed) {
  if (typeof windSpeed !== 'number' || Number.isNaN(windSpeed)) {
    return '未知';
  }
  return `${Math.round(windSpeed)} km/h`;
}

function formatCairoTimeLabel(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(date);
  } catch (error) {
    return date.toISOString();
  }
}

async function fetchOpenMeteoAttractionWeather(attraction) {
  const currentParams = [
    'temperature_2m',
    'wind_speed_10m',
    'weather_code',
    'uv_index',
    'visibility'
  ].join(',');

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(
    attraction.lat
  )}&longitude=${encodeURIComponent(
    attraction.lon
  )}&current=${encodeURIComponent(currentParams)}&timezone=Africa%2FCairo`;

  const data = await httpsGetJson(url);
  const current = data.current || {};
  const temperature = Number(current.temperature_2m);
  const windSpeed = Number(current.wind_speed_10m);
  const uvIndex = Number(current.uv_index);
  const weatherCode = Number(current.weather_code);
  const visibilityMeters = Number(current.visibility);
  const visibility = mapWeatherCodeToVisibility(weatherCode);

  return {
    id: attraction.id,
    name: attraction.name,
    temperature: Number.isFinite(temperature) ? Math.round(temperature) : null,
    visibility: Number.isFinite(visibilityMeters)
      ? visibilityMeters < 3000
        ? '低'
        : visibilityMeters < 7000
          ? '中'
          : visibility
      : visibility,
    uvIndex: Number.isFinite(uvIndex) ? Math.round(uvIndex) : null,
    windSpeed: formatWindSpeedKmh(windSpeed),
    suggestion: buildSuggestion({
      temperature: Number.isFinite(temperature) ? temperature : 30,
      uvIndex: Number.isFinite(uvIndex) ? uvIndex : 5,
      windSpeed: Number.isFinite(windSpeed) ? windSpeed : 10,
      visibility
    })
  };
}

async function normalizeTomTomTrafficEvent(item, index) {
  const props = item.properties || item;
  const categoryMap = {
    1: '事故',
    2: '施工',
    3: '封闭',
    4: '天气',
    5: '其他',
    6: '交通管制'
  };
  const iconCategory = Number(props.iconCategory);
  const type = categoryMap[iconCategory] || '其他';
  const fromText = props.from || '';
  const toText = props.to || '';
  const locationRaw = [fromText, toText].filter(Boolean).join(' -> ') || '开罗城区';
  const locationSourceLang = detectSourceLang(locationRaw);
  const locationZh =
    locationSourceLang === 'zh-CN' ? locationRaw : await translateToChinese(locationRaw, locationSourceLang);
  const location = formatBilingual(locationRaw, locationZh);
  const delayMin = props.delay ? Math.max(1, Math.round(Number(props.delay) / 60)) : null;
  const messageCore = props.events?.[0]?.description || props.description || props.eventDescription || '';
  const normalizedCore = messageCore || '检测到交通异常';
  const messageSourceLang = detectSourceLang(normalizedCore);
  const translatedCore =
    messageSourceLang === 'zh-CN'
      ? normalizedCore
      : await translateToChinese(normalizedCore, messageSourceLang);
  const messageMain = [
    normalizedCore,
    delayMin ? `预计延迟约 ${delayMin} 分钟` : '',
    props.length ? `影响长度约 ${Math.round(Number(props.length))} 米` : ''
  ]
    .filter(Boolean)
    .join('，');
  const message = formatBilingual(messageMain, translatedCore);
  const startTime = props.startTime || props.startTimeUTC || '';

  return {
    id: index + 1,
    time: startTime ? startTime.slice(11, 16) : formatCairoTimeLabel().slice(11, 16),
    type,
    location,
    message,
    locationZh: locationZh || null,
    messageZh: translatedCore || null
  };
}

async function fetchTomTomTrafficEvents(tomtomApiKey, bbox) {
  if (!tomtomApiKey) return [];

  const useBbox = bbox && bbox.split(',').length === 4 ? bbox : '31.10,29.95,31.40,30.20';
  const baseUrl = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${encodeURIComponent(
    tomtomApiKey
  )}&bbox=${encodeURIComponent(
    useBbox
  )}&fields=%7Bincidents%7Btype%2Cproperties%7BiconCategory%2Cfrom%2Cto%2Clength%2Cdelay%2CstartTime%2Cevents%7Bdescription%7D%7D%7D%7D&timeValidityFilter=present`;

  // TomTom 对 language 支持有限，优先用 en-US，失败则降级为不传 language
  let data;
  try {
    data = await httpsGetJson(`${baseUrl}&language=en-US`);
  } catch (error) {
    logger.warn('TomTom 路况请求（en-US）失败，尝试无 language 参数重试', {
      error: error.message
    });
    data = await httpsGetJson(baseUrl);
  }

  const incidents = data.incidents || data.tm?.poi || [];
  if (!Array.isArray(incidents)) return [];

  const mapped = await Promise.all(
    incidents.slice(0, 20).map((item, index) => normalizeTomTomTrafficEvent(item, index))
  );

  return mapped.filter((i) => i.location && i.message);
}

function buildGlobalAlert(attractions, traffic) {
  const maxTemp = attractions.reduce((m, a) => Math.max(m, Number(a.temperature) || 0), 0);
  const highUvCount = attractions.filter((a) => (Number(a.uvIndex) || 0) >= 8).length;
  const lowVisibilityCount = attractions.filter((a) => a.visibility === '低').length;
  const trafficCount = traffic.length;

  let level = 'low';
  let message = '整体天气较平稳，适合出行。';

  if (maxTemp >= 38 || lowVisibilityCount >= 2 || trafficCount >= 6) {
    level = 'high';
    message = '高温/低能见度或路况异常较多，请减少非必要出行并提前规划路线。';
  } else if (maxTemp >= 34 || highUvCount >= 2 || trafficCount >= 3) {
    level = 'medium';
    message = '部分区域天气或路况有波动，建议错峰出行并注意防晒补水。';
  }

  return { level, message };
}

async function fetchWeatherRoadData(settings = {}, existingContent = null) {
  const city = settings.weather_city_name || 'Cairo';
  const tomtomApiKey = settings.weather_tomtom_api_key || '';
  const tomtomBbox = settings.weather_tomtom_bbox || '';

  // 并行抓取景点天气，降低手动刷新耗时
  const attractionResults = await Promise.allSettled(
    DEFAULT_ATTRACTIONS.map((attraction) => fetchOpenMeteoAttractionWeather(attraction))
  );
  const attractions = attractionResults
    .map((result, index) => {
      if (result.status === 'fulfilled') return result.value;
      logger.warn('获取景点天气失败', {
        attraction: DEFAULT_ATTRACTIONS[index]?.name || 'unknown',
        error: result.reason?.message || 'unknown'
      });
      return null;
    })
    .filter(Boolean);

  let traffic = [];
  try {
    traffic = await fetchTomTomTrafficEvents(tomtomApiKey, tomtomBbox);
  } catch (error) {
    logger.warn('获取 TomTom 路况失败', { error: error.message });
  }

  // TomTom 不可用时，回退保留旧 traffic 数据，避免页面空白
  if ((!traffic || traffic.length === 0) && existingContent && Array.isArray(existingContent.traffic)) {
    traffic = existingContent.traffic.slice(0, 20);
  }

  const globalAlert = buildGlobalAlert(attractions, traffic);

  return {
    globalAlert,
    attractions,
    traffic,
    data: {
      city,
      source: {
        weather: 'Open-Meteo',
        traffic: tomtomApiKey ? 'TomTom' : 'TomTom (disabled/no key)'
      },
      updatedAt: new Date().toISOString(),
      updatedAtLocal: formatCairoTimeLabel()
    }
  };
}

module.exports = {
  fetchWeatherRoadData
};
