# 自定义API完整使用示例

## 一、数据迁移结果

✅ **迁移已完成**：所有自定义API数据已统一为新字段结构

### 迁移统计

| API路径 | API ID | 项目数量 | 必填字段 | 状态 |
|---------|--------|----------|----------|------|
| `/hot-spots` | 3 | 2 | ✅ 全部通过 | ✅ 已迁移 |
| `/rentals` | 4 | 2 | ✅ 全部通过 | ✅ 已迁移 |
| `/second-hand` | 10 | 2 | ✅ 全部通过 | ✅ 已迁移 |
| `/blacklist` | 14 | 26 | ✅ 全部通过 | ✅ 已迁移 |
| `/nile-hot` | 15 | 3 | ✅ 全部通过 | ✅ 已迁移 |

### 字段验证结果

所有API数据现在都包含：
- ✅ `id` - 唯一标识（必填）
- ✅ `name` - 名称（必填）
- ✅ `detailApi` - 详情API地址（必填）
- ✅ `title` - 标题（可选，已添加）
- ✅ `description` - 描述（可选，部分有）
- ✅ `image` - 图片（可选，部分有）
- ✅ `category` - 分类（可选，部分有）

## 二、外部API管理接口完整示例

### 基础配置

```bash
# 设置API Token（从管理后台获取）
export API_TOKEN="your-api-token-here"
export BASE_URL="http://localhost:3000"
```

### 1. 获取所有API列表

```bash
curl -X GET \
  -H "X-API-Token: $API_TOKEN" \
  "$BASE_URL/api/external/custom-apis?page=1&limit=50"
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "apis": [
      {
        "id": 3,
        "name": "热门打卡 hot-spots",
        "path": "/hot-spots",
        "method": "GET",
        "requires_token": false,
        "status": "active"
      }
    ],
    "total": 5,
    "page": 1,
    "limit": 50
  }
}
```

### 2. 获取API详情

```bash
curl -X GET \
  -H "X-API-Token: $API_TOKEN" \
  "$BASE_URL/api/external/custom-apis/3"
```

### 3. 创建新API

```bash
curl -X POST \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "新API",
    "path": "/new-api",
    "method": "GET",
    "response_content": "[{\"id\":1,\"name\":\"项目1\",\"detailApi\":\"https://bobapro.life/api/custom/new-api/1/detail\"}]",
    "status": "active"
  }' \
  "$BASE_URL/api/external/custom-apis"
```

### 4. 部分更新API内容 ⭐ 核心功能

#### 4.1 追加新项目到列表

```bash
# 追加到热门打卡地列表
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "",
    "value": {
      "id": 3,
      "name": "狮身人面像",
      "title": "狮身人面像详情",
      "description": "古埃及著名古迹",
      "image": "https://example.com/sphinx.jpg",
      "category": "景点",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/3/detail"
    }
  }' \
  "$BASE_URL/api/external/custom-apis/3/content"
```

#### 4.2 更新项目字段

```bash
# 更新第一个项目的名称
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "0.name",
    "value": "金字塔（更新）"
  }' \
  "$BASE_URL/api/external/custom-apis/3/content"

# 更新第一个项目的分类
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "0.category",
    "value": "世界遗产"
  }' \
  "$BASE_URL/api/external/custom-apis/3/content"

# 更新第一个项目的detailApi
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "0.detailApi",
    "value": "https://bobapro.life/api/custom/hot-spots/1/detail-new"
  }' \
  "$BASE_URL/api/external/custom-apis/3/content"
```

#### 4.3 删除项目

```bash
# 删除第一个项目（索引0）
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "delete",
    "path": "0"
  }' \
  "$BASE_URL/api/external/custom-apis/3/content"
```

#### 4.4 删除字段

```bash
# 删除第一个项目的某个扩展字段
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "remove",
    "path": "0.oldField"
  }' \
  "$BASE_URL/api/external/custom-apis/3/content"
```

### 5. 更新整个API

```bash
curl -X PUT \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "更新后的名称",
    "status": "inactive"
  }' \
  "$BASE_URL/api/external/custom-apis/3"
```

### 6. 删除API

```bash
curl -X DELETE \
  -H "X-API-Token: $API_TOKEN" \
  "$BASE_URL/api/external/custom-apis/3"
```

## 三、各页面API实际数据示例

### 1. 热门打卡地 (/hot-spots)

**当前数据示例**:
```json
[
  {
    "id": 1,
    "name": "金字塔1",
    "title": "金字塔详情",
    "description": "世界七大奇迹之一",
    "image": "https://bobapro.life/uploads/custom-api-images/1765482718830-t8npygw4.png",
    "category": "景点",
    "detailApi": "https://bobapro.life/api/custom/test",
    "latitude": 29.9792,
    "longitude": 31.1342
  }
]
```

