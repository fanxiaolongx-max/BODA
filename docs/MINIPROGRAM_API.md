# 小程序博客文章API使用指南

## 📋 概述

博客管理API现已支持小程序调用，通过API Token进行认证。所有接口同时支持：
- **Session认证**（浏览器访问）
- **API Token认证**（小程序/移动端访问）

## 🔑 认证方式

### API Token配置

1. 登录管理后台
2. 进入 **Settings（系统设置）**
3. 设置 `custom_api_token` 的值（例如：`your-secret-token-here`）
4. 保存配置

### Token使用方式

小程序可以通过以下三种方式传递Token：

1. **请求头 X-API-Token**（推荐）
   ```javascript
   header: {
     'X-API-Token': 'your-api-token'
   }
   ```

2. **请求头 Authorization: Bearer**
   ```javascript
   header: {
     'Authorization': 'Bearer your-api-token'
   }
   ```

3. **查询参数 token**
   ```
   /api/blog-admin/posts?token=your-api-token
   ```

## 📡 API接口列表

### 文章管理

#### 1. 获取文章列表

```javascript
GET /api/blog-admin/posts
```

#### 2. 获取单篇文章详情

```javascript
GET /api/blog-admin/posts/:id
```

**请求示例**：
```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts/6821e811-dce1-41a6-99aa-b547dfbc1594',
  method: 'GET',
  header: {
    'X-API-Token': 'your-api-token'
  },
  success: (res) => {
    console.log('文章详情', res.data);
  }
});
```

**响应示例**：
```json
{
  "success": true,
  "data": {
    "id": "6821e811-dce1-41a6-99aa-b547dfbc1594",
    "name": "文章标题",
    "title": "文章标题",
    "slug": "article-slug",
    "excerpt": "文章摘要",
    "description": "文章描述",
    "htmlContent": "<p>文章内容</p>",
    "image": "https://example.com/image.jpg",
    "category": "分类名称",
    "published": true,
    "views": 100,
    "createdAt": "2025-12-25T10:00:00+02:00",
    "updatedAt": "2025-12-25T10:00:00+02:00"
  }
}
```

#### 3. 创建文章

**请求示例**：
```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts',
  method: 'GET',
  header: {
    'X-API-Token': 'your-api-token'
  },
  success: (res) => {
    console.log('文章列表', res.data);
  }
});
```

**响应示例**：
```json
{
  "success": true,
  "data": [
    {
      "id": "6821e811-dce1-41a6-99aa-b547dfbc1594",
      "name": "文章标题",
      "title": "文章标题",
      "slug": "article-slug",
      "excerpt": "文章摘要",
      "description": "文章描述",
      "htmlContent": "<p>文章内容</p>",
      "image": "https://example.com/image.jpg",
      "category": "分类名称",
      "published": true,
      "views": 100,
      "createdAt": "2025-12-25T10:00:00+02:00",
      "updatedAt": "2025-12-25T10:00:00+02:00"
    }
  ],
  "total": 1
}
```

#### 2. 创建文章

```javascript
POST /api/blog-admin/posts
```

**请求参数**：
- `name` (必填) - 文章名称
- `apiName` (必填) - API名称（分类）
- `htmlContent` (可选) - HTML内容
- `slug` (可选) - URL友好的标识符
- `excerpt` (可选) - 摘要
- `description` (可选) - 描述
- `image` (可选) - 图片URL
- `category` (可选) - 分类
- `published` (可选) - 是否发布（默认false）
- `price` (可选) - 价格（二手市场/租房酒店，支持编辑和删除）
- `rooms` (可选) - 房间数（租房酒店，支持编辑和删除）
- `area` (可选) - 面积（租房酒店，支持编辑和删除）

**注意：** 二手市场和租房酒店字段支持完整的增删改操作，详细说明请参考 [二手市场和租房酒店字段操作指南](./MINIPROGRAM_SECONDHAND_RENTALS_API.md)
- `phone` (可选) - 电话（字符串，可为 `null` 删除）
- `address` (可选) - 地址（字符串，可为 `null` 删除）
- `latitude` (可选) - 纬度（数字，可为 `null` 删除）
- `longitude` (可选) - 经度（数字，可为 `null` 删除）

**注意：** 手机号和定位信息支持增删改操作，详细说明请参考 [手机号和定位信息操作指南](./MINIPROGRAM_PHONE_LOCATION_API.md)

**小程序用户和设备信息字段**：
- `nickname` (可选) - 用户昵称（字符串）
- `deviceModel` (可选) - 设备型号（字符串，如 "iPhone 13"）
- `deviceId` (可选) - 设备ID（字符串，可以是 deviceId / openid / uuid）
- `deviceIp` (可选) - 设备IP（字符串，如果不提供会自动从请求头获取）

**注意：** 小程序字段会自动存储到文章的 `custom_fields` 中，在获取文章详情时会自动返回这些字段。

**请求示例**：
```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts',
  method: 'POST',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    name: '我的文章标题',
    apiName: '二手市场 second-hand',
    htmlContent: '<p>这是文章内容</p>',
    excerpt: '这是文章摘要',
    image: 'https://example.com/image.jpg',
    published: true,
    price: 1000,
    // 小程序用户和设备信息（可选）
    nickname: '用户昵称',
    deviceModel: 'iPhone 13',
    deviceId: 'user-openid-or-uuid',
    deviceIp: '192.168.1.1' // 可选，不提供会自动获取
  },
  success: (res) => {
    console.log('创建成功', res.data);
  }
});
```

