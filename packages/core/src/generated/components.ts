// GENERATED FROM packages/core/src/registry/built-ins.ts + react-docgen-typescript.
// Do not edit by hand. Run `bun run build-registry` to regenerate.
import type { ComponentMeta } from '../registry/types.ts';

export const componentManifest: Record<string, ComponentMeta> = {
  Callout: {
    props: [
      {
        name: 'title',
        type: 'reactnode',
        required: false,
      },
      {
        name: 'type',
        type: 'enum',
        required: false,
        enumValues: ['info', 'warn', 'error', 'success', 'warning', 'idea'],
        description: '@defaultValue info',
      },
      {
        name: 'icon',
        type: 'reactnode',
        required: false,
        description: 'Force an icon',
      },
    ],
    displayName: 'Callout',
    category: 'content',
    description: 'Highlight important context in a bordered callout box.',
    icon: 'info',
    searchTerms: ['note', 'warning', 'tip', 'info', 'alert'],
  },
  Tabs: {
    props: [
      {
        name: 'defaultIndex',
        type: 'number',
        required: false,
        description: 'Shortcut for `defaultValue` when `items` is provided.\n@defaultValue 0',
      },
      {
        name: 'label',
        type: 'reactnode',
        required: false,
        description: 'Additional label in tabs list when `items` is provided.',
      },
      {
        name: 'defaultValue',
        type: 'string',
        required: false,
        description: 'The value of the tab to select by default, if uncontrolled',
      },
      {
        name: 'dir',
        type: 'enum',
        required: false,
        enumValues: ['ltr', 'rtl'],
        description: 'The direction of navigation between toolbar items.',
      },
      {
        name: 'asChild',
        type: 'boolean',
        required: false,
      },
      {
        name: 'groupId',
        type: 'string',
        required: false,
        description: 'Identifier for Sharing value of tabs',
      },
      {
        name: 'persist',
        type: 'boolean',
        required: false,
        description: 'Enable persistent',
      },
      {
        name: 'updateAnchor',
        type: 'boolean',
        required: false,
        description: "If true, updates the URL hash based on the tab's id",
      },
      {
        name: 'orientation',
        type: 'enum',
        required: false,
        enumValues: ['horizontal', 'vertical'],
        description:
          'The orientation the tabs are layed out.\nMainly so arrow navigation is done accordingly (left & right vs. up & down)\n@defaultValue horizontal',
      },
      {
        name: 'activationMode',
        type: 'enum',
        required: false,
        enumValues: ['manual', 'automatic'],
        description:
          'Whether a tab is activated automatically or manually.\n@defaultValue automatic',
      },
    ],
    displayName: 'Tabs',
    category: 'layout',
    description: 'Show multiple tabbed content variants side by side.',
    icon: 'columns-2',
    searchTerms: ['tab', 'switcher'],
  },
  Tab: {
    props: [
      {
        name: 'value',
        type: 'string',
        required: false,
        description: 'Value of tab, detect from index if unspecified.',
      },
      {
        name: 'asChild',
        type: 'boolean',
        required: false,
      },
    ],
    displayName: 'Tab',
    category: 'layout',
    description: 'A single tab inside a Tabs container.',
    searchTerms: ['tab-item'],
  },
  Card: {
    props: [
      {
        name: 'icon',
        type: 'reactnode',
        required: false,
      },
      {
        name: 'title',
        type: 'reactnode',
        required: true,
      },
      {
        name: 'description',
        type: 'reactnode',
        required: false,
      },
      {
        name: 'href',
        type: 'string',
        required: false,
      },
      {
        name: 'external',
        type: 'boolean',
        required: false,
      },
    ],
    displayName: 'Card',
    category: 'content',
    description: 'Linked documentation card with title and optional description.',
    icon: 'square',
    searchTerms: ['link', 'cta'],
  },
  Cards: {
    props: [],
    displayName: 'Cards',
    category: 'layout',
    description: 'Grid container for multiple Card components.',
    searchTerms: ['card-grid', 'card-list'],
  },
  Steps: {
    props: [
      {
        name: 'children',
        type: 'reactnode',
        required: true,
      },
    ],
    displayName: 'Steps',
    category: 'layout',
    description: 'Numbered sequence of steps for guides and tutorials.',
    icon: 'list-ordered',
    searchTerms: ['guide', 'process', 'tutorial'],
  },
  Step: {
    props: [
      {
        name: 'children',
        type: 'reactnode',
        required: true,
      },
    ],
    displayName: 'Step',
    category: 'layout',
    description: 'A single step inside a Steps container.',
    searchTerms: ['step-item'],
  },
  Accordion: {
    props: [
      {
        name: 'asChild',
        type: 'boolean',
        required: false,
      },
      {
        name: 'disabled',
        type: 'boolean',
        required: false,
        description:
          'Whether or not an accordion item is disabled from user interaction.\n@defaultValue false',
      },
      {
        name: 'title',
        type: 'reactnode',
        required: true,
      },
      {
        name: 'value',
        type: 'string',
        required: false,
      },
    ],
    displayName: 'Accordion',
    category: 'content',
    description: 'Collapsible disclosure section with a title.',
    icon: 'chevrons-down-up',
    searchTerms: ['details', 'collapse', 'foldable'],
  },
  Accordions: {
    props: [
      {
        name: 'type',
        type: 'enum',
        required: true,
        enumValues: ['single', 'multiple'],
      },
      {
        name: 'collapsible',
        type: 'boolean',
        required: false,
        defaultValue: false,
        description: 'Whether an accordion item can be collapsed after it has been opened.',
      },
      {
        name: 'disabled',
        type: 'boolean',
        required: false,
        description:
          'Whether or not an accordion item is disabled from user interaction.\n@defaultValue false',
      },
      {
        name: 'orientation',
        type: 'enum',
        required: false,
        defaultValue: 'vertical',
        enumValues: ['horizontal', 'vertical'],
        description: 'The layout in which the Accordion operates.',
      },
      {
        name: 'dir',
        type: 'enum',
        required: false,
        enumValues: ['ltr', 'rtl'],
        description: 'The language read direction.',
      },
      {
        name: 'asChild',
        type: 'boolean',
        required: false,
      },
    ],
    displayName: 'Accordions',
    category: 'layout',
    description: 'Container that groups multiple Accordion items.',
    searchTerms: ['accordion-group'],
  },
  ImageZoom: {
    props: [],
    displayName: 'Image Zoom',
    category: 'media',
    description: 'Zoomable image with click-to-expand.',
    icon: 'zoom-in',
    searchTerms: ['image', 'photo', 'screenshot', 'zoom'],
  },
  Files: {
    props: [],
    displayName: 'Files',
    category: 'layout',
    description: 'File tree display with nested files and folders.',
    icon: 'folder',
    searchTerms: ['file-tree', 'directory'],
  },
  File: {
    props: [
      {
        name: 'name',
        type: 'string',
        required: true,
      },
      {
        name: 'icon',
        type: 'reactnode',
        required: false,
      },
    ],
    displayName: 'File',
    category: 'layout',
    description: 'A single file entry inside a Files tree.',
    searchTerms: ['file-item'],
  },
  Folder: {
    props: [
      {
        name: 'name',
        type: 'string',
        required: true,
      },
      {
        name: 'disabled',
        type: 'boolean',
        required: false,
      },
      {
        name: 'defaultOpen',
        type: 'boolean',
        required: false,
        description: 'Open folder by default\n@defaultValue false',
      },
    ],
    displayName: 'Folder',
    category: 'layout',
    description: 'A folder entry inside a Files tree.',
    searchTerms: ['folder-item', 'directory-item'],
  },
  TypeTable: {
    props: [],
    displayName: 'Type Table',
    category: 'data',
    description: 'Auto-generated props/types reference table.',
    icon: 'table',
    searchTerms: ['type-table', 'props-table', 'api'],
  },
  Banner: {
    props: [
      {
        name: 'height',
        type: 'string',
        required: false,
        description: '@defaultValue 3rem',
      },
      {
        name: 'variant',
        type: 'enum',
        required: false,
        enumValues: ['rainbow', 'normal'],
        description: "@defaultValue 'normal'",
      },
      {
        name: 'changeLayout',
        type: 'boolean',
        required: false,
        description: 'Change Fumadocs layout styles\n@defaultValue true',
      },
    ],
    displayName: 'Banner',
    category: 'content',
    description: 'Full-width announcement or notice banner.',
    icon: 'megaphone',
    searchTerms: ['announcement', 'notice'],
  },
  InlineTOC: {
    props: [
      {
        name: 'defaultOpen',
        type: 'boolean',
        required: false,
      },
      {
        name: 'open',
        type: 'boolean',
        required: false,
      },
      {
        name: 'disabled',
        type: 'boolean',
        required: false,
      },
      {
        name: 'asChild',
        type: 'boolean',
        required: false,
      },
    ],
    displayName: 'Inline TOC',
    category: 'content',
    description: 'Inline table of contents for the current page.',
    icon: 'list',
    searchTerms: ['toc', 'table-of-contents'],
  },
  Video: {
    props: [
      {
        name: 'src',
        type: 'string',
        required: true,
      },
      {
        name: 'hideTrigger',
        type: 'boolean',
        required: false,
      },
      {
        name: 'fullView',
        type: 'boolean',
        required: false,
      },
      {
        name: 'title',
        type: 'string',
        required: false,
      },
      {
        name: 'hint',
        type: 'string',
        required: false,
      },
    ],
    displayName: 'Video',
    category: 'media',
    description: 'Embedded video player with optional title.',
    icon: 'play',
    searchTerms: ['video', 'media', 'player'],
  },
  Frame: {
    props: [
      {
        name: 'children',
        type: 'reactnode',
        required: true,
      },
      {
        name: 'hint',
        type: 'string',
        required: false,
      },
      {
        name: 'className',
        type: 'string',
        required: false,
      },
      {
        name: 'cta',
        type: 'reactnode',
        required: false,
      },
    ],
    displayName: 'Frame',
    category: 'media',
    description: 'Embedded iframe for external content.',
    icon: 'frame',
    searchTerms: ['iframe', 'embed', 'frame'],
  },
  CodeGroup: {
    props: [],
    displayName: 'Code Group',
    category: 'content',
    description: 'Grouped code examples under a shared heading.',
    icon: 'braces',
    searchTerms: ['code-group', 'code-tabs', 'snippet'],
  },
  Mermaid: {
    props: [
      {
        name: 'chart',
        type: 'string',
        required: true,
        description: 'Mermaid diagram source code',
      },
    ],
    displayName: 'Mermaid',
    category: 'data',
    description: 'Mermaid diagram rendered from a chart definition.',
    icon: 'git-branch',
    searchTerms: ['diagram', 'chart', 'flowchart'],
  },
  Audio: {
    props: [
      {
        name: 'src',
        type: 'string',
        required: true,
        description: 'URL of the audio file',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        description: 'Optional title displayed above the player',
      },
    ],
    displayName: 'Audio',
    category: 'media',
    description: 'Embedded audio player with optional title.',
    icon: 'volume-2',
    searchTerms: ['audio', 'sound', 'podcast'],
  },
};
