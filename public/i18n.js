// Multi-language translations
const translations = {
  en: {
    // Basic UI
    'app_name': 'BOBA TEA',
    'admin_panel': 'Admin Panel',
    'ordering_system': 'Ordering System',
    'login': 'Login',
    'logout': 'Logout',
    'guest': 'Guest',
    'save': 'Save',
    'cancel': 'Cancel',
    'delete': 'Delete',
    'edit': 'Edit',
    'add': 'Add',
    'close': 'Close',
    'confirm': 'Confirm',
    'reset': 'Reset',
    'refresh': 'Refresh',
    'search': 'Search',
    'filter': 'Filter',
    'export': 'Export',
    'status': 'Status',
    'actions': 'Actions',
    'created_at': 'Created At',
    'updated_at': 'Updated At',
    'welcome': 'Welcome',
    'menu': 'Menu',
    'cart': 'Cart',
    'orders': 'Orders',
    'all': 'All',
    'add_to_cart': 'Add to Cart',
    'select_spec': 'Select Spec',
    'quantity': 'Quantity',
    'total': 'Total',
    'subtotal': 'Subtotal',
    'discount': 'Discount',
    'final_amount': 'Final Amount',
    'submit_order': 'Submit Order',
    'phone_number': 'Phone Number',
    'name_optional': 'Name (Optional)',
    'ordering_open': 'Ordering is open',
    'ordering_closed': 'Ordering is closed',
    'ordering_closed_wait': 'Ordering is closed, please wait for notification',
    'hours': 'hours',
    'minutes': 'minutes',
    'seconds': 'seconds',
    'order_expired': 'Order Expired',
    'pending_payment': 'Pending Payment',
    'paid': 'Paid',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'upload_payment': 'Upload Payment Screenshot',
    'view_orders': 'View Orders',
    'no_orders': 'No orders',
    'system_notice': 'Notice',
    'current_cycle_total': 'Current Cycle Total',
    'current_discount': 'Current Discount',
    'next_discount': 'Next Discount',
    'remaining_for_discount': 'Remaining for',
    'no_discount': 'No discount',
    'max_discount_reached': 'Maximum discount reached',
    'no_discount_activity': 'No discount activity',
    'dashboard': 'Dashboard',
    'products': 'Products',
    'categories': 'Categories',
    'orders_management': 'Orders',
    'discount_rules': 'Discount Rules',
    'system_settings': 'Settings',
    'users': 'Users',
    'admins': 'Admins',
    'logs': 'Logs',
    'total_orders': 'Total Orders',
    'total_amount': 'Total Amount',
    'total_discount': 'Total Discount',
    'current_cycle_info': 'Current Cycle Info',
    'previous_cycle_info': 'Previous Cycle Info',
    'cycle_number': 'Cycle Number',
    'start_time': 'Start Time',
    'end_time': 'End Time',
    'in_progress': 'In Progress',
    'ended': 'Ended',
    'confirmed': 'Confirmed',
    'cycle_total_amount': 'Cycle Total Amount',
    'discount_rate': 'Discount Rate',
    'confirm_cycle': 'Confirm Cycle and Calculate Discount',
    'no_active_cycle': 'No active cycle',
    'toggle_ordering': 'Open Ordering',
    'close_ordering': 'Close Ordering',
    'ordering_status': 'Ordering Status',
    'system_notice': 'System Notice',
    'product_name': 'Product Name',
    'product_price': 'Product Price',
    'product_description': 'Product Description',
    'category': 'Category',
    'image': 'Image',
    'active': 'Active',
    'inactive': 'Inactive',
    'size': 'Size',
    'size_title': 'Size',
    'sugar_level': 'Sugar Level',
    'toppings': 'Toppings',
    'toppings_title': 'Toppings (Multiple)',
    'cup_size': 'Cup Size',
    'sweetness': 'Sweetness',
    'sweetness_title': 'Sweetness',
    'ice_level_title': 'Ice Level',
    'extra_toppings': 'Extra Toppings',
    'order_details': 'Order Details',
    'customer_name': 'Customer Name',
    'customer_phone': 'Customer Phone',
    'order_number': 'Order Number',
    'order_status': 'Order Status',
    'payment_screenshot': 'Payment Screenshot',
    'operation_logs': 'Operation Logs',
    'operation_time': 'Operation Time',
    'operator': 'Operator',
    'operation_type': 'Operation Type',
    'target_type': 'Target Type',
    'operation_details': 'Operation Details',
    'ip_address': 'IP Address',
    
    // Toast messages
    'session_expired': 'Session expired, you have been logged out',
    'please_enter_phone': 'Please enter phone number',
    'phone_length_error': 'Phone number length should be between 8-15 digits',
    'phone_format_error': 'Phone number can only contain digits and +',
    'please_enter_code': 'Please enter verification code',
    'code_length_error': 'Verification code must be 6 digits',
    'login_success': 'Login successful!',
    'login_failed': 'Login failed',
    'login_failed_retry': 'Login failed, please try again',
    'logged_out': 'Logged out',
    'please_enter_phone_first': 'Please enter phone number first',
    'sms_verification_required': 'SMS verification is required',
    'verification_code_sent': 'Verification code sent successfully',
    'verification_code_dev': 'Verification code: {code} (dev only)',
    'failed_send_code': 'Failed to send verification code',
    'failed_send_code_retry': 'Failed to send verification code, please try again',
    'please_select_specs': 'Please select specifications',
    'added_to_cart': 'Added to cart',
    'cart_empty': 'Cart is empty',
    'ordering_closed_warning': 'Ordering is closed',
    'processing_order': 'Processing your order, please wait...',
    'order_submitted_success': 'Order submitted successfully! Order number: {orderNumber}',
    'order_submission_failed': 'Order submission failed',
    'order_submission_failed_retry': 'Order submission failed, please try again',
    'order_deleted': 'Order deleted',
    'delete_failed_retry': 'Delete failed, please try again',
    'please_select_payment': 'Please select payment screenshot',
    'payment_upload_success': 'Payment screenshot uploaded successfully!',
    'upload_failed_retry': 'Upload failed, please try again',
    
    // Status labels
    'status_pending': 'Pending Payment',
    'status_paid': 'Paid',
    'status_completed': 'Completed',
    'status_cancelled': 'Cancelled',
    
    // Sugar level labels
    'sugar_zero': 'Zero',
    'sugar_light': 'Light',
    'sugar_half': 'Half',
    'sugar_less': 'Less',
    'sugar_regular': 'Regular',
    'sugar_recommended': '(Recommended)',
    
    // Ice level labels
    'ice_normal': 'Normal Ice',
    'ice_less': 'Less Ice',
    'ice_no': 'No Ice',
    'ice_room': 'Room Temperature',
    'ice_hot': 'Hot',
    
    // UI Labels
    'welcome_to_store': 'Welcome to {storeName}',
    'discover_latest': 'Discover our latest creations',
    'new_products': 'New Products',
    'order_now': 'Order Now',
    'browse_menu': 'Browse Menu',
    'my_orders': 'My Orders',
    'view_history': 'View History',
    'selected_items': 'Selected Items',
    'checkout': 'Checkout',
    'home': 'Home',
    'order': 'Order',
    'profile': 'Profile',
    'no_products': 'No products',
    'no_products_chinese': 'No products',
    'ordering_open_welcome': '✅ Ordering is open, welcome to order!',
    'ordering_closed_notification': '⚠️ Ordering is closed, please wait for notification',
    'please_login_view_orders': 'Please login to view orders',
    'you_have_no_orders': 'You have no orders yet',
    'no_orders_chinese': 'You have no orders yet',
    'login_expired_please_login': 'Login expired, please login again',
    'failed_load_orders': 'Failed to load orders',
    'failed_load_orders_refresh': 'Failed to load orders, please refresh and try again',
    'failed_load_orders_error': 'Failed to load orders: {error}',
    'network_error': 'Network error',
    'no_toppings_available': 'No toppings available for this product',
    'no_images_available': 'No images available',
    'failed_load_images': 'Failed to load images',
    'zoom_percent': '{value}%',
    'user_chinese': 'User',
    'guest_chinese': 'Guest',
    'click_login_chinese': 'Click to login',
    
    // Order details labels
    'order_number_label': 'Order Number:',
    'cycle_id': 'Cycle ID:',
    'cycle_time': 'Cycle Time:',
    'ongoing': 'Ongoing',
    'quantity_label': 'Quantity:',
    'size_label': 'Size:',
    'sweetness_label': 'Sweetness:',
    'toppings_label': 'Toppings:',
    'ice_level_label': 'Ice Level:',
    'price_breakdown': 'Price Breakdown:',
    'unit_price': 'Unit Price:',
    'original_price': 'Original Price:',
    'discount_label': 'Discount:',
    'final_amount_label': 'Final Amount:',
    'order_notes': 'Order Notes:',
    'delete_order': 'Delete Order',
    'upload_payment_screenshot': 'Upload Payment Screenshot',
    'wait_close_ordering': 'Please wait for Close Ordering and final price calculation',
    'view_payment_screenshot': 'View Payment Screenshot',
    'delete_order_confirm': 'Delete Order',
    'delete_order_message': 'Are you sure you want to delete this order? This action cannot be undone.',
    'select': 'Select',
    'closed': 'Closed',
    'starting_from': 'from',
    'resend_code_in': 'Resend code in {seconds} seconds',
    'store_ordering_system': '{storeName} Ordering System',
    
    // Language switcher
    'language': 'Language',
    'switch_language': 'Switch Language',
    
    // Cart labels
    'cart_title': 'Cart',
    'size_label_colon': 'Size:',
    'sugar_label_colon': 'Sugar:',
    'ice_label_colon': 'Ice:',
    'toppings_label_colon': 'Toppings:',
    'default': 'Default',
    'regular': 'Regular',
    'order_notes_optional': 'Order Notes (Optional)',
    'order_notes_placeholder': 'Any special requests or notes...',
    'total_label_colon': 'Total:',
    'submit_order_button': 'Submit Order',
    'add_to_cart_button': 'Add to Cart',
    'upload_payment_screenshot_title': 'Upload Payment Screenshot',
    'select_payment_screenshot': 'Select Payment Screenshot',
    'upload_button': 'Upload',
    'payment_screenshot_title': 'Payment Screenshot',
    'zoom_label': 'Zoom:',
    
    // Login modal
    'login_to_continue': 'Login to Continue',
    'please_enter_phone_to_order': 'Please enter your phone number to place an order',
    'phone_number_required': 'Phone Number *',
    'enter_phone_number': 'Enter phone number',
    'verification_code_required': 'Verification Code *',
    'enter_6_digit_code': 'Enter 6-digit code',
    'send_code': 'Send Code',
    'name_optional_label': 'Name (Optional)',
    'leave_empty_or_enter_name': 'Leave empty or enter name',
    'loading': 'Loading...'
  },
  zh: {
    // Basic UI
    'app_name': '波霸奶茶',
    'admin_panel': '管理面板',
    'ordering_system': '点单系统',
    'login': '登录',
    'logout': '退出',
    'guest': '访客',
    'save': '保存',
    'cancel': '取消',
    'delete': '删除',
    'edit': '编辑',
    'add': '添加',
    'close': '关闭',
    'confirm': '确认',
    'reset': '重置',
    'refresh': '刷新',
    'search': '搜索',
    'filter': '筛选',
    'export': '导出',
    'status': '状态',
    'actions': '操作',
    'created_at': '创建时间',
    'updated_at': '更新时间',
    'welcome': '欢迎',
    'menu': '菜单',
    'cart': '购物车',
    'orders': '订单',
    'all': '全部',
    'add_to_cart': '加入购物车',
    'select_spec': '选择规格',
    'quantity': '数量',
    'total': '总计',
    'subtotal': '小计',
    'discount': '折扣',
    'final_amount': '实付金额',
    'submit_order': '提交订单',
    'phone_number': '手机号',
    'name_optional': '姓名（可选）',
    'ordering_open': '点单已开放',
    'ordering_closed': '点单已关闭',
    'ordering_closed_wait': '点单已关闭，请等待通知',
    'hours': '小时',
    'minutes': '分钟',
    'seconds': '秒',
    'order_expired': '订单已过期',
    'pending_payment': '待付款',
    'paid': '已付款',
    'completed': '已完成',
    'cancelled': '已取消',
    'upload_payment': '上传付款截图',
    'view_orders': '查看订单',
    'no_orders': '暂无订单',
    'system_notice': '公告',
    'current_cycle_total': '当前周期总额',
    'current_discount': '当前折扣',
    'next_discount': '下一级折扣',
    'remaining_for_discount': '距离',
    'no_discount': '无折扣',
    'max_discount_reached': '已达到最大折扣',
    'no_discount_activity': '无折扣活动',
    'dashboard': '仪表盘',
    'products': '商品',
    'categories': '分类',
    'orders_management': '订单',
    'discount_rules': '折扣规则',
    'system_settings': '设置',
    'users': '用户',
    'admins': '管理员',
    'logs': '日志',
    'total_orders': '总订单数',
    'total_amount': '总金额',
    'total_discount': '总折扣',
    'current_cycle_info': '当前周期信息',
    'previous_cycle_info': '上一周期信息',
    'cycle_number': '周期编号',
    'start_time': '开始时间',
    'end_time': '结束时间',
    'in_progress': '进行中',
    'ended': '已结束',
    'confirmed': '已确认',
    'cycle_total_amount': '周期总金额',
    'discount_rate': '折扣率',
    'confirm_cycle': '确认周期并计算折扣',
    'no_active_cycle': '无活跃周期',
    'toggle_ordering': '开放点单',
    'close_ordering': '关闭点单',
    'ordering_status': '点单状态',
    'system_notice': '系统公告',
    'product_name': '商品名称',
    'product_price': '商品价格',
    'product_description': '商品描述',
    'category': '分类',
    'image': '图片',
    'active': '启用',
    'inactive': '禁用',
    'size': '杯型',
    'size_title': '杯型',
    'sugar_level': '甜度',
    'toppings': '加料',
    'toppings_title': '加料（可选多个）',
    'cup_size': '杯型',
    'sweetness': '甜度',
    'sweetness_title': '甜度',
    'ice_level_title': '冰度',
    'extra_toppings': '加料',
    'order_details': '订单详情',
    'customer_name': '客户姓名',
    'customer_phone': '客户电话',
    'order_number': '订单编号',
    'order_status': '订单状态',
    'payment_screenshot': '付款截图',
    'operation_logs': '操作日志',
    'operation_time': '操作时间',
    'operator': '操作员',
    'operation_type': '操作类型',
    'target_type': '目标类型',
    'operation_details': '操作详情',
    'ip_address': 'IP地址',
    
    // Toast messages
    'session_expired': '会话已过期，您已退出登录',
    'please_enter_phone': '请输入手机号',
    'phone_length_error': '手机号长度应在8-15位之间',
    'phone_format_error': '手机号只能包含数字和+号',
    'please_enter_code': '请输入验证码',
    'code_length_error': '验证码必须是6位数字',
    'login_success': '登录成功！',
    'login_failed': '登录失败',
    'login_failed_retry': '登录失败，请重试',
    'logged_out': '已退出',
    'please_enter_phone_first': '请先输入手机号',
    'sms_verification_required': '需要短信验证',
    'verification_code_sent': '验证码发送成功',
    'verification_code_dev': '验证码：{code}（仅开发环境）',
    'failed_send_code': '发送验证码失败',
    'failed_send_code_retry': '发送验证码失败，请重试',
    'please_select_specs': '请选择规格',
    'added_to_cart': '已加入购物车',
    'cart_empty': '购物车为空',
    'ordering_closed_warning': '点单已关闭',
    'processing_order': '正在处理您的订单，请稍候...',
    'order_submitted_success': '订单提交成功！订单号：{orderNumber}',
    'order_submission_failed': '订单提交失败',
    'order_submission_failed_retry': '订单提交失败，请重试',
    'order_deleted': '订单已删除',
    'delete_failed_retry': '删除失败，请重试',
    'please_select_payment': '请选择付款截图',
    'payment_upload_success': '付款截图上传成功！',
    'upload_failed_retry': '上传失败，请重试',
    
    // Status labels
    'status_pending': '待付款',
    'status_paid': '已付款',
    'status_completed': '已完成',
    'status_cancelled': '已取消',
    
    // Sugar level labels
    'sugar_zero': '无糖',
    'sugar_light': '微糖',
    'sugar_half': '半糖',
    'sugar_less': '少糖',
    'sugar_regular': '正常糖',
    'sugar_recommended': '（推荐）',
    
    // Ice level labels
    'ice_normal': '正常冰',
    'ice_less': '少冰',
    'ice_no': '去冰',
    'ice_room': '常温',
    'ice_hot': '热',
    
    // UI Labels
    'welcome_to_store': '欢迎来到 {storeName}',
    'discover_latest': '发现我们的最新创意',
    'new_products': '新品推荐',
    'order_now': '立即点单',
    'browse_menu': '浏览菜单',
    'my_orders': '我的订单',
    'view_history': '查看历史',
    'selected_items': '已选商品',
    'checkout': '结算',
    'home': '首页',
    'order': '点单',
    'profile': '我的',
    'no_products': '暂无商品',
    'no_products_chinese': '暂无商品',
    'ordering_open_welcome': '✅ 点单已开放，欢迎下单！',
    'ordering_closed_notification': '⚠️ 点单已关闭，请等待通知',
    'please_login_view_orders': '请登录以查看订单',
    'you_have_no_orders': '您还没有订单',
    'no_orders_chinese': '您还没有订单',
    'login_expired_please_login': '登录已过期，请重新登录',
    'failed_load_orders': '加载订单失败',
    'failed_load_orders_refresh': '加载订单失败，请刷新重试',
    'failed_load_orders_error': '加载订单失败：{error}',
    'network_error': '网络错误',
    'no_toppings_available': '此商品无可选加料',
    'no_images_available': '暂无图片',
    'failed_load_images': '加载图片失败',
    'zoom_percent': '{value}%',
    'user_chinese': '用户',
    'guest_chinese': '访客',
    'click_login_chinese': '点击登录',
    
    // Order details labels
    'order_number_label': '订单编号：',
    'cycle_id': '周期ID：',
    'cycle_time': '周期时间：',
    'ongoing': '进行中',
    'quantity_label': '数量：',
    'size_label': '杯型：',
    'sweetness_label': '甜度：',
    'toppings_label': '加料：',
    'ice_level_label': '冰度：',
    'price_breakdown': '价格明细：',
    'unit_price': '单价：',
    'original_price': '原价：',
    'discount_label': '折扣：',
    'final_amount_label': '实付金额：',
    'order_notes': '订单备注：',
    'delete_order': '删除订单',
    'upload_payment_screenshot': '上传付款截图',
    'wait_close_ordering': '请等待关闭点单并计算最终价格',
    'view_payment_screenshot': '查看付款截图',
    'delete_order_confirm': '删除订单',
    'delete_order_message': '您确定要删除此订单吗？此操作无法撤销。',
    'select': '选择',
    'closed': '已关闭',
    'starting_from': '起',
    'resend_code_in': '{seconds} 秒后重新发送验证码',
    'store_ordering_system': '{storeName} 点单系统',
    
    // Language switcher
    'language': '语言',
    'switch_language': '切换语言',
    
    // Cart labels
    'cart_title': '购物车',
    'size_label_colon': '杯型：',
    'sugar_label_colon': '甜度：',
    'ice_label_colon': '冰度：',
    'toppings_label_colon': '加料：',
    'default': '默认',
    'regular': '正常',
    'order_notes_optional': '订单备注（可选）',
    'order_notes_placeholder': '任何特殊要求或备注...',
    'total_label_colon': '总计：',
    'submit_order_button': '提交订单',
    'add_to_cart_button': '加入购物车',
    'upload_payment_screenshot_title': '上传付款截图',
    'select_payment_screenshot': '选择付款截图',
    'upload_button': '上传',
    'payment_screenshot_title': '付款截图',
    'zoom_label': '缩放：',
    
    // Login modal
    'login_to_continue': '登录以继续',
    'please_enter_phone_to_order': '请输入您的手机号以下单',
    'phone_number_required': '手机号 *',
    'enter_phone_number': '请输入手机号',
    'verification_code_required': '验证码 *',
    'enter_6_digit_code': '请输入6位验证码',
    'send_code': '发送验证码',
    'name_optional_label': '姓名（可选）',
    'leave_empty_or_enter_name': '留空或输入姓名',
    'loading': '加载中...'
  }
};

