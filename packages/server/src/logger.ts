import { context, trace } from '@opentelemetry/api';
import type { LoggerOptions, Logger as PinoLoggerInstance, TransportSingleOptions } from 'pino';
import pino from 'pino';
import pinoPretty from 'pino-pretty';

function otelMixin(): Record<string, unknown> {
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const ctx = span.spanContext();
  return {
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
    trace_flags: ctx.traceFlags,
  };
}

function shouldColorize(): boolean {
  if (process.env.NO_COLOR && process.env.NO_COLOR !== '') {
    return false;
  }
  return process.stdout.isTTY ?? false;
}

export interface PinoLoggerConfig {
  options?: LoggerOptions;
  transportConfigs?: TransportSingleOptions[];
}

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
      mixin: otelMixin,
      ...config.options,
    };

    if (config.transportConfigs) {
      this.transportConfigs = config.transportConfigs;
    }

    this.pinoInstance = this.buildInstance();
  }

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
    } catch (err) {
      console.warn('[PinoLogger] pino-pretty failed, falling back to JSON:', err);
      return pino(this.options);
    }
  }

  private recreateInstance(): void {
    if (typeof this.pinoInstance.flush === 'function') {
      this.pinoInstance.flush();
    }
    this.pinoInstance = this.buildInstance();
  }

  addTransport(transportConfig: TransportSingleOptions): void {
    this.transportConfigs.push(transportConfig);
    this.recreateInstance();
  }

  removeTransport(index: number): void {
    if (index >= 0 && index < this.transportConfigs.length) {
      this.transportConfigs.splice(index, 1);
      this.recreateInstance();
    }
  }

  getTransports(): TransportSingleOptions[] {
    return [...this.transportConfigs];
  }

  updateOptions(options: Partial<LoggerOptions>): void {
    this.options = { ...this.options, ...options };
    this.recreateInstance();
  }

  getPinoInstance(): PinoLoggerInstance {
    return this.pinoInstance;
  }

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

export interface LoggerFactoryConfig {
  defaultLogger?: PinoLogger;
  loggerFactory?: (name: string) => PinoLogger;
  pinoConfig?: PinoLoggerConfig;
}

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

export const loggerFactory = new LoggerFactory();

export function getLogger(name: string): PinoLogger {
  return loggerFactory.getLogger(name);
}

export function createTestLogger(name = 'test'): PinoLogger {
  return new PinoLogger(name, { options: { level: 'silent' } });
}

export function installTestLoggers(): void {
  loggerFactory.configure({
    pinoConfig: { options: { level: 'silent' } },
  });
}
