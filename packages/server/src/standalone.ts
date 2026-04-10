import { Hocuspocus } from '@hocuspocus/server';
import { AgentSessionManager } from './agent-sessions.ts';
import { createApiExtension } from './api-extension.ts';
import { createExternalChangeHandler } from './external-change.ts';
import { type AsyncSubscription, startWatcher } from './file-watcher.ts';
import { createPersistenceExtension, type PersistenceOptions } from './persistence.ts';

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
   * When true, register test-only routes (currently `/api/test-reset`).
   * Defaults to `false` — these routes allow any client to destroy document
   * state and must never be exposed in production. Enable only in tests.
   */
  enableTestRoutes?: boolean;
}

export interface ServerInstance {
  hocuspocus: Hocuspocus;
  sessionManager: AgentSessionManager;
  destroy: () => Promise<void>;
}

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
    enableTestRoutes = false,
  } = options;

  const persistenceOpts: PersistenceOptions = {
    contentDir,
    projectDir,
    gitEnabled,
    commitDebounceMs,
    wipRef,
  };

  const hocuspocus = new Hocuspocus({
    quiet,
    debounce,
    maxDebounce,
    extensions: [createPersistenceExtension(persistenceOpts)],
  });

  const sessionManager = new AgentSessionManager(hocuspocus);

  // Add API extension — push directly onto the extensions array rather than
  // calling hocuspocus.configure({ extensions: [...] }), which uses spread
  // and would REPLACE the existing persistence extension.
  const apiExtension = createApiExtension({
    hocuspocus,
    sessionManager,
    contentDir,
    enableTestRoutes,
  });
  hocuspocus.configuration.extensions.push(apiExtension);

  let watcher: AsyncSubscription | null = null;
  const handleExternalChange = createExternalChangeHandler(hocuspocus);

  async function destroy(): Promise<void> {
    if (watcher) {
      await watcher.unsubscribe();
      watcher = null;
    }
    await sessionManager.closeAll();
    hocuspocus.flushPendingStores();
    hocuspocus.closeConnections();
  }

  // Start file watcher asynchronously
  startWatcher(contentDir, handleExternalChange)
    .then((sub) => {
      watcher = sub;
    })
    .catch((err) => {
      console.error('[server] Disk bridge watcher failed to start:', err);
    });

  return { hocuspocus, sessionManager, destroy };
}
