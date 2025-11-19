const express = require('express');
const bcrypt = require('bcryptjs');
const { getAsync, runAsync } = require('../db/database');
const { loginValidation, phoneValidation, codeValidation, validate } = require('../middleware/validation');
const { logAction, logger } = require('../utils/logger');
const { body } = require('express-validator');
const { createVerificationCode, verifyCode } = require('../utils/verification');

const router = express.Router();

/**
 * POST /api/auth/admin/login
 * Admin login
 * @body {string} username - Admin username
 * @body {string} password - Admin password
 * @returns {Object} Admin object with id, username, name, and role
 */
router.post('/admin/login', loginValidation, async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await getAsync(
      'SELECT * FROM admins WHERE username = ? AND status = ?',
      [username, 'active']
    );

    if (!admin) {
      logger.warn('管理员登录失败：用户不存在', { username, ip: req.ip });
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      logger.warn('管理员登录失败：密码错误', { username, ip: req.ip });
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }

    // 设置session
    req.session.adminId = admin.id;
    req.session.adminUsername = admin.username;
    req.session.adminRole = admin.role;
    req.session.adminName = admin.name;
    // 记录登录时间（用于计算固定过期时间）
    req.session._loginTime = Date.now();

    // 记录登录日志（详细）
    await logAction(admin.id, 'LOGIN', 'admin', admin.id, JSON.stringify({
      action: '管理员登录',
      username: admin.username,
      name: admin.name,
      role: admin.role
    }), req);

    logger.info('管理员登录成功', { username, ip: req.ip });

    res.json({
      success: true,
      message: '登录成功',
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        role: admin.role
      }
    });
  } catch (error) {
    logger.error('管理员登录错误', { 
      error: error.message, 
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    res.status(500).json({ 
      success: false, 
      message: '登录失败', 
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
      code: process.env.NODE_ENV !== 'production' ? error.code : undefined
    });
  }
});

/**
 * POST /api/auth/admin/logout
 * Admin logout
 * @returns {Object} Success message
 */
router.post('/admin/logout', (req, res) => {
  const adminId = req.session.adminId;
  const userId = req.session.userId; // 保存用户信息
  const userPhone = req.session.userPhone;
  const userName = req.session.userName;
  
  // 只清除管理员相关的 session 字段，保留用户 session（如果存在）
  delete req.session.adminId;
  delete req.session.adminUsername;
  delete req.session.adminRole;
  delete req.session.adminName;
  
  // 确保用户信息被保留
  if (userId) {
    req.session.userId = userId;
  }
  if (userPhone) {
    req.session.userPhone = userPhone;
  }
  if (userName) {
    req.session.userName = userName;
  }
  
  req.session.save((err) => {
    if (err) {
      logger.error('管理员登出失败', { error: err.message, adminId });
      return res.status(500).json({ success: false, message: '登出失败' });
    }
    logger.info('管理员登出成功', { adminId, userIdPreserved: !!req.session.userId });
    res.json({ success: true, message: '登出成功' });
  });
});

/**
 * GET /api/auth/admin/me
 * Get current admin information
 * @returns {Object} Admin object with id, username, name, email, role, and created_at
 */
router.get('/admin/me', async (req, res) => {
  if (!req.session.adminId) {
    return res.status(401).json({ success: false, message: '未登录' });
  }

  try {
    const admin = await getAsync(
      'SELECT id, username, name, email, role, created_at FROM admins WHERE id = ?',
      [req.session.adminId]
    );

    if (!admin) {
      // 只清除管理员相关的 session 字段，保留用户 session（如果存在）
      delete req.session.adminId;
      delete req.session.adminUsername;
      delete req.session.adminRole;
      delete req.session.adminName;
      return res.status(401).json({ success: false, message: '用户不存在' });
    }

    res.json({ success: true, admin });
  } catch (error) {
    logger.error('获取管理员信息失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取信息失败' });
  }
});

/**
 * POST /api/auth/user/login
 * User login with phone number
 * @body {string} phone - User phone number (8-15 digits, international format supported)
 * @body {string} [name] - User name (optional)
 * @returns {Object} User object with id, phone, and name
 */
