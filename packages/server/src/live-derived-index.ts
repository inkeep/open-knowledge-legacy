import type { Document, Extension } from '@hocuspocus/server';
import type { BacklinkIndex } from './backlink-index.ts';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
import type { TagIndex } from './tag-index.ts';

export const LIVE_DERIVED_INDEX_DEBOUNCE_MS = 100;

export interface LiveDerivedIndexOptions {
  backlinkIndex: BacklinkIndex;
  tagIndex?: TagIndex;
  signalChannel?: (channel: 'files' | 'backlinks' | 'graph' | 'tags') => void;
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
  return document.getText('source').toString();
}

export function createLiveDerivedIndexExtension(options: LiveDerivedIndexOptions): Extension {
  const {
    backlinkIndex,
    tagIndex,
    signalChannel,
    debounceMs = LIVE_DERIVED_INDEX_DEBOUNCE_MS,
  } = options;
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
          const markdown = serializeLiveDocument(document);
          backlinkIndex.updateDocumentFromMarkdown(docName, markdown);
          signalChannel?.('backlinks');
          signalChannel?.('graph');
          if (tagIndex) {
            tagIndex.updateDocumentFromMarkdown(docName, markdown);
            signalChannel?.('tags');
          }
        } catch (err) {
          console.error(`[live-derived-index] Failed to update derived views for ${docName}:`, err);
        }
      }, debounceMs),
    );
  }

  return {
    async onChange({ documentName, document, transactionOrigin }) {
      if (isSystemDoc(documentName) || isConfigDoc(documentName)) return;

      if (
        isLocalOriginLike(transactionOrigin) &&
        transactionOrigin.context?.origin === 'file-watcher'
      ) {
        return;
      }

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
