// Wrapper around `bun test` that survives bun's well-known
// "doesn't-exit-after-summary" failure mode in CI.
//
// Why this exists:
//   - Bun's test runner sometimes prints `Ran N tests across M files.` and then
//     keeps the event loop alive (leaked HTTP servers, pending watchers, etc.),
//     so the underlying `bun --conditions=development test` process never
//     exits. Without intervention turbo waits forever and the GitHub Actions
//     job hits its 15-minute hard timeout.
//   - bun's own `child_process.spawn(...).kill()` is unreliable on GitHub
//     Actions runners (oven-sh/bun#11892), so we belt-and-braces the kill
//     by going through `pkill` (POSIX, available in CI's ubuntu-latest) and
//     by writing diagnostics with `fs.writeSync` so no message is lost when
//     `process.exit` skips stream draining.
//
// Exit policy:
//   * normal child exit with code 0 → propagate code 0
//   * normal child exit with non-zero code → propagate that code
//   * 5-second post-summary timer fires (bun completed but did not exit) →
//       exit 0 if `0 fail` was seen, else exit 1
//   * 10-minute hard timeout fires (bun never reached the summary) → exit 1
//   * spawn error or signal-only exit without summary → exit 1
//
// We never report success unless we actually saw `Ran N tests across M files.`
// followed by `0 fail`, otherwise a runaway hang would silently stamp green.

import { spawn, spawnSync } from 'node:child_process';
import { writeSync } from 'node:fs';

const HARD_TIMEOUT_MS = 10 * 60 * 1000;
const POST_SUMMARY_GRACE_MS = 5_000;

const log = (msg) => {
  try {
    writeSync(2, `${msg}\n`);
  } catch {
    // Best-effort; if stderr is gone we have nothing to do.
  }
};

const child = spawn('bun', ['--conditions=development', 'test'], {
  detached: true,
  stdio: ['inherit', 'pipe', 'pipe'],
});

let lineBuffer = '';
let sawRanLine = false;
let sawZeroFailures = false;
let sawNonzeroFailures = false;
let postSummaryTimer;
let hardTimer;
let exited = false;

// See `packages/server/scripts/run-tests.mjs` for the rationale: turbo's
// step stays open until the cgroup drains, and tests can spawn detached
// grandchildren that escape `process.kill(-pid)`. Recursive walk catches
// every PID in the tree.
const collectDescendantPids = (rootPid) => {
  const seen = new Set();
  const queue = [rootPid];
  while (queue.length > 0) {
    const pid = queue.shift();
    if (seen.has(pid)) continue;
    seen.add(pid);
    const result = spawnSync('pgrep', ['-P', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (result.status !== 0 || typeof result.stdout !== 'string') continue;
    for (const line of result.stdout.split('\n')) {
      const next = Number.parseInt(line.trim(), 10);
      if (Number.isFinite(next) && next > 1 && !seen.has(next)) queue.push(next);
    }
  }
  seen.delete(rootPid);
  return [...seen];
};

const killTree = (signal) => {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // PG may already be empty.
  }
  const descendants = new Set([
    ...collectDescendantPids(process.pid),
    ...collectDescendantPids(child.pid),
  ]);
  for (const pid of descendants) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already dead or reparented out of our reach.
    }
  }
  if (child.exitCode === null && !child.killed) {
    try {
      child.kill(signal);
    } catch {
      // already gone
    }
  }
};

const dumpDescendantTree = (label, rootPid) => {
  try {
    const descendants = collectDescendantPids(rootPid);
    log(`[run-tests] ${label} descendants of pid ${rootPid}: ${descendants.length} found`);
    if (descendants.length === 0) return;
    const psByPid = spawnSync(
      'ps',
      ['-o', 'pid=,ppid=,pgid=,stat=,etime=,args=', '-p', descendants.join(',')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    if (psByPid.status === 0 && typeof psByPid.stdout === 'string') {
      const trimmed = psByPid.stdout.trim();
      if (trimmed.length > 0) {
        for (const line of trimmed.split('\n')) log(`[run-tests]   ${line}`);
      }
    }
  } catch {
    // Diagnostic-only.
  }
};

const finalize = (code) => {
  if (exited) return;
  exited = true;
  if (postSummaryTimer !== undefined) clearTimeout(postSummaryTimer);
  if (hardTimer !== undefined) clearTimeout(hardTimer);
  dumpDescendantTree('pre-kill', process.pid);
  killTree('SIGKILL');
  dumpDescendantTree('post-kill', process.pid);
  log(`[run-tests] FINALIZE exit=${code} pid=${process.pid} childPid=${child.pid ?? 'none'}`);
  process.exit(code);
};

hardTimer = setTimeout(() => {
  log('[run-tests] HARD TIMEOUT — bun never reached the test summary; killing process tree');
  finalize(1);
}, HARD_TIMEOUT_MS);

const schedulePostSummaryExit = () => {
  if (postSummaryTimer !== undefined || !sawRanLine) return;
  if (!sawZeroFailures && !sawNonzeroFailures) return;
  postSummaryTimer = setTimeout(() => {
    log('[run-tests] post-summary grace expired — bun did not auto-exit; killing process tree');
    finalize(sawZeroFailures && !sawNonzeroFailures ? 0 : 1);
  }, POST_SUMMARY_GRACE_MS);
};

const inspectLine = (line) => {
  if (/\b0\s+fail\b/.test(line)) {
    sawZeroFailures = true;
  } else if (/\b[1-9]\d*\s+fail\b/.test(line)) {
    sawNonzeroFailures = true;
  }
  if (/Ran \d+ tests across \d+ files\./.test(line)) {
    sawRanLine = true;
  }
  schedulePostSummaryExit();
};

const pipeAndInspect = (chunk, stream) => {
  stream.write(chunk);
  lineBuffer += chunk.toString('utf8');
  const lines = lineBuffer.split(/\r?\n/);
  lineBuffer = lines.pop() ?? '';
  for (const line of lines) inspectLine(line);
  if (lineBuffer.length > 0) inspectLine(lineBuffer);
};

child.stdout.on('data', (chunk) => pipeAndInspect(chunk, process.stdout));
child.stderr.on('data', (chunk) => pipeAndInspect(chunk, process.stderr));

child.on('exit', (code, signal) => {
  if (lineBuffer.length > 0) inspectLine(lineBuffer);
  log(
    `[run-tests] bun child exited code=${code} signal=${signal ?? 'none'} sawRan=${sawRanLine} sawZeroFail=${sawZeroFailures} sawNonzeroFail=${sawNonzeroFailures}`,
  );
  if (code !== null) {
    finalize(code);
    return;
  }
  finalize(sawRanLine && sawZeroFailures && !sawNonzeroFailures ? 0 : 1);
});

child.on('error', (err) => {
  log(`[run-tests] failed to spawn bun: ${err.message}`);
  finalize(1);
});
