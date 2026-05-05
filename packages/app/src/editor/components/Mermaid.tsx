import { useEffect, useId, useState } from 'react';

interface MermaidProps {
  chart?: string;
  id?: string;
  theme?: string;
}

interface RenderState {
  status: 'idle' | 'rendering' | 'ready' | 'error';
  svg: string;
  error: string;
}

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
      className={`mermaid mermaid-${state.status}`}
      data-component-type="mermaid"
      id={props.id}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid.render with securityLevel:'strict' returns a sanitized SVG string with no script execution; this is the documented integration path.
      dangerouslySetInnerHTML={{ __html: state.svg }}
    />
  );
}
