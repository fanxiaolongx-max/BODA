# 小程序登录和注册API使用指南

## 📋 概述

小程序登录和注册API采用**手机号 + PIN码**或**手机号 + 验证码 + PIN码**的方式进行认证。系统**没有单独的注册API**，新用户首次登录时会自动创建账户。

## 🔑 认证流程

### 方式1：PIN码登录（推荐，无需短信）

```
1. 用户输入手机号和PIN码
2. 调用登录API
3. 如果是新用户，自动创建账户
4. 返回用户信息
```

### 方式2：验证码登录（需要短信服务）

```
1. 用户输入手机号
2. 调用发送验证码API
3. 用户输入收到的验证码和PIN码
4. 调用验证码登录API
5. 如果是新用户，自动创建账户
6. 返回用户信息
```

## 📡 API接口列表

### 1. 发送验证码

**端点：** `POST /api/auth/sms/send`

**请求参数：**
- `phone` (必填) - 手机号（8-15位数字，支持国际格式）
- `type` (可选) - 验证码类型，默认 `'login'`，可选值：`'login'`, `'register'`, `'reset'`

**请求示例：**
```javascript
wx.request({
  url: 'https://your-domain.com/api/auth/sms/send',
  method: 'POST',
  header: {
    'Content-Type': 'application/json'
  },
  data: {
    phone: '+201234567890',
    type: 'login'
  },
  success: (res) => {
    console.log('验证码发送成功', res.data);
    // 开发环境会返回验证码（仅用于测试）
    if (res.data.code) {
      console.log('验证码:', res.data.code);
    }
  }
});
```

**响应示例：**
```json
{
  "success": true,
  "message": "验证码已发送",
  "code": "123456"  // 仅开发环境返回
}
```

**错误响应：**
```json
{
  "success": false,
  "message": "SMS verification is not enabled"  // 短信服务未启用
}
```

### 2. PIN码登录（自动注册）

**端点：** `POST /api/auth/user/login`

**请求参数：**
- `phone` (必填) - 手机号（8-15位数字，支持国际格式）
- `pin` (必填) - 4位数字PIN码
- `name` (可选) - 用户姓名（最多50个字符）

**请求示例：**

**新用户注册（首次登录）：**
```javascript
wx.request({
  url: 'https://your-domain.com/api/auth/user/login',
  method: 'POST',
  header: {
    'Content-Type': 'application/json'
  },
  data: {
    phone: '+201234567890',
    pin: '1234',  // 新用户设置PIN码
    name: '张三'   // 可选
  },
  success: (res) => {
    if (res.data.success) {
      console.log('注册/登录成功', res.data.user);
      // 保存用户信息到本地存储
      wx.setStorageSync('user', res.data.user);
    }
  },
  fail: (err) => {
    console.error('登录失败', err);
  }
});
```

**现有用户登录：**
```javascript
wx.request({
  url: 'https://your-domain.com/api/auth/user/login',
  method: 'POST',
  header: {
    'Content-Type': 'application/json'
  },
  data: {
    phone: '+201234567890',
    pin: '1234'  // 已设置的PIN码
  },
  success: (res) => {
    if (res.data.success) {
      console.log('登录成功', res.data.user);
      wx.setStorageSync('user', res.data.user);
    }
  }
});
```

**响应示例：**
```json
{
  "success": true,
  "message": "登录成功",
  "user": {
    "id": 1,
    "phone": "+201234567890",
    "name": "张三"
  },
  "token": "a1b2c3d4e5f6..."  // 用户Token（小程序需要使用）
}
```

**小程序登录后保存Token：**
```javascript
wx.request({
  url: 'https://your-domain.com/api/auth/user/login',
  method: 'POST',
  header: {
    'Content-Type': 'application/json'
  },
  data: {
    phone: '+201234567890',
    pin: '1234',
    name: '张三'
  },
  success: (res) => {
    if (res.data.success) {
      // 保存用户信息和Token
      wx.setStorageSync('user', res.data.user);
      wx.setStorageSync('userToken', res.data.token);  // 保存Token
      console.log('登录成功', res.data.user);
    }
  }
});
```

**错误响应：**

**新用户未提供PIN：**
```json
{
  "success": false,
  "message": "New user must set PIN",
  "requiresPinSetup": true
}
```

**PIN格式错误：**
```json
{
  "success": false,
  "message": "PIN must be 4 digits"
}
```

**PIN错误：**
```json
{
  "success": false,
  "message": "Incorrect PIN"
}
```

