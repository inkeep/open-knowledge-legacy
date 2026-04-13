/**
 * Unified list + listItem TipTap extension.
 *
 * Replaces BulletListFidelity, OrderedListFidelity, ListItemFidelity,
 * TaskList, and TaskItem with a single pair of node types matching mdast's
 * nested `list` → `listItem+` structure (D15 LOCKED).
 *
 * Schema names are mdast-canonical: `list` (not bulletList/orderedList)
 * and `listItem` (not taskItem). Bullet/ordered/task are distinguished
 * by attrs (`ordered`, `checked`).
 *
 * Commands are TipTap-idiomatic: toggleBulletList, toggleOrderedList,
 * toggleTaskList — matching existing UI callers in slash-command/items.ts
 * and bubble-menu/BlockTypeSelector.tsx.
 *
 * Keyboard shortcuts use prosemirror-schema-list utilities (wrapInList,
 * splitListItem, liftListItem, sinkListItem) which are designed for
 * nested list schemas.
 */

import { findParentNode, InputRule, mergeAttributes, Node, wrappingInputRule } from '@tiptap/core';
import type { NodeType, Node as PmNode } from '@tiptap/pm/model';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import { findWrapping } from '@tiptap/pm/transform';
import {
  liftListItem as pmLiftListItem,
  wrapInList as pmWrapInList,
} from 'prosemirror-schema-list';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    list: {
      toggleBulletList: () => ReturnType;
      toggleOrderedList: () => ReturnType;
      toggleTaskList: () => ReturnType;
    };
  }
}

// ────────────────────────── Helpers ──────────────────────────

/** Check if a list node is a bullet list (not ordered, no checked items). */
function isBulletList(node: PmNode): boolean {
  return node.type.name === 'list' && !node.attrs.ordered;
}

/** Check if a list node is an ordered list. */
function isOrderedList(node: PmNode): boolean {
  return node.type.name === 'list' && !!node.attrs.ordered;
}

/** Check if a list has any task items (checked !== null). */
function hasTaskItems(node: PmNode): boolean {
  let found = false;
  node.forEach((child) => {
    if (child.type.name === 'listItem' && child.attrs.checked !== null) {
      found = true;
    }
  });
  return found;
}

/**
 * Toggle between a specific list kind and no-list.
 *
 * If the selection is inside a list matching `predicate`, unwrap.
 * If inside a different list kind, swap the attrs/items.
 * If not in a list, wrap.
 */
function toggleListKind(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  listType: NodeType,
  itemType: NodeType,
  predicate: (node: PmNode) => boolean,
  listAttrs: Record<string, unknown>,
  itemAttrsOverride?: Record<string, unknown> | null,
): boolean {
  const parentList = findParentNode((node) => node.type.name === 'list')(state.selection);

  if (parentList && predicate(parentList.node)) {
    // Already in target kind → unwrap (lift)
    const { $from, $to } = state.selection;
    const range = $from.blockRange($to);
    if (!range) return false;
    return pmLiftListItem(itemType)(state, dispatch);
  }

  if (parentList) {
    // Inside a different list kind → swap attrs
    if (!dispatch) return true;
    const { tr } = state;
    // Update the list node's attrs
    tr.setNodeMarkup(parentList.pos, undefined, {
      ...parentList.node.attrs,
      ...listAttrs,
    });
    // If switching to/from task, update listItem checked attrs
    if (itemAttrsOverride !== undefined) {
      parentList.node.forEach((child, offset) => {
        if (child.type.name === 'listItem') {
          const itemPos = parentList.pos + 1 + offset;
          tr.setNodeMarkup(itemPos, undefined, {
            ...child.attrs,
            ...(itemAttrsOverride ?? {}),
          });
        }
      });
    }
    dispatch(tr);
    return true;
  }

  // Not in a list → wrap
  const canWrap = pmWrapInList(listType, listAttrs)(state, undefined);
  if (!canWrap) return false;
  if (!dispatch) return true;

  // Wrap and optionally set item attrs
  const result = pmWrapInList(listType, listAttrs)(state, (tr) => {
    if (itemAttrsOverride) {
      // After wrapping, walk up from the mapped position to find the new listItem
      const mappedPos = tr.mapping.map(state.selection.$from.pos);
      const $pos = tr.doc.resolve(mappedPos);
      for (let d = $pos.depth; d > 0; d--) {
        const node = $pos.node(d);
        if (node.type.name === 'listItem') {
          tr.setNodeMarkup($pos.before(d), undefined, {
            ...node.attrs,
            ...itemAttrsOverride,
          });
          break;
        }
      }
    }
    dispatch(tr);
  });
  return result;
}

