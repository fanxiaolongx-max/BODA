const bcrypt = require('bcryptjs');

// 模拟管理员数据
const mockAdmin = {
  username: 'testadmin',
  password: 'test123456',
  name: 'Test Admin',
  email: 'test@example.com',
  role: 'admin',
  status: 'active'
};

const mockSuperAdmin = {
  username: 'superadmin',
  password: 'super123456',
  name: 'Super Admin',
  email: 'super@example.com',
  role: 'super_admin',
  status: 'active'
};

// 模拟用户数据
const mockUser = {
  phone: '13800138000',
  name: 'Test User'
};

// 模拟分类数据
const mockCategory = {
  name: 'Test Category',
  description: 'Test Description',
  sort_order: 1,
  status: 'active'
};

// 模拟产品数据
const mockProduct = {
  name: 'Test Product',
  description: 'Test Product Description',
  price: 20.00,
  category_id: 1,
  status: 'active',
  sizes: JSON.stringify({ 'medium': 20, 'large': 25 }),
  sugar_levels: JSON.stringify(['0', '30', '50', '70', '100']),
  available_toppings: JSON.stringify([]),
  ice_options: JSON.stringify(['normal', 'less', 'no'])
};

// 模拟折扣规则数据
const mockDiscountRule = {
  min_amount: 100,
  max_amount: 200,
  discount_rate: 0.1,
  description: 'Test Discount',
  status: 'active'
};

// 模拟订单数据
const mockOrder = {
  id: 'test-order-id-123',
  order_number: 'BO12345678',
  user_id: 1,
  customer_name: 'Test User',
  customer_phone: '13800138000',
  total_amount: 50.00,
  discount_amount: 5.00,
  final_amount: 45.00,
  status: 'pending'
};

// 模拟订单项数据
const mockOrderItem = {
  order_id: 'test-order-id-123',
  product_id: 1,
  product_name: 'Test Product',
  product_price: 20.00,
  quantity: 2,
  subtotal: 40.00,
  size: 'medium',
  sugar_level: '50',
  ice_level: 'normal',
  toppings: JSON.stringify([]),
  unit_price: 20.00
};

// 创建带加密密码的管理员数据
async function createAdminWithPassword(adminData) {
  const hashedPassword = await bcrypt.hash(adminData.password, 10);
  return {
    ...adminData,
    password: hashedPassword
  };
}

// 创建测试用的session对象
function createMockSession(sessionData = {}) {
  return {
    adminId: sessionData.adminId || null,
    adminUsername: sessionData.adminUsername || null,
    adminRole: sessionData.adminRole || null,
    userId: sessionData.userId || null,
    userPhone: sessionData.userPhone || null,
    ...sessionData
  };
}

// 创建测试用的请求对象
function createMockRequest(options = {}) {
  return {
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
    session: createMockSession(options.session),
    ip: options.ip || '127.0.0.1',
    headers: options.headers || {},
    ...options
  };
}

// 创建测试用的响应对象
function createMockResponse() {
  const res = {
    statusCode: 200,
    body: null,
    headers: {}
  };

  res.status = function(code) {
    this.statusCode = code;
    return this;
  };

  res.json = function(data) {
    this.body = data;
    return this;
  };

  res.send = function(data) {
    this.body = data;
    return this;
  };

  return res;
}

// 创建mock文件对象（用于multer测试）
function createMockFile(options = {}) {
  return {
    fieldname: options.fieldname || 'payment_image',
    originalname: options.originalname || 'test-image.jpg',
    encoding: options.encoding || '7bit',
    mimetype: options.mimetype || 'image/jpeg',
    buffer: options.buffer || Buffer.from('fake image data'),
    size: options.size || 1024,
    destination: options.destination || 'uploads/payments',
    filename: options.filename || `test-${Date.now()}.jpg`,
    path: options.path || `uploads/payments/test-${Date.now()}.jpg`
  };
}

// 创建订单辅助函数
async function createTestOrder(runAsync, userId, productId, options = {}) {
  const orderId = options.orderId || 'test-order-' + Date.now();
  const orderNumber = options.orderNumber || 'BO' + Date.now().toString().slice(-8);
  
  await runAsync(
    `INSERT INTO orders (id, order_number, user_id, customer_name, customer_phone, 
     total_amount, discount_amount, final_amount, status, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
    [
      orderId,
      orderNumber,
      userId,
      options.customerName || 'Test User',
      options.customerPhone || '13800138000',
      options.totalAmount || 100,
      options.discountAmount || 0,
      options.finalAmount || 100,
      options.status || 'pending',
      options.notes || null
    ]
  );

  if (productId) {
    await runAsync(
      'INSERT INTO order_items (order_id, product_id, product_name, product_price, quantity, subtotal) VALUES (?, ?, ?, ?, ?, ?)',
      [orderId, productId, 'Test Product', 100, 1, 100]
    );
  }

  return { orderId, orderNumber };
}

// 创建周期辅助函数
async function createTestCycle(runAsync, options = {}) {
  const cycleNumber = options.cycleNumber || 'CYCLE' + Date.now();
  const status = options.status || 'active';
  const startTime = options.startTime || "datetime('now', 'localtime')";
  const endTime = options.endTime || null;
  
  const result = await runAsync(
    `INSERT INTO ordering_cycles (cycle_number, start_time, end_time, status, total_amount, discount_rate)
     VALUES (?, ${startTime}, ${endTime ? `'${endTime}'` : 'NULL'}, ?, ?, ?)`,
    [cycleNumber, status, options.totalAmount || 0, options.discountRate || 0]
  );
  
  return { cycleId: result.id, cycleNumber };
}

module.exports = {
  mockAdmin,
  mockSuperAdmin,
  mockUser,
  mockCategory,
  mockProduct,
  mockDiscountRule,
  mockOrder,
  mockOrderItem,
  createAdminWithPassword,
  createMockSession,
  createMockRequest,
  createMockResponse,
  createMockFile,
  createTestOrder,
  createTestCycle
};

