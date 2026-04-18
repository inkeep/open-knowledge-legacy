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
  ChevronDown,
  ChevronsUpDown,
  FileText,
  Flag,
  FolderOpen,
  FolderTree,
  GitGraph,
  Hash,
  LayoutGrid,
  List,
  ListOrdered,
  type LucideIcon,
  MessageSquareWarning,
  PanelTop,
  Square,
  SquareMousePointer,
  Table,
  Volume2,
  ZoomIn,
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
 */
const ICON_COMPONENTS: Record<string, LucideIcon> = {
  ChevronDown,
  ChevronsUpDown,
  FileText,
  Flag,
  FolderOpen,
  FolderTree,
  GitGraph,
  Hash,
  LayoutGrid,
  List,
  ListOrdered,
  MessageSquareWarning,
  PanelTop,
  Square,
  SquareMousePointer,
  Table,
  Volume2,
  ZoomIn,
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
export function getDefaultProps(descriptor: JsxComponentDescriptor): Record<string, unknown> {
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
 * Module-level flag: a component was just inserted and should auto-open
 * its PropPanel. The NEXT jsxComponent NodeView that renders with
 * `selected=true` consumes this flag.
 */
let pendingAutoOpen = false;
export function setPendingAutoOpen(): void {
  pendingAutoOpen = true;
}
export function consumeAutoOpen(): boolean {
  if (pendingAutoOpen) {
    pendingAutoOpen = false;
    return true;
  }
  return false;
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
    setPendingAutoOpen();
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
 */
export function getComponentItems(): SlashCommandItem[] {
  const descriptors = getRegisteredDescriptors();

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
