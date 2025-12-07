/**
 * 自定义API过滤+分页组合功能测试
 */

const { applyFilter, applyPagination } = require('../../utils/custom-api-router');

describe('自定义API过滤+分页组合功能', () => {
  // 生成测试数据
  function generateTestData() {
    return [
      { id: 1, name: '🧋 Nefididi', category: '奶茶店', title: 'Nefididi' },
      { id: 2, name: '🍜 川味餐厅', category: '中餐厅', title: '川味餐厅' },
      { id: 3, name: '🍕 意大利餐厅', category: '西餐厅', title: '意大利餐厅' },
      { id: 4, name: '🍜 川味小面', category: '中餐厅', title: '川味小面' },
      { id: 5, name: '🥤 奶茶店2', category: '奶茶店', title: '奶茶店2' },
      { id: 6, name: '🍜 川味火锅', category: '中餐厅', title: '川味火锅' },
      { id: 7, name: '🍕 披萨店', category: '西餐厅', title: '披萨店' },
      { id: 8, name: '🧋 奶茶店3', category: '奶茶店', title: '奶茶店3' }
    ];
  }

  it('应该先过滤再分页', () => {
    const testData = generateTestData();
    
    // 先过滤：只保留中餐厅
    const filtered = applyFilter(testData, { category: '中餐厅' });
    expect(filtered.length).toBe(3); // 应该有3条中餐厅记录
    
    // 再分页：第1页，每页2条
    const paginated = applyPagination(filtered, 1, 2, false);
    
    expect(paginated).toHaveProperty('data');
    expect(paginated).toHaveProperty('total');
    expect(paginated).toHaveProperty('hasMore');
    expect(paginated.data.length).toBe(2);
    expect(paginated.total).toBe(3); // 过滤后的总数
    expect(paginated.hasMore).toBe(true);
    expect(paginated.data[0].category).toBe('中餐厅');
    expect(paginated.data[1].category).toBe('中餐厅');
  });

  it('应该正确处理关键词过滤+分页', () => {
    const testData = generateTestData();
    
    // 先过滤：关键词"川味"
    const filtered = applyFilter(testData, { keyword: '川味' });
    expect(filtered.length).toBe(3); // 应该有3条包含"川味"的记录
    
    // 再分页：第1页，每页2条
    const paginated = applyPagination(filtered, 1, 2, false);
    
    expect(paginated.data.length).toBe(2);
    expect(paginated.total).toBe(3);
    expect(paginated.hasMore).toBe(true);
  });

  it('应该正确处理组合过滤+分页', () => {
    const testData = generateTestData();
    
    // 先过滤：分类"中餐厅" + 关键词"川味"
    const filtered = applyFilter(testData, { category: '中餐厅', keyword: '川味' });
    expect(filtered.length).toBe(3); // 中餐厅中包含"川味"的记录
    
    // 再分页：第1页，每页2条
    const paginated = applyPagination(filtered, 1, 2, false);
    
    expect(paginated.data.length).toBe(2);
    expect(paginated.total).toBe(3);
    expect(paginated.hasMore).toBe(true);
    
    // 第2页
    const page2 = applyPagination(filtered, 2, 2, false);
    expect(page2.data.length).toBe(1);
    expect(page2.total).toBe(3);
    expect(page2.hasMore).toBe(false);
  });

  it('应该正确处理对象格式数据（包含data字段）', () => {
    const testData = {
      data: generateTestData(),
      metadata: { version: '1.0' }
    };
    
    // 先过滤
    const filtered = applyFilter(testData, { category: '中餐厅' });
    expect(filtered.data.length).toBe(3);
    expect(filtered.metadata).toBeDefined();
    
    // 再分页
    const paginated = applyPagination(filtered, 1, 2, false);
    
    expect(paginated.data.length).toBe(2);
    expect(paginated.total).toBe(3);
    expect(paginated.metadata).toBeDefined();
  });

  it('应该正确处理数组格式返回（format=array）', () => {
    const testData = generateTestData();
    
    // 先过滤
    const filtered = applyFilter(testData, { category: '中餐厅' });
    
    // 再分页（数组格式）
    const paginated = applyPagination(filtered, 1, 2, true);
    
    expect(Array.isArray(paginated)).toBe(true);
    expect(paginated.length).toBe(2);
    expect(paginated[0].category).toBe('中餐厅');
  });

  it('应该正确处理过滤后数据不足一页的情况', () => {
    const testData = generateTestData();
    
    // 先过滤：只保留奶茶店（应该有3条）
    const filtered = applyFilter(testData, { category: '奶茶店' });
    
    // 再分页：每页5条
    const paginated = applyPagination(filtered, 1, 5, false);
    
    expect(paginated.data.length).toBe(3);
    expect(paginated.total).toBe(3);
    expect(paginated.hasMore).toBe(false);
  });

  it('应该正确处理过滤后无数据的情况', () => {
    const testData = generateTestData();
    
    // 先过滤：不存在的分类
    const filtered = applyFilter(testData, { category: '不存在的分类' });
    expect(filtered.length).toBe(0);
    
    // 再分页
    const paginated = applyPagination(filtered, 1, 20, false);
    
    expect(paginated.data.length).toBe(0);
    expect(paginated.total).toBe(0);
    expect(paginated.hasMore).toBe(false);
  });
});