**响应示例**：
```json
{
  "success": true,
  "message": "文章创建成功",
  "data": {
    "id": "new-post-id",
    "name": "我的文章标题",
    "title": "我的文章标题",
    "slug": "my-article-title-new-post-id",
    ...
  }
}
```

#### 4. 更新文章

```javascript
PUT /api/blog-admin/posts/:id
```

**请求参数**：与创建文章相同，所有字段都是可选的

**请求示例**：
```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts/6821e811-dce1-41a6-99aa-b547dfbc1594',
  method: 'PUT',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    name: '更新后的标题',
    htmlContent: '<p>更新后的内容</p>',
    published: true
  },
  success: (res) => {
    console.log('更新成功', res.data);
  }
});
```

#### 5. 删除文章

```javascript
DELETE /api/blog-admin/posts/:id
```

**请求示例**：
```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts/6821e811-dce1-41a6-99aa-b547dfbc1594',
  method: 'DELETE',
  header: {
    'X-API-Token': 'your-api-token'
  },
  success: (res) => {
    console.log('删除成功', res.data);
  }
});
```

### 分类管理

#### 1. 获取分类列表

```javascript
GET /api/blog-admin/categories
```

#### 2. 创建分类

```javascript
POST /api/blog-admin/categories
```

**请求参数**：
- `name` (必填) - 分类名称
- `path` (可选) - 分类路径
- `description` (可选) - 描述

#### 3. 更新分类

```javascript
PUT /api/blog-admin/categories/:id
```

#### 4. 删除分类

```javascript
DELETE /api/blog-admin/categories/:id
```

### API列表

#### 1. 获取API列表

```javascript
GET /api/blog-admin/apis
```

**说明**：获取所有可用的API列表（用于文章分类选择）

#### 2. 获取字段映射配置

```javascript
GET /api/blog-admin/apis/:apiName/field-mapping
```

#### 3. 更新字段映射配置

```javascript
PUT /api/blog-admin/apis/:apiName/field-mapping
```

**请求参数**：
- `mapping` (必填) - 字段映射对象

## 🔒 错误处理

### 认证失败

**状态码**：401

**可能原因**：
- 没有传递 Token
- Token 无效
- Token 未配置

**响应示例**：
```json
{
  "success": false,
  "message": "需要身份验证。请提供有效的API Token（X-API-Token头或Authorization: Bearer）或登录Session",
  "code": "UNAUTHORIZED"
}
```

**注意**：如果小程序请求时没有传递 Token，服务器会返回 401。某些情况下，小程序可能会将其显示为 404 错误。请确保在请求头中正确传递 Token。

### Token无效

**状态码**：401

**响应示例**：
```json
{
  "success": false,
  "message": "API Token无效",
  "code": "UNAUTHORIZED"
}
```

### Token未配置

**状态码**：500

**响应示例**：
```json
{
  "success": false,
  "message": "API Token未配置",
  "code": "SERVER_ERROR"
}
```

### 参数验证失败

**状态码**：400

**响应示例**：
```json
{
  "success": false,
  "message": "验证失败",
  "errors": [
    {
      "msg": "文章名称不能为空",
      "param": "name",
      "location": "body"
    }
  ]
}
```

### 资源不存在

**状态码**：404

**响应示例**：
```json
{
  "success": false,
  "message": "文章不存在"
}
```

## 💡 最佳实践

### 1. Token安全

- ✅ 不要在客户端代码中硬编码Token
- ✅ 使用小程序云函数或后端代理来存储Token
- ✅ 定期更换Token
- ✅ 使用HTTPS传输

### 2. 错误处理

```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts',
  method: 'POST',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    name: '文章标题',
    apiName: '二手市场 second-hand'
  },
  success: (res) => {
    if (res.statusCode === 200 && res.data.success) {
      console.log('操作成功', res.data);
    } else {
      console.error('操作失败', res.data.message);
      wx.showToast({
        title: res.data.message || '操作失败',
        icon: 'none'
      });
    }
  },
  fail: (err) => {
    console.error('请求失败', err);
    wx.showToast({
      title: '网络错误',
      icon: 'none'
    });
  }
});
```

### 3. 封装请求函数

```javascript
// utils/api.js
const API_BASE_URL = 'https://your-domain.com/api/blog-admin';
const API_TOKEN = 'your-api-token'; // 应该从安全的地方获取

function request(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: API_BASE_URL + options.url,
      method: options.method || 'GET',
      header: {
        'Content-Type': 'application/json',
        'X-API-Token': API_TOKEN,
        ...options.header
      },
      data: options.data,
      success: (res) => {
        if (res.statusCode === 200) {
          resolve(res.data);
        } else {
          reject(new Error(res.data.message || '请求失败'));
        }
      },
      fail: reject
    });
  });
}

// 使用示例
async function createPost(postData) {
  try {
    const result = await request({
      url: '/posts',
      method: 'POST',
      data: postData
    });
    return result;
  } catch (error) {
    console.error('创建文章失败', error);
    throw error;
  }
}
```

## 📝 注意事项

1. **Token认证优先级**：如果同时提供Session和Token，优先使用Session认证
2. **操作日志**：使用Token认证时，操作日志中的 `admin_id` 字段会记录为 `'api-token'`
3. **向后兼容**：浏览器访问仍然可以使用Session认证，无需修改
4. **字段映射**：不同API可以使用不同的字段映射配置，详见字段映射API

## 🔗 相关文档

- [博客系统架构文档](BLOG_ARCHITECTURE.md) - 详细的系统架构说明
- [API文档](API.md) - 完整的API接口文档

---

**最后更新**：2025-12-25  
**版本**：v1.0.0

