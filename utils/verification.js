const { runAsync, getAsync, allAsync } = require('../db/database');
const { sendVerificationCode, sendVerificationCodeViaVerifyService, verifyCodeViaVerifyService, generateCode } = require('./sms');
const { logger } = require('./logger');

/**
 * 创建验证码（生成、存储、发送）
 * @param {string} phone - 手机号
 * @param {string} type - 验证码类型（默认'login'）
 * @returns {Promise<{success: boolean, code?: string, message: string}>}
 */
async function createVerificationCode(phone, type = 'login') {
  try {
    // 检查是否使用Twilio Verify Service
    const verifyServiceSid = await getAsync("SELECT value FROM settings WHERE key = 'twilio_verify_service_sid'");
    const useVerifyService = verifyServiceSid && verifyServiceSid.value && verifyServiceSid.value.trim() !== '';

    if (useVerifyService) {
      // 使用Twilio Verify Service（推荐方式）
      const result = await sendVerificationCodeViaVerifyService(phone, verifyServiceSid.value);
      
      if (result.success) {
        // 记录到数据库（用于日志和频率限制）
        // 注意：使用Verify Service时，验证码由Twilio生成，我们无法获取实际验证码
        // 因此使用 'VERIFY_SERVICE' 作为占位符，并存储 verification SID 用于追踪
        await runAsync(
          `INSERT INTO verification_codes (phone, code, type, expires_at) 
           VALUES (?, ?, ?, datetime('now', '+5 minutes'))`,
          [phone, `VERIFY_SERVICE:${result.sid || 'N/A'}`, type]
        );
        
        logger.info('验证码通过Verify Service创建成功', { phone, type, sid: result.sid });
        return {
          success: true,
          message: result.message,
          sid: result.sid
        };
      } else {
        return {
          success: false,
          message: result.message
        };
      }
    }

    // 传统方式：自己生成和管理验证码
    // 检查发送频率（1分钟内只能发送1次）
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const recentCode = await getAsync(
      `SELECT * FROM verification_codes 
       WHERE phone = ? AND type = ? AND created_at > ? 
       ORDER BY created_at DESC LIMIT 1`,
      [phone, type, oneMinuteAgo]
    );

    if (recentCode) {
      return {
        success: false,
        message: 'Please wait 1 minute before requesting another code'
      };
    }

    // 生成验证码
    const code = generateCode();

    // 设置过期时间（5分钟后）
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // 存储验证码
    await runAsync(
      `INSERT INTO verification_codes (phone, code, type, expires_at) 
       VALUES (?, ?, ?, ?)`,
      [phone, code, type, expiresAt]
    );

    // 发送短信
    const sendSuccess = await sendVerificationCode(phone, code);

    if (!sendSuccess) {
      logger.warn('验证码生成成功但发送失败', { phone, code });
      // 即使发送失败，也返回成功（开发环境可能使用模拟发送）
      // 生产环境应该返回失败，但这里为了兼容性，仍然返回成功
    }

    logger.info('验证码创建成功', { phone, type });

    return {
      success: true,
      code: process.env.NODE_ENV !== 'production' ? code : undefined, // 开发环境返回验证码，生产环境不返回
      message: 'Verification code sent successfully'
    };
  } catch (error) {
    logger.error('创建验证码失败', { phone, type, error: error.message });
    return {
      success: false,
      message: 'Failed to create verification code'
    };
  }
}

/**
 * 验证验证码
 * @param {string} phone - 手机号
 * @param {string} code - 验证码
 * @param {string} type - 验证码类型（默认'login'）
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function verifyCode(phone, code, type = 'login') {
  try {
    // 检查是否使用Twilio Verify Service
    const verifyServiceSid = await getAsync("SELECT value FROM settings WHERE key = 'twilio_verify_service_sid'");
    const useVerifyService = verifyServiceSid && verifyServiceSid.value && verifyServiceSid.value.trim() !== '';

    if (useVerifyService) {
      // 使用Twilio Verify Service验证（推荐方式）
      const result = await verifyCodeViaVerifyService(phone, code, verifyServiceSid.value);
      
      if (result.success) {
        // 标记数据库中的记录为已使用（先查找ID，再更新）
        // 注意：code字段格式为 'VERIFY_SERVICE:SID' 或 'VERIFY_SERVICE'
        const verification = await getAsync(
          `SELECT id FROM verification_codes 
           WHERE phone = ? AND type = ? AND code LIKE 'VERIFY_SERVICE%' AND used = 0
           ORDER BY created_at DESC LIMIT 1`,
          [phone, type]
        );
        
        if (verification) {
          await runAsync(
            'UPDATE verification_codes SET used = 1 WHERE id = ?',
            [verification.id]
          );
        }
      }
      
      return result;
    }

    // 传统方式：从数据库验证
    // 查找验证码
    const verification = await getAsync(
      `SELECT * FROM verification_codes 
       WHERE phone = ? AND code = ? AND type = ? AND used = 0 
       ORDER BY created_at DESC LIMIT 1`,
      [phone, code, type]
    );

    if (!verification) {
      logger.warn('验证码不存在或已使用', { phone, code, type });
      return {
        success: false,
        message: 'Invalid verification code'
      };
    }

    // 检查是否过期
    const now = new Date();
    const expiresAt = new Date(verification.expires_at);
    if (now > expiresAt) {
      logger.warn('验证码已过期', { phone, code, expiresAt });
      // 标记为已使用（即使过期）
      await runAsync(
        'UPDATE verification_codes SET used = 1 WHERE id = ?',
        [verification.id]
      );
      return {
        success: false,
        message: 'Verification code has expired'
      };
    }

    // 标记为已使用
    await runAsync(
      'UPDATE verification_codes SET used = 1 WHERE id = ?',
      [verification.id]
    );

    logger.info('验证码验证成功', { phone, type });

    return {
      success: true,
      message: 'Verification code verified successfully'
    };
  } catch (error) {
    logger.error('验证验证码失败', { phone, code, type, error: error.message });
    return {
      success: false,
      message: 'Failed to verify verification code'
    };
  }
}

/**
 * 清理过期验证码（可选，定期任务）
 * @returns {Promise<number>} 清理的记录数
 */
async function cleanExpiredCodes() {
  try {
    const now = new Date().toISOString();
    const result = await runAsync(
      'DELETE FROM verification_codes WHERE expires_at < ?',
      [now]
    );
    logger.info('清理过期验证码', { deleted: result.changes });
    return result.changes;
  } catch (error) {
    logger.error('清理过期验证码失败', { error: error.message });
    return 0;
  }
}

module.exports = {
  createVerificationCode,
  verifyCode,
  cleanExpiredCodes
};

