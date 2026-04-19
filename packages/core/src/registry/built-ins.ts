/**
 * Built-ins manifest — 18 component JsxComponentMeta entries.
 *
 * 16 fumadocs-ui + Mermaid + Audio shadcn wrappers.
 * Hand-authored PropDef arrays (react-docgen-typescript has known extraction
 * failures with ForwardRefExoticComponent, Omit<>/Pick<>, and generic <T> —
 * see FR-28). Generated props can supplement these via build-registry.ts.
 *
 * ── Intent-of-ship ───────────────────────────────────────────────────────
 *
 * This manifest is the shipped default for the fumadocs-ui consumer (the
 * `@inkeep/open-knowledge-app` frontend). If open-knowledge is embedded in
 * a non-fumadocs shell, that consumer should build an alternative manifest
 * via `createRegistry()` + `.set(...)` rather than extend or mutate this
 * one. The decision to adopt the fumadocs vocabulary as the shipped default
 * is locked in SPEC §9 and rests on: (1) the first-party consumer renders
 * fumadocs-ui; (2) precedent #5 (contract-first) favors one authoritative
 * vocabulary over a menu of optional ones; (3) the greenfield directive
 * forbids shipping empty-scaffolding registries.
 *
 * When a second first-party consumer materializes (editor embedded in a
 * non-fumadocs shell), split this file into a separate
 * `@inkeep/open-knowledge-fumadocs-components` workspace package and keep
 * `packages/core/src/registry/` down to the factory + types. Re-evaluating
 * before that materializes would be a premature abstraction.
 */
import type { JsxComponentMeta, PropDef } from './types.ts';

// ── Callout ──────────────────────────────────────────────────────────────────

const calloutProps: PropDef[] = [
  {
    name: 'type',
    type: 'enum',
    enumValues: ['info', 'warn', 'error', 'success', 'warning', 'idea'],
    defaultValue: 'info',
    required: false,
    description: 'Visual variant of the callout',
  },
  {
    name: 'icon',
    type: 'reactnode',
    required: false,
    description: 'Custom icon override',
  },
  {
    name: 'children',
    type: 'reactnode',
    required: true,
    description: 'Callout content',
  },
];

// ── Card / Cards ─────────────────────────────────────────────────────────────

const cardProps: PropDef[] = [
  {
    name: 'title',
    type: 'string',
    required: true,
    description: 'Card title',
  },
  {
    name: 'description',
    type: 'string',
    required: false,
    description: 'Card description',
  },
  {
    name: 'href',
    type: 'string',
    required: false,
    description: 'Link URL',
  },
  {
    name: 'external',
    type: 'boolean',
    defaultValue: false,
    required: false,
    description: 'Open in new tab',
  },
  {
    name: 'icon',
    type: 'reactnode',
    required: false,
    description: 'Card icon',
  },
  {
    name: 'children',
    type: 'reactnode',
    required: false,
    description: 'Card body content',
  },
];

const cardsProps: PropDef[] = [
  {
    name: 'children',
    type: 'reactnode',
    required: true,
    description: 'Card children',
  },
];

// ── Steps / Step ─────────────────────────────────────────────────────────────

const stepsProps: PropDef[] = [
  {
    name: 'children',
    type: 'reactnode',
    required: true,
    description: 'Step children',
  },
];

const stepProps: PropDef[] = [
  {
    name: 'children',
    type: 'reactnode',
    required: true,
    description: 'Step content',
  },
];

// ── Tabs / Tab ───────────────────────────────────────────────────────────────

const tabsProps: PropDef[] = [
  {
    name: 'items',
    type: 'string',
    required: false,
    description: 'Tab names (simple mode)',
    hidden: true,
  },
  {
    name: 'defaultIndex',
    type: 'number',
    defaultValue: 0,
    required: false,
    description: 'Initially active tab index',
  },
  {
    name: 'children',
    type: 'reactnode',
    required: true,
    description: 'Tab children',
  },
];

const tabProps: PropDef[] = [
  {
    name: 'value',
    type: 'string',
    required: false,
    description: 'Tab value identifier',
  },
  {
    name: 'children',
    type: 'reactnode',
    required: true,
    description: 'Tab panel content',
  },
];

// ── Accordion / Accordions ───────────────────────────────────────────────────

const accordionsProps: PropDef[] = [
  {
    name: 'type',
    type: 'enum',
    enumValues: ['single', 'multiple'],
    defaultValue: 'single',
    required: false,
    description: 'Accordion selection mode',
  },
  {
    name: 'children',
    type: 'reactnode',
    required: true,
    description: 'Accordion items',
  },
];

