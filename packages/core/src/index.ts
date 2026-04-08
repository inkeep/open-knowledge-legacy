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
export { fenceFor, JsxComponent } from './extensions/jsx-component.ts';
export {
  createJsxBlockExtension,
  type JsxToken,
  jsxStart,
  jsxTokenizerA,
  jsxTokenizerB,
  jsxTokenizerC,
  type TokenizerVersion,
} from './extensions/jsx-tokenizer.ts';
export { sharedExtensions } from './extensions/shared.ts';

// Types
export type { ActivityEntry, AwarenessState, AwarenessUser } from './types/awareness.ts';
export type { Identity } from './types/identity.ts';

// Utils
export {
  generateRandomColor,
  generateRandomName,
  getIdentity,
  HUMAN_COLORS,
} from './utils/identity.ts';