// ────────────────────────── List Node ──────────────────────────

export const ListNode = Node.create({
  name: 'list',
  group: 'block list',
  content: 'listItem+',
  priority: 60,

  addAttributes() {
    return {
      ordered: { default: false },
      start: { default: 1 },
      spread: { default: false },
      bulletMarker: { default: null },
      listMarkerDelimiter: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'ul',
        getAttrs: () => ({ ordered: false }),
      },
      {
        tag: 'ol',
        getAttrs: (el) => ({
          ordered: true,
          start: (el as HTMLElement).getAttribute('start')
            ? Number((el as HTMLElement).getAttribute('start'))
            : 1,
        }),
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const tag = node.attrs.ordered ? 'ol' : 'ul';
    const extraAttrs: Record<string, unknown> = {};
    if (node.attrs.ordered && node.attrs.start !== 1) {
      extraAttrs.start = node.attrs.start;
    }
    return [tag, mergeAttributes(HTMLAttributes, extraAttrs), 0];
  },

  addCommands() {
    return {
      toggleBulletList:
        () =>
        ({ state, dispatch }) => {
          const listType = state.schema.nodes.list;
          const itemType = state.schema.nodes.listItem;
          if (!listType || !itemType) return false;
          return toggleListKind(
            state,
            dispatch,
            listType,
            itemType,
            (n) => isBulletList(n) && !hasTaskItems(n),
            { ordered: false },
            { checked: null }, // clear task status when switching to bullet
          );
        },
      toggleOrderedList:
        () =>
        ({ state, dispatch }) => {
          const listType = state.schema.nodes.list;
          const itemType = state.schema.nodes.listItem;
          if (!listType || !itemType) return false;
          return toggleListKind(
            state,
            dispatch,
            listType,
            itemType,
            (n) => isOrderedList(n),
            { ordered: true },
            { checked: null }, // clear task status when switching to ordered
          );
        },
      toggleTaskList:
        () =>
        ({ state, dispatch }) => {
          const listType = state.schema.nodes.list;
          const itemType = state.schema.nodes.listItem;
          if (!listType || !itemType) return false;
          return toggleListKind(
            state,
            dispatch,
            listType,
            itemType,
            (n) => isBulletList(n) && hasTaskItems(n),
            { ordered: false },
            { checked: false }, // enable task mode
          );
        },
    };
  },

  addInputRules() {
    return [
      // Bullet list: - , * , +
      wrappingInputRule({
        find: /^\s*([-+*])\s$/,
        type: this.type,
        getAttributes: (match) => ({
          ordered: false,
          bulletMarker: match[1],
        }),
      }),
      // Ordered list: 1. or 1)
      wrappingInputRule({
        find: /^\s*(\d+)([.)])\s$/,
        type: this.type,
        getAttributes: (match) => ({
          ordered: true,
          start: Number(match[1]),
          listMarkerDelimiter: match[2],
        }),
      }),
      // Task list: - [ ] or - [x]
      new InputRule({
        find: /^\s*[-*+]\s\[([ xX])\]\s$/,
        handler: ({ state, range, match }) => {
          const listType = state.schema.nodes.list;
          if (!listType) return null;

          const checked = match[1] !== ' ';
          const tr = state.tr.delete(range.from, range.to);

          const $start = tr.doc.resolve(range.from);
          const blockRange = $start.blockRange();
          if (!blockRange) return null;

          const wrapping = findWrapping(blockRange, listType, { ordered: false });
          if (!wrapping) return null;

          tr.wrap(blockRange, wrapping);

          // Find the newly created listItem and set checked
          const $newPos = tr.doc.resolve(tr.mapping.map(range.from));
          for (let d = $newPos.depth; d > 0; d--) {
            const parentNode = $newPos.node(d);
            if (parentNode.type.name === 'listItem') {
              tr.setNodeMarkup($newPos.before(d), undefined, {
                ...parentNode.attrs,
                checked,
              });
              break;
            }
          }
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-8': () => this.editor.commands.toggleBulletList(),
      'Mod-Shift-7': () => this.editor.commands.toggleOrderedList(),
      'Mod-Shift-9': () => this.editor.commands.toggleTaskList(),
    };
  },
});

// ────────────────────────── ListItem Node ──────────────────────────

export const ListItemNode = Node.create({
  name: 'listItem',
  content: 'paragraph block*',
  defining: true,
  priority: 60,

  addAttributes() {
    return {
      checked: { default: null },
      spread: { default: false },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'li',
        getAttrs: (el) => {
          const checkbox = (el as HTMLElement).querySelector('input[type="checkbox"]');
          return {
            checked: checkbox ? (checkbox as HTMLInputElement).checked : null,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    if (node.attrs.checked !== null) {
      return [
        'li',
        mergeAttributes(HTMLAttributes, {
          'data-type': 'taskItem',
          'data-checked': node.attrs.checked ? 'true' : 'false',
        }),
        [
          'label',
          { contenteditable: 'false' },
          [
            'input',
            {
              type: 'checkbox',
              ...(node.attrs.checked ? { checked: 'checked' } : {}),
            },
          ],
        ],
        ['div', 0],
      ];
    }
    return ['li', mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ({ node, getPos, editor, HTMLAttributes }) => {
      const li = document.createElement('li');
      Object.entries(
        mergeAttributes(
          HTMLAttributes,
          node.attrs.checked !== null
            ? { 'data-type': 'taskItem', 'data-checked': String(!!node.attrs.checked) }
            : {},
        ),
      ).forEach(([key, val]) => {
        if (val != null) li.setAttribute(key, String(val));
      });

      let checkboxLabel: HTMLLabelElement | null = null;
      let checkbox: HTMLInputElement | null = null;
      const contentDiv = document.createElement('div');

      if (node.attrs.checked !== null) {
        checkboxLabel = document.createElement('label');
        checkboxLabel.contentEditable = 'false';

        checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = !!node.attrs.checked;

        if (!editor.isEditable) {
          checkbox.disabled = true;
        }

        checkbox.addEventListener('change', () => {
          const pos = getPos();
          if (pos === undefined || typeof pos !== 'number') return;
          editor.view.dispatch(
            editor.view.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              checked: checkbox?.checked ?? false,
            }),
          );
        });

        checkboxLabel.appendChild(checkbox);
        li.appendChild(checkboxLabel);
      }

      li.appendChild(contentDiv);

      return {
        dom: li,
        contentDOM: contentDiv,
        update(updatedNode: PmNode) {
          if (updatedNode.type !== node.type) return false;
          // Handle transition to/from task mode
          if ((updatedNode.attrs.checked !== null) !== (node.attrs.checked !== null)) {
            return false; // force re-create
          }
          if (checkbox && updatedNode.attrs.checked !== null) {
            checkbox.checked = !!updatedNode.attrs.checked;
            li.setAttribute('data-checked', String(!!updatedNode.attrs.checked));
          }
          node = updatedNode;
          return true;
        },
      };
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
      Tab: () => this.editor.commands.sinkListItem(this.name),
      'Shift-Tab': () => this.editor.commands.liftListItem(this.name),
    };
  },
});

/**
 * Combined export for registration in shared.ts.
 * Register both ListNode and ListItemNode to get the full list experience.
 */
export const List = ListNode;
export const ListItem = ListItemNode;
