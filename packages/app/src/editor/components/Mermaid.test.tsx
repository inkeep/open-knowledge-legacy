/**
 * Mermaid — structural unit tests.
 *
 * Same testing-library-free convention as Math.test.tsx: `renderToString`
 * from `react-dom/server` is the substrate. Mermaid renders via `useEffect`
 * + an async lazy import + `mermaid.render()` call, so under
 * `renderToString` the component lands in its initial placeholder state
 * (the effect fires only on real mount). Live SVG output is exercised via
 * the Playwright visual-regression suite (follow-up VR-MERMAID).
 */

import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { MermaidView } from './Mermaid.tsx';

describe('MermaidView — placeholder branch', () => {
  test('empty chart renders the placeholder shell', () => {
    const html = renderToString(<MermaidView chart="" />);
    expect(html).toContain('class="mermaid mermaid-placeholder"');
    expect(html).toContain('data-component-type="mermaid"');
  });

  test('whitespace-only chart treated as empty', () => {
    const html = renderToString(<MermaidView chart="   " />);
    expect(html).toContain('mermaid-placeholder');
  });

  test('undefined chart treated as empty', () => {
    const html = renderToString(<MermaidView />);
    expect(html).toContain('mermaid-placeholder');
  });

  test('id prop reaches the placeholder DOM (deep-link anchor)', () => {
    const html = renderToString(<MermaidView chart="" id="sys-arch" />);
    expect(html).toContain('id="sys-arch"');
  });
});

describe('MermaidView — pre-render mount state', () => {
  test('non-empty chart starts in idle/rendering state under renderToString', () => {
    // useEffect doesn't run under renderToString, so the component sits in
    // its initial state — `status: 'idle'` — which renders the same shell
    // as the empty placeholder branch except `chart.trim()` is non-empty.
    // We're asserting this for stability: SSR-style render must NOT crash
    // on mermaid mount and must produce visible markup.
    const html = renderToString(<MermaidView chart="graph TD; A-->B;" />);
    expect(html).toContain('data-component-type="mermaid"');
  });

  test('id prop carries through pre-render state', () => {
    const html = renderToString(<MermaidView chart="graph TD; A-->B;" id="diag-1" />);
    expect(html).toContain('id="diag-1"');
  });
});
