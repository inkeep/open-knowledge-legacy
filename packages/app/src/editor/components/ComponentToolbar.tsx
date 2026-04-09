/**
 * Small header bar above a component node — shows the component name badge.
 */

interface ComponentToolbarProps {
  componentName: string;
}

export function ComponentToolbar({ componentName }: ComponentToolbarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '2px 8px',
        fontSize: '12px',
        color: '#666',
        userSelect: 'none',
      }}
      contentEditable={false}
    >
      <span
        style={{
          fontFamily: 'monospace',
          fontWeight: 600,
          color: '#7c3aed',
          fontSize: '11px',
          backgroundColor: '#f3f0ff',
          padding: '1px 6px',
          borderRadius: '3px',
        }}
      >
        {componentName}
      </span>
    </div>
  );
}
