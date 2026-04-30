/**
 * Node-only sub-export for `@inkeep/open-knowledge-core`.
 *
 * The four config writers in here (`writeConfigPatch`, `applyFolderRulesUpsert`,
 * `readConfigSafely`, `inspectConfigPaths`) statically import `node:fs`,
 * `node:fs/promises`, `node:os`, and `node:path` — bundling them into a
 * browser build via Vite produces "Module 'node:fs' has been externalized"
 * runtime errors as soon as a stub property is accessed.
 *
 * Browser consumers (`packages/app`) keep importing from the main barrel
 * (`@inkeep/open-knowledge-core`); server / cli / desktop main consumers
 * import from `@inkeep/open-knowledge-core/server` to reach the writers.
 *
 * STOP rule: never re-export anything from this file via `src/index.ts` —
 * the split is the contract.
 */

export {
  type ApplyFolderRulesUpsertOptions,
  type ApplyFolderRulesUpsertResult,
  applyFolderRulesUpsert,
  type FolderRuleUpsert,
} from './config/apply-folder-rules-upsert.ts';
export {
  type ConfigPathPresence,
  type InspectConfigPathsOptions,
  inspectConfigPaths,
} from './config/inspect-config-paths.ts';
export {
  type ReadConfigSafelyOptions,
  type ReadConfigSafelyResult,
  readConfigSafely,
} from './config/read-config-safely.ts';
export {
  resolveConfigPath,
  type WriteConfigPatchOptions,
  type WriteConfigPatchResult,
  type WriteConfigPatchSuccess,
  writeConfigPatch,
} from './config/write-config-patch.ts';
