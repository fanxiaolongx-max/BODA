const { body, param, query, validationResult } = require('express-validator');

// 验证结果检查中间件
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false, 
      message: '输入验证失败',
      errors: errors.array() 
    });
  }
  next();
}

// 手机号验证规则（兼容国际手机号）
const phoneValidation = body('phone')
  .trim()
  .isLength({ min: 8, max: 15 })
  .withMessage('手机号长度应在8-15位之间')
  .matches(/^[+\d]+$/)
  .withMessage('手机号只能包含数字和+号');

// 登录验证
const loginValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('用户名长度为3-50个字符'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('密码至少6个字符'),
  validate
];

// 菜单验证
const productValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('菜品名称长度为1-100个字符'),
  body('price')
    .isFloat({ min: 0 })
    .withMessage('价格必须大于等于0'),
  body('category_id')
    .optional()
    .isInt()
    .withMessage('分类ID必须是整数'),
  validate
];

// 分类验证
const categoryValidation = [
  body('name')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('分类名称长度为1-50个字符'),
  validate
];

// 折扣规则验证
const discountValidation = [
  body('min_amount')
    .isFloat({ min: 0 })
    .withMessage('最小金额必须大于等于0'),
  body('max_amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('最大金额必须大于等于0'),
  body('discount_rate')
    .isFloat({ min: 0, max: 1 })
    .withMessage('折扣率必须在0-1之间'),
  validate
];

// 订单验证
const orderValidation = [
  body('items')
    .isArray({ min: 1 })
    .withMessage('订单至少包含一个商品'),
  body('items.*.product_id')
    .isInt()
    .withMessage('商品ID必须是整数'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('商品数量必须大于0'),
  phoneValidation,
  validate
];

module.exports = {
  validate,
  loginValidation,
  productValidation,
  categoryValidation,
  discountValidation,
  orderValidation,
  phoneValidation
};

