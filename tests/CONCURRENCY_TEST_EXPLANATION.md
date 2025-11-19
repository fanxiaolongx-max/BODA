# 并发和性能优化测试说明

## 测试覆盖的极端场景

### 1. 正常下单功能验证

**测试用例：**
- `should create order successfully with cycle total amount update`
- `should generate unique order numbers`

**验证内容：**
- ✅ 订单创建成功
- ✅ 订单号格式正确（`BO` + 8位时间戳 + 3位随机字符）
- ✅ 周期总金额正确更新
- ✅ 订单号唯一性（5个连续订单）

**极端场景：**
- 验证订单号生成机制在正常情况下的唯一性
- 验证周期总金额同步更新

---

### 2. 并发下单测试（10个并发订单）

**测试用例：**
- `should handle concurrent order creation without errors`

**验证内容：**
- ✅ 10个并发订单全部创建成功
- ✅ 所有订单号都是唯一的
- ✅ 周期总金额正确更新（等待1秒异步补偿）

**极端场景：**
- **数据库锁冲突**：10个请求同时更新 `ordering_cycles.total_amount`
- **busy_timeout 配置**：验证 `PRAGMA busy_timeout = 5000` 是否生效
- **异步补偿机制**：验证如果初始更新失败（SQLITE_BUSY），异步补偿是否能正确更新

---

### 3. 高并发下单测试（20个并发订单）

**测试用例：**
- `should handle concurrent order creation with cycle total amount consistency`

**验证内容：**
- ✅ 20个并发订单全部创建成功
- ✅ 周期总金额最终一致性（最多等待10秒）

**极端场景：**
- **更高并发压力**：20个请求同时竞争数据库锁
- **异步补偿验证**：验证异步补偿机制在更高并发下的表现
- **最终一致性**：验证即使有 SQLITE_BUSY 错误，最终数据也是正确的

**等待机制：**
```javascript
// 最多等待10秒（20次重试 × 500ms）
while (retries < maxRetries && !isConsistent) {
  await new Promise(resolve => setTimeout(resolve, 500));
  // 检查周期总金额是否已正确更新
}
```

---

### 4. 极端并发测试（30个并发订单）

**测试用例：**
- `should handle extreme concurrent order creation (30+ orders)`

**验证内容：**
- ✅ 成功率 > 90%（允许少量失败，因为极端并发）
- ✅ 所有成功订单的订单号都是唯一的
- ✅ 周期总金额最终一致性（最多等待15秒）

**极端场景：**
- **极限并发压力**：30个请求几乎同时到达，测试 `busy_timeout = 5000` 的极限
- **部分失败容忍**：允许少量失败（< 10%），验证系统的健壮性
- **异步补偿验证**：验证在极端并发下，异步补偿机制是否能保证数据一致性

**关键验证点：**
1. **busy_timeout 配置**：30个请求同时竞争锁，`busy_timeout = 5000` 应该能让大部分请求等待并成功
2. **异步补偿机制**：如果某些请求的周期总金额更新失败（SQLITE_BUSY），异步补偿应该在5秒内完成
3. **最终一致性**：即使有部分请求失败或需要补偿，最终周期总金额应该是正确的

---

### 5. 补偿更新记录测试

**测试用例：**
- `should verify cycle total amount is updated correctly after compensation`
- `should verify logger is called for compensation updates`

**验证内容：**
- ✅ 15个订单创建后，周期总金额最终正确
- ✅ 日志功能正常（验证补偿更新日志）

**极端场景：**
- **补偿更新验证**：创建15个订单，可能触发多次 SQLITE_BUSY 错误
- **最终一致性**：验证即使有多次补偿更新，最终数据也是正确的

---

### 6. 订单号冲突重试测试

**测试用例：**
- `should handle order number conflicts with retry mechanism`

**验证内容：**
- ✅ 50个快速连续订单，订单号都是唯一的
- ✅ 重试机制正确处理冲突

