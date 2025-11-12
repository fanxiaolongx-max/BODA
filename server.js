const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// 确保上传目录存在
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 数据存储文件
const DATA_FILE = path.join(__dirname, 'data.json');

// 初始化数据
let data = {
  settings: {
    orderingOpen: false,
    orderingEndTime: null,
    discountRules: [
      { minAmount: 0, maxAmount: 50, discount: 0 },
      { minAmount: 50, maxAmount: 100, discount: 0.05 },
      { minAmount: 100, maxAmount: 200, discount: 0.1 },
      { minAmount: 200, discount: 0.15 }
    ]
  },
  products: [
    { id: 1, name: '珍珠奶茶', price: 15, category: '经典奶茶' },
    { id: 2, name: '红豆奶茶', price: 16, category: '经典奶茶' },
    { id: 3, name: '布丁奶茶', price: 17, category: '经典奶茶' },
    { id: 4, name: '椰果奶茶', price: 16, category: '经典奶茶' },
    { id: 5, name: '乌龙奶茶', price: 15, category: '经典奶茶' },
    { id: 6, name: '抹茶拿铁', price: 20, category: '拿铁系列' },
    { id: 7, name: '焦糖拿铁', price: 20, category: '拿铁系列' },
    { id: 8, name: '香草拿铁', price: 20, category: '拿铁系列' },
    { id: 9, name: '柠檬蜂蜜', price: 18, category: '果茶系列' },
    { id: 10, name: '百香果茶', price: 18, category: '果茶系列' },
    { id: 11, name: '芒果冰沙', price: 22, category: '冰沙系列' },
    { id: 12, name: '草莓冰沙', price: 22, category: '冰沙系列' }
  ],
  orders: []
};

// 加载数据
function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const fileData = fs.readFileSync(DATA_FILE, 'utf8');
      data = JSON.parse(fileData);
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  }
}

// 保存数据
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('保存数据失败:', error);
  }
}

// 初始化加载数据
loadData();

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'payment-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片格式'));
    }
  }
});

// API 路由

// 获取设置
app.get('/api/settings', (req, res) => {
  res.json(data.settings);
});

// 更新设置（管理员功能）
app.post('/api/settings', (req, res) => {
  const { orderingOpen, orderingEndTime, discountRules } = req.body;
  if (orderingOpen !== undefined) data.settings.orderingOpen = orderingOpen;
  if (orderingEndTime !== undefined) data.settings.orderingEndTime = orderingEndTime;
  if (discountRules) data.settings.discountRules = discountRules;
  saveData();
  res.json({ success: true, settings: data.settings });
});

// 获取商品列表
app.get('/api/products', (req, res) => {
  res.json(data.products);
});

// 获取订单列表
app.get('/api/orders', (req, res) => {
  // 如果点单时间已关闭，重新计算折扣
  if (!data.settings.orderingOpen) {
    calculateDiscounts();
  }
  res.json(data.orders);
});

// 创建订单
app.post('/api/orders', (req, res) => {
  if (!data.settings.orderingOpen) {
    return res.status(400).json({ error: '点单时间未开放' });
  }

  const { items, customerName, customerPhone } = req.body;
  
  if (!items || items.length === 0) {
    return res.status(400).json({ error: '订单不能为空' });
  }

  // 计算原始总价
  let totalAmount = 0;
  items.forEach(item => {
    const product = data.products.find(p => p.id === item.productId);
    if (product) {
      totalAmount += product.price * item.quantity;
    }
  });

  const order = {
    id: uuidv4(),
    orderNumber: 'BO' + Date.now().toString().slice(-8),
    customerName: customerName || '匿名',
    customerPhone: customerPhone || '',
    items: items,
    totalAmount: totalAmount,
    discount: 0,
    finalAmount: totalAmount,
    status: 'pending', // pending, paid, completed
    paymentImage: null,
    createdAt: new Date().toISOString(),
    paidAt: null
  };

  data.orders.push(order);
  saveData();
  res.json({ success: true, order });
});

