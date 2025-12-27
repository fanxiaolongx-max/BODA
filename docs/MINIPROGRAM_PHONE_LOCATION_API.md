# 小程序文章API - 手机号和定位信息操作指南

## 📋 概述

小程序文章编辑和新建API完全支持对手机号和定位信息进行**增删改**操作。

## 🔑 API端点

### 创建文章
```
POST /api/blog-admin/posts
```

### 更新文章
```
PUT /api/blog-admin/posts/:id
```

## 📱 手机号和定位信息字段

### 字段列表

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `phone` | String | 否 | 手机号/电话号码 | `"+201234567890"` |
| `address` | String | 否 | 地址 | `"开罗市中心"` |
| `latitude` | Number | 否 | 纬度（浮点数） | `30.0444` |
| `longitude` | Number | 否 | 经度（浮点数） | `31.2357` |

## ✅ 操作说明

### 1. 添加/设置字段

**创建文章时添加：**
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
    apiName: '二手市场',
    htmlContent: '<p>这是文章内容</p>',
    // 添加手机号和定位信息
    phone: '+201234567890',
    address: '开罗市中心',
    latitude: 30.0444,
    longitude: 31.2357
  },
  success: (res) => {
    console.log('创建成功', res.data);
  }
});
```

**更新文章时添加：**
```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts/6821e811-dce1-41a6-99aa-b547dfbc1594',
  method: 'PUT',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    // 只更新定位信息
    phone: '+201234567890',
    address: '新开罗',
    latitude: 30.0131,
    longitude: 31.2089
  },
  success: (res) => {
    console.log('更新成功', res.data);
  }
});
```

### 2. 修改字段

**更新现有字段：**
```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts/6821e811-dce1-41a6-99aa-b547dfbc1594',
  method: 'PUT',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    // 修改手机号
    phone: '+201111111111',
    // 修改地址
    address: '亚历山大',
    // 修改坐标
    latitude: 31.2001,
    longitude: 29.9187
  },
  success: (res) => {
    console.log('更新成功', res.data);
  }
});
```

### 3. 删除字段

**方法1：设置为 `null`（推荐）**
```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts/6821e811-dce1-41a6-99aa-b547dfbc1594',
  method: 'PUT',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    // 删除手机号
    phone: null,
    // 删除地址
    address: null,
    // 删除定位坐标
    latitude: null,
    longitude: null
  },
  success: (res) => {
    console.log('删除成功', res.data);
  }
});
```

**方法2：设置为空字符串 `""`**
```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts/6821e811-dce1-41a6-99aa-b547dfbc1594',
  method: 'PUT',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    // 删除手机号（空字符串也会被删除）
    phone: '',
    // 删除地址
    address: '',
    // 删除定位坐标（空字符串也会被删除）
    latitude: '',
    longitude: ''
  },
  success: (res) => {
    console.log('删除成功', res.data);
  }
});
```

## 📝 字段格式要求

### phone（手机号）

**格式：**
- 类型：`String`
- 支持国际格式（建议包含国家代码）
- 可以为 `null` 或 `""` 来删除

**示例：**
```javascript
// ✅ 正确格式
phone: '+201234567890'      // 埃及手机号（带国家代码）
phone: '01234567890'        // 本地格式
phone: '+86 13800138000'    // 中国手机号
phone: null                 // 删除字段
phone: ''                   // 删除字段（空字符串）

// ❌ 错误格式（虽然不会报错，但不推荐）
phone: 201234567890         // 数字类型（会被转换为字符串）
```

### address（地址）

**格式：**
- 类型：`String`
- 可以是任何文本
- 可以为 `null` 或 `""` 来删除

**示例：**
```javascript
// ✅ 正确格式
address: '开罗市中心'
address: '新开罗，Nasr City'
address: '123 Main Street, Cairo'
address: null                // 删除字段
address: ''                 // 删除字段（空字符串）
```

### latitude（纬度）

**格式：**
- 类型：`Number`（浮点数）
- 范围：-90 到 90
- 可以为 `null` 或 `""` 来删除

**示例：**
```javascript
// ✅ 正确格式
latitude: 30.0444           // 开罗纬度
latitude: 31.2001           // 亚历山大纬度
latitude: null             // 删除字段
latitude: ''               // 删除字段（空字符串会被转换为null）

// ❌ 错误格式
latitude: '30.0444'        // 字符串（会被转换为数字，但不推荐）
```

### longitude（经度）

**格式：**
- 类型：`Number`（浮点数）
- 范围：-180 到 180
- 可以为 `null` 或 `""` 来删除

**示例：**
```javascript
// ✅ 正确格式
longitude: 31.2357         // 开罗经度
longitude: 29.9187         // 亚历山大经度
longitude: null            // 删除字段
longitude: ''              // 删除字段（空字符串会被转换为null）

