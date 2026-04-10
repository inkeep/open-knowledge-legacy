import type { LoggerOptions, Logger as PinoLoggerInstance, TransportSingleOptions } from 'pino';
import pino from 'pino';
import pinoPretty from 'pino-pretty';

/**
 * Determines whether log output should be colorized.
 *
 * Checks in order:
 * 1. NO_COLOR env var (standard: https://no-color.org/) — if set to any non-empty value, disables colors
 * 2. Falls back to process.stdout.isTTY (colors enabled for interactive terminals)
 */
function shouldColorize(): boolean {
  if (process.env.NO_COLOR && process.env.NO_COLOR !== '') {
    return false;
  }
  return process.stdout.isTTY ?? false;
}

/**
 * Configuration options for PinoLogger
 */
export interface PinoLoggerConfig {
  /** Pino logger options (merged with defaults) */
  options?: LoggerOptions;
  /**
   * Pino transport configurations.
   *
   * NOTE: Pino transports use Node.js worker threads internally. Under Bun,
   * the default pretty-print stream (no transports) is the safe path.
   * Only add transports if you've verified they work in your runtime.
   */
  transportConfigs?: TransportSingleOptions[];
}

/**
 * Pino logger wrapper with pretty-printing and optional transport support.
 *
 * Default behaviour (no transports): uses pino-pretty as a direct writable
 * stream, which works in both Node.js and Bun without worker threads.
 */
export class PinoLogger {
  private name: string;
  private transportConfigs: TransportSingleOptions[] = [];
  private pinoInstance: PinoLoggerInstance;
  private options: LoggerOptions;

  constructor(name: string, config: PinoLoggerConfig = {}) {
    this.name = name;
    this.options = {
      name: this.name,
      level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
      serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
      },
      ...config.options,
    };

    if (config.transportConfigs) {
      this.transportConfigs = config.transportConfigs;
    }

    this.pinoInstance = this.buildInstance();
  }

  /** Build or rebuild the pino instance from current config. */
  private buildInstance(): PinoLoggerInstance {
    if (this.transportConfigs.length > 0) {
      return pino(this.options, pino.transport({ targets: this.transportConfigs }));
    }

    try {
      const prettyStream = pinoPretty({
        colorize: shouldColorize(),
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      });
      return pino(this.options, prettyStream);
    } catch {
      // Fall back to standard JSON output if pino-pretty fails
      return pino(this.options);
    }
  }

  /** Recreate the pino instance (e.g. after adding/removing transports). */
  private recreateInstance(): void {
    if (typeof this.pinoInstance.flush === 'function') {
      this.pinoInstance.flush();
    }
    this.pinoInstance = this.buildInstance();
  }

  /** Add a transport and rebuild. */
  addTransport(transportConfig: TransportSingleOptions): void {
    this.transportConfigs.push(transportConfig);
    this.recreateInstance();
  }

  /** Remove a transport by index and rebuild. */
  removeTransport(index: number): void {
    if (index >= 0 && index < this.transportConfigs.length) {
      this.transportConfigs.splice(index, 1);
      this.recreateInstance();
    }
  }

  /** Get current transport configs (shallow copy). */
  getTransports(): TransportSingleOptions[] {
    return [...this.transportConfigs];
  }

  /** Merge new options and rebuild. */
  updateOptions(options: Partial<LoggerOptions>): void {
    this.options = { ...this.options, ...options };
    this.recreateInstance();
  }

  /** Access the underlying pino instance for advanced usage. */
  getPinoInstance(): PinoLoggerInstance {
    return this.pinoInstance;
  }

  // ---- Logging methods ------------------------------------------------

  error(data: unknown, message: string): void {
    this.pinoInstance.error(data, message);
  }

  warn(data: unknown, message: string): void {
    this.pinoInstance.warn(data, message);
  }

  info(data: unknown, message: string): void {
    this.pinoInstance.info(data, message);
  }

  debug(data: unknown, message: string): void {
    this.pinoInstance.debug(data, message);
  }
}

/**
 * Logger factory configuration
 */
export interface LoggerFactoryConfig {
  defaultLogger?: PinoLogger;
  loggerFactory?: (name: string) => PinoLogger;
  /** Pino config passed to auto-created PinoLogger instances */
  pinoConfig?: PinoLoggerConfig;
}

/**
 * Global logger factory singleton — caches named logger instances.
 */
class LoggerFactory {
  private config: LoggerFactoryConfig = {};
  private loggers = new Map<string, PinoLogger>();

  configure(config: LoggerFactoryConfig): void {
    this.config = config;
    this.loggers.clear();
  }

  getLogger(name: string): PinoLogger {
    const cached = this.loggers.get(name);
    if (cached) return cached;

    let logger: PinoLogger;
    if (this.config.loggerFactory) {
      logger = this.config.loggerFactory(name);
    } else if (this.config.defaultLogger) {
      logger = this.config.defaultLogger;
    } else {
      logger = new PinoLogger(name, this.config.pinoConfig);
    }

    this.loggers.set(name, logger);
    return logger;
  }

  reset(): void {
    this.config = {};
    this.loggers.clear();
  }
}

/** Singleton factory instance */
export const loggerFactory = new LoggerFactory();

/** Convenience: get a named logger from the global factory. */
export function getLogger(name: string): PinoLogger {
  return loggerFactory.getLogger(name);
}

// ---- Test helpers --------------------------------------------------------

/** A pre-silenced logger for use in tests — no output, no env-var dependency. */
export function createTestLogger(name = 'test'): PinoLogger {
  return new PinoLogger(name, { options: { level: 'silent' } });
}

/**
 * Configure the global factory to use silent loggers for all `getLogger()` calls.
 * Call in a `beforeAll` / `beforeEach` block; pair with `loggerFactory.reset()`
 * in teardown if you need to restore production behaviour.
 */
export function installTestLoggers(): void {
  loggerFactory.configure({
    pinoConfig: { options: { level: 'silent' } },
  });
}
