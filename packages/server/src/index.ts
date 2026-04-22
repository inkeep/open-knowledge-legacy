export type { Principal } from '@inkeep/open-knowledge-core';
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
  type BacklinkEntry,
  BacklinkIndex,
  type ExtractedWikiLink,
  extractWikiLinksFromMarkdown,
  type HubEntry,
  isOrphanMode,
  ORPHAN_MODES,
  type OrphanMode,
} from './backlink-index.ts';
export { type BootedServer, type BootServerOptions, bootServer } from './boot.ts';
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
  readProcessLock,
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
export { createServer, type ServerInstance, type ServerOptions } from './standalone.ts';
export {
  acquireUiLock,
  readUiLock,
  releaseUiLock,
  UiLockCollisionError,
  type UiLockMetadata,
  updateUiLockPort,
} from './ui-lock.ts';
