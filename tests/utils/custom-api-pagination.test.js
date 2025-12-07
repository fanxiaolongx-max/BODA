/**
 * 自定义API分页功能单元测试
 */

const { applyPagination } = require('../../utils/custom-api-router');

describe('自定义API分页功能', () => {
  // 生成测试数据
  function generateTestData(count = 100) {
    const data = [];
    for (let i = 1; i <= count; i++) {
      data.push({
        id: i,
        title: `Item ${i}`,
        description: `Description ${i}`,
        price: (Math.random() * 100).toFixed(2)
      });
    }
    return data;
  }

  describe('数组数据分页', () => {
    const testData = generateTestData(100);

    it('应该返回第一页数据（带元数据）', () => {
      const result = applyPagination(testData, 1, 20, false);
      
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('hasMore');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(20);
      expect(result.total).toBe(100);
      expect(result.hasMore).toBe(true);
      expect(result.data[0].id).toBe(1);
      expect(result.data[19].id).toBe(20);
    });

    it('应该返回第二页数据', () => {
      const result = applyPagination(testData, 2, 20, false);
      
      expect(result.data.length).toBe(20);
      expect(result.data[0].id).toBe(21);
      expect(result.data[19].id).toBe(40);
      expect(result.total).toBe(100);
      expect(result.hasMore).toBe(true);
    });

    it('应该返回最后一页数据', () => {
      const result = applyPagination(testData, 5, 20, false);
      
      expect(result.data.length).toBe(20);
      expect(result.data[0].id).toBe(81);
      expect(result.data[19].id).toBe(100);
      expect(result.total).toBe(100);
      expect(result.hasMore).toBe(false);
    });

    it('应该处理超出范围的页码', () => {
      const result = applyPagination(testData, 10, 20, false);
      
      expect(result.data.length).toBe(0);
      expect(result.total).toBe(100);
      expect(result.hasMore).toBe(false);
    });

    it('应该返回数组格式（format=array）', () => {
      const result = applyPagination(testData, 1, 20, true);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(20);
      expect(result[0].id).toBe(1);
      expect(result[19].id).toBe(20);
      expect(result).not.toHaveProperty('total');
      expect(result).not.toHaveProperty('hasMore');
    });

    it('应该处理不同的pageSize', () => {
      const result1 = applyPagination(testData, 1, 10, false);
      expect(result1.data.length).toBe(10);
      
      const result2 = applyPagination(testData, 1, 50, false);
      expect(result2.data.length).toBe(50);
      
      const result3 = applyPagination(testData, 1, 100, false);
      expect(result3.data.length).toBe(100);
      expect(result3.hasMore).toBe(false);
    });
  });

  describe('对象数据分页（包含data字段）', () => {
    const testData = {
      data: generateTestData(100),
      otherField: 'value',
      metadata: { version: '1.0' }
    };

    it('应该对data字段进行分页并保留其他字段', () => {
      const result = applyPagination(testData, 1, 20, false);
      
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('hasMore');
      expect(result).toHaveProperty('otherField');
      expect(result).toHaveProperty('metadata');
      expect(result.data.length).toBe(20);
      expect(result.total).toBe(100);
      expect(result.otherField).toBe('value');
      expect(result.metadata.version).toBe('1.0');
    });

    it('应该使用对象中的total字段（如果存在）', () => {
      const testDataWithTotal = {
        data: generateTestData(100),
        total: 150 // 实际数据只有100条，但total是150
      };
      
      const result = applyPagination(testDataWithTotal, 1, 20, false);
      
      expect(result.total).toBe(150);
      expect(result.hasMore).toBe(true);
    });

    it('应该返回数组格式（format=array）', () => {
      const result = applyPagination(testData, 1, 20, true);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(20);
      expect(result[0].id).toBe(1);
    });
  });

  describe('边界情况', () => {
    it('应该处理空数组', () => {
      const result = applyPagination([], 1, 20, false);
      
      expect(result.data.length).toBe(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    it('应该处理非数组非对象数据', () => {
      const result1 = applyPagination('string', 1, 20, false);
      expect(result1).toBe('string');
      
      const result2 = applyPagination(123, 1, 20, false);
      expect(result2).toBe(123);
      
      const result3 = applyPagination(null, 1, 20, false);
      expect(result3).toBe(null);
    });

    it('应该处理对象但不包含data字段', () => {
      const testData = { field: 'value', count: 10 };
      const result = applyPagination(testData, 1, 20, false);
      
      expect(result).toEqual(testData);
    });

    it('应该处理data字段不是数组的对象', () => {
      const testData = { data: 'not an array', other: 'field' };
      const result = applyPagination(testData, 1, 20, false);
      
      expect(result).toEqual(testData);
    });
  });

  describe('分页计算准确性', () => {
    const testData = generateTestData(100);

    it('应该正确计算hasMore', () => {
      // 第1页，每页20条，总共100条 -> hasMore = true
      const result1 = applyPagination(testData, 1, 20, false);
      expect(result1.hasMore).toBe(true);
      
      // 第5页，每页20条，总共100条 -> hasMore = false
      const result2 = applyPagination(testData, 5, 20, false);
      expect(result2.hasMore).toBe(false);
      
      // 第4页，每页25条，总共100条 -> hasMore = false
      const result3 = applyPagination(testData, 4, 25, false);
      expect(result3.hasMore).toBe(false);
      
      // 第3页，每页25条，总共100条 -> hasMore = true
      const result4 = applyPagination(testData, 3, 25, false);
      expect(result4.hasMore).toBe(true);
    });

    it('应该正确计算total', () => {
      const result = applyPagination(testData, 1, 20, false);
      expect(result.total).toBe(100);
    });
  });
});
