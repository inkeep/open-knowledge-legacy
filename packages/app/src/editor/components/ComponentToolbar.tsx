/**
 * Small header bar above a component node — shows name badge and gear icon to open prop panel.
 */
import { Settings } from 'lucide-react';
import { useState } from 'react';

interface ComponentToolbarProps {
  componentName: string;
  onOpenProps: () => void;
}

export function ComponentToolbar({ componentName, onOpenProps }: ComponentToolbarProps) {
  // Hover state tracked in React to survive re-renders. Directly mutating
  // e.currentTarget.style would lose the hover visual whenever the parent
  // component re-renders (node.attrs change → React writes the base style
  // prop back over our mutation).
  const [hoverGear, setHoverGear] = useState(false);

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
          color: hoverGear ? '#666' : '#999',
          backgroundColor: hoverGear ? '#f0f0f0' : 'transparent',
          borderRadius: '3px',
        }}
        onMouseEnter={() => setHoverGear(true)}
        onMouseLeave={() => setHoverGear(false)}
        aria-label={`Edit ${componentName} props`}
      >
        <Settings size={14} />
      </button>
    </div>
  );
}
