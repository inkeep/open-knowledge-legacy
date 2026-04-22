import {
  DEFAULT_UPLOAD_CONFIG,
  IMAGE_EXTENSIONS,
  type UploadConfig,
} from '@inkeep/open-knowledge-core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { toast } from 'sonner';
import { getEditorDocName } from '../extensions/doc-context.ts';

const uploadPluginKey = new PluginKey<UploadPluginState>('imageUpload');

interface UploadPluginState {
  decorations: DecorationSet;
  uploads: Map<string, number>;
}

function createSkeletonWidget(): HTMLElement {
  const el = document.createElement('div');
  el.className =
    'image-upload-skeleton w-full h-40 rounded-md bg-muted animate-pulse motion-reduce:animate-none my-2';
  el.setAttribute('data-upload-widget', 'loading');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Uploading image...');
  return el;
}

type UploadMeta =
  | { type: 'add'; id: string; pos: number; widget: HTMLElement }
  | { type: 'remove'; id: string };

export const uploadDecorationPlugin = new Plugin<UploadPluginState>({
  key: uploadPluginKey,

  state: {
    init() {
      return { decorations: DecorationSet.empty, uploads: new Map() };
    },

    apply(tr, prev) {
      const mappedDecorations = prev.decorations.map(tr.mapping, tr.doc);
      const mappedUploads = new Map<string, number>();
      for (const [id, pos] of prev.uploads) {
        mappedUploads.set(id, tr.mapping.map(pos));
      }

      const meta = tr.getMeta(uploadPluginKey) as UploadMeta | undefined;
      if (!meta) {
        return { decorations: mappedDecorations, uploads: mappedUploads };
      }

      if (meta.type === 'add') {
        const deco = Decoration.widget(meta.pos, meta.widget, {
          id: meta.id,
          stopEvent: () => true,
        });
        const newDecorations = mappedDecorations.add(tr.doc, [deco]);
        const newUploads = new Map(mappedUploads);
        newUploads.set(meta.id, tr.mapping.map(meta.pos));
        return { decorations: newDecorations, uploads: newUploads };
      }

      if (meta.type === 'remove') {
        const toRemove = mappedDecorations.find(
          undefined,
          undefined,
          (spec) => spec.id === meta.id,
        );
        const newDecorations = mappedDecorations.remove(toRemove);
        const newUploads = new Map(mappedUploads);
        newUploads.delete(meta.id);
        return { decorations: newDecorations, uploads: newUploads };
      }

      return { decorations: mappedDecorations, uploads: mappedUploads };
    },
  },

  props: {
    decorations(state) {
      return uploadPluginKey.getState(state)?.decorations ?? DecorationSet.empty;
    },
  },
});

function parentDir(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

function splitSegments(p: string): string[] {
  return p.split('/').filter((s) => s !== '');
}

/**
 * SPEC §6 FR-1a / F8: 4-case relative-path emit.
 *   1. same-dir → bare basename
 *   2. asset is in an ancestor of doc dir → `../<asset>`
 *   3. asset is in a subtree of doc dir → `./<sub>/<asset>`
 *   4. cross-tree → `../...../<asset>`
 *
 * Both inputs are contentDir-relative posix paths. Output is the minimal
 * relative reference from `mdPath`'s dirname to `assetPath`.
 */
export function shortestImageRef(assetPath: string, mdPath: string): string {
  const assetDir = parentDir(assetPath);
  const mdDir = parentDir(mdPath);
  const assetName = basename(assetPath);
  if (assetDir === mdDir) return assetName;

  const fromParts = splitSegments(mdDir);
  const toParts = splitSegments(assetDir);
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common++;
  }
  const ups = fromParts.length - common;
  const downs = toParts.slice(common);
  if (ups === 0) {
    // mdDir is an ancestor of assetDir — pure descent, prefix `./`.
    return `./${[...downs, assetName].join('/')}`;
  }
  return [...new Array(ups).fill('..'), ...downs, assetName].join('/');
}

/**
 * Resolve the doc name for an in-progress upload from the WeakMap the
 * TiptapEditor mount effect populates. Reading from a per-editor
 * registry — not a module-level singleton — is the race-safe choice
 * for `EditorActivityPool`: up to `ACTIVITY_MOUNT_LIMIT` editors mount
 * concurrently, and Activity-hidden editors do not unmount. A module-
 * level `currentDocName` would reflect whichever mount effect ran most
 * recently, not the user-active editor.
 */
function docNameFromEditor(editor: Editor): string | null {
  return getEditorDocName(editor);
}

