# 自定义API最终数据示例文档

本文档包含所有已迁移并符合新规则的自定义API实际数据示例。

## 数据迁移状态

✅ **所有API数据已完全符合新规则**

| API路径 | API ID | 项目数量 | 状态 |
|---------|--------|---------|------|
| `/hot-spots` | 3 | 2 | ✅ 已迁移 |
| `/rentals` | 4 | 2 | ✅ 已迁移 |
| `/second-hand` | 10 | 2 | ✅ 已迁移 |
| `/blacklist` | 14 | 26 | ✅ 已迁移 |
| `/nile-hot` | 15 | 3 | ✅ 已迁移 |

## 一、热门打卡地 (hot-spots)

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
  "content": "<h2>金字塔详情</h2><p>金字塔是古埃及法老的陵墓，世界七大奇迹之一...</p>",
  "title": "金字塔详情",
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
    "path": "data",
    "value": {
      "id": 4,
      "name": "新景点",
      "title": "新景点详情",
      "description": "新景点描述",
      "image": "https://example.com/image.jpg",
      "category": "景点",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/4/detail"
    }
  }' \
  "https://bobapro.life/api/external/custom-apis/3/content"
```

## 二、租房酒店 (rentals)

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
  "content": "<h2>开罗市中心精装公寓</h2><p>位于开罗市中心，交通便利，设施齐全...</p><p>联系方式：微信：rental001</p>",
  "title": "开罗市中心精装公寓详情",
  "meta": "2024-01-15"
}
```

### 使用外部API管理

```bash
# 更新价格
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "data.0.price",
    "value": "4000"
  }' \
  "https://bobapro.life/api/external/custom-apis/4/content"
```

## 三、二手市场 (second-hand)

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
  "content": "<h2>二手电动车</h2><p>九成新，性能良好，适合日常代步...</p><p>价格：2000 EGP</p><p>联系方式：微信：secondhand001</p>",
  "title": "二手电动车详情",
  "meta": "2024-01-15"
}
```

## 四、防骗预警 (blacklist)

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
  "content": "<h2>虚假租房信息1</h2><p>某中介发布虚假房源信息，收取定金后失联...</p><p>类型：租房诈骗</p><p>防范措施：1. 核实房源真实性 2. 不要提前支付大额定金...</p>",
  "title": "虚假租房信息1详情",
  "meta": "2024-01-15"
}
```

## 五、尼罗河热映 (nile-hot)

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
  },
  {
    "id": 4,
    "name": "应用名称3",
    "title": "应用标题3",
    "description": "应用描述3",
    "image": "https://bobapro.life/uploads/custom-api-images/1765482718830-t8npygw4.png",
    "category": "分类3",
    "detailApi": "https://bobapro.life/api/custom/nile-hot/4/detail"
  }
]
```

### 详情API响应示例

```json
{
  "content": "<h2>应用标题1</h2><p>应用描述1的详细内容...</p>",
  "title": "应用标题1详情",
  "meta": "2024-01-15"
}
```

## 六、外部API管理接口完整示例

### 1. 获取所有API列表

```bash
curl -X GET \
  -H "X-API-Token: your-api-token" \
  "https://bobapro.life/api/external/custom-apis"
```

**响应**:
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
        "description": "热门打卡地列表",
        "status": "active",
        "created_at": "2024-01-15 10:00:00",
        "updated_at": "2024-01-15 10:00:00"
      }
    ],
    "total": 5,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

### 2. 获取单个API详情

```bash
curl -X GET \
  -H "X-API-Token: your-api-token" \
  "https://bobapro.life/api/external/custom-apis/3"
```

**响应**:
```json
{
  "success": true,
  "data": {
    "id": 3,
    "name": "热门打卡 hot-spots",
    "path": "/hot-spots",
    "method": "GET",
    "requires_token": false,
    "response_content": "[{\"id\":2,\"name\":\"金字塔1\",...}]",
    "description": "热门打卡地列表",
    "status": "active",
    "created_at": "2024-01-15 10:00:00",
    "updated_at": "2024-01-15 10:00:00"
  }
}
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
      "name": "新景点",
      "title": "新景点详情",
      "description": "新景点描述",
      "image": "https://example.com/image.jpg",
      "category": "景点",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/4/detail"
    }
  }' \
  "https://bobapro.life/api/external/custom-apis/3/content"
```

**响应**:
```json
{
  "success": true,
  "message": "内容更新成功",
  "data": {
    "updated_content": [
      {
        "id": 2,
        "name": "金字塔1",
        ...
      },
      {
        "id": 4,
        "name": "新景点",
        ...
      }
    ]
  }
}
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

