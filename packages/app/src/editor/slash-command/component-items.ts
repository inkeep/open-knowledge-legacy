/**
 * Slash-command items for registered built-in components (FR-14, FR-14a, §9.9).
 *
 * Lists all registered (block) components from the descriptor registry
 * with category grouping and searchTerms fuzzy matching.
 *
 * Inserted components arrive with default props populated via the FR-14a
 * fallback ladder: descriptor.defaultValue → first enum value → false/0/''.
 */

import type { Editor } from '@tiptap/react';
import {
  Box,
  ChevronRight,
  Image,
  type LucideIcon,
  MessageSquareWarning,
  SquarePlay,
  Volume2,
} from 'lucide-react';
import { getDescriptor, getRegisteredDescriptors } from '../registry/index.ts';
import type { JsxComponentDescriptor } from '../registry/types.ts';
import type { SlashCommandItem } from './items';

/**
 * Map of descriptor `icon` string names to their lucide-react React components.
 * Named imports (not namespace import) so Vite's tree-shaking only ships the
 * icons actually referenced — a namespace import would bundle all ~1800
 * lucide icons and blow the bundle-size gate. New icons require adding both
 * the import above and the map entry here; the registry stays React-free
 * (`packages/core/`) by carrying icons as strings.
 *
 * US-012: narrowed to the 5-pack descriptor set post-US-003. Removed the
 * 14 orphan icons for cut descriptors (ChevronDown, ChevronsUpDown,
 * FileText, Flag, FolderOpen, FolderTree, Hash, LayoutGrid, List,
 * ListOrdered, PanelTop, Square, SquareMousePointer, Table) plus the
 * dangling `GitGraph` import (Mermaid was cut 2026-04-21 per the manifest
 * header). New descriptors in the 5-pack each add exactly one icon: Callout
 * → MessageSquareWarning, Image → Image, Video → SquarePlay, Audio → Volume2,
 * Accordion → ChevronRight. `Box` is the wildcard fallback for the `'*'`
 * descriptor.
 */
const ICON_COMPONENTS: Record<string, LucideIcon> = {
  ChevronRight,
  SquarePlay,
  MessageSquareWarning,
  Volume2,
  Image,
};

/**
 * Resolve a descriptor icon name (e.g., `'MessageSquareWarning'`) to its
 * lucide-react component. Falls back to `Box` for unknown names or
 * descriptors without an icon (wildcard).
 */
function resolveIcon(iconName: string | undefined): LucideIcon {
  if (!iconName) return Box;
  return ICON_COMPONENTS[iconName] ?? Box;
}

/**
 * FR-14a: compute default props for slash-inserted components.
 * Users expect "insert Callout → see a Callout" — without defaults,
 * newly-inserted components render empty or broken.
 */
function getDefaultProps(descriptor: JsxComponentDescriptor): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const prop of descriptor.props) {
    if (prop.type === 'reactnode') continue;
    if ('defaultValue' in prop && prop.defaultValue !== undefined) {
      defaults[prop.name] = prop.defaultValue;
    } else if (prop.type === 'enum' && prop.enumValues.length > 0) {
      defaults[prop.name] = prop.enumValues[0];
    } else if (prop.type === 'boolean') {
      defaults[prop.name] = false;
    } else if (prop.type === 'number') {
      defaults[prop.name] = 0;
    } else {
      defaults[prop.name] = '';
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
    // Capture position before insertion (cursor position after deleteRange)
    const insertPos = editor.state.selection.from;
    editor.chain().focus().insertContent(createChildNode(descriptor.name)).run();
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

  return descriptors.map((desc) => ({
    name: `component-${desc.name}`,
    label: desc.displayName ?? desc.name,
    icon: resolveIcon(desc.icon),
    category: desc.category ?? 'content',
    command: createInsertCommand(desc),
    aliases: desc.searchTerms,
    description: desc.description,
  }));
}
