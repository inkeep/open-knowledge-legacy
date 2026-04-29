// Burst-grouping utility (FR-12, D20)
export {
  type Burst,
  bucketIntoBursts,
  type HumanEdit,
  type SessionTransaction,
} from './burst-grouping.ts';

// Markdown pipeline (new unified+remark)

// Re-export VFileMessage for Observer B's error classification (instanceof check
// instead of fragile constructor.name string comparison).
export { VFileMessage } from 'vfile-message';
// Headless config writers (US-003 — D5 reshape Part B / D38 reshaped / D63).
// UI ConfigBinding (US-008 — D5 reshape Part A / FR-33 / D48 / D59).
// Browser+node compatible — no Node deps; structural ConfigDocProvider type
// keeps `@hocuspocus/provider` out of core's runtime deps.
export {
  bindConfigDoc,
  type ConfigBinding,
  type ConfigBindingPatchResult,
  type ConfigBindingPatchSuccess,
  type ConfigDocProvider,
  type Unsubscribe,
} from './config/bind-config-doc.ts';
export {
  type ConfigIssue,
  ConfigIssueSchema,
  type ConfigIssueSource,
  ConfigIssueSourceSchema,
  type ConfigValidationError,
  ConfigValidationErrorSchema,
  type FieldScope,
  FieldScopeSchema,
  type ForwardCompatConfigError,
  ForwardCompatConfigErrorSchema,
  humanFormat,
  isKnownConfigError,
  type KnownConfigValidationError,
  KnownConfigValidationErrorSchema,
  type WriteScope,
  WriteScopeSchema,
} from './config/errors.ts';
export {
  type FieldMeta,
  fieldRegistry,
  getFieldMeta,
} from './config/field-registry.ts';
export type { Err, Ok, Result } from './config/result.ts';
// Config (config-edit-paths spec — D44/D50/FR-31, US-001)
// Schema, error envelope, and Result helper. Browser+node compatible.
export {
  type Config,
  type ConfigPatch,
  ConfigSchema,
  type FolderFrontmatter,
  FolderFrontmatterSchema,
  type FolderRule,
  FolderRuleSchema,
} from './config/schema.ts';
export { getLeafFieldMeta, resolveLeafSchema } from './config/schema-leaf.ts';
export { CONFIG_SCHEMA_MAJOR, CONFIG_SCHEMA_MAJOR_PATH } from './config/schema-version.ts';
export { type LocateOptions, locateIssue } from './config/source-locator.ts';
// OTel helpers for config-edit spans (US-014 / FR-38 / D53). Browser+node
// compatible — imports only `@opentelemetry/api`. Spans are inert no-ops
// when no SDK is registered (server: OTEL_SDK_DISABLED gate; app:
// VITE_OTEL_ENABLED gate).
export {
  addConfigSpanEvent,
  type ConfigOutcome,
  type ConfigScopeAttr,
  type ConfigSpanAttributes,
  type ConfigTransport,
  type ConfigValidationLayer,
  setConfigOutcome,
  withConfigSpan,
  withConfigSpanSync,
} from './config/telemetry.ts';
// Constants
export {
  ACTIVITY_TTL_MS,
  evictStaleEntries,
  FLASH_DEBOUNCE_MS,
  FLASH_DURATION_MS,
  hasNewEntries,
} from './constants/activity.ts';
export {
  CC1_CONTRACT_VERSION,
  CONFIG_DOC_NAME_USER,
  CONFIG_DOC_NAME_WORKSPACE,
  CONFIG_DOC_NAMES,
  type ConfigDocName,
  SYSTEM_DOC_NAME,
} from './constants/cc1.ts';
export { isOrphanMode, ORPHAN_MODES, type OrphanMode } from './constants/graph.ts';
export { OK_DIR } from './constants/ok-dir.ts';
export {
  ALLOWED_AUDIO_MIME_TYPES,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_VIDEO_MIME_TYPES,
  ASSET_EXTENSIONS,
} from './constants/upload.ts';
// Extensions
export { CodeBlockFidelity } from './extensions/code-block-fidelity.ts';
export { EmphasisFidelity, StrongFidelity } from './extensions/emphasis-fidelity.ts';
export { EscapeMark } from './extensions/escape-mark.ts';
export {
  prependFrontmatter,
  stripFrontmatter,
  unwrapFrontmatterFences,
} from './extensions/frontmatter.ts';
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
// Handoff — Open-in-Agent dropdown (specs/2026-04-21-open-in-agent-desktop/)
export {
  buildClaudeAiWebUrl,
  buildClaudeUrl,
  buildCodexUrl,
  buildCursorUrl,
  composePrompt,
  type DocContext,
  type HandoffFailureReason,
  type HandoffOutcome,
  type HandoffPayload,
  type HandoffTarget,
  type InstallState,
  type TargetData,
} from './handoff/index.ts';
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
  incrementJsxAutoConvertFailed,
  incrementJsxAutoConvertSucceeded,
  incrementJsxMoveFailed,
  incrementJsxPropDropped,
  incrementJsxRenderFailure,
  incrementJsxStuckCopyFailed,
  incrementJsxStuckDeleteFailed,
  incrementWholeDocFallback,
  incrementYpsMismatchBlock,
  incrementYpsMismatchInline,
  type ParseHealthMetrics,
  resetParseHealth,
} from './metrics/parse-health.ts';
// Registry
export {
  builtInComponents,
  type ComponentRegistry,
  createRegistry,
  wildcardMeta,
} from './registry/index.ts';
export type {
  JsxComponentMeta,
  PropDef,
  PropDefBase,
  PropDefBoolean,
  PropDefEnum,
  PropDefNumber,
  PropDefReactNode,
  PropDefString,
} from './registry/types.ts';
export {
  type PrincipalResponse,
  PrincipalResponseSchema,
  type ServerInfoResponse,
  ServerInfoResponseSchema,
} from './schemas/api.ts';
export {
  CC1_CHANNEL_BRANCH_SWITCHED,
  CC1_CHANNEL_CONFIG_VALIDATION_REJECTED,
  CC1_CHANNEL_DISK_ACK,
  CC1_CHANNEL_SERVER_INFO,
  type CC1BranchSwitchedPayload,
  CC1BranchSwitchedPayloadSchema,
  type CC1ConfigValidationRejectedPayload,
  CC1ConfigValidationRejectedPayloadSchema,
  type CC1DerivedViewPayload,
  CC1DerivedViewPayloadSchema,
  type CC1DiskAckPayload,
  CC1DiskAckPayloadSchema,
  type CC1ServerInfoPayload,
  CC1ServerInfoPayloadSchema,
  type DerivedViewChannel,
  DerivedViewChannelSchema,
} from './schemas/cc1.ts';

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
  composeFrontmatterForStore,
  type DiffChange,
  defaultScheduler,
  diffLinesFast,
  getFrontmatter,
  getFrontmatterMap,
  mergeThreeWay,
  normalizeBridge,
  type Scheduler,
  setFrontmatterFromYaml,
  setFrontmatterProperty,
  writeFrontmatterDualSlot,
} from './bridge/index.ts';
export {
  FRONTMATTER_TYPES,
  type FrontmatterMap,
  FrontmatterMapSchema,
  type FrontmatterPatch,
  FrontmatterPatchSchema,
  type FrontmatterType,
  FrontmatterTypeSchema,
  type FrontmatterValue,
  FrontmatterValueSchema,
  inferType,
  isIsoDateString,
} from './frontmatter/schema.ts';
// Frontmatter — per-key value schema + canonical YAML codec
export {
  applyPatchToDocument,
  getDocumentKeys,
  type ParsedFrontmatter,
  parseFrontmatterYaml,
  serializeFrontmatterMap,
  withFences,
} from './frontmatter/yaml-codec.ts';
// Types
export type { Actor, PrincipalId, SessionId } from './types/actor.ts';
export type {
  AgentFlashEntry,
  AgentFocusEntry,
  AgentPresenceEntry,
  AwarenessState,
  AwarenessUser,
} from './types/awareness.ts';
export type { Identity } from './types/identity.ts';
export type { Principal } from './types/principal.ts';
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
  AGENT_ICON_COLORS_DARK,
  colorFromSeed,
  computeInitials,
  deriveIconColor,
  formatPresenceLabel,
  generateRandomColor,
  generateRandomName,
  getIdentity,
  HUMAN_COLORS,
  iconFromClientName,
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
export { type ResolvedInternalHref, resolveInternalHref } from './utils/resolve-internal-href.ts';
export {
  disambiguateSlug,
  getHeadingSlug,
  type HeadingEntry,
  toWikiLinkSlug,
} from './utils/slug.ts';
