/**
 * `open-knowledge clean` — prune stale / corrupt lock files; never touch live
 * or foreign-host locks.
 *
 * SPEC FR-1.7b / D-024: split from `ok stop` so lock-hygiene is a distinct
 * step. "Stale" here means same-host + dead pid OR unparseable JSON. A
 * cross-host lock is NOT ours to clean (we can't verify the remote pid), so
 * `ok clean` leaves it alone.
 */

import { unlinkSync } from 'node:fs';
import { type Config, resolveContentDir, resolveLockDir } from '@inkeep/open-knowledge-server';
import { Command } from 'commander';
import { inspectLock, type LockState } from './lock-state.ts';

interface PruneTarget {
  name: 'server' | 'ui';
  lockPath: string;
  reason: 'dead-pid' | 'corrupt';
}

interface CleanPlan {
  prune: PruneTarget[];
}

/**
 * Pure plan builder — decides which lock files should be removed. `alive`,
 * `missing`, and `foreign-host` states are all left alone.
 */
export function buildCleanPlan(server: LockState, ui: LockState): CleanPlan {
  const prune: PruneTarget[] = [];
  for (const [name, state] of [['server', server] as const, ['ui', ui] as const]) {
    if (state.status === 'dead-pid' || state.status === 'corrupt') {
      prune.push({ name, lockPath: state.lockPath, reason: state.status });
    }
  }
  return { prune };
}

interface RunCleanDeps {
  lockDir: string;
  inspect?: (name: 'server' | 'ui') => LockState;
  unlink?: (path: string) => void;
  log?: (msg: string) => void;
  error?: (msg: string) => void;
}

interface CleanOutcome {
  pruned: PruneTarget[];
  failed: Array<{ target: PruneTarget; error: string }>;
}

export function runClean(deps: RunCleanDeps): CleanOutcome {
  const inspect = deps.inspect ?? ((name) => inspectLock(deps.lockDir, name));
  const unlink = deps.unlink ?? ((path) => unlinkSync(path));
  const log = deps.log ?? ((msg) => console.log(msg));
  const error = deps.error ?? ((msg) => console.error(msg));

  const plan = buildCleanPlan(inspect('server'), inspect('ui'));

  if (plan.prune.length === 0) {
    log('No stale locks.');
    return { pruned: [], failed: [] };
  }

  const pruned: PruneTarget[] = [];
  const failed: Array<{ target: PruneTarget; error: string }> = [];
  for (const target of plan.prune) {
    try {
      unlink(target.lockPath);
      pruned.push(target);
    } catch (err) {
      failed.push({ target, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (pruned.length > 0) {
    const detail = pruned.map((t) => `${t.name} (${t.reason})`).join(', ');
    log(`Pruned ${pruned.length} stale lock${pruned.length === 1 ? '' : 's'}: ${detail}`);
  }
  if (failed.length > 0) {
    const rendered = failed
      .map(({ target, error: msg }) => `${target.name} (${target.lockPath}): ${msg}`)
      .join('; ');
    error(`Failed to prune: ${rendered}`);
  }

  return { pruned, failed };
}

export function cleanCommand(getConfig: () => Config): Command {
  return new Command('clean')
    .description('Prune stale / corrupt open-knowledge lock files (never touches live locks)')
    .action(() => {
      const config = getConfig();
      const lockDir = resolveLockDir(resolveContentDir(config, process.cwd()));
      const outcome = runClean({ lockDir });
      if (outcome.failed.length > 0) {
        process.exitCode = 1;
      }
    });
}
