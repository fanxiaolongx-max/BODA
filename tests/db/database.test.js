const { 
  createTestDatabase, 
  initTestDatabase, 
  runAsync, 
  getAsync, 
  allAsync,
  beginTransaction,
  commit,
  rollback,
  closeTestDatabase
} = require('../helpers/test-db');

describe('Database Operations', () => {
  beforeAll(async () => {
    await createTestDatabase();
    await initTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  beforeEach(async () => {
    // 清理数据
    await runAsync('DELETE FROM order_items');
    await runAsync('DELETE FROM orders');
    await runAsync('DELETE FROM products');
    await runAsync('DELETE FROM categories');
    await runAsync('DELETE FROM users');
    await runAsync('DELETE FROM admins');
  });

  describe('runAsync', () => {
    it('should insert data and return lastID', async () => {
      const result = await runAsync(
        'INSERT INTO categories (name, description) VALUES (?, ?)',
        ['Test Category', 'Test Description']
      );

      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
      expect(result.changes).toBe(1);
    });

    it('should update data and return changes', async () => {
      const insertResult = await runAsync(
        'INSERT INTO categories (name) VALUES (?)',
        ['Test Category']
      );

      const updateResult = await runAsync(
        'UPDATE categories SET name = ? WHERE id = ?',
        ['Updated Category', insertResult.id]
      );

      expect(updateResult.changes).toBe(1);
    });

    it('should delete data and return changes', async () => {
      const insertResult = await runAsync(
        'INSERT INTO categories (name) VALUES (?)',
        ['Test Category']
      );

      const deleteResult = await runAsync(
        'DELETE FROM categories WHERE id = ?',
        [insertResult.id]
      );

      expect(deleteResult.changes).toBe(1);
    });
  });

  describe('getAsync', () => {
    it('should retrieve a single row', async () => {
      const insertResult = await runAsync(
        'INSERT INTO categories (name, description) VALUES (?, ?)',
        ['Test Category', 'Test Description']
      );

      const category = await getAsync(
        'SELECT * FROM categories WHERE id = ?',
        [insertResult.id]
      );

      expect(category).toBeDefined();
      expect(category.name).toBe('Test Category');
      expect(category.description).toBe('Test Description');
    });

    it('should return undefined for non-existent row', async () => {
      const category = await getAsync(
        'SELECT * FROM categories WHERE id = ?',
        [99999]
      );

      expect(category).toBeUndefined();
    });
  });

  describe('allAsync', () => {
    it('should retrieve multiple rows', async () => {
      await runAsync('INSERT INTO categories (name) VALUES (?)', ['Category 1']);
      await runAsync('INSERT INTO categories (name) VALUES (?)', ['Category 2']);
      await runAsync('INSERT INTO categories (name) VALUES (?)', ['Category 3']);

      const categories = await allAsync('SELECT * FROM categories ORDER BY id');

      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBe(3);
    });

    it('should return empty array when no rows found', async () => {
      const categories = await allAsync('SELECT * FROM categories WHERE id > 1000');

      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBe(0);
    });
  });

  describe('Transactions', () => {
    it('should commit transaction successfully', async () => {
      await beginTransaction();

      const result1 = await runAsync(
        'INSERT INTO categories (name) VALUES (?)',
        ['Category 1']
      );

      const result2 = await runAsync(
        'INSERT INTO products (name, price, category_id) VALUES (?, ?, ?)',
        ['Product 1', 10.00, result1.id]
      );

      await commit();

      // 验证数据已提交
      const category = await getAsync('SELECT * FROM categories WHERE id = ?', [result1.id]);
      const product = await getAsync('SELECT * FROM products WHERE id = ?', [result2.id]);

      expect(category).toBeDefined();
      expect(product).toBeDefined();
    });

    it('should rollback transaction on error', async () => {
      await beginTransaction();

      const result1 = await runAsync(
        'INSERT INTO categories (name) VALUES (?)',
        ['Category 1']
      );

      // 尝试插入无效数据（违反外键约束）
      try {
        await runAsync(
          'INSERT INTO products (name, price, category_id) VALUES (?, ?, ?)',
          ['Product 1', 10.00, 99999] // 无效的category_id
        );
      } catch (error) {
        // 预期会出错
      }

      await rollback();

      // 验证数据已回滚
      const category = await getAsync('SELECT * FROM categories WHERE id = ?', [result1.id]);
      expect(category).toBeUndefined();
    });
  });

  describe('Foreign Key Constraints', () => {
    it('should enforce foreign key constraints', async () => {
      // 尝试插入无效的外键
      await expect(
        runAsync(
          'INSERT INTO products (name, price, category_id) VALUES (?, ?, ?)',
          ['Product 1', 10.00, 99999]
        )
      ).rejects.toThrow();
    });

    it('should allow valid foreign key references', async () => {
      const categoryResult = await runAsync(
        'INSERT INTO categories (name) VALUES (?)',
        ['Test Category']
      );

      const productResult = await runAsync(
        'INSERT INTO products (name, price, category_id) VALUES (?, ?, ?)',
        ['Test Product', 10.00, categoryResult.id]
      );

      expect(productResult.id).toBeGreaterThan(0);
    });
  });

  describe('Data Types', () => {
    it('should handle TEXT type correctly', async () => {
      const result = await runAsync(
        'INSERT INTO categories (name, description) VALUES (?, ?)',
        ['Test', 'Long description text']
      );

      const category = await getAsync('SELECT * FROM categories WHERE id = ?', [result.id]);
      expect(typeof category.name).toBe('string');
      expect(typeof category.description).toBe('string');
    });

    it('should handle REAL type correctly', async () => {
      const categoryResult = await runAsync(
        'INSERT INTO categories (name) VALUES (?)',
        ['Test Category']
      );

      const productResult = await runAsync(
        'INSERT INTO products (name, price, category_id) VALUES (?, ?, ?)',
        ['Test Product', 19.99, categoryResult.id]
      );

      const product = await getAsync('SELECT * FROM products WHERE id = ?', [productResult.id]);
      expect(typeof product.price).toBe('number');
      expect(product.price).toBeCloseTo(19.99);
    });

    it('should handle INTEGER type correctly', async () => {
      const result = await runAsync(
        'INSERT INTO categories (name, sort_order) VALUES (?, ?)',
        ['Test Category', 100]
      );

      const category = await getAsync('SELECT * FROM categories WHERE id = ?', [result.id]);
      expect(typeof category.id).toBe('number');
      expect(typeof category.sort_order).toBe('number');
    });
  });
});

