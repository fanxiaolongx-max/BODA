const express = require('express');
const bcrypt = require('bcryptjs');
const { getAsync, runAsync } = require('../db/database');
const { loginValidation, phoneValidation, validate } = require('../middleware/validation');
const { logAction, logger } = require('../utils/logger');
const { body } = require('express-validator');

const router = express.Router();

// 管理员登录
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
    logger.error('管理员登录错误', { error: error.message });
    res.status(500).json({ success: false, message: '登录失败' });
  }
});

// 管理员登出
router.post('/admin/logout', (req, res) => {
  const adminId = req.session.adminId;
  req.session.destroy((err) => {
    if (err) {
      logger.error('管理员登出失败', { error: err.message, adminId });
      return res.status(500).json({ success: false, message: '登出失败' });
    }
    res.json({ success: true, message: '登出成功' });
  });
});

// 获取当前管理员信息
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
      req.session.destroy();
      return res.status(401).json({ success: false, message: '用户不存在' });
    }

    res.json({ success: true, admin });
  } catch (error) {
    logger.error('获取管理员信息失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取信息失败' });
  }
});

// 用户登录（手机号）
router.post('/user/login', [
  phoneValidation,
  body('name').optional({ checkFalsy: true }).trim().isLength({ max: 50 }).withMessage('姓名长度不能超过50个字符'),
  validate
], async (req, res) => {
  try {
    const { phone, name } = req.body;

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
    logger.error('用户登录错误', { error: error.message });
    res.status(500).json({ success: false, message: '登录失败' });
  }
});

// 用户登出
router.post('/user/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      logger.error('用户登出失败', { error: err.message });
      return res.status(500).json({ success: false, message: '登出失败' });
    }
    res.json({ success: true, message: '登出成功' });
  });
});

// 获取当前用户信息
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
      req.session.destroy();
      return res.status(401).json({ success: false, message: '用户不存在' });
    }

    res.json({ success: true, user });
  } catch (error) {
    logger.error('获取用户信息失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取信息失败' });
  }
});

module.exports = router;