**操作示例**:
```bash
# 追加新打卡地
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "",
    "value": {
      "id": 3,
      "name": "尼罗河",
      "title": "尼罗河详情",
      "description": "世界最长河流",
      "image": "https://example.com/nile.jpg",
      "category": "自然景观",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/3/detail",
      "latitude": 30.0444,
      "longitude": 31.2357
    }
  }' \
  "$BASE_URL/api/external/custom-apis/3/content"
```

### 2. 租房酒店 (/rentals)

**当前数据示例**:
```json
[
  {
    "id": 1,
    "name": "开罗市中心精装公寓1",
    "title": "开罗市中心精装公寓1",
    "image": "https://bobapro.life/uploads/custom-api-images/1765482718830-t8npygw4.png",
    "category": "开罗市中心",
    "detailApi": "https://bobapro.life/api/custom/rentals/1/detail",
    "address": "开罗市中心，近地铁站",
    "price": "3500",
    "type": "整租",
    "rooms": "2",
    "area": "80",
    "contact": "微信：rental001",
    "latitude": 30.0444,
    "longitude": 31.2357
  }
]
```

**操作示例**:
```bash
# 更新价格
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "0.price",
    "value": "3800"
  }' \
  "$BASE_URL/api/external/custom-apis/4/content"

# 追加新房源
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "",
    "value": {
      "id": 3,
      "name": "新开罗精装公寓",
      "title": "新开罗精装公寓详情",
      "image": "https://example.com/apartment.jpg",
      "category": "新开罗",
      "detailApi": "https://bobapro.life/api/custom/rentals/3/detail",
      "address": "新开罗，交通便利",
      "price": "4000",
      "type": "整租",
      "rooms": "3",
      "area": "100",
      "contact": "微信：rental003"
    }
  }' \
  "$BASE_URL/api/external/custom-apis/4/content"
```

### 3. 二手市场 (/second-hand)

**当前数据示例**:
```json
[
  {
    "id": 1,
    "name": "二手电动车1",
    "title": "二手电动车1",
    "description": "九成新，性能良好",
    "image": "https://bobapro.life/uploads/custom-api-images/1765482718830-t8npygw4.png",
    "category": "交通工具",
    "detailApi": "https://bobapro.life/api/custom/second-hand/1/detail",
    "price": "2000",
    "contact": "微信：secondhand001"
  }
]
```

**操作示例**:
```bash
# 更新价格
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "0.price",
    "value": "1800"
  }' \
  "$BASE_URL/api/external/custom-apis/10/content"

# 追加新商品
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "",
    "value": {
      "id": 3,
      "name": "二手笔记本电脑",
      "title": "二手笔记本电脑详情",
      "description": "配置良好，运行流畅",
      "image": "https://example.com/laptop.jpg",
      "category": "电子产品",
      "detailApi": "https://bobapro.life/api/custom/second-hand/3/detail",
      "price": "5000",
      "contact": "微信：secondhand003"
    }
  }' \
  "$BASE_URL/api/external/custom-apis/10/content"
```

### 4. 防骗预警 (/blacklist)

**当前数据示例**:
```json
[
  {
    "id": 1,
    "name": "虚假租房信息1",
    "title": "虚假租房信息1",
    "description": "1某中介发布虚假房源信息，收取定金后失联...",
    "detailApi": "https://bobapro.life/api/custom/blacklist/1/detail",
    "type": "租房诈骗",
    "date": "2024-01-15"
  }
]
```

**操作示例**:
```bash
# 追加新预警
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "",
    "value": {
      "id": 27,
      "name": "虚假交易信息",
      "title": "虚假交易信息",
      "description": "某商家发布虚假商品信息...",
      "detailApi": "https://bobapro.life/api/custom/blacklist/27/detail",
      "type": "交易诈骗",
      "date": "2025-01-15"
    }
  }' \
  "$BASE_URL/api/external/custom-apis/14/content"

# 删除过期的预警（删除索引0的项目）
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "delete",
    "path": "0"
  }' \
  "$BASE_URL/api/external/custom-apis/14/content"
```

### 5. 尼罗河热映 (/nile-hot)

**当前数据示例**:
```json
[
  {
    "id": 1,
    "name": "应用名称1",
    "title": "应用标题1",
    "description": "应用描述1",
    "image": "https://bobapro.life/uploads/custom-api-images/1765482718830-t8npygw4.png",
    "category": "分类1",
    "detailApi": "https://bobapro.life/api/custom/nile-hot/1/detail"
  }
]
```

**操作示例**:
```bash
# 追加新应用
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "",
    "value": {
      "id": 4,
      "name": "新应用",
      "title": "新应用标题",
      "description": "新应用描述",
      "image": "https://example.com/app.jpg",
      "category": "工具类",
      "detailApi": "https://bobapro.life/api/custom/nile-hot/4/detail"
    }
  }' \
  "$BASE_URL/api/external/custom-apis/15/content"
```

