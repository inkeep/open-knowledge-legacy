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

/**
 * Resolves a file relative to the monorepo app package.
 * Shadcn-installed components live at packages/app/src/components/ui/.
 */
function resolveAppComponent(relativePath: string): string {
  return path.resolve(import.meta.dir, '../../../app/src/components/ui', relativePath);
}

export const BUILT_INS: BuiltInManifestEntry[] = [
  // ─── Fumadocs (canonical, 10 families) ───────────────────────────────

  {
    name: 'Callout',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/callout.d.ts'),
    category: 'content',
    displayName: 'Callout',
    icon: 'info',
  },
  {
    name: 'Tabs',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/tabs.d.ts'),
    category: 'layout',
    displayName: 'Tabs',
    icon: 'columns-2',
  },
  {
    name: 'Tab',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/tabs.d.ts'),
    category: 'layout',
    displayName: 'Tab',
  },
  {
    name: 'Card',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/card.d.ts'),
    category: 'content',
    displayName: 'Card',
    icon: 'square',
  },
  {
    name: 'Cards',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/card.d.ts'),
    category: 'layout',
    displayName: 'Cards',
  },
  {
    name: 'Steps',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/steps.d.ts'),
    category: 'layout',
    displayName: 'Steps',
    icon: 'list-ordered',
  },
  {
    name: 'Step',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/steps.d.ts'),
    category: 'layout',
    displayName: 'Step',
  },
  {
    name: 'Accordion',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/accordion.d.ts'),
    category: 'content',
    displayName: 'Accordion',
    icon: 'chevrons-down-up',
  },
  {
    name: 'Accordions',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/accordion.d.ts'),
    category: 'layout',
    displayName: 'Accordions',
  },
  {
    name: 'ImageZoom',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/image-zoom.d.ts'),
    category: 'media',
    displayName: 'Image Zoom',
    icon: 'zoom-in',
  },
  {
    name: 'Files',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/files.d.ts'),
    category: 'layout',
    displayName: 'Files',
    icon: 'folder',
  },
  {
    name: 'File',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/files.d.ts'),
    category: 'layout',
    displayName: 'File',
  },
  {
    name: 'Folder',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/files.d.ts'),
    category: 'layout',
    displayName: 'Folder',
  },
  {
    name: 'TypeTable',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/type-table.d.ts'),
    category: 'data',
    displayName: 'Type Table',
    icon: 'table',
  },
  {
    name: 'Banner',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/banner.d.ts'),
    category: 'content',
    displayName: 'Banner',
    icon: 'megaphone',
  },
  {
    name: 'InlineTOC',
    sourceFile: resolveDts('fumadocs-ui', 'dist/components/inline-toc.d.ts'),
    category: 'content',
    displayName: 'Inline TOC',
    icon: 'list',
  },

  // ─── Docskit (gap fill, 3) ───────────────────────────────────────────

  {
    name: 'Video',
    sourceFile: resolveDts('@inkeep/docskit', 'dist/mdx.d.ts'),
    category: 'media',
    displayName: 'Video',
    icon: 'play',
  },
  {
    name: 'Frame',
    sourceFile: resolveDts('@inkeep/docskit', 'dist/mdx.d.ts'),
    category: 'media',
    displayName: 'Frame',
    icon: 'frame',
  },
  {
    name: 'CodeGroup',
    sourceFile: resolveDts('@inkeep/docskit', 'dist/mdx.d.ts'),
    category: 'content',
    displayName: 'Code Group',
    icon: 'braces',
  },

  // ─── Shadcn (gap fill, 2) ───────────────────────────────────────────

  {
    name: 'Mermaid',
    sourceFile: resolveAppComponent('mermaid.tsx'),
    category: 'data',
    displayName: 'Mermaid',
    icon: 'git-branch',
  },
  {
    name: 'Audio',
    sourceFile: resolveAppComponent('audio.tsx'),
    category: 'media',
    displayName: 'Audio',
    icon: 'volume-2',
  },
];
