# 外部API管理接口完整指南

## 一、接口概览

所有外部API管理接口位于 `/api/external/custom-apis`，使用API Token认证。

### 基础信息

- **Base URL**: `http://localhost:3000/api/external`
- **认证方式**: API Token
  - 请求头: `X-API-Token: <token>`
  - 或: `Authorization: Bearer <token>`
  - 或: 查询参数 `?token=<token>`（不推荐）
- **内容类型**: `application/json`
- **速率限制**: 100次/15分钟

## 二、完整API接口列表

### 1. 获取API列表

**GET** `/api/external/custom-apis`

**查询参数**:
- `page` (可选): 页码，默认1
- `limit` (可选): 每页数量，默认50，最大100
- `status` (可选): 过滤状态，`active` 或 `inactive`
- `method` (可选): 过滤请求方法，`GET`, `POST`, `PUT`, `DELETE`, `PATCH`

**请求示例**:
```bash
curl -X GET \
  -H "X-API-Token: your-token" \
  "http://localhost:3000/api/external/custom-apis?page=1&limit=50&status=active"
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "apis": [
      {
        "id": 1,
        "name": "热门打卡地",
        "path": "/hot-spots",
        "method": "GET",
        "requires_token": false,
        "description": "热门打卡地列表",
        "status": "active",
        "created_at": "2025-01-15 10:00:00",
        "updated_at": "2025-01-15 10:00:00"
      }
    ],
    "total": 10,
    "page": 1,
    "limit": 50,
    "totalPages": 1
  }
}
```

### 2. 获取API详情

**GET** `/api/external/custom-apis/:id`

**请求示例**:
```bash
curl -X GET \
  -H "X-API-Token: your-token" \
  http://localhost:3000/api/external/custom-apis/1
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "热门打卡地",
    "path": "/hot-spots",
    "method": "GET",
    "requires_token": false,
    "response_content": "[{\"id\":1,\"name\":\"金字塔\",\"detailApi\":\"...\"}]",
    "description": "热门打卡地列表",
    "status": "active",
    "created_at": "2025-01-15 10:00:00",
    "updated_at": "2025-01-15 10:00:00"
  }
}
```

### 3. 创建API

**POST** `/api/external/custom-apis`

**请求体**:
```json
{
  "name": "新API",
  "path": "/new-api",
  "method": "GET",
  "requires_token": false,
  "response_content": "[{\"id\":1,\"name\":\"项目1\",\"detailApi\":\"https://bobapro.life/api/custom/new-api/1/detail\"}]",
  "description": "新创建的API",
  "status": "active"
}
```

**请求示例**:
```bash
curl -X POST \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "新API",
    "path": "/new-api",
    "method": "GET",
    "response_content": "[{\"id\":1,\"name\":\"项目1\",\"detailApi\":\"https://bobapro.life/api/custom/new-api/1/detail\"}]"
  }' \
  http://localhost:3000/api/external/custom-apis
```

**响应示例**:
```json
{
  "success": true,
  "message": "自定义API创建成功",
  "data": {
    "id": 2
  }
}
```

### 4. 更新API

**PUT** `/api/external/custom-apis/:id`

**请求体**（所有字段可选，但至少提供一个）:
```json
{
  "name": "更新后的名称",
  "status": "inactive"
}
```

**请求示例**:
```bash
curl -X PUT \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "更新后的名称",
    "status": "inactive"
  }' \
  http://localhost:3000/api/external/custom-apis/1
```

**响应示例**:
```json
{
  "success": true,
  "message": "自定义API更新成功"
}
```

### 5. 删除API

**DELETE** `/api/external/custom-apis/:id`

**请求示例**:
```bash
curl -X DELETE \
  -H "X-API-Token: your-token" \
  http://localhost:3000/api/external/custom-apis/1
```

**响应示例**:
```json
{
  "success": true,
  "message": "自定义API删除成功"
}
```

### 6. 部分更新API内容 ⭐ 新增功能

**PATCH** `/api/external/custom-apis/:id/content`

支持对 `response_content` 进行部分更新，无需替换整个JSON。

#### 6.1 更新字段值

**操作**: `update` 或 `add`

**请求示例**:
```bash
# 更新 data[0].name
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "0.name",
    "value": "更新后的名称"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content

# 更新嵌套字段 data[0].category
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

#### 6.2 追加元素到数组

**操作**: `append`

**请求示例**:
```bash
# 追加到数组末尾
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "data",
    "value": {
      "id": 10,
      "name": "新项目",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/10/detail"
    }
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

#### 6.3 删除数组元素

**操作**: `delete`

**请求示例**:
```bash
# 通过索引删除 data[0]
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

#### 6.4 删除字段

**操作**: `remove`

**请求示例**:
```bash
# 删除 data[0].oldField
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "remove",
    "path": "data.0.oldField"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

