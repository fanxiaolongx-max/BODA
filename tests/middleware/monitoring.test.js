const monitoringMiddleware = require('../../middleware/monitoring');
const { logger } = require('../../utils/logger');

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock shouldLogPerformance to always return true
jest.mock('../../utils/log-helper', () => ({
  shouldLogPerformance: jest.fn().mockResolvedValue(true)
}));

describe('Monitoring Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    req = {
      method: 'GET',
      url: '/api/test',
      ip: '127.0.0.1'
    };

    res = {
      statusCode: 200,
      on: jest.fn((event, callback) => {
        if (event === 'finish') {
          // 模拟响应完成
          setTimeout(() => callback(), 0);
        }
      })
    };

    next = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should call next() immediately', () => {
    monitoringMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should log performance metrics when response finishes', async () => {
    req.path = req.url; // 添加path属性
    monitoringMiddleware(req, res, next);

    // 获取finish回调
    const finishCall = res.on.mock.calls.find(call => call[0] === 'finish');
    expect(finishCall).toBeDefined();
    const finishCallback = finishCall[1];

    // 使用真实定时器来等待异步操作
    jest.useRealTimers();
    
    // 模拟响应完成（异步）
    finishCallback();

    // 等待异步操作完成（shouldLogPerformance 是异步的）
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(logger.info).toHaveBeenCalledWith(
      'Request Performance',
      expect.objectContaining({
        method: 'GET',
        url: '/api/test',
        statusCode: 200,
        duration: expect.any(String),
        memoryDelta: expect.any(String),
        ip: '127.0.0.1'
      })
    );
  });

  it('should log warning for slow requests (>1 second)', async () => {
    req.path = req.url; // 添加path属性
    const startTime = Date.now();
    
    // 使用真实定时器来模拟慢请求
    jest.useRealTimers();
    
    monitoringMiddleware(req, res, next);

    const finishCall = res.on.mock.calls.find(call => call[0] === 'finish');
    const finishCallback = finishCall[1];
    
    // 模拟慢请求：等待超过1秒
    await new Promise(resolve => setTimeout(resolve, 1100));
    
    // 手动设置 duration（因为 Date.now() 在真实定时器下会真实流逝）
    // 我们需要 mock Date.now 来模拟慢请求
    const originalDateNow = Date.now;
    Date.now = jest.fn(() => startTime + 1500);
    
    finishCallback();

    // 等待异步操作完成
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(logger.warn).toHaveBeenCalledWith(
      'Slow Request Detected',
      expect.objectContaining({
        method: 'GET',
        url: '/api/test',
        duration: expect.stringContaining('ms')
      })
    );
    
    Date.now = originalDateNow;
  });

  it('should not log warning for fast requests (<1 second)', () => {
    monitoringMiddleware(req, res, next);

    const finishCall = res.on.mock.calls.find(call => call[0] === 'finish');
    const finishCallback = finishCall[1];
    
    // 快进时间少于1秒
    jest.advanceTimersByTime(500);
    finishCallback();

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should handle missing IP address', async () => {
    req.path = req.url; // 添加path属性
    req.ip = undefined;
    req.connection = { remoteAddress: '192.168.1.1' };

    jest.useRealTimers();
    monitoringMiddleware(req, res, next);

    const finishCall = res.on.mock.calls.find(call => call[0] === 'finish');
    const finishCallback = finishCall[1];
    finishCallback();

    // 等待异步操作完成
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(logger.info).toHaveBeenCalledWith(
      'Request Performance',
      expect.objectContaining({
        ip: '192.168.1.1'
      })
    );
  });

  it('should calculate memory delta correctly', async () => {
    req.path = req.url; // 添加path属性
    const originalMemoryUsage = process.memoryUsage;
    let callCount = 0;
    
    process.memoryUsage = jest.fn(() => {
      callCount++;
      if (callCount === 1) {
        return { heapUsed: 100 * 1024 * 1024 }; // 100MB
      } else {
        return { heapUsed: 120 * 1024 * 1024 }; // 120MB
      }
    });

    jest.useRealTimers();
    monitoringMiddleware(req, res, next);

    const finishCall = res.on.mock.calls.find(call => call[0] === 'finish');
    const finishCallback = finishCall[1];
    finishCallback();

    // 等待异步操作完成
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(logger.info).toHaveBeenCalledWith(
      'Request Performance',
      expect.objectContaining({
        memoryDelta: expect.stringContaining('MB')
      })
    );

    process.memoryUsage = originalMemoryUsage;
  });

  it('should handle different HTTP methods', async () => {
    req.method = 'POST';
    req.url = '/api/admin/products';
    req.path = req.url; // 添加path属性

    jest.useRealTimers();
    monitoringMiddleware(req, res, next);

    const finishCall = res.on.mock.calls.find(call => call[0] === 'finish');
    const finishCallback = finishCall[1];
    finishCallback();

    // 等待异步操作完成
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(logger.info).toHaveBeenCalledWith(
      'Request Performance',
      expect.objectContaining({
        method: 'POST',
        url: '/api/admin/products'
      })
    );
  });

  it('should handle different status codes', async () => {
    req.path = req.url; // 添加path属性
    res.statusCode = 404;

    jest.useRealTimers();
    monitoringMiddleware(req, res, next);

    const finishCall = res.on.mock.calls.find(call => call[0] === 'finish');
    const finishCallback = finishCall[1];
    finishCallback();

    // 等待异步操作完成
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(logger.info).toHaveBeenCalledWith(
      'Request Performance',
      expect.objectContaining({
        statusCode: 404
      })
    );
  });
});

