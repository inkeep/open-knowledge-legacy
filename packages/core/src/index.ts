// Constants
export {
  ACTIVITY_TTL_MS,
  evictStaleEntries,
  FLASH_DEBOUNCE_MS,
  FLASH_DURATION_MS,
  hasNewEntries,
} from './constants/activity.ts';

// Extensions
export { BulletListFidelity } from './extensions/bullet-list-fidelity.ts';
export { CodeBlockFidelity } from './extensions/code-block-fidelity.ts';
export { BoldFidelity, ItalicFidelity } from './extensions/emphasis-fidelity.ts';
export { prependFrontmatter, stripFrontmatter } from './extensions/frontmatter.ts';
export { HardBreakFidelity } from './extensions/hard-break-fidelity.ts';
export { HeadingFidelity } from './extensions/heading-fidelity.ts';
export { HorizontalRuleFidelity } from './extensions/horizontal-rule-fidelity.ts';
export { HtmlBlockFidelity } from './extensions/html-block-fidelity.ts';
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
export { LinkFidelity } from './extensions/link-fidelity.ts';
export { LinkRefDefFidelity } from './extensions/link-ref-def-fidelity.ts';
export { ListItemFidelity } from './extensions/list-item-fidelity.ts';
export { OrderedListFidelity } from './extensions/ordered-list-fidelity.ts';
export { sharedExtensions } from './extensions/shared.ts';
export {
  getWikiLinkText,
  normalizeNullableString,
  parseWikiLink,
  renderWikiLink,
  WikiLink,
  type WikiLinkAttrs,
} from './extensions/wiki-link.ts';

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
export { type HeadingEntry, toWikiLinkSlug } from './utils/slug.ts';