// 计算折扣（在点单时间关闭后）
function calculateDiscounts() {
  if (data.settings.orderingOpen) {
    return; // 点单时间未关闭，不计算折扣
  }

  // 计算总金额和总数量
  let totalAmount = 0;
  let totalQuantity = 0;
  
  data.orders.forEach(order => {
    if (order.status === 'pending') {
      totalAmount += order.totalAmount;
      order.items.forEach(item => {
        totalQuantity += item.quantity;
      });
    }
  });

  // 根据总金额确定折扣率
  let discountRate = 0;
  const rules = data.settings.discountRules.sort((a, b) => b.minAmount - a.minAmount);
  for (const rule of rules) {
    if (totalAmount >= rule.minAmount) {
      discountRate = rule.discount;
      break;
    }
  }

  // 应用折扣到所有待付款订单
  data.orders.forEach(order => {
    if (order.status === 'pending') {
      order.discount = order.totalAmount * discountRate;
      order.finalAmount = order.totalAmount - order.discount;
    }
  });

  saveData();
}

// 获取订单详情
app.get('/api/orders/:id', (req, res) => {
  const order = data.orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: '订单不存在' });
  }
  res.json(order);
});

// 上传付款截图
app.post('/api/orders/:id/payment', upload.single('paymentImage'), (req, res) => {
  if (data.settings.orderingOpen) {
    return res.status(400).json({ error: '点单时间未关闭，无法付款' });
  }

  const order = data.orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: '订单不存在' });
  }

  if (order.status === 'paid') {
    return res.status(400).json({ error: '订单已付款' });
  }

  // 重新计算折扣
  calculateDiscounts();
  const updatedOrder = data.orders.find(o => o.id === req.params.id);

  if (req.file) {
    updatedOrder.paymentImage = `/uploads/${req.file.filename}`;
    updatedOrder.status = 'paid';
    updatedOrder.paidAt = new Date().toISOString();
    saveData();
    res.json({ success: true, order: updatedOrder });
  } else {
    res.status(400).json({ error: '未上传图片' });
  }
});

// 获取订单汇总（包含折扣信息）
app.get('/api/orders-summary', (req, res) => {
  // 如果点单时间已关闭，重新计算折扣
  if (!data.settings.orderingOpen) {
    calculateDiscounts();
  }

  const summary = {
    totalOrders: data.orders.length,
    totalAmount: 0,
    totalDiscount: 0,
    totalFinalAmount: 0,
    orders: data.orders.map(order => {
      const productDetails = order.items.map(item => {
        const product = data.products.find(p => p.id === item.productId);
        return {
          ...item,
          productName: product ? product.name : '未知商品',
          productPrice: product ? product.price : 0
        };
      });

      return {
        ...order,
        items: productDetails
      };
    })
  };

  data.orders.forEach(order => {
    summary.totalAmount += order.totalAmount;
    summary.totalDiscount += order.discount || 0;
    summary.totalFinalAmount += order.finalAmount || order.totalAmount;
  });

  res.json(summary);
});

// 获取订单条形码信息
app.get('/api/orders/:id/barcode', (req, res) => {
  const order = data.orders.find(o => o.id === req.params.id);
  if (!order) {
    return res.status(404).json({ error: '订单不存在' });
  }
  res.json({ 
    orderNumber: order.orderNumber,
    barcode: order.orderNumber 
  });
});

// 通过订单号查询订单（用于扫码）
app.get('/api/orders-by-number/:orderNumber', (req, res) => {
  const order = data.orders.find(o => o.orderNumber === req.params.orderNumber);
  if (!order) {
    return res.status(404).json({ error: '订单不存在' });
  }
  
  // 添加商品详情
  const productDetails = order.items.map(item => {
    const product = data.products.find(p => p.id === item.productId);
    return {
      ...item,
      productName: product ? product.name : '未知商品',
      productPrice: product ? product.price : 0
    };
  });
  
  res.json({
    ...order,
    items: productDetails
  });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});

