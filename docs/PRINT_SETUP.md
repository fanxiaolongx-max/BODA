# 打印小票设置指南

## 概述

系统支持两种打印方式：
1. **静默打印**（推荐）：使用 QZ Tray 或 WebPrint，无需用户确认，直接打印
2. **标准打印**：回退方案，使用浏览器打印对话框

## 安装 QZ Tray（推荐）

### 1. 下载并安装 QZ Tray

1. 访问 QZ Tray 官网：https://qz.io/download/
2. 下载适合您操作系统的安装程序
3. 安装并启动 QZ Tray（会在系统托盘显示图标）

### 2. 配置打印机

1. 确保您的热敏打印机已连接并安装驱动
2. QZ Tray 会自动检测系统打印机
3. 系统会使用默认打印机进行打印

### 3. 配置证书（用于静默打印）

QZ Tray 需要数字证书和私钥来实现静默打印（无需用户确认）。系统支持两种方式管理证书：

#### 方式一：通过管理界面上传（推荐，兼容云平台）

1. 登录管理员界面
2. 进入"系统设置"页面
3. 找到"🖨️ QZ Tray Certificate Settings"部分
4. 将 `digital-certificate.txt` 的内容粘贴到"Digital Certificate"文本框
5. 将 `private-key.pem` 的内容粘贴到"Private Key"文本框
6. 点击"Upload/Update Certificates"按钮

**优势：**
- ✅ 证书存储在数据库中，兼容 Fly.io 等云平台（文件系统可能只读）
- ✅ 支持动态更新证书，无需重启服务器
- ✅ 路径兼容性好，不依赖文件系统路径

#### 方式二：使用文件系统（传统方式）

1. 将 `digital-certificate.txt` 文件放到 `public/` 目录
2. 将 `private-key.pem` 文件放到 `public/` 目录

**注意：** 如果数据库中已有证书，系统会优先使用数据库中的证书。只有在数据库中没有证书时，才会回退到文件系统。

### 4. 首次连接

- 浏览器首次连接 QZ Tray 时会请求权限
- 点击"允许"以授予访问权限
- 可以选择"记住此站点"以避免重复授权

## 使用 WebPrint

如果您的环境使用 WebPrint：

1. 确保 WebPrint 服务已安装并运行
2. 系统会自动检测并优先使用 WebPrint
3. 无需额外配置

## 打印功能

### 使用方法

1. 在管理员界面打开"订单管理"
2. 找到需要打印的订单
3. 点击订单 Actions 列中的 "🖨️ Print Receipt" 按钮
4. 系统会自动：
   - 尝试使用 QZ Tray 静默打印（如果已安装）
   - 如果失败，尝试使用 WebPrint
   - 如果都不可用，打开标准打印对话框

### 打印内容

小票包含以下信息：
- 商店名称
- 订单号和日期时间
- 周期号（如有）
- 客户信息（姓名、电话）
- 商品列表（名称、规格、数量、价格）
- 价格明细（小计、折扣、余额使用、总计）
- 订单状态
- 备注（如有）

### 小票格式

- 宽度：80mm（标准热敏打印机宽度）
- 字体：Courier New（等宽字体，适合小票打印）
- 布局：专业的小票格式，简洁清晰

## 故障排除

### CSP (Content Security Policy) 配置

系统已自动配置 CSP 以支持 QZ Tray：
- ✅ 允许从 CDN 和本地加载 QZ Tray 脚本
- ✅ 允许 WebSocket 连接到 QZ Tray 本地服务（所有标准端口）
- ✅ 自动回退机制（本地文件 → CDN → 标准打印）

**重要：修改 CSP 配置后必须重启服务器！**

如果遇到 `NS_ERROR_CONTENT_BLOCKED` 或 CSP 错误：
1. **重启服务器**：修改 `server.js` 的 CSP 配置后必须重启 Node.js 服务器
2. **清除浏览器缓存**：按 `Ctrl+Shift+R` (Windows/Linux) 或 `Cmd+Shift+R` (Mac) 强制刷新
3. 检查浏览器控制台的 CSP 错误信息，确认是否包含 QZ Tray 的 WebSocket 端口
4. 验证 QZ Tray 桌面应用是否正在运行

### QZ Tray 连接失败

1. 检查 QZ Tray 是否已启动（查看系统托盘）
2. 检查浏览器是否允许了权限
3. 检查防火墙设置
4. 查看浏览器控制台的错误信息
5. **检查 CSP 错误**：如果看到 `Content-Security-Policy` 错误，说明 WebSocket 连接被阻止

### 打印内容为空

1. 检查订单数据是否正确加载
2. 查看浏览器控制台的调试信息
3. 尝试刷新页面后重新打印

### 打印机未响应

1. 检查打印机电源和连接
2. 检查打印机驱动是否正确安装
3. 在系统设置中测试打印机是否正常工作
4. 检查 QZ Tray 中的打印机设置

## 技术说明

### 工作原理

1. 系统首先尝试使用 QZ Tray 进行静默打印
2. 如果 QZ Tray 不可用，尝试使用 WebPrint
3. 如果两者都不可用，回退到标准浏览器打印对话框

### 代码结构

- `public/utils/print-helper.js` - 打印工具模块
- `public/admin.js` - 打印函数集成
- `public/admin.html` - QZ Tray 库引入

### 自定义设置

可以在 `public/admin.js` 的 `printOrderReceipt` 函数中修改：

```javascript
const printResult = await silentPrint(receiptHtml, {
  printerName: '打印机名称',  // 指定打印机，null 表示使用默认
  fallbackToWindowPrint: true,  // 是否回退到窗口打印
  useHtmlPrint: true  // 是否使用 HTML 格式打印
});
```

## 常见问题

**Q: 可以指定特定的打印机吗？**  
A: 可以，在打印函数中传入 `printerName` 参数。

**Q: 支持哪些打印机？**  
A: 支持所有 Windows/Mac/Linux 系统已安装的打印机，推荐使用 80mm 热敏打印机。

**Q: 可以在没有 QZ Tray 的情况下使用吗？**  
A: 可以，系统会自动回退到标准浏览器打印对话框。

**Q: 打印格式可以自定义吗？**  
A: 可以，修改 `printOrderReceipt` 函数中的 HTML 模板。

**Q: 证书上传后多久生效？**  
A: 证书上传后立即生效，新的打印任务会使用新证书。无需重启服务器。

**Q: 部署到 Fly.io 等云平台时，证书如何管理？**  
A: 推荐使用管理界面上传证书功能，证书会存储在数据库中，完全兼容云平台的只读文件系统。系统会自动优先从数据库读取证书，只有在数据库中没有证书时才会回退到文件系统。

