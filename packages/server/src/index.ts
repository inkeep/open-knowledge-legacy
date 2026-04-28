export type { Principal } from '@inkeep/open-knowledge-core';
export { AgentFocusBroadcaster } from './agent-focus.ts';
export { AGENT_ID_RE, toBroadcasterKey, validateAgentId } from './agent-id.ts';
export { AgentPresenceBroadcaster } from './agent-presence.ts';
export {
  AGENT_WRITE_ORIGIN,
  type AgentDirectConnection,
  type AgentSessionIdentity,
  AgentSessionManager,
  applyAgentMarkdownWrite,
  colorFromSeed,
  iconFromClientName,
} from './agent-sessions.ts';
export {
  type ApiExtensionOptions,
  createApiExtension,
  MANAGED_RENAME_ORIGIN,
  ROLLBACK_ORIGIN,
  safeSubdir,
} from './api-extension.ts';
export {
  HOCUSPOCUS_AUTH_REJECTION_REASONS,
  HocuspocusAuthRejection,
  type HocuspocusAuthRejectionReason,
  type HocuspocusAuthToken,
  HocuspocusAuthTokenSchema,
  isHocuspocusAuthRejectionReason,
  parseHocuspocusAuthToken,
} from './auth-token-schema.ts';
export {
  type BacklinkEntry,
  BacklinkIndex,
  type ExtractedWikiLink,
  extractWikiLinksFromMarkdown,
  type HubEntry,
  isOrphanMode,
  ORPHAN_MODES,
  type OrphanMode,
} from './backlink-index.ts';
export {
  type BootedServer,
  type BootServerOptions,
  bootServer,
  parseKeepaliveConnectionId,
} from './boot.ts';
export {
  type BuildSkillZipOptions,
  type BuildSkillZipResult,
  buildSkillZip,
  resolveBundledSkillDir,
  validateSkillZip,
} from './build-skill-zip.ts';
export {
  CC1_CONTRACT_VERSION,
  CC1Broadcaster,
  isSystemDoc,
  SYSTEM_DOC_NAME,
} from './cc1-broadcast.ts';
export {
  type ContentFilter,
  type ContentFilterOptions,
  createContentFilter,
} from './content-filter.ts';
export {
  clearContributors,
  contributorCount,
  formatContributors,
  recordContributor,
} from './contributor-tracker.ts';
export {
  type DetectClaudeDesktopOptions,
  detectClaudeDesktopPresence,
} from './detect-claude-desktop.ts';
export {
  type DocExtension,
  getDocExtension,
  isSupportedDocFile,
  SUPPORTED_DOC_EXTENSIONS,
  stripDocExtension,
} from './doc-extensions.ts';
export {
  applyExternalChange,
  createExternalChangeHandler,
  FILE_WATCHER_ORIGIN,
} from './external-change.ts';
export {
  type AsyncSubscription,
  classifyEvents,
  contentHash,
  type DiskEvent,
  evictStaleTrackerEntries,
  type FileIndexEntry,
  isSelfWrite,
  lastKnownHash,
  pathToDocName,
  registerWrite,
  removeLastKnownHash,
  startWatcher,
  updateLastKnownHash,
  type WatcherHandle,
  writeTracker,
} from './file-watcher.ts';
export { readBranchFromHead } from './head-watcher.ts';
export {
  type AttachIdleShutdownOptions,
  attachIdleShutdown,
  type IdleShutdownHandle,
} from './idle-shutdown.ts';
export {
  createLiveDerivedIndexExtension,
  LIVE_DERIVED_INDEX_DEBOUNCE_MS,
  type LiveDerivedIndexOptions,
} from './live-derived-index.ts';
export {
  createTestLogger,
  getLogger,
  installTestLoggers,
  type LoggerFactoryConfig,
  loggerFactory,
  PinoLogger,
  type PinoLoggerConfig,
} from './logger.ts';
export {
  type RenameRewriteResult,
  rewriteMarkdownLinksForDocumentRename,
  rewriteWikiLinksForDocumentRename,
} from './managed-rename-rewrite.ts';
export {
  getMetrics,
  handleCollabSocketError,
  incrementCollabSocketFilteredError,
  incrementServerObserverFire,
  type ReconciliationMetrics,
  resetMetrics,
} from './metrics.ts';
export {
  createPersistenceExtension,
  type PersistenceHandle,
  type PersistenceOptions,
  safeContentPath,
} from './persistence.ts';
export { loadPrincipal } from './principal.ts';
export { isProcessAlive } from './process-alive.ts';
export {
  acquireProcessLock,
  type LockName,
  lockFilePath,
  ProcessLockCollisionError,
  type ProcessLockHandle,
  type ProcessLockMetadata,
  type ReadProcessLockResult,
  readProcessLock,
  readProcessLockDetailed,
  releaseProcessLock,
  updateProcessLockPort,
} from './process-lock.ts';
export {
  type EnsureProjectGitResult,
  ensureProjectGit,
  ProjectGitInitError,
} from './project-git.ts';
export {
  type BlockConflict,
  CONFLICT_MARKER_RE,
  containsConflictMarkers,
  type ReconcileInput,
  type ReconcileOutcome,
  reconcile,
  splitMarkdownBlocks,
} from './reconciliation.ts';
// Seed scaffolder (`ok seed`) — shared module for the CLI Commander wrapper
// and the Electron IPC handler. Deterministic plan/apply split; writes the
// Karpathy three-layer starter + optional log.md + config.yml folders: entries.
// See specs/2026-04-23-ok-seed-scaffold/SPEC.md.
export {
  type ApplyError,
  type ApplyResult,
  applySeed,
  type ConfigEdit,
  type FileEntry,
  type FolderFrontmatter,
  type FolderRule,
  LOG_MD_TEMPLATE,
  planSeed,
  type ScaffoldPlan,
  SEED_CONFIG_FILENAME,
  type SeedOptions,
  SeedPrerequisiteError,
  SeedRootDirError,
  type SkipEntry,
  STARTER_FOLDERS,
  type StarterFolder,
  starterFolderRule,
} from './seed/index.ts';
export {
  acquireServerLock,
  readServerLock,
  releaseServerLock,
  ServerLockCollisionError,
  type ServerLockMetadata,
  updateServerLockPort,
} from './server-lock.ts';
export {
  createServerObserverExtension,
  type ServerObserverExtensionOptions,
} from './server-observer-extension.ts';
export {
  isPairedWriteOrigin,
  OBSERVER_SYNC_ORIGIN,
  type PairedWriteOrigin,
} from './server-observers.ts';
export {
  buildWipTree,
  type CheckpointGcResult,
  type CheckpointRetentionPolicy,
  commitUpstreamImport,
  commitWip,
  commitWipFromTree,
  DEFAULT_CHECKPOINT_RETENTION,
  FILE_SYSTEM_WRITER,
  GIT_UPSTREAM_WRITER,
  gcCheckpointRefs,
  type InMemoryCheckpointParams,
  initShadowRepo,
  listRescueCheckpoints,
  type SafetyCheckpointParams,
  type SaveVersionResult,
  SERVICE_WRITER,
  type ShadowHandle,
  type ShadowRef,
  safetyCheckpoint,
  saveInMemoryCheckpoint,
  saveVersion,
  shadowGit,
  type TimelineRescueEntry,
  type WriterIdentity,
} from './shadow-repo.ts';
export {
  type InstallUserSkillOptions,
  type InstallUserSkillResult,
  installUserSkill,
  type SkillInstallLogger,
  type SpawnLike,
} from './skill-install.ts';
export { createServer, type ServerInstance, type ServerOptions } from './standalone.ts';
export {
  assertCompatibleStateManifest,
  detectProjectShape,
  type ProjectShape,
  type ReadStateManifestResult,
  readStateManifest,
  STATE_MANIFEST_FILENAME,
  StateManifestError,
  type StateManifestRecord,
  type StateManifestWriter,
  writeStateManifest,
} from './state-manifest.ts';
export {
  getMeter,
  getTracer,
  initTelemetry,
  setActiveSpanAttributes,
  shutdownTelemetry,
  withSpan,
  withSpanSync,
} from './telemetry.ts';
export {
  acquireUiLock,
  readUiLock,
  releaseUiLock,
  UiLockCollisionError,
  type UiLockMetadata,
  updateUiLockPort,
} from './ui-lock.ts';
export { PROTOCOL_VERSION, RUNTIME_VERSION, STATE_SCHEMA_VERSION } from './version-constants.ts';
