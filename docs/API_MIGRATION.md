# API迁移文档

## 概述

以下自定义API已被停用，数据已迁移到博客文章系统。请使用新的博客文章API作为替代。

## 已停用的API

| 原API | 状态 | 替代方案 |
|-------|------|----------|
| `GET /api/custom/second-hand` | 已停用 | `GET /api/blog/posts?category=二手市场` |
| `GET /api/custom/exchange-rate` | 已停用 | `GET /api/blog/posts?category=汇率转换` |
| `GET /api/custom/weather` | 已停用 | `GET /api/blog/posts?category=天气路况` |
| `GET /api/custom/translation` | 已停用 | `GET /api/blog/posts?category=翻译卡片` |
| `GET /api/custom/feedback` | 已停用 | `POST /api/user/feedback` |

## 替代API详细说明

### 1. 二手集市 (`/api/custom/second-hand`)

#### 原API（已停用）
```http
GET /api/custom/second-hand
```

#### 替代API

**获取列表：**
```http
GET /api/blog/posts?category=二手市场
GET /api/blog/posts?category=second-hand
```

**获取详情：**
```http
GET /api/blog/posts/:slug
```

**示例：**
```javascript
// 获取二手市场文章列表
const response = await fetch('/api/blog/posts?category=二手市场');
const data = await response.json();
// data.data 包含文章列表

// 获取特定文章详情
const postSlug = 'chu-er-shou-san-xing-xian-shi-qi-6821e811';
const detailResponse = await fetch(`/api/blog/posts/${postSlug}`);
const postData = await detailResponse.json();
// postData.data 包含文章详情
```

**响应格式：**
```json
{
  "success": true,
  "data": [
    {
      "id": "6821e811-dce1-41a6-99aa-b547dfbc1594",
      "name": "出二手三星显示器",
      "title": "出二手三星显示器",
      "slug": "chu-er-shou-san-xing-xian-shi-qi-6821e811",
      "excerpt": "2K IPS HDMI+DP",
      "description": "2K IPS HDMI+DP",
      "image": "https://example.com/image.jpg",
      "category": "二手市场",
      "price": "4500",
      "htmlContent": "<p>详细内容...</p>",
      "published": true,
      "views": 100,
      "createdAt": "2025-12-29T10:00:00+02:00",
      "updatedAt": "2025-12-29T10:00:00+02:00"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "pageSize": 12,
    "total": 1,
    "totalPages": 1
  }
}
```

### 2. 汇率查询 (`/api/custom/exchange-rate`)

#### 原API（已停用）
```http
GET /api/custom/exchange-rate
```

#### 替代API

**获取列表：**
```http
GET /api/blog/posts?category=汇率转换
GET /api/blog/posts?category=exchange-rate
```

**获取详情：**
```http
GET /api/blog/posts/:slug
```

**示例：**
```javascript
// 获取汇率文章（通常只有一个）
const response = await fetch('/api/blog/posts?category=汇率转换');
const data = await response.json();
const exchangeRatePost = data.data[0];

// 访问特殊数据
if (exchangeRatePost._originalData) {
  const rates = exchangeRatePost._originalData;
  // rates 包含汇率数据
}
```

**响应格式：**
```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "name": "汇率转换",
      "slug": "exchange-rate",
      "category": "汇率转换",
      "_originalData": [
        {
          "id": 1,
          "CNY": { "EGP": 6.73 },
          "USD": { "EGP": 47.46 },
          "EUR": { "EGP": 55.68 },
          "updateTime": "2025-12-29T18:38:49.458Z"
        }
      ]
    }
  ]
}
```

### 3. 天气信息 (`/api/custom/weather`)

#### 原API（已停用）
```http
GET /api/custom/weather
```

#### 替代API

**获取列表：**
```http
GET /api/blog/posts?category=天气路况
GET /api/blog/posts?category=weather
```

**获取详情：**
```http
GET /api/blog/posts/:slug
```

**示例：**
```javascript
// 获取天气文章（通常只有一个）
const response = await fetch('/api/blog/posts?category=天气路况');
const data = await response.json();
const weatherPost = data.data[0];

// 访问特殊数据
if (weatherPost._originalData) {
  const weather = weatherPost._originalData;
  // weather.globalAlert - 全球预警
  // weather.attractions - 景点信息
  // weather.traffic - 交通信息
}
```

**响应格式：**
```json
{
  "success": true,
  "data": [
    {
      "id": "weather",
      "name": "天气路况",
      "slug": "weather",
      "category": "天气路况",
      "_originalData": {
        "globalAlert": {
          "message": "天气预警信息"
        },
        "attractions": [
          {
            "name": "景点名称",
            "temperature": 25,
            "condition": "晴天"
          }
        ],
        "traffic": {
          "status": "正常"
        }
      }
    }
  ]
}
```

### 4. 翻译/问路卡片 (`/api/custom/translation`)

#### 原API（已停用）
```http
GET /api/custom/translation
GET /api/custom/translation/:id/detail
```

#### 替代API

**获取列表：**
```http
GET /api/blog/posts?category=翻译卡片
GET /api/blog/posts?category=translation
```

