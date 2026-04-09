/**
 * Small header bar above a component node — shows name badge and gear icon to open prop panel.
 */
import { Settings } from 'lucide-react';

interface ComponentToolbarProps {
  componentName: string;
  onOpenProps: () => void;
}

export function ComponentToolbar({ componentName, onOpenProps }: ComponentToolbarProps) {
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
      <button
        type="button"
        onClick={onOpenProps}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          color: '#999',
          borderRadius: '3px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#666';
          e.currentTarget.style.backgroundColor = '#f0f0f0';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#999';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
        aria-label={`Edit ${componentName} props`}
      >
        <Settings size={14} />
      </button>
    </div>
  );
}
