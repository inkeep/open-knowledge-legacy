import { describe, expect, test } from 'bun:test';

const ANSI_RE = /\x1b\[[0-9;]*m/;

describe('MCP log function', () => {
  test('mcpLog writes to stderr, not stdout', () => {
    const result = Bun.spawnSync({
      cmd: [
        'bun',
        '-e',
        `
        process.env.FORCE_COLOR = '1';
        delete process.env.NO_COLOR;
        const { dim } = require('./src/ui/colors.ts');
        function mcpLog(msg) {
          process.stderr.write(dim('[mcp]') + ' ' + msg + '\\n');
        }
        mcpLog('test message');
        `,
      ],
      cwd: import.meta.dir.replace('/src/mcp', ''),
      env: { ...process.env, FORCE_COLOR: '1', NO_COLOR: undefined },
    });
    const stdout = result.stdout.toString();
    const stderr = result.stderr.toString();
    expect(stdout).toBe('');
    expect(stderr).toContain('[mcp]');
    expect(stderr).toContain('test message');
    expect(stderr).toMatch(ANSI_RE);
  });

  test('mcpLog respects NO_COLOR on stderr', () => {
    const result = Bun.spawnSync({
      cmd: [
        'bun',
        '-e',
        `
        process.env.NO_COLOR = '1';
        delete process.env.FORCE_COLOR;
        const { dim } = require('./src/ui/colors.ts');
        function mcpLog(msg) {
          process.stderr.write(dim('[mcp]') + ' ' + msg + '\\n');
        }
        mcpLog('test message');
        `,
      ],
      cwd: import.meta.dir.replace('/src/mcp', ''),
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: undefined },
    });
    const stdout = result.stdout.toString();
    const stderr = result.stderr.toString();
    expect(stdout).toBe('');
    expect(stderr).toContain('[mcp]');
    expect(stderr).toContain('test message');
    expect(stderr).not.toMatch(ANSI_RE);
  });
});
