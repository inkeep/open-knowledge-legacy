import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { McpLogger } from './logger.ts';

describe('McpLogger', () => {
  let stderrLines: string[];
  let stderrSpy: ReturnType<typeof spyOn>;
  let warnSpy: ReturnType<typeof spyOn> | undefined;
  let tmpLogDir: string | undefined;
  let originalMcpDebug: string | undefined;
  let originalDebug: string | undefined;
  let originalLogFile: string | undefined;

  beforeEach(() => {
    stderrLines = [];
    stderrSpy = spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      stderrLines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      return true;
    }) as never);

    originalMcpDebug = process.env.MCP_DEBUG;
    originalDebug = process.env.DEBUG;
    originalLogFile = process.env.OK_LOG_FILE;
    delete process.env.MCP_DEBUG;
    delete process.env.DEBUG;
    delete process.env.OK_LOG_FILE;
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    warnSpy?.mockRestore();
    warnSpy = undefined;

    if (originalMcpDebug === undefined) delete process.env.MCP_DEBUG;
    else process.env.MCP_DEBUG = originalMcpDebug;

    if (originalDebug === undefined) delete process.env.DEBUG;
    else process.env.DEBUG = originalDebug;

    if (originalLogFile === undefined) delete process.env.OK_LOG_FILE;
    else process.env.OK_LOG_FILE = originalLogFile;

    if (tmpLogDir) {
      rmSync(tmpLogDir, { recursive: true, force: true });
      tmpLogDir = undefined;
    }
  });

  test('gates debug logs behind env flags', () => {
    const logger = new McpLogger();

    logger.debug('hidden');
    expect(stderrLines).toHaveLength(0);

    process.env.MCP_DEBUG = '1';
    logger.debug('shown');

    expect(stderrLines).toHaveLength(1);
    const entry = JSON.parse(stderrLines[0] ?? '');
    expect(entry.level).toBe('debug');
    expect(entry.msg).toBe('shown');
  });

  test('child logger reuses sessionId and rotates corrId', () => {
    const logger = new McpLogger('mcp');
    logger.info('parent');

    const child = logger.child('mcp-tool');
    child.info('child');

    const parentEntry = JSON.parse(stderrLines[0] ?? '');
    const childEntry = JSON.parse(stderrLines[1] ?? '');

    expect(childEntry.sessionId).toBe(parentEntry.sessionId);
    expect(childEntry.corrId).not.toBe(parentEntry.corrId);
    expect(childEntry.component).toBe('mcp-tool');
  });

  test('warns when OK_LOG_FILE cannot be written', () => {
    tmpLogDir = mkdtempSync(resolve(tmpdir(), 'ok-mcp-logger-'));
    process.env.OK_LOG_FILE = tmpLogDir;
    warnSpy = spyOn(console, 'warn').mockImplementation(() => {});

    const logger = new McpLogger();
    logger.info('persist this');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0] as [string];
    expect(message).toContain('[mcp-logger] Failed to write to OK_LOG_FILE');
  });
});
