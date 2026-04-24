/**
 * Public entry point for the `ok seed` shared module.
 *
 * Consumed by:
 *   - `packages/cli/src/commands/seed.ts` — Commander CLI wrapper
 *   - `packages/desktop/src/main/ipc/seed.ts` — Electron IPC handler
 *   - `packages/server/src/index.ts` — re-exported for external workspace consumers
 *
 * See specs/2026-04-23-ok-seed-scaffold/SPEC.md for the full design.
 */

export { applySeed } from './apply.ts';
export { planSeed } from './plan.ts';
export {
  LOG_MD_TEMPLATE,
  STARTER_FOLDERS,
  type StarterFolder,
  starterFolderRule,
} from './starter.ts';
export type {
  ApplyError,
  ApplyResult,
  ConfigEdit,
  FileEntry,
  FolderFrontmatter,
  FolderRule,
  ScaffoldPlan,
  SeedOptions,
  SkipEntry,
} from './types.ts';
export { SEED_CONFIG_FILENAME, SeedPrerequisiteError } from './types.ts';
