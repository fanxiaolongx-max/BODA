# 小程序文章API - 二手市场和租房酒店字段操作指南

## 📋 概述

小程序文章API完全支持二手市场和租房酒店的特殊字段编辑，包括价格、房间数、面积等。

## 🏷️ 字段说明

### 二手市场（second-hand）字段

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `price` | Number/String | 否 | 价格 | `1000` 或 `"1000"` |
| `phone` | String | 否 | 手机号 | `"+201234567890"` |
| `address` | String | 否 | 地址 | `"开罗市中心"` |
| `latitude` | Number | 否 | 纬度 | `30.0444` |
| `longitude` | Number | 否 | 经度 | `31.2357` |

### 租房酒店（rentals）字段

| 字段名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `price` | Number/String | 否 | 价格 | `3500` 或 `"3500"` |
| `rooms` | Number/String | 否 | 房间数 | `2` 或 `"2"` |
| `area` | Number/String | 否 | 面积（平方米） | `80` 或 `"80"` |
| `views` | Number | 否 | 浏览次数 | `100` |
| `phone` | String | 否 | 手机号 | `"+201234567890"` |
| `address` | String | 否 | 地址 | `"新开罗"` |
| `latitude` | Number | 否 | 纬度 | `30.0131` |
| `longitude` | Number | 否 | 经度 | `31.2089` |

## ✅ 操作说明

### 1. 创建文章时添加字段

#### 二手市场示例

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
    published: true,
    // 二手市场字段
    price: 5000,
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

#### 租房酒店示例

```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts',
  method: 'POST',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    name: '新开罗2室1厅公寓出租',
    apiName: '租房酒店',
    htmlContent: '<p>新开罗2室1厅公寓，精装修，交通便利</p>',
    excerpt: '新开罗2室1厅公寓出租',
    published: true,
    // 租房酒店字段
    price: 3500,
    rooms: 2,
    area: 80,
    views: 0,
    phone: '+201234567890',
    address: '新开罗，Nasr City',
    latitude: 30.0131,
    longitude: 31.2089
  },
  success: (res) => {
    console.log('创建成功', res.data);
  }
});
```

### 2. 更新字段

#### 更新二手市场价格

```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts/6821e811-dce1-41a6-99aa-b547dfbc1594',
  method: 'PUT',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    // 只更新价格
    price: 4500
  },
  success: (res) => {
    console.log('更新成功', res.data);
  }
});
```

#### 更新租房酒店价格、房间数、面积

```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts/6821e811-dce1-41a6-99aa-b547dfbc1594',
  method: 'PUT',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    // 更新价格
    price: 4000,
    // 更新房间数
    rooms: 3,
    // 更新面积
    area: 100
  },
  success: (res) => {
    console.log('更新成功', res.data);
  }
});
```

#### 部分更新（只更新价格）

```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts/6821e811-dce1-41a6-99aa-b547dfbc1594',
  method: 'PUT',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    // 只更新价格，房间数和面积保持不变
    price: 3800
  },
  success: (res) => {
    console.log('更新成功', res.data);
  }
});
```

### 3. 删除字段

**注意：** `price`、`rooms`、`area` 字段可以通过设置为 `null` 来删除：

```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts/6821e811-dce1-41a6-99aa-b547dfbc1594',
  method: 'PUT',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    // 删除价格
    price: null,
    // 删除房间数（租房酒店）
    rooms: null,
    // 删除面积（租房酒店）
    area: null
  },
  success: (res) => {
    console.log('删除成功', res.data);
  }
});
```

## 📝 字段格式要求

### price（价格）

**格式：**
- 类型：`Number` 或 `String`
- 可以是数字或字符串（字符串会被转换为数字）
- 可以为 `null` 来删除

**示例：**
```javascript
// ✅ 正确格式
price: 5000              // 数字
price: '5000'            // 字符串（会被转换为数字）
price: 3500.5            // 小数
price: null              // 删除字段

// ❌ 不推荐
price: 'abc'             // 非数字字符串（可能导致错误）
```

### rooms（房间数）

**格式：**
- 类型：`Number` 或 `String`
- 通常是整数
- 可以为 `null` 来删除

**示例：**
```javascript
// ✅ 正确格式
rooms: 2                 // 数字
rooms: '2'               // 字符串（会被转换为数字）
rooms: 3                 // 整数
rooms: null              // 删除字段

// ❌ 不推荐
rooms: 2.5               // 小数（虽然可以，但不常见）
```

### area（面积）

**格式：**
- 类型：`Number` 或 `String`
- 单位：平方米
- 可以是整数或小数
- 可以为 `null` 来删除

**示例：**
```javascript
// ✅ 正确格式
area: 80                 // 数字
area: '80'               // 字符串（会被转换为数字）
area: 80.5               // 小数
area: null               // 删除字段
```

