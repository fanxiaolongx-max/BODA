// 管理员认证中间件
function requireAuth(req, res, next) {
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
function requireUserAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
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
  requireUserAuth
};