**账户被锁定：**
```json
{
  "success": false,
  "message": "Too many failed login attempts. Account is locked. Please try again in 1 hour(s) and 30 minute(s).",
  "lockedUntil": "2025-12-26T19:00:00.000Z"
}
```

**需要验证码登录：**
```json
{
  "success": false,
  "message": "SMS verification is required. Please use login-with-code endpoint.",
  "requiresCode": true
}
```

### 3. 验证码登录（自动注册）

**端点：** `POST /api/auth/user/login-with-code`

**请求参数：**
- `phone` (必填) - 手机号（8-15位数字，支持国际格式）
- `code` (必填) - 验证码（6位数字）
- `pin` (必填) - 4位数字PIN码
- `name` (可选) - 用户姓名（最多50个字符）

**请求示例：**

**新用户注册（验证码+PIN）：**
```javascript
wx.request({
  url: 'https://your-domain.com/api/auth/user/login-with-code',
  method: 'POST',
  header: {
    'Content-Type': 'application/json'
  },
  data: {
    phone: '+201234567890',
    code: '123456',  // 收到的验证码
    pin: '1234',     // 新用户设置PIN码
    name: '张三'      // 可选
  },
  success: (res) => {
    if (res.data.success) {
      console.log('注册/登录成功', res.data.user);
      wx.setStorageSync('user', res.data.user);
    }
  }
});
```

**现有用户登录：**
```javascript
wx.request({
  url: 'https://your-domain.com/api/auth/user/login-with-code',
  method: 'POST',
  header: {
    'Content-Type': 'application/json'
  },
  data: {
    phone: '+201234567890',
    code: '123456',  // 收到的验证码
    pin: '1234'      // 已设置的PIN码
  },
  success: (res) => {
    if (res.data.success) {
      console.log('登录成功', res.data.user);
      wx.setStorageSync('user', res.data.user);
    }
  }
});
```

**响应示例：**
```json
{
  "success": true,
  "message": "登录成功",
  "user": {
    "id": 1,
    "phone": "+201234567890",
    "name": "张三"
  },
  "token": "a1b2c3d4e5f6..."  // 用户Token（小程序需要使用）
}
```

**小程序登录后保存Token：**
```javascript
wx.request({
  url: 'https://your-domain.com/api/auth/user/login',
  method: 'POST',
  header: {
    'Content-Type': 'application/json'
  },
  data: {
    phone: '+201234567890',
    pin: '1234',
    name: '张三'
  },
  success: (res) => {
    if (res.data.success) {
      // 保存用户信息和Token
      wx.setStorageSync('user', res.data.user);
      wx.setStorageSync('userToken', res.data.token);  // 保存Token
      console.log('登录成功', res.data.user);
    }
  }
});
```

**错误响应：**

**验证码错误：**
```json
{
  "success": false,
  "message": "Invalid or expired verification code"
}
```

**新用户未提供PIN：**
```json
{
  "success": false,
  "message": "New user must set PIN",
  "requiresPinSetup": true
}
```

### 4. 检查PIN状态

**端点：** `POST /api/auth/user/check-pin-status`

**请求参数：**
- `phone` (必填) - 手机号

**请求示例：**
```javascript
wx.request({
  url: 'https://your-domain.com/api/auth/user/check-pin-status',
  method: 'POST',
  header: {
    'Content-Type': 'application/json'
  },
  data: {
    phone: '+201234567890'
  },
  success: (res) => {
    if (res.data.requiresPinSetup) {
      console.log('需要设置PIN码');
    } else {
      console.log('用户已设置PIN码');
    }
  }
});
```

**响应示例：**
```json
{
  "success": true,
  "requiresPinSetup": false,  // true表示需要设置PIN
  "userExists": true           // 用户是否存在
}
```

### 5. 用户登出

**端点：** `POST /api/auth/user/logout`

**请求示例：**
```javascript
wx.request({
  url: 'https://your-domain.com/api/auth/user/logout',
  method: 'POST',
  success: (res) => {
    if (res.data.success) {
      console.log('登出成功');
      // 清除本地存储的用户信息
      wx.removeStorageSync('user');
    }
  }
});
```

**响应示例：**
```json
{
  "success": true,
  "message": "登出成功"
}
```

### 6. 获取当前用户信息

**端点：** `GET /api/auth/user/me`

**认证方式：**
小程序需要使用 Token 认证（因为小程序不支持 Cookie）。Token 可以通过以下方式传递：

1. **请求头 X-User-Token**（推荐）
   ```javascript
   header: {
     'X-User-Token': 'your-user-token'
   }
   ```