## 四、路径表达式参考

### 数组格式的response_content

如果 `response_content` 是数组：
```json
[
  {"id": 1, "name": "项目1"},
  {"id": 2, "name": "项目2"}
]
```

路径示例：
- `0` - 第一个项目
- `0.name` - 第一个项目的name字段
- `1.category` - 第二个项目的category字段

### 对象格式的response_content

如果 `response_content` 是对象：
```json
{
  "data": [
    {"id": 1, "name": "项目1"},
    {"id": 2, "name": "项目2"}
  ],
  "total": 2
}
```

路径示例：
- `data` - data数组
- `data.0` - data数组的第一个项目
- `data.0.name` - data数组第一个项目的name字段
- `total` - total字段

## 五、完整工作流程示例

### 场景：管理热门打卡地列表

```bash
# 1. 获取API ID
API_ID=3

# 2. 查看当前列表
curl -H "X-API-Token: $API_TOKEN" \
  "$BASE_URL/api/external/custom-apis/$API_ID" | jq '.data.response_content' | jq '.[0]'

# 3. 追加新打卡地
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "",
    "value": {
      "id": 3,
      "name": "狮身人面像",
      "title": "狮身人面像详情",
      "description": "古埃及著名古迹",
      "image": "https://example.com/sphinx.jpg",
      "category": "景点",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/3/detail"
    }
  }' \
  "$BASE_URL/api/external/custom-apis/$API_ID/content"

# 4. 更新第一个项目的描述
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "0.description",
    "value": "世界七大奇迹之一，古埃及法老的陵墓"
  }' \
  "$BASE_URL/api/external/custom-apis/$API_ID/content"

# 5. 删除第二个项目
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "delete",
    "path": "1"
  }' \
  "$BASE_URL/api/external/custom-apis/$API_ID/content"

# 6. 验证更新结果
curl -H "X-API-Token: $API_TOKEN" \
  "$BASE_URL/api/external/custom-apis/$API_ID" | jq '.data.response_content'
```

## 六、错误处理示例

### 常见错误及解决方案

#### 1. Token无效

```json
{
  "success": false,
  "message": "API Token无效",
  "code": "UNAUTHORIZED"
}
```

**解决方案**: 检查Token是否正确，从管理后台重新获取

#### 2. 路径不存在

```json
{
  "success": false,
  "message": "操作失败：路径不存在或无法执行该操作",
  "code": "OPERATION_FAILED"
}
```

**解决方案**: 检查路径表达式是否正确，确认数据结构

#### 3. JSON格式无效

```json
{
  "success": false,
  "message": "返回内容必须是有效的JSON格式",
  "code": "INVALID_JSON"
}
```

**解决方案**: 验证JSON格式，使用JSON验证工具检查

## 七、最佳实践

1. **批量操作**: 使用循环批量添加/更新项目
2. **错误处理**: 始终检查响应中的 `success` 字段
3. **数据备份**: 重要操作前先获取当前数据
4. **路径验证**: 操作前先获取API详情，确认数据结构
5. **Token安全**: 使用环境变量存储Token，不要硬编码

## 八、快速参考

### API端点速查表

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 获取列表 | GET | `/api/external/custom-apis` | 支持分页和过滤 |
| 获取详情 | GET | `/api/external/custom-apis/:id` | 获取单个API |
| 创建API | POST | `/api/external/custom-apis` | 创建新API |
| 更新API | PUT | `/api/external/custom-apis/:id` | 更新API信息 |
| 部分更新 | PATCH | `/api/external/custom-apis/:id/content` | 部分更新内容 |
| 删除API | DELETE | `/api/external/custom-apis/:id` | 删除API |
| 获取日志 | GET | `/api/external/custom-apis/:id/logs` | 获取调用日志 |

### 操作类型速查表

| 操作 | 说明 | 需要value |
|------|------|-----------|
| `add` | 添加/更新字段 | ✅ 是 |
| `update` | 更新字段值 | ✅ 是 |
| `append` | 追加到数组 | ✅ 是 |
| `delete` | 删除数组元素 | ❌ 否（可选） |
| `remove` | 删除字段 | ❌ 否 |

## 九、迁移脚本

已创建自动迁移脚本，数据库初始化时会自动运行：

```bash
# 手动运行迁移（如果需要）
node db/migrate-custom-api-fields.js
```

迁移脚本会自动：
- ✅ 为缺少 `name` 的项从 `title` 生成
- ✅ 为缺少 `detailApi` 的项生成标准格式
- ✅ 保留所有扩展字段
- ✅ 确保所有必填字段都存在

## 十、相关文档

- [外部API管理接口完整指南](./EXTERNAL_API_GUIDE.md) - 详细的接口文档
- [自定义API使用示例](./CUSTOM_API_EXAMPLES.md) - 字段结构和示例
- [API文档](./API.md) - 完整的API接口文档
