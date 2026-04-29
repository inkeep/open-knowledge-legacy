import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Document, Extension } from '@hocuspocus/server';
import { Hocuspocus, IncomingMessage, MessageType } from '@hocuspocus/server';
import {
  CONFIG_DOC_NAME_USER,
  CONFIG_DOC_NAME_WORKSPACE,
  CONFIG_DOC_NAMES,
  type Principal,
  prependFrontmatter,
} from '@inkeep/open-knowledge-core';
import { resolveConfigPath } from '@inkeep/open-knowledge-core/server';
import { resolveShadowDir } from '@inkeep/open-knowledge-core/shadow-repo-layout';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import simpleGit from 'simple-git';
import { AgentFocusBroadcaster } from './agent-focus.ts';
import { AgentPresenceBroadcaster } from './agent-presence.ts';
import { AgentSessionManager } from './agent-sessions.ts';
import { createApiExtension } from './api-extension.ts';
import { HocuspocusAuthRejection, parseHocuspocusAuthToken } from './auth-token-schema.ts';
import { BacklinkIndex } from './backlink-index.ts';
import { CC1Broadcaster, isConfigDoc, isSystemDoc, SYSTEM_DOC_NAME } from './cc1-broadcast.ts';
import {
  type ConfigFileWatcherUnsubscribe,
  startConfigFileWatcher,
} from './config-file-watcher.ts';
import { applyExternalConfigChange } from './config-persistence.ts';
import { type ContentFilter, createContentFilter } from './content-filter.ts';
import { getDocExtension } from './doc-extensions.ts';
import { applyExternalChange } from './external-change.ts';
import { contentHash, type DiskEvent, startWatcher, type WatcherHandle } from './file-watcher.ts';
import {
  type HeadWatcherHandle,
  readBranchFromHead,
  resolveGitDir,
  startHeadWatcher,
} from './head-watcher.ts';
import { createLiveDerivedIndexExtension } from './live-derived-index.ts';
import { getLogger } from './logger.ts';
import { recoverPendingManagedRename } from './managed-rename-journal.ts';
import { mdManager, schema } from './md-manager.ts';
import {
  incrementBatch,
  incrementBranchSwitch,
  incrementConflict,
  incrementPark,
  incrementReconcile,
  incrementRescueBuffer,
  incrementUpstreamImport,
} from './metrics.ts';
import {
  createPersistenceExtension,
  deleteReconciledBase,
  getActiveBranch,
  getReconciledBase,
  isBatchInProgress,
  type PersistenceOptions,
  safeContentPath,
  setBatchInProgress,
  setReconciledBase,
  switchReconciledBaseScope,
} from './persistence.ts';
import { loadPrincipal } from './principal.ts';
import { reconcile } from './reconciliation.ts';
import { acquireServerLock, releaseServerLock } from './server-lock.ts';
import { createServerObserverExtension } from './server-observer-extension.ts';
import type { PairedWriteOrigin } from './server-observers.ts';
import {
  commitUpstreamImport,
  destroyShadowRepo,
  initShadowRepo,
  type ParkableDoc,
  parkBranch,
  readParkedState,
  SERVICE_WRITER,
  type ShadowHandle,
  type ShadowRef,
  saveInMemoryCheckpoint,
  shadowGit,
} from './shadow-repo.ts';
import { assertCompatibleStateManifest } from './state-manifest.ts';
import { SyncEngine } from './sync-engine.ts';
import { initTelemetry, shutdownTelemetry } from './telemetry.ts';

export interface ServerOptions {
  port?: number;
  host?: string;
  contentDir: string;
  projectDir?: string;
  quiet?: boolean;
  debounce?: number;
  maxDebounce?: number;
  gitEnabled?: boolean;
  commitDebounceMs?: number;
  wipRef?: string;
  /**
   * When true, register test-only routes (`/api/test-reset`,
   * `/api/test-rescan-backlinks`). Defaults to `false` — these routes mutate
   * server state in ways unsafe for multi-client use and must never be
   * exposed in production. Enable only in tests.
   */
  enableTestRoutes?: boolean;
  /** Shadow repo handle — passed to persistence. */
  shadowRepo?: ShadowHandle;
  /** Content root relative to project dir. */
  contentRoot?: string;
  /** Glob patterns for files to include (default: ['**\/*.md']). */
  includePatterns?: string[];
  /** Glob patterns for files to explicitly exclude. */
  excludePatterns?: string[];
  /**
   * Maximum time (ms) `destroy()` waits for all pending stores to drain
   * before giving up and continuing with the rest of the shutdown sequence.
   * Defaults to 10_000. Tune lower in tests (e.g., 500) to reclaim CI wall-time.
   * Tune higher on slow-disk / NFS environments where a legitimate L1 flush
   * could take more than 10s.
   */
  destroyTimeoutMs?: number;
  /**
   * Optional. Called after every successful agent write (write_document /
   * edit_document) via the MCP API. The CLI uses this to open the browser
   * on the first agent edit per session; consumers that don't care can omit.
   */
  onAgentWrite?: () => void;
  /**
   * CLI argv prefix for /api/local-op/* relay endpoints.
   * Defaults to ['open-knowledge'] (CLI on PATH).
   * Pass [process.execPath, process.argv[1]] from start.ts to use the exact
   * runtime that launched this server — necessary in dev (bun + .ts entry).
   */
  localOpCliArgs?: string[];
  /**
   * Server kind written into the lock metadata. `interactive` (default) for
   * user-facing boots; `mcp-spawned` for the MCP detach-spawn path. Desktop
   * attach validation refuses to attach to non-interactive locks.
   */
  lockKind?: 'interactive' | 'mcp-spawned';
  /**
   * Pid of the spawning process, written into the lock metadata. For
   * `mcp-spawned`: the MCP server's pid. For `interactive`: the user-facing
   * host pid. Optional — desktop's parent-liveness gate skips when absent.
   */
  parentPid?: number;
  /**
   * Skip the durable state-manifest pre-flight gate
   * (`assertCompatibleStateManifest` from `state-manifest.ts`). Default `false`.
   *
   * Production paths (CLI `ok start`, Electron utility, Vite dev plugin) leave
   * this `false` so an incompatible cold start fails loud before the server
   * touches the shadow repo.
   *
   * The integration test harness passes `true` because each test allocates a
   * fresh tmpdir, so the manifest gate has nothing meaningful to assert and
   * the writes would just generate noise across thousands of tmpdirs.
   * (Resolves SPEC Q3 under D14.)
   */
  skipStateManifestCheck?: boolean;
  /**
   * Override `os.homedir()` for config-doc persistence + file watching
   * (US-006 / US-007). Tests scope user-global writes (`__user__/config.yml`)
   * to a tempdir; if unset, defaults to `os.homedir()` via `resolveConfigPath`.
   * Production callers leave this undefined.
   */
  configHomedirOverride?: string;
}

export interface ServerInstance {
  hocuspocus: Hocuspocus;
  sessionManager: AgentSessionManager;
  cc1Broadcaster: CC1Broadcaster;
  agentFocusBroadcaster: AgentFocusBroadcaster;
  agentPresenceBroadcaster: AgentPresenceBroadcaster;
  contentFilter: ContentFilter;
  /**
   * Random UUID generated once per `createServer()` call. Advertised to
   * clients via `GET /api/server-info` + the `__system__` CC1 `server-info`
   * channel. Clients cache the last-observed ID and include it in the
   * `expectedServerInstanceId` field of their auth token on every connect —
   * `onAuthenticate` rejects on mismatch, forcing a clean client recycle
   * before Yjs sync can merge stale-client state with a post-restart
   * server Y.Doc. Part of the CRDT server-restart recovery defense (see
   * `reports/crdt-server-restart-recovery/REPORT.md`).
   */
  readonly serverInstanceId: string;
  destroy: () => Promise<void>;
  /** Resolves when async init (shadow repo, file watcher subscription) is complete. */
  ready: Promise<void>;
  /**
   * Names of subsystems that failed to initialize during boot.
   * Read AFTER `await ready` for a stable list; reads before may return a partial result.
   * Empty array means all subsystems initialized successfully.
   * Possible values: `'shadow-repo'`, `'managed-rename-recovery'`, `'file-watcher'`,
   * `'head-watcher'`.
   */
  readonly degraded: readonly string[];
  /**
   * Directory holding the server lock (`<contentDir>/.open-knowledge`).
   * Callers update the lock's port field via `updateServerLockPort(lockDir, port)`
   * once the HTTP listener has bound to a kernel-assigned port.
   */
  readonly lockDir: string;
  /** Active sync engine instance, or null if dormant / no remote detected. */
  readonly syncEngine: SyncEngine | null;
}

