const monitoringMiddleware = require('../../middleware/monitoring');
const { logger } = require('../../utils/logger');

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn()
  }
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

  it('should log performance metrics when response finishes', () => {
    monitoringMiddleware(req, res, next);

    // 获取finish回调
    const finishCall = res.on.mock.calls.find(call => call[0] === 'finish');
    expect(finishCall).toBeDefined();
    const finishCallback = finishCall[1];

    // 模拟响应完成
    finishCallback();

    jest.advanceTimersByTime(100);

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

  it('should log warning for slow requests (>1 second)', () => {
    monitoringMiddleware(req, res, next);

    const finishCall = res.on.mock.calls.find(call => call[0] === 'finish');
    const finishCallback = finishCall[1];
    
    // 快进时间超过1秒
    jest.advanceTimersByTime(1500);
    finishCallback();

    expect(logger.warn).toHaveBeenCalledWith(
      'Slow Request Detected',
      expect.objectContaining({
        method: 'GET',
        url: '/api/test',
        duration: expect.stringContaining('ms')
      })
    );
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

  it('should handle missing IP address', () => {
    req.ip = undefined;
    req.connection = { remoteAddress: '192.168.1.1' };

    monitoringMiddleware(req, res, next);

    const finishCall = res.on.mock.calls.find(call => call[0] === 'finish');
    const finishCallback = finishCall[1];
    finishCallback();

    jest.advanceTimersByTime(100);

    expect(logger.info).toHaveBeenCalledWith(
      'Request Performance',
      expect.objectContaining({
        ip: '192.168.1.1'
      })
    );
  });

  it('should calculate memory delta correctly', () => {
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

    monitoringMiddleware(req, res, next);

    const finishCall = res.on.mock.calls.find(call => call[0] === 'finish');
    const finishCallback = finishCall[1];
    finishCallback();

    jest.advanceTimersByTime(100);

    expect(logger.info).toHaveBeenCalledWith(
      'Request Performance',
      expect.objectContaining({
        memoryDelta: expect.stringContaining('MB')
      })
    );

    process.memoryUsage = originalMemoryUsage;
  });

  it('should handle different HTTP methods', () => {
    req.method = 'POST';
    req.url = '/api/admin/products';

    monitoringMiddleware(req, res, next);

    const finishCall = res.on.mock.calls.find(call => call[0] === 'finish');
    const finishCallback = finishCall[1];
    finishCallback();

    jest.advanceTimersByTime(100);

    expect(logger.info).toHaveBeenCalledWith(
      'Request Performance',
      expect.objectContaining({
        method: 'POST',
        url: '/api/admin/products'
      })
    );
  });

  it('should handle different status codes', () => {
    res.statusCode = 404;

    monitoringMiddleware(req, res, next);

    const finishCall = res.on.mock.calls.find(call => call[0] === 'finish');
    const finishCallback = finishCall[1];
    finishCallback();

    jest.advanceTimersByTime(100);

    expect(logger.info).toHaveBeenCalledWith(
      'Request Performance',
      expect.objectContaining({
        statusCode: 404
      })
    );
  });
});

