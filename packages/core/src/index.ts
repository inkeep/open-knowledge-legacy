// Markdown pipeline (new unified+remark)

// Constants
export {
  ACTIVITY_TTL_MS,
  evictStaleEntries,
  FLASH_DEBOUNCE_MS,
  FLASH_DURATION_MS,
  hasNewEntries,
} from './constants/activity.ts';
// Extensions
export { CodeBlockFidelity } from './extensions/code-block-fidelity.ts';
export { EmphasisFidelity, StrongFidelity } from './extensions/emphasis-fidelity.ts';
export { EscapeMark } from './extensions/escape-mark.ts';
export { prependFrontmatter, stripFrontmatter } from './extensions/frontmatter.ts';
export { HardBreakFidelity } from './extensions/hard-break-fidelity.ts';
export { HeadingFidelity } from './extensions/heading-fidelity.ts';
export { HtmlBlockFidelity } from './extensions/html-block-fidelity.ts';
export { JsxComponent } from './extensions/jsx-component.ts';
export { LinkFidelity } from './extensions/link-fidelity.ts';
export { LinkRefDefFidelity } from './extensions/link-ref-def-fidelity.ts';
export { List, ListItem, ListItemNode, ListNode } from './extensions/list.ts';
export { sharedExtensions } from './extensions/shared.ts';
export { ThematicBreakFidelity } from './extensions/thematic-break-fidelity.ts';
export {
  getWikiLinkText,
  normalizeNullableString,
  parseWikiLink,
  renderWikiLink,
  WikiLink,
  type WikiLinkAttrs,
} from './extensions/wiki-link.ts';
export { MarkdownManager } from './markdown/index.ts';

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
