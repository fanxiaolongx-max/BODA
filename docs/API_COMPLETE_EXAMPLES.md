# 自定义API实际数据示例

本文档包含所有已迁移并符合新规则的自定义API实际数据示例。

## 数据迁移状态

✅ **所有API数据已完全符合新规则**

| API路径 | API ID | 项目数量 | 状态 |
|---------|--------|---------|------|
| `/blacklist` | 14 | 26 | ✅ 已迁移 |
| `/hot-spots` | 3 | 2 | ✅ 已迁移 |
| `/nile-hot` | 15 | 3 | ✅ 已迁移 |
| `/rentals` | 4 | 2 | ✅ 已迁移 |
| `/second-hand` | 10 | 2 | ✅ 已迁移 |

## 1. 防骗指南 blacklist

**API ID**: 14
**列表API**: `GET /api/custom/blacklist`
**详情API**: `GET /api/custom/blacklist/:id/detail`

### 列表API响应示例

```json
[
  {
    "id": 27,
    "name": "虚假租房信息1",
    "title": "虚假租房信息1",
    "description": "1某中介发布虚假房源信息，收取定金后失联...",
    "detailApi": "https://bobapro.life/api/custom/blacklist/27/detail",
    "type": "租房诈骗",
    "date": "2024-01-15"
  },
  {
    "id": 28,
    "name": "虚假租房信息2",
    "title": "虚假租房信息2",
    "description": "2某中介发布虚假房源信息，收取定金后失联...",
    "detailApi": "https://bobapro.life/api/custom/blacklist/28/detail",
    "type": "交易诈骗",
    "date": "2024-02-15"
  }
]
```

### 详情API响应示例

```json
{
  "content": "<h2>详情标题</h2><p>详情内容...</p>",
  "title": "详情标题",
  "meta": "2024-01-15"
}
```

### 使用外部API管理

```bash
# 获取API详情
curl -H "X-API-Token: your-token" \
  "https://bobapro.life/api/external/custom-apis/14"

# 追加新项目
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "",
    "value": {
      "id": 27,
      "name": "新项目",
      "detailApi": "https://bobapro.life/api/custom/blacklist/27/detail"
    }
  }' \
  "https://bobapro.life/api/external/custom-apis/14/content"
```

---

## 2. 热门打卡 hot-spots

**API ID**: 3
**列表API**: `GET /api/custom/hot-spots`
**详情API**: `GET /api/custom/hot-spots/:id/detail`

### 列表API响应示例

```json
[
  {
    "id": 2,
    "name": "金字塔1",
    "title": "金字塔详情",
    "description": "世界七大奇迹之一",
    "image": "https://bobapro.life/uploads/custom-api-images/1765482718830-t8npygw4.png",
    "category": "景点",
    "detailApi": "https://bobapro.life/api/custom/hot-spots/2/detail",
    "latitude": 29.9792,
    "longitude": 31.1342
  },
  {
    "id": 3,
    "name": "金字塔2",
    "title": "金字塔详情",
    "description": "世界七大奇迹之一",
    "image": "https://bobapro.life/uploads/custom-api-images/1765482718830-t8npygw4.png",
    "category": "景点",
    "detailApi": "https://bobapro.life/api/custom/hot-spots/3/detail",
    "latitude": 29.9792,
    "longitude": 31.1342
  }
]
```

### 详情API响应示例

```json
{
  "content": "<h2>详情标题</h2><p>详情内容...</p>",
  "title": "详情标题",
  "meta": "2024-01-15"
}
```

### 使用外部API管理

```bash
# 获取API详情
curl -H "X-API-Token: your-token" \
  "https://bobapro.life/api/external/custom-apis/3"

# 追加新项目
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "",
    "value": {
      "id": 3,
      "name": "新项目",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/3/detail"
    }
  }' \
  "https://bobapro.life/api/external/custom-apis/3/content"
```

---

## 3. 尼罗河热映 nile-hot

**API ID**: 15
**列表API**: `GET /api/custom/nile-hot`
**详情API**: `GET /api/custom/nile-hot/:id/detail`

### 列表API响应示例

```json
[
  {
    "id": 2,
    "name": "应用名称1",
    "title": "应用标题1",
    "description": "应用描述1",
    "image": "https://bobapro.life/uploads/custom-api-images/1765482718830-t8npygw4.png",
    "category": "分类1",
    "detailApi": "https://bobapro.life/api/custom/nile-hot/2/detail"
  },
  {
    "id": 3,
    "name": "应用名称2",
    "title": "应用标题2",
    "description": "应用描述2",
    "image": "https://bobapro.life/uploads/custom-api-images/1765482718830-t8npygw4.png",
    "category": "分类2",
    "detailApi": "https://bobapro.life/api/custom/nile-hot/3/detail"
  }
]
```

### 详情API响应示例

```json
{
  "content": "<h2>详情标题</h2><p>详情内容...</p>",
  "title": "详情标题",
  "meta": "2024-01-15"
}
```

### 使用外部API管理

```bash
# 获取API详情
curl -H "X-API-Token: your-token" \
  "https://bobapro.life/api/external/custom-apis/15"

# 追加新项目
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "",
    "value": {
      "id": 4,
      "name": "新项目",
      "detailApi": "https://bobapro.life/api/custom/nile-hot/4/detail"
    }
  }' \
  "https://bobapro.life/api/external/custom-apis/15/content"
```

---

## 4. 租房酒店 rentals

**API ID**: 4
**列表API**: `GET /api/custom/rentals`
**详情API**: `GET /api/custom/rentals/:id/detail`

