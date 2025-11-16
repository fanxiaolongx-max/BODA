# 测试指南

## 快速开始

### 运行所有测试
```bash
npm test
```
运行所有后端和前端测试，显示测试结果。

### 运行完整测试（包含覆盖率）
```bash
npm run test:full
```
运行所有测试并生成覆盖率报告。

### 运行集成测试和边界测试
```bash
npm run test:integration-only
```
只运行集成测试和边界情况测试。

## 测试脚本说明

| 命令 | 说明 |
|------|------|
| `npm test` | 运行所有测试（后端+前端） |
| `npm run test:watch` | 监视模式，文件变化时自动运行测试 |
| `npm run test:coverage` | 运行测试并生成覆盖率报告 |
| `npm run test:unit` | 只运行单元测试（middleware/utils/db） |
| `npm run test:integration` | 运行所有路由测试 |
| `npm run test:integration-only` | 只运行集成测试和边界测试 |
| `npm run test:frontend` | 只运行前端测试 |
| `npm run test:all` | 运行所有后端和前端测试 |
| `npm run test:full` | 运行完整测试（包含覆盖率） |
| `npm run test:report` | 生成测试结果文件 |

## 测试结果查看

### 1. 终端输出
运行任何测试命令时，结果会直接显示在终端中：
```
PASS tests/routes/admin.test.js
  Admin Routes
    Integration Tests - Complete Ordering Flow
      ✓ should complete full ordering cycle (1234 ms)
    Edge Cases - Transaction Rollback
      ✓ should handle transaction rollback (567 ms)
    Edge Cases - Concurrent Operations
      ✓ should handle multiple orders (890 ms)
    Edge Cases - Large Data Volume
      ✓ should handle large number of orders (2345 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

### 2. 覆盖率报告（HTML）
运行 `npm run test:coverage` 后：
1. 在终端查看文本报告
2. 打开 `coverage/lcov-report/index.html` 查看详细HTML报告
   - 可以看到每个文件的覆盖率
   - 可以看到哪些行被测试覆盖，哪些没有

### 3. 测试结果文件
运行 `npm run test:report` 后：
- 完整的测试输出会保存到 `test-results.txt`
- 可以分享给团队成员或用于CI/CD

## 集成测试和边界测试

### ✅ 集成测试
**测试名称**: `Integration Tests - Complete Ordering Flow`
- **测试场景**: 完整的订单周期流程
- **覆盖步骤**:
  1. 开放点单
  2. 创建订单
  3. 关闭点单并计算折扣
  4. 确认周期
- **验证点**: 周期状态转换、折扣计算、订单状态更新

### ✅ 边界测试

#### 1. 事务回滚测试
**测试名称**: `Edge Cases - Transaction Rollback`
- **场景**: 违反唯一约束时的错误处理
- **验证**: 事务正确回滚，数据一致性

#### 2. 并发操作测试
**测试名称**: `Edge Cases - Concurrent Operations`
- **场景**: 同一周期内多个订单的处理
- **验证**: 周期总金额正确计算，所有订单正确创建

#### 3. 大数据量测试
**测试名称**: `Edge Cases - Large Data Volume`
- **场景**: 50个订单的批量创建和查询
- **验证**: 性能要求（5秒内完成），数据正确性

## 测试覆盖率

### 当前覆盖率
- **Admin Routes**: 78.96% (statements), 91.83% (functions)
- **总体**: ~52% (statements), ~53% (functions)

### 查看覆盖率
```bash
npm run test:coverage
# 然后打开 coverage/lcov-report/index.html
```

## 测试文件结构

```
tests/
├── routes/           # 路由测试（集成测试）
│   ├── admin.test.js      # Admin路由测试（包含集成和边界测试）
│   ├── auth.test.js       # 认证路由测试
│   ├── user.test.js       # 用户路由测试
│   └── public.test.js     # 公开路由测试
├── middleware/       # 中间件测试
│   ├── auth.test.js
│   └── validation.test.js
├── db/              # 数据库测试
│   └── database.test.js
├── utils/           # 工具函数测试
│   └── logger.test.js
└── frontend/        # 前端测试
    ├── api.test.js
    ├── validation.test.js
    ├── error-handler.test.js
    └── ui.test.js
```

## 添加新测试

### 1. 添加单元测试
在相应的测试文件中添加：
```javascript
describe('Feature Name', () => {
  it('should do something', async () => {
    // 测试代码
  });
});
```

### 2. 添加集成测试
在 `tests/routes/admin.test.js` 的 `Integration Tests` 部分添加：
```javascript
describe('Integration Tests - Feature Name', () => {
  it('should complete full feature flow', async () => {
    // 集成测试代码
  });
});
```

### 3. 添加边界测试
在 `tests/routes/admin.test.js` 的 `Edge Cases` 部分添加：
```javascript
describe('Edge Cases - Feature Name', () => {
  it('should handle edge case', async () => {
    // 边界测试代码
  });
});
```

## 常见问题

### Q: 测试失败怎么办？
A: 
1. 查看终端输出中的错误信息
2. 检查测试代码和业务代码的一致性
3. 确保测试数据正确设置
4. 运行 `npm test` 查看详细错误

### Q: 如何只运行失败的测试？
A: Jest会自动记住失败的测试，使用 `npm run test:watch` 可以只运行失败的测试。

### Q: 测试运行太慢怎么办？
A: 
1. 使用 `npm run test:unit` 只运行单元测试
2. 使用 `npm run test:integration-only` 只运行集成测试
3. 使用 `npm run test:watch` 在开发时只运行相关测试

### Q: 如何查看测试覆盖率？
A: 
1. 运行 `npm run test:coverage`
2. 打开 `coverage/lcov-report/index.html` 查看详细报告

## CI/CD 集成

### GitHub Actions 示例
```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test:full
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

## 测试最佳实践

1. **测试隔离**: 每个测试应该独立，不依赖其他测试
2. **清理数据**: 使用 `beforeEach` 和 `afterEach` 清理测试数据
3. **描述清晰**: 测试名称应该清楚描述测试的内容
4. **覆盖边界**: 测试正常情况、边界情况和错误情况
5. **保持更新**: 当业务逻辑改变时，及时更新测试

