/**
 * Hand-maintained source of truth for the 15 built-in component families.
 *
 * Each entry names the exact .d.ts or .tsx file to extract props from,
 * plus display metadata. Does NOT import React components (core is React-free).
 *
 * Three sourcing layers (D15):
 *   - Fumadocs (canonical, 10 families): Callout, Tabs, Tab, Card, Cards,
 *     Steps, Step, Accordion, Accordions, ImageZoom, Files, File, Folder,
 *     TypeTable, Banner, InlineTOC
 *   - Docskit (gap fill, 3): Video, Frame, CodeGroup
 *   - Shadcn (gap fill, 2): Mermaid, Audio
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import type { BuiltInManifestEntry } from './types.ts';

const require = createRequire(import.meta.url);

/**
 * Resolves a .d.ts path inside a node_modules package.
 * Uses require.resolve on package.json (always in exports) + path.join.
 * Works around package.json exports restrictions that block direct dist/ imports.
 */
function resolveDts(packageName: string, relativePath: string): string {
  const pkgDir = path.dirname(require.resolve(`${packageName}/package.json`));
  return path.join(pkgDir, relativePath);
}

/** Directory of this source file — works in Bun (import.meta.dir), Node 22+ (import.meta.dirname), and Vite (URL fallback). */
const __ownDir: string =
  import.meta.dir ??
  (import.meta.dirname as string | undefined) ??
  path.dirname(new URL(import.meta.url).pathname);

/**
 * Resolves a file relative to the monorepo app package.
 * Shadcn-installed components live at packages/app/src/components/ui/.
 */
function resolveAppComponent(relativePath: string): string {
  return path.resolve(__ownDir, '../../../app/src/components/ui', relativePath);
}

export const BUILT_INS: BuiltInManifestEntry[] = [
  // ─── Fumadocs (canonical, 10 families) ───────────────────────────────

  {
    name: 'Callout',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/callout.d.ts'),
    category: 'content',
    displayName: 'Callout',
    icon: 'info',
    description: 'Highlight important context in a bordered callout box.',
    searchTerms: ['note', 'warning', 'tip', 'info', 'alert'],
  },
  {
    name: 'Tabs',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/tabs.d.ts'),
    category: 'layout',
    displayName: 'Tabs',
    icon: 'columns-2',
    description: 'Show multiple tabbed content variants side by side.',
    searchTerms: ['tab', 'switcher'],
  },
  {
    name: 'Tab',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/tabs.d.ts'),
    category: 'layout',
    displayName: 'Tab',
    description: 'A single tab inside a Tabs container.',
    searchTerms: ['tab-item'],
  },
  {
    name: 'Card',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/card.d.ts'),
    category: 'content',
    displayName: 'Card',
    icon: 'square',
    description: 'Linked documentation card with title and optional description.',
    searchTerms: ['link', 'cta'],
  },
  {
    name: 'Cards',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/card.d.ts'),
    category: 'layout',
    displayName: 'Cards',
    description: 'Grid container for multiple Card components.',
    searchTerms: ['card-grid', 'card-list'],
  },
  {
    name: 'Steps',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/steps.d.ts'),
    category: 'layout',
    displayName: 'Steps',
    icon: 'list-ordered',
    description: 'Numbered sequence of steps for guides and tutorials.',
    searchTerms: ['guide', 'process', 'tutorial'],
  },
  {
    name: 'Step',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/steps.d.ts'),
    category: 'layout',
    displayName: 'Step',
    description: 'A single step inside a Steps container.',
    searchTerms: ['step-item'],
  },
  {
    name: 'Accordion',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/accordion.d.ts'),
    category: 'content',
    displayName: 'Accordion',
    icon: 'chevrons-down-up',
    description: 'Collapsible disclosure section with a title.',
    searchTerms: ['details', 'collapse', 'foldable'],
  },
  {
    name: 'Accordions',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/accordion.d.ts'),
    category: 'layout',
    displayName: 'Accordions',
    description: 'Container that groups multiple Accordion items.',
    searchTerms: ['accordion-group'],
  },
  {
    name: 'ImageZoom',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/image-zoom.d.ts'),
    category: 'media',
    displayName: 'Image Zoom',
    icon: 'zoom-in',
    description: 'Zoomable image with click-to-expand.',
    searchTerms: ['image', 'photo', 'screenshot', 'zoom'],
  },
  {
    name: 'Files',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/files.d.ts'),
    category: 'layout',
    displayName: 'Files',
    icon: 'folder',
    description: 'File tree display with nested files and folders.',
    searchTerms: ['file-tree', 'directory'],
  },
  {
    name: 'File',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/files.d.ts'),
    category: 'layout',
    displayName: 'File',
    description: 'A single file entry inside a Files tree.',
    searchTerms: ['file-item'],
  },
  {
    name: 'Folder',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/files.d.ts'),
    category: 'layout',
    displayName: 'Folder',
    description: 'A folder entry inside a Files tree.',
    searchTerms: ['folder-item', 'directory-item'],
  },
  {
    name: 'TypeTable',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/type-table.d.ts'),
    category: 'data',
    displayName: 'Type Table',
    icon: 'table',
    description: 'Auto-generated props/types reference table.',
    searchTerms: ['type-table', 'props-table', 'api'],
  },
  {
    name: 'Banner',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/banner.d.ts'),
    category: 'content',
    displayName: 'Banner',
    icon: 'megaphone',
    description: 'Full-width announcement or notice banner.',
    searchTerms: ['announcement', 'notice'],
  },
  {
    name: 'InlineTOC',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/inline-toc.d.ts'),
    category: 'content',
    displayName: 'Inline TOC',
    icon: 'list',
    description: 'Inline table of contents for the current page.',
    searchTerms: ['toc', 'table-of-contents'],
  },

  // ─── Docskit (gap fill, 3) ───────────────────────────────────────────

  {
    name: 'Video',
    sourceFile: resolveDts('@inkeep/docskit', 'dist/mdx.d.ts'),
    category: 'media',
    displayName: 'Video',
    icon: 'play',
    description: 'Embedded video player with optional title.',
    searchTerms: ['video', 'media', 'player'],
  },
  {
    name: 'Frame',
    sourceFile: resolveDts('@inkeep/docskit', 'dist/mdx.d.ts'),
    category: 'media',
    displayName: 'Frame',
    icon: 'frame',
    description: 'Embedded iframe for external content.',
    searchTerms: ['iframe', 'embed', 'frame'],
  },
  {
    name: 'CodeGroup',
    sourceFile: resolveDts('@inkeep/docskit', 'dist/mdx.d.ts'),
    category: 'content',
    displayName: 'Code Group',
    icon: 'braces',
    description: 'Grouped code examples under a shared heading.',
    searchTerms: ['code-group', 'code-tabs', 'snippet'],
  },

  // ─── Shadcn (gap fill, 2) ───────────────────────────────────────────

  {
    name: 'Mermaid',
    sourceFile: resolveAppComponent('mermaid.tsx'),
    category: 'data',
    displayName: 'Mermaid',
    icon: 'git-branch',
    description: 'Mermaid diagram rendered from a chart definition.',
    searchTerms: ['diagram', 'chart', 'flowchart'],
  },
  {
    name: 'Audio',
    sourceFile: resolveAppComponent('audio.tsx'),
    category: 'media',
    displayName: 'Audio',
    icon: 'volume-2',
    description: 'Embedded audio player with optional title.',
    searchTerms: ['audio', 'sound', 'podcast'],
  },
];
