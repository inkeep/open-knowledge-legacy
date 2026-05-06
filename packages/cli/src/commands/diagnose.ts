import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import {
  discoverLockDirs,
  type ProcessUsage,
  processCommand,
  processUsage,
} from '../utils/process-scan.ts';
import { inspectLock, type LockState } from './lock-state.ts';

interface ProcessStat {
  ts: string;
  pid: number;
  cpuPercent: number;
  memPercent: number;
  rssKb: number;
  vszKb: number;
}

function sampleProcessStat(pid: number): ProcessStat | null {
  const r = spawnSync('ps', ['-p', String(pid), '-o', '%cpu=,%mem=,rss=,vsz='], {
    encoding: 'utf-8',
    timeout: 2000,
  });
  if (r.error || !r.stdout?.trim()) return null;
  const [cpu, mem, rss, vsz] = r.stdout.trim().split(/\s+/);
  const cpuPercent = Number.parseFloat(cpu ?? '');
  const memPercent = Number.parseFloat(mem ?? '');
  const rssKb = Number.parseInt(rss ?? '', 10);
  const vszKb = Number.parseInt(vsz ?? '', 10);
  if (
    Number.isNaN(cpuPercent) ||
    Number.isNaN(memPercent) ||
    Number.isNaN(rssKb) ||
    Number.isNaN(vszKb)
  )
    return null;
  return { ts: new Date().toISOString(), pid, cpuPercent, memPercent, rssKb, vszKb };
}

function collectLsof(pid: number): string | null {
  const r = spawnSync('lsof', ['-p', String(pid)], { encoding: 'utf-8', timeout: 5000 });
  return r.error || !r.stdout ? null : r.stdout;
}

function localhostListenPorts(lsofOutput: string): number[] {
  const ports: number[] = [];
  for (const line of lsofOutput.split('\n')) {
    const m = line.match(/127\.0\.0\.1:(\d+)\s*\(LISTEN\)/);
    if (m) {
      const p = Number.parseInt(m[1] ?? '', 10);
      if (!Number.isNaN(p)) ports.push(p);
    }
  }
  return ports;
}

function getInspectorEndpoints(port: number): unknown[] | null {
  const r = spawnSync('curl', ['-s', '--max-time', '2', `http://127.0.0.1:${port}/json/list`], {
    encoding: 'utf-8',
    timeout: 3000,
  });
  if (r.error || !r.stdout?.trim()) return null;
  try {
    const parsed = JSON.parse(r.stdout);
    return Array.isArray(parsed) ? (parsed as unknown[]) : null;
  } catch {
    return null;
  }
}

function writeCdpScript(wsUrl: string, profileMs: number, outputPath: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ok-cdp-'));
  const path = join(dir, 'profiler.mjs');
  writeFileSync(
    path,
    `import { writeFileSync } from 'node:fs';
const ws = new WebSocket(${JSON.stringify(wsUrl)});
let id = 0;
const send = (m) => ws.send(JSON.stringify({ id: ++id, method: m }));
ws.addEventListener('open', () => {
  send('Profiler.enable');
  send('Profiler.start');
  setTimeout(() => send('Profiler.stop'), ${profileMs});
});
ws.addEventListener('message', ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.result?.profile) {
    writeFileSync(${JSON.stringify(outputPath)}, JSON.stringify(msg.result.profile));
    ws.close();
  }
});
ws.addEventListener('close', () => process.exit(0));
ws.addEventListener('error', () => process.exit(1));
setTimeout(() => process.exit(2), ${profileMs + 10000});
`,
  );
  return path;
}

async function runProfiler(
  wsUrl: string,
  profileMs: number,
  pid: number,
  outDir: string,
  onStat: (s: ProcessStat) => void,
): Promise<boolean> {
  const profilePath = join(outDir, 'cpu.cpuprofile');
  const scriptPath = writeCdpScript(wsUrl, profileMs, profilePath);

  let succeeded = false;
  const child = spawn(process.execPath, [scriptPath], { stdio: 'ignore' });
  const interval = setInterval(() => {
    const s = sampleProcessStat(pid);
    if (s) onStat(s);
  }, 1000);

  await new Promise<void>((resolve) => {
    child.once('close', (code) => {
      succeeded = code === 0;
      resolve();
    });
    setTimeout(() => {
      child.kill();
      resolve();
    }, profileMs + 12000);
  });
  clearInterval(interval);

  try {
    rmSync(join(scriptPath, '..'), { recursive: true, force: true });
  } catch {}

  return succeeded;
}

type CpuProfile = {
  nodes: Array<{
    id: number;
    hitCount?: number;
    callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
    children?: number[];
  }>;
  samples?: number[];
  startTime?: number;
  endTime?: number;
};

