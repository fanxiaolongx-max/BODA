# 自定义API标准格式示例文档

## 一、统一字段结构标准

所有瀑布流列表API统一使用以下标准字段结构：

### 标准字段（必填）

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number/string | 唯一标识符 |
| `name` | string | 名称，用于卡片显示 |
| `detailApi` | string | 详情API地址，用于获取详情内容 |

### 标准字段（可选）

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 标题，用于详情页标题 |
| `description` | string | 描述信息，用于卡片摘要显示 |
| `image` | string | 图片URL |
| `category` | string | 分类 |

### 扩展字段

除了标准字段外，可以根据业务需求添加其他扩展字段（如 `price`、`address`、`contact`、`latitude`、`longitude` 等）。

## 二、列表API标准格式

### 响应格式

**格式1：对象包装（推荐）**
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

**格式2：直接数组**
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

**格式1（推荐）**
```json
{
  "content": "<h2>标题</h2><p>HTML内容...</p>",
  "title": "文章标题",
  "meta": "2024-01-15"
}
```

**格式2**
```json
{
  "html": "<h2>标题</h2><p>HTML内容...</p>",
  "title": "文章标题"
}
```

## 四、各页面API完整示例

### 1. 热门打卡地 (hot-spots)

**列表API**: `GET /api/custom/hot-spots`

**响应示例**:
```json
[
  {
    "id": 1,
    "name": "金字塔1",
    "title": "金字塔详情",
    "description": "世界七大奇迹之一",
    "image": "https://bobapro.life/uploads/custom-api-images/1765482718830-t8npygw4.png",
    "category": "景点",
    "detailApi": "https://bobapro.life/api/custom/hot-spots/1/detail",
    "latitude": 29.9792,
    "longitude": 31.1342
  },
  {
    "id": 2,
    "name": "狮身人面像",
    "title": "狮身人面像详情",
    "description": "古埃及文明的象征",
    "image": "https://bobapro.life/uploads/custom-api-images/1765482718831-sphinx.png",
    "category": "景点",
    "detailApi": "https://bobapro.life/api/custom/hot-spots/2/detail",
    "latitude": 29.9753,
    "longitude": 31.1376
  }
]
```

**详情API**: `GET /api/custom/hot-spots/:id/detail`

**响应示例**:
```json
{
  "content": "<h2>金字塔详情</h2><p>金字塔是古埃及法老的陵墓，世界七大奇迹之一...</p>",
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
    "name": "开罗市中心公寓",
    "title": "开罗市中心公寓详情",
    "image": "https://bobapro.life/uploads/custom-api-images/rental1.jpg",
    "category": "公寓",
    "detailApi": "https://bobapro.life/api/custom/rentals/1/detail",
    "price": 5000,
    "address": "开罗市中心",
    "contact": "微信：rental001"
  },
  {
    "id": 2,
    "name": "尼罗河畔酒店",
    "title": "尼罗河畔酒店详情",
    "image": "https://bobapro.life/uploads/custom-api-images/rental2.jpg",
    "category": "酒店",
    "detailApi": "https://bobapro.life/api/custom/rentals/2/detail",
    "price": 3000,
    "address": "尼罗河畔",
    "contact": "微信：rental002"
  }
]
```

**详情API**: `GET /api/custom/rentals/:id/detail`

**响应示例**:
```json
{
  "content": "<h2>开罗市中心公寓</h2><p>位于开罗市中心，交通便利，设施齐全...</p><p>联系方式：微信：rental001</p>",
  "title": "开罗市中心公寓详情",
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
    "name": "二手iPhone 13",
    "title": "二手iPhone 13详情",
    "description": "9成新，功能完好",
    "image": "https://bobapro.life/uploads/custom-api-images/secondhand1.jpg",
    "category": "电子产品",
    "detailApi": "https://bobapro.life/api/custom/second-hand/1/detail",
    "price": 4000,
    "condition": "9成新"
  },
  {
    "id": 2,
    "name": "二手自行车",
    "title": "二手自行车详情",
    "description": "7成新，适合日常代步",
    "image": "https://bobapro.life/uploads/custom-api-images/secondhand2.jpg",
    "category": "交通工具",
    "detailApi": "https://bobapro.life/api/custom/second-hand/2/detail",
    "price": 500,
    "condition": "7成新"
  }
]
```

