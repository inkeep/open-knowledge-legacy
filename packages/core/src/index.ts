// Markdown pipeline (new unified+remark)

// Re-export VFileMessage for Observer B's error classification (instanceof check
// instead of fragile constructor.name string comparison).
export { VFileMessage } from 'vfile-message';

// Constants
export {
  ACTIVITY_TTL_MS,
  evictStaleEntries,
  FLASH_DEBOUNCE_MS,
  FLASH_DURATION_MS,
  hasNewEntries,
} from './constants/activity.ts';
export { CC1_CONTRACT_VERSION, SYSTEM_DOC_NAME } from './constants/cc1.ts';
export { isOrphanMode, ORPHAN_MODES, type OrphanMode } from './constants/graph.ts';
export { OK_DIR } from './constants/ok-dir.ts';
export {
  ALLOWED_IMAGE_MIME_TYPES,
  ASSET_EXTENSIONS,
  DEFAULT_UPLOAD_CONFIG,
  type DedupMode,
  type DedupUIMode,
  type EmitFormat,
  IMAGE_EXTENSIONS,
  type UploadConfig,
} from './constants/upload.ts';

// Extensions
export { CodeBlockFidelity } from './extensions/code-block-fidelity.ts';
export { EmphasisFidelity, StrongFidelity } from './extensions/emphasis-fidelity.ts';
export { EscapeMark } from './extensions/escape-mark.ts';
export { prependFrontmatter, stripFrontmatter } from './extensions/frontmatter.ts';
export { HardBreakFidelity } from './extensions/hard-break-fidelity.ts';
export { HeadingFidelity } from './extensions/heading-fidelity.ts';
export { HtmlBlockFidelity } from './extensions/html-block-fidelity.ts';
export { JsxComponent } from './extensions/jsx-component.ts';
export { JsxInline } from './extensions/jsx-inline.ts';
export { LinkFidelity } from './extensions/link-fidelity.ts';
export { LinkRefDefFidelity } from './extensions/link-ref-def-fidelity.ts';
export { List, ListItem, ListItemNode, ListNode } from './extensions/list.ts';
export { RawMdxFallback } from './extensions/raw-mdx-fallback.ts';
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
export {
  HTML_MAX_BYTES,
  HtmlPayloadTooLargeError,
  htmlToMdast,
  mdastToMarkdown,
} from './markdown/html-to-mdast.ts';
export { MarkdownManager } from './markdown/index.ts';
export { markdownToHtml, mdastToHtml } from './markdown/mdast-to-html.ts';
export {
  getParseHealth,
  incrementBlockFallback,
  incrementWholeDocFallback,
  incrementYpsMismatchBlock,
  incrementYpsMismatchInline,
  type ParseHealthMetrics,
  resetParseHealth,
} from './metrics/parse-health.ts';
export { extensionOf } from './utils/extension.ts';

// Desktop bridge types (`OkDesktopBridge`, `OkDesktopConfig`, etc.) are
// defined locally per package: `packages/desktop/src/shared/bridge-contract.ts`
// for the desktop preload, and a future `packages/app/src/lib/desktop-bridge-
// types.ts` for the app renderer's optional `window.okDesktop` access. Keeping
// the contract co-located instead of re-exporting from this barrel avoids
// dragging the full markdown / CRDT-bridge surface into desktop's compilation
// context (TypeScript follows barrel re-exports through workspace symlinks
// and complains about transitive deps that desktop doesn't declare directly).
// `packages/core/src/desktop-bridge.ts` is the canonical reference shape;
// drift between the per-package copies is caught by a contract-equality test
// added in US-010.

// Shadow-repo layout helpers are NOT re-exported here — they import `node:fs`
// and would contaminate core's browser-compatibility contract. Import via the
// subpath: `import { parseWriterId } from '@inkeep/open-knowledge-core/shadow-repo-layout'`.
// (D22/FR20 — CLI read path and server write path are the only consumers.)

// Bridge — observer/CRDT-bridge shared utilities (precedent #14)
export {
  applyFastDiff,
  applyIncrementalDiff,
  assertContentPreservation,
  BridgeMergeContentLossError,
  type BridgeMergeContentLossInfo,
  type BridgeMergeContentLossLogPayload,
  type BridgeMergeContentLossSide,
  type BridgeMergeContentLossWhich,
  type DiffChange,
  defaultScheduler,
  diffLinesFast,
  getFrontmatter,
  mergeThreeWay,
  normalizeBridge,
  type Scheduler,
} from './bridge/index.ts';
// Types
export type {
  ActivityEntry,
  AgentFocusEntry,
  AwarenessState,
  AwarenessUser,
} from './types/awareness.ts';
export type { Identity } from './types/identity.ts';
export type {
  DiffLine,
  DiffLineType,
  EntryType,
  ShadowContributor,
  TimelineEntry,
} from './types/timeline.ts';

// Utils
export { applyByPrefixSuffix } from './utils/apply-by-prefix-suffix.ts';
export { ChunkedInsertError, chunkedYTextInsert } from './utils/chunked-insert.ts';
export { createCodeFenceTracker } from './utils/code-fence-tracker.ts';
export {
  AGENT_COLORS,
  AGENT_ICON_COLORS,
  colorFromSeed,
  deriveIconColor,
  generateRandomColor,
  generateRandomName,
  getIdentity,
  HUMAN_COLORS,
} from './utils/identity.ts';
export {
  type AnchorLinkTarget,
  buildRelativeMarkdownHref,
  type ClassifiedLinkTarget,
  classifyMarkdownHref,
  classifyWikiLinkTarget,
  type DocLinkTarget,
  type ExternalLinkTarget,
  isExternalHref,
} from './utils/link-targets.ts';
export { type BasenameIndex, createBasenameIndex } from './utils/path-resolve.ts';
export { type ResolvedInternalHref, resolveInternalHref } from './utils/resolve-internal-href.ts';
export {
  type PartialUserUploadConfig,
  resolveUploadConfig,
} from './utils/resolve-upload-config.ts';
export {
  disambiguateSlug,
  getHeadingSlug,
  type HeadingEntry,
  toWikiLinkSlug,
} from './utils/slug.ts';
