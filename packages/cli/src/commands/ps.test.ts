import { describe, expect, test } from 'bun:test';
import { extractOkBinaryPath } from '../utils/process-scan.ts';
import type { LockState } from './lock-state.ts';
import { renderTable, runPs, timeAgo } from './ps.ts';

function makeAliveServer(overrides?: {
  worktreeRoot?: string;
  port?: number;
  pid?: number;
  startedAt?: string;
  hostname?: string;
}): LockState {
  return {
    status: 'alive',
    lockPath: `${overrides?.worktreeRoot ?? '/tmp/notes'}/.ok/server.lock`,
    lock: {
      pid: overrides?.pid ?? 12345,
      hostname: overrides?.hostname ?? 'test-host',
      port: overrides?.port ?? 5173,
      startedAt: overrides?.startedAt ?? '2026-05-05T08:00:00.000Z',
      worktreeRoot: overrides?.worktreeRoot ?? '/tmp/notes',
    },
  };
}

function makeDeadServer(overrides?: {
  worktreeRoot?: string;
  port?: number;
  pid?: number;
  startedAt?: string;
}): LockState {
  return {
    status: 'dead-pid',
    lockPath: `${overrides?.worktreeRoot ?? '/tmp/old-project'}/.ok/server.lock`,
    lock: {
      pid: overrides?.pid ?? 44444,
      hostname: 'test-host',
      port: overrides?.port ?? 5173,
      startedAt: overrides?.startedAt ?? '2026-05-01T00:00:00.000Z',
      worktreeRoot: overrides?.worktreeRoot ?? '/tmp/old-project',
    },
  };
}

function makeForeignServer(overrides?: {
  worktreeRoot?: string;
  port?: number;
  pid?: number;
  startedAt?: string;
}): LockState {
  return {
    status: 'foreign-host',
    lockPath: `${overrides?.worktreeRoot ?? '/tmp/shared'}/.ok/server.lock`,
    lock: {
      pid: overrides?.pid ?? 99999,
      hostname: 'other-host',
      port: overrides?.port ?? 6000,
      startedAt: overrides?.startedAt ?? '2026-05-04T10:00:00.000Z',
      worktreeRoot: overrides?.worktreeRoot ?? '/tmp/shared',
    },
  };
}

const missingLock: LockState = {
  status: 'missing',
  lockPath: '/tmp/notes/.ok/ui.lock',
};

const corruptLock: LockState = {
  status: 'corrupt',
  lockPath: '/tmp/notes/.ok/ui.lock',
};

describe('timeAgo', () => {
  test('returns seconds when diff < 60s', () => {
    const now = new Date('2026-05-05T10:00:30.000Z').getTime();
    expect(timeAgo('2026-05-05T10:00:00.000Z', now)).toBe('30s');
  });

  test('returns minutes ago when diff < 1h', () => {
    const now = new Date('2026-05-05T10:05:00.000Z').getTime();
    expect(timeAgo('2026-05-05T10:00:00.000Z', now)).toBe('5m ago');
  });

  test('returns hours ago when diff < 24h', () => {
    const now = new Date('2026-05-05T12:00:00.000Z').getTime();
    expect(timeAgo('2026-05-05T10:00:00.000Z', now)).toBe('2h ago');
  });

  test('returns days ago when diff >= 24h', () => {
    const now = new Date('2026-05-08T10:00:00.000Z').getTime();
    expect(timeAgo('2026-05-05T10:00:00.000Z', now)).toBe('3d ago');
  });

  test('returns — for invalid ISO string', () => {
    expect(timeAgo('not-a-date')).toBe('—');
  });
});

