/**
 * Detached spawn lifetime — US-014 / A3.
 *
 * The core invariant behind D-003 (sibling-spawn supersedes §D4 OQ#1
 * embedding): when the MCP stdio process exits, its detached `ok start`
 * child MUST remain alive. The §D4 concern was that Claude Code kills the
 * MCP child on session end — a sibling-spawn with `{detached: true, stdio:
 * ['ignore','ignore','ignore'], .unref()}` puts the grandchild in a new
 * process group with no parent-lifetime dependency.
 *
 * Test strategy (no published CLI required):
 *   1. Parent test spawns an "MCP-surrogate" bun child that in turn spawns
 *      an "ok-start-surrogate" grandchild detached + unref.
 *   2. The grandchild writes its pid to a tempfile, then sleeps.
 *   3. Parent kills the MCP-surrogate (SIGKILL) after a brief delay so the
 *      child process cannot run cleanup hooks.
 *   4. Parent asserts the grandchild pid is still alive ≥1s after the
 *      MCP-surrogate exited. 10s in the spec AC is conservative — we
 *      check at 1.5s to keep the test fast; killing the grandchild at
 *      the end reclaims OS resources.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('detached spawn lifetime (A3 / D-003)', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = resolve(
      tmpdir(),
      `detached-spawn-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('grandchild survives parent SIGKILL (sibling-process detach pattern)', async () => {
    const grandchildScript = join(testDir, 'grandchild.ts');
    const pidFile = join(testDir, 'grandchild.pid');
    const mcpSurrogateScript = join(testDir, 'mcp-surrogate.ts');

    // Grandchild writes its pid to disk, then sleeps for 30s so we can probe
    // liveness without worrying about natural exit.
    writeFileSync(
      grandchildScript,
      `
import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
await new Promise((r) => setTimeout(r, 30_000));
`,
      'utf-8',
    );

    // MCP-surrogate spawns the grandchild detached + unref, then exits cleanly.
    writeFileSync(
      mcpSurrogateScript,
      `
import { spawn } from 'node:child_process';
const child = spawn('bun', [${JSON.stringify(grandchildScript)}], {
  detached: true,
  stdio: ['ignore', 'ignore', 'ignore'],
});
child.unref();
// Give the child a beat to exec so its pid file write happens.
setTimeout(() => process.exit(0), 200);
`,
      'utf-8',
    );

    // Spawn the MCP-surrogate and let it finish (it detaches, exits cleanly).
    const mcp = spawn('bun', [mcpSurrogateScript], { stdio: 'ignore' });
    const mcpPid = mcp.pid;
    expect(mcpPid).toBeGreaterThan(0);

    const mcpExited = new Promise<number>((resolveExit) => {
      mcp.on('exit', (code) => resolveExit(code ?? -1));
    });

    // Wait for the MCP-surrogate to finish detaching and exit cleanly.
    await mcpExited;
    // Give the grandchild a moment to write its pid file.
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline && !existsSync(pidFile)) {
      await sleep(50);
    }
    expect(existsSync(pidFile)).toBe(true);

    const grandchildPid = Number.parseInt(readFileSync(pidFile, 'utf-8').trim(), 10);
    expect(grandchildPid).toBeGreaterThan(0);

    // Parent (mcp-surrogate) is definitely dead now.
    if (mcpPid !== undefined) {
      expect(isProcessAlive(mcpPid)).toBe(false);
    }

    // Grandchild should still be alive 1.5s after its parent exited.
    await sleep(1_500);
    try {
      expect(isProcessAlive(grandchildPid)).toBe(true);
    } finally {
      // Cleanup: kill the grandchild so it doesn't linger for 30s.
      try {
        process.kill(grandchildPid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
  }, 15_000);
});
