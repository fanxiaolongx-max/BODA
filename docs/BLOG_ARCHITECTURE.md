# 博客文章系统架构文档

## 📋 目录

- [概述](#概述)
- [数据库架构](#数据库架构)
- [数据流程](#数据流程)
- [API路由机制](#api路由机制)
- [CRUD操作详解](#crud操作详解)
- [数据同步机制](#数据同步机制)
- [缓存机制](#缓存机制)
- [字段映射系统](#字段映射系统)
- [迁移历史](#迁移历史)

---

## 概述

博客文章系统已完成数据库重构，从原来的 `custom_apis.response_content` JSON 存储方式迁移到独立的 `blog_posts` 数据库表。这带来了更好的性能、数据一致性和可维护性。

### 核心改进

1. **独立数据表**：文章数据存储在 `blog_posts` 表中，不再依赖 `custom_apis.response_content`
2. **直接数据库操作**：所有CRUD操作直接操作数据库表，无需解析JSON
3. **API路由智能切换**：API路由自动检测并从 `blog_posts` 表读取数据
4. **向后兼容**：保持API响应格式兼容性，不影响现有前端代码

---

## 数据库架构

### blog_posts 表结构

```sql
CREATE TABLE blog_posts (
  id TEXT PRIMARY KEY,                    -- 全局唯一UUID
  api_name TEXT NOT NULL,                 -- API名称（分类标识）
  name TEXT NOT NULL,                     -- 文章名称
  title TEXT,                             -- 文章标题（与name保持一致）
  slug TEXT,                              -- URL友好的标识符（唯一）
  excerpt TEXT,                           -- 摘要
  description TEXT,                       -- 描述（与excerpt保持一致）
  html_content TEXT,                      -- HTML内容
  image TEXT,                             -- 图片URL
  category TEXT,                          -- 分类/标签
  published INTEGER DEFAULT 0,            -- 是否发布（0=未发布，1=已发布）
  views INTEGER DEFAULT 0,               -- 阅读量
  created_at DATETIME,                    -- 创建时间
  updated_at DATETIME,                    -- 更新时间
  custom_fields TEXT DEFAULT '{}'         -- 自定义字段（JSON格式）
);
```

### 索引

- `idx_blog_posts_api_name` - API名称索引（用于分类查询）
- `idx_blog_posts_published` - 发布状态索引（用于筛选已发布文章）
- `idx_blog_posts_slug` - Slug索引（用于快速查找）
- `idx_blog_posts_slug_unique` - Slug唯一索引（确保URL唯一性）
- `idx_blog_posts_category` - 分类索引（用于分类筛选）
- `idx_blog_posts_created_at` - 创建时间索引（用于排序）

### custom_fields 字段说明

`custom_fields` 是一个JSON字段，用于存储特殊字段，例如：

```json
{
  "price": 1000,
  "rooms": 2,
  "area": 80,
  "phone": "+201234567890",
  "address": "开罗市中心",
  "latitude": 30.0444,
  "longitude": 31.2357
}
```

这些字段主要用于：
- **二手市场**：price（价格）
- **租房酒店**：price（价格）、rooms（房间数）、area（面积）
- **位置信息**：phone（电话）、address（地址）、latitude（纬度）、longitude（经度）

---

## 数据流程

### 1. 文章创建流程

```
用户提交文章数据
    ↓
验证API是否存在（custom_apis表）
    ↓
生成全局唯一UUID
    ↓
生成稳定slug（基于name和id）
    ↓
构建custom_fields JSON
    ↓
插入到 blog_posts 表
    ↓
清除缓存
    ↓
返回创建的文章对象
```

### 2. 文章更新流程

```
用户提交更新数据
    ↓
从 blog_posts 表查找文章
    ↓
验证新API是否存在（如果分类改变）
    ↓
更新基本字段（name, title, slug等）
    ↓
更新 custom_fields JSON
    ↓
更新 api_name（如果分类改变）
    ↓
执行 UPDATE 操作
    ↓
清除缓存
    ↓
返回更新后的文章对象
```

### 3. 文章读取流程

```
API请求到达
    ↓
custom-api-router 检查是否是博客文章API
    ↓
检查 blog_posts 表中是否有该API的文章
    ↓
如果有：从 blog_posts 表读取
    ↓
如果没有：使用原始 response_content
    ↓
应用字段映射（如果有配置）
    ↓
返回数据（保持原有格式兼容性）
```

### 4. 文章删除流程

```
用户请求删除文章
    ↓
从 blog_posts 表删除记录
    ↓
清除缓存
    ↓
返回删除结果
```

---

## API路由机制

### 智能路由切换

`utils/custom-api-router.js` 实现了智能路由切换机制：

```javascript
// 检查是否是博客文章API
if (api.method === 'GET' && !api.path.startsWith('/blog/')) {
  // 检查是否有文章属于这个API
  const posts = await allAsync(
    `SELECT COUNT(*) as count FROM blog_posts WHERE api_name = ?`,
    [api.name]
  );
  
  if (posts[0].count > 0) {
    // 从 blog_posts 表读取
    const blogPosts = await getBlogPosts({ 
      publishedOnly: false,
      category: api.name 
    });
    
    // 保持原有格式兼容性
    responseData = originalFormat === 'object' 
      ? { data: blogPosts } 
      : blogPosts;
  } else {
    // 没有文章，使用原始 response_content
    responseData = JSON.parse(api.response_content);
  }
}
```

### 判断逻辑

1. **是否是博客文章API**：
   - `method === 'GET'`（只处理GET请求）
   - `path NOT LIKE '/blog/%'`（排除博客系统专用路径）

2. **是否有文章数据**：
   - 查询 `blog_posts` 表，检查是否有 `api_name` 匹配的记录
   - 如果有，从 `blog_posts` 表读取
   - 如果没有，使用原始的 `response_content`

3. **格式兼容性**：
   - 检查原始 `response_content` 的格式（数组或对象）
   - 保持相同的格式返回，确保前端代码无需修改

---

## CRUD操作详解

### 创建文章 (createBlogPost)

**位置**：`utils/blog-helper.js`

**流程**：
1. 验证 `apiName` 是否存在（查询 `custom_apis` 表）
2. 生成全局唯一UUID（如果未提供）
3. 生成稳定slug（基于name和id）
4. 构建 `custom_fields` JSON（存储特殊字段）
5. 插入到 `blog_posts` 表
6. 清除缓存
7. 返回创建的文章对象

**关键代码**：
```javascript
await runAsync(`
  INSERT INTO blog_posts (
    id, api_name, name, title, slug, excerpt, description,
    html_content, image, category, published, views,
    created_at, updated_at, custom_fields
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`, [postId, apiName, name, title, slug, ...]);
```

### 更新文章 (updateBlogPost)

**位置**：`utils/blog-helper.js`

**流程**：
1. 从 `blog_posts` 表查找文章
2. 验证新API是否存在（如果分类改变）
3. 构建更新字段列表
4. 更新 `custom_fields` JSON（如果需要）
5. 执行 UPDATE 操作
6. 清除缓存
7. 返回更新后的文章对象

**关键代码**：
```javascript
await runAsync(`
  UPDATE blog_posts 
  SET ${updateFields.join(', ')}
  WHERE id = ?
`, updateValues);
```

### 读取文章 (getBlogPosts)

**位置**：`utils/blog-helper.js`

**流程**：
1. 检查缓存（仅在无筛选条件时）
2. 构建SQL查询条件
3. 从 `blog_posts` 表查询
4. 批量获取字段映射配置
5. 转换为文章格式
6. 应用字段映射（如果需要）
7. 缓存结果（仅在无筛选条件时）

**关键代码**：
```javascript
const rows = await allAsync(`
  SELECT 
    id, api_name, name, title, slug, excerpt, description,
    html_content, image, category, published, views,
    created_at, updated_at, custom_fields
  FROM blog_posts
  ${whereClause}
  ORDER BY api_name ASC, id ASC
`, queryParams);
```

### 删除文章 (deleteBlogPost)

**位置**：`utils/blog-helper.js`

**流程**：
1. 从 `blog_posts` 表删除记录
2. 清除缓存
3. 返回删除结果

**关键代码**：
```javascript
const result = await runAsync('DELETE FROM blog_posts WHERE id = ?', [postId]);
```

### 增加阅读量 (incrementPostViews)

**位置**：`utils/blog-helper.js`

**流程**：
1. 查找文章（通过slug）
2. 直接更新 `blog_posts` 表的 `views` 字段
3. 清除缓存

**关键代码**：
```javascript
await runAsync(
  `UPDATE blog_posts 
   SET views = views + 1, updated_at = datetime('now', 'localtime')
   WHERE id = ?`,
  [post.id]
);
```

---

## 数据同步机制

### 问题背景

在重构之前，文章数据存储在 `custom_apis.response_content` 中。重构后，数据迁移到 `blog_posts` 表，但 `custom_apis.response_content` 中可能仍有旧数据。

### 解决方案

**API路由智能切换**：
- API路由自动检测 `blog_posts` 表中是否有文章
- 如果有，从 `blog_posts` 表读取（新数据）
- 如果没有，使用 `response_content`（向后兼容）

**更新操作**：
- 所有更新操作只更新 `blog_posts` 表
- 不再同步更新 `custom_apis.response_content`
- API路由自动从 `blog_posts` 表读取最新数据

### 数据一致性保证

1. **单一数据源**：`blog_posts` 表是唯一的数据源
2. **自动切换**：API路由自动从正确的位置读取数据
3. **向后兼容**：对于没有迁移的API，仍使用 `response_content`

---

## 缓存机制

### 内存缓存

**位置**：`utils/blog-helper.js`

**缓存对象**：
```javascript
const postsCache = {
  data: null,           // 缓存的数据
  timestamp: null,      // 缓存时间戳
  ttl: 30000           // 缓存有效期（30秒）
};
```

### 缓存策略

1. **缓存条件**：仅在无筛选条件时缓存（`publishedOnly=false` 且无 `category`、`tag`、`search`）
2. **缓存更新**：所有写操作（创建、更新、删除）都会清除缓存
3. **缓存验证**：每次读取前检查缓存是否有效（30秒内）

### 缓存清除时机

- `createBlogPost` - 创建文章后
- `updateBlogPost` - 更新文章后
- `deleteBlogPost` - 删除文章后
- `incrementPostViews` - 增加阅读量后

---

## 字段映射系统

### 概述

字段映射系统允许不同API使用不同的字段名称，系统会自动映射到标准格式。

### 配置存储

字段映射配置存储在 `settings` 表中，key格式为：`blog_api_field_mapping_{apiName}`

**示例配置**：
```json
{
  "id": "id",
  "name": "title",
  "title": "title",
  "description": "content",
  "image": "cover_image",
  "htmlContent": "body"
}
```

### 映射流程

1. **读取配置**：从 `settings` 表读取字段映射配置
2. **应用映射**：使用 `convertApiItemToPost` 函数应用映射
3. **返回标准格式**：返回统一格式的文章对象

### 批量优化

为了提高性能，系统会批量获取所有API的字段映射配置：

```javascript
const apiNames = [...new Set(rows.map(row => row.api_name))];
const allFieldMappings = await getAllApiFieldMappings(apiNames);
```

---

## 迁移历史

### 第一阶段：创建表结构

**脚本**：`db/migrate-blog-posts.js`

**操作**：
- 创建 `blog_posts` 表
- 创建必要的索引

### 第二阶段：数据迁移

**脚本**：`db/migrate-posts-to-table.js`

**操作**：
- 从 `custom_apis.response_content` 读取所有文章
- 转换为标准格式
- 插入到 `blog_posts` 表
- 保留 `custom_fields` 中的特殊字段

**迁移结果**：
- 成功迁移 72 篇文章
- 覆盖 15 个API分类

### 第三阶段：代码重构

**修改的文件**：
1. `utils/blog-helper.js`
   - `getBlogPosts` - 从 `blog_posts` 表读取
   - `createBlogPost` - 插入到 `blog_posts` 表
   - `updateBlogPost` - 更新 `blog_posts` 表
   - `deleteBlogPost` - 从 `blog_posts` 表删除
   - `incrementPostViews` - 更新 `blog_posts` 表

2. `utils/custom-api-router.js`
   - 添加智能路由切换逻辑
   - 自动从 `blog_posts` 表读取数据

### 第四阶段：清理

**移除的代码**：
- `updateBlogPost` 中操作 `custom_apis.response_content` 的旧代码（500+行）
- 简化了 `incrementPostViews` 函数

---

## 性能优化

### 数据库查询优化

1. **批量查询**：批量获取字段映射配置，减少数据库查询次数
2. **索引优化**：为常用查询字段创建索引
3. **缓存机制**：30秒内存缓存，减少数据库查询

### 代码优化

1. **直接数据库操作**：不再需要解析JSON，直接操作数据库表
2. **事务支持**：使用数据库事务确保数据一致性
3. **参数化查询**：防止SQL注入，提高安全性

---

## 注意事项

### 1. API名称匹配

- `blog_posts.api_name` 必须与 `custom_apis.name` 完全匹配
- 这是API路由判断是否从 `blog_posts` 表读取的关键

### 2. Slug唯一性

- Slug必须全局唯一（通过唯一索引保证）
- 如果冲突，系统会自动生成新的slug

### 3. 字段映射

- 字段映射是可选的，如果没有配置，使用默认映射
- 字段映射只影响返回格式，不影响数据库存储

### 4. 向后兼容

- API响应格式保持兼容（数组或对象格式）
- 前端代码无需修改

---

## 相关文件

- `utils/blog-helper.js` - 博客文章CRUD操作
- `utils/custom-api-router.js` - API路由处理
- `routes/blog-admin.js` - 博客管理API路由
- `routes/blog.js` - 博客前端API路由
- `db/migrate-blog-posts.js` - 创建表结构
- `db/migrate-posts-to-table.js` - 数据迁移脚本

---

**最后更新**：2025-12-25  
**版本**：v1.0.0（重构后）

