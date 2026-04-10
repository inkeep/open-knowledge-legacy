import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { ReactRenderer } from '@tiptap/react';
import { SlashCommandMenu } from '../slash-command/SlashCommandMenu';
import { type SlashCommandItem, filterItems, slashCommandItems } from '../slash-command/items';

const slashCommandKey = new PluginKey('slashCommand');

interface SlashCommandState {
  active: boolean;
  range: { from: number; to: number } | null;
  query: string;
  selectedIndex: number;
}

const INITIAL_STATE: SlashCommandState = {
  active: false,
  range: null,
  query: '',
  selectedIndex: 0,
};

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: slashCommandKey,

        state: {
          init(): SlashCommandState {
            return INITIAL_STATE;
          },

          apply(tr, prev): SlashCommandState {
            // If the transaction has meta to close, close
            const meta = tr.getMeta(slashCommandKey);
            if (meta?.close) return INITIAL_STATE;
            if (meta?.setIndex !== undefined) {
              return { ...prev, selectedIndex: meta.setIndex };
            }

            // If not active, check if we should open
            const { selection } = tr;
            const { $from } = selection;

            // Only care about cursor selections (not range selections)
            if (!selection.empty) return INITIAL_STATE;

            // Get the text of the current block from block start to cursor
            const textBefore = $from.parent.textBetween(
              0,
              $from.parentOffset,
              undefined,
              '\ufffc',
            );

            // Check for "/" trigger: must be at start of text or after whitespace
            const match = textBefore.match(/(?:^|\s)\/([a-z0-9-]*)$/i);
            if (!match) {
              if (prev.active) return INITIAL_STATE;
              return prev;
            }

            const query = match[1];
            // Calculate the absolute position of the "/" character
            const blockStart = $from.start();
            const slashPos = blockStart + textBefore.lastIndexOf('/');
            const range = { from: slashPos, to: $from.pos };

            // Close if no items match the query
            const filtered = filterItems(slashCommandItems, query);
            if (filtered.length === 0) {
              return INITIAL_STATE;
            }

            const clampedIndex = Math.min(
              prev.active ? prev.selectedIndex : 0,
              Math.max(0, filtered.length - 1),
            );

            return {
              active: true,
              range,
              query,
              selectedIndex: clampedIndex,
            };
          },
        },

        props: {
          handleKeyDown(view: EditorView, event: KeyboardEvent): boolean {
            const state = slashCommandKey.getState(view.state) as SlashCommandState | undefined;
            if (!state?.active) return false;

            const filtered = filterItems(slashCommandItems, state.query);

            if (event.key === 'ArrowDown') {
              event.preventDefault();
              const next = (state.selectedIndex + 1) % filtered.length;
              view.dispatch(view.state.tr.setMeta(slashCommandKey, { setIndex: next }));
              return true;
            }

            if (event.key === 'ArrowUp') {
              event.preventDefault();
              const next = (state.selectedIndex - 1 + filtered.length) % filtered.length;
              view.dispatch(view.state.tr.setMeta(slashCommandKey, { setIndex: next }));
              return true;
            }

            if (event.key === 'Enter') {
              event.preventDefault();
              const item = filtered[state.selectedIndex];
              if (item && state.range) {
                const range = state.range;
                // Close first, then delete + run command in one flow
                view.dispatch(view.state.tr.setMeta(slashCommandKey, { close: true }));
                editor.chain().focus().deleteRange(range).run();
                item.command(editor);
              }
              return true;
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              view.dispatch(view.state.tr.setMeta(slashCommandKey, { close: true }));
              return true;
            }

            return false;
          },
        },

        view() {
          let renderer: ReactRenderer<typeof SlashCommandMenu> | null = null;
          let popup: HTMLDivElement | null = null;

          const destroy = () => {
            renderer?.destroy();
            renderer = null;
            popup?.remove();
            popup = null;
          };

          const updatePosition = (view: EditorView, from: number) => {
            if (!popup) return;
            try {
              const coords = view.coordsAtPos(from);
              popup.style.left = `${coords.left}px`;
              popup.style.top = `${coords.bottom + 4}px`;
            } catch {
              // Position can fail if the node was deleted
              destroy();
            }
          };

          return {
            update(view: EditorView) {
              const state = slashCommandKey.getState(view.state) as
                | SlashCommandState
                | undefined;

              if (!state?.active) {
                if (renderer) destroy();
                return;
              }

              const filtered = filterItems(slashCommandItems, state.query);

              const onSelect = (item: SlashCommandItem) => {
                if (state.range) {
                  const range = state.range;
                  view.dispatch(view.state.tr.setMeta(slashCommandKey, { close: true }));
                  editor.chain().focus().deleteRange(range).run();
                  item.command(editor);
                }
              };

              if (!renderer) {
                popup = document.createElement('div');
                popup.style.position = 'fixed';
                popup.style.zIndex = '50';
                document.body.appendChild(popup);

                renderer = new ReactRenderer(SlashCommandMenu, {
                  props: {
                    items: slashCommandItems,
                    query: state.query,
                    selectedIndex: state.selectedIndex,
                    onSelect,
                  },
                  editor,
                });
                popup.appendChild(renderer.element);
              } else {
                renderer.updateProps({
                  items: slashCommandItems,
                  query: state.query,
                  selectedIndex: state.selectedIndex,
                  onSelect,
                });
              }

              if (state.range) {
                updatePosition(view, state.range.from);
              }
            },

            destroy() {
              destroy();
            },
          };
        },
      }),
    ];
  },
});
