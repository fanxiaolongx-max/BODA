# 文章ID保护机制说明

## 问题背景

文章ID是全局唯一的UUID，用于标识每篇文章。如果ID被意外修改，会导致：
1. 文章在博客管理中无法找到
2. 文章去重逻辑失效，出现重复显示
3. 文章编辑和删除功能失效

## ID保护机制

### 1. 博客管理界面（已保护）

**位置**: `utils/blog-helper.js` 的 `updateBlogPost` 函数

**保护逻辑**:
```javascript
const originalId = originalItem.id;
const updatedItem = {
  ...originalItem,
  ...postData,
  id: originalId, // 使用原始ID，确保ID不变
  updatedAt: new Date().toISOString()
};
```

**说明**: 博客管理界面更新文章时，明确保留原始ID，不允许修改。

### 2. API Management界面（已添加保护）

**位置**: `routes/admin.js` 的 `PUT /api/admin/custom-apis/:id` 路由

**保护逻辑**:
1. 检查是否是GET方法的API（可能包含博客文章）
2. 读取原始API的 `response_content`
3. 通过文章的 `name`/`title` 匹配原始文章
4. 如果新数据中的ID不是UUID格式或与原始ID不同，自动恢复原始ID

**代码逻辑**:
- 创建原始ID映射（基于name/title）
- 遍历新数据，检查每个文章的ID
- 如果ID被修改（不是UUID或与原始ID不同），恢复原始ID
- 记录日志，但不阻止保存操作

## 注意事项

1. **ID格式要求**: 所有文章ID必须是UUID格式（8-4-4-4-12格式）
2. **ID唯一性**: 每个文章的ID在整个系统中必须唯一
3. **ID不可修改**: 一旦文章创建，ID不应该被修改
4. **匹配机制**: API Management保护ID时，通过 `name`/`title` 匹配文章，如果名称相同，会恢复原始ID

## 验证方法

运行以下命令检查所有文章的ID唯一性：

```bash
node db/verify-post-ids-unique.js
```

如果发现重复ID，运行修复脚本：

```bash
node db/fix-duplicate-post-ids.js
```

## 相关文件

- `utils/blog-helper.js`: 博客文章CRUD逻辑
- `routes/admin.js`: API Management更新逻辑
- `db/fix-duplicate-post-ids.js`: ID修复脚本
- `db/verify-post-ids-unique.js`: ID验证脚本
