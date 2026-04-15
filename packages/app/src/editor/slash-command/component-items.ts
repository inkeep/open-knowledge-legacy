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
import { Box, type LucideIcon } from 'lucide-react';
import { getRegisteredDescriptors } from '../registry/index.ts';
import type { JsxComponentDescriptor } from '../registry/types.ts';
import type { SlashCommandItem } from './items';

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
 * Create the slash-command insertion command for a component.
 * Inserts a jsxComponent PM node with structured attrs + default props.
 */
function createInsertCommand(descriptor: JsxComponentDescriptor): (editor: Editor) => void {
  return (editor: Editor) => {
    const defaultProps = getDefaultProps(descriptor);
    const content = descriptor.hasChildren ? [{ type: 'paragraph' }] : undefined;

    editor
      .chain()
      .focus()
      .insertContent({
        type: 'jsxComponent',
        attrs: {
          componentName: descriptor.name,
          kind: 'element',
          attributes: [],
          sourceRaw: '',
          sourceDirty: true,
          props: defaultProps,
        },
        content,
      })
      .run();
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
    icon: Box as LucideIcon,
    category: desc.category ?? 'content',
    command: createInsertCommand(desc),
    aliases: desc.searchTerms,
    description: desc.description,
  }));
}
