export { VFileMessage } from 'vfile-message';
export {
  applyFastDiff,
  applyIncrementalDiff,
  applyPatchToFm,
  applyRenameToFm,
  applyReorderToFm,
  assertContentPreservation,
  BridgeMergeContentLossError,
  type BridgeMergeContentLossInfo,
  type BridgeMergeContentLossLogPayload,
  type BridgeMergeContentLossSide,
  type BridgeMergeContentLossWhich,
  bindFrontmatterDoc,
  type DiffChange,
  defaultScheduler,
  detectFmRegion,
  diffLinesFast,
  type FmEditError,
  type FmEditResult,
  FORM_WRITE_ORIGIN,
  type FrontmatterBinding,
  type FrontmatterBindingPatchResult,
  type FrontmatterBindingPatchSuccess,
  type FrontmatterBindingRenameResult,
  type FrontmatterBindingRenameSuccess,
  type FrontmatterBindingReorderResult,
  type FrontmatterBindingReorderSuccess,
  type FrontmatterBindingUnsubscribe,
  type FrontmatterDocProvider,
  type FrontmatterSnapshot,
  MAX_FM_REGION_BYTES,
  mergeThreeWay,
  normalizeBridge,
  type ParsedFmRegion,
  parseFencedFmRegion,
  parseFmRegion,
  readFmKeys,
  readFmMap,
  readFmRegionWithError,
  type Scheduler,
} from './bridge/index.ts';
export {
  type Burst,
  bucketIntoBursts,
  type HumanEdit,
  type SessionTransaction,
} from './burst-grouping.ts';
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
export {
  ACTIVITY_TTL_MS,
  evictStaleEntries,
  FLASH_DEBOUNCE_MS,
  FLASH_DURATION_MS,
  hasNewEntries,
} from './constants/activity.ts';
export {
  CC1_CONTRACT_VERSION,
  CONFIG_DOC_NAME_PROJECT,
  CONFIG_DOC_NAME_USER,
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
  AUDIO_EXTENSIONS,
  DEFAULT_ATTACHMENT_FOLDER_PATH,
  DEFAULT_DEDUP_MODE,
  DEFAULT_DEDUP_UI,
  DEFAULT_EMIT_FORMAT,
  type DedupMode,
  type DedupUIMode,
  type EmitFormat,
  EXECUTABLE_BLOCKLIST_EXTENSIONS,
  IMAGE_EXTENSIONS,
  INLINE_RENDERABLE_EXTENSIONS,
  type InlineAssetMediaKind,
  mediaKindForSidebarAssetExtension,
  SIDEBAR_IMAGE_ASSET_EXTENSIONS,
  SIDEBAR_RENDERABLE_ASSET_EXTENSIONS,
  SIDEBAR_VIDEO_ASSET_EXTENSIONS,
  VIDEO_EXTENSIONS,
  WIKI_EMBED_EXTENSIONS,
} from './constants/upload.ts';
export { CodeBlockFidelity } from './extensions/code-block-fidelity.ts';
export { EmphasisFidelity, StrongFidelity } from './extensions/emphasis-fidelity.ts';
export { EscapeMark } from './extensions/escape-mark.ts';
export {
  FRONTMATTER_RE,
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
export {
  WikiLinkEmbed,
  type WikiLinkEmbedAttrs,
} from './extensions/wiki-link-embed.ts';
export {
  type FrontmatterIssue,
  FrontmatterIssueSchema,
  type FrontmatterValidationError,
  FrontmatterValidationErrorSchema,
  fieldErrorsFromError,
  toFrontmatterIssue,
} from './frontmatter/errors.ts';
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
export {
  applyPatchToDocument,
  getDocumentKeys,
  type ParsedFrontmatter,
  parseFrontmatterYaml,
  serializeFrontmatterMap,
  withFences,
} from './frontmatter/yaml-codec.ts';
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
  isRelativeUrl,
  isSafeUrl,
  SAFE_URL_SCHEME_RE,
  SAFE_URL_SCHEMES,
} from './markdown/safe-url.ts';
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
export {
  builtInComponents,
  type ComponentRegistry,
  createRegistry,
  wildcardMeta,
} from './registry/index.ts';
export type {
  ClipboardHastContext,
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
export {
  createWorkspaceSearchCorpus,
  createWorkspaceSearchDocument,
  DEFAULT_WORKSPACE_SEARCH_LIMIT,
  MAX_WORKSPACE_SEARCH_LIMIT,
  searchWorkspaceCorpus,
  searchWorkspaceDocuments,
  type WorkspaceSearchCorpus,
  type WorkspaceSearchDocument,
  type WorkspaceSearchIntent,
  type WorkspaceSearchKind,
  type WorkspaceSearchOptions,
  type WorkspaceSearchResult,
  type WorkspaceSearchScope,
  workspaceSearchBasename,
  workspaceSearchPathSegments,
} from './search/workspace-search.ts';
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
export { applyByPrefixSuffix } from './utils/apply-by-prefix-suffix.ts';
export { ChunkedInsertError, chunkedYTextInsert } from './utils/chunked-insert.ts';
export { createCodeFenceTracker } from './utils/code-fence-tracker.ts';
export { extensionOf } from './utils/extension.ts';
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
  type AssetLinkTarget,
  buildRelativeMarkdownHref,
  type ClassifiedLinkTarget,
  classifyMarkdownHref,
  classifyWikiLinkTarget,
  type DocLinkTarget,
  type ExternalLinkTarget,
  extractAssetExtension,
  isExternalHref,
  resolveAssetProjectPath,
} from './utils/link-targets.ts';
export { type BasenameIndex, createBasenameIndex } from './utils/path-resolve.ts';
export { type ResolvedInternalHref, resolveInternalHref } from './utils/resolve-internal-href.ts';
export {
  disambiguateSlug,
  getHeadingSlug,
  type HeadingEntry,
  toWikiLinkSlug,
} from './utils/slug.ts';
