import {
  AUDIO_EXTENSIONS,
  DEFAULT_DEDUP_UI,
  DEFAULT_EMIT_FORMAT,
  extensionOf,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  WIKI_EMBED_EXTENSIONS,
} from '@inkeep/open-knowledge-core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { toast } from 'sonner';
import { getEditorDocName } from '../extensions/doc-context.ts';
import { buildUnresolvedWikiLinkAttrs } from '../extensions/wiki-link-helpers.ts';
import { getDescriptor } from '../registry/index.ts';
import { focusInsertedComponent } from '../slash-command/component-items.tsx';

const uploadPluginKey = new PluginKey<UploadPluginState>('imageUpload');

interface UploadPluginState {
  decorations: DecorationSet;
  uploads: Map<string, number>;
}

function createSkeletonWidget(file?: File): HTMLElement {
  const el = document.createElement('div');
  el.className =
    'image-upload-skeleton w-full h-40 rounded-md bg-muted animate-pulse motion-reduce:animate-none my-2';
  el.setAttribute('data-upload-widget', 'loading');
  el.setAttribute('role', 'status');
  // WCAG 4.1.2: the announced label must reflect what is actually
  // uploading. The widget is used for every file type (PDF / ZIP /
  // MP4 / CSV / etc.), so a generic "Uploading image..." would
  // misdescribe every non-image upload.
  el.setAttribute('aria-label', file?.name ? `Uploading ${file.name}…` : 'Uploading file…');
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

interface InsertShape {
  kind: 'wikiembed' | 'jsx-img' | 'jsx-video' | 'jsx-audio' | 'markdown-link' | 'wiki-link';
  ext: string;
}

/**
 * Build the PM `jsxComponent` node data for a freshly uploaded media asset
 * (`<img>` / `<video>` / `<audio>`). Pure factory — no editor, no schema
 * dependency — so the drop-time shape can be pinned by unit test against
 * the parser's shape for the same source markdown.
 *
 * Invariant: this shape MUST be structurally compatible with what
 * `mdManager.parse('<img src="/x.png" alt="" />')` etc. produces. Drift here
 * fragments the editor between drop-time and reload-time PM trees — a
 * prop-edit on a freshly dropped node would round-trip differently than a
 * prop-edit on the same node after reload. The test in
 * `media-drop-shape-invariant.test.ts` (co-located here in
 * `packages/app/src/editor/image-upload/`) pins both directions.
 *
 * `props` carries only the user-visible inputs that distinguish a fresh
 * drop — `src` for everything, `alt: ""` for `<img>` (HTML accessibility
 * semantic), `controls: true` for `<video>` / `<audio>` (mirrors the
 * user-stated success criterion `<video src controls />`). Leaving the rest
 * unset prevents `emitMdxJsx` from emitting a wall of `attr=""` defaults;
 * the PropPanel still surfaces every canonical-prop field because it
 * iterates `descriptor.props`, not `node.attrs.props`.
 */
export function buildMediaJsxNodeData(
  kind: 'jsx-img' | 'jsx-video' | 'jsx-audio',
  resolvedSrc: string,
): {
  type: 'jsxComponent';
  attrs: {
    componentName: 'img' | 'video' | 'audio';
    kind: 'element';
    attributes: never[];
    sourceRaw: '';
    sourceDirty: true;
    props: Record<string, unknown>;
  };
} {
  const componentName = kind === 'jsx-img' ? 'img' : kind === 'jsx-video' ? 'video' : 'audio';
  const props: Record<string, unknown> =
    kind === 'jsx-img' ? { src: resolvedSrc, alt: '' } : { src: resolvedSrc, controls: true };
  return {
    type: 'jsxComponent',
    attrs: {
      componentName,
      kind: 'element',
      attributes: [],
      sourceRaw: '',
      sourceDirty: true,
      props,
    },
  };
}

/**
 * Choose the PM insert shape for a freshly uploaded file. Dispatches by
 * extension against the fixed media-extension constants
 * (`IMAGE_EXTENSIONS` / `VIDEO_EXTENSIONS` / `AUDIO_EXTENSIONS` /
 * `WIKI_EMBED_EXTENSIONS`) — zero user-facing upload config. Markdown
 * files are OK docs (wiki-link semantic), not assets.
 *
 * Image / video / audio extensions emit the canonical lowercase JSX shapes
 * (`<img>` / `<video>` / `<audio>`) so drag/drop/paste converges with the
 * slash-menu insert path on `Image.tsx` / `Video.tsx` / `Audio.tsx` (zoom +
 * PropPanel + full canonical-prop surface). Remaining wiki-embed extensions
 * (pdf — no descriptor) keep the wiki-embed fallback per the
 * "keep as wiki-link if no descriptor" principle.
 */
export function pickInsertShape(filename: string): InsertShape {
  const ext = extensionOf(filename);
  // Markdown files are first-class OK docs, not opaque assets. Emit [[foo]]
  // (link semantic) — `![[foo.md]]` would imply transclusion, which OK
  // doesn't support.
  if (ext === 'md' || ext === 'mdx') {
    return { kind: 'wiki-link', ext };
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return { kind: 'jsx-img', ext };
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return { kind: 'jsx-video', ext };
  }
  if (AUDIO_EXTENSIONS.has(ext)) {
    return { kind: 'jsx-audio', ext };
  }
  if (WIKI_EMBED_EXTENSIONS.has(ext)) {
    if (DEFAULT_EMIT_FORMAT === 'wikiembed') return { kind: 'wikiembed', ext };
    return { kind: 'markdown-link', ext };
  }
  return { kind: 'markdown-link', ext };
}

interface UploadResponseBody {
  ok?: boolean;
  /** Filename (basename only) of the written/existing asset. */
  src?: string;
  /**
   * ContentDir-relative path the server actually wrote to. Reflects
   * `upload.attachmentFolderPath` — for default `"./"` this is
   * `<docDir>/<src>`, but for `attachmentFolderPath: 'attachments'` it's
   * `attachments/<src>` regardless of doc location. Clients MUST prefer
   * `path` over `src` when emitting the reference, otherwise non-default
   * attachmentFolderPath configurations produce broken relative refs.
   */
  path?: string;
  deduped?: boolean;
  error?: string;
  message?: string;
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

  const skeletonWidget = createSkeletonWidget(file);
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
    // Server-side reasons the upload rejects a request
    // (`malformed-upload`, `storage-full`, `storage-readonly`,
    // `collision-exhaustion`, etc. — see `UploadWriteReason` in
    // `packages/server/src/upload-errors.ts`) all populate `message` with
    // a human-readable form. Fall through to a generic shape only if the
    // response lacks one.
    const message = body.message ?? body.error ?? `Upload failed (${res.status})`;
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
  // Major-1 fix: prefer the server-returned `path` (contentDir-relative)
  // so non-default `upload.attachmentFolderPath` values — Obsidian-style
  // global paths like `attachments`, bare-name, or parent-relative — are
  // honored. Pre-fix the client assumed the asset was co-located with
  // the parent doc (`${parentDir(parentDocName)}/${src}`), which breaks
  // whenever attachmentFolderPath isn't `./`. Fall back to the co-located
  // assumption only when a legacy server without `path` responds.
  const parentDocDir = parentDir(parentDocName);
  const assetContentPath =
    typeof body.path === 'string' && body.path.length > 0
      ? body.path
      : parentDocDir
        ? `${parentDocDir}/${src}`
        : src;

  // Dedup toast. Fixed default is `DEFAULT_DEDUP_UI === 'toast'` — no
  // user config surface. The check is kept so future work that reintroduces
  // the knob with concrete user evidence does not have to re-derive the
  // call site.
  if (deduped && DEFAULT_DEDUP_UI !== 'silent') {
    toast.info(`Already at ${assetContentPath} — reusing.`);
  }

  const shape = pickInsertShape(file.name);

  const { state } = editor;
  const pluginState = uploadPluginKey.getState(state);
  const mappedPos = pluginState?.uploads.get(uploadId) ?? insertPos;

  const tr = state.tr.setMeta(uploadPluginKey, { type: 'remove', id: uploadId });

  // `shortestImageRef` wants contentDir-relative paths for BOTH inputs.
  // `assetContentPath` is already contentDir-relative from the server;
  // `parentDocName` already is too (the client built it from the docName
  // at the top of this function). The doc-relative `relPath` is the
  // ON-DISK markdown shape (e.g. `photo.png` / `../photo.png`) —
  // preserved as the href for the markdown-link fallback kind where the
  // browser resolves against the current page URL under hash routing
  // (root = `/`, so same-dir drops at content root resolve correctly).
  const relPath = shortestImageRef(assetContentPath, parentDocName);

  // `resolvedSrc` is the in-editor render hint for `<img src>` /
  // `<a href>` — it must be server-absolute
  // (`/<contentDir-relative>`) so the browser resolves it against origin
  // regardless of the current doc's hash-routed URL. Under hash routing,
  // `location.pathname === '/'` always, so a doc-relative path (bare
  // basename for same-dir) resolves to `http://origin/<basename>` — which
  // only exists at content root. For any subdirectory doc the path would
  // 404 (masked by Vite SPA fallback as text/html, producing broken
  // images + blank PDF tabs). `assetContentPath` is contentDir-relative
  // from the server — prefixing `/` roots it at origin, which sirv serves
  // from contentDir. Post-roundtrip, `handlers.wikiLinkEmbed` in core
  // applies the same `/` prefix so PM image/link nodes carry the same
  // absolute URL shape.
  const resolvedSrc = `/${assetContentPath}`;

  if (shape.kind === 'jsx-img' || shape.kind === 'jsx-video' || shape.kind === 'jsx-audio') {
    // Image / video / audio drops all emit the OK-canonical lowercase JSX
    // shape (`<img>` / `<video>` / `<audio>`) so drag/drop/paste converges
    // with the slash-menu insert on `Image.tsx` / `Video.tsx` / `Audio.tsx`
    // (zoom + PropPanel + full canonical-prop surface). The shape construction
    // is delegated to `buildMediaJsxNodeData` so the drop-time PM tree can be
    // pinned against the parser's tree by unit test (precedent for clean
    // shape-equivalence between drop-time and reload-time editor state).
    const jsxNode = state.schema.nodes.jsxComponent;
    if (!jsxNode) {
      console.error('[uploadAndInsert] jsxComponent node missing from schema');
      showError(editor, uploadId);
      return;
    }
    const childData = buildMediaJsxNodeData(shape.kind, resolvedSrc);
    const componentName = childData.attrs.componentName;

    // One-tx insert: `command()` clears the upload skeleton and
    // `insertContentAt` handles block-vs-inline positioning (drop pos may
    // sit mid-paragraph; ProseMirror's `tr.insert` of a block at an inline
    // pos throws). Mirrors `drag-handle.ts:100`.
    editor
      .chain()
      .command(({ tr: chainTr }) => {
        chainTr.setMeta(uploadPluginKey, { type: 'remove', id: uploadId });
        return true;
      })
      .focus()
      .insertContentAt(mappedPos, childData)
      .run();
    focusInsertedComponent(editor, mappedPos, getDescriptor(componentName));
    return;
  }

  if (shape.kind === 'wikiembed') {
    const node = state.schema.nodes.wikiLinkEmbed;
    if (!node) {
      console.error('[uploadAndInsert] wikiLinkEmbed node missing from schema');
      showError(editor, uploadId);
      return;
    }
    // Target stays the bare basename (Obsidian shape). The NodeView
    // (`WikiLinkEmbed.renderHTML`) applies `data-resolved-src` for image
    // rendering so the in-page `<img>` / `<a>` resolves correctly
    // regardless of attachmentFolderPath or doc subdirectory.
    tr.insert(mappedPos, node.create({ target: src, alias: null, anchor: null, resolvedSrc }));
  } else if (shape.kind === 'wiki-link') {
    const wikiLinkNode = state.schema.nodes.wikiLink;
    if (!wikiLinkNode) {
      console.error('[uploadAndInsert] wikiLink node missing from schema');
      showError(editor, uploadId);
      return;
    }
    const basename = file.name.replace(/\.(md|mdx)$/i, '');
    const attrs = buildUnresolvedWikiLinkAttrs(basename);
    if (!attrs) {
      tr.insert(mappedPos, state.schema.text(file.name));
    } else {
      tr.insert(mappedPos, wikiLinkNode.create(attrs));
    }
  } else {
    // Markdown-link fallback: insert text + link mark.
    const linkMark = state.schema.marks.link;
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
