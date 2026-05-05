import { Command } from 'commander';
import pc from 'picocolors';
import { discoverLockDirs } from '../utils/process-scan.ts';
import { inspectLock, type LockState } from './lock-state.ts';

interface PsEntry {
  directory: string;
  server: {
    port: number;
    status: LockState['status'];
    pid: number;
    startedAt: string;
  };
  ui: {
    port: number;
    status: LockState['status'];
    pid: number;
    startedAt: string;
  } | null;
  hostname: string;
  lockPath: string;
}

export function timeAgo(isoString: string, now = Date.now()): string {
  const then = new Date(isoString).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function buildEntry(_lockDir: string, serverState: LockState, uiState: LockState): PsEntry | null {
  if (serverState.status === 'missing' || serverState.status === 'corrupt') {
    return null;
  }

  const serverLock = serverState.lock;

  let ui: PsEntry['ui'] = null;
  if (uiState.status !== 'missing' && uiState.status !== 'corrupt') {
    const uiLock = uiState.lock;
    ui = {
      port: uiLock.port,
      status: uiState.status,
      pid: uiLock.pid,
      startedAt: uiLock.startedAt,
    };
  }

  return {
    directory: serverLock.worktreeRoot,
    server: {
      port: serverLock.port,
      status: serverState.status,
      pid: serverLock.pid,
      startedAt: serverLock.startedAt,
    },
    ui,
    hostname: serverLock.hostname,
    lockPath: serverState.lockPath,
  };
}

function statusLabel(status: LockState['status']): string {
  switch (status) {
    case 'alive':
      return 'running';
    case 'dead-pid':
      return 'stale';
    case 'foreign-host':
      return 'foreign';
    default:
      return status;
  }
}

function colorStatus(status: LockState['status'], label: string): string {
  switch (status) {
    case 'alive':
      return pc.green(label);
    case 'dead-pid':
      return pc.yellow(label);
    case 'foreign-host':
      return pc.cyan(label);
    default:
      return label;
  }
}

function formatPorts(entry: PsEntry): string {
  const serverPort = entry.server.port === 0 ? '(starting)' : String(entry.server.port);
  const uiPort =
    entry.ui == null || entry.ui.status === 'dead-pid' || entry.ui.status === 'foreign-host'
      ? '—'
      : String(entry.ui.port);
  return `${serverPort} / ${uiPort}`;
}

export function renderTable(entries: PsEntry[]): string {
  if (entries.length === 0) {
    return 'No open-knowledge servers found.';
  }

  const headers = ['DIRECTORY', 'PORTS (API/UI)', 'STATUS', 'PID', 'STARTED'];
  const rows = entries.map((e) => [
    e.directory,
    formatPorts(e),
    statusLabel(e.server.status),
    String(e.server.pid),
    timeAgo(e.server.startedAt),
  ]);

  const colCount = headers.length;
  const widths: number[] = headers.map((h) => h.length);
  for (const row of rows) {
    for (let i = 0; i < colCount; i++) {
      widths[i] = Math.max(widths[i] ?? 0, (row[i] ?? '').length);
    }
  }

  const headerLine = headers
    .map((h, i) => h.padEnd(widths[i] ?? 0))
    .join('  ')
    .trimEnd();

  const dataLines = entries.map((entry, rowIdx) => {
    const row = rows[rowIdx] ?? [];
    const cols: string[] = [];
    for (let i = 0; i < colCount; i++) {
      let cell = (row[i] ?? '').padEnd(widths[i] ?? 0);
      if (i === 2) {
        const rawCell = row[i] ?? '';
        const colored = colorStatus(entry.server.status, rawCell);
        const padding = ' '.repeat(Math.max(0, (widths[i] ?? 0) - rawCell.length));
        cell = colored + padding;
      }
      cols.push(cell);
    }
    return cols.join('  ').trimEnd();
  });

  const hint = pc.dim('To stop a server: ok stop <port|pid|directory|all>');
  return [headerLine, ...dataLines, '', hint].join('\n');
}

interface RunPsDeps {
  discover?: () => Promise<string[]>;
  inspect?: (lockDir: string, name: 'server' | 'ui') => LockState;
  json?: boolean;
  all?: boolean;
  log?: (msg: string) => void;
}

export async function runPs(deps: RunPsDeps = {}): Promise<void> {
  const discover = deps.discover ?? discoverLockDirs;
  const inspect = deps.inspect ?? inspectLock;
  const log = deps.log ?? ((msg) => console.log(msg));

  const lockDirs = await discover();

  const entries: PsEntry[] = [];
  for (const lockDir of lockDirs) {
    const serverState = inspect(lockDir, 'server');
    const uiState = inspect(lockDir, 'ui');
    const entry = buildEntry(lockDir, serverState, uiState);
    if (entry != null) {
      entries.push(entry);
    }
  }

  if (deps.json) {
    log(JSON.stringify(entries, null, 2));
    return;
  }

  const filtered = deps.all
    ? entries.filter(
        (e) =>
          e.server.status === 'alive' ||
          e.server.status === 'dead-pid' ||
          e.server.status === 'foreign-host',
      )
    : entries.filter((e) => e.server.status === 'alive');

  log(renderTable(filtered));
}

export function psCommand(): Command {
  return new Command('ps')
    .description('List all running open-knowledge servers')
    .argument('[modifier]', '"all" to include stale/foreign entries')
    .option('--all', 'Include stale (dead-pid) and foreign-host entries')
    .option('--json', 'Emit structured JSON (always includes all statuses)')
    .action(async (modifier: string | undefined, opts: { all?: boolean; json?: boolean }) => {
      const all = opts.all === true || modifier === 'all';
      await runPs({ all, json: opts.json === true });
    });
}