describe('runPs default (alive-only)', () => {
  test('shows alive server, hides dead-pid server', async () => {
    const aliveServerState = makeAliveServer({ worktreeRoot: '/tmp/notes' });
    const deadServerState = makeDeadServer({ worktreeRoot: '/tmp/old-project' });

    const lockDirs = ['/tmp/notes/.ok', '/tmp/old-project/.ok'];
    const lockMap: Record<string, Record<string, LockState>> = {
      '/tmp/notes/.ok': { server: aliveServerState, ui: missingLock },
      '/tmp/old-project/.ok': { server: deadServerState, ui: missingLock },
    };

    const lines: string[] = [];
    await runPs({
      discover: async () => lockDirs,
      inspect: (lockDir, name) => lockMap[lockDir]?.[name] ?? missingLock,
      log: (msg) => lines.push(msg),
    });

    const output = lines.join('\n');
    expect(output).toContain('/tmp/notes');
    expect(output).not.toContain('/tmp/old-project');
  });

  test('prints empty state message when no alive servers', async () => {
    const deadServerState = makeDeadServer({ worktreeRoot: '/tmp/old-project' });

    const lines: string[] = [];
    await runPs({
      discover: async () => ['/tmp/old-project/.ok'],
      inspect: (_lockDir, name) => (name === 'server' ? deadServerState : missingLock),
      log: (msg) => lines.push(msg),
    });

    const output = lines.join('\n');
    expect(output).toBe('No open-knowledge servers found.');
  });

  test('prints empty state message when no servers discovered at all', async () => {
    const lines: string[] = [];
    await runPs({
      discover: async () => [],
      inspect: () => missingLock,
      log: (msg) => lines.push(msg),
    });

    const output = lines.join('\n');
    expect(output).toBe('No open-knowledge servers found.');
  });
});

describe('runPs --all', () => {
  test('includes dead-pid entries', async () => {
    const aliveServerState = makeAliveServer({ worktreeRoot: '/tmp/notes' });
    const deadServerState = makeDeadServer({ worktreeRoot: '/tmp/old-project' });

    const lockDirs = ['/tmp/notes/.ok', '/tmp/old-project/.ok'];
    const lockMap: Record<string, Record<string, LockState>> = {
      '/tmp/notes/.ok': { server: aliveServerState, ui: missingLock },
      '/tmp/old-project/.ok': { server: deadServerState, ui: missingLock },
    };

    const lines: string[] = [];
    await runPs({
      discover: async () => lockDirs,
      inspect: (lockDir, name) => lockMap[lockDir]?.[name] ?? missingLock,
      all: true,
      log: (msg) => lines.push(msg),
    });

    const output = lines.join('\n');
    expect(output).toContain('/tmp/notes');
    expect(output).toContain('/tmp/old-project');
    expect(output).toContain('stale');
    expect(output).toContain('running');
  });

  test('includes foreign-host entries', async () => {
    const foreignServerState = makeForeignServer({ worktreeRoot: '/tmp/shared' });

    const lines: string[] = [];
    await runPs({
      discover: async () => ['/tmp/shared/.ok'],
      inspect: (_lockDir, name) => (name === 'server' ? foreignServerState : missingLock),
      all: true,
      log: (msg) => lines.push(msg),
    });

    const output = lines.join('\n');
    expect(output).toContain('/tmp/shared');
    expect(output).toContain('foreign');
  });
});