// ❌ 错误格式
longitude: '31.2357'       // 字符串（会被转换为数字，但不推荐）
```

## 🔄 完整示例

### 示例1：创建带定位信息的文章

```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts',
  method: 'POST',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    name: '二手iPhone 13',
    apiName: '二手市场',
    htmlContent: '<p>出售二手iPhone 13，9成新</p>',
    excerpt: '出售二手iPhone 13',
    image: 'https://example.com/iphone.jpg',
    published: true,
    price: 5000,
    // 联系方式和定位信息
    phone: '+201234567890',
    address: '开罗市中心，Tahrir Square',
    latitude: 30.0444,
    longitude: 31.2357
  },
  success: (res) => {
    console.log('创建成功', res.data);
  },
  fail: (err) => {
    console.error('创建失败', err);
  }
});
```

### 示例2：更新定位信息

```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts/6821e811-dce1-41a6-99aa-b547dfbc1594',
  method: 'PUT',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    // 更新手机号
    phone: '+201111111111',
    // 更新地址
    address: '新开罗，Nasr City',
    // 更新坐标
    latitude: 30.0131,
    longitude: 31.2089
  },
  success: (res) => {
    console.log('更新成功', res.data);
  }
});
```

### 示例3：删除所有定位信息

```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts/6821e811-dce1-41a6-99aa-b547dfbc1594',
  method: 'PUT',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    // 删除所有定位和联系方式字段
    phone: null,
    address: null,
    latitude: null,
    longitude: null
  },
  success: (res) => {
    console.log('删除成功', res.data);
  }
});
```

### 示例4：部分更新（只更新手机号）

```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts/6821e811-dce1-41a6-99aa-b547dfbc1594',
  method: 'PUT',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    // 只更新手机号，其他字段不变
    phone: '+201999999999'
  },
  success: (res) => {
    console.log('更新成功', res.data);
  }
});
```

## 📊 响应格式

### 成功响应

```json
{
  "success": true,
  "message": "文章更新成功",
  "data": {
    "id": "6821e811-dce1-41a6-99aa-b547dfbc1594",
    "name": "我的文章标题",
    "title": "我的文章标题",
    "slug": "my-article-title",
    "phone": "+201234567890",
    "address": "开罗市中心",
    "latitude": 30.0444,
    "longitude": 31.2357,
    "createdAt": "2025-12-26T10:00:00+02:00",
    "updatedAt": "2025-12-26T10:00:00+02:00"
  }
}
```

### 删除字段后的响应

```json
{
  "success": true,
  "message": "文章更新成功",
  "data": {
    "id": "6821e811-dce1-41a6-99aa-b547dfbc1594",
    "name": "我的文章标题",
    "phone": null,
    "address": null,
    "latitude": null,
    "longitude": null
  }
}
```

## ⚠️ 注意事项

1. **字段可选性：**
   - 所有定位和联系方式字段都是**可选的**
   - 创建文章时可以不提供这些字段
   - 更新文章时只提供需要修改的字段即可

2. **删除字段：**
   - 更新时传入 `null` 或空字符串 `""` 会删除该字段
   - 删除后字段值变为 `null`
   - 不提供字段则不会修改现有值

3. **数据类型：**
   - `latitude` 和 `longitude` 必须是数字类型（浮点数）
   - 字符串会被自动转换为数字，但不推荐
   - `phone` 和 `address` 必须是字符串类型

4. **坐标范围：**
   - `latitude`（纬度）：-90 到 90
   - `longitude`（经度）：-180 到 180
   - 超出范围的值可能导致错误

5. **部分更新：**
   - 更新API支持部分字段更新
   - 只提供需要修改的字段即可
   - 未提供的字段保持不变

## 🔍 常见问题

### Q1: 如何只更新手机号，不改变其他字段？

**A:** 只提供 `phone` 字段即可：
```javascript
data: {
  phone: '+201234567890'
}
```

### Q2: 如何删除手机号但保留地址？

**A:** 明确设置 `phone` 为 `null`，不提供 `address`：
```javascript
data: {
  phone: null
  // 不提供 address，地址保持不变
}
```

### Q3: 坐标必须是小数吗？

**A:** 是的，`latitude` 和 `longitude` 必须是数字类型（浮点数）。字符串会被转换，但不推荐。

### Q4: 手机号格式有要求吗？

**A:** 没有严格格式要求，但建议使用国际格式（包含国家代码），例如：`+201234567890`。

### Q5: 可以同时添加和删除不同字段吗？

**A:** 可以。例如：
```javascript
data: {
  phone: '+201234567890',    // 添加/更新手机号
  address: null              // 删除地址
}
```

## 📚 相关文档

- [小程序API使用指南](./MINIPROGRAM_API.md) - 完整的API文档
- [博客架构说明](./BLOG_ARCHITECTURE.md) - 数据库结构说明