2. **请求头 Authorization: Bearer**
   ```javascript
   header: {
     'Authorization': 'Bearer your-user-token'
   }
   ```

3. **查询参数 token**
   ```
   /api/auth/user/me?token=your-user-token
   ```

**请求示例：**
```javascript
// 从本地存储获取Token
const token = wx.getStorageSync('userToken');

wx.request({
  url: 'https://your-domain.com/api/auth/user/me',
  method: 'GET',
  header: {
    'X-User-Token': token  // 使用Token认证
  },
  success: (res) => {
    if (res.data.success) {
      console.log('当前用户', res.data.user);
    } else {
      console.log('未登录');
      // Token可能已过期，清除本地Token
      wx.removeStorageSync('userToken');
    }
  }
});
```

**响应示例：**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "phone": "+201234567890",
    "name": "张三",
    "created_at": "2025-12-26T10:00:00+02:00"
  }
}
```

**未登录响应：**
```json
{
  "success": false,
  "message": "Please login first"
}
```

## 📝 字段格式要求

### phone（手机号）

**格式：**
- 类型：`String`
- 长度：8-15位数字
- 支持国际格式（建议包含国家代码）
- 示例：`"+201234567890"`, `"01234567890"`, `"13800138000"`

### pin（PIN码）

**格式：**
- 类型：`String`
- 长度：必须是4位数字
- 示例：`"1234"`, `"0000"`, `"9999"`

**注意：** PIN码是加密存储的，不会明文返回

### code（验证码）

**格式：**
- 类型：`String`
- 长度：6位数字
- 有效期：通常5-10分钟（根据配置）
- 示例：`"123456"`

### name（姓名）

**格式：**
- 类型：`String`
- 最大长度：50个字符
- 可选字段
- 示例：`"张三"`, `"John Doe"`

## 🔄 完整登录流程示例

### 方式1：PIN码登录流程

```javascript
// 1. 用户输入手机号和PIN码
const phone = '+201234567890';
const pin = '1234';
const name = '张三';  // 可选

// 2. 调用登录API
wx.request({
  url: 'https://your-domain.com/api/auth/user/login',
  method: 'POST',
  header: {
    'Content-Type': 'application/json'
  },
  data: {
    phone: phone,
    pin: pin,
    name: name
  },
  success: (res) => {
    if (res.data.success) {
      // 3. 登录成功，保存用户信息
      const user = res.data.user;
      wx.setStorageSync('user', user);
      wx.setStorageSync('userId', user.id);
      
      // 4. 跳转到主页
      wx.switchTab({
        url: '/pages/index/index'
      });
    } else {
      // 处理错误
      if (res.data.requiresPinSetup) {
        // 新用户需要设置PIN
        wx.showModal({
          title: '提示',
          content: '请设置4位PIN码',
          showCancel: false
        });
      } else if (res.data.requiresCode) {
        // 需要验证码登录
        wx.showModal({
          title: '提示',
          content: '请使用验证码登录',
          showCancel: false
        });
      } else {
        wx.showToast({
          title: res.data.message || '登录失败',
          icon: 'none'
        });
      }
    }
  },
  fail: (err) => {
    wx.showToast({
      title: '网络错误',
      icon: 'none'
    });
  }
});
```

### 方式2：验证码登录流程

```javascript
let countdown = 60;  // 倒计时秒数

// 1. 发送验证码
function sendCode() {
  wx.request({
    url: 'https://your-domain.com/api/auth/sms/send',
    method: 'POST',
    header: {
      'Content-Type': 'application/json'
    },
    data: {
      phone: '+201234567890',
      type: 'login'
    },
    success: (res) => {
      if (res.data.success) {
        wx.showToast({
          title: '验证码已发送',
          icon: 'success'
        });
        
        // 开始倒计时
        startCountdown();
        
        // 开发环境显示验证码
        if (res.data.code) {
          console.log('验证码:', res.data.code);
        }
      } else {
        wx.showToast({
          title: res.data.message || '发送失败',
          icon: 'none'
        });
      }
    }
  });
}

// 2. 倒计时函数
function startCountdown() {
  const timer = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(timer);
      countdown = 60;
    }
    // 更新UI显示倒计时
  }, 1000);
}

