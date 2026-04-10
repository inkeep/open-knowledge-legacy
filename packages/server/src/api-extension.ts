/**
 * HTTP API extension for Hocuspocus — agent write, undo/redo, and test reset endpoints.
 *
 * Implemented as a Hocuspocus onRequest extension so it works with both
 * the standalone Server and the Vite dev plugin.
 */

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import type { Extension, Hocuspocus } from '@hocuspocus/server';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  type HeadingEntry,
  stripFrontmatter,
  toWikiLinkSlug,
} from '@inkeep/open-knowledge-core';
import { updateYFragment } from '@tiptap/y-tiptap';
import busboy from 'busboy';
import { createPatch } from 'diff';
import { fileTypeFromBuffer } from 'file-type';
import {
  AGENT_WRITE_ORIGIN,
  type AgentSessionManager,
  DEFAULT_AGENT_ID,
  syncTextToFragment,
} from './agent-sessions.ts';
import type { BacklinkIndex } from './backlink-index.ts';
import { isSystemDoc } from './cc1-broadcast.ts';
import { contentHash, type FileIndexEntry, registerWrite } from './file-watcher.ts';
import { mdManager, schema } from './md-manager.ts';
import { getMetrics } from './metrics.ts';
import { deleteReconciledBase, isWithinContentDir, safeContentPath, setReconciledBase } from './persistence.ts';
import { type ShadowRef, saveVersion, shadowGit, type WriterIdentity } from './shadow-repo.ts';
import { getDocumentHistory } from './timeline-query.ts';

const ROLLBACK_ORIGIN = 'rollback-apply';

/** Validates a docName is safe for use as a shadow git path component. */
function safeDocPath(docName: string, contentRoot: string): { path: string } | { error: string } {
  if (!docName || docName.includes('..') || docName.includes('/') || docName.includes('\0')) {
    return { error: 'Invalid document name' };
  }
  const normalized = contentRoot.replace(/^\.\//, '');
  return { path: `${normalized}/${docName}.md` };
}

const MAX_BODY_BYTES = 1_048_576; // 1 MB
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES: Set<string> = new Set(ALLOWED_IMAGE_MIME_TYPES);

const GENERIC_PASTE_NAMES = /^(image\.(png|jpe?g|gif|webp)|Clipboard.*|Untitled.*)$/i;

export function sanitizeFilename(name: string): string {
  const base = name.replace(/[/\\]/g, '');
  const ext = extname(base);
  const stem = base.slice(0, base.length - ext.length);
  const safeStem = stem.replace(/[^a-zA-Z0-9_\-.]/g, '_') || 'upload';
  const safeExt = ext.replace(/[^a-zA-Z0-9_.]/g, '');
  return safeStem + safeExt;
}

function writeUploadAtomic(destDir: string, sanitized: string, buffer: Buffer): string {
  const ext = extname(sanitized);
  const stem = sanitized.slice(0, sanitized.length - ext.length);
  const candidates = [sanitized, ...Array.from({ length: 99 }, (_, i) => `${stem}-${i + 1}${ext}`)];

  for (const name of candidates) {
    const destPath = resolve(destDir, name);
    try {
      const fd = openSync(destPath, 'wx');
      try {
        writeSync(fd, buffer);
      } finally {
        closeSync(fd);
      }
      return name;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw err;
    }
  }
  throw new Error('Could not find available filename after 100 attempts');
}

interface UploadResult {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  parentDocName: string;
}

function readUploadBody(req: IncomingMessage, maxBytes: number): Promise<UploadResult> {
  return new Promise((resolveP, reject) => {
    let bb: ReturnType<typeof busboy>;
    try {
      bb = busboy({ headers: req.headers, limits: { fileSize: maxBytes, files: 1 } });
    } catch (err) {
      reject(err);
      return;
    }

    let settled = false;
    let filename = 'upload';
    let mimeType = '';
    let parentDocName = '';
    const chunks: Buffer[] = [];
    let exceeded = false;

    bb.on('field', (name, val) => {
      if (name === 'parentDocName') parentDocName = val;
    });

    bb.on('file', (_fieldname, file, info) => {
      filename = info.filename || 'upload';
      mimeType = info.mimeType || '';

      file.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      file.on('limit', () => {
        exceeded = true;
        req.unpipe(bb);
        if (!settled) {
          settled = true;
          reject(new Error('Payload too large'));
        }
      });

      file.on('error', (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
    });

    bb.on('finish', () => {
      if (!settled) {
        if (exceeded) {
          settled = true;
          reject(new Error('Payload too large'));
          return;
        }
        if (!mimeType && chunks.length === 0) {
          settled = true;
          reject(new Error('No file received'));
          return;
        }
        settled = true;
        resolveP({ filename, mimeType, buffer: Buffer.concat(chunks), parentDocName });
      }
    });

    bb.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    req.pipe(bb);
  });
}

/**
 * Resolve a subdirectory path within a base directory, rejecting traversal attempts.
 * Throws if the resolved path escapes the base directory.
 */
export function safeSubdir(baseDir: string, subdir: string): string {
  const resolved = resolve(baseDir, subdir);
  if (resolved !== baseDir && !resolved.startsWith(`${baseDir}/`)) {
    throw new Error(`Invalid directory: ${subdir}`);
  }
  return resolved;
}

export type ContentEntryKind = 'file' | 'folder';

export interface RenamedDocMapping {
  fromDocName: string;
  toDocName: string;
}

export function isValidRelativeContentPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\x00')) {
    return false;
  }

  return path.split('/').every((segment) => segment && segment !== '.' && segment !== '..');
}

export function listAffectedDocNames(
  index: ReadonlyMap<string, FileIndexEntry>,
  kind: ContentEntryKind,
  path: string,
): string[] {
  const docNames = [...index.keys()].filter((docName) =>
    kind === 'file' ? docName === path : docName === path || docName.startsWith(`${path}/`),
  );
  docNames.sort((a, b) => a.localeCompare(b));
  return docNames;
}

export function remapDocNameForRename(
  docName: string,
  kind: ContentEntryKind,
  fromPath: string,
  toPath: string,
): string {
  if (kind === 'file') return toPath;
  if (docName === fromPath) return toPath;
  return `${toPath}${docName.slice(fromPath.length)}`;
}

/**
 * Ensures `fullPath` does not escape `resolvedContentDir` via symlinks (matches persistence
 * symlink-escape checks). Walks up with dirname when the leaf is missing so destinations like
 * `link/new.md` are rejected if `link` resolves outside the content dir.
 *
 * Uses `realpathSync(resolvedContentDir)` as the boundary anchor so platform normalization
 * (e.g. macOS `/var` → `/private/var`) matches `realpathSync` of paths under it.
 */
function assertNoSymlinkEscape(fullPath: string, resolvedContentDir: string): void {
  let contentRoot: string;
  try {
    contentRoot = realpathSync(resolvedContentDir);
  } catch {
    return;
  }

  let cur = fullPath;
  for (;;) {
    try {
      const canonical = realpathSync(cur);
      if (!isWithinContentDir(canonical, contentRoot)) {
        throw new Error('symlink-escape: path resolves outside content directory');
      }
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ELOOP') {
        throw new Error('symlink-escape: symlink cycle in path');
      }
      if (code !== 'ENOENT') throw err;
      const parent = dirname(cur);
      if (parent === cur) throw err;
      if (parent !== resolvedContentDir && !parent.startsWith(`${resolvedContentDir}${sep}`)) {
        throw err;
      }
      cur = parent;
    }
  }
}

