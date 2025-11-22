/**
 * 测试用例中文描述映射
 * 用于在测试报告中显示每个测试的中文解释
 */
module.exports = {
  // Admin Routes 测试描述
  'Admin Routes': {
    'Category Management': {
      'should get all categories': '获取所有分类 - 验证管理员可以查看系统中的所有产品分类',
      'should create category': '创建分类 - 验证管理员可以创建新的产品分类',
      'should handle error when creating category fails': '处理创建分类错误 - 验证系统能正确处理分类创建失败的情况',
      'should update category': '更新分类 - 验证管理员可以修改现有分类的信息',
      'should delete category': '删除分类 - 验证管理员可以删除没有关联产品的分类',
      'should return 404 when deleting non-existent category': '删除不存在的分类 - 验证删除不存在的分类时返回404错误',
      'should return 400 when deleting category with products': '删除有关联产品的分类 - 验证系统阻止删除包含产品的分类'
    },
    'Product Management': {
      'should require authentication': '需要认证 - 验证产品管理接口需要管理员登录',
      'should get all products when authenticated': '获取所有产品 - 验证管理员登录后可以查看所有产品',
      'should filter products by category_id': '按分类筛选产品 - 验证可以根据分类ID筛选产品',
      'should filter products by status': '按状态筛选产品 - 验证可以根据产品状态（激活/停用）筛选',
      'should handle error when getting products fails': '处理获取产品错误 - 验证系统能正确处理获取产品列表失败的情况',
      'should get product by id when authenticated': '根据ID获取产品 - 验证管理员可以查看单个产品的详细信息',
      'should create product with sizes, toppings, and ice_options': '创建带选项的产品 - 验证可以创建包含杯型、加料、冰度等选项的产品',
      'should create product with image upload': '创建带图片的产品 - 验证可以上传产品图片并创建产品',
      'should update product with new image': '更新产品图片 - 验证可以替换现有产品的图片',
      'should reject invalid file type for product image': '拒绝无效文件类型 - 验证上传非图片文件时系统会拒绝并返回错误',
      'should batch update products': '批量更新产品 - 验证可以同时更新多个产品的状态和排序',
      'should batch update products with price actions': '批量更新产品价格 - 验证可以批量调整产品价格（设置、增加、乘以）',
      'should delete product': '删除产品 - 验证管理员可以删除产品',
      'should return 404 when deleting non-existent product': '删除不存在的产品 - 验证删除不存在的产品时返回404错误'
    },
    'Discount Rules': {
      'should get all discount rules': '获取所有折扣规则 - 验证管理员可以查看所有折扣规则',
      'should batch update discount rules': '批量更新折扣规则 - 验证可以批量创建、更新、删除折扣规则'
    },
    'Settings': {
      'should get all settings': '获取所有设置 - 验证管理员可以查看系统设置',
      'should update settings': '更新设置 - 验证管理员可以修改系统设置'
    },
    'Ordering Control': {
      'should open ordering': '开启点单 - 验证管理员可以开启点单功能',
      'should close ordering': '关闭点单 - 验证管理员可以关闭点单功能'
    },
    'Orders': {
      'should get all orders': '获取所有订单 - 验证管理员可以查看所有订单',
      'should get order statistics': '获取订单统计 - 验证可以获取订单的统计数据',
      'should export orders to XLSX': '导出订单到Excel - 验证可以将订单导出为XLSX格式',
      'should update order status': '更新订单状态 - 验证管理员可以修改订单状态',
      'should return 400 for invalid status': '无效订单状态 - 验证使用无效订单状态时返回400错误',
      'should confirm cycle and calculate discount': '确认周期并计算折扣 - 验证可以确认点单周期并自动计算折扣'
    },
    'Cycles': {
      'should get all cycles': '获取所有周期 - 验证管理员可以查看所有点单周期'
    },
    'Users': {
      'should get all users': '获取所有用户 - 验证管理员可以查看所有注册用户'
    },
    'Admins': {
      'should get all admins': '获取所有管理员 - 验证超级管理员可以查看所有管理员',
      'should create admin': '创建管理员 - 验证超级管理员可以创建新管理员',
      'should update admin': '更新管理员 - 验证超级管理员可以修改管理员信息',
      'should delete admin': '删除管理员 - 验证超级管理员可以删除管理员'
    },
    'Logs': {
      'should get logs': '获取日志 - 验证管理员可以查看系统操作日志',
      'should get filter options': '获取过滤选项 - 验证可以获取日志过滤的可用选项'
    },
    'Developer Tools': {
      'should get tables list when super_admin': '获取表列表 - 验证超级管理员可以查看数据库表列表',
      'should get table schema when super_admin': '获取表结构 - 验证超级管理员可以查看数据库表结构',
      'should reject invalid table name in table schema': '拒绝无效表名（表结构） - 验证系统会拒绝包含SQL注入攻击的表名请求',
      'should get table data with pagination when super_admin': '获取表数据（分页） - 验证超级管理员可以分页查看数据库表数据',
      'should reject invalid table name in table data': '拒绝无效表名（表数据） - 验证系统会拒绝包含SQL注入攻击的表名请求',
      'should update table data when super_admin': '更新表数据 - 验证超级管理员可以通过开发者工具更新数据库表数据',
      'should reject invalid table name in update table data': '拒绝无效表名（更新数据） - 验证系统会拒绝包含SQL注入攻击的表名请求',
      'should reject dangerous SQL keywords': '拒绝危险SQL关键字 - 验证系统会拒绝包含危险SQL关键字（如DROP、DELETE等）的请求',
      'should reject non-allowed SQL statement types': '拒绝不允许的SQL语句类型 - 验证系统只允许SELECT、UPDATE等安全操作，拒绝其他危险操作'
    }
  },
  
  // Auth Routes 测试描述
  'Auth Routes': {
    'POST /api/auth/admin/login': {
      'should login admin with correct credentials': '管理员登录成功 - 验证使用正确的用户名和密码可以成功登录',
      'should return 401 with incorrect password': '密码错误 - 验证使用错误密码时返回401未授权错误',
      'should return 401 with non-existent username': '用户名不存在 - 验证使用不存在的用户名时返回401错误',
      'should return 400 with invalid input': '无效输入 - 验证输入格式不正确时返回400错误'
    },
    'POST /api/auth/admin/logout': {
      'should logout admin successfully': '管理员登出成功 - 验证管理员可以成功登出',
      'should return 401 if not logged in': '未登录登出 - 验证未登录时登出返回401错误'
    },
    'GET /api/auth/admin/me': {
      'should return admin info if logged in': '获取管理员信息 - 验证登录后可以获取当前管理员信息'
    },
    'POST /api/auth/user/login': {
      'should create new user and login': '创建新用户并登录 - 验证新用户首次登录时自动创建账户',
      'should login existing user': '登录现有用户 - 验证已注册用户可以成功登录',
      'should return 400 with invalid phone': '无效手机号 - 验证手机号格式不正确时返回400错误',
      'should update name when existing user logs in with new name': '更新用户姓名 - 验证用户登录时可以使用新姓名更新账户',
      'should update last_login when existing user logs in': '更新最后登录时间 - 验证用户登录时自动更新最后登录时间',
      'should create new user with empty name': '创建空姓名用户 - 验证可以创建没有姓名的用户账户'
    },
    'POST /api/auth/user/logout': {
      'should logout user successfully': '用户登出成功 - 验证用户可以成功登出',
      'should return 401 if not logged in': '未登录登出 - 验证未登录时登出返回401错误'
    },
    'GET /api/auth/user/me': {
      'should return user info if logged in': '获取用户信息 - 验证登录后可以获取当前用户信息',
      'should return 401 if user does not exist': '用户不存在 - 验证用户不存在时返回401错误'
    },
    'POST /api/auth/sms/send': {
      'should send verification code when SMS is enabled': '发送验证码 - 验证SMS启用时可以成功发送验证码',
      'should return error when SMS is not enabled (non-admin)': 'SMS未启用 - 验证SMS未启用时普通用户无法发送验证码',
      'should allow admin to send code even when SMS is disabled': '管理员测试验证码 - 验证管理员即使SMS未启用也可以发送验证码（用于测试）',
      'should validate phone number format': '验证手机号格式 - 验证系统会检查手机号格式是否正确'
    },
    'POST /api/auth/user/login-with-code': {
      'should login user with valid verification code': '验证码登录成功 - 验证使用正确的验证码可以成功登录',
      'should return error with invalid verification code': '验证码错误 - 验证使用错误的验证码时返回错误',
      'should create new user if not exists': '验证码登录创建新用户 - 验证新用户使用验证码登录时自动创建账户'
    },
    'GET /api/auth/session/info': {
      'should return session info for guest': '访客会话信息 - 验证未登录用户可以获取会话信息（显示为访客）',
      'should return session info for logged in admin': '管理员会话信息 - 验证登录的管理员可以获取会话信息',
      'should return session info for logged in user': '用户会话信息 - 验证登录的用户可以获取会话信息'
    },
    'POST /api/auth/session/refresh': {
      'should return 401 if no session': '无会话刷新 - 验证未登录时刷新会话返回401错误',
      'should refresh admin session': '刷新管理员会话 - 验证管理员可以刷新会话过期时间',
      'should refresh user session': '刷新用户会话 - 验证用户可以刷新会话过期时间'
    }
  },
  
  // User Routes 测试描述
  'User Routes': {
    'POST /api/user/orders': {
      'should create order when ordering is open': '创建订单 - 验证点单开放时用户可以创建订单',
      'should return error when ordering is closed': '点单关闭 - 验证点单关闭时无法创建订单',
      'should calculate order total correctly': '计算订单总额 - 验证订单金额计算正确（包含产品价格、杯型差价、加料费用）',
      'should handle product not found': '产品不存在 - 验证订单中包含不存在的产品时返回错误',
      'should handle inactive product': '产品已停用 - 验证订单中包含已停用的产品时返回错误'
    },
    'GET /api/user/orders': {
      'should get user orders': '获取用户订单 - 验证用户可以查看自己的所有订单',
      'should return empty array if no orders': '无订单 - 验证用户没有订单时返回空数组',
      'should include cycle info': '包含周期信息 - 验证订单列表包含所属点单周期信息'
    },
    'GET /api/user/orders/by-phone': {
      'should get orders by phone': '按手机号查询订单 - 验证可以根据手机号查询订单（用于未登录用户查询）'
    },
    'GET /api/user/orders/:id': {
      'should get order by id': '获取订单详情 - 验证用户可以查看单个订单的详细信息',
      'should return 404 for non-existent order': '订单不存在 - 验证查询不存在的订单时返回404错误'
    },
    'DELETE /api/user/orders/:id': {
      'should delete pending order': '删除待付款订单 - 验证用户可以删除待付款状态的订单',
      'should return error for non-existent order': '删除不存在的订单 - 验证删除不存在的订单时返回错误',
      'should return error when ordering is closed': '点单关闭时删除 - 验证点单关闭时无法删除订单'
    },
    'PUT /api/user/orders/:id': {
      'should update pending order': '更新待付款订单 - 验证用户可以修改待付款订单的内容',
      'should return error when ordering is closed': '点单关闭时更新 - 验证点单关闭时无法更新订单'
    },
    'POST /api/user/orders/:id/payment': {
      'should upload payment screenshot': '上传付款截图 - 验证用户可以上传付款截图',
      'should return error for paid order': '已付款订单 - 验证已付款的订单无法再次上传截图',
      'should return error for cancelled order': '已取消订单 - 验证已取消的订单无法上传截图'
    },
    'GET /api/user/orders-summary': {
      'should get order summary': '获取订单汇总 - 验证用户可以获取订单统计汇总信息'
    }
  },
  
  // Public Routes 测试描述
  'Public Routes': {
    'GET /api/public/settings': {
      'should return settings': '获取系统设置 - 验证公开接口可以获取系统设置（如点单状态）'
    },
    'GET /api/public/categories': {
      'should return categories list': '获取分类列表 - 验证可以获取所有激活的产品分类',
      'should only return active categories': '仅返回激活分类 - 验证只返回状态为激活的分类'
    },
    'GET /api/public/products': {
      'should return products list': '获取产品列表 - 验证可以获取所有激活的产品',
      'should filter products by category_id': '按分类筛选产品 - 验证可以根据分类ID筛选产品',
      'should only return active products': '仅返回激活产品 - 验证只返回状态为激活的产品'
    },
    'GET /api/public/orders/:orderNumber': {
      'should get order by order number': '根据订单号查询 - 验证可以根据订单号查询订单详情（用于未登录用户查询）',
      'should return 404 for non-existent order': '订单不存在 - 验证查询不存在的订单时返回404错误'
    },
    'GET /api/public/discount-rules': {
      'should return discount rules': '获取折扣规则 - 验证可以获取所有激活的折扣规则'
    },
    'POST /api/public/calculate-discount': {
      'should calculate discount when ordering is open': '计算折扣 - 验证点单开放时可以计算折扣',
      'should return error when ordering is closed': '点单关闭 - 验证点单关闭时无法计算折扣',
      'should apply correct discount rate': '应用正确折扣率 - 验证根据订单总额应用正确的折扣率',
      'should update order discount amounts': '更新订单折扣金额 - 验证计算折扣后更新订单的折扣金额和最终金额'
    },
    'GET /api/public/cycle-discount': {
      'should get cycle discount info': '获取周期折扣信息 - 验证可以获取当前周期的折扣信息',
      'should return null when no rules': '无折扣规则 - 验证没有折扣规则时返回null'
    },
    'GET /api/public/show-images': {
      'should get showcase images': '获取展示图片 - 验证可以获取产品展示图片列表',
      'should return empty array if no images': '无展示图片 - 验证没有展示图片时返回空数组'
    }
  }
};

/**
 * 获取测试用例的中文描述
 * @param {string} suiteName - 测试套件名称
 * @param {string} describeName - describe块名称
 * @param {string} testName - 测试用例名称
 * @returns {string} 中文描述，如果找不到则返回默认描述
 */
function getTestDescription(suiteName, describeName, testName) {
  const suite = module.exports[suiteName];
  if (!suite) return `测试: ${testName}`;
  
  const describe = suite[describeName];
  if (!describe) return `测试: ${testName}`;
  
  return describe[testName] || `测试: ${testName}`;
}

module.exports.getTestDescription = getTestDescription;