**响应示例**:
```json
{
  "success": true,
  "message": "内容更新成功",
  "data": {
    "updated_content": { /* 更新后的完整内容 */ }
  }
}
```

### 7. 获取API调用日志

**GET** `/api/external/custom-apis/:id/logs`

**查询参数**:
- `page` (可选): 页码，默认1
- `limit` (可选): 每页数量，默认50，最大100

**请求示例**:
```bash
curl -X GET \
  -H "X-API-Token: your-token" \
  "http://localhost:3000/api/external/custom-apis/1/logs?page=1&limit=50"
```

**响应示例**:
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": 1,
        "request_method": "GET",
        "request_path": "/api/custom/hot-spots",
        "response_status": 200,
        "response_time_ms": 15,
        "ip_address": "127.0.0.1",
        "created_at": "2025-01-15 10:00:00"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 50,
    "totalPages": 2
  }
}
```

## 三、实际使用场景示例

### 场景1：创建热门打卡地API

```bash
# 1. 创建列表API
curl -X POST \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "热门打卡地",
    "path": "/hot-spots",
    "method": "GET",
    "response_content": "[{\"id\":1,\"name\":\"金字塔\",\"title\":\"金字塔详情\",\"description\":\"世界七大奇迹之一\",\"image\":\"https://example.com/pyramid.jpg\",\"category\":\"景点\",\"detailApi\":\"https://bobapro.life/api/custom/hot-spots/1/detail\"}]",
    "description": "热门打卡地列表",
    "status": "active"
  }' \
  http://localhost:3000/api/external/custom-apis

# 响应: {"success": true, "data": {"id": 1}}
```

### 场景2：添加新项目到列表

```bash
# 假设API ID是1，response_content是数组格式
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "append",
    "path": "",
    "value": {
      "id": 2,
      "name": "狮身人面像",
      "title": "狮身人面像详情",
      "description": "古埃及著名古迹",
      "image": "https://example.com/sphinx.jpg",
      "category": "景点",
      "detailApi": "https://bobapro.life/api/custom/hot-spots/2/detail"
    }
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

### 场景3：更新项目信息

```bash
# 更新第一个项目的名称
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "0.name",
    "value": "金字塔（更新）"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content

# 更新第一个项目的分类
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "update",
    "path": "0.category",
    "value": "世界遗产"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

### 场景4：删除项目

```bash
# 删除第一个项目（索引0）
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "delete",
    "path": "0"
  }' \
  http://localhost:3000/api/external/custom-apis/1/content
```

### 场景5：批量操作

```bash
# 批量添加多个项目
for i in {3..5}; do
  curl -X PATCH \
    -H "X-API-Token: your-token" \
    -H "Content-Type: application/json" \
    -d "{
      \"operation\": \"append\",
      \"path\": \"\",
      \"value\": {
        \"id\": $i,
        \"name\": \"项目$i\",
        \"detailApi\": \"https://bobapro.life/api/custom/hot-spots/$i/detail\"
      }
    }" \
    http://localhost:3000/api/external/custom-apis/1/content
done
```

## 四、字段结构标准

### 列表API标准字段

所有列表API返回的数据项必须包含以下字段：

**必填字段**:
- `id`: 唯一标识符
- `name`: 名称（用于卡片显示）
- `detailApi`: 详情API地址

**可选字段**:
- `title`: 标题（用于详情页标题）
- `description`: 描述信息
- `image`: 图片URL
- `category`: 分类

**标准格式示例**:
```json
{
  "id": 1,
  "name": "项目名称",
  "title": "详情页标题",
  "description": "项目描述",
  "image": "https://example.com/image.jpg",
  "category": "分类",
  "detailApi": "https://bobapro.life/api/custom/path/1/detail"
}
```

### 详情API标准格式

详情API应返回HTML内容：

```json
{
  "content": "<h2>标题</h2><p>HTML内容...</p>",
  "title": "文章标题",
  "meta": "2024-01-15"
}
```

或：

```json
{
  "html": "<h2>标题</h2><p>HTML内容...</p>",
  "title": "文章标题"
}
```

## 五、路径表达式说明

部分更新接口使用路径表达式来指定要修改的位置：

### 路径格式

- **对象字段**: 使用点号分隔，如 `data.name`、`user.profile.email`
- **数组索引**: 使用数字索引，如 `items.0`、`data.list.2`
- **混合路径**: 如 `data.items.0.name`

### 示例

假设 `response_content` 是：
```json
{
  "data": [
    {
      "id": 1,
      "name": "项目1",
      "category": "分类1"
    }
  ]
}
```

路径示例：
- `data.0.name` - 更新第一个项目的名称
- `data.0.category` - 更新第一个项目的分类
- `data` - 追加元素到data数组

## 六、错误处理

### 错误响应格式

```json
{
  "success": false,
  "message": "错误描述",
  "code": "ERROR_CODE"
}
```

### 常见错误码

| 错误码 | HTTP状态 | 说明 |
|--------|----------|------|
| `UNAUTHORIZED` | 401 | Token无效或缺失 |
| `NOT_FOUND` | 404 | API不存在 |
| `VALIDATION_ERROR` | 400 | 参数验证失败 |
| `DUPLICATE_PATH` | 400 | 路径已存在 |
| `INVALID_JSON` | 400 | JSON格式无效 |
| `OPERATION_FAILED` | 400 | 操作失败（路径不存在） |
| `SERVER_ERROR` | 500 | 服务器错误 |

## 七、配置API Token

API Token需要在管理后台配置：

1. 登录管理后台
2. 进入"系统设置"
3. 找到"自定义API Token"设置
4. 设置强随机字符串作为Token
5. 保存设置

**安全建议**:
- 使用至少32字符的强随机字符串
- 定期轮换Token
- 不要在代码中硬编码Token
- 使用环境变量存储Token

## 八、测试建议

### 使用curl测试

```bash
# 设置Token变量
export API_TOKEN="your-token"

