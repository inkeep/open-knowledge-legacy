import {
  applySeed as applySeedImpl,
  planSeed as planSeedImpl,
  type ScaffoldPlan,
  SeedPrerequisiteError,
  SeedRootDirError,
} from '@inkeep/open-knowledge-server';
import type { OkSeedApplyResult, OkSeedPlanResult } from '../../shared/bridge-contract.ts';

export type SeedPlanResult = OkSeedPlanResult;
export type SeedApplyResult = OkSeedApplyResult;

interface SeedIpcDeps {
  resolveProjectRoot: () => string | undefined;
  planSeed?: typeof planSeedImpl;
  applySeed?: typeof applySeedImpl;
}

export async function handleSeedPlan(deps: SeedIpcDeps, rootDir?: string): Promise<SeedPlanResult> {
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
    const result = await plan({ projectDir: projectRoot, rootDir });
    return { ok: true, plan: result };
  } catch (err) {
    if (err instanceof SeedPrerequisiteError) {
      return { ok: false, error: { kind: 'prerequisite-missing', message: err.message } };
    }
    if (err instanceof SeedRootDirError) {
      return { ok: false, error: { kind: 'invalid-root', message: err.message } };
    }
    return {
      ok: false,
      error: { kind: 'internal', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

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