describe('runPs --json', () => {
  test('includes all statuses unconditionally', async () => {
    const aliveServerState = makeAliveServer({ worktreeRoot: '/tmp/notes' });
    const deadServerState = makeDeadServer({ worktreeRoot: '/tmp/old-project' });

    const lockDirs = ['/tmp/notes/.ok', '/tmp/old-project/.ok'];
    const lockMap: Record<string, Record<string, LockState>> = {
      '/tmp/notes/.ok': { server: aliveServerState, ui: missingLock },
      '/tmp/old-project/.ok': { server: deadServerState, ui: missingLock },
    };

    const lines: string[] = [];
    await runPs({
      discover: async () => lockDirs,
      inspect: (lockDir, name) => lockMap[lockDir]?.[name] ?? missingLock,
      json: true,
      log: (msg) => lines.push(msg),
    });

    const output = lines.join('\n');
    const parsed = JSON.parse(output) as unknown[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);

    const dirs = (parsed as Array<{ directory: string }>).map((e) => e.directory);
    expect(dirs).toContain('/tmp/notes');
    expect(dirs).toContain('/tmp/old-project');
  });

  test('json output shape has required fields', async () => {
    const aliveServerState = makeAliveServer({ worktreeRoot: '/tmp/notes', port: 5173 });
    const aliveUiState: LockState = {
      status: 'alive',
      lockPath: '/tmp/notes/.ok/ui.lock',
      lock: {
        pid: 23456,
        hostname: 'test-host',
        port: 3001,
        startedAt: '2026-05-05T08:01:00.000Z',
        worktreeRoot: '/tmp/notes',
      },
    };

    const lines: string[] = [];
    await runPs({
      discover: async () => ['/tmp/notes/.ok'],
      inspect: (_lockDir, name) => (name === 'server' ? aliveServerState : aliveUiState),
      resolveCommand: () => '/usr/local/bin/node /tmp/open-knowledge/packages/cli/src/cli.ts start',
      resolveUsage: (pid) =>
        pid === 12345 ? { cpuPercent: 1.2, memPercent: 3.4 } : { cpuPercent: 5.6, memPercent: 7.8 },
      json: true,
      log: (msg) => lines.push(msg),
    });

    const output = lines.join('\n');
    const parsed = JSON.parse(output) as Array<{
      directory: string;
      server: {
        port: number;
        status: string;
        pid: number;
        startedAt: string;
        usage: { cpuPercent: number; memPercent: number } | null;
      };
      ui: {
        port: number;
        status: string;
        pid: number;
        startedAt: string;
        usage: { cpuPercent: number; memPercent: number } | null;
      } | null;
      hostname: string;
      lockPath: string;
      binary: string | null;
      command: string | null;
    }>;

    expect(parsed).toHaveLength(1);
    const entry = parsed[0];
    if (!entry) throw new Error('Expected at least one entry in JSON output');
    expect(entry.directory).toBe('/tmp/notes');
    expect(entry.server.port).toBe(5173);
    expect(entry.server.status).toBe('alive');
    expect(entry.server.pid).toBe(12345);
    expect(typeof entry.server.startedAt).toBe('string');
    expect(entry.ui).not.toBeNull();
    expect(entry.ui?.port).toBe(3001);
    expect(entry.server.usage).toEqual({ cpuPercent: 1.2, memPercent: 3.4 });
    expect(entry.ui?.status).toBe('alive');
    expect(entry.ui?.usage).toEqual({ cpuPercent: 5.6, memPercent: 7.8 });
    expect(entry.hostname).toBe('test-host');
    expect(typeof entry.lockPath).toBe('string');
    expect(entry.binary).toBe('/tmp/open-knowledge/packages/cli/src/cli.ts');
    expect(entry.command).toBe(
      '/usr/local/bin/node /tmp/open-knowledge/packages/cli/src/cli.ts start',
    );
  });

  test('ui is null when ui lock is missing', async () => {
    const aliveServerState = makeAliveServer({ worktreeRoot: '/tmp/notes' });

    const lines: string[] = [];
    await runPs({
      discover: async () => ['/tmp/notes/.ok'],
      inspect: (_lockDir, name) => (name === 'server' ? aliveServerState : missingLock),
      json: true,
      log: (msg) => lines.push(msg),
    });

    const output = lines.join('\n');
    const parsed = JSON.parse(output) as Array<{ ui: null | object }>;
    expect(parsed[0]?.ui).toBeNull();
  });

  test('ui is null when ui lock is corrupt', async () => {
    const aliveServerState = makeAliveServer({ worktreeRoot: '/tmp/notes' });

    const lines: string[] = [];
    await runPs({
      discover: async () => ['/tmp/notes/.ok'],
      inspect: (_lockDir, name) => (name === 'server' ? aliveServerState : corruptLock),
      json: true,
      log: (msg) => lines.push(msg),
    });

    const output = lines.join('\n');
    const parsed = JSON.parse(output) as Array<{ ui: null | object }>;
    expect(parsed[0]?.ui).toBeNull();
  });
});