### views（浏览次数）

**格式：**
- 类型：`Number`
- 必须是整数
- 可选字段

**示例：**
```javascript
// ✅ 正确格式
views: 100               // 数字
views: 0                 // 初始值
views: 1000              // 大数字
```

## 🔄 完整示例

### 示例1：创建二手市场文章

```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts',
  method: 'POST',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    name: '二手MacBook Pro',
    apiName: '二手市场',
    htmlContent: '<p>出售二手MacBook Pro 2021款，16寸，M1 Pro芯片</p>',
    excerpt: '出售二手MacBook Pro',
    image: 'https://example.com/macbook.jpg',
    published: true,
    price: 15000,
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

### 示例2：更新租房酒店信息

```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts/6821e811-dce1-41a6-99aa-b547dfbc1594',
  method: 'PUT',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    // 更新价格
    price: 4000,
    // 更新房间数
    rooms: 3,
    // 更新面积
    area: 120,
    // 更新地址
    address: '新开罗，Madinaty',
    // 更新坐标
    latitude: 30.0131,
    longitude: 31.2089
  },
  success: (res) => {
    console.log('更新成功', res.data);
  }
});
```

### 示例3：只更新价格

```javascript
wx.request({
  url: 'https://your-domain.com/api/blog-admin/posts/6821e811-dce1-41a6-99aa-b547dfbc1594',
  method: 'PUT',
  header: {
    'Content-Type': 'application/json',
    'X-API-Token': 'your-api-token'
  },
  data: {
    // 只更新价格，其他字段不变
    price: 3200
  },
  success: (res) => {
    console.log('价格更新成功', res.data);
  }
});
```

## 📊 响应格式

### 成功响应（二手市场）

```json
{
  "success": true,
  "message": "文章更新成功",
  "data": {
    "id": "6821e811-dce1-41a6-99aa-b547dfbc1594",
    "name": "二手iPhone 13",
    "price": 5000,
    "phone": "+201234567890",
    "address": "开罗市中心",
    "latitude": 30.0444,
    "longitude": 31.2357,
    "createdAt": "2025-12-26T10:00:00+02:00",
    "updatedAt": "2025-12-26T10:00:00+02:00"
  }
}
```

### 成功响应（租房酒店）

```json
{
  "success": true,
  "message": "文章更新成功",
  "data": {
    "id": "6821e811-dce1-41a6-99aa-b547dfbc1594",
    "name": "新开罗2室1厅公寓出租",
    "price": 3500,
    "rooms": 2,
    "area": 80,
    "views": 100,
    "phone": "+201234567890",
    "address": "新开罗，Nasr City",
    "latitude": 30.0131,
    "longitude": 31.2089,
    "createdAt": "2025-12-26T10:00:00+02:00",
    "updatedAt": "2025-12-26T10:00:00+02:00"
  }
}
```

## ⚠️ 注意事项

1. **字段可选性：**
   - 所有字段都是**可选的**
   - 创建和更新时可以不提供某些字段
   - 更新时只提供需要修改的字段即可

2. **数据类型：**
   - `price`、`rooms`、`area` 可以是数字或字符串
   - 字符串会被自动转换为数字
   - `views` 必须是数字类型

3. **部分更新：**
   - 更新API支持部分字段更新
   - 只提供需要修改的字段即可
   - 未提供的字段保持不变

4. **删除字段：**
   - 设置为 `null` 可以删除字段
   - 删除后字段值变为 `null`

5. **字段组合：**
   - 二手市场：主要使用 `price` + 定位信息
   - 租房酒店：主要使用 `price` + `rooms` + `area` + 定位信息

## 🔍 常见问题

### Q1: 二手市场可以只更新价格吗？

**A:** 可以。只提供 `price` 字段即可：
```javascript
data: {
  price: 4500
}
```

### Q2: 租房酒店可以只更新房间数吗？

**A:** 可以。只提供 `rooms` 字段即可：
```javascript
data: {
  rooms: 3
}
```

### Q3: 可以同时更新价格、房间数和面积吗？

**A:** 可以。同时提供多个字段：
```javascript
data: {
  price: 4000,
  rooms: 3,
  area: 100
}
```

### Q4: 价格可以是小数吗？

**A:** 可以。`price` 和 `area` 支持小数：
```javascript
price: 3500.5,
area: 80.5
```

### Q5: 如何删除价格字段？

**A:** 设置为 `null`：
```javascript
data: {
  price: null
}
```

## 📚 相关文档

- [小程序API使用指南](./MINIPROGRAM_API.md) - 完整的API文档
- [手机号和定位信息操作指南](./MINIPROGRAM_PHONE_LOCATION_API.md) - 定位信息操作说明
- [博客架构说明](./BLOG_ARCHITECTURE.md) - 数据库结构说明

