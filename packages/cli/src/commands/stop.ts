/**
 * `open-knowledge stop` — SIGTERM live server + ui processes; leave stale
 * locks untouched (they belong to `ok clean`).
 *
 * SPEC FR-1.7 / D-005: single-responsibility split from lock pruning. Exits 0
 * when there's nothing live; exits 1 only when a SIGTERM fails (EPERM, etc).
 */

import { type Config, resolveContentDir, resolveLockDir } from '@inkeep/open-knowledge-server';
import { Command } from 'commander';
import { inspectLock, type LockState } from './lock-state.ts';

interface StopTargetPlan {
  name: 'server' | 'ui';
  pid: number;
  port: number;
}

interface StopPlan {
  targets: StopTargetPlan[];
}

/**
 * Pure plan builder — from two inspected lock states, list which pids to
 * SIGTERM. Only `alive` states produce a target; missing / corrupt /
 * foreign-host / dead-pid are all ignored at this layer (they're the realm
 * of `ok clean` and `ok status`).
 */
export function buildStopPlan(server: LockState, ui: LockState): StopPlan {
  const targets: StopTargetPlan[] = [];
  if (server.status === 'alive') {
    targets.push({ name: 'server', pid: server.lock.pid, port: server.lock.port });
  }
  if (ui.status === 'alive') {
    targets.push({ name: 'ui', pid: ui.lock.pid, port: ui.lock.port });
  }
  return { targets };
}

interface RunStopDeps {
  lockDir: string;
  inspect?: (name: 'server' | 'ui') => LockState;
  kill?: (pid: number, signal: NodeJS.Signals) => void;
  log?: (msg: string) => void;
  error?: (msg: string) => void;
}

interface StopOutcome {
  stopped: StopTargetPlan[];
  failed: Array<{ target: StopTargetPlan; error: string }>;
  hadTargets: boolean;
}

/**
 * Execute a stop plan. Exported for tests so they can drive it without
 * going through Commander. The Commander action wraps this and translates
 * `failed.length > 0` into `process.exitCode = 1`.
 */
export function runStop(deps: RunStopDeps): StopOutcome {
  const inspect = deps.inspect ?? ((name) => inspectLock(deps.lockDir, name));
  const kill = deps.kill ?? ((pid, signal) => process.kill(pid, signal));
  const log = deps.log ?? ((msg) => console.log(msg));
  const error = deps.error ?? ((msg) => console.error(msg));

  const serverState = inspect('server');
  const uiState = inspect('ui');
  const plan = buildStopPlan(serverState, uiState);

  if (plan.targets.length === 0) {
    log('No running open-knowledge processes.');
    return { stopped: [], failed: [], hadTargets: false };
  }

  const stopped: StopTargetPlan[] = [];
  const failed: Array<{ target: StopTargetPlan; error: string }> = [];
  for (const target of plan.targets) {
    try {
      kill(target.pid, 'SIGTERM');
      stopped.push(target);
    } catch (err) {
      failed.push({ target, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (stopped.length > 0) {
    const rendered = stopped.map((t) => `${t.name} (pid=${t.pid}, port=${t.port})`).join(', ');
    log(`Stopped: ${rendered}`);
  }
  if (failed.length > 0) {
    const rendered = failed
      .map(({ target, error: msg }) => `${target.name} (pid=${target.pid}): ${msg}`)
      .join('; ');
    error(`Failed to stop: ${rendered}`);
  }

  return { stopped, failed, hadTargets: true };
}

export function stopCommand(getConfig: () => Config): Command {
  return new Command('stop')
    .description('Stop the running open-knowledge server and UI (live only)')
    .action(() => {
      const config = getConfig();
      const lockDir = resolveLockDir(resolveContentDir(config, process.cwd()));
      const outcome = runStop({ lockDir });
      if (outcome.failed.length > 0) {
        process.exitCode = 1;
      }
    });
}
