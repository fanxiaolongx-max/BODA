# 自定义API严格格式标准

## 一、概述

本文档定义了自定义API的严格格式标准，**不允许兼容和降级**，所有API必须严格按照此标准实现。

## 二、二级菜单（列表API）标准格式

### 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | number | 唯一标识符，必须为正整数 |
| `name` | string | 名称，用于卡片显示，必须是非空字符串 |
| `detailApi` | string | 详情API地址（如果有三级菜单），必须包含 `/detail` 或 `/detial` |

### 可选字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 标题，用于详情页标题 |
| `description` | string | 描述信息 |
| `image` | string | 图片URL |
| `category` | string | 分类 |

### 响应格式

**格式1：直接数组（推荐）**
```json
[
  {
    "id": 1,
    "name": "项目名称",
    "title": "详情页标题（可选）",
    "description": "项目描述",
    "image": "https://example.com/image.jpg",
    "category": "分类名称",
    "detailApi": "https://bobapro.life/api/custom/path/1/detail"
  }
]
```

**格式2：对象包装**
```json
{
  "data": [
    {
      "id": 1,
      "name": "项目名称",
      "detailApi": "https://bobapro.life/api/custom/path/1/detail"
    }
  ],
  "total": 100,
  "hasMore": true
}
```

### 验证规则

1. **id字段**：
   - 必须存在且不为null/undefined
   - 必须为正整数
   - 同一列表中的id必须唯一

2. **name字段**：
   - 必须存在且为非空字符串
   - 不允许从其他字段推断（必须明确提供）

3. **detailApi字段**（如果有三级菜单）：
   - 必须包含 `/detail` 或 `/detial`
   - 推荐格式：`https://bobapro.life/api/custom{path}/{id}/detail`

4. **可选字段**：
   - 如果提供，必须符合类型要求
   - `title`、`description`、`image`、`category` 必须是字符串

## 三、三级菜单（详情API）标准格式

### 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `content` | string | HTML格式的文章内容（必填） |

### 可选字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 文章标题 |
| `meta` | string | 元信息（如日期） |

### 响应格式

```json
{
  "content": "<h2>详细说明</h2><p>这是一段详细的描述内容...</p><p>更多信息请参考官方文档。</p>",
  "title": "文章标题",
  "meta": "2024-01-15"
}
```

### 验证规则

1. **content字段**：
   - 必须存在且为非空字符串
   - 支持标准HTML标签：`<p>`、`<h1>`、`<h2>`、`<h3>`、`<ul>`、`<ol>`、`<li>`、`<img>`、`<a>`等
   - 注意：小程序使用rich-text组件渲染，支持的标签有限

2. **title字段**（可选）：
   - 如果提供，必须是字符串
   - 如果不提供，导航栏将使用默认标题

3. **meta字段**（可选）：
   - 如果提供，必须是字符串

4. **非标准字段**：
   - 不允许包含除 `content`、`html`、`title`、`meta` 之外的其他字段
   - 如果存在 `html` 字段，将自动转换为 `content` 字段

## 四、二级菜单与三级菜单的区别

### 二级菜单（列表API）

- **路径**：不包含 `/detail` 或 `/detial`
- **用途**：返回列表数据
- **必填字段**：`id`、`name`
- **detailApi**：可选，如果有三级菜单则必填

### 三级菜单（详情API）

- **路径**：包含 `/detail` 或 `/detial`
- **用途**：返回详情内容
- **必填字段**：`content`（或 `html`）
- **格式**：必须是对象，不能是数组

## 五、数据迁移

### 迁移脚本

使用 `db/migrate-custom-api-strict.js` 进行严格规范化：

```bash
node db/migrate-custom-api-strict.js
```

### 验证脚本

使用 `db/validate-custom-api-format.js` 验证格式：

```bash
node db/validate-custom-api-format.js
```

## 六、常见错误

### 错误1：列表API缺少必填字段

**错误示例**：
```json
[
  {
    "name": "项目名称"
    // 缺少 id 字段
  }
]
```

**正确格式**：
```json
[
  {
    "id": 1,
    "name": "项目名称"
  }
]
```

### 错误2：detailApi格式不正确

**错误示例**：
```json
{
  "id": 1,
  "name": "项目名称",
  "detailApi": "https://bobapro.life/api/custom/test"  // 缺少 /detail
}
```

**正确格式**：
```json
{
  "id": 1,
  "name": "项目名称",
  "detailApi": "https://bobapro.life/api/custom/path/1/detail"
}
```

### 错误3：详情API格式错误

**错误示例**：
```json
[
  {
    "content": "<p>内容</p>"
  }
]
```

**正确格式**：
```json
{
  "content": "<p>内容</p>",
  "title": "标题",
  "meta": "2024-01-15"
}
```

## 七、实施要求

1. **严格验证**：所有API创建和更新操作必须通过格式验证
2. **不允许兼容**：不支持旧格式，必须严格按照新标准
3. **不允许降级**：不允许使用简化格式或省略必填字段
4. **自动规范化**：使用迁移脚本自动规范化现有数据
5. **持续验证**：定期运行验证脚本确保数据符合标准

## 八、API示例

### 二级菜单示例

**API路径**：`/hot-spots`

**响应**：
```json
[
  {
    "id": 1,
    "name": "金字塔",
    "title": "金字塔详情",
    "description": "世界七大奇迹之一",
    "image": "https://example.com/pyramid.jpg",
    "category": "景点",
    "detailApi": "https://bobapro.life/api/custom/hot-spots/1/detail"
  }
]
```

### 三级菜单示例

**API路径**：`/hot-spots/1/detail`

**响应**：
```json
{
  "content": "<h2>金字塔详情</h2><p>金字塔是古埃及法老的陵墓，世界七大奇迹之一...</p>",
  "title": "金字塔详情",
  "meta": "2024-01-15"
}
```

## 九、更新日志

- **2025-12-12**：创建严格格式标准，不允许兼容和降级
- **2025-12-12**：规范化所有现有API数据
- **2025-12-12**：修复detailApi路径错误
