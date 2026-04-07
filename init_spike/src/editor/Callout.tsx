const colors: Record<string, string> = {
  warning: '#fff3cd',
  info: '#cff4fc',
  error: '#f8d7da',
};

export function Callout({ type, children }: { type: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '6px',
        backgroundColor: colors[type] || '#f0f0f0',
      }}
    >
      <strong>{type.toUpperCase()}</strong>: {children}
    </div>
  );
}
