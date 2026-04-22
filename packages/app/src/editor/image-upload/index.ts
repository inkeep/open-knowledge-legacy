import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { toast } from 'sonner';

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

let currentDocName: string | null = null;

export function setCurrentDocName(docName: string | null): void {
  currentDocName = docName;
}

// SPEC §6 FR-5 defaults — mirrors core's UploadConfigSchema. Hardcoded
// here so the client emit dispatch works without a per-request config
// fetch. Operator tunability (overriding these via /api/config) is a
// follow-on; today the schema defaults are the user-facing contract.
const DEFAULT_WIKI_EMBED_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'svg',
  'pdf',
  'mp4',
  'webm',
  'mov',
  'mp3',
  'wav',
  'ogg',
  'm4a',
]);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg']);
const DEFAULT_EMIT_FORMAT: 'wikiembed' | 'markdown-image' = 'wikiembed';

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx === -1 ? '' : filename.slice(idx + 1).toLowerCase();
}

interface InsertShape {
  kind: 'wikiembed' | 'image' | 'markdown-link';
  ext: string;
}

function pickInsertShape(filename: string): InsertShape {
  const ext = extensionOf(filename);
  if (DEFAULT_WIKI_EMBED_EXTENSIONS.has(ext)) {
    if (DEFAULT_EMIT_FORMAT === 'wikiembed') return { kind: 'wikiembed', ext };
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
  const parentDocName = currentDocName ? `${currentDocName}.md` : '';
  if (!parentDocName) {
    toast.error('Cannot upload: no document is open');
    return;
  }
  const uploadId = crypto.randomUUID();

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
    if (body.error === 'maxBytes') {
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

  // SPEC §6 FR-2 / D-B: dedup toast (default 'toast' ui mode). Operator
  // tunability for 'silent' / 'confirm' is a follow-on.
  if (deduped) {
    const displayPath = parentDir(parentDocName) ? `${parentDir(parentDocName)}/${src}` : src;
    toast(`Already at ${displayPath} — reusing.`);
  }

  const shape = pickInsertShape(file.name);

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
