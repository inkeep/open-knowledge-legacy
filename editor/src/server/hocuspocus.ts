import { createHash } from 'node:crypto';
import { existsSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Hocuspocus } from '@hocuspocus/server';
import type { Plugin } from 'vite';
import { WebSocketServer } from 'ws';
import type * as Y from 'yjs';
import { applyMarkdownToDoc, serializeDocToMarkdown } from '../editor/markdown';

if (!import.meta.dirname) {
  throw new Error('[hocuspocus] import.meta.dirname unavailable — cannot resolve content path');
}
const CONTENT_DIR = resolve(import.meta.dirname, '../../content');
const SERVER_ORIGIN_DISK_IMPORT = 'server-disk-import';

type FileMode = 'editable' | 'source-only';

interface SyncState {
  docRev: number;
  savedDocRev: number;
  diskRawHash: string;
  lastWrittenRawHash: string;
  filePath: string;
  fileMode: FileMode;
  conflictMessage: string;
}

const syncStates = new Map<string, SyncState>();
let contentWatcherStarted = false;

function sha1(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

function setMetadata(doc: Y.Doc, values: Record<string, string>): void {
  const meta = doc.getMap('metadata');
  for (const [key, value] of Object.entries(values)) meta.set(key, value);
}

function resolveDocumentFile(documentName: string): { filePath: string; fileMode: FileMode } {
  const mdPath = resolve(CONTENT_DIR, `${documentName}.md`);
  if (existsSync(mdPath)) return { filePath: mdPath, fileMode: 'editable' };

  const mdxPath = resolve(CONTENT_DIR, `${documentName}.mdx`);
  if (existsSync(mdxPath)) return { filePath: mdxPath, fileMode: 'source-only' };

  return { filePath: mdPath, fileMode: 'editable' };
}

function getSyncState(documentName: string): SyncState {
  const existing = syncStates.get(documentName);
  if (existing) return existing;

  const { filePath, fileMode } = resolveDocumentFile(documentName);
  const initial: SyncState = {
    docRev: 0,
    savedDocRev: 0,
    diskRawHash: existsSync(filePath) ? sha1(readFileSync(filePath, 'utf-8')) : '',
    lastWrittenRawHash: '',
    filePath,
    fileMode,
    conflictMessage: '',
  };
  syncStates.set(documentName, initial);
  return initial;
}

function refreshMetadata(documentName: string, doc: Y.Doc): void {
  const state = getSyncState(documentName);
  doc.transact(() => {
    setMetadata(doc, {
      fileMode: state.fileMode,
      syncConflict: state.conflictMessage,
      filePath: state.filePath,
      canonicalRevision: String(state.docRev),
    });
  }, 'server-metadata');
}

function markConflict(documentName: string, doc: Y.Doc, message: string): void {
  const state = getSyncState(documentName);
  state.conflictMessage = message;
  doc.transact(() => {
    setMetadata(doc, {
      fileMode: state.fileMode,
      syncConflict: message,
      filePath: state.filePath,
      canonicalRevision: String(state.docRev),
    });
  }, 'server-metadata');
}

function importDiskFile(documentName: string, document: Y.Doc, raw: string): void {
  const state = getSyncState(documentName);
  if (state.fileMode === 'source-only') {
    state.conflictMessage = '';
    document.transact(() => {
      setMetadata(document, {
        fileMode: 'source-only',
        rawSource: raw,
        syncConflict: '',
        filePath: state.filePath,
        canonicalRevision: String(state.docRev),
      });
    }, 'server-metadata');
    state.diskRawHash = sha1(raw);
    state.savedDocRev = state.docRev;
    return;
  }

  state.docRev += 1;
  const xmlFragment = document.getXmlFragment('default');
  state.conflictMessage = '';
  document.transact(() => {
    applyMarkdownToDoc(document, xmlFragment, raw);
    setMetadata(document, {
      fileMode: 'editable',
      rawSource: '',
      syncConflict: '',
      filePath: state.filePath,
      canonicalRevision: String(state.docRev),
    });
  }, SERVER_ORIGIN_DISK_IMPORT);
  state.diskRawHash = sha1(raw);
  state.lastWrittenRawHash = '';
  state.savedDocRev = state.docRev;
}

function ensureContentWatcher(instance: Hocuspocus): void {
  if (contentWatcherStarted) return;
  contentWatcherStarted = true;

  watch(CONTENT_DIR, { recursive: true }, (eventType, filename) => {
    if (!filename || eventType !== 'change') return;

    const documentName = filename.replace(/\.(md|mdx)$/, '');
    const document = instance.documents.get(documentName);
    if (!document) return;

    const state = getSyncState(documentName);
    if (!existsSync(state.filePath)) return;

    const raw = readFileSync(state.filePath, 'utf-8');
    const rawHash = sha1(raw);
    if (rawHash === state.diskRawHash || rawHash === state.lastWrittenRawHash) {
      state.diskRawHash = rawHash;
      if (rawHash === state.lastWrittenRawHash) state.lastWrittenRawHash = '';
      return;
    }

    if (state.docRev !== state.savedDocRev) {
      markConflict(
        documentName,
        document,
        'Disk changed while the in-browser document has unsaved changes. Autosave is paused until you resolve the conflict.',
      );
      state.diskRawHash = rawHash;
      return;
    }

    importDiskFile(documentName, document, raw);
  });
}

export const hocuspocus = new Hocuspocus({
  quiet: true,
  debounce: 400,
  extensions: [
    {
      async onLoadDocument({ document, documentName }) {
        const state = getSyncState(documentName);
        refreshMetadata(documentName, document);
        ensureContentWatcher(hocuspocus);

        if (!existsSync(state.filePath)) return;
        if (state.fileMode === 'editable' && document.getXmlFragment('default').length > 0) return;

        const raw = readFileSync(state.filePath, 'utf-8');
        importDiskFile(documentName, document, raw);

        console.log(`[hocuspocus] Loaded ${documentName} from ${state.filePath}`);
      },

      async onChange({ document, documentName, transactionOrigin }) {
        if (transactionOrigin === 'server-metadata') return;

        const state = getSyncState(documentName);
        if (transactionOrigin !== SERVER_ORIGIN_DISK_IMPORT) state.docRev += 1;
        refreshMetadata(documentName, document);
      },

      async onStoreDocument({ document, documentName }) {
        const state = getSyncState(documentName);
        if (state.fileMode !== 'editable') return;
        if (state.conflictMessage) return;

        const raw = serializeDocToMarkdown(document, document.getXmlFragment('default'));
        const rawHash = sha1(raw);
        if (rawHash === state.diskRawHash) {
          state.savedDocRev = state.docRev;
          return;
        }

        writeFileSync(state.filePath, raw, 'utf-8');
        state.lastWrittenRawHash = rawHash;
        state.diskRawHash = rawHash;
        state.savedDocRev = state.docRev;
      },
    },
  ],
});

export function hocuspocusPlugin(): Plugin {
  return {
    name: 'hocuspocus',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });

      server.httpServer?.prependListener('upgrade', (req, socket, head) => {
        if (req.url?.startsWith('/collab')) {
          wss.handleUpgrade(req, socket, head, (ws) => {
            const conn = hocuspocus.handleConnection(ws, req);
            ws.on('message', (data: Buffer) => {
              conn.handleMessage(new Uint8Array(data));
            });
            ws.on('close', (code: number, reason: Buffer) => {
              conn.handleClose({ code, reason: reason.toString() });
            });
            ws.on('error', (err) => {
              console.error('[collab] WebSocket error:', err);
              ws.terminate();
            });
          });
        }
      });

      console.log('[hocuspocus] Ready on /collab');
    },
  };
}
