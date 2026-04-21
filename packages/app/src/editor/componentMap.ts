/**
 * V2 SPEC FR11 — component map consumed by the Option E fallback render.
 *
 * Structure matches `docs/src/mdx-components.tsx:11-26` (getMDXComponents)
 * but AVOIDS importing `fumadocs-ui` directly. The docs-site renders with
 * full fumadocs styling; the editor fallback substitutes a minimal-HTML
 * approximation so the cold-load Suspense fallback paints WITHOUT pulling
 * fumadocs-ui into the editor bundle until CB-v2 ships it as a direct dep
 * (V2 SPEC §16 "ASK_FIRST: Adding a new npm dependency (beyond fumadocs-ui
 * + its transitives already pulled by CB-v2)" — fumadocs-ui is approved but
 * not yet pulled).
 *
 * When CB-v2 lands and fumadocs-ui becomes a direct dep, this file swaps
 * to the real imports with no change to the walker's contract. Callers
 * invoke `getMDXComponents()` to receive the map; the walker passes it to
 * `mdastToElementTree` via `{ componentMap }`.
 *
 * Mermaid carve-out (Audit §B9): renders a fixed-aspect placeholder
 * (aspectRatio 16/9, minHeight 200) with `<pre>` of the source + a
 * `role="status"` label. Accepted layout shift on hydrate — mermaid's
 * 1.5 MB lib is NOT worth the fallback chunk cost.
 */

