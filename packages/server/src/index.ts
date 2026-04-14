export {
  AGENT_WRITE_ORIGIN,
  type AgentDirectConnection,
  AgentSessionManager,
  DEFAULT_AGENT_ID,
  syncTextToFragment,
} from './agent-sessions.ts';
export { type ApiExtensionOptions, createApiExtension, safeSubdir } from './api-extension.ts';
export {
  type BacklinkEntry,
  BacklinkIndex,
  type ExtractedWikiLink,
  extractWikiLinksFromMarkdown,
  type HubEntry,
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
export { applyExternalChange, createExternalChangeHandler } from './external-change.ts';
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
  getMetrics,
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