/**
 * Transaction origin for park-snapshot reads (US-017, D39).
 *
 * Wrapping each serializeDoc() call inside doc.transact(..., PARK_SNAPSHOT_ORIGIN)
 * ensures Y.js serializes the snapshot capture atomically against concurrent
 * in-flight transactions. skipStoreHooks: false — the transact is read-only
 * (no Y.Doc mutations) so onStoreDocument will not fire. paired: true — if a
 * concurrent observer somehow fires, it short-circuits symmetrically (D39).
 */
const PARK_SNAPSHOT_ORIGIN = (() => {
  const ctx = Object.freeze({ origin: 'park-snapshot', paired: true as const });
  return Object.freeze({
    source: 'local' as const,
    skipStoreHooks: false,
    context: ctx,
  }) satisfies PairedWriteOrigin;
})();

export function createServer(options: ServerOptions): ServerInstance {
  const {
    contentDir,
    projectDir = contentDir,
    quiet = true,
    debounce = 2000,
    maxDebounce = 10000,
    gitEnabled = true,
    commitDebounceMs = 30_000,
    wipRef = 'refs/wip/main',
    configHomedirOverride,
    enableTestRoutes = false,
    shadowRepo,
    contentRoot,
    includePatterns = ['**/*.md', '**/*.mdx'],
    excludePatterns = [],
    destroyTimeoutMs = 10_000,
    localOpCliArgs,
    skipStateManifestCheck = false,
  } = options;

  const log = getLogger('server');

  // Initialize OpenTelemetry before any spans could be emitted. No-op when
  // OTEL_SDK_DISABLED != 'false' (default — zero overhead). Idempotent; safe
  // to call multiple times (bootServer also calls it, but dev-plugin path
  // bypasses bootServer and enters createServer directly).
  initTelemetry();

  // Generated once per process. Advertised to clients so they can detect
  // restart-across-reconnect before Yjs sync merges stale state. See the
  // field docstring on ServerInstance.serverInstanceId for the full
  // defense-in-depth flow.
  const serverInstanceId = randomUUID();

  // Acquire server lock BEFORE any side effects (shadow repo init, file watcher,
  // HTTP listen, etc.). Collides fast with another running server in the same
  // contentDir. Port may be 0 here — the CLI rewrites it post-listen via
  // `updateServerLockPort(lockDir, realPort)`. See V0-1 spec.
  const lockDir = resolve(contentDir, '.open-knowledge');
  acquireServerLock(lockDir, {
    port: options.port ?? 0,
    worktreeRoot: projectDir,
    kind: options.lockKind ?? 'interactive',
    ...(options.parentPid !== undefined && { parentPid: options.parentPid }),
    // Every server booted through `createServer` wires Hocuspocus + WS
    // upgrade in `boot.ts`. The capability flag lets future variants
    // (e.g. an HTTP-only relay) advertise differently.
    capabilities: ['http', 'ws'],
  });

  // Durable state-manifest gate (specs/2026-04-24-cross-install-version-handshake
  // §6.2 + D14). Runs AFTER lock acquisition so two cold-starting binaries
  // serialize through the lock first, then the loser fails fast on
  // ProcessLockCollisionError before reaching the manifest check. Runs BEFORE
  // any shadow-repo or persistence side effect so an incompatible cold start
  // refuses to boot before any durable mutation.
  //
  // Skipped when the caller passes `skipStateManifestCheck: true` — used by
  // the integration test harness, which allocates a fresh tmpdir per test
  // (no pre-existing state to gate on; writes would just generate noise
  // across thousands of throwaway content dirs). Resolves SPEC Q3 under D14.
  //
  // On throw, release the lock before propagating so other processes can
  // proceed (matches the cleanup path below for synchronous-init failures).
  if (!skipStateManifestCheck) {
    try {
      assertCompatibleStateManifest({
        lockDir,
        shadowRepoDir: resolveShadowDir(projectDir),
      });
    } catch (err) {
      releaseServerLock(lockDir);
      throw err;
    }
  }

  // Synchronous init — if any constructor throws, release the lock before propagating.
  let contentFilter: ReturnType<typeof createContentFilter>;
  let backlinkIndex: BacklinkIndex;
  let shadowRef: ShadowRef;
  let persistence: ReturnType<typeof createPersistenceExtension>;
  let hocuspocus: Hocuspocus;
  let sessionManager: AgentSessionManager;
  let cc1Broadcaster: CC1Broadcaster | null = null;
  let agentFocusBroadcaster: AgentFocusBroadcaster | null = null;
  let agentPresenceBroadcaster: AgentPresenceBroadcaster | null = null;
  // Mutable principal holder — populated by the async load in initAsync.
  let loadedPrincipal: Principal | null = null;
  const forceUnloadSet = new Set<Document>();
  let shutdownAllowsUnload = false;
  // Assigned synchronously in the init `try` immediately after `new Hocuspocus` (before the try
  // completes or awaits). Call sites (disk reconcile, API extension) only run after boot returns.
  let forceUnloadDocument!: (document: Document) => Promise<void>;

  function signalChannel(channel: 'files' | 'backlinks' | 'graph'): void {
    cc1Broadcaster?.signal(channel);
  }
  try {
    contentFilter = createContentFilter({
      projectDir,
      contentDir,
      includePatterns,
      excludePatterns,
    });
    backlinkIndex = new BacklinkIndex({ projectDir, contentDir, contentFilter });

    shadowRef = { current: shadowRepo };

    const persistenceOpts: PersistenceOptions = {
      contentDir,
      projectDir,
      gitEnabled,
      commitDebounceMs,
      wipRef,
      shadowRef,
      contentRoot,
      backlinkIndex,
      configHomedirOverride,
      getCurrentBranch: () => headWatcher?.getLastKnownBranch() ?? null,
      getPrincipal: () => loadedPrincipal,
      // Emit CC1 ch:'session-activity' after any agent writer commits so
      // Activity Panel clients get live invalidations (FR-P25, D-P11).
      // cc1Broadcaster is initialized after persistence but captured by
      // closure reference — the callback always sees the latest value.
      onAgentCommit: () => cc1Broadcaster?.signal('session-activity'),
      // Emit CC1 ch:'disk-ack' after each successful L1 write so clients
      // can advance their `lastDiskAckedSV` watermark. Same closure-deferred
      // pattern as `onAgentCommit` — broadcaster is initialized after
      // persistence but captured by reference.
      onDiskFlush: (docName, sv) => cc1Broadcaster?.emitDiskAck(docName, sv),
      // L3 validation rejection (D45 / FR-34). Fired when the config-doc
      // branch reverts Y.Text to LKG; the broadcast tells any open
      // Settings pane to surface the rejection toast + flash the
      // affected field. Same closure-deferred pattern.
      onConfigRejected: (docName, error) =>
        cc1Broadcaster?.emitConfigValidationRejected(docName, error),
    };

    persistence = createPersistenceExtension(persistenceOpts);

    hocuspocus = new Hocuspocus({
      quiet,
      debounce,
      maxDebounce,
      extensions: [persistence.extension],
    });

    // Hocuspocus unloads documents as soon as the last WebSocket disconnects.
    // That is unsafe with client-side y-indexeddb: a browser refresh leaves a
    // durable client copy of the same Yjs items, while the server rebuilds a
    // fresh Y.Doc from markdown. The next sync union-merges both item sets and
    // duplicates the document. Keep normal user docs resident for the server
    // lifetime; explicit lifecycle paths opt into unload via `forceUnloadDocument`.
    const defaultShouldUnloadDocument = hocuspocus.shouldUnloadDocument.bind(hocuspocus);
    hocuspocus.shouldUnloadDocument = (document) =>
      (shutdownAllowsUnload || forceUnloadSet.has(document)) &&
      defaultShouldUnloadDocument(document);

    forceUnloadDocument = async (document: Document): Promise<void> => {
      forceUnloadSet.add(document);
      try {
        await hocuspocus.unloadDocument(document);
      } finally {
        forceUnloadSet.delete(document);
      }
    };

    cc1Broadcaster = new CC1Broadcaster(hocuspocus);
    agentFocusBroadcaster = new AgentFocusBroadcaster(hocuspocus);
    agentPresenceBroadcaster = new AgentPresenceBroadcaster(hocuspocus);

    sessionManager = new AgentSessionManager(hocuspocus);
    const liveDerivedIndexExtension = createLiveDerivedIndexExtension({
      backlinkIndex,
      signalChannel,
    });
    hocuspocus.configuration.extensions.push(liveDerivedIndexExtension);

    // Browser tabs supply { principalId, tabSessionId } via the auth token.
    // onAuthenticate parses the JSON token and hoists identity into connection
    // context so persistence.resolveWriterFromOrigin sees source:'connection'
    // with ctx.principalId set. Missing or invalid tokens are silently ignored
    // (connection proceeds with SERVICE_WRITER fallback — non-browser clients
    // like test harness and MCP never send tokens).
    //
    // The token is unauthenticated — a rogue browser tab (or a page that
    // discovers the localhost port + passes the Origin allowlist) could claim
    // any principalId it invents. We pin ctx.principalId to loadedPrincipal.id
    // when the claim matches the server's loaded principal, and ignore the
    // claim otherwise (falling back to SERVICE_WRITER via resolveWriterFromOrigin).
    // This closes attribution-forgery on the single-user loopback deployment
    // without requiring a signed token. When multi-principal support is ever
    // added, upgrade this to a signed handshake from .open-knowledge/principal.json.
    const principalAuthExtension: Extension & { __kind: 'principal-auth' } = {
      // Named marker so test code can find THIS extension specifically rather
      // than "the first extension with an onAuthenticate hook" — future
      // additions of other onAuthenticate-carrying extensions won't silently
      // break identity-based extraction.
      __kind: 'principal-auth',
      async onAuthenticate(payload) {
        const tokenStr = payload.token;
        // Route the parse through the Zod schema so the v3→v4 forward-compat
        // story stays honest (fields we haven't seen yet survive via
        // `.loose()`). Legacy untokened clients and malformed tokens both
        // return `undefined` — we continue through the existing accept path.
        const parsed = parseHocuspocusAuthToken(tokenStr);

        // CRDT server-restart recovery: if the client claimed a specific
        // serverInstanceId and it doesn't match OUR instance ID, throw with
        // `reason: 'server-instance-mismatch'` so the client's
        // `authenticationFailed` handler can recycle all providers BEFORE
        // any Yjs sync runs (which would merge ghost items under the stale
        // clientID — the root cause this defends).
        // Empty-string claim is treated as absent (matches client-side
        // `buildAuthToken` behavior). Legacy clients without the field
        // are accepted unconditionally for backward compat.
        const claimed = parsed?.expectedServerInstanceId;
        if (typeof claimed === 'string' && claimed.length > 0 && claimed !== serverInstanceId) {
          throw new HocuspocusAuthRejection(
            'server-instance-mismatch',
            `server instance mismatch: client claimed ${claimed}, this server is ${serverInstanceId}`,
          );
        }

        // Cross-branch invalidation late-join backstop. Mirrors the
        // expectedServerInstanceId pattern. CC1 `branch-switched` is a
        // stateless broadcast with no replay; clients offline during the
        // emit, or fresh tabs restored from stale-branch IDB, would
        // otherwise re-sync against the new branch with branch-A items
        // still in IDB. Comparing the claimed branch against the live
        // `getActiveBranch()` and rejecting on mismatch routes those
        // clients through `handleBranchSwitched` BEFORE Yjs sync can
        // union-merge stale-branch state. Empty / absent claim = legacy
        // path (accepted unconditionally).
        const claimedBranch = parsed?.expectedBranch;
        const currentBranch = getActiveBranch();
        if (
          typeof claimedBranch === 'string' &&
          claimedBranch.length > 0 &&
          claimedBranch !== currentBranch
        ) {
          throw new HocuspocusAuthRejection(
            'branch-mismatch',
            `branch mismatch: client claimed ${claimedBranch}, server is on ${currentBranch}`,
          );
        }

        if (!parsed) return;
        const ctx = payload.context as Record<string, unknown>;
        if (typeof parsed.principalId === 'string') {
          // Pin to loaded principal when the claim matches; ignore on mismatch.
          if (loadedPrincipal && parsed.principalId === loadedPrincipal.id) {
            ctx.principalId = loadedPrincipal.id;
          } else if (loadedPrincipal) {
            // Claim doesn't match — log at warn and omit principalId so the
            // write falls through to SERVICE_WRITER. Preserves observability
            // without letting the claim through.
            console.warn(
              JSON.stringify({
                event: 'principal-token-mismatch',
                claimed: parsed.principalId,
                loaded: loadedPrincipal.id,
              }),
            );
          }
          // When loadedPrincipal is null (not yet loaded), accept the claim
          // — the async load is best-effort and browser writes need a writer
          // ID even in the brief pre-load window. Classified writer fallback
          // happens via resolveWriterFromOrigin when loaded fields aren't
          // available for display-name lookup.
          else {
            ctx.principalId = parsed.principalId;
          }
        }
        if (typeof parsed.tabSessionId === 'string') {
          ctx.tabSessionId = parsed.tabSessionId;
        }
        ctx.kind = 'human';
      },
    };
    hocuspocus.configuration.extensions.push(principalAuthExtension);

    // CC1 forgery guard. Hocuspocus's MessageReceiver relays every
    // BroadcastStateless message from any peer to all peers on the
    // same document with NO source filter (MessageReceiver.ts:88-94).
    // The `__system__` doc is server→client only by design — every CC1
    // channel (`server-info`, `branch-switched`, `disk-ack`, derived-
    // view) flows out via the server's own DirectConnection through
    // Document.broadcastStateless. A malicious client that opens a
    // `__system__` WebSocket and sends a BroadcastStateless can forge
    // any payload dispatchCC1Stateless accepts: a forged
    // `branch-switched` would wipe IDB on every other peer, and a
    // forged `disk-ack` would advance lastDiskAckedSV past unsynced
    // bytes (re-opening the T11 content-loss bug class).
    //
    // Reject inbound BroadcastStateless on `__system__` from every
    // client. The hook throws to abort message dispatch — Hocuspocus's
    // Connection.ts catches and closes the offending connection,
    // which is the right outcome (legitimate subscribers only receive,
    // never broadcast). The IncomingMessage decoder reads the
    // documentName prefix first, then the message type varUint.
    const systemDocBroadcastGuard: Extension & { __kind: 'system-doc-broadcast-guard' } = {
      __kind: 'system-doc-broadcast-guard',
      async beforeHandleMessage(payload) {
        if (payload.documentName !== SYSTEM_DOC_NAME) return;
        const message = new IncomingMessage(payload.update);
        message.readVarString();
        const type = message.readVarUint();
        if (type === MessageType.BroadcastStateless) {
          throw new Error(
            `inbound BroadcastStateless on ${SYSTEM_DOC_NAME} rejected — server-only channel`,
          );
        }
      },
    };
    hocuspocus.configuration.extensions.push(systemDocBroadcastGuard);

    const apiExtension = createApiExtension({
      hocuspocus,
      sessionManager,
      contentDir,
      serverInstanceId,
      getFileIndex: () => (watcher ? watcher.getFileIndex() : new Map()),
      getAliasMap: () => (watcher ? watcher.getAliasMap() : new Map()),
      enableTestRoutes,
      shadowRef,
      flushGitCommit: () => persistence.flushPendingGitCommit(),
      getCurrentBranch: () => headWatcher?.getLastKnownBranch() ?? null,
      // CC1 broadcaster is initialized after persistence but captured by
      // closure reference (same pattern as `onAgentCommit` + `onDiskFlush`
      // above). `getLatestDiskAckSVsAsBase64()` returns `{}` when the
      // server has flushed nothing yet, matching the schema's
      // empty-object case.
      getDiskAckSVs: () => cc1Broadcaster?.getLatestDiskAckSVsAsBase64() ?? {},
      contentRoot,
      backlinkIndex,
      signalChannel,
      agentFocusBroadcaster,
      agentPresenceBroadcaster,
      onAgentWrite: options.onAgentWrite,
      getSyncEngine: () => syncEngine,
      localOpCliArgs,
      projectDir,
      getPrincipal: () => loadedPrincipal,
      forceUnloadDocument,
    });
    hocuspocus.configuration.extensions.push(apiExtension);

    hocuspocus.configuration.extensions.push(
      createServerObserverExtension({
        mdManager,
        schema,
        shadowRef,
        contentRoot,
        getCurrentBranch: () => headWatcher?.getLastKnownBranch() ?? null,
      }),
    );
  } catch (err) {
    releaseServerLock(lockDir);
    throw err;
  }

  let systemDocConnection: Awaited<ReturnType<Hocuspocus['openDirectConnection']>> | null = null;
  // Config doc connections (US-005, D39/D40/FR-29). Held open for the
  // server's lifetime so the synthetic Y.Docs stay materialized — clients
  // (Settings pane + chrome controls) attach via WS. The bridge bypass
  // (D41) is in `server-observer-extension.ts`; persistence/file-watcher/
  // agent-sessions short-circuits in their respective modules.
  const configDocConnections = new Map<
    string,
    Awaited<ReturnType<Hocuspocus['openDirectConnection']>>
  >();

  // Config file-watcher unsubscribes (US-007 / FR-15 / D52). One per admitted
  // config doc whose on-disk file exists at startup (or appears via lazy
  // first-write per D51). Drained at server shutdown phase-1 alongside the
  // content-watcher cleanup; failures during startup degrade but never block.
  const configFileWatcherCleanups: Array<{
    docName: string;
    cleanup: ConfigFileWatcherUnsubscribe;
  }> = [];

  /** Resolve a safe rescue buffer path, returning null if traversal is detected. */
  function safeRescuePath(shadowGitDir: string, docName: string): string | null {
    const rescueBase = resolve(shadowGitDir, 'rescue');
    const filePath = resolve(rescueBase, `${docName}${getDocExtension(docName)}`);
    if (!filePath.startsWith(`${rescueBase}/`)) return null;
    return filePath;
  }

  /** Serialize current Y.Doc to markdown for reconciliation. */
  function serializeDoc(docName: string): string | null {
    const document = hocuspocus.documents.get(docName);
    if (!document) return null;
    const xmlFragment = document.getXmlFragment('default');
    const json = yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON();
    const body = mdManager.serialize(json);
    const metaMap = document.getMap('metadata');
    const fm = metaMap.get('frontmatter');
    const frontmatter = typeof fm === 'string' ? fm : '';
    return prependFrontmatter(frontmatter, body);
  }

  /** Apply markdown content to Y.Doc — delegates to the shared throwing helper. */
  const applyToDoc = (docName: string, content: string): void =>
    applyExternalChange(hocuspocus, docName, content);

  /** Helper to extract docName from any DiskEvent variant. */
  function diskEventDocName(event: DiskEvent): string {
    return event.kind === 'rename' ? event.newDocName : event.docName;
  }

  /** Reconciliation-aware dispatch for all DiskEvent types. */
  async function handleDiskEvent(event: DiskEvent): Promise<void> {
    try {
      switch (event.kind) {
        case 'create': {
          log.info({ docName: event.docName }, `[reconcile] create: ${event.docName}`);
          backlinkIndex.updateDocumentFromMarkdown(event.docName, event.content);
          void backlinkIndex.saveToDisk().catch((err) => {
            console.warn(`[backlinks] Failed to persist create for ${event.docName}:`, err);
          });
          signalChannel('files');
          signalChannel('backlinks');
          signalChannel('graph');
          break;
        }

        case 'update': {
          const { docName, content: theirs } = event;
          const document = hocuspocus.documents.get(docName);
          if (!document) {
            backlinkIndex.updateDocumentFromMarkdown(docName, theirs);
            void backlinkIndex.saveToDisk().catch((err) => {
              console.warn(`[backlinks] Failed to persist closed-doc update for ${docName}:`, err);
            });
            signalChannel('backlinks');
            signalChannel('graph');
            return;
          }

          const base = getReconciledBase(docName) ?? '';
          const ours = serializeDoc(docName) ?? base;

          const result = reconcile({ docName, base, ours, theirs });

          // Structured log with content hashes
          const baseH = contentHash(base).slice(0, 6);
          const oursH = contentHash(ours).slice(0, 6);
          const theirsH = contentHash(theirs).slice(0, 6);
          log.info(
            { docName, base: baseH, ours: oursH, theirs: theirsH, result: result.kind },
            `[reconcile] ${docName} base=${baseH} ours=${oursH} theirs=${theirsH} result=${result.kind}`,
          );

          switch (result.kind) {
            case 'noop':
              backlinkIndex.updateDocumentFromMarkdown(docName, theirs);
              void backlinkIndex.saveToDisk().catch((err) => {
                console.warn(`[backlinks] Failed to persist noop update for ${docName}:`, err);
              });
              signalChannel('backlinks');
              signalChannel('graph');
              break;

            case 'clean':
              try {
                applyToDoc(docName, result.newContent);
                setReconciledBase(docName, result.newContent);
                incrementReconcile();
                backlinkIndex.updateDocumentFromMarkdown(docName, theirs);
                void backlinkIndex.saveToDisk().catch((err) => {
                  console.warn(`[backlinks] Failed to persist clean update for ${docName}:`, err);
                });
                signalChannel('backlinks');
                signalChannel('graph');
              } catch (e) {
                log.error(
                  { err: e, docName },
                  `[reconcile] failed to apply clean content to Y.Doc for ${docName}`,
                );
                // Disk is source of truth — keep base in sync even if Y.Doc update failed
                setReconciledBase(docName, theirs);
              }
              break;

            case 'merged':
              try {
                applyToDoc(docName, result.newContent);
                setReconciledBase(docName, result.newContent);
                incrementReconcile();
                backlinkIndex.updateDocumentFromMarkdown(docName, theirs);
                void backlinkIndex.saveToDisk().catch((err) => {
                  console.warn(`[backlinks] Failed to persist merged update for ${docName}:`, err);
                });
                signalChannel('backlinks');
                signalChannel('graph');
              } catch (e) {
                log.error(
                  { err: e, docName },
                  `[reconcile] failed to apply merged content to Y.Doc for ${docName}`,
                );
                // Disk is source of truth — keep base in sync even if Y.Doc update failed
                setReconciledBase(docName, theirs);
              }
              break;

            case 'conflicts': {
              try {
                applyToDoc(docName, result.newContent);
                setReconciledBase(docName, result.newContent);
                incrementReconcile();
                incrementConflict();
                backlinkIndex.updateDocumentFromMarkdown(docName, theirs);
                void backlinkIndex.saveToDisk().catch((err) => {
                  console.warn(
                    `[backlinks] Failed to persist conflict update for ${docName}:`,
                    err,
                  );
                });
                signalChannel('backlinks');
                signalChannel('graph');
              } catch (e) {
                log.error(
                  { err: e, docName },
                  `[reconcile] failed to apply conflict content to Y.Doc for ${docName}`,
                );
                // Disk is source of truth — keep base in sync even if Y.Doc update failed
                setReconciledBase(docName, theirs);
              }
              break;
            }

            case 'refused': {
              incrementConflict();
              const lifecycleMap = document.getMap('lifecycle');
              lifecycleMap.set('status', 'conflict');
              lifecycleMap.set('reason', result.reason);
              break;
            }
          }
          break;
        }

        case 'delete': {
          const { docName } = event;
          const document = hocuspocus.documents.get(docName);
          if (!document) {
            backlinkIndex.deleteDocument(docName);
            void backlinkIndex.saveToDisk().catch((err) => {
              console.warn(`[backlinks] Failed to persist closed-doc delete for ${docName}:`, err);
            });
            signalChannel('files');
            signalChannel('backlinks');
            signalChannel('graph');
            return;
          }

          const base = getReconciledBase(docName) ?? '';
          const ours = serializeDoc(docName) ?? '';
          const isDirty = ours !== base;

          if (isDirty && shadowRef.current) {
            // Silent rescue checkpoint (SPEC §6 R7e) — preserve in-memory
            // content on a timeline ref so TimelinePanel renders it as an
            // 'external-change-rescue' row. Fire-and-forget; failures warn
            // but don't block the delete lifecycle.
            const shadowForCheckpoint = shadowRef.current;
            const branch = headWatcher?.getLastKnownBranch() ?? 'main';
            queueMicrotask(() => {
              saveInMemoryCheckpoint(shadowForCheckpoint, contentRoot ?? '', {
                kind: 'external-change-rescue',
                docName,
                contents: ours,
                label: `External change recovered @ ${new Date().toISOString()}`,
                branch,
                // Delete event has no incoming disk content — sentinel empty
                // string so the TimelineRescueEntry shape round-trips.
                metadata: { incomingDiskSha: '' },
              })
                .then(() => {
                  incrementRescueBuffer();
                  log.info({ docName }, `[reconcile] rescue checkpoint saved (delete): ${docName}`);
                })
                .catch((e: unknown) => {
                  log.error(
                    { docName, err: e },
                    `[reconcile] rescue checkpoint write failed: ${docName}`,
                  );
                });
            });
          }

          const lifecycleMap = document.getMap('lifecycle');
          lifecycleMap.set('status', 'deleted-upstream');

          deleteReconciledBase(docName);
          backlinkIndex.deleteDocument(docName);
          void backlinkIndex.saveToDisk().catch((err) => {
            console.warn(`[backlinks] Failed to persist delete for ${docName}:`, err);
          });
          log.info({ docName, isDirty }, `[reconcile] delete: ${docName} (dirty=${isDirty})`);

          // Unload document to prevent re-creation on next persistence cycle
          hocuspocus.closeConnections(docName);
          await forceUnloadDocument(document);
          signalChannel('files');
          signalChannel('backlinks');
          signalChannel('graph');
          break;
        }

        case 'rename': {
          const { oldDocName, newDocName, content } = event;
          const document = hocuspocus.documents.get(oldDocName);

          deleteReconciledBase(oldDocName);
          setReconciledBase(newDocName, content);
          backlinkIndex.renameDocument(oldDocName, newDocName, content);
          void backlinkIndex.saveToDisk().catch((err) => {
            console.warn(
              `[backlinks] Failed to persist rename for ${oldDocName} -> ${newDocName}:`,
              err,
            );
          });

          if (document) {
            const lifecycleMap = document.getMap('lifecycle');
            lifecycleMap.set('status', 'renamed');
            lifecycleMap.set('newPath', newDocName);
          }

          log.info({ oldDocName, newDocName }, `[reconcile] rename: ${oldDocName} → ${newDocName}`);
          signalChannel('files');
          signalChannel('backlinks');
          signalChannel('graph');
          break;
        }

        case 'conflict': {
          const { docName } = event;
          const document = hocuspocus.documents.get(docName);
          if (!document) return;

          const lifecycleMap = document.getMap('lifecycle');
          lifecycleMap.set('status', 'conflict');
          lifecycleMap.set('reason', 'conflict-markers');
          log.info({ docName }, `[reconcile] conflict markers detected: ${docName}`);
          break;
        }
      }
    } catch (err) {
      log.error(
        { err, kind: event.kind, docName: diskEventDocName(event) },
        `[reconcile] failed to handle ${event.kind} for ${diskEventDocName(event)}`,
      );
    }
  }

  // ─── Batch buffering ──────────────────────────────────────────────────────

  const eventBuffer: DiskEvent[] = [];

  /** Wrapper that buffers events during batch operations. */
  async function onDiskEvent(event: DiskEvent): Promise<void> {
    if (isBatchInProgress()) {
      eventBuffer.push(event);
      return;
    }
    await handleDiskEvent(event);
  }

  /** Drain buffered events after batch ends. */
  async function drainEventBuffer(): Promise<void> {
    const events = eventBuffer.splice(0, eventBuffer.length);
    for (const event of events) {
      await handleDiskEvent(event);
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  let watcher: WatcherHandle | null = null;
  let headWatcher: HeadWatcherHandle | null = null;
  let syncEngine: SyncEngine | null = null;
  let inflightDestroy: Promise<void> | null = null;

  // This helper mirrors @hocuspocus/server's internal Server.destroy() pattern
  // at node_modules/@hocuspocus/server/src/Server.ts:200-225. We can't use
  // Server.destroy() directly because Server owns its own httpServer + crossws
  // WebSocket adapter + signal binding, which conflicts with OK's shared HTTP
  // server + /api/* routing + static asset serving + /collab-only upgrade.
  async function flushAllStoresAndWait(timeoutMs: number): Promise<void> {
    if (hocuspocus.documents.size === 0) return;

    let resolved = false;
    const allDone = new Promise<void>((resolve) => {
      hocuspocus.configuration.extensions.push({
        async afterUnloadDocument({ instance }) {
          if (!resolved && instance.getDocumentsCount() === 0) {
            resolved = true;
            resolve();
          }
        },
      });
    });

    // Capture doc names before the race so the timeout error can name the
    // documents that failed to unload — actionable context for operators
    // debugging hung flushes, and the target list for the rescue-buffer
    // dump below (D15 / OQ-P2-02).
    const pendingDocNames = Array.from(hocuspocus.documents.keys());

    hocuspocus.closeConnections();
    hocuspocus.flushPendingStores();

    // shouldUnloadDocument blocks normal unloads while the server is running.
    // `destroy()` assigns `shutdownAllowsUnload = true` synchronously at the
    // start of its async IIFE (before the first await), so by the time this
    // flush runs, explicit `unloadDocument` calls below are allowed through.
    // Clients that disconnected before destroy() was called (e.g. pool.dispose()
    // in test teardown) will have left documents resident with 0 connections.
    // closeConnections() above is a no-op for those docs, so no unload events
    // fire. Explicitly unload any document with no remaining connections so
    // afterUnloadDocument can resolve.
    for (const doc of hocuspocus.documents.values()) {
      if (doc.getConnectionsCount() === 0) {
        void hocuspocus.unloadDocument(doc).catch((err: unknown) => {
          console.warn(
            JSON.stringify({
              event: 'ok-shutdown-unload-document-failed',
              docName: doc.name,
              reason: err instanceof Error ? err.message : String(err),
            }),
          );
        });
      }
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((_, reject) => {
      timeoutId = setTimeout(() => {
        resolved = true;
        const stillLoaded = Array.from(hocuspocus.documents.keys());

        // D15 / OQ-P2-02: rescue-buffer dump on flush timeout. onStoreDocument
        // did not complete for these docs, so the in-memory Y.Doc state IS the
        // data-of-record — dump it to the shadow rescue/ tree so the user can
        // recover via the existing /api/rescue endpoints. Best-effort per doc
        // so one serialization failure doesn't block the others. Unconditional
        // (no isDirty check like the reconcile-path rescue uses) because the
        // hang semantic means diff-vs-reconciled-base is not the right gate.
        const rescued: string[] = [];
        const rescueFailed: string[] = [];
        if (shadowRef.current) {
          for (const docName of stillLoaded) {
            if (isSystemDoc(docName) || isConfigDoc(docName)) continue;
            try {
              const ours = serializeDoc(docName);
              if (ours === null) {
                // Doc was removed from hocuspocus.documents between the
                // stillLoaded snapshot and this loop — race during teardown.
                log.warn(
                  { docName },
                  `[rescue] skipping ${docName} — document dropped from map mid-rescue`,
                );
                rescueFailed.push(docName);
                continue;
              }
              const rescuePath = safeRescuePath(shadowRef.current.gitDir, docName);
              if (!rescuePath) {
                // Path-traversal guard fired — docName tried to escape the
                // rescue/ directory. Log at warn level since this is
                // security-relevant, not just a write failure.
                log.warn(
                  { docName, gitDir: shadowRef.current.gitDir },
                  `[rescue] path-traversal guard rejected docName: ${docName}`,
                );
                rescueFailed.push(docName);
                continue;
              }
              mkdirSync(dirname(rescuePath), { recursive: true });
              writeFileSync(rescuePath, ours, 'utf-8');
              incrementRescueBuffer();
              rescued.push(docName);
              log.info({ docName }, `[rescue] rescue buffer saved on flush timeout: ${docName}`);
            } catch (e) {
              rescueFailed.push(docName);
              log.error(
                { err: e, docName },
                `[rescue] failed to write rescue buffer for ${docName}`,
              );
            }
          }
        } else {
          // Shadow repo unavailable (initAsync failed earlier) — nothing to
          // write into. Warn rather than fail silently so operators seeing a
          // `lost [...]` array in the timeout error can distinguish "no shadow
          // repo" from per-doc write failures.
          log.warn(
            { stillLoadedCount: stillLoaded.length },
            `[rescue] shadow repo unavailable at flush timeout — ${stillLoaded.length} doc(s) will be lost: [${stillLoaded.join(', ')}]`,
          );
          rescueFailed.push(...stillLoaded);
        }

        const rescueSummary =
          rescued.length > 0 || rescueFailed.length > 0
            ? ` — rescued [${rescued.join(', ')}]${
                rescueFailed.length > 0 ? `, lost [${rescueFailed.join(', ')}]` : ''
              }`
            : '';

        reject(
          new Error(
            `flushAllStoresAndWait timeout after ${timeoutMs}ms — ${stillLoaded.length}/${pendingDocNames.length} docs did not unload: [${stillLoaded.join(', ')}]${rescueSummary}`,
          ),
        );
      }, timeoutMs);
    });

    try {
      await Promise.race([allDone, timeout]);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }

  async function destroy(): Promise<void> {
    if (inflightDestroy) return inflightDestroy;

    inflightDestroy = (async () => {
      const t0 = Date.now();
      const phaseErrors: Array<{ phase: string; error: string }> = [];
      shutdownAllowsUnload = true;

      // Wait for async init to complete before cleanup — prevents leaked watcher
      // subscriptions if destroy() is called during startup (e.g., Ctrl+C).
      // Bounded to 5s so destroy() doesn't hang indefinitely if init is stuck
      // (e.g., waiting for a shadow repo git lock held by another process).
      let initTimeoutId: ReturnType<typeof setTimeout> | undefined;
      const initSettled = await Promise.race([
        ready.then(
          () => 'completed' as const,
          (err) => {
            log.debug({ err }, '[server] init incomplete during shutdown');
            return 'failed' as const;
          },
        ),
        new Promise<'timeout'>((r) => {
          initTimeoutId = setTimeout(() => r('timeout'), 5_000);
        }),
      ]);
      if (initTimeoutId !== undefined) clearTimeout(initTimeoutId);
      if (initSettled === 'timeout') {
        log.warn({}, '[server] init did not complete within 5s during shutdown');
      }

      // Capture after ready so the count reflects documents loaded during init
      const documentCount = hocuspocus.documents.size;

      try {
        try {
          // Phase 1: stop watchers FIRST so L1 disk writes don't trigger reconcile loops
          try {
            if (headWatcher) {
              await headWatcher.unsubscribe();
              headWatcher = null;
            }
            if (watcher) {
              await watcher.unsubscribe();
              watcher = null;
            }
            // Config file watchers (US-007). Independent of the content
            // watcher; teardown failures per-doc shouldn't block other
            // cleanups, so each cleanup is wrapped in its own try/catch.
            for (const { docName, cleanup } of configFileWatcherCleanups) {
              try {
                await cleanup();
              } catch (cfgErr) {
                log.warn(
                  { err: cfgErr, docName },
                  `[server] failed to stop config-file-watcher for ${docName}`,
                );
              }
            }
            configFileWatcherCleanups.length = 0;
          } catch (err) {
            phaseErrors.push({
              phase: 'watcher-unsubscribe',
              error: err instanceof Error ? err.message : String(err),
            });
            log.error({ err }, '[server] shutdown phase-1 watcher unsubscribe failed');
          }

          // Phase 1b: tear down CC1 broadcaster + agent-presence broadcaster +
          // __system__ direct connection. Both broadcasters share the same
          // `__system__` Y.Doc — their destroys clear internal state (debounce
          // timers for CC1; idempotent no-op for agent-presence today but
          // symmetric with the broadcaster-lifecycle contract). The single
          // systemDocConnection handle is torn down last.
          try {
            cc1Broadcaster?.destroy();
            agentPresenceBroadcaster?.destroy();
            if (systemDocConnection) {
              await systemDocConnection.disconnect();
              systemDocConnection = null;
            }
            for (const [docName, connection] of configDocConnections) {
              try {
                await connection.disconnect();
              } catch (configErr) {
                log.warn(
                  { err: configErr, docName },
                  `[server] failed to disconnect ${docName} during shutdown`,
                );
              }
            }
            configDocConnections.clear();
          } catch (err) {
            phaseErrors.push({
              phase: 'cc1-teardown',
              error: err instanceof Error ? err.message : String(err),
            });
            log.error({ err }, '[server] shutdown phase-1b CC1 teardown failed');
          }

          // Phase 2: drain agent sessions (intrinsic per-session try/catch at agent-sessions.ts:168-177)
          try {
            await sessionManager.closeAll();
          } catch (err) {
            phaseErrors.push({
              phase: 'agent-session-drain',
              error: err instanceof Error ? err.message : String(err),
            });
            log.error({ err }, '[server] shutdown phase-2 agent session drain failed');
          }

          // Phase 3: drain L1 (Y.Doc → markdown → disk) via afterUnloadDocument hook
          try {
            await flushAllStoresAndWait(destroyTimeoutMs);
          } catch (err) {
            phaseErrors.push({
              phase: 'flush-all-stores',
              error: err instanceof Error ? err.message : String(err),
            });
            log.error({ err }, '[server] shutdown phase-3 flush failed');
          }

          // Phase 4: drain L2 (disk → git) — only meaningful AFTER L1 has run
          // Bounded to destroyTimeoutMs so a stuck git process doesn't hang shutdown.
          let l2TimeoutId: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              (async () => {
                await persistence.flushPendingGitCommit();
                await persistence.waitForPendingCommits();
              })(),
              new Promise<void>((_, reject) => {
                l2TimeoutId = setTimeout(
                  () => reject(new Error('L2 git flush timeout')),
                  destroyTimeoutMs,
                );
              }),
            ]);
          } catch (err) {
            phaseErrors.push({
              phase: 'git-commit-flush',
              error: err instanceof Error ? err.message : String(err),
            });
            log.error({ err }, '[server] shutdown phase-4 git commit flush failed');
          } finally {
            if (l2TimeoutId !== undefined) clearTimeout(l2TimeoutId);
          }
          // Phase 4.5: stop sync engine (CC8 Phase 5 per spec)
          try {
            if (syncEngine) {
              await syncEngine.destroy();
              syncEngine = null;
            }
          } catch (err) {
            phaseErrors.push({
              phase: 'sync-engine-stop',
              error: err instanceof Error ? err.message : String(err),
            });
            log.error({ err }, '[server] shutdown sync-engine-stop failed');
          }
        } finally {
          // Phase 5: shadow repo release — ALWAYS runs
          if (shadowRef.current) {
            // Persist current HEAD before releasing shadow lock (FR11)
            try {
              const projectGit = simpleGit({ baseDir: projectDir, timeout: { block: 5_000 } });
              const currentHead = (await projectGit.revparse('HEAD')).trim();
              if (currentHead) {
                writeFileSync(
                  resolve(shadowRef.current.gitDir, 'last-known-head'),
                  currentHead,
                  'utf-8',
                );
              }
            } catch {
              // Fresh repo with no commits, or git not available — skip silently
            }

            try {
              destroyShadowRepo(shadowRef.current);
            } catch (err) {
              phaseErrors.push({
                phase: 'shadow-repo-release',
                error: err instanceof Error ? err.message : String(err),
              });
              log.error({ err }, '[server] shutdown phase-5 destroyShadowRepo failed');
            }
          }

          const durationMs = Date.now() - t0;
          if (phaseErrors.length === 0) {
            log.info(
              { documentCount, durationMs },
              `[server] shutdown flushed ${documentCount} documents in ${durationMs}ms`,
            );
          } else {
            log.warn(
              { documentCount, durationMs, phaseErrors },
              `[server] shutdown flushed ${documentCount} documents in ${durationMs}ms with ${phaseErrors.length} phase error(s)`,
            );
          }
        }
      } finally {
        // Phase 6 (CC8): release server lock LAST — after shadow repo release,
        // agent session drain, L1/L2 flush. If an earlier phase threw, we still
        // release so a subsequent start can succeed. Invariant: no other process
        // may acquire this lock until every prior phase has run.
        try {
          releaseServerLock(lockDir);
        } catch (err) {
          phaseErrors.push({
            phase: 'server-lock-release',
            error: err instanceof Error ? err.message : String(err),
          });
          log.error({ err }, '[server] shutdown phase-6 releaseServerLock failed');
        }
        // Telemetry shutdown runs outside the lock-release try so a telemetry
        // flush failure can never prevent the lock from being released. 5s
        // internal timeout prevents a hung OTLP exporter from stalling teardown.
        try {
          await shutdownTelemetry();
        } catch (err) {
          phaseErrors.push({
            phase: 'telemetry-shutdown',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();

    return inflightDestroy;
  }

  /** Subsystems that failed during initAsync — populated on catch, read after `await ready`. */
  const degraded: string[] = [];

  /** Async initialization: shadow repo, file watcher, HEAD watcher. */
  async function initAsync(): Promise<void> {
    // Load (or create) the principal record — non-blocking best-effort.
    try {
      loadedPrincipal = await loadPrincipal(contentDir);
      log.info({ principalId: loadedPrincipal.id }, '[server] principal loaded');
    } catch (e) {
      log.warn(
        { err: e },
        '[server] principal load failed — browser writes will use SERVICE_WRITER',
      );
    }

    // Auto-initialize shadow repo if not provided
    if (!shadowRef.current) {
      try {
        shadowRef.current = await initShadowRepo(projectDir);
        log.info(
          { gitDir: shadowRef.current.gitDir },
          `[server] history repo initialized at ${shadowRef.current.gitDir}`,
        );
      } catch (e) {
        log.error({ err: e }, '[server] history repo init failed');
        degraded.push('shadow-repo');
      }
    }

    // Verify history repo integrity — reinit only on structural corruption, not transient errors
    if (shadowRef.current) {
      try {
        const sg = shadowGit(shadowRef.current);
        await sg.raw('rev-parse', '--git-dir');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('not a git repository') || msg.includes('invalid object')) {
          log.warn({}, '[server] history repo appears corrupted — reinitializing');
          try {
            shadowRef.current = await initShadowRepo(projectDir);
          } catch (e2) {
            log.error({ err: e2 }, '[server] history repo reinit failed');
            shadowRef.current = undefined;
            if (!degraded.includes('shadow-repo')) degraded.push('shadow-repo');
          }
        } else {
          log.error({ err: e }, '[server] history repo check failed (transient?)');
        }
      }
    }

    // HEAD-drift check (FR11): detect git operations that occurred while offline
    // Compare stored last-known-head against current HEAD SHA and import if diverged
    if (shadowRef.current) {
      try {
        const lastKnownHeadPath = resolve(shadowRef.current.gitDir, 'last-known-head');

        // Read last persisted HEAD SHA
        let lastKnownHead: string | null = null;
        try {
          lastKnownHead = readFileSync(lastKnownHeadPath, 'utf-8').trim() || null;
        } catch {
          // File doesn't exist yet — first run
        }

        // Read current HEAD SHA from project repo
        let currentHead: string | null = null;
        try {
          const projectGit = simpleGit({ baseDir: projectDir, timeout: { block: 10_000 } });
          currentHead = (await projectGit.revparse('HEAD')).trim() || null;
        } catch {
          // Fresh repo with no commits — skip drift check
        }

        if (currentHead !== null) {
          if (currentHead !== lastKnownHead) {
            // Drift detected (includes null → SHA for fresh clone T0 case)
            let branch = 'main';
            try {
              const projectGit = simpleGit({ baseDir: projectDir, timeout: { block: 10_000 } });
              const b = (await projectGit.raw('rev-parse', '--abbrev-ref', 'HEAD')).trim();
              if (b && b !== 'HEAD') branch = b;
            } catch {
              // Detached HEAD or error — fallback to 'main'
            }

            log.info(
              { lastKnownHead, currentHead, branch },
              `[head-drift] lastKnownHead=${lastKnownHead ?? 'null'}, currentHead=${currentHead}, action=import`,
            );

            try {
              await commitUpstreamImport(
                shadowRef.current,
                contentRoot ?? '',
                lastKnownHead,
                currentHead,
                branch,
              );
              incrementUpstreamImport();
            } catch (e) {
              log.warn({ err: e }, '[head-drift] commitUpstreamImport failed — continuing');
            }
          } else {
            log.info(
              { currentHead },
              `[head-drift] lastKnownHead=${lastKnownHead ?? 'null'}, currentHead=${currentHead}, action=noop`,
            );
          }

          // Always persist current HEAD so next startup has an accurate baseline
          try {
            writeFileSync(lastKnownHeadPath, currentHead, 'utf-8');
          } catch (e) {
            log.warn({ err: e }, '[head-drift] failed to write last-known-head');
          }
        }
      } catch (e) {
        log.warn({ err: e }, '[head-drift] check failed — continuing');
      }
    }

    try {
      const recovery = recoverPendingManagedRename(contentDir);
      if (recovery.recovered && recovery.journal) {
        log.warn(
          {
            sourceDocName: recovery.journal.sourceDocName,
            destinationDocName: recovery.journal.destinationDocName,
            restoredDocNames: recovery.restoredDocNames,
          },
          `[managed-rename] recovered pending rename ${recovery.journal.sourceDocName} -> ${recovery.journal.destinationDocName}`,
        );
      }
    } catch (err) {
      log.error({ err }, '[server] managed rename recovery failed');
      degraded.push('managed-rename-recovery');
    }

    // Pre-materialize __system__ Y.Doc so CC1 broadcaster has a target before
    // any browser connects. Must happen before the file watcher starts.
    try {
      systemDocConnection = await hocuspocus.openDirectConnection(SYSTEM_DOC_NAME);
      // Emit the server-info signal once __system__ is materialized so any
      // late-arriving client that subscribes to the channel gets the current
      // serverInstanceId (part of the CRDT restart-recovery defense — clients
      // cache this + claim it in their auth token on every connect).
      cc1Broadcaster?.emitServerInfo(serverInstanceId, getActiveBranch());
    } catch (err) {
      log.error(
        { err },
        '[server] failed to open __system__ direct connection — CC1 push disabled',
      );
      degraded.push('cc1-push');
    }

    // Pre-materialize config Y.Docs (D39/D40/FR-29 — US-005). One per
    // well-known synthetic name. Connections held for the server's
    // lifetime so the docs stay loaded — Settings pane + chrome controls
    // attach via the existing collab WS. Bridge bypass + agent-session
    // short-circuits live in the respective modules; admission failure
    // is non-fatal (Settings pane's first connect would re-materialize).
    for (const configDocName of CONFIG_DOC_NAMES) {
      try {
        const connection = await hocuspocus.openDirectConnection(configDocName);
        configDocConnections.set(configDocName, connection);
      } catch (err) {
        log.error(
          { err, docName: configDocName },
          `[server] failed to open ${configDocName} direct connection — config bind degraded`,
        );
        degraded.push(`config-doc:${configDocName}`);
      }
    }

    // Config file watchers (US-007 / FR-15 / D52). Watch both well-known
    // config paths so external edits (CLI, IDE hand-edit, MCP from another
    // instance) propagate to any open Settings pane via Y.Text observer.
    // Workspace path is created lazily via `applyConfigPatch`; user-global
    // path is created lazily via `writeConfigPatch` (D51). chokidar's
    // single-file watch handles non-existent paths by waiting for them, so
    // we start watchers unconditionally — `add` events fire when a lazy
    // first-write lands.
    //
    // Self-write feedback loop is broken by `applyExternalConfigChange`'s
    // LKG-equality short-circuit: when persistence writes content `C` to
    // disk, it sets `lkgCache[doc] = C`; the watcher reads `C` back, sees
    // it match LKG, and returns 'no-op' before mutating Y.Text.
    const configPathByDoc = new Map<string, string>([
      [CONFIG_DOC_NAME_WORKSPACE, resolveConfigPath('workspace', projectDir)],
      [CONFIG_DOC_NAME_USER, resolveConfigPath('user', projectDir, configHomedirOverride)],
    ]);
    for (const configDocName of CONFIG_DOC_NAMES) {
      const absPath = configPathByDoc.get(configDocName);
      if (!absPath) continue;
      try {
        const cleanup = await startConfigFileWatcher(absPath, (content) => {
          const document = hocuspocus.documents.get(configDocName);
          applyExternalConfigChange(
            document ?? null,
            configDocName,
            content,
            persistence.configPersistenceCtx,
          );
        });
        configFileWatcherCleanups.push({ docName: configDocName, cleanup });
      } catch (err) {
        log.warn(
          { err, docName: configDocName, path: absPath },
          `[config-file-watcher] failed to start for ${configDocName}`,
        );
        degraded.push(`config-file-watcher:${configDocName}`);
      }
    }

    // Reset branch-scoped state to match THIS project's current HEAD before
    // anything reads/writes it. `persistence.activeBranch` and the
    // `BacklinkIndex.activeBranch` are mutable state; in single-process test
    // runners (bun test) these leak across test files, so a prior test that
    // triggered `switchReconciledBaseScope` leaves state at the wrong branch
    // for the next server's reads. Detecting the actual HEAD here and
    // normalizing both scopes in lock-step closes the leak.
    const gitDirForInit = resolveGitDir(projectDir);
    const startupBranch = gitDirForInit ? (readBranchFromHead(gitDirForInit) ?? 'main') : 'main';
    switchReconciledBaseScope(startupBranch);
    backlinkIndex.switchBranch(startupBranch);

    // Start file watcher (with content filter for gitignore + config exclude)
    try {
      watcher = await startWatcher(contentDir, onDiskEvent, contentFilter);
      backlinkIndex.rebuildFromDisk(getActiveBranch());
      void backlinkIndex.saveToDisk().catch((err) => {
        console.warn(`[backlinks] Failed to persist startup cache for ${getActiveBranch()}:`, err);
      });
    } catch (err) {
      log.error({ err }, '[server] disk bridge watcher failed to start');
      degraded.push('file-watcher');
    }

    // Start HEAD watcher (only if project .git/ exists)
    try {
      headWatcher = await startHeadWatcher(
        projectDir,
        // onBatchBegin — park current branch context before git modifies working tree
        async ({ trigger }) => {
          log.info({ trigger }, `[batch] begin trigger=${trigger}`);
          incrementBatch();
          hocuspocus.flushPendingStores();
          await persistence.flushPendingGitCommit();

          // Gate new L1/L2 writes BEFORE the park loop so any onStoreDocument
          // calls that fire during the async parkBranch are blocked (D39).
          setBatchInProgress(true);

          // Park current branch's Y.Doc state to shadow refs
          if (shadowRef.current) {
            const currentBranch = getActiveBranch();
            // Read new branch from HEAD (already updated by git at onBatchBegin time)
            // so the park subject can carry both ends of the switch (D39, D53).
            const gitDir = resolveGitDir(projectDir);
            const newBranch = gitDir
              ? (readBranchFromHead(gitDir) ?? currentBranch)
              : currentBranch;
            const docs: ParkableDoc[] = [];
            for (const [docName, document] of hocuspocus.documents) {
              if (isSystemDoc(docName) || isConfigDoc(docName)) continue;
              // Wrap in doc.transact so Y.js serializes snapshot capture atomically
              // against concurrent in-flight agent transacts (PARK_SNAPSHOT_ORIGIN, D39).
              let markdown: string | null = null;
              document.transact(() => {
                markdown = serializeDoc(docName);
              }, PARK_SNAPSHOT_ORIGIN);
              if (markdown === null) continue;
              const diskSnapshot = getReconciledBase(docName) ?? markdown;
              docs.push({ docName, markdown, diskSnapshot });
            }
            if (docs.length > 0) {
              try {
                const sha = await parkBranch(
                  shadowRef.current,
                  currentBranch,
                  SERVICE_WRITER.id,
                  docs,
                  newBranch,
                );
                if (sha) {
                  incrementPark();
                  log.info(
                    { count: docs.length, branch: currentBranch, sha: sha.slice(0, 8) },
                    `[history] parked ${docs.length} docs on ${currentBranch} → ${sha.slice(0, 8)}`,
                  );
                }
              } catch (e) {
                log.error({ err: e }, '[shadow] park failed');
              }
            }
          }
        },
        // onBatchEnd — dispatch on BatchKind
        async (info) => {
          const bufferedCount = eventBuffer.length;
          const newBranch = info.newBranch ?? 'main';

          setBatchInProgress(false);

          log.info(
            {
              kind: info.batchKind,
              headMoved: info.headMoved,
              docs: bufferedCount,
              timeout: !!info.timeout,
            },
            `[batch] end kind=${info.batchKind} headMoved=${info.headMoved} docs=${bufferedCount}${info.timeout ? ' timeout' : ''}`,
          );

          if (info.batchKind === 'within-branch') {
            // Pull, merge, rebase on same branch — reconcile buffered events
            await drainEventBuffer();
          } else {
            // Cross-branch or detached-head — discard buffered events (wrong branch state)
            incrementBranchSwitch();
            eventBuffer.splice(0, eventBuffer.length);

            // Switch reconciledBase scope to target branch
            switchReconciledBaseScope(newBranch);
            backlinkIndex.switchBranch(newBranch);

            // Reset all open Y.Docs from the target branch's disk content
            for (const [docName, document] of hocuspocus.documents) {
              if (isSystemDoc(docName) || isConfigDoc(docName)) continue;
              try {
                const filePath = safeContentPath(docName, contentDir);
                if (!existsSync(filePath)) {
                  // File doesn't exist on target branch — tombstone
                  const base = getReconciledBase(docName) ?? '';
                  const ours = serializeDoc(docName) ?? '';
                  const isDirty = ours !== base;

                  if (isDirty && shadowRef.current) {
                    // Silent rescue checkpoint on branch-switch tombstone
                    // (SPEC §6 R7e). Same pattern as reconcile-delete above.
                    const shadowForCheckpoint = shadowRef.current;
                    queueMicrotask(() => {
                      saveInMemoryCheckpoint(shadowForCheckpoint, contentRoot ?? '', {
                        kind: 'external-change-rescue',
                        docName,
                        contents: ours,
                        label: `External change recovered @ ${new Date().toISOString()}`,
                        branch: newBranch,
                        metadata: { incomingDiskSha: '' },
                      })
                        .then(() => {
                          incrementRescueBuffer();
                          log.info(
                            { docName },
                            `[reconcile] rescue checkpoint saved on branch switch: ${docName}`,
                          );
                        })
                        .catch((e: unknown) => {
                          log.error(
                            { docName, err: e },
                            `[reconcile] rescue checkpoint write failed: ${docName}`,
                          );
                        });
                    });
                  }

                  const lifecycleMap = document.getMap('lifecycle');
                  lifecycleMap.set('status', 'deleted-upstream');
                  log.info(
                    { docName, branch: newBranch },
                    `[branch-switch] tombstone: ${docName} (not on ${newBranch})`,
                  );
                  continue;
                }

                // Reset Y.Doc from disk
                const diskContent = readFileSync(filePath, 'utf-8');
                applyToDoc(docName, diskContent);
                setReconciledBase(docName, diskContent);
                log.info({ docName }, `[branch-switch] reset: ${docName}`);
              } catch (e) {
                log.error({ err: e, docName }, `[branch-switch] failed to reset ${docName}`);
              }
            }

            log.info(
              { branch: newBranch, docCount: hocuspocus.documents.size },
              `[branch-switch] loaded branch ${newBranch} (${hocuspocus.documents.size} docs)`,
            );
            backlinkIndex.rebuildFromDisk(newBranch);
            void backlinkIndex.saveToDisk(newBranch).catch((err) => {
              console.warn(`[backlinks] Failed to persist branch cache for ${newBranch}:`, err);
            });

            // Restore parked WIP if exists (three-way merge parked state against current disk)
            if (shadowRef.current && info.batchKind === 'cross-branch') {
              let restoredCount = 0;
              for (const [docName] of hocuspocus.documents) {
                if (isSystemDoc(docName) || isConfigDoc(docName)) continue;
                try {
                  const parked = await readParkedState(
                    shadowRef.current,
                    newBranch,
                    SERVICE_WRITER.id,
                    docName,
                  );
                  if (!parked) continue;
                  // Skip if no in-flight edits were parked
                  if (parked.markdown === parked.diskSnapshot) continue;

                  const currentDisk = getReconciledBase(docName);
                  if (!currentDisk) continue;

                  const outcome = reconcile({
                    docName,
                    base: parked.diskSnapshot,
                    ours: parked.markdown,
                    theirs: currentDisk,
                  });

                  switch (outcome.kind) {
                    case 'merged':
                    case 'clean':
                      applyToDoc(docName, outcome.newContent);
                      setReconciledBase(docName, outcome.newContent);
                      restoredCount++;
                      break;
                    case 'conflicts': {
                      applyToDoc(docName, outcome.newContent);
                      setReconciledBase(docName, outcome.newContent);
                      incrementConflict();
                      restoredCount++;
                      break;
                    }
                    case 'noop':
                    case 'refused':
                      break;
                  }
                } catch (e) {
                  log.error(
                    { err: e, docName },
                    `[branch-switch] restore WIP failed for ${docName}`,
                  );
                }
              }
              if (restoredCount > 0) {
                log.info(
                  { count: restoredCount, branch: newBranch },
                  `[branch-switch] restored ${restoredCount} parked docs on ${newBranch}`,
                );
              }
            }

            // Clean up detached HEAD context if switching FROM detached TO named branch
            if (info.oldBranch?.startsWith('detached-') && shadowRef.current) {
              try {
                const sg = shadowGit(shadowRef.current);
                // List refs under the detached context
                const refs = (
                  await sg.raw('for-each-ref', `refs/wip/${info.oldBranch}/`, '--format=%(refname)')
                ).trim();
                if (refs) {
                  for (const ref of refs.split('\n')) {
                    if (ref) {
                      await sg.raw('update-ref', '-d', ref);
                    }
                  }
                  log.info(
                    { context: info.oldBranch },
                    `[branch-switch] cleaned up detached context ${info.oldBranch}`,
                  );
                }
              } catch (e) {
                log.error({ err: e }, '[branch-switch] detached cleanup failed');
              }
            }

            // Notify connected clients that the branch scope changed so they can
            // invalidate their IDB persistence caches. Emit AFTER all server-side
            // state transitions (Y.Doc reset, backlink rebuild, WIP restore,
            // detached-ref cleanup) so a client's recycle-triggered reconnect
            // synchronizes against the new branch's fully-settled state.
            cc1Broadcaster?.emitBranchSwitched(newBranch);
          }

          // Record upstream import if HEAD moved AND content files were affected.
          // A user's own `git commit` moves HEAD but doesn't change the working tree
          // (files were already written by the user/editor). Only `git pull`, `git merge`,
          // `git rebase`, or `git checkout` produce buffered file-watcher events, so
          // bufferedCount > 0 distinguishes "upstream brought changes" from "user committed".
          if (info.headMoved && info.newHead && shadowRef.current && bufferedCount > 0) {
            const contentRootForShadow = contentRoot ?? '.';
            try {
              const sha = await commitUpstreamImport(
                shadowRef.current,
                contentRootForShadow,
                info.oldHead,
                info.newHead,
                newBranch,
              );
              incrementUpstreamImport();
              log.info(
                {
                  oldHead: info.oldHead?.slice(0, 8) ?? 'null',
                  newHead: info.newHead.slice(0, 8),
                  sha: sha.slice(0, 8),
                },
                `[history] upstream-import from ${info.oldHead?.slice(0, 8) ?? 'null'}..${info.newHead.slice(0, 8)} → ${sha.slice(0, 8)}`,
              );
            } catch (e) {
              log.error({ err: e }, '[shadow] upstream-import failed');
            }
          }
        },
      );
    } catch (err) {
      log.error({ err }, '[server] HEAD watcher failed to start');
      degraded.push('head-watcher');
    }

    // Start SyncEngine (FR21): remote detection + auto-sync
    // Build credentialArgs from localOpCliArgs so git fetch/push can authenticate.
    // Pattern: ['-c', 'credential.helper=!<cli-binary> auth git-credential']
    const cliCmd = localOpCliArgs?.[0] ?? 'open-knowledge';
    const cliPrefix =
      localOpCliArgs && localOpCliArgs.length > 1 ? localOpCliArgs.join(' ') : cliCmd;
    const syncCredentialArgs = ['-c', `credential.helper=!${cliPrefix} auth git-credential`];
    try {
      syncEngine = new SyncEngine({
        projectDir,
        contentDir,
        contentFilter,
        contentRoot,
        credentialArgs: syncCredentialArgs,
        cc1Broadcaster,
        setBatchInProgress,
        onStateChange: (state) => {
          log.info({ state }, `[sync] state → ${state}`);
        },
      });
      await syncEngine.start();
    } catch (err) {
      log.warn({ err }, '[server] SyncEngine failed to start — sync disabled');
      syncEngine = null;
    }
  }

  const ready = initAsync();

  return {
    hocuspocus,
    sessionManager,
    cc1Broadcaster,
    agentFocusBroadcaster,
    agentPresenceBroadcaster,
    contentFilter,
    serverInstanceId,
    destroy,
    ready,
    degraded,
    lockDir,
    get syncEngine() {
      return syncEngine;
    },
  };
}
