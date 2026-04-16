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
  ROLLBACK_ORIGIN,
  safeSubdir,
} from './api-extension.ts';
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
  CC1_CONTRACT_VERSION,
  CC1Broadcaster,
  type CC1Signal,
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
export {
  acquireProcessLock,
  type LockName,
  lockFilePath,
  ProcessLockCollisionError,
  type ProcessLockHandle,
  type ProcessLockMetadata,
  readProcessLock,
  releaseProcessLock,
  updateProcessLockPort,
} from './process-lock.ts';
export {
  type BlockConflict,
  CONFLICT_MARKER_RE,
  containsConflictMarkers,
  type ReconcileInput,
  type ReconcileOutcome,
  reconcile,
  splitMarkdownBlocks,
} from './reconciliation.ts';
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
export { OBSERVER_SYNC_ORIGIN } from './server-observers.ts';
export {
  commitUpstreamImport,
  commitWip,
  initShadowRepo,
  type SafetyCheckpointParams,
  type SaveVersionResult,
  type ShadowHandle,
  type ShadowRef,
  safetyCheckpoint,
  saveVersion,
  shadowGit,
  type WriterIdentity,
} from './shadow-repo.ts';
export { createServer, type ServerInstance, type ServerOptions } from './standalone.ts';
export {
  acquireUiLock,
  readUiLock,
  releaseUiLock,
  UiLockCollisionError,
  type UiLockMetadata,
  updateUiLockPort,
} from './ui-lock.ts';
