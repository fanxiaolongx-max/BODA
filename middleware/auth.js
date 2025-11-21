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
async function requireUserAuth(req, res, next) {
  // 先检查并清理过期session
  await checkSessionExpiry(req);
  
  // 检查userId或userPhone（兼容两种登录方式）
  if (!req.session || (!req.session.userId && !req.session.userPhone)) {
    return res.status(401).json({ 
      success: false, 
      message: '请先输入手机号登录' 
    });
  }
  next();
}

module.exports = {
  requireAuth,
  requireRole,
  requireUserAuth,
  checkSessionExpiry
};