function resolveContentEntryPath(contentDir: string, kind: ContentEntryKind, path: string): string {
  if (!isValidRelativeContentPath(path)) {
    throw new Error('path must be a relative content path');
  }

  const resolvedContentDir = resolve(contentDir);
  const relativePath = kind === 'file' ? `${path}.md` : path;
  const fullPath = resolve(resolvedContentDir, relativePath);

  if (fullPath !== resolvedContentDir && !fullPath.startsWith(`${resolvedContentDir}${sep}`)) {
    throw new Error('path must not escape content directory');
  }

  assertNoSymlinkEscape(fullPath, resolvedContentDir);

  return fullPath;
}

export interface ApiExtensionOptions {
  hocuspocus: Hocuspocus;
  sessionManager: AgentSessionManager;
  contentDir: string;
  /** Accessor for the watcher's in-memory file index. GET /api/documents reads from this. */
  getFileIndex: () => ReadonlyMap<string, FileIndexEntry>;
  /** Accessor for the alias map (alias docName → canonical docName). */
  getAliasMap?: () => ReadonlyMap<string, string>;
  /**
   * When true, register test-only routes (currently `/api/test-reset`).
   * Defaults to `false` — these routes allow any client to destroy document
   * state and must never be exposed in production. Enable only in tests and
   * local dev mode.
   */
  enableTestRoutes?: boolean;
  shadowRef?: ShadowRef;
  /** Force-flush the L2 git commit debounce (e.g. after rollback). */
  flushGitCommit?: () => Promise<void>;
  projectRoot?: string;
  contentRoot?: string;
  backlinkIndex?: BacklinkIndex;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += (chunk as Buffer).length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new Error('Payload too large');
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Handle syncTextToFragment failure after an undo/redo CRDT operation by
 * attempting compensation (reverse the operation) and responding with a
 * structured error. Shared between the undo and redo handlers so the
 * compensation protocol stays in sync.
 */
function handleCompensationError(
  res: ServerResponse,
  syncErr: unknown,
  compensateFn: () => void,
  label: string,
): void {
  let compensationFailed = false;
  try {
    compensateFn();
  } catch (compensateErr) {
    compensationFailed = true;
    console.error(`[${label}] Compensation also failed:`, compensateErr);
  }
  console.error(`[${label}]`, syncErr);
  json(res, 500, {
    ok: false,
    error: `Sync failed after ${label.replace('agent-', '')}`,
    compensationFailed,
    ...(compensationFailed
      ? {
          warning:
            'Document may be in an inconsistent state — CRDT operation applied but text sync failed and compensation also failed',
        }
      : {}),
  });
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
}

/**
 * Extract all ATX headings (# … ######) from a markdown document.
 * Frontmatter is stripped before scanning so `title:` YAML lines are ignored.
 */
export type { HeadingEntry } from '@inkeep/open-knowledge-core';
export function extractHeadings(content: string): HeadingEntry[] {
  let body = content;
  if (content.startsWith('---\n') || content.startsWith('---\r\n')) {
    const closingIdx = content.indexOf('\n---', 3);
    if (closingIdx !== -1) {
      body = content.slice(closingIdx + 4);
    }
  }

  const headings: HeadingEntry[] = [];
  for (const line of body.split('\n')) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const text = match[2].trim();
      const slug = toWikiLinkSlug(text);
      if (slug) headings.push({ level: match[1].length, text, slug });
    }
  }
  return headings;
}

/**
 * Extract a human-readable title from a markdown file's content.
 *
 * Priority:
 *  1. `title:` field in YAML frontmatter (between leading `---` delimiters)
 *  2. First `# heading` line in the file
 *  3. filename (without extension, as provided by the caller)
 */
