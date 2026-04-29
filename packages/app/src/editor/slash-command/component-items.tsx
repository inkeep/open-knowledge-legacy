/**
 * Slash-command items for registered built-in components.
 *
 * Lists all registered (block) components from the descriptor registry
 * with category grouping and searchTerms fuzzy matching.
 *
 * Inserted components arrive with the props that declare an explicit
 * `defaultValue` populated from the descriptor; everything else stays
 * unset. Synthetic-default fallbacks (first enum value, `0`, `''`,
 * `false`) are NOT applied — they leak into PropPanel as misleading
 * preset values (`width=0`, `crossorigin="anonymous"`, `srcset=""`)
 * that emit to disk on the next dirty serialize. Renderer-side
 * defaults (e.g., `<img>` with no width renders at intrinsic size,
 * `<video controls={true}>` per descriptor's `defaultValue: true`)
 * already cover the "see a Callout / see a Video player" UX without
 * pre-writing the prop bag.
 */

import type { Editor } from '@tiptap/react';
import type { ReactNode } from 'react';
import { resolveIcon } from '../registry/icons.ts';
import { getDescriptor, getRegisteredDescriptors } from '../registry/index.ts';
import type { JsxComponentDescriptor } from '../registry/types.ts';
import type { SlashCommandItem } from './items';
import imagePreview from './preview-assets/image-preview.png';
import videoPreview from './preview-assets/video-preview.png';

/**
 * Per-component hover-preview configuration. Each entry is rendered live via
 * the descriptor's React component — props + children pass directly through,
 * so previews stay in sync with the real component without screenshot drift.
 *
 * Keyed by descriptor name (case-sensitive, matches `componentMap` key).
 * Components without an entry get no preview panel.
 */
interface PreviewConfig {
  description: string;
  props?: Record<string, unknown>;
  children?: ReactNode;
}

const PREVIEW_CONFIG: Record<string, PreviewConfig> = {
  Callout: {
    description: 'Highlight tips, warnings, and notes.',
    props: { type: 'note', title: 'Heads up' },
    children: 'Callouts draw attention to key information.',
  },
  Accordion: {
    description: 'Collapsible section with a clickable summary.',
    props: { title: 'Click to expand', defaultOpen: true },
    children: 'Hidden content goes here.',
  },
  img: {
    description: 'Embed an image with optional alt text.',
    props: { src: imagePreview, alt: 'Sample image' },
  },
  video: {
    description: 'Embed a video with native player controls.',
    props: { controls: true, poster: videoPreview },
  },
  audio: {
    description: 'Embed an audio file with native player controls.',
    props: { controls: true },
  },
  Math: {
    description: 'Block math equation rendered with KaTeX from a LaTeX source string.',
    props: { formula: 'c = \\pm\\sqrt{a^2 + b^2}' },
  },
};

/**
 * Compute default props for slash-inserted components.
 *
 * Only props that DECLARE an explicit `defaultValue` get pre-populated.
 * Undeclared props stay unset so PropPanel renders them as empty inputs
 * (string), empty number fields, false-checked switches, and "(unset)"-
 * equivalent enum dropdowns — and they don't emit to disk on the next
 * serialize. The synthetic-default fallback ladder (first enum value,
 * `0`, `''`, `false`) was leaking misleading preset values:
 *   - `width=0` / `height=0` collapsed inserted images to invisible.
 *   - `crossorigin="anonymous"` enabled CORS the user didn't request.
 *   - `srcset=""` / `sizes=""` cluttered the on-disk MDX after first save.
 * Renderer-side defaults (declared `defaultValue` like
 * `<video controls={true}>` or HTML platform defaults like `<img>` at
 * intrinsic size) already cover the "see a Callout / Video / Image" UX
 * without pre-writing the prop bag.
 */
function getDefaultProps(descriptor: JsxComponentDescriptor): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const prop of descriptor.props) {
    if (prop.type === 'reactnode') continue;
    if ('defaultValue' in prop && prop.defaultValue !== undefined) {
      defaults[prop.name] = prop.defaultValue;
    }
  }
  return defaults;
}

/**
 * Build the PM content JSON for a component node with default props.
 * Used by: slash-command insertion, BlockDragHandle "+" container child insertion,
 * empty-container placeholder, and "add child" button — single source of truth.
 * Derives everything from the descriptor; zero component-specific logic.
 */
export function createChildNode(childName: string): Record<string, unknown> {
  const childDesc = getDescriptor(childName);
  const defaultProps = getDefaultProps(childDesc);
  return {
    type: 'jsxComponent',
    attrs: {
      componentName: childDesc.name,
      kind: 'element',
      attributes: [],
      sourceRaw: '',
      sourceDirty: true,
      props: defaultProps,
    },
    content: childDesc.hasChildren ? [{ type: 'paragraph' }] : undefined,
  };
}

