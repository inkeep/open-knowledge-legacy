// Constants
export {
  ACTIVITY_TTL_MS,
  evictStaleEntries,
  FLASH_DEBOUNCE_MS,
  FLASH_DURATION_MS,
  hasNewEntries,
} from './constants/activity.ts';

// Extensions
export { prependFrontmatter, stripFrontmatter } from './extensions/frontmatter.ts';
export {
  createJsxBlockExtension,
  type JsxToken,
  jsxStart,
  jsxTokenizerA,
  jsxTokenizerB,
  jsxTokenizerC,
  type TokenizerVersion,
} from './extensions/jsx-tokenizer.ts';
export {
  jsxComponentEditable,
  jsxComponentVoid,
  sharedExtensions,
} from './extensions/shared.ts';
export type { BuiltInManifestEntry, ComponentMeta, PropDef } from './registry/index.ts';
// Registry (BUILT_INS omitted — it uses node:module, only for build-registry script)
export { componentManifest } from './registry/index.ts';

// Types
export type { ActivityEntry, AwarenessState, AwarenessUser } from './types/awareness.ts';
export type { Identity } from './types/identity.ts';

// Utils
export {
  deriveIconColor,
  generateRandomColor,
  generateRandomName,
  getIdentity,
  HUMAN_COLORS,
} from './utils/identity.ts';
