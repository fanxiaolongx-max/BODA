const {
  findOrderCycle,
  findOrderCyclesBatch,
  isActiveCycle,
  isOrderExpired
} = require('../../utils/cycle-helper');
const { getAsync, allAsync, runAsync } = require('../helpers/test-db');

// Mock数据库模块
jest.mock('../../db/database', () => ({
  getAsync: require('../helpers/test-db').getAsync,
  allAsync: require('../helpers/test-db').allAsync
}));

describe('Cycle Helper', () => {
  beforeEach(async () => {
    // 清理数据
    await runAsync('DELETE FROM ordering_cycles');
    await runAsync('DELETE FROM orders');
  });

  describe('findOrderCycle', () => {
    it('should find cycle for order within cycle time range', async () => {
      const cycleId = await runAsync(
        `INSERT INTO ordering_cycles (cycle_number, start_time, end_time, status)
         VALUES (?, ?, ?, ?)`,
        ['CYCLE001', '2025-01-01 10:00:00', '2025-01-01 20:00:00', 'ended']
      );

      const cycle = await findOrderCycle('2025-01-01 15:00:00');
      expect(cycle).toBeDefined();
      expect(cycle.cycle_number).toBe('CYCLE001');
    });

    it('should find active cycle with null end_time', async () => {
      const cycleId = await runAsync(
        `INSERT INTO ordering_cycles (cycle_number, start_time, end_time, status)
         VALUES (?, ?, ?, ?)`,
        ['CYCLE002', '2025-01-01 10:00:00', null, 'active']
      );

      const cycle = await findOrderCycle('2025-01-01 15:00:00');
      expect(cycle).toBeDefined();
      expect(cycle.cycle_number).toBe('CYCLE002');
    });

    it('should return null if no cycle found', async () => {
      const cycle = await findOrderCycle('2025-01-01 15:00:00');
      expect(cycle).toBeUndefined();
    });
  });

  describe('findOrderCyclesBatch', () => {
    it('should find cycles for multiple order times', async () => {
      await runAsync(
        `INSERT INTO ordering_cycles (cycle_number, start_time, end_time, status)
         VALUES (?, ?, ?, ?)`,
        ['CYCLE001', '2025-01-01 10:00:00', '2025-01-01 20:00:00', 'ended']
      );
      await runAsync(
        `INSERT INTO ordering_cycles (cycle_number, start_time, end_time, status)
         VALUES (?, ?, ?, ?)`,
        ['CYCLE002', '2025-01-02 10:00:00', '2025-01-02 20:00:00', 'ended']
      );

      const orderTimes = [
        '2025-01-01 15:00:00',
        '2025-01-02 15:00:00',
        '2025-01-03 15:00:00' // 没有对应的周期
      ];

      const cycleMap = await findOrderCyclesBatch(orderTimes);
      expect(cycleMap.size).toBe(2);
      expect(cycleMap.get('2025-01-01 15:00:00').cycle_number).toBe('CYCLE001');
      expect(cycleMap.get('2025-01-02 15:00:00').cycle_number).toBe('CYCLE002');
      expect(cycleMap.get('2025-01-03 15:00:00')).toBeUndefined();
    });

    it('should return empty map for empty input', async () => {
      const cycleMap = await findOrderCyclesBatch([]);
      expect(cycleMap.size).toBe(0);
    });

    it('should return empty map for null input', async () => {
      const cycleMap = await findOrderCyclesBatch(null);
      expect(cycleMap.size).toBe(0);
    });
  });

  describe('isActiveCycle', () => {
    it('should return true if order cycle matches active cycle', () => {
      const orderCycle = { id: 1, cycle_number: 'CYCLE001' };
      const activeCycle = { id: 1, cycle_number: 'CYCLE001' };
      expect(isActiveCycle(orderCycle, activeCycle)).toBe(true);
    });

    it('should return false if order cycle does not match active cycle', () => {
      const orderCycle = { id: 1, cycle_number: 'CYCLE001' };
      const activeCycle = { id: 2, cycle_number: 'CYCLE002' };
      expect(isActiveCycle(orderCycle, activeCycle)).toBe(false);
    });

    it('should return true if no active cycle and no order cycle', () => {
      expect(isActiveCycle(null, null)).toBe(true);
    });

    it('should return true if no active cycle but has order cycle', () => {
      const orderCycle = { id: 1, cycle_number: 'CYCLE001' };
      expect(isActiveCycle(orderCycle, null)).toBe(true);
    });

    it('should return false if has active cycle but no order cycle', () => {
      const activeCycle = { id: 1, cycle_number: 'CYCLE001' };
      expect(isActiveCycle(null, activeCycle)).toBe(false);
    });
  });

  describe('isOrderExpired', () => {
    it('should return true if order is before active cycle start', () => {
      const order = { created_at: '2025-01-01 10:00:00', cycle_id: 1 };
      const activeCycle = { id: 2, start_time: '2025-01-02 10:00:00' };
      expect(isOrderExpired(order, activeCycle, null)).toBe(true);
    });

    it('should return false if order is after active cycle start', () => {
      const order = { created_at: '2025-01-02 10:00:00', cycle_id: 2 };
      const activeCycle = { id: 2, start_time: '2025-01-01 10:00:00' };
      expect(isOrderExpired(order, activeCycle, null)).toBe(false);
    });

    it('should return true if order cycle does not match latest ended cycle', () => {
      const order = { created_at: '2025-01-01 10:00:00', cycle_id: 1 };
      const latestEndedCycle = { id: 2 };
      expect(isOrderExpired(order, null, latestEndedCycle)).toBe(true);
    });

    it('should return false if order cycle matches latest ended cycle', () => {
      const order = { created_at: '2025-01-01 10:00:00', cycle_id: 2 };
      const latestEndedCycle = { id: 2 };
      expect(isOrderExpired(order, null, latestEndedCycle)).toBe(false);
    });

    it('should return true if order has no cycle_id and latest ended cycle exists', () => {
      const order = { created_at: '2025-01-01 10:00:00', cycle_id: null };
      const latestEndedCycle = { id: 2 };
      expect(isOrderExpired(order, null, latestEndedCycle)).toBe(true);
    });

    it('should return false if no active cycle and no latest ended cycle', () => {
      const order = { created_at: '2025-01-01 10:00:00', cycle_id: 1 };
      expect(isOrderExpired(order, null, null)).toBe(false);
    });
  });
});