/**
 * Pending auto-open queue, keyed by the inserted NodeSelection's document
 * position. A boolean flag used to break under rapid successive slash
 * insertions — the second insertion set the flag before the first
 * consumed it, so the NodeView that mounted second stole the auto-open
 * while the first never got one. Keying by position avoids that race:
 * each insertion tracks its own pending-ness, and consumption is a
 * `.delete(key)` — two different NodeViews can't collide.
 *
 * The map is bounded by typical usage (1–2 pending at a time under
 * keyboard burst). An explicit cap would shed oldest entries; skipped
 * because the set is effectively self-pruning (every NodeView that
 * mounts calls `consumeAutoOpen` with its pos once).
 */
const pendingAutoOpen = new Set<number>();

export function setPendingAutoOpen(pos: number): void {
  pendingAutoOpen.add(pos);
}

/**
 * Internal test-only helper: clear the pending set. Production code should
 * not call this — `consumeAutoOpen` drains entries as NodeViews mount.
 */
export function _resetPendingAutoOpenForTest(): void {
  pendingAutoOpen.clear();
}

/**
 * Consume the auto-open flag for the NodeView at `pos`. Returns true once;
 * subsequent calls for the same pos return false. Legacy callers that pass
 * no argument drain any pending flag (used by the slash-insert path where
 * the NodeView doesn't yet know its final position).
 */
export function consumeAutoOpen(pos?: number): boolean {
  if (typeof pos === 'number') {
    return pendingAutoOpen.delete(pos);
  }
  // No position provided — legacy drain behavior for callers that cannot
  // resolve their getPos() yet. Takes an arbitrary entry; safe because
  // the caller only checks the flag's truthiness, not identity.
  const iter = pendingAutoOpen.values().next();
  if (iter.done) return false;
  pendingAutoOpen.delete(iter.value);
  return true;
}

/**
 * After inserting a component, focus appropriately:
 * - Has editable props → NodeSelect the component (triggers popover auto-open)
 * - Has children only → place cursor inside children for typing
 */
export function focusInsertedComponent(
  editor: Editor,
  insertPos: number,
  descriptor: JsxComponentDescriptor,
): void {
  const hasEditableProps = descriptor.props.some(
    (p) => !('hidden' in p && p.hidden) && p.type !== 'reactnode',
  );

  if (hasEditableProps) {
    setPendingAutoOpen(insertPos);
    requestAnimationFrame(() => {
      editor.commands.setNodeSelection(insertPos);
    });
  } else if (descriptor.hasChildren) {
    editor.commands.setTextSelection(insertPos + 2);
  }
}

/**
 * Create the slash-command insertion command for a component.
 * Inserts a jsxComponent PM node with structured attrs + default props.
 * Post-insert: auto-opens PropPanel (editable props) or focuses children.
 */
function createInsertCommand(descriptor: JsxComponentDescriptor): (editor: Editor) => void {
  return (editor: Editor) => {
    // Snapshot existing matching jsxComponent node references. ProseMirror
    // preserves node identity for nodes unchanged by a transaction, so the
    // matching node in the new doc whose reference is NOT in this set is
    // the one just inserted. This is robust whether the cursor lands before
    // or after the new node, and across multi-instance docs where
    // cursor-relative heuristics misidentify which match is new.
    //
    // The boundary position must come from the post-insert doc anyway:
    // selection.from BEFORE insertion is the cursor's interior position
    // (e.g., 1 inside an empty paragraph), which doc.nodeAt() rejects as
    // a NodeSelection target — and the consumer's consumeAutoOpen(getPos())
    // keys off the boundary position regardless.
    const beforeRefs = new WeakSet<object>();
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'jsxComponent' && node.attrs.componentName === descriptor.name) {
        beforeRefs.add(node);
      }
    });

    editor.chain().focus().insertContent(createChildNode(descriptor.name)).run();

    let insertPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (insertPos >= 0) return false;
      if (
        node.type.name === 'jsxComponent' &&
        node.attrs.componentName === descriptor.name &&
        !beforeRefs.has(node)
      ) {
        insertPos = pos;
      }
    });

    if (insertPos < 0) return;
    focusInsertedComponent(editor, insertPos, descriptor);
  };
}

/**
 * Build slash-command items from the registered descriptor registry.
 * Called lazily by the slash-command extension's itemsSources API.
 *
 * Filters to `surface: 'canonical'` — compat descriptors (GFMCallout,
 * CommonMarkImage, HtmlDetailsAccordion) are read-only round-trip preservers
 * for content authored in those source forms; never offered for fresh
 * insertion. To get a canonical with the full prop surface, the user inserts
 * a fresh canonical block from this menu.
 */
export function getComponentItems(): SlashCommandItem[] {
  const descriptors = getRegisteredDescriptors().filter((desc) => desc.surface === 'canonical');

  return descriptors.map((desc) => {
    const previewConfig = PREVIEW_CONFIG[desc.name];
    const Component = desc.Component;
    const preview: SlashCommandItem['preview'] = previewConfig
      ? {
          description: previewConfig.description,
          render: () => <Component {...previewConfig.props}>{previewConfig.children}</Component>,
        }
      : undefined;

    return {
      name: `component-${desc.name}`,
      label: desc.displayName ?? desc.name,
      icon: resolveIcon(desc.icon),
      category: desc.category ?? 'content',
      command: createInsertCommand(desc),
      aliases: desc.searchTerms,
      description: desc.description,
      preview,
    };
  });
}