// 3. 验证码登录
function loginWithCode() {
  wx.request({
    url: 'https://your-domain.com/api/auth/user/login-with-code',
    method: 'POST',
    header: {
      'Content-Type': 'application/json'
    },
    data: {
      phone: '+201234567890',
      code: '123456',  // 用户输入的验证码
      pin: '1234',     // 用户输入的PIN码
      name: '张三'      // 可选
    },
    success: (res) => {
      if (res.data.success) {
        // 登录成功
        const user = res.data.user;
        wx.setStorageSync('user', user);
        wx.setStorageSync('userId', user.id);
        
        wx.switchTab({
          url: '/pages/index/index'
        });
      } else {
        wx.showToast({
          title: res.data.message || '登录失败',
          icon: 'none'
        });
      }
    }
  });
}
```

## ⚠️ 重要说明

### 1. 自动注册机制

- **没有单独的注册API**
- 新用户首次登录时会自动创建账户
- 新用户必须提供PIN码才能完成注册
- 如果用户已存在，则进行登录验证

### 2. PIN码要求

- **新用户**：必须设置4位数字PIN码
- **现有用户**：必须提供正确的PIN码
- PIN码是加密存储的，不会明文传输或返回
- PIN码错误多次会导致账户锁定

### 3. 验证码登录

- 需要先调用发送验证码API
- 验证码有效期通常为5-10分钟
- 验证码登录也需要提供PIN码
- 如果短信服务未启用，会要求使用PIN码登录

### 4. 账户安全

- **IP限制**：多次失败登录会锁定IP
- **账户锁定**：PIN码错误多次会锁定账户
- **渐进延迟**：失败次数越多，延迟时间越长
- **Session管理**：浏览器访问使用Session Cookie保持登录状态
- **Token管理**：小程序访问使用Token保持登录状态，Token有过期时间

### 5. 登录状态保持

**浏览器访问：**
- 登录成功后，服务器会设置Session Cookie
- 浏览器会自动携带Cookie
- 使用 `GET /api/auth/user/me` 检查登录状态
- Session有过期时间（默认2小时），过期后需要重新登录

**小程序访问：**
- 登录成功后，服务器会返回用户Token（`token`字段）
- **小程序必须保存Token到本地存储**
- 后续请求需要在请求头中携带Token：
  - `X-User-Token: your-token`
  - 或 `Authorization: Bearer your-token`
- Token有过期时间（默认2小时），过期后需要重新登录
- 使用 `GET /api/auth/user/me` 检查登录状态（需要携带Token）

## 🔍 错误处理

### 常见错误码

| HTTP状态码 | 错误信息 | 说明 |
|-----------|---------|------|
| 400 | `New user must set PIN` | 新用户未提供PIN码 |
| 400 | `PIN must be 4 digits` | PIN码格式错误 |
| 400 | `PIN is required` | 现有用户未提供PIN码 |
| 400 | `Invalid or expired verification code` | 验证码错误或过期 |
| 400 | `SMS verification is required` | 需要验证码登录 |
| 401 | `Incorrect PIN` | PIN码错误 |
| 403 | `Account is locked` | 账户被锁定 |
| 403 | `IP blocked` | IP被阻止 |

### 错误处理示例

```javascript
wx.request({
  url: 'https://your-domain.com/api/auth/user/login',
  method: 'POST',
  header: {
    'Content-Type': 'application/json'
  },
  data: {
    phone: '+201234567890',
    pin: '1234'
  },
  success: (res) => {
    if (res.data.success) {
      // 登录成功
      handleLoginSuccess(res.data.user);
    } else {
      // 处理错误
      handleLoginError(res.data);
    }
  }
});

function handleLoginError(error) {
  if (error.requiresPinSetup) {
    // 需要设置PIN码
    wx.showModal({
      title: '设置PIN码',
      content: '请设置4位数字PIN码',
      showCancel: false
    });
  } else if (error.requiresCode) {
    // 需要验证码登录
    wx.showModal({
      title: '提示',
      content: '请使用验证码登录',
      showCancel: false
    });
  } else if (error.lockedUntil) {
    // 账户被锁定
    const lockedUntil = new Date(error.lockedUntil);
    const now = new Date();
    const minutes = Math.ceil((lockedUntil - now) / 60000);
    
    wx.showModal({
      title: '账户已锁定',
      content: `账户已被锁定，请在${minutes}分钟后重试`,
      showCancel: false
    });
  } else {
    // 其他错误
    wx.showToast({
      title: error.message || '登录失败',
      icon: 'none'
    });
  }
}
```

## 📚 相关文档

- [API接口文档](./API.md) - 完整的API文档
- [小程序博客文章API](./MINIPROGRAM_API.md) - 博客文章API使用指南