## 七、字段结构验证

所有API数据已通过以下验证：

✅ **必填字段完整性**
- `id`: 所有项目都有唯一ID
- `name`: 所有项目都有名称
- `detailApi`: 所有项目都有详情API地址

✅ **detailApi格式正确性**
- 格式：`https://bobapro.life/api/custom{path}/{id}/detail`
- 路径匹配：detailApi中的path与列表API的path一致
- ID匹配：detailApi中的id与项目的id一致

✅ **可选字段**
- `title`: 大部分项目都有
- `description`: 根据数据类型提供
- `image`: 根据数据类型提供
- `category`: 根据数据类型提供

## 八、数据统计

| API | 项目数 | 有title | 有description | 有image | 有category |
|-----|--------|---------|---------------|---------|------------|
| hot-spots | 2 | 2 | 2 | 2 | 2 |
| rentals | 2 | 2 | 0 | 2 | 2 |
| second-hand | 2 | 2 | 2 | 2 | 2 |
| blacklist | 26 | 26 | 26 | 0 | 0 |
| nile-hot | 3 | 3 | 3 | 3 | 3 |

## 九、快速测试命令

### 测试列表API

```bash
# 热门打卡地
curl "https://bobapro.life/api/custom/hot-spots" | jq '.[0]'

# 租房酒店
curl "https://bobapro.life/api/custom/rentals" | jq '.[0]'

# 二手市场
curl "https://bobapro.life/api/custom/second-hand" | jq '.[0]'

# 防骗预警
curl "https://bobapro.life/api/custom/blacklist" | jq '.[0]'

# 尼罗河热映
curl "https://bobapro.life/api/custom/nile-hot" | jq '.[0]'
```

### 测试详情API

```bash
# 热门打卡地详情
curl "https://bobapro.life/api/custom/hot-spots/2/detail" | jq

# 租房酒店详情
curl "https://bobapro.life/api/custom/rentals/2/detail" | jq
```

### 测试外部管理API（需要Token）

```bash
# 设置Token变量
export API_TOKEN="your-api-token"

# 获取API列表
curl -H "X-API-Token: $API_TOKEN" \
  "https://bobapro.life/api/external/custom-apis"

# 获取API详情
curl -H "X-API-Token: $API_TOKEN" \
  "https://bobapro.life/api/external/custom-apis/3"

# 追加新项目
curl -X PATCH \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "data",
    "value": {
      "id": 5,
      "name": "测试项目",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/5/detail"
    }
  }' \
  "https://bobapro.life/api/external/custom-apis/3/content"
```

## 十、数据完整性检查脚本

运行以下脚本检查所有API数据：

```bash
node -e "
const {allAsync, waitForDbReady} = require('./db/database');
(async () => {
  await waitForDbReady();
  const apis = await allAsync('SELECT id, name, path, response_content FROM custom_apis WHERE path IN (\"/hot-spots\", \"/rentals\", \"/second-hand\", \"/blacklist\", \"/nile-hot\") ORDER BY path');
  let allPassed = true;
  for (const api of apis) {
    const content = JSON.parse(api.response_content);
    const items = Array.isArray(content) ? content : (content.data || [content]);
    const ids = items.map(i => i.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    const issues = [];
    if (duplicates.length > 0) {
      issues.push(\`重复ID: \${[...new Set(duplicates)].join(', ')}\`);
      allPassed = false;
    }
    items.forEach((item, index) => {
      if (!item.id) issues.push(\`项目\${index}: 缺少id\`);
      if (!item.name) issues.push(\`项目\${index}: 缺少name\`);
      if (!item.detailApi) issues.push(\`项目\${index}: 缺少detailApi\`);
      const expectedDetailApi = \`https://bobapro.life/api/custom\${api.path}/\${item.id}/detail\`;
      if (item.detailApi !== expectedDetailApi) {
        issues.push(\`项目\${index}: detailApi格式错误\`);
        allPassed = false;
      }
    });
    if (issues.length > 0) {
      console.log(\`\${api.path}: ✗\`, issues);
    } else {
      console.log(\`\${api.path}: ✓ (\${items.length}个项目)\`);
    }
  }
  console.log(\`\n总体: \${allPassed ? '✓ 全部通过' : '✗ 发现问题'}\`);
})();
"
```

## 总结

✅ 所有5个API的数据已完全迁移并符合新规则：
- 必填字段完整（id, name, detailApi）
- detailApi格式标准化
- ID唯一性保证
- 可选字段根据数据情况保留

所有API现在都可以通过外部管理接口进行增删改查操作。