import { type ComponentType, createElement, type ReactElement, type ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Placeholder components (HTML + semantic classes)
//
// Each function matches the call shape of its fumadocs-ui counterpart.
// When fumadocs-ui becomes a direct dep, swap individual imports.
// ---------------------------------------------------------------------------

interface WithChildren {
  children?: ReactNode;
}

function Callout({
  type = 'info',
  title,
  children,
}: WithChildren & { type?: 'info' | 'warn' | 'error' | 'success'; title?: string }): ReactElement {
  return createElement(
    'div',
    {
      className: `ok-fallback-callout ok-fallback-callout-${type}`,
      role: 'note',
      'data-fumadocs-placeholder': 'Callout',
    },
    title ? createElement('div', { className: 'ok-fallback-callout-title' }, title) : null,
    createElement('div', { className: 'ok-fallback-callout-body' }, children),
  );
}

function Tabs({ children, items }: WithChildren & { items?: string[] }): ReactElement {
  return createElement(
    'div',
    { className: 'ok-fallback-tabs', role: 'tablist', 'data-fumadocs-placeholder': 'Tabs' },
    items && items.length > 0
      ? createElement(
          'div',
          { className: 'ok-fallback-tabs-header' },
          items.map((label, i) =>
            createElement(
              'span',
              { key: `${label}-${i}`, role: 'tab', className: 'ok-fallback-tab-label' },
              label,
            ),
          ),
        )
      : null,
    createElement('div', { className: 'ok-fallback-tabs-body' }, children),
  );
}

function Tab({ children, value }: WithChildren & { value?: string }): ReactElement {
  return createElement(
    'div',
    { className: 'ok-fallback-tab', role: 'tabpanel', 'data-tab-value': value },
    children,
  );
}

function Accordion({ children, title }: WithChildren & { title?: string }): ReactElement {
  return createElement(
    'details',
    { className: 'ok-fallback-accordion', 'data-fumadocs-placeholder': 'Accordion' },
    title ? createElement('summary', null, title) : null,
    createElement('div', null, children),
  );
}

function Accordions({ children }: WithChildren): ReactElement {
  return createElement('div', { className: 'ok-fallback-accordions' }, children);
}

function Steps({ children }: WithChildren): ReactElement {
  return createElement(
    'ol',
    { className: 'ok-fallback-steps', 'data-fumadocs-placeholder': 'Steps' },
    children,
  );
}

function Step({ children }: WithChildren): ReactElement {
  return createElement('li', { className: 'ok-fallback-step' }, children);
}

function Card({
  children,
  title,
  href,
}: WithChildren & { title?: string; href?: string }): ReactElement {
  const inner = createElement(
    'div',
    null,
    title ? createElement('div', { className: 'ok-fallback-card-title' }, title) : null,
    createElement('div', null, children),
  );
  if (href) {
    return createElement(
      'a',
      { className: 'ok-fallback-card', href, 'data-fumadocs-placeholder': 'Card' },
      inner,
    );
  }
  return createElement(
    'div',
    { className: 'ok-fallback-card', 'data-fumadocs-placeholder': 'Card' },
    inner,
  );
}

function Cards({ children }: WithChildren): ReactElement {
  return createElement('div', { className: 'ok-fallback-cards' }, children);
}

function Files({ children }: WithChildren): ReactElement {
  return createElement(
    'div',
    { className: 'ok-fallback-files', 'data-fumadocs-placeholder': 'Files' },
    children,
  );
}

function Folder({ children, name }: WithChildren & { name?: string }): ReactElement {
  return createElement(
    'details',
    { className: 'ok-fallback-folder' },
    name ? createElement('summary', null, name) : null,
    children,
  );
}

function ImageZoom({ src, alt }: { src?: string; alt?: string }): ReactElement {
  return createElement('img', {
    className: 'ok-fallback-image-zoom',
    src,
    alt: alt ?? '',
    'data-fumadocs-placeholder': 'ImageZoom',
  });
}

/**
 * Mermaid placeholder (V2 SPEC FR11 Mermaid carve-out, Audit §B9).
 * Fixed aspect-ratio reserves layout space so the real mermaid render (when
 * and if it hydrates post-fallback) doesn't cause layout shift AROUND the
 * block — only WITHIN. Shows raw source as `<pre>` with `role="status"`
 * label for a11y.
 */
function Mermaid({ chart }: { chart?: string }): ReactElement {
  return createElement(
    'div',
    {
      className: 'ok-fallback-mermaid',
      style: { aspectRatio: '16 / 9', minHeight: 200 },
      role: 'status',
      'aria-label': 'Diagram (preview)',
      'data-fumadocs-placeholder': 'Mermaid',
    },
    createElement('pre', { className: 'ok-fallback-mermaid-source' }, chart ?? ''),
  );
}

function TypeTable({
  type,
}: {
  type?: Record<string, { description?: string; type?: string; default?: string }>;
}): ReactElement {
  if (!type || typeof type !== 'object') {
    return createElement('div', { className: 'ok-fallback-type-table' });
  }
  const rows = Object.entries(type).map(([k, v]) =>
    createElement(
      'tr',
      { key: k },
      createElement('td', null, k),
      createElement('td', null, v?.type ?? ''),
      createElement('td', null, v?.description ?? ''),
      createElement('td', null, v?.default ?? ''),
    ),
  );
  return createElement(
    'table',
    { className: 'ok-fallback-type-table', 'data-fumadocs-placeholder': 'TypeTable' },
    createElement(
      'thead',
      null,
      createElement(
        'tr',
        null,
        createElement('th', null, 'Name'),
        createElement('th', null, 'Type'),
        createElement('th', null, 'Description'),
        createElement('th', null, 'Default'),
      ),
    ),
    createElement('tbody', null, ...rows),
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Returns the component map used by the Option E fallback render.
 *
 * Matches `docs/src/mdx-components.tsx` in shape — when fumadocs-ui becomes
 * a direct app dep (CB-v2 or follow-up), the components swap in place and
 * consumers see no API change. `getMDXComponents(additional?)` merges an
 * optional caller-provided map on top for per-page overrides.
 */
export function getMDXComponents(
  additional?: Record<string, ComponentType<unknown>>,
): Record<string, ComponentType<unknown>> {
  return {
    // Base HTML element overrides — fumadocs' `defaultMdxComponents` adds
    // `h1`, `h2`, etc. Placeholder tier just uses native HTML, so no
    // overrides needed here (the walker already emits <h1>..<h6> directly).
    // When fumadocs-ui lands, spread defaultMdxComponents here.
    Callout: Callout as ComponentType<unknown>,
    Tabs: Tabs as ComponentType<unknown>,
    Tab: Tab as ComponentType<unknown>,
    Accordion: Accordion as ComponentType<unknown>,
    Accordions: Accordions as ComponentType<unknown>,
    Steps: Steps as ComponentType<unknown>,
    Step: Step as ComponentType<unknown>,
    Card: Card as ComponentType<unknown>,
    Cards: Cards as ComponentType<unknown>,
    Files: Files as ComponentType<unknown>,
    Folder: Folder as ComponentType<unknown>,
    ImageZoom: ImageZoom as ComponentType<unknown>,
    Image: ImageZoom as ComponentType<unknown>,
    Mermaid: Mermaid as ComponentType<unknown>,
    TypeTable: TypeTable as ComponentType<unknown>,
    ...additional,
  };
}
