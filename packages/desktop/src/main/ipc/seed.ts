/**
 * IPC handler implementations for the `ok seed` scaffolder.
 *
 * Exposes two channels to the renderer:
 *   - `ok:seed:plan`  — compute the ScaffoldPlan for the current project
 *   - `ok:seed:apply` — apply a previously-computed ScaffoldPlan
 *
 * Follows the same pure-injectable shape as `packages/desktop/src/main/ipc-handlers.ts`:
 * each function takes an explicit `deps` object + channel args and returns the
 * channel result. Registration (binding to `ipcMain.handle` via `createHandler`)
 * happens in `main/index.ts` per D19 / SPEC 2026-04-23-ok-seed-scaffold.
 *
 * Rationale: logic lives in `@inkeep/open-knowledge-server`'s seed module
 * (shadcn-3.0 shared-TS-module pattern). The IPC layer is a thin wrapper that
 * scopes the call to the current window's project root.
 */

import {
  applySeed as applySeedImpl,
  planSeed as planSeedImpl,
  type ScaffoldPlan,
  SeedPrerequisiteError,
} from '@inkeep/open-knowledge-server';
import type { OkSeedApplyResult, OkSeedPlanResult } from '../../shared/bridge-contract.ts';

// Main/renderer wire format is the `OkSeed*Result` pair defined once in
// `bridge-contract.ts` (canonical result shape shared by Electron IPC + the
// web `/api/seed/*` HTTP endpoints). Re-exported under shorter aliases so
// `ipc-channels.ts` can continue to reference `SeedPlanResult/SeedApplyResult`
// without importing from the shared package — no second set of types.
export type SeedPlanResult = OkSeedPlanResult;
export type SeedApplyResult = OkSeedApplyResult;

/** Injected by `main/index.ts`; `plan` / `apply` delegate to the server module. */
export interface SeedIpcDeps {
  /**
   * Resolve the project root for the invoking BrowserWindow. Returns `undefined`
   * when no ProjectContext is bound (e.g. Navigator window, which never reaches
   * these handlers in practice). Handlers reject with a structured error in
   * that case.
   */
  resolveProjectRoot: () => string | undefined;
  /** Override for tests. Defaults to `planSeed` from the server package. */
  planSeed?: typeof planSeedImpl;
  /** Override for tests. Defaults to `applySeed` from the server package. */
  applySeed?: typeof applySeedImpl;
}

/**
 * `ok:seed:plan` handler — compute a ScaffoldPlan for the current window's
 * project. Pure read; never writes to disk.
 */
export async function handleSeedPlan(deps: SeedIpcDeps): Promise<SeedPlanResult> {
  const projectRoot = deps.resolveProjectRoot();
  if (!projectRoot) {
    return {
      ok: false,
      error: {
        kind: 'no-project',
        message: 'No project is bound to this window. Open a project first.',
      },
    };
  }

  const plan = deps.planSeed ?? planSeedImpl;
  try {
    const result = await plan({ projectDir: projectRoot });
    return { ok: true, plan: result };
  } catch (err) {
    if (err instanceof SeedPrerequisiteError) {
      return { ok: false, error: { kind: 'prerequisite-missing', message: err.message } };
    }
    return {
      ok: false,
      error: { kind: 'internal', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

/**
 * `ok:seed:apply` handler — apply a previously-computed ScaffoldPlan to the
 * current window's project. Writes folders, `log.md`, and `config.yml` edits.
 */
export async function handleSeedApply(
  deps: SeedIpcDeps,
  plan: ScaffoldPlan,
): Promise<SeedApplyResult> {
  const projectRoot = deps.resolveProjectRoot();
  if (!projectRoot) {
    return {
      ok: false,
      error: {
        kind: 'no-project',
        message: 'No project is bound to this window. Open a project first.',
      },
    };
  }

  const apply = deps.applySeed ?? applySeedImpl;
  try {
    const result = await apply(plan, { projectDir: projectRoot });
    return { ok: true, result };
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'internal', message: err instanceof Error ? err.message : String(err) },
    };
  }
}
