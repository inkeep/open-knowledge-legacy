import type { Document, Extension } from '@hocuspocus/server';
import { prependFrontmatter } from '@inkeep/open-knowledge-core';
import { yXmlFragmentToProseMirrorRootNode } from '@tiptap/y-tiptap';
import type { BacklinkIndex } from './backlink-index.ts';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
import { mdManager, schema } from './md-manager.ts';

export const LIVE_DERIVED_INDEX_DEBOUNCE_MS = 100;

export interface LiveDerivedIndexOptions {
  backlinkIndex: BacklinkIndex;
  signalChannel?: (channel: 'files' | 'backlinks' | 'graph') => void;
  debounceMs?: number;
}

interface LocalOriginLike {
  source: 'local';
  context?: {
    origin?: string;
  };
}

function isLocalOriginLike(origin: unknown): origin is LocalOriginLike {
  if (typeof origin !== 'object' || origin === null) return false;
  return (origin as { source?: unknown }).source === 'local';
}

function serializeLiveDocument(document: Document): string {
  const xmlFragment = document.getXmlFragment('default');
  const body = mdManager.serialize(yXmlFragmentToProseMirrorRootNode(xmlFragment, schema).toJSON());
  const metaMap = document.getMap('metadata');
  const frontmatter = metaMap.get('frontmatter');
  return prependFrontmatter(typeof frontmatter === 'string' ? frontmatter : '', body);
}

export function createLiveDerivedIndexExtension(options: LiveDerivedIndexOptions): Extension {
  const { backlinkIndex, signalChannel, debounceMs = LIVE_DERIVED_INDEX_DEBOUNCE_MS } = options;
  const pendingByDoc = new Map<string, ReturnType<typeof setTimeout>>();

  function clearPending(docName: string): void {
    const pending = pendingByDoc.get(docName);
    if (pending) {
      clearTimeout(pending);
      pendingByDoc.delete(docName);
    }
  }

  function schedule(docName: string, document: Document): void {
    clearPending(docName);
    pendingByDoc.set(
      docName,
      setTimeout(() => {
        pendingByDoc.delete(docName);
        try {
          backlinkIndex.updateDocumentFromMarkdown(docName, serializeLiveDocument(document));
          signalChannel?.('backlinks');
          signalChannel?.('graph');
        } catch (err) {
          console.error(`[live-derived-index] Failed to update backlinks for ${docName}:`, err);
        }
      }, debounceMs),
    );
  }

  return {
    async onChange({ documentName, document, transactionOrigin }) {
      if (isSystemDoc(documentName) || isConfigDoc(documentName)) return;

      // Disk events already update the derived views directly in the watcher path.
      if (
        isLocalOriginLike(transactionOrigin) &&
        transactionOrigin.context?.origin === 'file-watcher'
      ) {
        return;
      }

      // Give the source/tree bridge a short trailing window to converge so we
      // derive links from settled live document state instead of the 2s store debounce.
      schedule(documentName, document);
    },

    async beforeUnloadDocument({ documentName }) {
      clearPending(documentName);
    },

    async onDestroy() {
      for (const timeout of pendingByDoc.values()) {
        clearTimeout(timeout);
      }
      pendingByDoc.clear();
    },
  };
}