// Current language (default: 'en')
let currentLanguage = localStorage.getItem('language') || 'en';

// Translation function with placeholder support
function t(key, params) {
  const langTranslations = translations[currentLanguage] || translations.en;
  let text = langTranslations[key] || translations.en[key] || key;
  
  // Replace placeholders if params provided
  if (params && typeof params === 'object') {
    Object.keys(params).forEach(paramKey => {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), params[paramKey]);
    });
  }
  
  return text;
}

// Set language and update UI
function setLanguage(lang) {
  if (!translations[lang]) {
    console.warn(`Language ${lang} not supported, falling back to English`);
    lang = 'en';
  }
  
  currentLanguage = lang;
  localStorage.setItem('language', lang);
  
  // Clear localized text cache
  if (typeof clearLocalizedTextCache === 'function') {
    clearLocalizedTextCache();
  }
  
  // Apply translations to all data-i18n elements
  if (typeof applyTranslations === 'function') {
    applyTranslations();
  }
  
  // Re-render dynamic content
  if (typeof window !== 'undefined') {
    // Trigger re-render of categories
    if (typeof renderCategoryFilter === 'function') {
      renderCategoryFilter();
    }
    // Trigger re-render of products, orders, etc.
    if (typeof renderProducts === 'function' && products && products.length > 0) {
      renderProducts(products);
    }
    if (typeof loadOrders === 'function') {
      loadOrders();
    }
    if (typeof updateStoreName === 'function') {
      updateStoreName();
    }
    if (typeof updateLoginStatus === 'function') {
      updateLoginStatus();
    }
    // Update ordering status display
    if (typeof updateOrderingStatus === 'function') {
      updateOrderingStatus();
    }
    // Re-setup category scroll highlight after language change
    if (typeof setupCategoryScrollHighlight === 'function') {
      // 延迟一点执行，确保 DOM 已更新
      setTimeout(() => {
        setupCategoryScrollHighlight();
      }, 100);
    }
  }
}

// Get current language
function getLanguage() {
  return currentLanguage;
}

// Expose functions to window
if (typeof window !== 'undefined') {
  window.t = t;
  window.setLanguage = setLanguage;
  window.getLanguage = getLanguage;
}
