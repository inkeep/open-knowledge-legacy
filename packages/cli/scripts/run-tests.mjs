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

const killTree = (signal) => {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // PG may already be empty.
  }
  try {
    spawnSync('pkill', ['-9', '-P', String(child.pid)], { stdio: 'ignore' });
    spawnSync('pkill', ['-9', '-P', String(process.pid)], { stdio: 'ignore' });
  } catch {
    // pkill missing is non-fatal.
  }
  if (child.exitCode === null && !child.killed) {
    try {
      child.kill(signal);
    } catch {
      // already gone
    }
  }
};

const finalize = (code) => {
  if (exited) return;
  exited = true;
  if (postSummaryTimer !== undefined) clearTimeout(postSummaryTimer);
  if (hardTimer !== undefined) clearTimeout(hardTimer);
  killTree('SIGKILL');
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
  if (code !== null) {
    finalize(code);
    return;
  }
  log(`[run-tests] bun child exited via signal ${signal ?? 'unknown'}`);
  finalize(sawRanLine && sawZeroFailures && !sawNonzeroFailures ? 0 : 1);
});

child.on('error', (err) => {
  log(`[run-tests] failed to spawn bun: ${err.message}`);
  finalize(1);
});
