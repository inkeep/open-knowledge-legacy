export type { Principal } from '@inkeep/open-knowledge-core';
export {
  GitDirAccessError,
  MalformedGitPointerError,
} from '@inkeep/open-knowledge-core/shadow-repo-layout';
export { AgentFocusBroadcaster } from './agent-focus.ts';
export { AGENT_ID_MAX_LEN, AGENT_ID_RE, toBroadcasterKey, validateAgentId } from './agent-id.ts';
export { AgentPresenceBroadcaster } from './agent-presence.ts';
export {
  AGENT_WRITE_ORIGIN,
  type AgentDirectConnection,
  AgentSessionCapacityError,
  type AgentSessionIdentity,
  AgentSessionManager,
  applyAgentMarkdownWrite,
  colorFromSeed,
  iconFromClientName,
  MAX_AGENT_SESSIONS,
} from './agent-sessions.ts';
export {
  type ApiExtensionOptions,
  createApiExtension,
  MANAGED_RENAME_ORIGIN,
  ROLLBACK_ORIGIN,
  safeSubdir,
} from './api-extension.ts';
export { isAllowedApiOrigin } from './api-origin.ts';
export {
  type AssetServeFilter,
  createAssetServeMiddleware,
  type SirvLikeMiddleware,
} from './asset-serve-middleware.ts';
export { seedBasenameIndex } from './asset-walk.ts';
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
export { type BootedServer, type BootServerOptions, bootServer } from './boot.ts';
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
  isConfigDoc,
  isSystemDoc,
  SYSTEM_DOC_NAME,
} from './cc1-broadcast.ts';
export { getLocalDir, resolveContentDir, resolveLockDir } from './config/paths.ts';
export { type Config, ConfigSchema } from './config/schema.ts';
export { MCP_SERVER_NAME } from './constants.ts';
export {
  type ContentFilter,
  type ContentFilterOptions,
  createContentFilter,
  createContentFilterAsync,
  type RebuildResult as ContentFilterRebuildResult,
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
  applyExternalChange,
  createExternalChangeHandler,
  FILE_WATCHER_ORIGIN,
} from './external-change.ts';
export {
  type AsyncSubscription,
  assertNeverDiskEvent,
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
  type AuthEvent,
  type AuthReposResponse,
  type AuthStatusResponse,
  type CloneCompleteEvent,
  type CloneErrorEvent,
  type CloneEvent,
  type CloneProgressEvent,
  type DeviceCompleteEvent,
  type DeviceErrorEvent,
  type DeviceVerificationEvent,
  type RawCloneEvent,
  type RepoEntry,
  type RunAuthQueryOptions,
  type RunCloneController,
  type RunCloneOptions,
  type RunDeviceFlowController,
  type RunDeviceFlowOptions,
  runAuthReposSubprocess,
  runAuthStatusSubprocess,
  runCloneSubprocess,
  runDeviceFlowSubprocess,
  validateCloneInputs,
} from './local-ops/index.ts';
export {
  createTestLogger,
  getLogger,
  installTestLoggers,
  type LoggerFactoryConfig,
  loggerFactory,
  PinoLogger,
  type PinoLoggerConfig,
} from './logger.ts';
export { isAllowedWorkspaceHostHeader, isLoopbackAddress } from './loopback.ts';
export {
  type RenameRewriteResult,
  rewriteMarkdownLinksForDocumentRename,
  rewriteWikiLinksForDocumentRename,
} from './managed-rename-rewrite.ts';
export type { AgentIdentity } from './mcp/agent-identity.ts';
export { getCurrentMcpLogger, McpLogger, runWithMcpLogger } from './mcp/logger.ts';
export { buildExecResult, type ExecStructuredResult } from './mcp/tools/exec.ts';
export { buildReadResult } from './mcp/tools/read-document.ts';
export {
  createMcpHttpHandler,
  type McpHttpHandler,
  type McpHttpHandlerOptions,
} from './mcp-http.ts';
export {
  type MountMcpAndApiHandle,
  type MountMcpAndApiOptions,
  mountMcpAndApi,
  parseKeepaliveConnectionId,
} from './mcp-mount.ts';
export {
  getMetrics,
  handleCollabSocketError,
  incrementCollabSocketFilteredError,
  incrementServerObserverFire,
  type ReconciliationMetrics,
  resetMetrics,
} from './metrics.ts';
export {
  MISSING_OK_CONFIG_MESSAGE,
  MissingOkConfigError,
  type MissingOkConfigKind,
} from './missing-ok-config-error.ts';
export {
  createPersistenceExtension,
  type PersistenceHandle,
  type PersistenceOptions,
  safeContentPath,
} from './persistence.ts';
export { loadPrincipal } from './principal.ts';
export { isProcessAlive, isValidLockPid } from './process-alive.ts';
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
export { resolvePackageVersion } from './resolve-package-version.ts';
export {
  type ApplyError,
  type ApplyResult,
  applySeed,
  buildStarterFolderFrontmatterYaml,
  type FileEntry,
  LOG_MD_TEMPLATE,
  planSeed,
  type ScaffoldPlan,
  type SeedOptions,
  SeedPrerequisiteError,
  SeedRootDirError,
  type SkipEntry,
  STARTER_FOLDER_FRONTMATTER_FILENAME,
  STARTER_FOLDERS,
  STARTER_TEMPLATES,
  type StarterFolder,
} from './seed/index.ts';
export { createServer, type ServerInstance, type ServerOptions } from './server-factory.ts';
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
  type BuildAndOpenSkillOptions,
  type BuildAndOpenSkillResult,
  type BuildAndOpenSkillStatus,
  buildAndOpenSkill,
  type InstallUserSkillOptions,
  type InstallUserSkillResult,
  installUserSkill,
  type SkillInstallLogger,
  type SpawnLike,
} from './skill-install.ts';
export {
  recordSkillInstallEvent,
  SKILL_INSTALL_EVENTS_FILE_REL,
  type SkillInstallEvent,
  type SkillInstallEventOutcome,
  type SkillInstallEventSurface,
} from './skill-install-events.ts';
export {
  readAllTargets,
  readServerPackageVersion,
  readSkillInstallStateSnapshot,
  readTargetRecordedAt,
  readTargetVersion,
  SKILL_STATE_TARGETS,
  type SkillInstallStateSnapshot,
  type SkillStateLogger,
  type SkillStateTarget,
  writeTargetVersion,
} from './skill-state.ts';
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
export { TagIndex, type TagIndexOptions, type TagSummaryEntry } from './tag-index.ts';
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
export { RUNTIME_VERSION, STATE_SCHEMA_VERSION } from './version-constants.ts';
