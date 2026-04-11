/**
 * Component items adapter — converts the componentManifest into SlashCommandItem[]
 * for the pluggable itemsSources API. This is how typed component nodes (PR #23)
 * integrate with the unified slash command menu.
 */
import type { ComponentMeta } from '@inkeep/open-knowledge-core';
import { componentManifest } from '@inkeep/open-knowledge-core';
import type { Editor } from '@tiptap/react';
import {
  Box,
  Braces,
  ChevronsDownUp,
  Columns2,
  Folder,
  Frame,
  GitBranch,
  Info,
  List,
  ListOrdered,
  Megaphone,
  Play,
  Square,
  Table2,
  Volume2,
  ZoomIn,
} from 'lucide-react';
import type { SlashCommandItem } from './items';

/** Map icon name strings from the manifest to Lucide React components. */
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  info: Info,
  'columns-2': Columns2,
  square: Square,
  'list-ordered': ListOrdered,
  'chevrons-down-up': ChevronsDownUp,
  'zoom-in': ZoomIn,
  folder: Folder,
  table: Table2,
  megaphone: Megaphone,
  list: List,
  play: Play,
  frame: Frame,
  braces: Braces,
  'git-branch': GitBranch,
  'volume-2': Volume2,
};

/** Compute default prop values for a component from its registry metadata. */
function getDefaultProps(meta: ComponentMeta): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const prop of meta.props) {
    if (prop.type === 'reactnode') continue;
    if (prop.defaultValue !== undefined) {
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

/** Returns all component items from the registry as SlashCommandItem[]. */
export function getComponentItems(): SlashCommandItem[] {
  return Object.entries(componentManifest).map(([name, meta]) => ({
    name: `component-${name}`,
    label: meta.displayName,
    icon: iconMap[meta.icon ?? ''] ?? Box,
    category: meta.category,
    aliases: meta.searchTerms,
    description: meta.description,
    command: (editor: Editor) => {
      const defaults = getDefaultProps(meta);
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'jsxComponentEditable',
          attrs: { componentName: name, ...defaults },
          content: [{ type: 'paragraph' }],
        })
        .run();
    },
  }));
}
