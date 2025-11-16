# 为什么 `test:integration-only` 会跳过164个测试？

## 简短回答

**这是正常行为！** `test:integration-only` 命令的设计目的就是只运行集成测试和边界测试，其他测试会被跳过。

## 详细说明

### 命令工作原理

`npm run test:integration-only` 使用了以下参数：
```bash
jest --testPathPattern=tests/routes --testNamePattern='Integration|Edge Cases'
```

- `--testPathPattern=tests/routes`: 只运行路由测试文件
- `--testNamePattern='Integration|Edge Cases'`: **只运行名称包含 "Integration" 或 "Edge Cases" 的测试**

### 测试过滤结果

在 `tests/routes/` 目录下有171个测试，但只有7个测试的名称包含 "Integration" 或 "Edge Cases"：

**会运行的测试（7个）:**
1. ✅ `Integration Tests - Complete Ordering Flow` (1个测试)
2. ✅ `Edge Cases - Transaction Rollback` (1个测试)
3. ✅ `Edge Cases - Concurrent Operations` (1个测试)
4. ✅ `Edge Cases - Large Data Volume` (1个测试)
5. ✅ `Edge Cases` (User Routes, 3个测试)

**会被跳过的测试（164个）:**
- Category Management (7个)
- Product Management (13个)
- Admin Management (10个)
- Permission Control (6个)
- Settings (6个)
- Dashboard & Statistics (5个)
- Order Management (9个)
- Discount Rules Management (3个)
- Cycles Management (5个)
- Ordering Control (5个)
- Logs Management (3个)
- Users Management (2个)
- Order Export (7个)
- Developer Tools (12个)
- Auth Routes (15个)
- User Routes (27个，除了Edge Cases)
- Public Routes (10个)
- Error Handling (多个)

## 如何运行所有测试？

### 方法1: 运行所有测试（不跳过任何测试）
```bash
npm test
```
- **运行**: 所有211个后端测试
- **跳过**: 0个 ✅

### 方法2: 运行完整测试（包含覆盖率）
```bash
npm run test:full
```
- **运行**: 所有211个后端测试 + 70个前端测试
- **跳过**: 0个 ✅

### 方法3: 运行所有路由测试（包括集成测试）
```bash
npm run test:integration
```
- **运行**: 所有171个路由测试（包括集成和边界测试）
- **跳过**: 0个 ✅

### 方法4: 只运行集成和边界测试（会跳过其他测试）
```bash
npm run test:integration-only
```
- **运行**: 7个集成/边界测试
- **跳过**: 164个其他测试（这是正常的！）

## 测试统计对比

| 命令 | 运行测试数 | 跳过测试数 | 说明 |
|------|-----------|-----------|------|
| `npm test` | 211个 | 0个 | 运行所有后端测试 |
| `npm run test:full` | 281个 | 0个 | 运行所有测试+覆盖率 |
| `npm run test:integration` | 171个 | 0个 | 运行所有路由测试 |
| `npm run test:integration-only` | 7个 | 164个 | **只运行集成/边界测试** |

## 使用场景

### 什么时候使用 `test:integration-only`？

✅ **适合使用**:
- 快速验证核心业务流程
- 只关心集成测试和边界测试
- 开发集成测试时快速迭代

❌ **不适合使用**:
- 提交代码前验证
- 需要运行所有测试时
- CI/CD流程中

### 什么时候使用 `npm test`？

✅ **适合使用**:
- 日常开发验证
- 提交代码前
- 需要运行所有测试时

## 总结

**`test:integration-only` 跳过164个测试是完全正常的！**

这个命令的设计目的就是只运行集成测试和边界测试，其他测试会被过滤掉。如果你想要运行所有测试，请使用：
- `npm test` - 运行所有后端测试
- `npm run test:full` - 运行所有测试+覆盖率
- `npm run test:integration` - 运行所有路由测试

## 验证

运行以下命令验证所有测试都能通过：

```bash
# 运行所有测试（不跳过任何测试）
npm test
# 结果: Test Suites: 8 passed, Tests: 211 passed ✅

# 运行完整测试
npm run test:full
# 结果: 所有测试通过 ✅

# 只运行集成/边界测试（会跳过其他测试）
npm run test:integration-only
# 结果: Test Suites: 2 passed, Tests: 7 passed, 164 skipped ✅
```

