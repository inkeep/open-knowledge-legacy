/**
 * Public entry point for the `ok seed` shared module.
 *
 * Consumed by:
 *   - `packages/cli/src/commands/seed.ts` — Commander CLI wrapper
 *   - `packages/desktop/src/main/ipc/seed.ts` — Electron IPC handler
 *   - `packages/cli/src/index.ts` — re-exported for external workspace consumers
 *
 * See specs/2026-04-23-ok-seed-scaffold/SPEC.md for the full design.
 */

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
  ScaffoldPlan,
  SeedOptions,
  SkipEntry,
} from './types.ts';
export { SeedPrerequisiteError } from './types.ts';
