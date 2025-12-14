# 文章Slug唯一性和稳定性保护机制

## 问题背景

文章slug用于生成文章的URL，如果slug不唯一或不稳定，会导致：
1. 主页点击文章跳转到错误文章
2. 文章链接失效
3. SEO问题

## Slug生成规则

### 稳定Slug生成算法

基于文章ID生成稳定的slug，格式：`{baseSlug}-{idSuffix}`

- `baseSlug`: 从文章名称生成（小写，去除特殊字符，空格转连字符）
- `idSuffix`: 文章ID的前8位（去除特殊字符）

**示例**：
- 文章名称："开罗市中心公寓"
- 文章ID："4693bb6f-b128-42a5-975d-2367feef8142"
- 生成的slug："开罗市中心公寓-4693bb6f"

### 唯一性保证

1. 生成slug时检查全局唯一性
2. 如果冲突，在基础slug后添加计数器：`{baseSlug}-{counter}`
3. 排除当前文章（编辑时）

## 保护机制

### 1. 博客管理界面（blog-admin.html）

**位置**: `utils/blog-helper.js` 的 `createBlogPost` 和 `updateBlogPost` 函数

**保护逻辑**:
- **创建文章**: 基于ID生成稳定slug，检查全局唯一性
- **更新文章**: 
  - 如果提供了新slug，检查唯一性（排除当前文章）
  - 如果没有slug，基于ID生成稳定slug
  - 确保slug不会因为名称改变而改变（除非用户明确修改）

### 2. API Management界面（admin.js）

**位置**: `routes/admin.js` 的 `PUT /api/admin/custom-apis/:id` 路由

**保护逻辑**:
1. 检查是否是GET方法的API（可能包含博客文章）
2. 读取原始API的 `response_content`
3. 通过文章的 `name`/`title` 匹配原始文章
4. 恢复原始ID和slug
5. 如果slug缺失或冲突，基于ID生成稳定的slug

### 3. 外部API更新（external.js）

**位置**: `routes/external.js` 的 `PUT /api/external/custom-apis/:id` 和 `PATCH /api/external/custom-apis/:id/content` 路由

**保护逻辑**:
- **PUT操作**: 与API Management界面相同的保护逻辑
- **PATCH操作**: 
  - 在更新后检查所有文章的ID和slug
  - 恢复被修改的ID和slug
  - 为新文章生成UUID和稳定slug

### 4. 文章转换（convertApiItemToPost）

**位置**: `utils/blog-helper.js` 的 `convertApiItemToPost` 函数

**保护逻辑**:
- 如果文章已有slug，使用原有slug
- 如果没有slug，基于ID生成稳定slug
- 确保slug与ID绑定，保持稳定性

## ID保护机制

### ID稳定性

1. **创建时**: 生成全局唯一的UUID
2. **更新时**: 明确保留原始ID，不允许修改
3. **API Management**: 通过name/title匹配恢复原始ID
4. **外部API**: 同样的保护机制

### ID格式要求

- 所有文章ID必须是UUID格式（8-4-4-4-12格式）
- 天气路况对象格式使用特殊ID：`weather-{apiName}`

## 修复脚本

### 修复所有文章的slug

运行以下命令修复所有现有文章的slug：

```bash
node db/fix-post-slugs.js
```

**功能**:
- 扫描所有API中的文章
- 为每个文章生成基于ID的稳定slug
- 确保slug唯一性
- 更新数据库

## 验证方法

### 检查slug唯一性

可以运行以下SQL查询检查slug重复：

```sql
-- 需要从所有API的response_content中提取并检查
-- 建议使用修复脚本自动检查
```

### 检查ID唯一性

运行以下命令：

```bash
node db/verify-post-ids-unique.js
```

## 注意事项

1. **Slug格式**: slug应该只包含小写字母、数字和连字符
2. **Slug长度**: 建议不超过100个字符
3. **Slug稳定性**: slug一旦生成，应该保持稳定，除非用户明确修改
4. **ID和Slug绑定**: slug应该与ID绑定，确保即使名称改变，slug也能保持稳定
5. **特殊类别**: 
   - 天气路况使用固定slug：`weather`
   - 其他特殊类别也使用基于ID的稳定slug

## 相关文件

- `utils/blog-helper.js`: 博客文章CRUD逻辑，slug生成和验证
- `routes/blog-admin.js`: 博客管理API路由
- `routes/admin.js`: API Management更新逻辑，ID和slug保护
- `routes/external.js`: 外部API更新逻辑，ID和slug保护
- `db/fix-post-slugs.js`: Slug修复脚本
- `db/verify-post-ids-unique.js`: ID唯一性验证脚本

## 更新日志

- 2025-01-XX: 添加基于ID的稳定slug生成机制
- 2025-01-XX: 在所有更新接口中添加slug保护
- 2025-01-XX: 创建修复脚本修复所有现有文章的slug