export function extractPageTitle(content: string, filename: string): string {
  // 1. Frontmatter title — only if the file starts with ---
  if (content.startsWith('---\n') || content.startsWith('---\r\n')) {
    const closingIdx = content.indexOf('\n---', 3);
    if (closingIdx !== -1) {
      const frontmatter = content.slice(0, closingIdx + 4);
      const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
      if (titleMatch) {
        let title = titleMatch[1].trim();
        if (
          (title.startsWith('"') && title.endsWith('"')) ||
          (title.startsWith("'") && title.endsWith("'"))
        ) {
          title = title.slice(1, -1);
        }
        return title;
      }
    }
  }

  // 2. First # heading
  const headingMatch = content.match(/^# (.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }

  // 3. Filename fallback
  return filename;
}

function isSafeDocName(docName: string): boolean {
  return !(
    docName.includes('..') ||
    docName.startsWith('/') ||
    docName.includes('\x00') ||
    docName.includes('\\')
  );
}

export function createApiExtension(options: ApiExtensionOptions): Extension {
  const {
    hocuspocus,
    sessionManager,
    contentDir,
    getFileIndex,
    getAliasMap,
    enableTestRoutes = false,
    shadowRef,
    flushGitCommit,
    projectRoot,
    contentRoot,
    backlinkIndex,
  } = options;

  function resolveDocPath(docName: string): string | null {
    if (!isSafeDocName(docName)) return null;
    const resolvedContentDir = resolve(contentDir);
    const filePath = resolve(resolvedContentDir, `${docName}.md`);
    if (!filePath.startsWith(`${resolvedContentDir}/`) && filePath !== resolvedContentDir) {
      return null;
    }
    return filePath;
  }

  function readPageTitleForDocName(docName: string): string {
    const filePath = resolveDocPath(docName);
    if (!filePath || !existsSync(filePath)) return docName;
    try {
      return extractPageTitle(readFileSync(filePath, 'utf-8'), docName);
    } catch {
      return docName;
    }
  }

  function resolveAlias(docName: string): string {
    return getAliasMap?.().get(docName) ?? docName;
  }

  async function captureAndCloseDocuments(docNames: string[]): Promise<Map<string, string>> {
    const liveContents = new Map<string, string>();

    for (const docName of docNames) {
      const document = hocuspocus.documents.get(docName);
      if (document) {
        liveContents.set(docName, document.getText('source').toString());
      }
    }

    for (const docName of docNames) {
      await sessionManager.closeSession(docName).catch((err) => {
        console.warn(`[file-ops] Failed to close agent session for ${docName}:`, err);
      });
    }

    for (const docName of docNames) {
      const document = hocuspocus.documents.get(docName);
      deleteReconciledBase(docName);
      if (!document) continue;
      hocuspocus.closeConnections(docName);
      await hocuspocus.unloadDocument(document);
    }

    return liveContents;
  }

  function syncRenamedDocsToDisk(
    renamed: RenamedDocMapping[],
    liveContents: ReadonlyMap<string, string>,
  ): void {
    for (const { fromDocName, toDocName } of renamed) {
      const filePath = safeContentPath(toDocName, contentDir);
      const liveContent = liveContents.get(fromDocName);
      if (typeof liveContent === 'string') {
        writeFileSync(filePath, liveContent, 'utf-8');
      }

      const finalContent =
        typeof liveContent === 'string'
          ? liveContent
          : existsSync(filePath)
            ? readFileSync(filePath, 'utf-8')
            : null;

      if (typeof finalContent === 'string') {
        registerWrite(filePath, contentHash(finalContent));
      }
    }
  }

  async function handleAgentWrite(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }
      let body: Record<string, unknown>;
      try {
        body =
          rawBody.length > 0 ? (JSON.parse(rawBody.toString()) as Record<string, unknown>) : {};
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }
      const rawDocName =
        typeof body.docName === 'string' && body.docName.length > 0 ? body.docName : 'test-doc';
      if (!isSafeDocName(rawDocName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      const docName = resolveAlias(rawDocName);
      if (isSystemDoc(docName)) {
        json(res, 400, { ok: false, error: `'${docName}' is a reserved document name` });
        return;
      }
      const dc = await sessionManager.getSession(docName);
      const timestamp = new Date().toISOString();
      const content =
        typeof body.content === 'string' ? body.content : `Hello from the agent! ${timestamp}`;

      dc.document.awareness.setLocalStateField('mode', 'editing');
      try {
        dc.document.transact(() => {
          const ytext = dc.document.getText('source');
          const currentText = ytext.toString();
          const insertAt = currentText.length;
          const separator = currentText.trim() ? '\n\n' : '';
          ytext.insert(insertAt, `${separator}${content}\n`);
          syncTextToFragment(dc.document);

          const activityMap = dc.document.getMap('activity');
          activityMap.set(DEFAULT_AGENT_ID, {
            agentId: DEFAULT_AGENT_ID,
            timestamp: Date.now(),
            type: 'insert',
            description: `Added: ${content.slice(0, 50)}`,
          });
        }, AGENT_WRITE_ORIGIN);
      } finally {
        dc.document.awareness.setLocalStateField('mode', 'idle');
      }

      json(res, 200, { ok: true, timestamp });
    } catch (e) {
      console.error('[agent-write]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  async function handleAgentWriteMd(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }

      let body: unknown;
      try {
        body = JSON.parse(rawBody.toString());
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        json(res, 400, { ok: false, error: 'Body must be a JSON object' });
        return;
      }

      const { markdown, position: pos } = body as Record<string, unknown>;
      if (!markdown || typeof markdown !== 'string') {
        json(res, 400, { ok: false, error: 'markdown field required' });
        return;
      }

      const position = pos === 'prepend' ? 'prepend' : pos === 'replace' ? 'replace' : 'append';
      const rawDocName = (body as Record<string, unknown>).docName;
      const effectiveDocName =
        typeof rawDocName === 'string' && rawDocName.length > 0 ? rawDocName : 'test-doc';
      if (!isSafeDocName(effectiveDocName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      const resolvedDocName = resolveAlias(effectiveDocName);
      if (isSystemDoc(resolvedDocName)) {
        json(res, 400, { ok: false, error: `'${resolvedDocName}' is a reserved document name` });
        return;
      }
      const dc = await sessionManager.getSession(resolvedDocName);
      const timestamp = new Date().toISOString();

      dc.document.awareness.setLocalStateField('mode', 'editing');
      try {
        dc.document.transact(() => {
          const ytext = dc.document.getText('source');
          const currentText = ytext.toString();

          if (position === 'replace') {
            ytext.delete(0, currentText.length);
            ytext.insert(0, markdown.trim());
          } else if (position === 'prepend') {
            ytext.insert(0, `${markdown.trim()}\n\n`);
          } else {
            const insertAt = currentText.length;
            const separator = currentText.trim() ? '\n\n' : '';
            ytext.insert(insertAt, `${separator}${markdown.trim()}\n`);
          }

          syncTextToFragment(dc.document);

          const activityMap = dc.document.getMap('activity');
          activityMap.set(DEFAULT_AGENT_ID, {
            agentId: DEFAULT_AGENT_ID,
            timestamp: Date.now(),
            type: 'insert',
            description: `Added: ${markdown.trim().slice(0, 50)}`,
          });
        }, AGENT_WRITE_ORIGIN);
      } finally {
        dc.document.awareness.setLocalStateField('mode', 'idle');
      }

      json(res, 200, { ok: true, timestamp });
    } catch (e) {
      console.error('[agent-write-md]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  async function handleDocumentRead(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const rawDocName = url.searchParams.get('docName') || 'test-doc';
      if (!isSafeDocName(rawDocName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      const docName = resolveAlias(rawDocName);
      if (isSystemDoc(docName)) {
        json(res, 400, { ok: false, error: `'${docName}' is a reserved document name` });
        return;
      }
      const dc = await sessionManager.getSession(docName);
      const content = dc.document.getText('source').toString();
      json(res, 200, { ok: true, docName, content });
    } catch (e) {
      console.error('[document-read]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  async function handleDocumentList(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const dir = url.searchParams.get('dir');

      // Validate dir parameter (reject traversal attempts)
      if (dir) {
        try {
          safeSubdir(contentDir, dir);
        } catch {
          json(res, 400, { ok: false, error: 'Invalid directory parameter' });
          return;
        }
      }

      // Read from the watcher's in-memory file index (instant, no filesystem scan)
      const index = getFileIndex();
      const documents: {
        docName: string;
        size: number;
        modified: string;
        isSymlink: boolean;
        canonicalDocName: string | null;
        targetPath: string | null;
      }[] = [];

      for (const [docName, entry] of index) {
        // Filter by dir prefix if specified
        if (dir && !docName.startsWith(`${dir}/`) && docName !== dir) continue;

        documents.push({
          docName,
          size: entry.size,
          modified: entry.modified,
          isSymlink: false,
          canonicalDocName: null,
          targetPath: null,
        });

        // Emit alias entries for this canonical file
        for (const alias of entry.aliases) {
          if (dir && !alias.startsWith(`${dir}/`) && alias !== dir) continue;
          const targetRelPath = relative(contentDir, entry.canonicalPath);
          documents.push({
            docName: alias,
            size: entry.size,
            modified: entry.modified,
            isSymlink: true,
            canonicalDocName: docName,
            targetPath: targetRelPath,
          });
        }
      }

      documents.sort((a, b) => a.docName.localeCompare(b.docName));
      json(res, 200, { ok: true, documents });
    } catch (e) {
      console.error('[document-list]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  async function handleBacklinks(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (!backlinkIndex) {
      json(res, 503, { ok: false, error: 'Backlink index not configured' });
      return;
    }
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const docName = url.searchParams.get('docName');
      if (!docName) {
        json(res, 400, { ok: false, error: 'Missing docName parameter' });
        return;
      }
      if (!isSafeDocName(docName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      const backlinks = backlinkIndex.getBacklinks(docName).map((entry) => ({
        source: entry.source,
        title: readPageTitleForDocName(entry.source),
        snippet: entry.snippet,
      }));
      json(res, 200, { ok: true, docName, backlinks });
    } catch (e) {
      console.error('[backlinks]', e);
      json(res, 500, { ok: false, error: 'Failed to read backlinks' });
    }
  }

  async function handleForwardLinks(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (!backlinkIndex) {
      json(res, 503, { ok: false, error: 'Backlink index not configured' });
      return;
    }
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const docName = url.searchParams.get('docName');
      if (!docName) {
        json(res, 400, { ok: false, error: 'Missing docName parameter' });
        return;
      }
      if (!isSafeDocName(docName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      json(res, 200, {
        ok: true,
        docName,
        forwardLinks: backlinkIndex.getForwardLinks(docName),
      });
    } catch (e) {
      console.error('[forward-links]', e);
      json(res, 500, { ok: false, error: 'Failed to read forward links' });
    }
  }

  async function handleLinkGraph(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (!backlinkIndex) {
      json(res, 503, { ok: false, error: 'Backlink index not configured' });
      return;
    }
    try {
      const { nodes, links } = backlinkIndex.getLinkGraph();
      const enrichedNodes = nodes.map((id) => ({
        id,
        label: readPageTitleForDocName(id),
      }));
      json(res, 200, { ok: true, nodes: enrichedNodes, links });
    } catch (e) {
      console.error('[link-graph]', e);
      json(res, 500, { ok: false, error: 'Failed to read link graph' });
    }
  }

  async function handleOrphans(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (!backlinkIndex) {
      json(res, 503, { ok: false, error: 'Backlink index not configured' });
      return;
    }
    try {
      const orphans = backlinkIndex.getOrphans([...getFileIndex().keys()]).map((docName) => ({
        docName,
        title: readPageTitleForDocName(docName),
      }));
      json(res, 200, { ok: true, orphans });
    } catch (e) {
      console.error('[orphans]', e);
      json(res, 500, { ok: false, error: 'Failed to read orphan pages' });
    }
  }

  async function handleHubs(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    if (!backlinkIndex) {
      json(res, 503, { ok: false, error: 'Backlink index not configured' });
      return;
    }
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const rawLimit = url.searchParams.get('limit');
      const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : 20;
      const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
      const hubs = backlinkIndex.getHubs(limit).map((hub) => ({
        docName: hub.docName,
        title: readPageTitleForDocName(hub.docName),
        count: hub.count,
      }));
      json(res, 200, { ok: true, hubs });
    } catch (e) {
      console.error('[hubs]', e);
      json(res, 500, { ok: false, error: 'Failed to read hub pages' });
    }
  }

  async function handleAgentPatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }
      let body: unknown;
      try {
        body = JSON.parse(rawBody.toString());
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        json(res, 400, { ok: false, error: 'Body must be a JSON object' });
        return;
      }
      const { find, replace, docName: bodyDocName } = body as Record<string, unknown>;
      if (typeof find !== 'string' || find.length === 0) {
        json(res, 400, { ok: false, error: 'find field required' });
        return;
      }
      if (typeof replace !== 'string') {
        json(res, 400, { ok: false, error: 'replace field required' });
        return;
      }
      const effectivePatchDocName =
        typeof bodyDocName === 'string' && bodyDocName.length > 0 ? bodyDocName : 'test-doc';
      if (!isSafeDocName(effectivePatchDocName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      const docName = resolveAlias(effectivePatchDocName);
      if (isSystemDoc(docName)) {
        json(res, 400, { ok: false, error: `'${docName}' is a reserved document name` });
        return;
      }
      const dc = await sessionManager.getSession(docName);
      const timestamp = new Date().toISOString();

      let notFound = false;
      dc.document.awareness.setLocalStateField('mode', 'editing');
      try {
        dc.document.transact(() => {
          const ytext = dc.document.getText('source');
          const currentText = ytext.toString();
          const pos = currentText.indexOf(find);
          if (pos === -1) {
            notFound = true;
            return;
          }
          ytext.delete(pos, find.length);
          ytext.insert(pos, replace);
          syncTextToFragment(dc.document);
          const activityMap = dc.document.getMap('activity');
          activityMap.set(DEFAULT_AGENT_ID, {
            agentId: DEFAULT_AGENT_ID,
            timestamp: Date.now(),
            type: 'insert',
            description: `Patched: ${find.slice(0, 50)}`,
          });
        }, AGENT_WRITE_ORIGIN);
      } finally {
        dc.document.awareness.setLocalStateField('mode', 'idle');
      }

      if (notFound) {
        json(res, 404, { ok: false, error: 'Text not found in document' });
        return;
      }
      json(res, 200, { ok: true, timestamp });
    } catch (e) {
      console.error('[agent-patch]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  async function handleAgentUndoStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const docName = resolveAlias(url.searchParams.get('docName') || 'test-doc');
      if (isSystemDoc(docName)) {
        json(res, 400, { ok: false, error: `'${docName}' is a reserved document name` });
        return;
      }
      if (!sessionManager.hasSession(docName)) {
        json(res, 200, { ok: true, canUndo: false, canRedo: false });
        return;
      }
      const um = sessionManager.getExistingUndoManager(docName);
      json(res, 200, {
        ok: true,
        canUndo: um?.canUndo() ?? false,
        canRedo: um?.canRedo() ?? false,
      });
    } catch (e) {
      console.error('[agent-undo-status]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  async function handleAgentUndo(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      let rawDocName = 'test-doc';
      try {
        const raw = await readBody(req);
        if (raw.length > 0) {
          try {
            const body = JSON.parse(raw.toString()) as Record<string, unknown>;
            if (typeof body.docName === 'string' && body.docName.length > 0)
              rawDocName = body.docName;
          } catch {
            json(res, 400, { ok: false, error: 'Invalid JSON body' });
            return;
          }
        }
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }
      const docName = resolveAlias(rawDocName);
      if (isSystemDoc(docName)) {
        json(res, 400, { ok: false, error: `'${docName}' is a reserved document name` });
        return;
      }
      const dc = await sessionManager.getSession(docName);
      const um = sessionManager.getUndoManager(dc);
      if (!um.canUndo()) {
        json(res, 200, { ok: false, canUndo: false, canRedo: um.canRedo() });
        return;
      }
      um.undo();
      try {
        syncTextToFragment(dc.document);
      } catch (syncErr) {
        handleCompensationError(res, syncErr, () => um.redo(), 'agent-undo');
        return;
      }
      console.log('[agent-undo] Undo performed');
      json(res, 200, { ok: true, canUndo: um.canUndo(), canRedo: um.canRedo() });
    } catch (e) {
      console.error('[agent-undo]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  async function handleAgentRedo(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      let rawDocName = 'test-doc';
      try {
        const raw = await readBody(req);
        if (raw.length > 0) {
          try {
            const body = JSON.parse(raw.toString()) as Record<string, unknown>;
            if (typeof body.docName === 'string' && body.docName.length > 0)
              rawDocName = body.docName;
          } catch {
            json(res, 400, { ok: false, error: 'Invalid JSON body' });
            return;
          }
        }
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }
      const docName = resolveAlias(rawDocName);
      if (isSystemDoc(docName)) {
        json(res, 400, { ok: false, error: `'${docName}' is a reserved document name` });
        return;
      }
      const dc = await sessionManager.getSession(docName);
      const um = sessionManager.getUndoManager(dc);
      if (!um.canRedo()) {
        json(res, 200, { ok: false, canUndo: um.canUndo(), canRedo: false });
        return;
      }
      um.redo();
      try {
        syncTextToFragment(dc.document);
      } catch (syncErr) {
        handleCompensationError(res, syncErr, () => um.undo(), 'agent-redo');
        return;
      }
      console.log('[agent-redo] Redo performed');
      json(res, 200, { ok: true, canUndo: um.canUndo(), canRedo: um.canRedo() });
    } catch (e) {
      console.error('[agent-redo]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  async function handleTestReset(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const docName = resolveAlias(url.searchParams.get('docName') ?? 'test-doc');

      // Path traversal guard — reuse the canonical validator from persistence.ts.
      // Throws `Invalid document name: ${docName}` for names that escape contentDir;
      // we translate that to a 400 response. Keeping the guard in one place (not
      // re-implementing the startsWith check inline) ensures handleTestReset stays
      // in lock-step with persistence's onLoadDocument / onStoreDocument validators.
      let filePath: string;
      try {
        filePath = safeContentPath(docName, contentDir);
      } catch (err) {
        // Log the original error (safeContentPath produces messages like
        // `Invalid document name: ${docName}` which are useful for diagnosing
        // unexpected failures beyond the standard path-traversal case — e.g.,
        // encoding errors from resolve(), null-byte truncation, etc.) but
        // still return a sanitized, uniform 400 message to the client so
        // filesystem details never leak through the API boundary.
        console.error('[test-reset] safeContentPath rejected docName:', docName, err);
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }

      await sessionManager.closeAll(docName);
      hocuspocus.closeConnections(docName);

      // D18: Force-flush any pending onStoreDocument debounced work before unload.
      // Without this, unloadDocument silently no-ops if the debouncer is active
      // (Hocuspocus.shouldUnloadDocument returns false when isDebounced is true).
      const debounceId = `onStoreDocument-${docName}`;
      if (hocuspocus.debouncer.isDebounced(debounceId)) {
        await hocuspocus.debouncer.executeNow(debounceId);
      }

      const doc = hocuspocus.documents.get(docName);
      if (doc) await hocuspocus.unloadDocument(doc);
      writeFileSync(filePath, '', 'utf-8');
      if (backlinkIndex) {
        backlinkIndex.deleteDocument(docName);
        void backlinkIndex.saveToDisk().catch((err) => {
          console.warn(`[backlinks] Failed to persist cache after test-reset for ${docName}:`, err);
        });
      }
      json(res, 200, { ok: true });
    } catch (e) {
      console.error('[test-reset]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  async function handleSaveVersion(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    const shadow = shadowRef?.current;
    if (!shadow) {
      json(res, 400, { ok: false, error: 'Shadow repo not configured' });
      return;
    }

    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }

      // Parse optional writers from body
      const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
      let writers: WriterIdentity[] = [];
      if (rawBody.length > 0) {
        let body: Record<string, unknown>;
        try {
          body = JSON.parse(rawBody.toString()) as Record<string, unknown>;
        } catch {
          json(res, 400, { ok: false, error: 'Invalid JSON' });
          return;
        }
        if (Array.isArray(body.writers)) {
          writers = (body.writers as Array<Record<string, string>>).map((w) => {
            const id = w.id ?? 'unknown';
            if (!SAFE_ID_RE.test(id)) {
              throw new Error(`Invalid writer id: ${id}`);
            }
            return {
              id,
              name: (w.name ?? 'unknown').replace(/[\r\n]/g, ''),
              email: (w.email ?? 'noreply@openknowledge.local').replace(/[\r\n]/g, ''),
            };
          });
        }
      }

      // Default writer if none provided
      if (writers.length === 0) {
        writers = [
          { id: 'server', name: 'openknowledge-server', email: 'noreply@openknowledge.local' },
        ];
      }

      const resolvedContentRoot = contentRoot ?? 'content';
      const result = await saveVersion(shadow, projectRoot ?? null, resolvedContentRoot, writers);

      const projectRef = result.projectCommitSha
        ? `→ project commit ${result.projectCommitSha.slice(0, 8)}`
        : '(standalone)';
      console.log(`[shadow] checkpoint ${result.checkpointRef} ${projectRef}`);

      json(res, 200, {
        ok: true,
        projectCommitSha: result.projectCommitSha,
        checkpointRef: result.checkpointRef,
      });
    } catch (e) {
      console.error('[save-version]', e);
      json(res, 500, { ok: false, error: 'Internal server error' });
    }
  }

  // ── GET /api/history ─────────────────────────────────────────────────────
  async function handleHistory(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    const shadow = shadowRef?.current;
    if (!shadow) {
      json(res, 400, { ok: false, error: 'Shadow repo not configured' });
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const docName = url.searchParams.get('docName') ?? '';
    const branch = url.searchParams.get('branch') ?? 'main';

    if (branch.includes('..') || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch)) {
      json(res, 400, { error: 'Invalid branch name' });
      return;
    }

    const limit = Math.min(200, Number(url.searchParams.get('limit') ?? '50'));
    const offset = Number(url.searchParams.get('offset') ?? '0');
    const type = url.searchParams.get('type') ?? undefined;
    const author = url.searchParams.get('author') ?? undefined;
    const excludeAuthor = url.searchParams.get('excludeAuthor') ?? undefined;

    const t0 = Date.now();
    try {
      const resolvedContentRoot = contentRoot ?? 'content';
      const result = await getDocumentHistory(
        shadow,
        {
          docName,
          branch,
          limit,
          offset,
          type,
          author,
          excludeAuthor,
        },
        resolvedContentRoot,
      );

      const duration = Date.now() - t0;
      console.log(
        `[timeline] query docName=${docName} entries=${result.entries.length} duration=${duration}ms`,
      );

      json(res, 200, result);
    } catch (e) {
      console.error('[history]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  // ── GET /api/history/:sha ─────────────────────────────────────────────────
  async function handleHistoryVersion(
    req: IncomingMessage,
    res: ServerResponse,
    sha: string,
  ): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    const shadow = shadowRef?.current;
    if (!shadow) {
      json(res, 400, { ok: false, error: 'Shadow repo not configured' });
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const docName = url.searchParams.get('docName') ?? '';

    const resolvedContentRoot = contentRoot ?? 'content';
    const pathResult = safeDocPath(docName, resolvedContentRoot);
    if ('error' in pathResult) {
      json(res, 400, { error: pathResult.error });
      return;
    }
    const docPath = pathResult.path;
    const sg = shadowGit(shadow);

    // Validate SHA format
    if (!/^[0-9a-f]{40}$/i.test(sha)) {
      json(res, 400, { error: 'Invalid commit SHA' });
      return;
    }

    try {
      // Verify file exists at this commit
      try {
        await sg.raw('cat-file', '-e', `${sha}:${docPath}`);
      } catch {
        json(res, 404, { error: 'Document did not exist at this version' });
        return;
      }

      const content = await sg.raw('show', `${sha}:${docPath}`);

      // Resolve commit metadata
      const logLine = (await sg.raw('log', '-1', '--format=%aI%x00%an', sha)).trim();
      const [timestamp = '', author = ''] = logLine.split('\x00');

      json(res, 200, { sha, content, timestamp, author });
    } catch (e) {
      console.error('[history-version]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { error: message });
    }
  }

  // ── GET /api/diff ─────────────────────────────────────────────────────────
  async function handleDiff(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    const shadow = shadowRef?.current;
    if (!shadow) {
      json(res, 400, { ok: false, error: 'Shadow repo not configured' });
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const docName = url.searchParams.get('docName') ?? '';
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';

    if (!to || !/^[0-9a-f]{40}$/i.test(to)) {
      json(res, 400, { error: "'to' must be a valid 40-char commit SHA" });
      return;
    }

    const resolvedContentRoot = contentRoot ?? 'content';
    const pathResult = safeDocPath(docName, resolvedContentRoot);
    if ('error' in pathResult) {
      json(res, 400, { error: pathResult.error });
      return;
    }
    const docPath = pathResult.path;
    const sg = shadowGit(shadow);

    try {
      // Get "to" content
      let toContent: string;
      try {
        toContent = await sg.raw('show', `${to}:${docPath}`);
      } catch {
        json(res, 404, { error: 'Document did not exist at the target version' });
        return;
      }

      // Get "from" content — either a commit SHA or current Y.Doc text
      let fromContent: string;
      if (from && /^[0-9a-f]{40}$/i.test(from)) {
        try {
          fromContent = await sg.raw('show', `${from}:${docPath}`);
        } catch {
          json(res, 404, { error: 'Document did not exist at the source version' });
          return;
        }
      } else {
        // from omitted — read current Y.Doc content directly (avoids creating an agent session)
        const doc = hocuspocus.documents.get(docName);
        if (!doc) {
          json(res, 409, { error: 'Document is not currently open — open it in the editor first' });
          return;
        }
        fromContent = doc.getText('source').toString();
      }

      const changes = diffLines(fromContent, toContent);

      // Build full-file line array: every line annotated as added/removed/unchanged
      const lines: { type: 'added' | 'removed' | 'unchanged'; text: string }[] = [];
      let additions = 0;
      let deletions = 0;
      for (const change of changes) {
        const changeLines = change.value.replace(/\n$/, '').split('\n');
        const type = change.added ? 'added' : change.removed ? 'removed' : 'unchanged';
        for (const text of changeLines) {
          lines.push({ type, text });
        }
        if (change.added) additions += changeLines.length;
        if (change.removed) deletions += changeLines.length;
      }

      json(res, 200, { lines, additions, deletions });
    } catch (e) {
      console.error('[diff]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { error: message });
    }
  }

  // ── POST /api/rollback ────────────────────────────────────────────────────
  async function handleRollback(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    const shadow = shadowRef?.current;
    if (!shadow) {
      json(res, 400, { ok: false, error: 'Shadow repo not configured' });
      return;
    }

    let rawBody: Buffer;
    try {
      rawBody = await readBody(req);
    } catch {
      json(res, 413, { ok: false, error: 'Payload too large' });
      return;
    }

    let body: unknown;
    try {
      body = rawBody.length > 0 ? JSON.parse(rawBody.toString()) : {};
    } catch {
      json(res, 400, { ok: false, error: 'Invalid JSON' });
      return;
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      json(res, 400, { ok: false, error: 'Body must be a JSON object' });
      return;
    }

    const { docName: rawDocName, commitSha: rawSha } = body as Record<string, unknown>;
    const docName = typeof rawDocName === 'string' ? rawDocName : '';
    const commitSha = typeof rawSha === 'string' ? rawSha : '';

    if (!docName) {
      json(res, 400, { ok: false, error: 'docName required' });
      return;
    }
    if (!commitSha || !/^[0-9a-f]{40}$/i.test(commitSha)) {
      json(res, 400, { ok: false, error: 'commitSha must be a valid 40-char commit SHA' });
      return;
    }

    const resolvedContentRoot = contentRoot ?? 'content';
    const pathResult = safeDocPath(docName, resolvedContentRoot);
    if ('error' in pathResult) {
      json(res, 400, { ok: false, error: pathResult.error });
      return;
    }
    const docPath = pathResult.path;
    const sg = shadowGit(shadow);

    const t0 = Date.now();
    try {
      // Verify file exists at this commit
      try {
        await sg.raw('cat-file', '-e', `${commitSha}:${docPath}`);
      } catch {
        json(res, 404, { ok: false, error: 'Document did not exist at this version' });
        return;
      }

      const markdown = await sg.raw('show', `${commitSha}:${docPath}`);
      const timestamp = new Date().toISOString();

      // Apply to live Y.Doc via updateYFragment (L1 persistence fires normally)
      const document = hocuspocus.documents.get(docName);
      if (!document) {
        json(res, 409, {
          ok: false,
          error: 'Document is not currently open — open it in the editor first',
        });
        return;
      }

      const { body: mdBody } = stripFrontmatter(markdown);
      const parsedJson = mdManager.parse(mdBody);
      const pmNode = schema.nodeFromJSON(parsedJson);
      const xmlFragment = document.getXmlFragment('default');

      document.transact(() => {
        const meta = { mapping: new Map(), isOMark: new Map() };
        updateYFragment(document, xmlFragment, pmNode, meta);

        const ytext = document.getText('source');
        const currentText = ytext.toString();
        if (currentText !== markdown) {
          ytext.delete(0, currentText.length);
          ytext.insert(0, markdown);
        }
      }, ROLLBACK_ORIGIN);

      setReconciledBase(docName, markdown);

      // Force-flush L2 git commit so the restored version appears in the
      // timeline immediately, rather than waiting for the 30s debounce.
      if (flushGitCommit) {
        flushGitCommit().catch((e) => {
          console.warn('[rollback] flush git commit failed:', e);
        });
      }

      const duration = Date.now() - t0;
      console.log(
        `[rollback] docName=${docName} from=${commitSha.slice(0, 8)} duration=${duration}ms`,
      );

      json(res, 200, { ok: true, restoredFrom: commitSha, timestamp });
    } catch (e) {
      console.error('[rollback]', e);
      const message = e instanceof Error ? e.message : String(e);
      json(res, 500, { ok: false, error: message });
    }
  }

  async function handleMetricsReconciliation(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    json(res, 200, getMetrics());
  }

  /** 24h in milliseconds — rescue buffers older than this are excluded/cleaned. */
  const RESCUE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

  async function handleRescueList(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    if (!shadowRef?.current) {
      json(res, 200, []);
      return;
    }

    const rescueDir = resolve(shadowRef.current.gitDir, 'rescue');
    if (!existsSync(rescueDir)) {
      json(res, 200, []);
      return;
    }

    const now = Date.now();
    const entries: { docName: string; timestamp: string; size: number }[] = [];

    try {
      const files = readdirSync(rescueDir).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const filePath = resolve(rescueDir, file);
        const stat = statSync(filePath);
        const age = now - stat.mtimeMs;

        if (age > RESCUE_MAX_AGE_MS) {
          // Clean up expired rescue buffers
          try {
            unlinkSync(filePath);
          } catch (e) {
            console.debug('[rescue] cleanup failed (non-critical):', e);
          }
          continue;
        }

        entries.push({
          docName: file.replace(/\.md$/, ''),
          timestamp: stat.mtime.toISOString(),
          size: stat.size,
        });
      }
    } catch (e) {
      console.error('[rescue] Failed to list rescue buffers:', e);
    }

    json(res, 200, entries);
  }

  async function handleRescueGet(
    req: IncomingMessage,
    res: ServerResponse,
    docName: string,
  ): Promise<void> {
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    if (!shadowRef?.current) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const rescueBase = resolve(shadowRef.current.gitDir, 'rescue');
    const filePath = resolve(rescueBase, `${docName}.md`);
    if (!filePath.startsWith(`${rescueBase}/`)) {
      res.writeHead(400);
      res.end('Invalid document name');
      return;
    }
    if (!existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    // Check expiry
    const stat = statSync(filePath);
    if (Date.now() - stat.mtimeMs > RESCUE_MAX_AGE_MS) {
      try {
        unlinkSync(filePath);
      } catch {
        // ignore
      }
      res.writeHead(404);
      res.end('Not found — rescue buffer expired');
      return;
    }

    const content = readFileSync(filePath, 'utf-8');
    res.writeHead(200, {
      'Content-Type': 'text/markdown',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(content);
  }

  async function handleCreatePage(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }
      let body: unknown;
      try {
        body = JSON.parse(rawBody.toString());
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        json(res, 400, { ok: false, error: 'Body must be a JSON object' });
        return;
      }
      const { path: filePath } = body as Record<string, unknown>;
      if (!filePath || typeof filePath !== 'string' || filePath.length === 0) {
        json(res, 400, { ok: false, error: 'path is required' });
        return;
      }
      if (!filePath.endsWith('.md')) {
        json(res, 400, { ok: false, error: 'path must end with .md' });
        return;
      }
      if (
        filePath.includes('..') ||
        filePath.startsWith('/') ||
        filePath.includes('\x00') ||
        filePath.includes('\\')
      ) {
        json(res, 400, { ok: false, error: 'path must not contain .. or start with /' });
        return;
      }
      const resolvedContentDir = resolve(contentDir);
      const fullPath = resolve(resolvedContentDir, filePath);
      if (!fullPath.startsWith(`${resolvedContentDir}/`) && fullPath !== resolvedContentDir) {
        json(res, 400, { ok: false, error: 'path must not escape content directory' });
        return;
      }
      const candidateDocName = filePath.slice(0, -3);
      if (isSystemDoc(candidateDocName)) {
        json(res, 400, { ok: false, error: `'${candidateDocName}' is a reserved document name` });
        return;
      }
      mkdirSync(dirname(fullPath), { recursive: true });
      try {
        writeFileSync(fullPath, '', { encoding: 'utf-8', flag: 'wx' });
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
          json(res, 409, { ok: false, error: 'File already exists' });
          return;
        }
        throw err;
      }
      const docName = filePath.slice(0, -3);
      json(res, 200, { ok: true, docName });
    } catch (e) {
      console.error('[create-page]', e);
      json(res, 500, { ok: false, error: 'Failed to create page' });
    }
  }

  async function handlePageHeadings(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    try {
      const url = new URL(req.url ?? '', 'http://localhost');
      const docName = url.searchParams.get('docName');
      if (!docName || typeof docName !== 'string' || docName.length === 0) {
        json(res, 400, { ok: false, error: 'Missing docName parameter' });
        return;
      }
      if (!isSafeDocName(docName)) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      const filePath = resolveDocPath(docName);
      if (!filePath) {
        json(res, 400, { ok: false, error: 'Invalid docName' });
        return;
      }
      if (!existsSync(filePath)) {
        json(res, 404, { ok: false, error: 'Page not found' });
        return;
      }
      const content = readFileSync(filePath, 'utf-8');
      const headings = extractHeadings(content);
      json(res, 200, { ok: true, docName, headings });
    } catch (e) {
      console.error('[page-headings]', e);
      json(res, 500, { ok: false, error: 'Failed to read headings' });
    }
  }

  async function handleRenamePath(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }

      let body: unknown;
      try {
        body = JSON.parse(rawBody.toString());
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        json(res, 400, { ok: false, error: 'Body must be a JSON object' });
        return;
      }

      const { kind, fromPath, toPath } = body as Record<string, unknown>;
      if (kind !== 'file' && kind !== 'folder') {
        json(res, 400, { ok: false, error: 'kind must be "file" or "folder"' });
        return;
      }
      if (typeof fromPath !== 'string' || typeof toPath !== 'string') {
        json(res, 400, { ok: false, error: 'fromPath and toPath are required' });
        return;
      }
      if (!isValidRelativeContentPath(fromPath) || !isValidRelativeContentPath(toPath)) {
        json(res, 400, { ok: false, error: 'Paths must be relative content paths' });
        return;
      }
      if (fromPath === toPath) {
        json(res, 200, { ok: true, renamed: [] });
        return;
      }

      const sourcePath = resolveContentEntryPath(contentDir, kind, fromPath);
      const destinationPath = resolveContentEntryPath(contentDir, kind, toPath);

      if (!existsSync(sourcePath)) {
        json(res, 404, { ok: false, error: `${kind} does not exist` });
        return;
      }
      if (existsSync(destinationPath)) {
        json(res, 409, { ok: false, error: 'Destination already exists' });
        return;
      }

      const sourceStat = statSync(sourcePath);
      if (
        (kind === 'file' && !sourceStat.isFile()) ||
        (kind === 'folder' && !sourceStat.isDirectory())
      ) {
        json(res, 400, { ok: false, error: `Source path is not a ${kind}` });
        return;
      }

      const affectedDocNames = listAffectedDocNames(getFileIndex(), kind, fromPath);
      const renamed: RenamedDocMapping[] =
        kind === 'file'
          ? [{ fromDocName: fromPath, toDocName: toPath }]
          : affectedDocNames.map((docName) => ({
              fromDocName: docName,
              toDocName: remapDocNameForRename(docName, kind, fromPath, toPath),
            }));

      const liveContents = await captureAndCloseDocuments(
        renamed.map(({ fromDocName }) => fromDocName),
      );

      mkdirSync(dirname(destinationPath), { recursive: true });
      renameSync(sourcePath, destinationPath);
      syncRenamedDocsToDisk(renamed, liveContents);

      json(res, 200, { ok: true, renamed });
    } catch (e) {
      console.error('[rename-path]', e);
      json(res, 500, { ok: false, error: 'Failed to rename path' });
    }
  }

  async function handleDeletePath(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    try {
      let rawBody: Buffer;
      try {
        rawBody = await readBody(req);
      } catch {
        json(res, 413, { ok: false, error: 'Payload too large' });
        return;
      }

      let body: unknown;
      try {
        body = JSON.parse(rawBody.toString());
      } catch {
        json(res, 400, { ok: false, error: 'Invalid JSON' });
        return;
      }

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        json(res, 400, { ok: false, error: 'Body must be a JSON object' });
        return;
      }

      const { kind, path } = body as Record<string, unknown>;
      if (kind !== 'file' && kind !== 'folder') {
        json(res, 400, { ok: false, error: 'kind must be "file" or "folder"' });
        return;
      }
      if (typeof path !== 'string' || !isValidRelativeContentPath(path)) {
        json(res, 400, { ok: false, error: 'path must be a relative content path' });
        return;
      }

      const targetPath = resolveContentEntryPath(contentDir, kind, path);
      if (!existsSync(targetPath)) {
        json(res, 404, { ok: false, error: `${kind} does not exist` });
        return;
      }

      const targetStat = statSync(targetPath);
      if (
        (kind === 'file' && !targetStat.isFile()) ||
        (kind === 'folder' && !targetStat.isDirectory())
      ) {
        json(res, 400, { ok: false, error: `Target path is not a ${kind}` });
        return;
      }

      const deletedDocNames =
        kind === 'file' ? [path] : listAffectedDocNames(getFileIndex(), kind, path);

      await captureAndCloseDocuments(deletedDocNames);

      if (kind === 'file') {
        unlinkSync(targetPath);
      } else {
        rmSync(targetPath, { recursive: true, force: false });
      }

      json(res, 200, { ok: true, deletedDocNames });
    } catch (e) {
      console.error('[delete-path]', e);
      json(res, 500, { ok: false, error: 'Failed to delete path' });
    }
  }

  async function handlePages(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }
    try {
      const index = getFileIndex();
      const pages: { docName: string; title: string }[] = [];
      for (const [docName] of index) {
        let title = docName;
        try {
          const filePath = resolve(contentDir, `${docName}.md`);
          const content = readFileSync(filePath, 'utf-8');
          title = extractPageTitle(content, docName);
        } catch (err) {
          console.warn(`[pages] Failed to read title for ${docName}:`, err);
        }
        pages.push({ docName, title });
      }
      pages.sort((a, b) => a.docName.localeCompare(b.docName));
      json(res, 200, { ok: true, pages });
    } catch (e) {
      console.error('[pages]', e);
      json(res, 500, { ok: false, error: 'Failed to list pages' });
    }
  }

  async function handleUploadImage(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }

    let uploadResult: UploadResult | undefined;
    try {
      uploadResult = await readUploadBody(req, MAX_UPLOAD_BYTES);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message === 'Payload too large') {
        json(res, 413, { ok: false, error: 'Payload too large' });
      } else if (message === 'No file received') {
        json(res, 400, { ok: false, error: 'No file received' });
      } else {
        json(res, 400, { ok: false, error: `Failed to parse upload: ${message}` });
      }
      return;
    }

    const { filename, buffer, parentDocName } = uploadResult;

    if (!parentDocName) {
      json(res, 400, { ok: false, error: 'parentDocName is required' });
      return;
    }

    // D15: reject path-escape attempts
    if (
      parentDocName.includes('\x00') ||
      parentDocName.includes('..') ||
      parentDocName.startsWith('/')
    ) {
      json(res, 400, { ok: false, error: 'path-escape' });
      return;
    }

    const resolvedContentDir = resolve(contentDir);
    const destDir = resolve(resolvedContentDir, dirname(parentDocName));
    if (!isWithinContentDir(destDir, resolvedContentDir)) {
      json(res, 400, { ok: false, error: 'path-escape' });
      return;
    }

    // Symlink escape check: realpath the dest dir and compare against realpath'd contentDir
    try {
      const realDestDir = realpathSync(destDir);
      let realContentDir: string;
      try {
        realContentDir = realpathSync(resolvedContentDir);
      } catch {
        realContentDir = resolvedContentDir;
      }
      if (!isWithinContentDir(realDestDir, realContentDir)) {
        json(res, 400, { ok: false, error: 'path-escape' });
        return;
      }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        // Directory doesn't exist yet — will be created below; no symlink escape possible
      } else {
        json(res, 400, { ok: false, error: 'path-escape' });
        return;
      }
    }

    // Magic bytes check — ignore the client-supplied mimeType entirely
    const fileTypeResult = await fileTypeFromBuffer(buffer);
    let detectedMime: string | undefined = fileTypeResult?.mime;
    let detectedExt: string | undefined = fileTypeResult?.ext;
    // file-type can't detect SVG (text-based, no magic bytes) — check manually
    if (!detectedMime) {
      const head = buffer.subarray(0, 256).toString('utf-8').trimStart();
      if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) {
        detectedMime = 'image/svg+xml';
        detectedExt = 'svg';
      }
    }
    if (!detectedMime || !detectedExt || !ALLOWED_MIME_TYPES.has(detectedMime)) {
      json(res, 400, {
        ok: false,
        error: `Unsupported file type${detectedMime ? `: ${detectedMime}` : ''}`,
      });
      return;
    }

    // D8: detect clipboard paste (generic/empty filename) → timestamp stem
    let finalFilename: string;
    if (!filename || filename === 'upload' || GENERIC_PASTE_NAMES.test(filename)) {
      const now = new Date();
      const ts = now
        .toISOString()
        .replace(/[-:T]/g, '')
        .slice(0, 14)
        .replace(/(\d{8})(\d{6})/, '$1-$2');
      finalFilename = `pasted-${ts}.${detectedExt}`;
    } else {
      finalFilename = sanitizeFilename(filename);
    }

    mkdirSync(destDir, { recursive: true });

    try {
      const destFilename = writeUploadAtomic(destDir, finalFilename, buffer);
      const relPath = relative(contentDir, resolve(destDir, destFilename));
      console.log(`[upload] ok ${relPath} ${buffer.length}`);
      json(res, 200, { ok: true, src: destFilename });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[upload] error ${finalFilename} ${buffer.length} ${message}`);
      json(res, 500, { ok: false, error: 'Failed to save file' });
    }
  }

  const routes: Record<string, (req: IncomingMessage, res: ServerResponse) => Promise<void>> = {
    '/api/document': handleDocumentRead,
    '/api/documents': handleDocumentList,
    '/api/backlinks': handleBacklinks,
    '/api/forward-links': handleForwardLinks,
    '/api/link-graph': handleLinkGraph,
    '/api/orphans': handleOrphans,
    '/api/hubs': handleHubs,
    '/api/pages': handlePages,
    '/api/page-headings': handlePageHeadings,
    '/api/create-page': handleCreatePage,
    '/api/rename-path': handleRenamePath,
    '/api/delete-path': handleDeletePath,
    '/api/upload-image': handleUploadImage,
    '/api/agent-write': handleAgentWrite,
    '/api/agent-write-md': handleAgentWriteMd,
    '/api/agent-patch': handleAgentPatch,
    '/api/agent-undo-status': handleAgentUndoStatus,
    '/api/agent-undo': handleAgentUndo,
    '/api/agent-redo': handleAgentRedo,
    '/api/save-version': handleSaveVersion,
    '/api/history': handleHistory,
    '/api/diff': handleDiff,
    '/api/rollback': handleRollback,
    '/api/metrics/reconciliation': handleMetricsReconciliation,
    '/api/rescue': handleRescueList,
  };

  if (enableTestRoutes) {
    routes['/api/test-reset'] = handleTestReset;
  }

  return {
    priority: 100, // Higher priority — API routes run before static file serving
    async onRequest({ request, response }: { request: IncomingMessage; response: ServerResponse }) {
      const url = request.url?.split('?')[0];
      if (!url) return;

      // Static routes
      const handler = routes[url];
      if (handler) {
        await handler(request, response);
        return;
      }

      // Dynamic routes
      if (url.startsWith('/api/rescue/')) {
        const docName = decodeURIComponent(url.slice('/api/rescue/'.length));
        if (docName) {
          await handleRescueGet(request, response, docName);
        }
        return;
      }

      if (url.startsWith('/api/history/')) {
        const sha = decodeURIComponent(url.slice('/api/history/'.length));
        if (sha) {
          await handleHistoryVersion(request, response, sha);
        }
        return;
      }
    },
  };
}
