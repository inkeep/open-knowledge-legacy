/**
 * Re-export shim — `ConfigSchema` and friends moved to
 * `@inkeep/open-knowledge-core` (D44/D50/FR-31). Existing importers continue
 * to work via this shim during the gradual two-PR move; PR 2 updates them to
 * import from core directly and removes this file.
 *
 * Re-aliased rather than `export {} from '@inkeep/...'` so tsdown's dts
 * emit (rolldown-plugin-dts) can resolve the names — the plugin doesn't
 * trace bare re-exports across workspace package boundaries.
 */
import {
  type Config as CoreConfig,
  ConfigSchema as CoreConfigSchema,
  type FolderFrontmatter as CoreFolderFrontmatter,
  type FolderRule as CoreFolderRule,
} from '@inkeep/open-knowledge-core';

export type Config = CoreConfig;
export type FolderFrontmatter = CoreFolderFrontmatter;
export type FolderRule = CoreFolderRule;
export const ConfigSchema = CoreConfigSchema;
