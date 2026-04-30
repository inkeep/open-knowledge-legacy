import { spawn } from 'node:child_process';

const child = spawn('bun', ['--conditions=development', 'test'], {
  detached: true,
  stdio: ['inherit', 'pipe', 'pipe'],
});

let lineBuffer = '';
let sawRanLine = false;
let sawZeroFailures = false;
let sawNonzeroFailures = false;
let forcedExitTimer;

const terminateChildGroup = () => {
  if (child.pid === undefined) {
    if (child.exitCode === null) child.kill('SIGKILL');
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
};

const scheduleExitAfterSummary = () => {
  if (forcedExitTimer !== undefined || !sawRanLine) return;
  if (!sawZeroFailures && !sawNonzeroFailures) return;

  forcedExitTimer = setTimeout(() => {
    console.error('cli test runner completed summary; terminating remaining test process group');
    terminateChildGroup();
    process.exit(sawZeroFailures && !sawNonzeroFailures ? 0 : 1);
  }, 5000);
};

const inspectLine = (line) => {
  if (/^\s*0 fail\b/.test(line)) {
    sawZeroFailures = true;
  } else if (/^\s*[1-9]\d* fail\b/.test(line)) {
    sawNonzeroFailures = true;
  }
  if (/^Ran \d+ tests across \d+ files\./.test(line)) {
    sawRanLine = true;
  }
  scheduleExitAfterSummary();
};

const pipeAndInspect = (chunk, stream) => {
  stream.write(chunk);
  lineBuffer += chunk.toString('utf8');
  const lines = lineBuffer.split(/\r?\n/);
  lineBuffer = lines.pop() ?? '';
  for (const line of lines) inspectLine(line);
};

child.stdout.on('data', (chunk) => pipeAndInspect(chunk, process.stdout));
child.stderr.on('data', (chunk) => pipeAndInspect(chunk, process.stderr));

child.on('exit', (code, signal) => {
  if (forcedExitTimer !== undefined) clearTimeout(forcedExitTimer);
  if (lineBuffer.length > 0) inspectLine(lineBuffer);
  if (code !== null) {
    process.exit(code);
  }
  console.error(`cli test runner exited via signal ${signal ?? 'unknown'}`);
  process.exit(1);
});

child.on('error', (err) => {
  if (forcedExitTimer !== undefined) clearTimeout(forcedExitTimer);
  console.error(err);
  process.exit(1);
});