**获取详情：**
```http
GET /api/blog/posts/:slug
```

**示例：**
```javascript
// 获取所有翻译卡片
const response = await fetch('/api/blog/posts?category=翻译卡片');
const data = await response.json();

// 遍历翻译卡片
data.data.forEach(post => {
  if (post._originalData) {
    const translation = post._originalData;
    console.log(translation.chinese); // 中文
    console.log(translation.arabic);  // 阿拉伯文
    console.log(translation.category); // 分类
  }
});

// 获取特定翻译卡片详情
const translationSlug = 'ni-hao-ma-dui-nan-f4706920';
const detailResponse = await fetch(`/api/blog/posts/${translationSlug}`);
const translationData = await detailResponse.json();
```

**响应格式：**
```json
{
  "success": true,
  "data": [
    {
      "id": "f4706920-0de9-44a8-afd4-b3f6a8a34ce9",
      "name": "你好吗？（对男）",
      "slug": "ni-hao-ma-dui-nan-f4706920",
      "category": "翻译卡片",
      "_originalData": {
        "id": "f4706920-0de9-44a8-afd4-b3f6a8a34ce9",
        "chinese": "你好吗？（对男）",
        "arabic": "إزيّك؟",
        "category": "打招呼/礼貌"
      }
    }
  ]
}
```

### 5. 反馈提交 (`/api/custom/feedback`)

#### 原API（已停用）
```http
GET /api/custom/feedback
POST /api/custom/feedback
```

#### 替代API

**提交反馈：**
```http
POST /api/user/feedback
```

**认证要求：**
- 需要用户登录（Session认证或Token认证）
- Token认证：使用 `X-User-Token` 请求头

**请求格式：**
```javascript
// 使用Session认证（浏览器）
const response = await fetch('/api/user/feedback', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  credentials: 'include', // 包含Cookie
  body: JSON.stringify({
    type: 'feedback', // 或 'complaint'
    content: '反馈内容',
    orderNumber: 'BO12345678' // 可选
  })
});

// 使用Token认证（小程序）
const token = 'your-user-token';
const response = await fetch('/api/user/feedback', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-User-Token': token
  },
  body: JSON.stringify({
    type: 'feedback',
    content: '反馈内容'
  })
});
```

**响应格式：**
```json
{
  "success": true,
  "message": "Feedback submitted successfully. Thank you for your feedback!"
}
```

## 响应格式差异

### 原自定义API格式
```json
[
  {
    "id": "1",
    "name": "项目名称",
    "detailApi": "https://example.com/api/custom/second-hand/1/detail"
  }
]
```

### 新博客文章API格式
```json
{
  "success": true,
  "data": [
    {
      "id": "1",
      "name": "项目名称",
      "slug": "xiang-mu-ming-cheng-1",
      "category": "分类名称"
    }
  ],
  "pagination": {
    "currentPage": 1,
    "pageSize": 12,
    "total": 1,
    "totalPages": 1
  }
}
```

## 迁移步骤

1. **更新API端点**
   - 将所有 `/api/custom/*` 请求改为 `/api/blog/posts`
   - 添加 `category` 查询参数进行筛选

2. **更新响应处理**
   - 原API返回直接数组，新API返回 `{ success: true, data: [...] }`
   - 需要访问 `response.data` 获取实际数据

3. **更新详情页链接**
   - 原API使用 `detailApi` 字段
   - 新API使用 `slug` 字段构建URL：`/api/blog/posts/:slug`

4. **处理特殊数据**
   - 天气、汇率、翻译的特殊数据在 `_originalData` 字段中
   - 二手市场的价格等信息在文章对象的顶层字段中

## 数据迁移状态

所有数据已从 `custom_apis` 表迁移到 `blog_posts` 表：
- ✅ 二手市场数据已迁移
- ✅ 汇率数据已迁移
- ✅ 天气数据已迁移
- ✅ 翻译卡片数据已迁移
- ✅ 反馈功能使用独立的用户API

## 恢复已停用的API

如果需要恢复已停用的API，可以运行：

```bash
node db/disable-custom-apis.js
```

然后手动将状态改回 `active`：

```sql
UPDATE custom_apis 
SET status = 'active' 
WHERE path IN ('/second-hand', '/exchange-rate', '/weather', '/translation', '/feedback');
```

## 注意事项

1. **认证差异**：
   - 博客文章API（列表和详情）不需要认证
   - 反馈API需要用户认证（`/api/user/feedback`）

2. **分页支持**：
   - 博客文章API支持分页：`?page=1&pageSize=12`
   - 原自定义API不支持分页

3. **筛选支持**：
   - 博客文章API支持分类筛选：`?category=分类名称`
   - 博客文章API支持搜索：`?search=关键词`

4. **特殊类型数据**：
   - 天气、汇率、翻译的特殊数据存储在 `_originalData` 字段
   - 访问时需要检查 `post._originalData` 是否存在

## 技术支持

如有问题，请联系技术支持或查看：
- 博客文章API文档：`docs/MINIPROGRAM_API.md`
- 用户认证API文档：`docs/MINIPROGRAM_AUTH_API.md`

