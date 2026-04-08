// Extensions

// Constants
export {
  ACTIVITY_TTL_MS,
  evictStaleEntries,
  FLASH_DEBOUNCE_MS,
  FLASH_DURATION_MS,
  hasNewEntries,
} from './constants/activity';
export { prependFrontmatter, stripFrontmatter } from './extensions/frontmatter';
export { fenceFor, JsxComponent } from './extensions/jsx-component';
export {
  createJsxBlockExtension,
  type JsxToken,
  jsxStart,
  jsxTokenizerA,
  jsxTokenizerB,
  jsxTokenizerC,
  type TokenizerVersion,
} from './extensions/jsx-tokenizer';
export { sharedExtensions } from './extensions/shared';
// Types
export type { ActivityEntry, AwarenessState, AwarenessUser } from './types/awareness';
export type { Identity } from './types/identity';

// Utils
export {
  generateRandomColor,
  generateRandomName,
  getIdentity,
  HUMAN_COLORS,
} from './utils/identity';
