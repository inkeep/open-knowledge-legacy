/**
 * Hocuspocus extension that attaches server-authoritative observers per-document.
 *
 * Uses the Document reference from afterLoadDocument payload directly (Document
 * extends Y.Doc). This avoids openDirectConnection's connection-count increment
 * which would prevent documents from unloading during server shutdown.
 *
 * Skips __system__ docs via isSystemDoc().
 *
 * @see specs/2026-04-15-server-authoritative-observer-bridge/SPEC.md §7b
 */
import type { Extension } from '@hocuspocus/server';
import type { MarkdownManager } from '@inkeep/open-knowledge-core';
import type { Schema } from '@tiptap/pm/model';
import type * as Y from 'yjs';
import { isSystemDoc } from './cc1-broadcast.ts';
import { setupServerObservers } from './server-observers.ts';

export interface ServerObserverExtensionOptions {
  mdManager: MarkdownManager;
  schema: Schema;
}

/**
 * Create a Hocuspocus extension that attaches server observers per-document.
 *
 * - afterLoadDocument: attaches observers using the Document from the hook payload
 * - afterUnloadDocument: detaches observers (clears debounces)
 * - Skips __system__ doc (CC1 broadcast pseudo-doc)
 */
export function createServerObserverExtension(opts: ServerObserverExtensionOptions): Extension {
  const cleanups = new Map<string, () => void>();

  return {
    async afterLoadDocument({ documentName, document }) {
      if (isSystemDoc(documentName)) return;
      if (cleanups.has(documentName)) return;

      const doc = document as unknown as Y.Doc;
      const xmlFragment = doc.getXmlFragment('default');
      const ytext = doc.getText('source');

      const unsubscribe = setupServerObservers({
        doc,
        xmlFragment,
        ytext,
        mdManager: opts.mdManager,
        schema: opts.schema,
      });

      cleanups.set(documentName, unsubscribe);
    },

    async afterUnloadDocument({ documentName }) {
      const cleanup = cleanups.get(documentName);
      if (!cleanup) return;
      cleanup();
      cleanups.delete(documentName);
    },

    async onDestroy() {
      for (const cleanup of cleanups.values()) {
        cleanup();
      }
      cleanups.clear();
    },
  };
}
