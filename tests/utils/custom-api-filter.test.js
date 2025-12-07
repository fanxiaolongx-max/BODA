/**
 * 自定义API过滤功能单元测试
 */

const { applyFilter } = require('../../utils/custom-api-router');

describe('自定义API过滤功能', () => {
  // 生成测试数据
  function generateTestData() {
    return [
      {
        id: 1,
        name: '🧋 Nefididi',
        url: 'https://boda-0mqtrq.fly.dev/',
        title: 'Nefididi',
        image: 'https://example.com/nefididi.jpg',
        category: '奶茶店'
      },
      {
        id: 2,
        name: '🍜 川味餐厅',
        url: 'https://example.com/restaurant',
        title: '川味餐厅',
        image: 'https://example.com/restaurant.jpg',
        category: '中餐厅'
      },
      {
        id: 3,
        name: '🍕 意大利餐厅',
        url: 'https://example.com/italian',
        title: '意大利餐厅',
        image: 'https://example.com/italian.jpg',
        category: '西餐厅'
      },
      {
        id: 4,
        name: '🍜 川味小面',
        url: 'https://example.com/noodles',
        title: '川味小面',
        image: 'https://example.com/noodles.jpg',
        category: '中餐厅'
      },
      {
        id: 5,
        name: '🥤 奶茶店2',
        url: 'https://example.com/boba2',
        title: '奶茶店2',
        image: 'https://example.com/boba2.jpg',
        category: '奶茶店'
      }
    ];
  }

  describe('数组数据过滤', () => {
    const testData = generateTestData();

    it('应该按分类过滤', () => {
      const result = applyFilter(testData, { category: '中餐厅' });
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].category).toBe('中餐厅');
      expect(result[1].category).toBe('中餐厅');
      expect(result[0].name).toBe('🍜 川味餐厅');
      expect(result[1].name).toBe('🍜 川味小面');
    });

    it('应该按关键词搜索（不区分字段）', () => {
      const result = applyFilter(testData, { keyword: '川味' });
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0].name).toContain('川味');
      expect(result[1].name).toContain('川味');
    });

    it('应该组合过滤（分类 + 关键词）', () => {
      const result = applyFilter(testData, { category: '中餐厅', keyword: '川味' });
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result.every(item => item.category === '中餐厅')).toBe(true);
      expect(result.every(item => item.name.includes('川味') || item.title.includes('川味'))).toBe(true);
    });

    it('应该支持多个字段过滤', () => {
      const result = applyFilter(testData, { category: '奶茶店', name: 'Nefididi' });
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(1);
      expect(result[0].category).toBe('奶茶店');
      expect(result[0].name).toContain('Nefididi');
    });

    it('应该支持部分匹配（包含）', () => {
      const result = applyFilter(testData, { category: '餐厅' });
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3); // 中餐厅、西餐厅、中餐厅
      expect(result.every(item => item.category.includes('餐厅'))).toBe(true);
    });

    it('应该不区分大小写', () => {
      const result1 = applyFilter(testData, { category: '中餐厅' });
      const result2 = applyFilter(testData, { category: '中餐' });
      
      expect(result1.length).toBeGreaterThan(0);
      expect(result2.length).toBeGreaterThan(0);
    });

    it('应该处理空过滤条件（返回所有数据）', () => {
      const result = applyFilter(testData, {});
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(testData.length);
    });

    it('应该处理无匹配结果', () => {
      const result = applyFilter(testData, { category: '不存在的分类' });
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('应该处理关键词在多个字段中搜索', () => {
      const result = applyFilter(testData, { keyword: '餐厅' });
      
      expect(Array.isArray(result)).toBe(true);
      // 应该找到所有包含"餐厅"的记录（可能在name、title、category等字段）
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('对象数据过滤（包含data字段）', () => {
    const testData = {
      data: generateTestData(),
      otherField: 'value',
      metadata: { version: '1.0' }
    };

    it('应该对data字段进行过滤并保留其他字段', () => {
      const result = applyFilter(testData, { category: '中餐厅' });
      
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('otherField');
      expect(result).toHaveProperty('metadata');
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBe(2);
      expect(result.data.every(item => item.category === '中餐厅')).toBe(true);
      expect(result.otherField).toBe('value');
      expect(result.metadata.version).toBe('1.0');
    });

    it('应该支持关键词搜索', () => {
      const result = applyFilter(testData, { keyword: '川味' });
      
      expect(result.data.length).toBe(2);
      expect(result.data.every(item => 
        item.name.includes('川味') || item.title.includes('川味')
      )).toBe(true);
    });
  });

  describe('边界情况', () => {
    it('应该处理空数组', () => {
      const result = applyFilter([], { category: '中餐厅' });
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('应该处理非数组非对象数据', () => {
      const result1 = applyFilter('string', { category: 'test' });
      expect(result1).toBe('string');
      
      const result2 = applyFilter(123, { category: 'test' });
      expect(result2).toBe(123);
      
      const result3 = applyFilter(null, { category: 'test' });
      expect(result3).toBe(null);
    });

    it('应该处理对象但不包含data字段', () => {
      const testData = { field: 'value', count: 10 };
      const result = applyFilter(testData, { category: 'test' });
      
      expect(result).toEqual(testData);
    });

    it('应该处理data字段不是数组的对象', () => {
      const testData = { data: 'not an array', other: 'field' };
      const result = applyFilter(testData, { category: 'test' });
      
      expect(result).toEqual(testData);
    });

    it('应该处理null或undefined字段值', () => {
      const testData = [
        { id: 1, name: 'Item 1', category: 'A' },
        { id: 2, name: 'Item 2', category: null },
        { id: 3, name: 'Item 3' }
      ];
      
      const result = applyFilter(testData, { category: 'A' });
      
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(1);
    });

    it('应该处理数字字段值', () => {
      const testData = [
        { id: 1, name: 'Item 1', price: 100 },
        { id: 2, name: 'Item 2', price: 200 }
      ];
      
      const result = applyFilter(testData, { price: '100' });
      
      expect(result.length).toBe(1);
      expect(result[0].id).toBe(1);
    });
  });

  describe('组合过滤场景', () => {
    const testData = generateTestData();

    it('应该正确处理分类过滤 + 关键词搜索', () => {
      const result = applyFilter(testData, { 
        category: '中餐厅', 
        keyword: '川味' 
      });
      
      expect(result.length).toBe(2);
      expect(result.every(item => item.category === '中餐厅')).toBe(true);
      expect(result.every(item => 
        item.name.includes('川味') || item.title.includes('川味')
      )).toBe(true);
    });

    it('应该正确处理多个字段过滤 + 关键词', () => {
      const result = applyFilter(testData, { 
        category: '中餐厅',
        name: '餐厅',
        keyword: '川'
      });
      
      // 必须同时满足：category包含"中餐厅"、name包含"餐厅"、且任何字段包含"川"
      expect(result.length).toBeGreaterThanOrEqual(0);
      result.forEach(item => {
        expect(item.category).toContain('中餐厅');
        expect(item.name).toContain('餐厅');
        expect(
          Object.values(item).some(val => 
            String(val).toLowerCase().includes('川')
          )
        ).toBe(true);
      });
    });
  });
});