router.post('/user/login', [
  phoneValidation,
  body('name').optional({ checkFalsy: true }).trim().isLength({ max: 50 }).withMessage('姓名长度不能超过50个字符'),
  validate
], async (req, res) => {
  try {
    const { phone, name } = req.body;

    // 检查短信验证码是否启用
    const smsEnabled = await getAsync("SELECT value FROM settings WHERE key = 'sms_enabled'");
    if (smsEnabled && smsEnabled.value === 'true') {
      // 如果启用了短信验证码，要求使用验证码登录
      return res.status(400).json({
        success: false,
        message: 'SMS verification is required. Please use login-with-code endpoint.',
        requiresCode: true
      });
    }

    // 查找或创建用户
    let user = await getAsync('SELECT * FROM users WHERE phone = ?', [phone]);

    if (!user) {
      const result = await runAsync(
        "INSERT INTO users (phone, name, last_login) VALUES (?, ?, datetime('now', 'localtime'))",
        [phone, name || '']
      );
      user = await getAsync('SELECT * FROM users WHERE id = ?', [result.id]);
      logger.info('新用户注册', { phone, userId: user.id });
    } else {
      // 更新最后登录时间和姓名
      await runAsync(
        "UPDATE users SET last_login = datetime('now', 'localtime'), name = ? WHERE id = ?",
        [name || user.name, user.id]
      );
      user.name = name || user.name;
    }

    // 设置session
    req.session.userId = user.id;
    req.session.userPhone = user.phone;
    req.session.userName = user.name;
    // 记录登录时间（用于计算固定过期时间）
    // 每次登录都刷新登录时间，确保重新登录后过期时间重置
    req.session._loginTime = Date.now();

    // 记录用户登录日志（使用系统管理员ID 0 表示系统自动记录）
    const { logAction: logUserAction } = require('../utils/logger');
    await logUserAction(0, 'USER_LOGIN', 'user', user.id, JSON.stringify({
      action: '用户登录',
      phone: user.phone,
      name: user.name || '未设置',
      isNewUser: !user.last_login
    }), req);

    logger.info('用户登录成功', { phone, userId: user.id });

    res.json({
      success: true,
      message: '登录成功',
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name
      }
    });
  } catch (error) {
    logger.error('用户登录错误', { 
      error: error.message, 
      stack: error.stack,
      name: error.name,
      code: error.code,
      phone: req.body?.phone
    });
    res.status(500).json({ 
      success: false, 
      message: '登录失败', 
      error: process.env.NODE_ENV !== 'production' ? error.message : undefined,
      code: process.env.NODE_ENV !== 'production' ? error.code : undefined
    });
  }
});

/**
 * POST /api/auth/user/logout
 * User logout
 * @returns {Object} Success message
 */
router.post('/user/logout', (req, res) => {
  const userId = req.session.userId;
  const adminId = req.session.adminId; // 保存管理员信息
  const adminUsername = req.session.adminUsername;
  const adminRole = req.session.adminRole;
  const adminName = req.session.adminName;
  
  // 只清除用户相关的 session 字段，保留管理员 session（如果存在）
  delete req.session.userId;
  delete req.session.userPhone;
  delete req.session.userName;
  
  // 确保管理员信息被保留
  if (adminId) {
    req.session.adminId = adminId;
  }
  if (adminUsername) {
    req.session.adminUsername = adminUsername;
  }
  if (adminRole) {
    req.session.adminRole = adminRole;
  }
  if (adminName) {
    req.session.adminName = adminName;
  }
  
  req.session.save((err) => {
    if (err) {
      logger.error('用户登出失败', { error: err.message, userId });
      return res.status(500).json({ success: false, message: '登出失败' });
    }
    logger.info('用户登出成功', { userId, adminIdPreserved: !!req.session.adminId });
    res.json({ success: true, message: '登出成功' });
  });
});

/**
 * POST /api/auth/sms/send
 * Send verification code via SMS
 * @body {string} phone - User phone number
 * @body {string} [type] - Verification code type (default: 'login')
 * @returns {Object} Success message
 */
router.post('/sms/send', [
  phoneValidation,
  body('type').optional().trim().isIn(['login', 'register', 'reset']).withMessage('Invalid verification code type'),
  validate
], async (req, res) => {
  try {
    const { phone, type = 'login' } = req.body;

    // 检查短信服务是否启用（允许管理员测试，即使未启用）
    const smsEnabled = await getAsync("SELECT value FROM settings WHERE key = 'sms_enabled'");
    const isAdmin = req.session && req.session.adminId;
    
    if (!smsEnabled || smsEnabled.value !== 'true') {
      // 如果不是管理员，返回错误
      if (!isAdmin) {
        return res.status(400).json({
          success: false,
          message: 'SMS verification is not enabled'
        });
      }
      // 管理员可以测试，即使未启用
    }

    const result = await createVerificationCode(phone, type);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        // 开发环境返回验证码（仅用于测试）
        code: result.code
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message
      });
    }
  } catch (error) {
    logger.error('发送验证码失败', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to send verification code' });
  }
});

/**
 * POST /api/auth/user/login-with-code
 * User login with verification code
 * @body {string} phone - User phone number
 * @body {string} code - Verification code
 * @body {string} [name] - User name (optional)
 * @returns {Object} User object with id, phone, and name
 */