### 列表API响应示例

```json
[
  {
    "id": 2,
    "name": "开罗市中心精装公寓1",
    "title": "开罗市中心精装公寓1",
    "image": "https://bobapro.life/uploads/custom-api-images/1765482718830-t8npygw4.png",
    "category": "开罗市中心",
    "detailApi": "https://bobapro.life/api/custom/rentals/2/detail",
    "address": "开罗市中心，近地铁站",
    "price": "3500",
    "type": "整租",
    "rooms": "2",
    "area": "80",
    "contact": "微信：rental001",
    "latitude": 30.0444,
    "longitude": 31.2357,
    "pageTitle": "开罗市中心精装公寓详情"
  },
  {
    "id": 3,
    "name": "开罗市中心精装公寓2",
    "title": "开罗市中心精装公寓2",
    "image": "https://bobapro.life/uploads/custom-api-images/1765482718830-t8npygw4.png",
    "category": "开罗市中心",
    "detailApi": "https://bobapro.life/api/custom/rentals/3/detail",
    "address": "开罗市中心，近地铁站",
    "price": "3500",
    "type": "整租",
    "rooms": "2",
    "area": "80",
    "contact": "微信：rental001",
    "latitude": 30.0444,
    "longitude": 31.2357,
    "pageTitle": "开罗市中心精装公寓详情"
  }
]
```

### 详情API响应示例

```json
{
  "content": "<h2>详情标题</h2><p>详情内容...</p>",
  "title": "详情标题",
  "meta": "2024-01-15"
}
```

### 使用外部API管理

```bash
# 获取API详情
curl -H "X-API-Token: your-token" \
  "https://bobapro.life/api/external/custom-apis/4"

# 追加新项目
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "",
    "value": {
      "id": 3,
      "name": "新项目",
      "detailApi": "https://bobapro.life/api/custom/rentals/3/detail"
    }
  }' \
  "https://bobapro.life/api/external/custom-apis/4/content"
```

---

## 5. 二手市场 second-hand

**API ID**: 10
**列表API**: `GET /api/custom/second-hand`
**详情API**: `GET /api/custom/second-hand/:id/detail`

### 列表API响应示例

```json
[
  {
    "id": 2,
    "name": "二手电动车1",
    "title": "二手电动车1",
    "description": "九成新，性能良好",
    "image": "https://bobapro.life/uploads/custom-api-images/1765482718830-t8npygw4.png",
    "category": "交通工具",
    "detailApi": "https://bobapro.life/api/custom/second-hand/2/detail",
    "price": "2000",
    "contact": "微信：secondhand001",
    "pageTitle": "二手电动车详情"
  },
  {
    "id": 3,
    "name": "二手电动车2",
    "title": "二手电动车2",
    "description": "九成新，性能良好",
    "image": "https://bobapro.life/uploads/custom-api-images/1765482718830-t8npygw4.png",
    "category": "交通工具",
    "detailApi": "https://bobapro.life/api/custom/second-hand/3/detail",
    "price": "2000",
    "contact": "微信：secondhand001",
    "pageTitle": "二手电动车详情"
  }
]
```

### 详情API响应示例

```json
{
  "content": "<h2>详情标题</h2><p>详情内容...</p>",
  "title": "详情标题",
  "meta": "2024-01-15"
}
```

### 使用外部API管理

```bash
# 获取API详情
curl -H "X-API-Token: your-token" \
  "https://bobapro.life/api/external/custom-apis/10"

# 追加新项目
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "",
    "value": {
      "id": 3,
      "name": "新项目",
      "detailApi": "https://bobapro.life/api/custom/second-hand/3/detail"
    }
  }' \
  "https://bobapro.life/api/external/custom-apis/10/content"
```

---

## 外部API管理接口完整示例

### 1. 获取所有API列表

```bash
curl -X GET \
  -H "X-API-Token: your-api-token" \
  "https://bobapro.life/api/external/custom-apis"
```

### 2. 获取单个API详情

```bash
curl -X GET \
  -H "X-API-Token: your-api-token" \
  "https://bobapro.life/api/external/custom-apis/3"
```

### 3. 追加新项目到列表

```bash
curl -X PATCH \
  -H "X-API-Token: your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "data",
    "value": {
      "id": 4,
      "name": "新项目",
      "title": "新项目详情",
      "description": "新项目描述",
      "image": "https://example.com/image.jpg",
      "category": "分类",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/4/detail"
    }
  }' \
  "https://bobapro.life/api/external/custom-apis/3/content"
```

### 4. 更新项目字段

```bash
# 更新第一个项目的name
curl -X PATCH \
  -H "X-API-Token: your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "data.0.name",
    "value": "更新的名称"
  }' \
  "https://bobapro.life/api/external/custom-apis/3/content"
```

### 5. 删除项目

```bash
# 删除第一个项目
curl -X PATCH \
  -H "X-API-Token: your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "delete",
    "path": "data.0"
  }' \
  "https://bobapro.life/api/external/custom-apis/3/content"
```

### 6. 删除字段

```bash
# 删除description字段
curl -X PATCH \
  -H "X-API-Token: your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "remove",
    "path": "data.0.description"
  }' \
  "https://bobapro.life/api/external/custom-apis/3/content"
```

## 数据完整性验证

✅ 所有API数据已通过以下验证：

- ✅ 必填字段完整（id, name, detailApi）
- ✅ detailApi格式标准化
- ✅ ID唯一性保证
- ✅ 可选字段根据数据情况保留