describe('PORTS column', () => {
  test('server port 0 shows (starting)', async () => {
    const startingServer = makeAliveServer({ worktreeRoot: '/tmp/starting', port: 0 });

    const lines: string[] = [];
    await runPs({
      discover: async () => ['/tmp/starting/.ok'],
      inspect: (_lockDir, name) => (name === 'server' ? startingServer : missingLock),
      log: (msg) => lines.push(msg),
    });

    const output = lines.join('\n');
    expect(output).toContain('(starting)');
  });

  test('missing ui shows — in PORTS', async () => {
    const aliveServer = makeAliveServer({ worktreeRoot: '/tmp/notes', port: 5173 });

    const lines: string[] = [];
    await runPs({
      discover: async () => ['/tmp/notes/.ok'],
      inspect: (_lockDir, name) => (name === 'server' ? aliveServer : missingLock),
      log: (msg) => lines.push(msg),
    });

    const output = lines.join('\n');
    expect(output).toContain('5173 / —');
  });

  test('alive ui shows port in PORTS', async () => {
    const aliveServer = makeAliveServer({ worktreeRoot: '/tmp/notes', port: 5173 });
    const aliveUi: LockState = {
      status: 'alive',
      lockPath: '/tmp/notes/.ok/ui.lock',
      lock: {
        pid: 23456,
        hostname: 'test-host',
        port: 3001,
        startedAt: '2026-05-05T08:01:00.000Z',
        worktreeRoot: '/tmp/notes',
      },
    };

    const lines: string[] = [];
    await runPs({
      discover: async () => ['/tmp/notes/.ok'],
      inspect: (_lockDir, name) => (name === 'server' ? aliveServer : aliveUi),
      log: (msg) => lines.push(msg),
    });

    const output = lines.join('\n');
    expect(output).toContain('5173 / 3001');
  });
});

describe('server lock missing/corrupt discards entry', () => {
  test('missing server lock: entry discarded', async () => {
    const lines: string[] = [];
    await runPs({
      discover: async () => ['/tmp/gone/.ok'],
      inspect: () => missingLock,
      log: (msg) => lines.push(msg),
    });

    const output = lines.join('\n');
    expect(output).toBe('No open-knowledge servers found.');
  });

  test('corrupt server lock: entry discarded', async () => {
    const lines: string[] = [];
    await runPs({
      discover: async () => ['/tmp/gone/.ok'],
      inspect: () => corruptLock,
      log: (msg) => lines.push(msg),
    });

    const output = lines.join('\n');
    expect(output).toBe('No open-knowledge servers found.');
  });
});

describe('renderTable', () => {
  test('renders header row', () => {
    const output = renderTable([]);
    expect(output).toBe('No open-knowledge servers found.');
  });

  test('table has DIRECTORY, PORTS, CPU/MEM, STATUS, PID, STARTED, BINARY header columns', () => {
    const entry = {
      directory: '/tmp/notes',
      server: {
        port: 5173,
        status: 'alive' as const,
        pid: 12345,
        startedAt: '2026-05-05T08:00:00.000Z',
        usage: { cpuPercent: 1.2, memPercent: 3.4 },
      },
      ui: null,
      hostname: 'test-host',
      lockPath: '/tmp/notes/.ok/server.lock',
      binary: '/tmp/open-knowledge/packages/cli/src/cli.ts',
      command: '/usr/local/bin/node /tmp/open-knowledge/packages/cli/src/cli.ts start',
    };

    const output = renderTable([entry]);
    const firstLine = output.split('\n')[0] ?? '';
    expect(firstLine).toContain('DIRECTORY');
    expect(firstLine).toContain('PORTS');
    expect(firstLine).toContain('CPU/MEM');
    expect(firstLine).toContain('STATUS');
    expect(firstLine).toContain('PID');
    expect(firstLine).toContain('STARTED');
    expect(firstLine).toContain('BINARY');
    expect(output).toContain('1.2% / 3.4% | —');
    expect(output).toContain('/tmp/open-knowledge/packages/cli/src/cli.ts');
  });
});

describe('extractOkBinaryPath', () => {
  test('extracts source cli path from node invocation', () => {
    expect(
      extractOkBinaryPath(
        'node /Users/mike/src/agents-private/public/open-knowledge/packages/cli/src/cli.ts start',
      ),
    ).toBe('/Users/mike/src/agents-private/public/open-knowledge/packages/cli/src/cli.ts');
  });

  test('extracts npx-installed open-knowledge bin path', () => {
    expect(
      extractOkBinaryPath(
        '/usr/local/bin/node /Users/mike/.npm/_npx/64e3e56af53daa3b/node_modules/.bin/open-knowledge start',
      ),
    ).toBe('/Users/mike/.npm/_npx/64e3e56af53daa3b/node_modules/.bin/open-knowledge');
  });

  test('ignores package specifier in npm exec parent command', () => {
    expect(extractOkBinaryPath('npm exec @inkeep/open-knowledge mcp HOME=/Users/mike')).toBeNull();
  });
});