const accordionProps: PropDef[] = [
  {
    name: 'title',
    type: 'string',
    required: true,
    description: 'Accordion item title',
  },
  {
    name: 'children',
    type: 'reactnode',
    required: true,
    description: 'Accordion item content',
  },
];

// ── Files / Folder / File ────────────────────────────────────────────────────

const filesProps: PropDef[] = [
  {
    name: 'children',
    type: 'reactnode',
    required: true,
    description: 'File tree children',
  },
];

const folderProps: PropDef[] = [
  {
    name: 'name',
    type: 'string',
    required: true,
    description: 'Folder name',
  },
  {
    name: 'defaultOpen',
    type: 'boolean',
    defaultValue: false,
    required: false,
    description: 'Initially expanded',
  },
  {
    name: 'disabled',
    type: 'boolean',
    defaultValue: false,
    required: false,
    description: 'Disable toggle',
  },
  {
    name: 'children',
    type: 'reactnode',
    required: true,
    description: 'Folder children',
  },
];

const fileProps: PropDef[] = [
  {
    name: 'name',
    type: 'string',
    required: true,
    description: 'File name',
  },
  {
    name: 'icon',
    type: 'reactnode',
    required: false,
    description: 'Custom file icon',
  },
];

// ── ImageZoom ────────────────────────────────────────────────────────────────

const imageZoomProps: PropDef[] = [
  {
    name: 'src',
    type: 'string',
    required: true,
    description: 'Image source URL',
  },
  {
    name: 'alt',
    type: 'string',
    required: false,
    defaultValue: '',
    description: 'Alt text',
  },
  {
    name: 'width',
    type: 'number',
    required: false,
    description: 'Image width',
  },
  {
    name: 'height',
    type: 'number',
    required: false,
    description: 'Image height',
  },
  {
    name: 'children',
    type: 'reactnode',
    required: false,
    description: 'Image caption',
  },
];

// ── Banner ───────────────────────────────────────────────────────────────────

const bannerProps: PropDef[] = [
  {
    name: 'id',
    type: 'string',
    required: false,
    description: 'Banner dismissal ID',
  },
  {
    name: 'variant',
    type: 'enum',
    enumValues: ['normal', 'rainbow'],
    defaultValue: 'normal',
    required: false,
    description: 'Visual variant',
  },
  {
    name: 'children',
    type: 'reactnode',
    required: true,
    description: 'Banner content',
  },
];

// ── TypeTable ────────────────────────────────────────────────────────────────

const typeTableProps: PropDef[] = [
  {
    name: 'type',
    type: 'string',
    required: true,
    description: 'Type definitions (JSON object)',
    hidden: true,
  },
  {
    name: 'children',
    type: 'reactnode',
    required: false,
    description: 'Additional content',
  },
];

// ── InlineTOC ────────────────────────────────────────────────────────────────

const inlineTocProps: PropDef[] = [
  {
    name: 'children',
    type: 'reactnode',
    required: false,
    description: 'TOC content',
  },
];

// ── Mermaid (shadcn wrapper) ─────────────────────────────────────────────────

const mermaidProps: PropDef[] = [
  {
    name: 'chart',
    type: 'string',
    required: true,
    description: 'Mermaid diagram definition',
  },
];

// ── Audio (shadcn wrapper) ───────────────────────────────────────────────────

const audioProps: PropDef[] = [
  {
    name: 'src',
    type: 'string',
    required: true,
    description: 'Audio source URL',
  },
  {
    name: 'title',
    type: 'string',
    required: false,
    description: 'Audio title',
  },
];

// ── Manifest ─────────────────────────────────────────────────────────────────

