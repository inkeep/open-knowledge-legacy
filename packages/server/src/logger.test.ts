import { beforeEach, describe, expect, it, vi } from 'bun:test';
import {
  createTestLogger,
  getLogger,
  installTestLoggers,
  loggerFactory,
  PinoLogger,
} from './logger';

describe('Logger', () => {
  beforeEach(() => {
    loggerFactory.reset();
  });

  describe('LoggerFactory', () => {
    it('should return PinoLogger by default', () => {
      const logger = loggerFactory.getLogger('test');
      expect(logger).toBeInstanceOf(PinoLogger);
    });

    it('should cache logger instances', () => {
      const logger1 = loggerFactory.getLogger('test');
      const logger2 = loggerFactory.getLogger('test');
      expect(logger1).toBe(logger2);
    });

    it('should use custom logger factory', () => {
      const customLogger = new PinoLogger('custom');
      const customFactory = vi.fn(() => customLogger);

      loggerFactory.configure({ loggerFactory: customFactory });

      const logger = loggerFactory.getLogger('test');
      expect(customFactory).toHaveBeenCalledWith('test');
      expect(logger).toBe(customLogger);
    });

    it('should use default logger when configured', () => {
      const defaultLogger = new PinoLogger('default');
      loggerFactory.configure({ defaultLogger });

      const logger = loggerFactory.getLogger('test');
      expect(logger).toBe(defaultLogger);
    });

    it('should clear cache when reconfigured', () => {
      const logger1 = loggerFactory.getLogger('test');
      loggerFactory.configure({ defaultLogger: new PinoLogger('reconfigured') });
      const logger2 = loggerFactory.getLogger('test');
      expect(logger1).not.toBe(logger2);
    });

    it('should reset to default state', () => {
      loggerFactory.configure({ defaultLogger: new PinoLogger('configured') });
      loggerFactory.reset();

      const logger = loggerFactory.getLogger('test');
      expect(logger).toBeInstanceOf(PinoLogger);
    });
  });

  describe('getLogger', () => {
    it('should return logger from factory', () => {
      const logger = getLogger('test');
      expect(logger).toBeInstanceOf(PinoLogger);
    });
  });

  describe('PinoLogger', () => {
    it('should expose transport management', () => {
      const logger = new PinoLogger('test');
      expect(logger.getTransports()).toEqual([]);
    });

    it('should expose the underlying pino instance', () => {
      const logger = new PinoLogger('test');
      const instance = logger.getPinoInstance();
      expect(instance).toBeDefined();
      expect(typeof instance.info).toBe('function');
    });
  });

  describe('Test helpers', () => {
    it('createTestLogger returns a silent PinoLogger', () => {
      const logger = createTestLogger();
      expect(logger).toBeInstanceOf(PinoLogger);
      expect(logger.getPinoInstance().level).toBe('silent');
    });

    it('createTestLogger accepts a custom name', () => {
      const logger = createTestLogger('my-test');
      expect(logger.getPinoInstance().bindings().name).toBe('my-test');
    });

    it('installTestLoggers makes getLogger() return silent loggers', () => {
      installTestLoggers();
      const logger = getLogger('anything');
      expect(logger.getPinoInstance().level).toBe('silent');
    });
  });
});
