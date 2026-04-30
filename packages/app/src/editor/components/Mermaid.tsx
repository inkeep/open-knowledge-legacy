/**
 * MermaidView — DIY renderer for the canonical `<Mermaid>` block descriptor.
 *
 * Re-introduces Mermaid support that was removed 2026-04-21 (placeholder
 * stub deleted per the greenfield directive — don't claim capability the
 * code doesn't deliver). Now ships with a real renderer.
 *
 * Mermaid is browser-only (no first-party SSR per upstream issue #3650),
 * which fits OK's Vite + React 19 client perfectly. The library is lazy-
 * imported on first mount to keep the editor's first-load JS unaffected
 * for documents without diagrams; cost at first diagram is ~150 KB
 * gzipped (entry ~11 KB + lazy diagram-type chunks 24-45 KB each).
 *
 * `mermaid.render(id, chart)` is async and returns `{ svg }`. We
 * generate a unique id per render, await the result, and inject the SVG
 * via `dangerouslySetInnerHTML`. `securityLevel: 'strict'` (the default)
 * keeps Mermaid from emitting scripts inside the SVG; the storage layer
 * is unchanged either way (chart source is the prop value, render output
 * is rebuilt every mount).
 *
 * On parse error: Mermaid throws a synchronous error from `parse()` and
 * an async rejection from `render()`. We render the chart source verbatim
 * inside a tagged error chrome (red border + tooltip) so authors see
 * what they typed and can fix it. Co-editor DoS via malformed mermaid is
 * not a concern — error path stays inside the React boundary.
 */

import { useEffect, useId, useState } from 'react';

interface MermaidProps {
  chart?: string;
  id?: string;
  /**
   * Forward-compat hint for theme. Mermaid supports `default`, `dark`,
   * `forest`, `neutral`. Phase 1 ships `default` only — theme prop reads
   * but a future iteration would reinitialize Mermaid per-instance.
   */
  theme?: string;
}

interface RenderState {
  status: 'idle' | 'rendering' | 'ready' | 'error';
  svg: string;
  error: string;
}

/**
 * One-time initialization. Called lazily on the first render attempt so
 * documents without Mermaid pay nothing. Subsequent calls are no-ops via
 * the module-level guard.
 */
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null;
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid')
      .then((mod) => {
        const m = mod.default;
        m.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'default',
          suppressErrorRendering: true,
        });
        return m;
      })
      .catch((err) => {
        // Clear the cached rejection so the next mount can retry. Without
        // this, a transient network failure during the first import would
        // disable Mermaid for the entire session — every subsequent
        // `loadMermaid()` would resolve to the cached rejected promise.
        mermaidPromise = null;
        throw err;
      });
  }
  return mermaidPromise;
}

export function MermaidView(props: MermaidProps) {
  const chart = props.chart ?? '';
  const reactId = useId();
  const renderId = `mermaid-${reactId.replace(/:/g, '_')}`;
  const [state, setState] = useState<RenderState>({ status: 'idle', svg: '', error: '' });

  useEffect(() => {
    if (!chart.trim()) {
      setState({ status: 'idle', svg: '', error: '' });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, status: 'rendering' }));
    loadMermaid()
      .then(async (m) => {
        try {
          // Mermaid's `render` builds a hidden `<div id={renderId}>`
          // off-screen, computes layout, and returns the inert SVG
          // string. The DOM scratchpad is cleaned up by Mermaid itself.
          const result = await m.render(renderId, chart);
          if (!cancelled) {
            setState({ status: 'ready', svg: result.svg, error: '' });
          }
        } catch (err) {
          if (!cancelled) {
            const msg = err instanceof Error ? err.message : String(err);
            setState({ status: 'error', svg: '', error: msg });
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : String(err);
          setState({ status: 'error', svg: '', error: msg });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [chart, renderId]);

  if (!chart.trim()) {
    return (
      <div className="mermaid mermaid-placeholder" data-component-type="mermaid" id={props.id}>
        <span className="mermaid-empty"> </span>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div
        className="mermaid mermaid-error"
        data-component-type="mermaid"
        title={state.error}
        id={props.id}
      >
        <pre className="mermaid-error-source">{chart}</pre>
        {/* Visible error text — `title` alone is unreachable on touch / mobile
            and unannounced by most screen readers. The chart source above shows
            WHAT the author wrote; this paragraph shows WHY mermaid rejected it. */}
        <p className="mermaid-error-message">{state.error}</p>
      </div>
    );
  }

  return (
    <div
      className="mermaid mermaid-ready"
      data-component-type="mermaid"
      id={props.id}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid.render with securityLevel:'strict' returns a sanitized SVG string with no script execution; this is the documented integration path.
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