// US-015: live `upload.*` config, fetched from `/api/upload-config` on
// first upload. DEFAULT_UPLOAD_CONFIG is the fallback until the fetch
// resolves — mirrors the cli's Zod schema default so behavior at t=0 is
// the same as a fresh config.yml with no `upload` section.
let cachedUploadConfig: UploadConfig = DEFAULT_UPLOAD_CONFIG;
let uploadConfigFetchInFlight: Promise<UploadConfig> | null = null;

/**
 * Lightweight runtime validation at the network boundary. The dev plugin
 * parses YAML without Zod (monorepo layering — an app→cli dep would
 * invert packaging), so "the server always returns a valid UploadConfig"
 * is only true on the `ok start` path. A misconfigured proxy, a future
 * server bug, or a Cloudflare-style 401 body poisoning could otherwise
 * overwrite `cachedUploadConfig` with a shape that crashes
 * `pickInsertShape` on the next upload. Narrow gate.
 */
function isUploadConfig(x: unknown): x is UploadConfig {
  if (!x || typeof x !== 'object') return false;
  const c = x as Record<string, unknown>;
  const dedup = c.dedup as Record<string, unknown> | null | undefined;
  return (
    typeof c.maxBytes === 'number' &&
    Array.isArray(c.wikiEmbedExtensions) &&
    c.wikiEmbedExtensions.every((e) => typeof e === 'string') &&
    typeof dedup === 'object' &&
    dedup !== null &&
    typeof dedup.mode === 'string' &&
    typeof dedup.ui === 'string'
  );
}

async function fetchUploadConfig(): Promise<UploadConfig> {
  try {
    const res = await fetch('/api/upload-config', { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      // Reset the in-flight slot so a later upload can retry instead of
      // holding the rejected promise forever (it resolves to
      // cachedUploadConfig, but that's brittle if caching semantics change).
      uploadConfigFetchInFlight = null;
      return cachedUploadConfig;
    }
    const body: unknown = await res.json();
    if (!isUploadConfig(body)) {
      console.warn('[upload] /api/upload-config returned malformed body; keeping cached shape');
      uploadConfigFetchInFlight = null;
      return cachedUploadConfig;
    }
    cachedUploadConfig = body;
    return body;
  } catch {
    // Transient failures (network blip, server mid-restart) shouldn't
    // poison the cache for the entire session — drop the in-flight slot
    // so the next upload retries from scratch.
    uploadConfigFetchInFlight = null;
    return cachedUploadConfig;
  }
}

/**
 * Ensure `cachedUploadConfig` reflects the server-resolved config before
 * emit-dispatch runs. De-duplicates concurrent uploads onto one fetch.
 */
async function ensureUploadConfig(): Promise<UploadConfig> {
  if (!uploadConfigFetchInFlight) {
    uploadConfigFetchInFlight = fetchUploadConfig();
  }
  return uploadConfigFetchInFlight;
}

/** Test hook: seed the cached config so unit tests can exercise emit shapes without a fetch. */
export function setUploadConfigForTests(cfg: UploadConfig): void {
  cachedUploadConfig = cfg;
  uploadConfigFetchInFlight = Promise.resolve(cfg);
}

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? '' : filename.slice(idx + 1).toLowerCase();
}

interface InsertShape {
  kind: 'wikiembed' | 'image' | 'markdown-link';
  ext: string;
}

export function pickInsertShape(filename: string, config: UploadConfig): InsertShape {
  const ext = extensionOf(filename);
  const wikiEmbedSet = new Set(config.wikiEmbedExtensions.map((e) => e.toLowerCase()));
  if (wikiEmbedSet.has(ext)) {
    if (config.emitFormat === 'wikiembed') return { kind: 'wikiembed', ext };
    return IMAGE_EXTENSIONS.has(ext) ? { kind: 'image', ext } : { kind: 'markdown-link', ext };
  }
  return { kind: 'markdown-link', ext };
}