# 获取列表
curl -H "X-API-Token: $API_TOKEN" \
  http://localhost:3000/api/external/custom-apis

# 创建API
curl -X POST \
  -H "X-API-Token: $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d @api-data.json \
  http://localhost:3000/api/external/custom-apis
```

### 使用Postman测试

1. 创建新请求
2. 设置URL: `http://localhost:3000/api/external/custom-apis`
3. 添加Header: `X-API-Token: your-token`
4. 选择请求方法（GET/POST/PUT/DELETE/PATCH）
5. 发送请求

## 九、迁移脚本

已创建自动迁移脚本，可以将旧数据迁移到新格式：

```bash
node db/migrate-custom-api-fields.js
```

迁移脚本会自动：
- 为缺少 `name` 的项从 `title` 生成
- 为缺少 `detailApi` 的项生成标准格式的详情API地址
- 保留所有扩展字段
- 确保所有必填字段都存在

## 十、完整工作流程示例

### 创建并管理一个完整的API

```bash
# 1. 创建列表API
API_ID=$(curl -s -X POST \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "测试API",
    "path": "/test",
    "method": "GET",
    "response_content": "[]",
    "status": "active"
  }' \
  http://localhost:3000/api/external/custom-apis | jq -r '.data.id')

echo "创建的API ID: $API_ID"

# 2. 添加第一个项目
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d "{
    \"operation\": \"append\",
    \"path\": \"\",
    \"value\": {
      \"id\": 1,
      \"name\": \"项目1\",
      \"detailApi\": \"https://bobapro.life/api/custom/test/1/detail\"
    }
  }" \
  http://localhost:3000/api/external/custom-apis/$API_ID/content

# 3. 添加第二个项目
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d "{
    \"operation\": \"append\",
    \"path\": \"\",
    \"value\": {
      \"id\": 2,
      \"name\": \"项目2\",
      \"detailApi\": \"https://bobapro.life/api/custom/test/2/detail\"
    }
  }" \
  http://localhost:3000/api/external/custom-apis/$API_ID/content

# 4. 更新第一个项目
curl -X PATCH \
  -H "X-API-Token: your-token" \
  -H "Content-Type: application/json" \
  -d "{
    \"operation\": \"update\",
    \"path\": \"0.name\",
    \"value\": \"更新后的项目1\"
  }" \
  http://localhost:3000/api/external/custom-apis/$API_ID/content

# 5. 查看API详情
curl -H "X-API-Token: your-token" \
  http://localhost:3000/api/external/custom-apis/$API_ID

# 6. 查看调用日志
curl -H "X-API-Token: your-token" \
  http://localhost:3000/api/external/custom-apis/$API_ID/logs
```

## 十一、注意事项

1. **detailApi必填**: 所有列表项必须包含 `detailApi` 字段
2. **name必填**: 所有列表项必须包含 `name` 字段
3. **路径格式**: 路径必须以 `/` 开头
4. **JSON格式**: 所有 `response_content` 必须是有效的JSON
5. **路径唯一性**: 同一路径和方法组合只能存在一个API
6. **Token安全**: 生产环境请使用强随机Token
7. **速率限制**: 注意不要超过100次/15分钟的限制

## 十二、相关文档

- [自定义API使用示例](./CUSTOM_API_EXAMPLES.md) - 详细的字段结构和示例
- [API文档](./API.md) - 完整的API接口文档
- [安全文档](./SECURITY.md) - 安全配置和最佳实践
