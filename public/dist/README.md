# CSS 构建文件

此目录包含 Tailwind CSS 构建后的文件。

## 文件说明

- `output.css` - Tailwind CSS 构建后的样式文件（已压缩）

## 构建说明

此文件是在本地构建后提交到仓库的。如果修改了 HTML 或 JS 文件中的 Tailwind 类名，需要：

1. 在本地运行构建命令：
   ```bash
   npm run build:css:prod
   ```

2. 提交构建后的文件：
   ```bash
   git add public/dist/output.css
   git commit -m "Update CSS"
   git push
   ```

## 为什么提交构建文件？

- 简化部署流程，无需在服务器上安装构建工具
- 确保所有环境使用相同的 CSS 文件
- 加快部署速度