**极端场景：**
- **时间戳冲突**：50个订单在极短时间内创建，可能在同一毫秒内
- **重试机制**：验证订单号冲突时的重试机制（最多3次，每次等待10ms）

**订单号生成逻辑：**
```javascript
// BO + 时间戳后8位 + 3位随机字符
// 如果冲突，重试时添加重试次数后缀
orderNumber = 'BO' + timestamp + (attempts > 0 ? attempts.toString() : '') + random;
```

---

## 测试验证的关键配置

### 1. busy_timeout 配置

**配置位置：** `db/database.js`
```javascript
db.run('PRAGMA busy_timeout = 5000', (err) => {
  // 当数据库被锁定时，自动等待最多5秒
});
```

**测试验证：**
- 30个并发订单测试中，大部分请求应该成功（> 90%）
- 即使有锁冲突，`busy_timeout` 应该让请求等待而不是立即失败

---

### 2. 异步补偿机制

**实现位置：** `routes/user.js`
```javascript
// 如果周期总金额更新失败（SQLITE_BUSY），异步补偿更新
if (error.code === 'SQLITE_BUSY') {
  setImmediate(async () => {
    // 重试最多5次，指数退避（1秒、2秒、3秒、4秒、5秒）
  });
}
```

**测试验证：**
- 高并发测试中，即使初始更新失败，最终周期总金额应该是正确的
- 等待机制（最多15秒）应该能捕获所有异步补偿更新

---

### 3. 订单号唯一性

**实现位置：** `routes/user.js`
```javascript
// 生成订单号：BO + 时间戳后8位 + 3位随机字符
// 如果冲突（UNIQUE 约束），重试最多3次
```

**测试验证：**
- 50个快速连续订单，所有订单号都是唯一的
- 即使在同一毫秒内创建，随机字符和重试机制应该保证唯一性

---

## 测试执行方式

### 运行所有并发测试
```bash
npm test -- tests/routes/user.test.js --testNamePattern="并发和性能优化测试"
```

### 运行特定测试
```bash
# 正常下单测试
npm test -- tests/routes/user.test.js --testNamePattern="正常下单功能验证"

# 并发下单测试
npm test -- tests/routes/user.test.js --testNamePattern="并发下单测试"

# 极端并发测试
npm test -- tests/routes/user.test.js --testNamePattern="extreme concurrent"
```

---

## 测试隔离保证

✅ **完全隔离**：测试使用独立的测试数据库（`db/test-boda.db`），不会影响生产数据库（`db/boda.db` 或 `/data/boda.db`）

✅ **Mock 机制**：所有数据库操作都被重定向到测试数据库

✅ **自动清理**：每个测试前自动清理数据，测试后可能删除测试数据库文件

---

## 预期测试结果

### 正常情况
- ✅ 所有测试通过
- ✅ 订单创建成功率 100%
- ✅ 周期总金额正确更新

### 极端并发情况（30个并发订单）
- ✅ 成功率 > 90%（允许少量失败）
- ✅ 周期总金额最终一致性（最多等待15秒）
- ✅ 所有成功订单的订单号都是唯一的

---

## 注意事项

1. **测试环境**：测试使用独立的测试数据库，不会影响生产数据
2. **执行时间**：极端并发测试可能需要较长时间（最多15秒等待）
3. **成功率**：极端并发测试允许 < 10% 的失败率，这是正常的
4. **最终一致性**：测试验证的是"最终一致性"，而不是"强一致性"

---

## 总结

这些测试能够验证：

1. ✅ **busy_timeout 配置**：在高并发下，数据库锁冲突时能自动等待
2. ✅ **异步补偿机制**：即使初始更新失败，最终数据也是正确的
3. ✅ **订单号唯一性**：即使在极端并发下，订单号也不会重复
4. ✅ **周期总金额一致性**：即使有并发冲突，最终总金额也是正确的
5. ✅ **系统健壮性**：在极端并发下，系统仍能保持高可用性（> 90% 成功率）

