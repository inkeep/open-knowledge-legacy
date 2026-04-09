import type { NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import {
  type ComponentPropDef,
  parseJsxComponent,
  serializeJsxComponent,
} from './jsx-component-registry';

const wrapperStyle = {
  margin: '14px 0',
  display: 'grid',
  gap: '12px',
};

const panelStyle = {
  border: '1px solid #d4d4d8',
  borderRadius: '10px',
  background: '#ffffff',
  overflow: 'hidden',
};

const panelHeaderStyle = {
  padding: '10px 14px',
  borderBottom: '1px solid #e4e4e7',
  background: '#fafafa',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase' as const,
  color: '#52525b',
};

const panelBodyStyle = {
  padding: '14px',
  display: 'grid',
  gap: '12px',
};

const fieldLabelStyle = {
  display: 'grid',
  gap: '6px',
  fontSize: '12px',
  fontWeight: 600,
  color: '#3f3f46',
};

const inputStyle = {
  width: '100%',
  borderRadius: '8px',
  border: '1px solid #d4d4d8',
  padding: '8px 10px',
  fontSize: '13px',
  background: '#ffffff',
  color: '#18181b',
};

function FallbackBlock({ componentName, raw }: { componentName: string; raw: string }) {
  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '10px',
        border: '1px solid #d4d4d8',
        backgroundColor: '#f8fafc',
        fontSize: '13px',
      }}
    >
      <strong style={{ display: 'block', marginBottom: '8px' }}>&lt;{componentName}&gt;</strong>
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)' }}>{raw}</pre>
    </div>
  );
}

function PropField({
  definition,
  value,
  onChange,
}: {
  definition: ComponentPropDef;
  value: string | boolean | undefined;
  onChange: (nextValue: string | boolean) => void;
}) {
  if (definition.type === 'enum') {
    return (
      <label style={fieldLabelStyle}>
        <span>{definition.label}</span>
        <select
          aria-label={definition.label}
          value={String(value ?? definition.options?.[0] ?? '')}
          onChange={(event) => onChange(event.target.value)}
          style={inputStyle}
        >
          {(definition.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (definition.type === 'boolean') {
    return (
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '13px',
          fontWeight: 600,
          color: '#3f3f46',
        }}
      >
        <input
          aria-label={definition.label}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{definition.label}</span>
      </label>
    );
  }

  return (
    <label style={fieldLabelStyle}>
      <span>{definition.label}</span>
      <input
        aria-label={definition.label}
        type="text"
        value={String(value ?? '')}
        placeholder={definition.placeholder}
        onChange={(event) => onChange(event.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

export function JsxComponentView({ node, selected, updateAttributes }: NodeViewProps) {
  const content = String(node.attrs.content ?? '');
  const parsed = parseJsxComponent(content);

  const updateProp = (propName: string, nextValue: string | boolean) => {
    if (parsed.kind !== 'known') {
      return;
    }

    const nextComponent = {
      ...parsed,
      props: {
        ...parsed.props,
        [propName]: nextValue,
      },
    };
    updateAttributes({ content: serializeJsxComponent(nextComponent) });
  };

  return (
    <NodeViewWrapper
      className="jsx-component-wrapper"
      contentEditable={false}
      data-jsx-component-name={parsed.name}
      style={wrapperStyle}
    >
      {parsed.kind === 'known' ? (
        parsed.meta.renderPreview(parsed)
      ) : (
        <FallbackBlock componentName={parsed.name} raw={parsed.raw} />
      )}

      {selected ? (
        <div
          data-component-prop-panel=""
          role="dialog"
          aria-label="Component props"
          style={panelStyle}
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
        >
          <div style={panelHeaderStyle}>Component props</div>
          <div style={panelBodyStyle}>
            {parsed.kind === 'known' ? (
              parsed.meta.propDefs.length > 0 ? (
                parsed.meta.propDefs.map((definition) => (
                  <PropField
                    key={definition.name}
                    definition={definition}
                    value={parsed.props[definition.name]}
                    onChange={(nextValue) => updateProp(definition.name, nextValue)}
                  />
                ))
              ) : (
                <p style={{ margin: 0, fontSize: '13px', color: '#71717a' }}>
                  This component is insertable in the spike, but it does not expose editable
                  primitive props yet.
                </p>
              )
            ) : (
              <p style={{ margin: 0, fontSize: '13px', color: '#71717a' }}>
                This block is not a supported built-in component yet, so the panel is read-only.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}
