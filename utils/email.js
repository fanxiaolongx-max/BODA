const nodemailer = require('nodemailer');
const { getAsync } = require('../db/database');
const { logger } = require('./logger');
const path = require('path');
const fs = require('fs');

// 支持 fly.io 持久化卷
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');

/**
 * 获取邮件配置
 */
async function getEmailConfig() {
  try {
    const smtpHost = await getAsync("SELECT value FROM settings WHERE key = 'email_smtp_host'");
    const smtpPort = await getAsync("SELECT value FROM settings WHERE key = 'email_smtp_port'");
    const smtpSecure = await getAsync("SELECT value FROM settings WHERE key = 'email_smtp_secure'");
    const smtpUser = await getAsync("SELECT value FROM settings WHERE key = 'email_smtp_user'");
    const smtpPassword = await getAsync("SELECT value FROM settings WHERE key = 'email_smtp_password'");
    const emailFrom = await getAsync("SELECT value FROM settings WHERE key = 'email_from'");
    const emailTo = await getAsync("SELECT value FROM settings WHERE key = 'email_to'");
    const emailEnabled = await getAsync("SELECT value FROM settings WHERE key = 'email_enabled'");

    return {
      enabled: emailEnabled?.value === 'true',
      host: smtpHost?.value || '',
      port: parseInt(smtpPort?.value || '587', 10),
      secure: smtpSecure?.value === 'true',
      user: smtpUser?.value || '',
      password: smtpPassword?.value || '',
      from: emailFrom?.value || '',
      to: emailTo?.value || ''
    };
  } catch (error) {
    logger.error('获取邮件配置失败', { error: error.message });
    return {
      enabled: false,
      host: '',
      port: 587,
      secure: false,
      user: '',
      password: '',
      from: '',
      to: ''
    };
  }
}

/**
 * 创建邮件传输器
 */
async function createTransporter() {
  const config = await getEmailConfig();
  
  if (!config.enabled || !config.host || !config.user || !config.password) {
    return null;
  }

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure, // true for 465, false for other ports
    auth: {
      user: config.user,
      pass: config.password
    }
  });
}

/**
 * 发送邮件
 * @param {Object} options - 邮件选项
 * @param {string} options.to - 收件人（可选，默认使用配置中的收件人）
 * @param {string} options.subject - 邮件主题
 * @param {string} options.text - 纯文本内容
 * @param {string} options.html - HTML内容（可选）
 * @param {Array} options.attachments - 附件数组（可选）
 */
async function sendEmail(options) {
  try {
    const config = await getEmailConfig();
    
    if (!config.enabled) {
      logger.info('邮件功能未启用');
      return { success: false, message: '邮件功能未启用' };
    }

    if (!config.from || !config.to) {
      logger.warn('邮件配置不完整：缺少发件人或收件人');
      return { success: false, message: '邮件配置不完整' };
    }

    const transporter = await createTransporter();
    if (!transporter) {
      logger.warn('无法创建邮件传输器：配置不完整');
      return { success: false, message: '邮件配置不完整' };
    }

    // 解析收件人地址（支持分号或逗号分隔的多个地址）
    const parseRecipients = (recipients) => {
      if (!recipients) return [];
      // 支持分号和逗号分隔，也支持空格分隔
      return recipients.split(/[;,]/)
        .map(addr => addr.trim())
        .filter(addr => addr.length > 0);
    };

    const recipients = options.to || config.to;
    const recipientList = parseRecipients(recipients);

    if (recipientList.length === 0) {
      logger.warn('没有有效的收件人地址');
      return { success: false, message: '没有有效的收件人地址' };
    }

    // 分别发送给每个收件人，避免部分失败导致全部失败
    const results = {
      success: true,
      total: recipientList.length,
      succeeded: [],
      failed: []
    };

    for (const recipient of recipientList) {
      try {
        const mailOptions = {
          from: config.from,
          to: recipient,
          subject: options.subject,
          text: options.text,
          html: options.html || options.text,
          attachments: options.attachments || []
        };

        const info = await transporter.sendMail(mailOptions);
        results.succeeded.push({ email: recipient, messageId: info.messageId });
        logger.info('邮件发送成功', { messageId: info.messageId, to: recipient });
      } catch (error) {
        results.success = false; // 至少有一个失败
        results.failed.push({ email: recipient, error: error.message });
        logger.error('邮件发送失败', { to: recipient, error: error.message });
      }
    }

    // 如果至少有一个成功，返回部分成功
    if (results.succeeded.length > 0) {
      logger.info('邮件发送完成', { 
        total: results.total, 
        succeeded: results.succeeded.length, 
        failed: results.failed.length,
        failedRecipients: results.failed.map(f => f.email)
      });
      
      return {
        success: results.failed.length === 0, // 全部成功才返回true
        partialSuccess: results.succeeded.length > 0,
        total: results.total,
        succeeded: results.succeeded.length,
        failed: results.failed.length,
        failedRecipients: results.failed.map(f => f.email),
        messageId: results.succeeded[0]?.messageId
      };
    } else {
      // 全部失败
      logger.error('所有收件人发送失败', { 
        total: results.total,
        failedRecipients: results.failed.map(f => f.email)
      });
      return { 
        success: false, 
        message: '所有收件人发送失败',
        failedRecipients: results.failed.map(f => f.email)
      };
    }
  } catch (error) {
    logger.error('发送邮件失败', { error: error.message });
    return { success: false, message: error.message };
  }
}

