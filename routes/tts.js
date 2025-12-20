const express = require('express');
const { body, validationResult } = require('express-validator');
const { EdgeTTS, Constants } = require('@andresaya/edge-tts');
const { logger } = require('../utils/logger');
const { getAsync } = require('../db/database');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();

// 验证中间件
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      message: '验证失败', 
      errors: errors.array() 
    });
  }
  next();
};

// 获取TTS设置（从数据库）
async function getTTSSettings() {
  try {
    const settings = {};
    const rateSetting = await getAsync("SELECT value FROM settings WHERE key = 'tts_rate'");
    const pitchSetting = await getAsync("SELECT value FROM settings WHERE key = 'tts_pitch'");
    const volumeSetting = await getAsync("SELECT value FROM settings WHERE key = 'tts_volume'");
    const voiceZhSetting = await getAsync("SELECT value FROM settings WHERE key = 'tts_voice_zh'");
    const voiceArSetting = await getAsync("SELECT value FROM settings WHERE key = 'tts_voice_ar'");
    
    settings.rate = rateSetting ? rateSetting.value : '50'; // 默认50%
    settings.pitch = pitchSetting ? pitchSetting.value : '0'; // 默认0Hz
    settings.volume = volumeSetting ? volumeSetting.value : '100'; // 默认100%
    settings.voiceZh = voiceZhSetting ? voiceZhSetting.value : 'zh-CN-XiaoxiaoNeural';
    settings.voiceAr = voiceArSetting ? voiceArSetting.value : 'ar-SA-HamedNeural';
    
    return settings;
  } catch (error) {
    logger.error('获取TTS设置失败', { error: error.message });
    // 返回默认设置
    return {
      rate: '50',
      pitch: '0',
      volume: '100',
      voiceZh: 'zh-CN-XiaoxiaoNeural',
      voiceAr: 'ar-SA-HamedNeural'
    };
  }
}

// 语言和语音映射：将简化的语言代码映射到Edge TTS的语音名称
// 注意：实际语音将从数据库设置中获取
const defaultVoiceMap = {
  'zh': 'zh-CN-XiaoxiaoNeural',  // 简体中文 - 晓晓（女声）
  'ar': 'ar-SA-HamedNeural'       // 阿拉伯语 - 哈米德（男声）
};

// 获取TTS文件存储目录
function getTTSDir() {
  const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
  const ttsDir = path.join(DATA_DIR, 'uploads', 'tts');
  // 确保目录存在
  if (!fs.existsSync(ttsDir)) {
    fs.mkdirSync(ttsDir, { recursive: true });
  }
  return ttsDir;
}

// 生成文件名（基于文本内容和TTS参数的哈希，避免重复生成）
// 注意：包含rate、pitch、volume等参数，确保不同设置生成不同文件
function generateFileName(text, lang, format, rate, pitch, volume, voice) {
  // 将TTS参数包含在哈希中，确保不同设置生成不同文件
  const hashInput = `${text}-${lang}-${format}-${rate}-${pitch}-${volume}-${voice}`;
  const hash = crypto.createHash('md5').update(hashInput).digest('hex');
  const ext = format === 'aac' ? 'm4a' : 'mp3';
  return `${hash}.${ext}`;
}

// 获取完整的文件URL
function getFileUrl(filename, req) {
  // 优先使用X-Forwarded-Proto（反向代理场景），否则使用req.protocol
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
  const host = req.get('host') || req.hostname || 'localhost:3000';
  return `${protocol}://${host}/uploads/tts/${filename}`;
}

/**
 * POST /api/tts
 * TTS语音合成API
 * 
 * 请求参数:
 * - text: string (必填) - 要合成的文本，最大5000字符
 * - lang: 'zh' | 'ar' (必填) - 语言代码
 * - format: 'mp3' | 'aac' (可选) - 音频格式，默认 'mp3'
 * 
 * 返回格式:
 * {
 *   success: true,
 *   audioUrl: string  // 完整的HTTPS URL
 * }
 */