function summarizeProfile(profileJson: string): string {
  let profile: CpuProfile;
  try {
    profile = JSON.parse(profileJson) as CpuProfile;
  } catch {
    return '(could not parse profile)';
  }

  const nodeMap = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes) {
    for (const childId of node.children ?? []) {
      parent.set(childId, node.id);
    }
  }

  const sampleCounts = new Map<number, number>();
  for (const sid of profile.samples ?? []) {
    sampleCounts.set(sid, (sampleCounts.get(sid) ?? 0) + 1);
  }

  const total = profile.samples?.length ?? 0;
  const durationMs =
    profile.endTime != null && profile.startTime != null
      ? ((profile.endTime - profile.startTime) / 1000).toFixed(2)
      : '?';

  const sorted = [...sampleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const lines: string[] = [`samples ${total} duration_ms ${durationMs}`, '', 'Top leaf nodes'];

  for (const [nodeId, count] of sorted) {
    const node = nodeMap.get(nodeId);
    if (!node) continue;
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
    const { functionName, url, lineNumber, columnNumber } = node.callFrame;
    lines.push(
      ` ${count} ${pct}% id=${nodeId} ${functionName || '(anonymous)'} ${url}:${lineNumber}:${columnNumber} hit=${node.hitCount ?? 0}`,
    );
  }

  lines.push('', 'Top stacks');

  const walkStack = (nodeId: number): string[] => {
    const stack: string[] = [];
    let cur: number | undefined = nodeId;
    while (cur != null) {
      const n = nodeMap.get(cur);
      if (!n) break;
      const { functionName, url, lineNumber, columnNumber } = n.callFrame;
      stack.unshift(`  ${functionName || '(anonymous)'}  ${url} ${lineNumber} ${columnNumber}`);
      cur = parent.get(cur);
    }
    return stack;
  };

  for (const [nodeId, count] of sorted.slice(0, 5)) {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
    lines.push('', `--- ${count} ${pct}%`, ...walkStack(nodeId));
  }

  return lines.join('\n');
}

interface DiagnoseProcessDeps {
  discover?: () => Promise<string[]>;
  inspect?: (lockDir: string, name: 'server' | 'ui') => LockState;
  resolveCommand?: (pid: number) => string | null;
  resolveUsage?: (pid: number) => ProcessUsage | null;
  collectLsofFn?: (pid: number) => string | null;
  getEndpoints?: (port: number) => unknown[] | null;
  profiler?: (
    wsUrl: string,
    profileMs: number,
    pid: number,
    outDir: string,
    onStat: (s: ProcessStat) => void,
  ) => Promise<boolean>;
  isAlive?: (pid: number) => boolean;
  sendSignal?: (pid: number, signal: string) => void;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
}

interface RunDiagnoseOpts {
  pid: number;
  cpuProfileSecs?: number;
  output?: string;
  noInspector?: boolean;
}

