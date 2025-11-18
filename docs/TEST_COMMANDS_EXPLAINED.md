# 测试命令说明

## 为什么 `test:integration-only` 会跳过很多测试？

### 原因说明

`npm run test:integration-only` 使用了 `--testNamePattern='Integration|Edge Cases'` 参数，这个参数会**过滤测试**，只运行名称包含 "Integration" 或 "Edge Cases" 的测试。

**这是正常行为！** 这个命令的目的就是只运行集成测试和边界测试，而不是运行所有测试。

### 测试命令对比

| 命令 | 运行内容 | 跳过的测试 | 说明 |
|------|---------|-----------|------|
| `npm test` | **所有测试** | 0个 | 运行所有后端和前端测试 |
| `npm run test:full` | **所有测试+覆盖率** | 0个 | 运行所有测试并生成覆盖率报告 |
| `npm run test:integration-only` | **只运行集成/边界测试** | 164个 | 这是正常的！只运行名称包含"Integration"或"Edge Cases"的测试 |
| `npm run test:integration` | **所有路由测试** | 0个 | 运行所有路由测试（包括集成和边界测试） |

### 详细说明

#### `npm run test:integration-only` 的行为

这个命令会：
- ✅ 运行名称包含 "Integration" 的测试（1个）
- ✅ 运行名称包含 "Edge Cases" 的测试（6个）
- ⏭️ **跳过**其他所有测试（164个）

**这是设计如此！** 如果你想要运行所有测试，应该使用 `npm test` 或 `npm run test:full`。

#### 实际运行的测试

运行 `npm run test:integration-only` 时，会运行以下测试：

**Admin Routes:**
1. ✅ `Integration Tests - Complete Ordering Flow` (1个测试)
2. ✅ `Edge Cases - Transaction Rollback` (1个测试)
3. ✅ `Edge Cases - Concurrent Operations` (1个测试)
4. ✅ `Edge Cases - Large Data Volume` (1个测试)

**User Routes:**
5. ✅ `Edge Cases` (3个测试)

**总计**: 7个测试通过 ✅

## 如何运行所有测试？

### 方法1: 运行所有测试（推荐）
```bash
npm test
```
运行所有211个后端测试，不会跳过任何测试。

### 方法2: 运行完整测试（包含覆盖率）
```bash
npm run test:full
```
运行所有测试并生成覆盖率报告。

### 方法3: 运行所有路由测试（包括集成测试）
```bash
npm run test:integration
```
运行所有路由测试（包括集成测试和边界测试），不会跳过任何测试。

## 测试统计

### 完整测试运行 (`npm test`)
- **总测试数**: 211个（后端）
- **通过数**: 211个 ✅
- **跳过数**: 0个
- **失败数**: 0个

### 集成测试运行 (`npm run test:integration-only`)
- **总测试数**: 171个（在路由测试文件中）
- **运行数**: 7个（集成+边界测试）
- **通过数**: 7个 ✅
- **跳过数**: 164个（这是正常的！）
- **失败数**: 0个

## 什么时候使用哪个命令？

### 开发时
```bash
npm test
# 或
npm run test:watch
```
运行所有测试，确保没有破坏现有功能。

### 快速验证集成测试
```bash
npm run test:integration-only
```
只运行集成测试和边界测试，快速验证核心业务流程。

### 提交前
```bash
npm run test:full
```
运行所有测试并生成覆盖率报告，确保代码质量。

### 查看覆盖率
```bash
npm run test:coverage
```
生成详细的覆盖率报告。

## 总结

**`test:integration-only` 跳过164个测试是正常的！**

这个命令的设计目的就是只运行集成测试和边界测试，其他测试会被跳过。如果你想要运行所有测试，请使用：
- `npm test` - 运行所有测试
- `npm run test:full` - 运行所有测试+覆盖率
- `npm run test:integration` - 运行所有路由测试（包括集成测试）