**详情API**: `GET /api/custom/second-hand/:id/detail`

**响应示例**:
```json
{
  "content": "<h2>二手iPhone 13</h2><p>9成新，功能完好，无拆修...</p><p>价格：4000 EGP</p>",
  "title": "二手iPhone 13详情",
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
    "name": "诈骗案例1",
    "title": "诈骗案例1详情",
    "description": "虚假投资平台诈骗",
    "detailApi": "https://bobapro.life/api/custom/blacklist/1/detail"
  },
  {
    "id": 2,
    "name": "诈骗案例2",
    "title": "诈骗案例2详情",
    "description": "网络购物诈骗",
    "detailApi": "https://bobapro.life/api/custom/blacklist/2/detail"
  }
]
```

**详情API**: `GET /api/custom/blacklist/:id/detail`

**响应示例**:
```json
{
  "content": "<h2>诈骗案例1</h2><p>虚假投资平台诈骗详情...</p><p>防范措施：1. 不要轻信高收益承诺 2. 核实平台资质...</p>",
  "title": "诈骗案例1详情",
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
    "name": "热映电影1",
    "title": "热映电影1详情",
    "description": "最新上映的精彩电影",
    "image": "https://bobapro.life/uploads/custom-api-images/movie1.jpg",
    "category": "动作片",
    "detailApi": "https://bobapro.life/api/custom/nile-hot/1/detail"
  },
  {
    "id": 2,
    "name": "热映电影2",
    "title": "热映电影2详情",
    "description": "悬疑惊悚大片",
    "image": "https://bobapro.life/uploads/custom-api-images/movie2.jpg",
    "category": "悬疑片",
    "detailApi": "https://bobapro.life/api/custom/nile-hot/2/detail"
  }
]
```

**详情API**: `GET /api/custom/nile-hot/:id/detail`

**响应示例**:
```json
{
  "content": "<h2>热映电影1</h2><p>最新上映的精彩动作电影...</p><p>上映时间：2024-01-15</p>",
  "title": "热映电影1详情",
  "meta": "2024-01-15"
}
```

## 五、使用外部API管理接口更新数据

### 1. 获取API列表

```bash
curl -X GET \
  -H "X-API-Token: your-api-token" \
  "https://bobapro.life/api/external/custom-apis?path=/hot-spots"
```

### 2. 获取API详情

```bash
curl -X GET \
  -H "X-API-Token: your-api-token" \
  "https://bobapro.life/api/external/custom-apis/3"
```

### 3. 更新字段值

```bash
# 更新name字段
curl -X PATCH \
  -H "X-API-Token: your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "data.0.name",
    "value": "新的名称"
  }' \
  "https://bobapro.life/api/external/custom-apis/3/content"
```

### 4. 追加元素到数组

```bash
# 追加新项目到列表
curl -X PATCH \
  -H "X-API-Token: your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "data",
    "value": {
      "id": 3,
      "name": "新项目",
      "title": "新项目详情",
      "description": "新项目描述",
      "image": "https://example.com/image.jpg",
      "category": "分类",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/3/detail"
    }
  }' \
  "https://bobapro.life/api/external/custom-apis/3/content"
```

### 5. 删除数组元素

```bash
# 通过索引删除
curl -X PATCH \
  -H "X-API-Token: your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "delete",
    "path": "data.0"
  }' \
  "https://bobapro.life/api/external/custom-apis/3/content"

# 通过值匹配删除
curl -X PATCH \
  -H "X-API-Token: your-api-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "delete",
    "path": "data",
    "value": {
      "id": 2,
      "name": "要删除的项目"
    }
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

## 六、字段验证规则

### 必填字段验证

所有列表API返回的数据必须包含以下字段：
- `id`: 必须存在且唯一
- `name`: 必须存在且非空字符串
- `detailApi`: 必须存在且格式为 `https://bobapro.life/api/custom{path}/{id}/detail`

### detailApi格式规则

- 必须包含路径和ID：`/hot-spots/1/detail`
- 必须使用完整URL：`https://bobapro.life/api/custom/hot-spots/1/detail`
- ID必须与项目的id字段匹配

### 可选字段建议

- `title`: 建议提供，用于详情页显示
- `description`: 建议提供，用于卡片摘要
- `image`: 建议提供，提升用户体验
- `category`: 建议提供，便于分类筛选

