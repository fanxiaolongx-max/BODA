const twilio = require('twilio');
const { logger } = require('./logger');
const { getAsync } = require('../db/database');

let twilioClient = null;

/**
 * 初始化Twilio客户端
 * @returns {Object|null} Twilio客户端实例
 */
async function initTwilioClient() {
  if (twilioClient) {
    return twilioClient;
  }

  try {
    // 从数据库获取Twilio配置
    const accountSid = await getAsync("SELECT value FROM settings WHERE key = 'twilio_account_sid'");
    const authToken = await getAsync("SELECT value FROM settings WHERE key = 'twilio_auth_token'");

    if (!accountSid || !accountSid.value || !authToken || !authToken.value) {
      logger.warn('Twilio配置未设置，将使用模拟发送');
      return null;
    }

    // 也可以从环境变量读取（优先级更高）
    const envAccountSid = process.env.TWILIO_ACCOUNT_SID;
    const envAuthToken = process.env.TWILIO_AUTH_TOKEN;

    const finalAccountSid = envAccountSid || accountSid.value;
    const finalAuthToken = envAuthToken || authToken.value;

    twilioClient = twilio(finalAccountSid, finalAuthToken);
    return twilioClient;
  } catch (error) {
    logger.error('初始化Twilio客户端失败', { error: error.message });
    return null;
  }
}

/**
 * 格式化手机号为E.164格式
 * @param {string} phone - 原始手机号
 * @returns {string} E.164格式的手机号
 */
function formatPhoneNumber(phone) {
  // 移除所有空格和特殊字符，只保留数字和+
  let formatted = phone.replace(/[^\d+]/g, '');

  // 如果没有+号，根据长度和格式判断是否需要添加国家代码
  if (!formatted.startsWith('+')) {
    // 埃及手机号：11位，以0开头，去掉0后添加+20
    // 例如：01017739088 -> 1017739088 -> +201017739088
    if (formatted.length === 11 && formatted.startsWith('0')) {
      formatted = '+20' + formatted.substring(1); // 去掉开头的0，添加+20
    }
    // 如果长度是11位且以1开头，可能是中国手机号，添加+86
    else if (formatted.length === 11 && formatted.startsWith('1')) {
      formatted = '+86' + formatted;
    }
    // 如果长度是10位，可能是美国手机号，添加+1
    else if (formatted.length === 10 && !formatted.startsWith('0')) {
      formatted = '+1' + formatted;
    }
    // 如果长度是10位且以1开头，可能是埃及手机号（已去掉0），添加+20
    else if (formatted.length === 10 && formatted.startsWith('1')) {
      formatted = '+20' + formatted;
    }
    // 其他情况，假设用户已经输入了正确的格式
    else {
      formatted = '+' + formatted;
    }
  }

  return formatted;
}

/**
 * 生成6位数字验证码
 * @returns {string} 6位数字验证码
 */
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 使用Twilio Verify Service发送验证码（推荐方式）
 * @param {string} phone - 手机号
 * @param {string} serviceSid - Verify Service SID
 * @returns {Promise<{success: boolean, sid?: string, message: string}>}
 */
