import type { Hocuspocus } from '@hocuspocus/server';
import {
  BridgeInvariantViolationError,
  BridgeMergeContentLossError,
  stripFrontmatter,
} from '@inkeep/open-knowledge-core';
import { formatReconcileSubject } from '@inkeep/open-knowledge-core/shadow-repo-layout';
import type * as Y from 'yjs';
import { composeAndWriteRawBody } from './bridge-intake.ts';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
import { recordContributor } from './contributor-tracker.ts';
import { recordFrontmatterEditSurface } from './frontmatter-telemetry.ts';
import { incrementExternalChangeHandlerErrors } from './metrics.ts';
import { setReconciledBase } from './persistence.ts';
import type { PairedWriteOrigin } from './server-observers.ts';
import { FILE_SYSTEM_WRITER } from './shadow-repo.ts';

export const FILE_WATCHER_ORIGIN = {
  source: 'local',
  skipStoreHooks: true,
  context: { origin: 'file-watcher', paired: true },
} as const satisfies PairedWriteOrigin;

export function applyDiskContentToDoc(
  document: Y.Doc,
  content: string,
  resolveEmbed?: (basename: string, sourcePath: string) => string | null,
  sourcePath?: string,
): void {
  const embedResolver = resolveEmbed && sourcePath ? { resolveEmbed, sourcePath } : undefined;
  composeAndWriteRawBody(document, content, embedResolver);
}

export function applyExternalChange(
  hocuspocus: Hocuspocus,
  docName: string,
  content: string,
  resolveEmbed?: (basename: string, sourcePath: string) => string | null,
): void {
  if (isSystemDoc(docName) || isConfigDoc(docName)) return;
  const document = hocuspocus.documents.get(docName);
  if (!document) return;

  const priorFm = stripFrontmatter(document.getText('source').toString()).frontmatter;
  const { frontmatter: nextFm } = stripFrontmatter(content);

  try {
    document.transact(() => {
      applyDiskContentToDoc(document, content, resolveEmbed, docName);
    }, FILE_WATCHER_ORIGIN);
  } catch (err) {
    setReconciledBase(docName, document.getText('source').toString());
    throw err;
  }

  if (priorFm !== nextFm) {
    recordFrontmatterEditSurface('file-watcher');
  }

  recordContributor(
    docName,
    FILE_SYSTEM_WRITER.id,
    FILE_SYSTEM_WRITER.name,
    FILE_SYSTEM_WRITER.id,
    formatReconcileSubject(docName),
  );

  setReconciledBase(docName, content);
}

export function createExternalChangeHandler(
  hocuspocus: Hocuspocus,
  resolveEmbed?: (basename: string, sourcePath: string) => string | null,
): (docName: string, content: string) => Promise<void> {
  return async (docName: string, content: string): Promise<void> => {
    try {
      applyExternalChange(hocuspocus, docName, content, resolveEmbed);
      console.log(`[file-watcher] Applied external change: ${docName}`);
    } catch (err) {
      if (
        err instanceof BridgeInvariantViolationError ||
        err instanceof BridgeMergeContentLossError
      ) {
        throw err;
      }
      incrementExternalChangeHandlerErrors();
      console.error(`[file-watcher] Failed to apply external change for ${docName}:`, err);
    }
  };
}