export const builtInComponents: JsxComponentMeta[] = [
  // Content
  {
    name: 'Callout',
    hasChildren: true,
    props: calloutProps,
    icon: 'MessageSquareWarning',
    category: 'content',
    displayName: 'Callout',
    description: 'Callout box with type variants (info, warning, error, etc.)',
    searchTerms: ['note', 'warning', 'tip', 'info', 'alert', 'admonition'],
  },
  {
    name: 'Card',
    hasChildren: false,
    isSelfClosing: true,
    props: cardProps,
    icon: 'SquareMousePointer',
    category: 'content',
    displayName: 'Card',
    description: 'Linked card with title, description, and optional icon',
    searchTerms: ['link', 'preview', 'card'],
  },
  {
    name: 'Cards',
    hasChildren: true,
    props: cardsProps,
    icon: 'LayoutGrid',
    category: 'layout',
    displayName: 'Cards',
    description: 'Grid container for Card components',
    searchTerms: ['grid', 'cards', 'layout'],
    emptyChildName: 'Card',
  },
  {
    name: 'Steps',
    hasChildren: true,
    props: stepsProps,
    icon: 'ListOrdered',
    category: 'content',
    displayName: 'Steps',
    description: 'Numbered step-by-step guide container',
    searchTerms: ['guide', 'tutorial', 'howto', 'steps', 'numbered'],
    emptyChildName: 'Step',
  },
  {
    name: 'Step',
    hasChildren: true,
    props: stepProps,
    icon: 'Hash',
    category: 'content',
    displayName: 'Step',
    description: 'Individual step inside Steps',
    searchTerms: ['step'],
  },

  // Layout — Tabs
  {
    name: 'Tabs',
    hasChildren: true,
    props: tabsProps,
    icon: 'PanelTop',
    category: 'layout',
    displayName: 'Tabs',
    description: 'Tabbed content container',
    searchTerms: ['tabs', 'tabbed', 'switch'],
    emptyChildName: 'Tab',
  },
  {
    name: 'Tab',
    hasChildren: true,
    props: tabProps,
    icon: 'Square',
    category: 'layout',
    displayName: 'Tab',
    description: 'Individual tab panel inside Tabs',
    searchTerms: ['tab', 'panel'],
  },

  // Layout — Accordion
  {
    name: 'Accordions',
    hasChildren: true,
    props: accordionsProps,
    icon: 'ChevronsUpDown',
    category: 'layout',
    displayName: 'Accordions',
    description: 'Collapsible accordion container',
    searchTerms: ['accordion', 'collapse', 'expand', 'faq'],
    emptyChildName: 'Accordion',
  },
  {
    name: 'Accordion',
    hasChildren: true,
    props: accordionProps,
    icon: 'ChevronDown',
    category: 'layout',
    displayName: 'Accordion',
    description: 'Individual accordion item with title',
    searchTerms: ['accordion', 'item'],
  },

  // Layout — Files
  {
    name: 'Files',
    hasChildren: true,
    props: filesProps,
    icon: 'FolderTree',
    category: 'layout',
    displayName: 'Files',
    description: 'File tree visualization',
    searchTerms: ['files', 'tree', 'directory', 'filesystem'],
    emptyChildName: 'File',
  },
  {
    name: 'Folder',
    hasChildren: true,
    props: folderProps,
    icon: 'FolderOpen',
    category: 'layout',
    displayName: 'Folder',
    description: 'Folder node in file tree',
    searchTerms: ['folder', 'directory'],
    emptyChildName: 'File',
  },
  {
    name: 'File',
    hasChildren: false,
    isSelfClosing: true,
    props: fileProps,
    icon: 'FileText',
    category: 'layout',
    displayName: 'File',
    description: 'File node in file tree',
    searchTerms: ['file'],
  },

  // Media
  {
    name: 'ImageZoom',
    hasChildren: false,
    isSelfClosing: true,
    props: imageZoomProps,
    icon: 'ZoomIn',
    category: 'media',
    displayName: 'Image Zoom',
    description: 'Image with click-to-zoom',
    searchTerms: ['image', 'zoom', 'picture', 'photo'],
  },
  {
    name: 'Banner',
    hasChildren: true,
    props: bannerProps,
    icon: 'Flag',
    category: 'content',
    displayName: 'Banner',
    description: 'Top-of-page announcement banner',
    searchTerms: ['banner', 'announcement', 'notice'],
  },

  // Data
  {
    name: 'TypeTable',
    hasChildren: false,
    props: typeTableProps,
    icon: 'Table',
    category: 'data',
    displayName: 'Type Table',
    description: 'API type/prop documentation table',
    searchTerms: ['type', 'table', 'api', 'props', 'parameters'],
  },
  {
    name: 'InlineTOC',
    hasChildren: false,
    props: inlineTocProps,
    icon: 'List',
    category: 'content',
    displayName: 'Inline TOC',
    description: 'Inline table of contents',
    searchTerms: ['toc', 'table of contents', 'outline'],
  },

  // Shadcn wrappers
  {
    name: 'Mermaid',
    hasChildren: false,
    isSelfClosing: true,
    props: mermaidProps,
    icon: 'GitGraph',
    category: 'data',
    displayName: 'Mermaid',
    description: 'Mermaid diagram (flowchart, sequence, etc.)',
    searchTerms: ['mermaid', 'diagram', 'flowchart', 'graph', 'chart'],
  },
  {
    name: 'Audio',
    hasChildren: false,
    isSelfClosing: true,
    props: audioProps,
    icon: 'Volume2',
    category: 'media',
    displayName: 'Audio',
    description: 'Audio player',
    searchTerms: ['audio', 'sound', 'music', 'mp3'],
  },
];