/**
 * 发送周期订单导出邮件
 * @param {number} cycleId - 周期ID
 * @param {string} excelFilePath - Excel文件路径
 */
async function sendCycleExportEmail(cycleId, excelFilePath) {
  try {
    const config = await getEmailConfig();
    
    if (!config.enabled) {
      logger.info('邮件功能未启用，跳过邮件发送');
      return { success: false, message: '邮件功能未启用' };
    }

    // 获取商店名称
    const storeNameSetting = await getAsync("SELECT value FROM settings WHERE key = 'store_name'");
    const storeName = storeNameSetting?.value || '订单系统';

    // 读取Excel文件
    let attachment = null;
    if (fs.existsSync(excelFilePath)) {
      attachment = {
        filename: path.basename(excelFilePath),
        path: excelFilePath
      };
    }

    const subject = `订单导出 - ${storeName} - 周期 #${cycleId}`;
    const text = `${storeName} - 周期 #${cycleId} 的订单已导出，请查看附件。`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #333;">订单导出通知</h2>
        <p><strong>${storeName}</strong> - 周期 #${cycleId} 的订单已成功导出。</p>
        <p>请查看附件中的Excel文件。</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">此邮件由${storeName}自动发送。</p>
      </div>
    `;

    return await sendEmail({
      subject,
      text,
      html,
      attachments: attachment ? [attachment] : []
    });
  } catch (error) {
    logger.error('发送周期导出邮件失败', { error: error.message, cycleId });
    return { success: false, message: error.message };
  }
}

/**
 * 测试邮件配置
 */
async function testEmailConfig() {
  try {
    const config = await getEmailConfig();
    
    if (!config.enabled) {
      return { success: false, message: '邮件功能未启用' };
    }

    if (!config.host || !config.user || !config.password || !config.from || !config.to) {
      return { success: false, message: '邮件配置不完整' };
    }

    const transporter = await createTransporter();
    if (!transporter) {
      return { success: false, message: '无法创建邮件传输器' };
    }

    // 获取商店名称
    const storeNameSetting = await getAsync("SELECT value FROM settings WHERE key = 'store_name'");
    const storeName = storeNameSetting?.value || '订单系统';

    // 发送测试邮件
    const testSubject = `测试邮件 - ${storeName}`;
    const testText = `这是一封测试邮件。如果您收到此邮件，说明${storeName}的邮件配置正确。`;
    const testHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <h2 style="color: #333;">测试邮件</h2>
        <p>这是一封测试邮件。如果您收到此邮件，说明<strong>${storeName}</strong>的邮件配置正确。</p>
        <p style="color: #666; font-size: 12px;">发送时间：${new Date().toLocaleString('zh-CN')}</p>
      </div>
    `;

    return await sendEmail({
      subject: testSubject,
      text: testText,
      html: testHtml
    });
  } catch (error) {
    logger.error('测试邮件配置失败', { error: error.message });
    return { success: false, message: error.message };
  }
}

module.exports = {
  sendEmail,
  sendCycleExportEmail,
  testEmailConfig,
  getEmailConfig
};

