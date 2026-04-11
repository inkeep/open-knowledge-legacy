export {
  AGENT_WRITE_ORIGIN,
  type AgentDirectConnection,
  AgentSessionManager,
  DEFAULT_AGENT_ID,
  syncTextToFragment,
} from './agent-sessions.ts';
export { type ApiExtensionOptions, createApiExtension, safeSubdir } from './api-extension.ts';
export { createExternalChangeHandler } from './external-change.ts';
export {
  type AsyncSubscription,
  classifyEvents,
  contentHash,
  type DiskEvent,
  evictStaleTrackerEntries,
  isSelfWrite,
  lastKnownHash,
  pathToDocName,
  registerWrite,
  removeLastKnownHash,
  startWatcher,
  updateLastKnownHash,
  writeTracker,
} from './file-watcher.ts';
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
  commitUpstreamImport,
  commitWip,
  initShadowRepo,
  type SaveVersionResult,
  type ShadowHandle,
  type ShadowRef,
  saveVersion,
  shadowGit,
  type WriterIdentity,
} from './shadow-repo.ts';
export { createServer, type ServerInstance, type ServerOptions } from './standalone.ts';
