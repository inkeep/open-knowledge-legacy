import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Plugin key
// ---------------------------------------------------------------------------

export const uploadPluginKey = new PluginKey<UploadPluginState>('imageUpload');

// ---------------------------------------------------------------------------
// Plugin state shape
// ---------------------------------------------------------------------------

interface UploadPluginState {
  decorations: DecorationSet;
  uploads: Map<string, number>; // uploadId → doc position
}

// ---------------------------------------------------------------------------
// Widget DOM renderers (vanilla DOM — no React)
// ---------------------------------------------------------------------------

function createSkeletonWidget(): HTMLElement {
  const el = document.createElement('div');
  el.className =
    'image-upload-skeleton w-full h-40 rounded-md bg-muted animate-pulse motion-reduce:animate-none my-2';
  el.setAttribute('data-upload-widget', 'loading');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', 'Uploading image...');
  return el;
}

// ---------------------------------------------------------------------------
// Upload decoration plugin
// ---------------------------------------------------------------------------

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
      // Map existing decorations and upload positions through the transaction mapping.
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

// ---------------------------------------------------------------------------
// uploadAndInsert
// ---------------------------------------------------------------------------

export async function uploadAndInsert(
  file: File,
  editor: Editor,
  insertPos: number,
): Promise<void> {
  const uploadId = crypto.randomUUID();

  // 1. Show skeleton placeholder
  const skeletonWidget = createSkeletonWidget();
  editor.view.dispatch(
    editor.state.tr.setMeta(uploadPluginKey, {
      type: 'add',
      id: uploadId,
      pos: insertPos,
      widget: skeletonWidget,
    }),
  );

  // 2. Upload the file
  const formData = new FormData();
  formData.append('file', file);

  let res: Response;
  try {
    res = await fetch('/api/upload-image', { method: 'POST', body: formData });
  } catch (networkError) {
    console.error('[uploadAndInsert] Network error:', networkError);
    showError(editor, uploadId);
    return;
  }

  if (!res.ok) {
    let errorMessage = `Upload failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) errorMessage = body.error;
    } catch {
      /* use default */
    }
    console.error('[uploadAndInsert] Server error:', errorMessage);
    showError(editor, uploadId, errorMessage);
    return;
  }

  // 3. On success: remove decoration and insert image node in one transaction
  let src: string;
  try {
    const body = (await res.json()) as { src?: string };
    if (typeof body.src !== 'string') throw new Error('missing src in response');
    src = body.src;
  } catch (parseError) {
    console.error('[uploadAndInsert] Response parse error:', parseError);
    showError(editor, uploadId);
    return;
  }

  const alt = file.name.replace(/\.[^.]+$/, '');

  const { state } = editor;
  const pluginState = uploadPluginKey.getState(state);
  const mappedPos = pluginState?.uploads.get(uploadId) ?? insertPos;

  const imageNode = state.schema.nodes.image;
  if (!imageNode) {
    console.error('[uploadAndInsert] Image node type not found in schema');
    showError(editor, uploadId);
    return;
  }

  const tr = state.tr
    .setMeta(uploadPluginKey, { type: 'remove', id: uploadId })
    .insert(mappedPos, imageNode.create({ src, alt }));

  editor.view.dispatch(tr);
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

function showError(editor: Editor, uploadId: string, message?: string): void {
  editor.view.dispatch(editor.state.tr.setMeta(uploadPluginKey, { type: 'remove', id: uploadId }));
  toast.error(message ?? 'Upload failed');
}