router.post('/user/login-with-code', [
  phoneValidation,
  codeValidation,
  body('name').optional({ checkFalsy: true }).trim().isLength({ max: 50 }).withMessage('姓名长度不能超过50个字符'),
  validate
], async (req, res) => {
  try {
    const { phone, code, name } = req.body;

    // 验证验证码
    const verifyResult = await verifyCode(phone, code, 'login');
    if (!verifyResult.success) {
      return res.status(400).json({
        success: false,
        message: verifyResult.message
      });
    }

    // 查找或创建用户
    let user = await getAsync('SELECT * FROM users WHERE phone = ?', [phone]);

    if (!user) {
      const result = await runAsync(
        "INSERT INTO users (phone, name, last_login) VALUES (?, ?, datetime('now', 'localtime'))",
        [phone, name || '']
      );
      user = await getAsync('SELECT * FROM users WHERE id = ?', [result.id]);
      logger.info('新用户注册（验证码登录）', { phone, userId: user.id });
    } else {
      // 更新最后登录时间和姓名
      await runAsync(
        "UPDATE users SET last_login = datetime('now', 'localtime'), name = ? WHERE id = ?",
        [name || user.name, user.id]
      );
      user.name = name || user.name;
    }

    // 设置session
    req.session.userId = user.id;
    req.session.userPhone = user.phone;
    req.session.userName = user.name;
    // 记录登录时间（用于计算固定过期时间）
    // 每次登录都刷新登录时间，确保重新登录后过期时间重置
    req.session._loginTime = Date.now();

    // 记录用户登录日志
    const { logAction: logUserAction } = require('../utils/logger');
    await logUserAction(0, 'USER_LOGIN', 'user', user.id, JSON.stringify({
      action: '用户登录（验证码）',
      phone: user.phone,
      name: user.name || '未设置',
      isNewUser: !user.last_login,
      loginMethod: 'sms_code'
    }), req);

    logger.info('用户登录成功（验证码）', { phone, userId: user.id });

    res.json({
      success: true,
      message: '登录成功',
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name
      }
    });
  } catch (error) {
    logger.error('验证码登录错误', { error: error.message, stack: error.stack });
    res.status(500).json({ success: false, message: '登录失败', error: process.env.NODE_ENV !== 'production' ? error.message : undefined });
  }
});

/**
 * GET /api/auth/user/me
 * Get current user information
 * @returns {Object} User object with id, phone, and name
 */
router.get('/user/me', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: '未登录' });
  }

  try {
    const user = await getAsync(
      'SELECT id, phone, name, created_at FROM users WHERE id = ?',
      [req.session.userId]
    );

    if (!user) {
      // 只清除用户相关的 session 字段，保留管理员 session（如果存在）
      delete req.session.userId;
      delete req.session.userPhone;
      delete req.session.userName;
      return res.status(401).json({ success: false, message: '用户不存在' });
    }

    res.json({ success: true, user });
  } catch (error) {
    logger.error('获取用户信息失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取信息失败' });
  }
});

/**
 * GET /api/auth/session/info
 * Get current session information including expiration time
 * @returns {Object} Session info with remaining time
 */
router.get('/session/info', (req, res) => {
  if (!req.session) {
    return res.status(401).json({ 
      success: false, 
      message: 'No session found' 
    });
  }

  // 获取 session cookie 的过期时间
  const cookie = req.session.cookie;
  const now = Date.now();
  
  // 计算过期时间：使用登录时间 + maxAge（固定过期，不受请求影响）
  // 即使 rolling: false，访问 req.session 也可能导致 cookie.expires 被重新计算
  // 所以使用登录时间来计算，确保固定过期时间
  let expires;
  if (req.session._loginTime) {
    // 如果有登录时间，使用登录时间 + maxAge（固定过期）
    expires = new Date(req.session._loginTime + cookie.maxAge);
  } else if (cookie.expires) {
    // 如果没有登录时间但有 cookie.expires，使用它（兼容旧 session）
    expires = new Date(cookie.expires);
  } else {
    // 如果都没有，说明是新 session，使用当前时间 + maxAge
    // 但这种情况不应该发生，因为登录时会设置 _loginTime
    expires = new Date(now + cookie.maxAge);
  }
  const remainingMs = expires.getTime() - now;
  const remainingMinutes = Math.floor(remainingMs / 60000);
  const remainingSeconds = Math.floor((remainingMs % 60000) / 1000);

  // 判断用户类型（更精确的逻辑）
  let userType = 'guest';
  if (req.session.adminId && req.session.userId) {
    userType = 'both'; // 同时登录管理员和普通用户
  } else if (req.session.adminId) {
    userType = 'admin'; // 仅管理员
  } else if (req.session.userId) {
    userType = 'user'; // 仅普通用户
  }

  res.json({
    success: true,
    session: {
      isLoggedIn: !!(req.session.userId || req.session.adminId),
      userType: userType,
      userId: req.session.userId || null,
      adminId: req.session.adminId || null,
      expiresAt: expires.toISOString(),
      expiresAtLocal: expires.toLocaleString(),
      remainingMs: remainingMs,
      remainingTime: {
        hours: Math.floor(remainingMinutes / 60),
        minutes: remainingMinutes % 60,
        seconds: remainingSeconds
      },
      remainingFormatted: `${Math.floor(remainingMinutes / 60)}小时${remainingMinutes % 60}分钟${remainingSeconds}秒`
    }
  });
});

module.exports = router;

