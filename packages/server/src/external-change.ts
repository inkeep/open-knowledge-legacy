import type { Hocuspocus } from '@hocuspocus/server';
import { applyFastDiff, prependFrontmatter, stripFrontmatter } from '@inkeep/open-knowledge-core';
import { formatReconcileSubject } from '@inkeep/open-knowledge-core/shadow-repo-layout';
import { updateYFragment } from '@tiptap/y-tiptap';
import type * as Y from 'yjs';
import { isConfigDoc, isSystemDoc } from './cc1-broadcast.ts';
import { recordContributor } from './contributor-tracker.ts';
import { recordFrontmatterEditSurface } from './frontmatter-telemetry.ts';
import { mdManager, schema } from './md-manager.ts';
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
  const { frontmatter, body } = stripFrontmatter(content);
  const parseOpts = resolveEmbed && sourcePath ? { resolveEmbed, sourcePath } : undefined;
  const parsedJson = mdManager.parseWithFallback(body, parseOpts);
  const pmNode = schema.nodeFromJSON(parsedJson);
  const xmlFragment = document.getXmlFragment('default');

  const canonicalBody = mdManager.serialize(parsedJson);
  const canonicalContent = prependFrontmatter(frontmatter, canonicalBody);

  document.transact(() => {
    const meta = { mapping: new Map(), isOMark: new Map() };
    updateYFragment(document, xmlFragment, pmNode, meta);

    const ytext = document.getText('source');
    const currentText = ytext.toString();
    if (currentText !== canonicalContent) {
      applyFastDiff(ytext, currentText, canonicalContent);
    }
  }, FILE_WATCHER_ORIGIN);
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

  applyDiskContentToDoc(document, content, resolveEmbed, docName);

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
      console.error(`[file-watcher] Failed to apply external change for ${docName}:`, err);
    }
  };
}