## 七、数据迁移状态

所有API数据已按照新规则完成迁移：

| API路径 | API ID | 项目数量 | 状态 |
|---------|--------|---------|------|
| `/hot-spots` | 3 | 2 | ✅ 已迁移 |
| `/rentals` | 4 | 2 | ✅ 已迁移 |
| `/second-hand` | 10 | 2 | ✅ 已迁移 |
| `/blacklist` | 14 | 26 | ✅ 已迁移 |
| `/nile-hot` | 15 | 3 | ✅ 已迁移 |

### 迁移统计

- ✅ 所有必填字段（id, name, detailApi）已完整
- ✅ 所有detailApi格式已标准化
- ✅ 可选字段根据数据情况保留

## 八、常见问题

### Q1: 如何添加新项目到列表？

使用 `PATCH /api/external/custom-apis/:id/content` 接口的 `append` 操作：

```json
{
  "operation": "append",
  "path": "data",
  "value": {
    "id": 新ID,
    "name": "新项目名称",
    "detailApi": "https://bobapro.life/api/custom/hot-spots/新ID/detail"
  }
}
```

### Q2: 如何更新项目的某个字段？

使用 `update` 操作：

```json
{
  "operation": "update",
  "path": "data.0.name",
  "value": "新的名称"
}
```

### Q3: detailApi格式不正确怎么办？

系统会自动修正detailApi格式，确保符合标准。如果发现格式不正确，可以：
1. 使用 `update` 操作手动修正
2. 重新运行迁移脚本：`node db/migrate-custom-api-fields.js`

### Q4: 如何批量更新多个项目？

目前需要逐个更新，或使用 `PUT /api/external/custom-apis/:id` 接口完全替换 `response_content`。

## 九、API测试示例

### 测试列表API

```bash
# 测试热门打卡地列表
curl "https://bobapro.life/api/custom/hot-spots"

# 测试租房酒店列表
curl "https://bobapro.life/api/custom/rentals"

# 测试二手市场列表
curl "https://bobapro.life/api/custom/second-hand"

# 测试防骗预警列表
curl "https://bobapro.life/api/custom/blacklist"

# 测试尼罗河热映列表
curl "https://bobapro.life/api/custom/nile-hot"
```

### 测试详情API

```bash
# 测试热门打卡地详情
curl "https://bobapro.life/api/custom/hot-spots/1/detail"

# 测试租房酒店详情
curl "https://bobapro.life/api/custom/rentals/1/detail"
```

### 测试外部管理API

```bash
# 获取API列表（需要Token）
curl -H "X-API-Token: your-token" \
  "https://bobapro.life/api/external/custom-apis"

# 获取API详情（需要Token）
curl -H "X-API-Token: your-token" \
  "https://bobapro.life/api/external/custom-apis/3"

# 追加新项目（需要Token）
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
  "https://bobapro.life/api/external/custom-apis/3/content"
```

## 十、数据完整性检查

运行以下命令检查所有API数据是否符合新规则：

```bash
node -e "
const {allAsync, waitForDbReady} = require('./db/database');
(async () => {
  await waitForDbReady();
  const apis = await allAsync('SELECT id, name, path, response_content FROM custom_apis WHERE path IN (\"/hot-spots\", \"/rentals\", \"/second-hand\", \"/blacklist\", \"/nile-hot\") ORDER BY path');
  for (const api of apis) {
    const content = JSON.parse(api.response_content);
    const items = Array.isArray(content) ? content : (content.data || [content]);
    const issues = [];
    items.forEach((item, index) => {
      if (!item.id) issues.push(\`项目\${index}: 缺少id\`);
      if (!item.name) issues.push(\`项目\${index}: 缺少name\`);
      if (!item.detailApi) issues.push(\`项目\${index}: 缺少detailApi\`);
      const expectedDetailApi = \`https://bobapro.life/api/custom\${api.path}/\${item.id}/detail\`;
      if (item.detailApi !== expectedDetailApi) {
        issues.push(\`项目\${index}: detailApi格式错误 (期望: \${expectedDetailApi})\`);
      }
    });
    if (issues.length > 0) {
      console.log(\`\${api.path}: 发现问题:\`, issues);
    } else {
      console.log(\`\${api.path}: ✓ 所有数据符合规范\`);
    }
  }
})();
"
```