interface UploadResponseBody {
  ok?: boolean;
  src?: string;
  deduped?: boolean;
  error?: string;
  message?: string;
  attemptedBytes?: number;
  maxBytes?: number;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return `${bytes} bytes`;
  if (bytes < 1024) return `${bytes} bytes`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export async function uploadAndInsert(
  file: File,
  editor: Editor,
  insertPos: number,
): Promise<void> {
  const docName = docNameFromEditor(editor);
  const parentDocName = docName ? `${docName}.md` : '';
  if (!parentDocName) {
    toast.error('Cannot upload: no document is open');
    return;
  }
  const uploadId = crypto.randomUUID();
  // Prime the upload-config cache before dispatch so emit-shape honors
  // operator overrides (US-015). Fire-and-forget the first time; later
  // uploads reuse the cached value.
  const uploadConfig = await ensureUploadConfig();

  const skeletonWidget = createSkeletonWidget();
  editor.view.dispatch(
    editor.state.tr.setMeta(uploadPluginKey, {
      type: 'add',
      id: uploadId,
      pos: insertPos,
      widget: skeletonWidget,
    }),
  );

  const formData = new FormData();
  formData.append('file', file);
  formData.append('parentDocName', parentDocName);

  let res: Response;
  try {
    res = await fetch('/api/upload', { method: 'POST', body: formData });
  } catch (networkError) {
    console.error('[uploadAndInsert] Network error:', networkError);
    showError(editor, uploadId);
    return;
  }

  let body: UploadResponseBody = {};
  try {
    body = (await res.json()) as UploadResponseBody;
  } catch {
    // body parse failure handled below
  }

  if (!res.ok) {
    let message = body.error ?? `Upload failed (${res.status})`;
    // SPEC P1.3: byte-size-specific message naming both attempted size
    // and configured limit. Server populates `message` with the human-
    // readable form; fall through to a generic shape only if it didn't.
    if (body.error === 'max-bytes' || body.error === 'maxBytes') {
      if (typeof body.message === 'string') {
        message = body.message;
      } else if (typeof body.maxBytes === 'number') {
        const attempted =
          typeof body.attemptedBytes === 'number'
            ? formatBytes(body.attemptedBytes)
            : `${formatBytes(file.size)} (this file)`;
        message = `File is ${attempted} but the upload limit is ${formatBytes(body.maxBytes)}.`;
      }
    }
    console.error('[uploadAndInsert] Server error:', message);
    showError(editor, uploadId, message);
    return;
  }

  if (typeof body.src !== 'string') {
    console.error('[uploadAndInsert] Response missing src:', body);
    showError(editor, uploadId);
    return;
  }

  const src = body.src;
  const deduped = body.deduped === true;

  // SPEC §6 FR-2 / D-B: dedup toast. `silent` suppresses the toast
  // entirely; `toast` (default) shows the reusing message. `confirm` is
  // reserved for a future blocking dialog — today it falls through to
  // the toast shape so behavior is never worse than the default.
  if (deduped && uploadConfig.dedup.ui !== 'silent') {
    const displayPath = parentDir(parentDocName) ? `${parentDir(parentDocName)}/${src}` : src;
    toast(`Already at ${displayPath} — reusing.`);
  }

  const shape = pickInsertShape(file.name, uploadConfig);

  const { state } = editor;
  const pluginState = uploadPluginKey.getState(state);
  const mappedPos = pluginState?.uploads.get(uploadId) ?? insertPos;

  const tr = state.tr.setMeta(uploadPluginKey, { type: 'remove', id: uploadId });

  if (shape.kind === 'wikiembed') {
    const node = state.schema.nodes.wikiLinkEmbed;
    if (!node) {
      console.error('[uploadAndInsert] wikiLinkEmbed node missing from schema');
      showError(editor, uploadId);
      return;
    }
    tr.insert(mappedPos, node.create({ target: src, alias: null, anchor: null }));
  } else if (shape.kind === 'image') {
    const imageNode = state.schema.nodes.image;
    if (!imageNode) {
      console.error('[uploadAndInsert] image node missing from schema');
      showError(editor, uploadId);
      return;
    }
    const alt = file.name.replace(/\.[^.]+$/, '');
    const relPath = shortestImageRef(`${parentDir(parentDocName)}/${src}`, parentDocName);
    tr.insert(mappedPos, imageNode.create({ src: relPath, alt }));
  } else {
    // Markdown-link fallback: insert text + link mark.
    const linkMark = state.schema.marks.link;
    const relPath = shortestImageRef(`${parentDir(parentDocName)}/${src}`, parentDocName);
    if (linkMark) {
      const text = state.schema.text(file.name, [linkMark.create({ href: relPath })]);
      tr.insert(mappedPos, text);
    } else {
      tr.insert(mappedPos, state.schema.text(file.name));
    }
  }

  editor.view.dispatch(tr);
}

function showError(editor: Editor, uploadId: string, message?: string): void {
  editor.view.dispatch(editor.state.tr.setMeta(uploadPluginKey, { type: 'remove', id: uploadId }));
  toast.error(message ?? 'Upload failed');
}
