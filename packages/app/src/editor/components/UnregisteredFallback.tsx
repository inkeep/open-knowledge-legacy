/**
 * Renders an unregistered JSX component as raw monospace text.
 * Used for jsxComponentVoid nodes — components not in the built-in registry.
 */
interface UnregisteredFallbackProps {
  content: string;
}

export function UnregisteredFallback({ content }: UnregisteredFallbackProps) {
  const tagMatch = content.match(/^<(\w+)/);
  const tagName = tagMatch ? tagMatch[1] : 'Unknown';

  return (
    <div
      style={{
        borderRadius: '6px',
        border: '1px solid #e0e0e0',
        backgroundColor: '#f5f5f5',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '4px 12px',
          backgroundColor: '#e8e8e8',
          fontSize: '11px',
          color: '#666',
          fontFamily: 'monospace',
        }}
      >
        Unregistered component: &lt;{tagName}&gt;
      </div>
      <pre
        style={{
          margin: 0,
          padding: '12px',
          fontSize: '13px',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: '#333',
        }}
      >
        {content}
      </pre>
    </div>
  );
}
