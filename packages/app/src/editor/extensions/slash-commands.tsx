/**
 * Slash command extension — type / to insert a component from the registry.
 *
 * Uses @tiptap/suggestion to detect the / trigger character, filters
 * componentManifest entries, and inserts jsxComponentEditable nodes
 * with default props.
 */
import { componentManifest } from '@inkeep/open-knowledge-core';
import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import Suggestion from '@tiptap/suggestion';
import { createRoot } from 'react-dom/client';
import type { SlashCommandItem, SlashCommandMenuRef } from '../components/SlashCommandMenu';
import { SlashCommandMenu } from '../components/SlashCommandMenu';

const slashCommandPluginKey = new PluginKey('slashCommand');

/** Build the full list of items from the manifest. */
function getAllItems(): SlashCommandItem[] {
  return Object.entries(componentManifest).map(([name, meta]) => ({ name, meta }));
}

/** Get default prop values for a component from its meta. */
function getDefaultProps(item: SlashCommandItem): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const prop of item.meta.props) {
    if (prop.type === 'reactnode') continue;
    if (prop.defaultValue !== undefined) {
      defaults[prop.name] = prop.defaultValue;
    } else if (prop.type === 'enum' && prop.enumValues.length > 0) {
      // PropDef discriminated union: when type === 'enum', enumValues is typed as string[]
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

export const SlashCommands = Extension.create({
  name: 'slashCommands',

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        char: '/',
        pluginKey: slashCommandPluginKey,
        startOfLine: true,

        items: ({ query }) => {
          const all = getAllItems();
          if (!query) return all;
          const lower = query.toLowerCase();
          return all.filter(
            (item) =>
              item.name.toLowerCase().includes(lower) ||
              item.meta.displayName.toLowerCase().includes(lower) ||
              item.meta.category.toLowerCase().includes(lower),
          );
        },

        command: ({ editor, range, props: item }) => {
          const defaults = getDefaultProps(item);
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: 'jsxComponentEditable',
              attrs: {
                componentName: item.name,
                ...defaults,
              },
              content: [{ type: 'paragraph' }],
            })
            .run();
        },

        render: () => {
          let container: HTMLDivElement | null = null;
          let root: ReturnType<typeof createRoot> | null = null;
          let menuRef: SlashCommandMenuRef | null = null;

          return {
            onStart(props) {
              container = document.createElement('div');
              container.style.position = 'absolute';
              container.style.zIndex = '50';
              document.body.appendChild(container);

              root = createRoot(container);
              root.render(
                <SlashCommandMenu
                  ref={(r) => {
                    menuRef = r;
                  }}
                  items={props.items}
                  command={(item) => props.command(item)}
                />,
              );

              updatePosition(container, props.clientRect);
            },

            onUpdate(props) {
              if (root && container) {
                root.render(
                  <SlashCommandMenu
                    ref={(r) => {
                      menuRef = r;
                    }}
                    items={props.items}
                    command={(item) => props.command(item)}
                  />,
                );
                updatePosition(container, props.clientRect);
              }
            },

            onKeyDown(props) {
              if (props.event.key === 'Escape') {
                cleanup();
                return true;
              }
              return menuRef?.onKeyDown(props.event) ?? false;
            },

            onExit() {
              cleanup();
            },
          };

          function updatePosition(
            el: HTMLDivElement,
            clientRect: (() => DOMRect | null) | null | undefined,
          ) {
            const rect = clientRect?.();
            if (!rect) return;
            el.style.left = `${rect.left}px`;
            el.style.top = `${rect.bottom + 4}px`;
          }

          function cleanup() {
            if (root) {
              root.unmount();
              root = null;
            }
            if (container) {
              container.remove();
              container = null;
            }
            menuRef = null;
          }
        },
      }),
    ];
  },
});