router.post('/', [
  body('text')
    .notEmpty()
    .withMessage('文本内容不能为空')
    .isString()
    .withMessage('文本内容必须是字符串')
    .isLength({ min: 1, max: 5000 })
    .withMessage('文本长度必须在1-5000字符之间'),
  body('lang')
    .notEmpty()
    .withMessage('语言代码不能为空')
    .isIn(['zh', 'ar'])
    .withMessage('语言代码必须是 zh 或 ar'),
  body('format')
    .optional()
    .isIn(['mp3', 'aac'])
    .withMessage('音频格式必须是 mp3 或 aac'),
  validate
], async (req, res) => {
  try {
    const { text, lang, format = 'mp3' } = req.body;
    
    // 获取TTS设置
    const ttsSettings = await getTTSSettings();
    
    // 根据语言选择对应的语音
    let voice;
    if (lang === 'zh') {
      voice = ttsSettings.voiceZh || defaultVoiceMap['zh'];
    } else if (lang === 'ar') {
      voice = ttsSettings.voiceAr || defaultVoiceMap['ar'];
    } else {
      return res.status(400).json({
        success: false,
        message: `不支持的语言代码: ${lang}`
      });
    }
    
    // Edge TTS的rate参数是相对于默认语速的变化（-100%到+100%）
    // 用户设置的是绝对百分比（30%-200%，100%表示默认语速）
    // 需要转换：relativeRate = absoluteRate - 100
    // 例如：50% → -50%（比默认慢50%），100% → 0%（默认），150% → +50%（比默认快50%）
    // 注意：Edge TTS支持数字格式（-50）或字符串格式（"-50%"），我们使用数字格式更可靠
    const absoluteRate = parseInt(ttsSettings.rate) || 100;
    const relativeRate = absoluteRate - 100;
    // 限制范围在-100到+100之间（Edge TTS的有效范围）
    const clampedRate = Math.max(-100, Math.min(100, relativeRate));
    // 使用数字格式而不是字符串格式，更可靠
    const rateValue = clampedRate;
    
    // 使用Edge TTS生成音频
    const tts = new EdgeTTS();
    
    // 根据格式选择输出格式
    // Edge TTS支持MP3，但不直接支持AAC
    // 如果请求AAC，先使用MP3格式，然后可以转换（暂时先返回MP3）
    let outputFormat;
    let actualFormat = format; // 实际输出的格式
    if (format === 'mp3') {
      outputFormat = Constants.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;
    } else if (format === 'aac') {
      // Edge TTS不支持AAC，暂时使用MP3格式
      // 后续可以使用ffmpeg转换，现在先返回MP3
      outputFormat = Constants.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;
      actualFormat = 'mp3'; // 实际输出MP3格式
      logger.warn('AAC格式暂不支持，使用MP3格式替代');
    } else {
      outputFormat = Constants.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;
    }
    
    // 定义合成选项（使用数据库中的设置）
    const pitchString = `${parseInt(ttsSettings.pitch) >= 0 ? '+' : ''}${ttsSettings.pitch}Hz`;
    const volumeString = `${ttsSettings.volume}%`;
    
    const options = {
      pitch: pitchString,
      rate: rateValue,  // 使用数字格式，例如: -50 (表示-50%)
      volume: volumeString,
      outputFormat: outputFormat
    };
    
    // 生成文件名（包含TTS参数，确保不同设置生成不同文件）
    // 使用rateValue的字符串形式用于文件名哈希
    const rateStringForHash = `${rateValue >= 0 ? '+' : ''}${rateValue}%`;
    const filename = generateFileName(text, lang, actualFormat, rateStringForHash, pitchString, volumeString, voice);
    const ttsDir = getTTSDir();
    const filePath = path.join(ttsDir, filename);
    
    logger.info('TTS请求', {
      lang: lang,
      format: format,
      voice: voice,
      rate_absolute: ttsSettings.rate, // 用户设置的绝对百分比
      rate_relative: rateValue, // Edge TTS使用的相对变化（数字格式）
      rate_clamped: clampedRate !== relativeRate ? `已限制: ${relativeRate} → ${clampedRate}` : '未限制',
      pitch: pitchString,
      volume: volumeString,
      options: options, // 完整options对象，用于调试
      textLength: text.length,
      textPreview: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
      filename: filename
    });
    
    // 检查文件是否已存在（避免重复生成）
    if (fs.existsSync(filePath)) {
      const audioUrl = getFileUrl(filename, req);
      logger.info('TTS使用缓存文件', {
        lang: lang,
        format: format,
        actualFormat: actualFormat,
        rate: rateValue,
        filename: filename,
        audioUrl: audioUrl
      });
      return res.json({
        success: true,
        audioUrl: audioUrl
      });
    }
    
    // 合成语音（传递options对象，包含rate参数）
    logger.info('调用Edge TTS synthesize', {
      text: text.substring(0, 50) + (text.length > 50 ? '...' : ''),
      voice: voice,
      options: JSON.stringify(options)
    });
    
    await tts.synthesize(text, voice, options);
    
    // 获取音频信息
    const audioInfo = tts.getAudioInfo();
    // 使用toBuffer()方法获取音频Buffer
    const audioBuffer = tts.toBuffer();
    
    // 保存文件到磁盘
    fs.writeFileSync(filePath, audioBuffer);
    
    // 生成文件URL
    const audioUrl = getFileUrl(filename, req);
    
    logger.info('TTS成功', {
      lang: lang,
      format: format,
      textLength: text.length,
      audioSize: audioInfo.size,
      format: audioInfo.format,
      estimatedDuration: audioInfo.estimatedDuration,
      filename: filename,
      audioUrl: audioUrl
    });
    
    res.json({
      success: true,
      audioUrl: audioUrl
    });
  } catch (error) {
    logger.error('TTS失败', {
      error: error.message,
      stack: error.stack,
      lang: req.body.lang,
      textLength: req.body.text ? req.body.text.length : 0
    });
    
    // 处理不同类型的错误
    if (error.message && error.message.includes('timeout')) {
      return res.status(504).json({
        success: false,
        message: 'TTS服务超时，请稍后重试'
      });
    }
    
    if (error.message && error.message.includes('network')) {
      return res.status(503).json({
        success: false,
        message: 'TTS服务不可用，请稍后重试'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'TTS合成失败: ' + (error.message || '未知错误')
    });
  }
});

module.exports = router;