async function sendVerificationCodeViaVerifyService(phone, serviceSid) {
  try {
    const client = await initTwilioClient();
    const formattedPhone = formatPhoneNumber(phone);

    if (!client) {
      logger.warn('Twilio client not initialized, using mock mode');
      // 开发环境或未配置时，模拟发送
      if (process.env.NODE_ENV !== 'production') {
        logger.info('模拟发送验证码（Verify Service）', { phone: formattedPhone });
        return {
          success: true,
          sid: 'mock_' + Date.now(),
          message: 'Verification code sent successfully (mock)'
        };
      }
      return {
        success: false,
        message: 'Twilio client not initialized. Please configure Twilio Account SID and Auth Token.'
      };
    }

    if (!serviceSid || serviceSid.trim() === '') {
      return {
        success: false,
        message: 'Twilio Verify Service SID is not configured'
      };
    }

    // 使用Verify Service发送验证码
    const verification = await client.verify.v2
      .services(serviceSid)
      .verifications
      .create({
        to: formattedPhone,
        channel: 'sms'
      });

    logger.info('验证码通过Verify Service发送成功', {
      phone: formattedPhone,
      verificationSid: verification.sid,
      status: verification.status
    });

    return {
      success: true,
      sid: verification.sid,
      message: 'Verification code sent successfully'
    };
  } catch (error) {
    logger.error('通过Verify Service发送验证码失败', {
      phone,
      serviceSid,
      error: error.message,
      code: error.code,
      status: error.status
    });
    
    // 提供更详细的错误信息
    let errorMessage = 'Failed to send verification code';
    if (error.code === 20404) {
      errorMessage = 'Verify Service SID not found. Please check your Twilio Verify Service SID.';
    } else if (error.code === 21211) {
      errorMessage = 'Invalid phone number format. Please use E.164 format (e.g., +201234567890).';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return {
      success: false,
      message: errorMessage
    };
  }
}

/**
 * 发送验证码短信（传统方式，使用Messages API）
 * @param {string} phone - 手机号
 * @param {string} code - 验证码
 * @returns {Promise<boolean>} 是否发送成功
 */
async function sendVerificationCode(phone, code) {
  try {
    const client = await initTwilioClient();
    const formattedPhone = formatPhoneNumber(phone);

    // 检查是否启用短信服务
    const smsEnabled = await getAsync("SELECT value FROM settings WHERE key = 'sms_enabled'");
    const isEnabled = smsEnabled && smsEnabled.value === 'true';

    // 开发环境或未启用时，使用模拟发送
    if (process.env.NODE_ENV !== 'production' || !isEnabled || !client) {
      logger.info('模拟发送验证码短信', {
        phone: formattedPhone,
        code,
        reason: !isEnabled ? '短信服务未启用' : !client ? 'Twilio未配置' : '开发环境'
      });
      return true; // 模拟发送总是成功
    }

    // 获取Twilio发送号码
    const twilioPhone = await getAsync("SELECT value FROM settings WHERE key = 'twilio_phone_number'");
    const fromNumber = process.env.TWILIO_PHONE_NUMBER || (twilioPhone && twilioPhone.value);

    if (!fromNumber) {
      logger.error('Twilio发送号码未配置');
      return false;
    }

    // 发送短信
    const message = await client.messages.create({
      body: `Your verification code is: ${code}. Valid for 5 minutes.`,
      from: fromNumber,
      to: formattedPhone
    });

    logger.info('验证码短信发送成功', {
      phone: formattedPhone,
      messageSid: message.sid
    });

    return true;
  } catch (error) {
    logger.error('发送验证码短信失败', {
      phone,
      error: error.message,
      code: error.code
    });
    return false;
  }
}

/**
 * 使用Twilio Verify Service验证验证码
 * @param {string} phone - 手机号
 * @param {string} code - 验证码
 * @param {string} serviceSid - Verify Service SID
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function verifyCodeViaVerifyService(phone, code, serviceSid) {
  try {
    const client = await initTwilioClient();
    const formattedPhone = formatPhoneNumber(phone);

    if (!client) {
      return {
        success: false,
        message: 'Twilio client not initialized'
      };
    }

    // 使用Verify Service验证验证码
    // 必须通过 services(serviceSid).verificationChecks 来调用
    const verificationCheck = await client.verify.v2
      .services(serviceSid)
      .verificationChecks
      .create({
        to: formattedPhone,
        code: code
      });

    if (verificationCheck.status === 'approved') {
      logger.info('验证码通过Verify Service验证成功', {
        phone: formattedPhone,
        verificationSid: verificationCheck.sid
      });
      return {
        success: true,
        message: 'Verification code verified successfully'
      };
    } else {
      logger.warn('验证码验证失败', {
        phone: formattedPhone,
        status: verificationCheck.status
      });
      return {
        success: false,
        message: 'Invalid verification code'
      };
    }
  } catch (error) {
    logger.error('通过Verify Service验证验证码失败', {
      phone,
      error: error.message,
      code: error.code
    });
    return {
      success: false,
      message: error.message || 'Failed to verify verification code'
    };
  }
}

module.exports = {
  sendVerificationCode,
  sendVerificationCodeViaVerifyService,
  verifyCodeViaVerifyService,
  generateCode,
  formatPhoneNumber,
  initTwilioClient
};

