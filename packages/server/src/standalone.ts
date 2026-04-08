import type { LocalTransactionOrigin } from '@hocuspocus/server';
import { Hocuspocus } from '@hocuspocus/server';
import { sharedExtensions, stripFrontmatter } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment } from '@tiptap/y-tiptap';
import { AgentSessionManager } from './agent-sessions';
import { createApiExtension } from './api-extension';
import { type AsyncSubscription, startWatcher } from './file-watcher';
import { createPersistenceExtension, type PersistenceOptions } from './persistence';

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
}

export interface ServerInstance {
  hocuspocus: Hocuspocus;
  sessionManager: AgentSessionManager;
  destroy: () => Promise<void>;
}

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

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

  // Add API extension
  const apiExtension = createApiExtension({
    hocuspocus,
    sessionManager,
    contentDir,
  });
  hocuspocus.configure({ extensions: [apiExtension] });

  let watcher: AsyncSubscription | null = null;

  async function handleExternalChange(docName: string, content: string): Promise<void> {
    try {
      const document = hocuspocus.documents.get(docName);
      if (!document) return;
      const { frontmatter, body } = stripFrontmatter(content);
      const parsedJson = mdManager.parse(body);
      const pmNode = schema.nodeFromJSON(parsedJson);
      const xmlFragment = document.getXmlFragment('default');

      document.transact(
        () => {
          const meta = { mapping: new Map(), isOMark: new Map() };
          updateYFragment(document, xmlFragment, pmNode, meta);
          const metaMap = document.getMap('metadata');
          metaMap.set('frontmatter', frontmatter);

          const ytext = document.getText('source');
          const currentText = ytext.toString();
          if (currentText !== content) {
            ytext.delete(0, currentText.length);
            ytext.insert(0, content);
          }
        },
        {
          source: 'local',
          skipStoreHooks: true,
          context: { origin: 'file-watcher' },
        } satisfies LocalTransactionOrigin,
      );

      console.log(`[file-watcher] Applied external change: ${docName}`);
    } catch (err) {
      console.error(`[file-watcher] Failed to apply external change for ${docName}:`, err);
    }
  }

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
