# 自定义API使用示例文档

## 一、统一字段结构标准

所有瀑布流列表API统一使用以下标准字段结构：

### 标准字段（必填/推荐）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | number/string | 必填 | 唯一标识符 |
| `name` | string | 必填 | 名称，用于卡片显示 |
| `detailApi` | string | 必填 | 详情API地址，用于获取详情内容 |

### 标准字段（可选）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | 可选 | 标题，用于详情页标题 |
| `description` | string | 可选 | 描述信息，用于卡片摘要显示 |
| `image` | string | 可选 | 图片URL |
| `category` | string | 可选 | 分类 |

### 扩展字段

除了标准字段外，可以根据业务需求添加其他扩展字段（如 `price`、`address`、`contact` 等）。

## 二、列表API标准格式

### 响应格式

```json
{
  "data": [
    {
      "id": 1,
      "name": "项目名称",
      "title": "详情页标题（可选）",
      "description": "项目描述",
      "image": "https://example.com/image.jpg",
      "category": "分类名称",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/1/detail"
    }
  ],
  "total": 100,
  "hasMore": true
}
```

或者直接返回数组：

```json
[
  {
    "id": 1,
    "name": "项目名称",
    "title": "详情页标题（可选）",
    "description": "项目描述",
    "image": "https://example.com/image.jpg",
    "category": "分类名称",
    "detailApi": "https://bobapro.life/api/custom/hot-spots/1/detail"
  }
]
```

## 三、详情API标准格式

### 响应格式

```json
{
  "content": "<h2>标题</h2><p>HTML内容...</p>",
  "title": "文章标题",
  "meta": "2024-01-15"
}
```

或者：

```json
{
  "html": "<h2>标题</h2><p>HTML内容...</p>",
  "title": "文章标题"
}
```

## 四、各页面API示例

### 1. 热门打卡地 (hot-spots)

**列表API**: `GET /api/custom/hot-spots`

**响应示例**:
```json
[
  {
    "id": 1,
    "name": "金字塔",
    "title": "金字塔详情",
    "description": "世界七大奇迹之一",
    "image": "https://bobapro.life/uploads/custom-api-images/pyramid.jpg",
    "category": "景点",
    "latitude": 29.9792,
    "longitude": 31.1342,
    "detailApi": "https://bobapro.life/api/custom/hot-spots/1/detail"
  }
]
```

**详情API**: `GET /api/custom/hot-spots/:id/detail`

**响应示例**:
```json
{
  "content": "<h2>金字塔</h2><p>金字塔是古埃及法老的陵墓...</p>",
  "title": "金字塔详情",
  "meta": "2024-01-15"
}
```

### 2. 租房酒店 (rentals)

**列表API**: `GET /api/custom/rentals`

**响应示例**:
```json
[
  {
    "id": 1,
    "name": "开罗市中心精装公寓",
    "title": "开罗市中心精装公寓详情",
    "description": "开罗市中心，近地铁站",
    "image": "https://bobapro.life/uploads/custom-api-images/apartment.jpg",
    "category": "开罗市中心",
    "price": "3500",
    "type": "整租",
    "rooms": "2",
    "area": "80",
    "contact": "微信：rental001",
    "latitude": 30.0444,
    "longitude": 31.2357,
    "detailApi": "https://bobapro.life/api/custom/rentals/1/detail"
  }
]
```

**详情API**: `GET /api/custom/rentals/:id/detail`

**响应示例**:
```json
{
  "content": "<h2>开罗市中心精装公寓</h2><p>地址：开罗市中心，近地铁站...</p>",
  "title": "开罗市中心精装公寓详情",
  "meta": "2024-01-15"
}
```

### 3. 二手市场 (second-hand)

**列表API**: `GET /api/custom/second-hand`

**响应示例**:
```json
[
  {
    "id": 1,
    "name": "二手电动车",
    "title": "二手电动车详情",
    "description": "九成新，性能良好",
    "image": "https://bobapro.life/uploads/custom-api-images/bike.jpg",
    "category": "交通工具",
    "price": "2000",
    "contact": "微信：secondhand001",
    "detailApi": "https://bobapro.life/api/custom/second-hand/1/detail"
  }
]
```

**详情API**: `GET /api/custom/second-hand/:id/detail`

**响应示例**:
```json
{
  "content": "<h2>二手电动车</h2><p>九成新，性能良好...</p>",
  "title": "二手电动车详情",
  "meta": "2024-01-15"
}
```

### 4. 防骗预警 (blacklist)

**列表API**: `GET /api/custom/blacklist`

**响应示例**:
```json
[
  {
    "id": 1,
    "name": "虚假租房信息",
    "title": "虚假租房信息",
    "description": "某中介发布虚假房源信息，收取定金后失联...",
    "category": "租房诈骗",
    "type": "租房诈骗",
    "date": "2024-01-15",
    "detailApi": "https://bobapro.life/api/custom/blacklist/1/detail"
  }
]
```

