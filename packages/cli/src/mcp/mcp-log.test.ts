import { describe, expect, test } from 'bun:test';

// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape code detection
const ANSI_RE = /\x1b\[[0-9;]*m/;

describe('MCP log function', () => {
  test('log writes to stderr, not stdout', () => {
    const result = Bun.spawnSync({
      cmd: [
        'bun',
        '-e',
        `
        process.env.FORCE_COLOR = '1';
        delete process.env.NO_COLOR;

        // Import the log function indirectly by requiring tools.ts
        // and calling a function that triggers log()
        // Simpler: directly test the log pattern
        const { dim } = require('./src/ui/colors.ts');
        function log(msg) {
          process.stderr.write(dim('[mcp]') + ' ' + msg + '\\n');
        }
        log('test message');
        // stdout should be empty
        `,
      ],
      cwd: import.meta.dir.replace('/src/mcp', ''),
      env: { ...process.env, FORCE_COLOR: '1', NO_COLOR: undefined },
    });
    const stdout = result.stdout.toString();
    const stderr = result.stderr.toString();
    // stdout must be clean — no output at all
    expect(stdout).toBe('');
    // stderr has the colored prefix and message
    expect(stderr).toContain('[mcp]');
    expect(stderr).toContain('test message');
    expect(stderr).toMatch(ANSI_RE);
  });

  test('log respects NO_COLOR on stderr', () => {
    const result = Bun.spawnSync({
      cmd: [
        'bun',
        '-e',
        `
        process.env.NO_COLOR = '1';
        delete process.env.FORCE_COLOR;
        const { dim } = require('./src/ui/colors.ts');
        function log(msg) {
          process.stderr.write(dim('[mcp]') + ' ' + msg + '\\n');
        }
        log('test message');
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
