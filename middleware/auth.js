// 检查并清理过期的session数据
async function checkSessionExpiry(req) {
  if (!req.session) return;
  
  const now = Date.now();
  const { getAdminSessionTimeoutMs, getUserSessionTimeoutMs } = require('../utils/session-config');
  
  // 获取动态过期时间（优先使用session中存储的，否则使用默认值）
  const adminTimeoutMs = req.session._adminTimeoutMs || (await getAdminSessionTimeoutMs());
  const userTimeoutMs = req.session._userTimeoutMs || (await getUserSessionTimeoutMs());
  
  // 检查管理员session是否过期
  if (req.session.adminId) {
    const adminLoginTime = req.session._adminLoginTime || req.session._loginTime;
    if (adminLoginTime) {
      const adminExpires = adminLoginTime + adminTimeoutMs;
      if (now > adminExpires) {
        // 管理员session已过期，清除管理员相关数据
        delete req.session.adminId;
        delete req.session.adminUsername;
        delete req.session.adminRole;
        delete req.session.adminName;
        delete req.session._adminLoginTime;
        delete req.session._adminTimeoutMs;
      }
    }
  }
  
  // 检查用户session是否过期
  if (req.session.userId) {
    const userLoginTime = req.session._userLoginTime || req.session._loginTime;
    if (userLoginTime) {
      const userExpires = userLoginTime + userTimeoutMs;
      if (now > userExpires) {
        // 用户session已过期，清除用户相关数据
        delete req.session.userId;
        delete req.session.userPhone;
        delete req.session.userName;
        delete req.session._userLoginTime;
        delete req.session._userTimeoutMs;
      }
    }
  }
  
  // 如果两者都过期，清除旧的_loginTime（兼容旧session）
  if (!req.session.adminId && !req.session.userId && req.session._loginTime) {
    delete req.session._loginTime;
  }
}

// 管理员认证中间件
async function requireAuth(req, res, next) {
  // 先检查并清理过期session
  await checkSessionExpiry(req);
  
  if (!req.session || !req.session.adminId) {
    return res.status(401).json({ 
      success: false, 
      message: '请先登录' 
    });
  }
  next();
}

// 检查管理员角色
function requireRole(roles = []) {
  return (req, res, next) => {
    if (!req.session || !req.session.adminRole) {
      return res.status(401).json({ 
        success: false, 
        message: '请先登录' 
      });
    }

    if (roles.length > 0 && !roles.includes(req.session.adminRole)) {
      return res.status(403).json({ 
        success: false, 
        message: '权限不足' 
      });
    }

    next();
  };
}

// 检查用户登录（手机号）
// 支持两种认证方式：
// 1. Session认证（浏览器）- 优先使用
// 2. Token认证（小程序）- 备用方案
async function requireUserAuth(req, res, next) {
  // 先检查并清理过期session
  await checkSessionExpiry(req);
  
  // 优先检查Session认证（浏览器）
  if (req.session && (req.session.userId || req.session.userPhone)) {
    return next();
  }
  
  // 没有Session，尝试Token认证（小程序）
  const token = req.headers['x-user-token'] || 
                req.headers['X-User-Token'] || 
                req.headers['authorization']?.replace(/^Bearer\s+/i, '') ||
                req.query.token;
  
  if (token) {
    try {
      // verifyUserToken 是 routes/auth.js 中的内部函数，需要通过其他方式访问
      // 使用 auth.js 中已有的逻辑来验证Token
      const { getAsync } = require('../db/database');
      const { logger } = require('../utils/logger');
      
      const trimmedToken = token.trim();
      const tokenRecord = await getAsync(
        `SELECT ut.user_id, ut.expires_at, u.id, u.phone, u.name 
         FROM user_tokens ut 
         JOIN users u ON ut.user_id = u.id 
         WHERE ut.token = ? 
         AND (ut.expires_at > datetime('now', 'localtime') OR ut.expires_at >= '9999-12-31')`,
        [trimmedToken]
      );
      
      if (tokenRecord) {
        const tokenUser = {
          id: tokenRecord.user_id,
          phone: tokenRecord.phone,
          name: tokenRecord.name
        };
        // Token验证成功，设置session信息（用于后续处理）
        if (!req.session) {
          req.session = {};
        }
        req.session.userId = tokenUser.id;
        req.session.userPhone = tokenUser.phone;
        if (tokenUser.name) {
          req.session.userName = tokenUser.name;
        }
        
        logger.debug('requireUserAuth: Token认证成功', { 
          userId: tokenUser.id, 
          userPhone: tokenUser.phone,
          path: req.path 
        });
        
        return next();
      }
    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.debug('requireUserAuth: Token认证失败', { 
        error: error.message,
        path: req.path 
      });
    }
  }
  
  // 两种认证方式都失败
  return res.status(401).json({ 
    success: false, 
    message: '请先输入手机号登录' 
  });
}

module.exports = {
  requireAuth,
  requireRole,
  requireUserAuth,
  checkSessionExpiry
};