export async function runDiagnose(
  opts: RunDiagnoseOpts,
  deps: DiagnoseProcessDeps = {},
): Promise<void> {
  const { pid, cpuProfileSecs = 15, noInspector = false } = opts;
  const log = deps.log ?? ((m: string) => console.log(m));
  const discover = deps.discover ?? discoverLockDirs;
  const inspect = deps.inspect ?? inspectLock;
  const resolveCmd = deps.resolveCommand ?? processCommand;
  const resolveUsage = deps.resolveUsage ?? processUsage;
  const lsofFn = deps.collectLsofFn ?? collectLsof;
  const endpointsFn = deps.getEndpoints ?? getInspectorEndpoints;
  const profilerFn = deps.profiler ?? runProfiler;
  const isAlive =
    deps.isAlive ??
    ((p: number): boolean => {
      try {
        process.kill(p, 0);
        return true;
      } catch (err) {
        return (err as NodeJS.ErrnoException).code === 'EPERM';
      }
    });
  const sendSignal =
    deps.sendSignal ??
    ((p: number, sig: string) => {
      process.kill(p, sig as NodeJS.Signals);
    });
  const sleepFn = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const profileMs = cpuProfileSecs * 1000;

  if (!isAlive(pid)) {
    log(pc.red(`No process with pid ${pid} found.`));
    return;
  }

  const lockDirs = await discover();
  let contentDir: string | null = null;
  let lockInfo: unknown = null;
  for (const lockDir of lockDirs) {
    const s = inspect(lockDir, 'server');
    if (s.status !== 'missing' && s.status !== 'corrupt' && s.lock.pid === pid) {
      contentDir = s.lock.worktreeRoot;
      lockInfo = { lockDir, state: s.status, lockPath: s.lockPath, lock: s.lock };
      break;
    }
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = opts.output
    ? opts.output
    : contentDir
      ? join(contentDir, '.ok', 'local', 'diagnostics', `process-${pid}-${ts}`)
      : join(process.cwd(), `ok-diagnose-${pid}-${ts}`);
  try {
    mkdirSync(outDir, { recursive: true });
  } catch (err) {
    log(
      pc.red(`Cannot create output directory ${outDir}: ${(err as NodeJS.ErrnoException).message}`),
    );
    return;
  }

  log(pc.bold(`Diagnosing pid ${pid}`));
  log(`Output: ${outDir}`);
  log('');

  const write = (name: string, content: string): void => {
    writeFileSync(join(outDir, name), content);
    log(`  wrote ${name}`);
  };

  const command = resolveCmd(pid);
  const usage = resolveUsage(pid);
  write(
    'metadata.json',
    JSON.stringify(
      { capturedAt: new Date().toISOString(), pid, command, usage, lockInfo },
      null,
      2,
    ),
  );

  log('  sampling lsof...');
  const lsofOutput = lsofFn(pid);
  if (lsofOutput) write('lsof.txt', lsofOutput);

  if (!noInspector) {
    const inspectorPort = lsofOutput
      ? (localhostListenPorts(lsofOutput).find((p) => p >= 9229 && p <= 9299) ?? 9229)
      : 9229;

    let endpoints = endpointsFn(inspectorPort);

    if (!endpoints || endpoints.length === 0) {
      log(`  no inspector on :${inspectorPort}, sending SIGUSR1 to pid ${pid}...`);
      try {
        sendSignal(pid, 'SIGUSR1');
        await sleepFn(2000);
        endpoints = endpointsFn(inspectorPort);
      } catch (err) {
        log(pc.yellow(`  SIGUSR1 delivery failed: ${(err as NodeJS.ErrnoException).message}`));
      }
    }

    if (endpoints && endpoints.length > 0) {
      write('inspector-endpoints.json', JSON.stringify(endpoints, null, 2));
      const wsUrl = (endpoints[0] as { webSocketDebuggerUrl?: string }).webSocketDebuggerUrl;
      if (wsUrl) {
        log(`  capturing ${cpuProfileSecs}s CPU profile...`);
        const stats: ProcessStat[] = [];
        const ok = await profilerFn(wsUrl, profileMs, pid, outDir, (s) => stats.push(s));
        if (ok) {
          log('  wrote cpu.cpuprofile');
        } else {
          log(pc.yellow('  CPU profile capture failed'));
        }
        if (stats.length > 0) {
          write('process-stats.jsonl', `${stats.map((s) => JSON.stringify(s)).join('\n')}\n`);
        }
        try {
          const profileJson = readFileSync(join(outDir, 'cpu.cpuprofile'), 'utf-8');
          write('stacks.txt', summarizeProfile(profileJson));
        } catch (err) {
          log(pc.yellow(`  stacks.txt skipped: ${(err as NodeJS.ErrnoException).message}`));
        }
      }
    } else {
      log(pc.yellow('  Node inspector unavailable — skipping CPU profile'));
    }
  }

  log('');
  log(pc.yellow('⚠  Before sharing, review what each file contains:'));
  log(
    '  metadata.json           — content directory paths, lock file locations, CPU/MEM at capture time',
  );
  log(
    '  lsof.txt                — all open files, network connections, and private paths for this process',
  );
  log('  inspector-endpoints.json — Node debugger metadata (titles, URLs)');
  log('  cpu.cpuprofile          — function names and source file paths from your Node process');
  log('  stacks.txt              — call stacks derived from cpu.cpuprofile; includes source paths');
  log('  process-stats.jsonl     — CPU/MEM/RSS numbers only; safe to share');
  log('');
  log(`Bundle: ${pc.bold(outDir)}`);
}

export function diagnoseCommand(): Command {
  const root = new Command('diagnose').description(
    'Diagnostic utilities for open-knowledge processes',
  );

  root
    .command('process')
    .description('Capture a diagnostic bundle (metadata, lsof, CPU profile) for a running process')
    .argument('<pid>', 'Process ID to diagnose')
    .option('--cpu-profile <seconds>', 'CPU profile duration (default: 15)', '15')
    .option('--output <dir>', 'Output directory')
    .option('--no-inspector', 'Collect metadata only; skip Node inspector and CPU profile')
    .action(
      async (pidStr: string, opts: { cpuProfile: string; output?: string; inspector: boolean }) => {
        const pid = Number.parseInt(pidStr, 10);
        if (Number.isNaN(pid) || pid <= 0) {
          console.error(pc.red(`Invalid pid: ${pidStr}`));
          process.exit(1);
        }
        const cpuProfileSecs = Number.parseInt(opts.cpuProfile, 10);
        if (Number.isNaN(cpuProfileSecs) || cpuProfileSecs <= 0) {
          console.error(pc.red('--cpu-profile must be a positive integer'));
          process.exit(1);
        }
        await runDiagnose({
          pid,
          cpuProfileSecs,
          output: opts.output,
          noInspector: !opts.inspector,
        });
      },
    );

  return root;
}