**详情API**: `GET /api/custom/blacklist/:id/detail`

**响应示例**:
```json
{
  "content": "<h2>虚假租房信息</h2><p>某中介发布虚假房源信息，收取定金后失联...</p>",
  "title": "虚假租房信息",
  "meta": "2024-01-15"
}
```

### 5. 尼罗河热映 (nile-hot)

**列表API**: `GET /api/custom/nile-hot`

**响应示例**:
```json
[
  {
    "id": 1,
    "name": "应用名称",
    "title": "应用标题",
    "description": "应用描述",
    "image": "https://bobapro.life/uploads/custom-api-images/app.jpg",
    "category": "分类",
    "detailApi": "https://bobapro.life/api/custom/nile-hot/1/detail"
  }
]
```

**详情API**: `GET /api/custom/nile-hot/:id/detail`

**响应示例**:
```json
{
  "content": "<h2>应用标题</h2><p>应用描述...</p>",
  "title": "应用标题",
  "meta": "2024-01-15"
}
```

## 五、使用外部API管理接口更新数据

### 1. 获取API列表

```bash
curl -X GET \
  -H "X-API-Token: your-token" \
  http://localhost:3000/api/external/custom-apis
```

### 2. 获取API详情

```bash
curl -X GET \
  -H "X-API-Token: your-token" \
  http://localhost:3000/api/external/custom-apis/1
```

### 3. 创建新API

```bash
curl -X POST \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "新API",
    "path": "/new-api",
    "method": "GET",
    "response_content": "[{\"id\":1,\"name\":\"项目1\",\"detailApi\":\"https://bobapro.life/api/custom/new-api/1/detail\"}]",
    "description": "新创建的API",
    "status": "active"
  }' \
  http://localhost:3000/api/external/custom-apis
```

### 4. 更新API内容（部分更新）

#### 更新字段值

```bash
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "data.0.name",
    "value": "更新后的名称"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

#### 追加元素到数组

```bash
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "data",
    "value": {
      "id": 3,
      "name": "新项目",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/3/detail"
    }
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

#### 删除数组元素

```bash
# 通过索引删除
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "delete",
    "path": "data.0"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content

# 通过值匹配删除
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "delete",
    "path": "data",
    "value": {"id": 2, "name": "要删除的项目"}
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

#### 删除字段

```bash
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "remove",
    "path": "data.0.oldField"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

### 5. 更新整个API

```bash
curl -X PUT \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "更新后的API名称",
    "status": "inactive"
  }' \
  http://localhost:3000/api/external/custom-apis/1
```

### 6. 删除API

```bash
curl -X DELETE \
  -H "X-API-Token: your-token" \
  http://localhost:3000/api/external/custom-apis/1
```

## 六、常见操作场景

### 场景1：为新项目添加detailApi

```bash
# 假设列表API返回的是数组格式
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "0.detailApi",
    "value": "https://bobapro.life/api/custom/hot-spots/1/detail"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

### 场景2：批量添加新项目

```bash
# 先追加第一个
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "data",
    "value": {
      "id": 10,
      "name": "新项目1",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/10/detail"
    }
  }' \
  http://localhost:3000/api/external/custom-apis/1/content

# 再追加第二个
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "data",
    "value": {
      "id": 11,
      "name": "新项目2",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/11/detail"
    }
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

### 场景3：更新嵌套字段

```bash
# 更新 data[0].category
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "data.0.category",
    "value": "新分类"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

## 七、错误处理

### 常见错误码

- `UNAUTHORIZED` (401): Token无效或缺失
- `NOT_FOUND` (404): API不存在
- `VALIDATION_ERROR` (400): 参数验证失败
- `DUPLICATE_PATH` (400): 路径已存在
- `INVALID_JSON` (400): JSON格式无效
- `OPERATION_FAILED` (400): 操作失败（路径不存在）
- `SERVER_ERROR` (500): 服务器错误

### 错误响应示例

```json
{
  "success": false,
  "message": "错误描述",
  "code": "ERROR_CODE"
}
```

## 八、注意事项

1. **detailApi必填**: 所有列表项必须包含 `detailApi` 字段，否则前端无法显示详情
2. **name必填**: 所有列表项必须包含 `name` 字段，用于卡片显示
3. **路径格式**: 使用点号分隔的路径表达式（如 `data.0.name`）
4. **数组索引**: 数组索引从0开始
5. **JSON格式**: 所有 `response_content` 必须是有效的JSON格式
6. **Token安全**: 生产环境请使用强随机字符串作为API Token

## 九、迁移脚本

已创建迁移脚本 `db/migrate-custom-api-fields.js`，可以自动将旧数据迁移到新格式：

```bash
node db/migrate-custom-api-fields.js
```

迁移脚本会：
- 自动为缺少 `name` 的项从 `title` 生成
- 自动为缺少 `detailApi` 的项生成标准格式的详情API地址
- 保留所有扩展字段
- 确保所有必填字段都存在
