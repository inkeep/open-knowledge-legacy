import type { CSSProperties, ReactNode } from 'react';
import { Callout } from '../Callout';

export type ComponentPropType = 'string' | 'enum' | 'boolean';

export interface ComponentPropDef {
  name: string;
  label: string;
  type: ComponentPropType;
  options?: string[];
  placeholder?: string;
}

export interface BuiltInComponentMeta {
  name: string;
  displayName: string;
  searchTerms: string[];
  description: string;
  propDefs: ComponentPropDef[];
  selfClosing?: boolean;
  defaultTemplate: () => string;
  renderPreview: (component: ParsedKnownComponent) => ReactNode;
}

export interface ParsedKnownComponent {
  kind: 'known';
  meta: BuiltInComponentMeta;
  name: string;
  props: Record<string, string | boolean>;
  body: string;
  raw: string;
}

export interface ParsedUnknownComponent {
  kind: 'unknown';
  name: string;
  raw: string;
  reason: 'unsupported' | 'malformed';
}

export type ParsedJsxComponent = ParsedKnownComponent | ParsedUnknownComponent;

const surfaceStyle: CSSProperties = {
  border: '1px solid #d4d4d8',
  borderRadius: '10px',
  background: '#ffffff',
  overflow: 'hidden',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 14px',
  borderBottom: '1px solid #e4e4e7',
  background: '#fafafa',
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#52525b',
};

const bodyStyle: CSSProperties = {
  padding: '14px',
  fontSize: '14px',
  lineHeight: 1.6,
  color: '#18181b',
};

function previewText(body: string): string {
  return body.replace(/\s+/g, ' ').trim();
}

function renderShell(title: string, content: ReactNode, subtitle?: string) {
  return (
    <div style={surfaceStyle}>
      <div style={headerStyle}>
        <span>{title}</span>
        {subtitle ? (
          <span style={{ fontWeight: 500, textTransform: 'none' }}>{subtitle}</span>
        ) : null}
      </div>
      <div style={bodyStyle}>{content}</div>
    </div>
  );
}

function parseAttributes(attributeSource: string): Record<string, string | boolean> {
  const attributes: Record<string, string | boolean> = {};
  const attributePattern = /([A-Za-z_][\w-]*)(?:="([^"]*)")?/g;
  for (const match of attributeSource.matchAll(attributePattern)) {
    const [, name, value] = match;
    attributes[name] = value ?? true;
  }
  return attributes;
}

function parseChildElements(
  body: string,
  tagName: string,
): Array<{
  props: Record<string, string | boolean>;
  body: string;
}> {
  const childPattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'g');
  const children: Array<{ props: Record<string, string | boolean>; body: string }> = [];
  for (const match of body.matchAll(childPattern)) {
    children.push({
      props: parseAttributes(match[1] ?? ''),
      body: match[2] ?? '',
    });
  }
  return children;
}

function withPreviewKeys<T extends { props: Record<string, string | boolean>; body: string }>(
  children: T[],
): Array<T & { previewKey: string }> {
  const occurrences = new Map<string, number>();

  return children.map((child) => {
    const signature = `${JSON.stringify(child.props)}::${child.body.trim()}`;
    const seen = occurrences.get(signature) ?? 0;
    occurrences.set(signature, seen + 1);

    return {
      ...child,
      previewKey: seen === 0 ? signature : `${signature}::${seen + 1}`,
    };
  });
}

function serializeAttributes(props: Record<string, string | boolean>): string {
  const entries = Object.entries(props).filter(([, value]) => value !== '' && value !== false);
  if (entries.length === 0) {
    return '';
  }

  return ` ${entries
    .map(([name, value]) => (value === true ? name : `${name}="${String(value)}"`))
    .join(' ')}`;
}

const builtInComponents: BuiltInComponentMeta[] = [
  {
    name: 'Callout',
    displayName: 'Callout',
    searchTerms: ['callout', 'note', 'warning', 'tip', 'info'],
    description: 'Highlight important context in a bordered callout.',
    propDefs: [
      {
        name: 'type',
        label: 'Type',
        type: 'enum',
        options: ['warning', 'info', 'error'],
      },
    ],
    defaultTemplate: () =>
      '<Callout type="warning">Heads up: review this section before publishing.</Callout>',
    renderPreview: (component) => (
      <Callout type={String(component.props.type || 'info')}>{previewText(component.body)}</Callout>
    ),
  },
  {
    name: 'Tabs',
    displayName: 'Tabs',
    searchTerms: ['tabs', 'tab', 'examples', 'switcher'],
    description: 'Show multiple tabbed content variants.',
    propDefs: [],
    defaultTemplate: () =>
      '<Tabs>\n  <Tab title="First">First tab content.</Tab>\n  <Tab title="Second">Second tab content.</Tab>\n</Tabs>',
    renderPreview: (component) => {
      const tabs = withPreviewKeys(parseChildElements(component.body, 'Tab'));
      const firstTab = tabs[0];
      return renderShell(
        'Tabs',
        <>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            {tabs.map((tab, index) => (
              <span
                key={tab.previewKey}
                style={{
                  padding: '4px 10px',
                  borderRadius: '999px',
                  background: index === 0 ? '#18181b' : '#e4e4e7',
                  color: index === 0 ? '#ffffff' : '#27272a',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {String(tab.props.title || `Tab ${index + 1}`)}
              </span>
            ))}
          </div>
          <p style={{ margin: 0 }}>{firstTab ? previewText(firstTab.body) : 'No tab content.'}</p>
        </>,
        tabs.length > 0 ? `${tabs.length} tabs` : undefined,
      );
    },
  },
  {
    name: 'CodeGroup',
    displayName: 'CodeGroup',
    searchTerms: ['codegroup', 'code', 'snippet', 'example'],
    description: 'Group one or more code examples under a shared heading.',
    propDefs: [
      {
        name: 'title',
        label: 'Title',
        type: 'string',
        placeholder: 'Example title',
      },
    ],
    defaultTemplate: () =>
      '<CodeGroup title="TypeScript">\nconst answer = 42;\nconsole.log(answer);\n</CodeGroup>',
    renderPreview: (component) =>
      renderShell(
        'CodeGroup',
        <pre
          style={{
            margin: 0,
            padding: '12px',
            borderRadius: '8px',
            background: '#09090b',
            color: '#f4f4f5',
            fontSize: '13px',
            overflowX: 'auto',
          }}
        >
          {component.body.trim()}
        </pre>,
        String(component.props.title || 'Snippet'),
      ),
  },
  {
    name: 'Steps',
    displayName: 'Steps',
    searchTerms: ['steps', 'step', 'guide', 'process'],
    description: 'Render a numbered sequence of steps.',
    propDefs: [],
    defaultTemplate: () =>
      '<Steps>\n  <Step title="First step">Start with the editor open.</Step>\n  <Step title="Second step">Add supporting detail.</Step>\n</Steps>',
    renderPreview: (component) => {
      const steps = withPreviewKeys(parseChildElements(component.body, 'Step'));
      return renderShell(
        'Steps',
        <ol style={{ margin: 0, paddingLeft: '20px' }}>
          {steps.map((step, index) => (
            <li key={step.previewKey} style={{ marginBottom: '10px' }}>
              <strong>{String(step.props.title || `Step ${index + 1}`)}</strong>
              <div>{previewText(step.body)}</div>
            </li>
          ))}
        </ol>,
      );
    },
  },
  {
    name: 'Accordion',
    displayName: 'Accordion',
    searchTerms: ['accordion', 'details', 'collapse'],
    description: 'Hide supporting details behind a disclosure title.',
    propDefs: [
      {
        name: 'title',
        label: 'Title',
        type: 'string',
        placeholder: 'Accordion title',
      },
    ],
    defaultTemplate: () =>
      '<Accordion title="More details">Supporting context lives here.</Accordion>',
    renderPreview: (component) =>
      renderShell(
        'Accordion',
        <div>
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              background: '#f4f4f5',
              fontWeight: 600,
              marginBottom: '10px',
            }}
          >
            {String(component.props.title || 'Details')}
          </div>
          <p style={{ margin: 0 }}>{previewText(component.body)}</p>
        </div>,
      ),
  },
  {
    name: 'Card',
    displayName: 'Card',
    searchTerms: ['card', 'link', 'cta'],
    description: 'Show a linked documentation card.',
    propDefs: [
      {
        name: 'title',
        label: 'Title',
        type: 'string',
        placeholder: 'Card title',
      },
      {
        name: 'href',
        label: 'Href',
        type: 'string',
        placeholder: '/docs/example',
      },
    ],
    defaultTemplate: () =>
      '<Card title="Starter card" href="/docs">Link to supporting documentation.</Card>',
    renderPreview: (component) =>
      renderShell(
        'Card',
        <>
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>
            {String(component.props.title || 'Starter card')}
          </div>
          <div style={{ marginBottom: '8px' }}>{previewText(component.body)}</div>
          <code style={{ fontSize: '12px', color: '#52525b' }}>
            {String(component.props.href || '/docs')}
          </code>
        </>,
      ),
  },
  {
    name: 'Embed',
    displayName: 'Embed',
    searchTerms: ['embed', 'frame', 'iframe', 'video'],
    description: 'Embed an external reference or media URL.',
    propDefs: [
      {
        name: 'src',
        label: 'Source URL',
        type: 'string',
        placeholder: 'https://example.com',
      },
      {
        name: 'title',
        label: 'Title',
        type: 'string',
        placeholder: 'Reference',
      },
    ],
    selfClosing: true,
    defaultTemplate: () => '<Embed src="https://example.com" title="Reference" />',
    renderPreview: (component) =>
      renderShell(
        'Embed',
        <div
          style={{
            display: 'grid',
            gap: '8px',
            padding: '12px',
            borderRadius: '8px',
            border: '1px dashed #a1a1aa',
            background: '#fafafa',
          }}
        >
          <strong>{String(component.props.title || 'Reference')}</strong>
          <code style={{ fontSize: '12px', color: '#52525b', wordBreak: 'break-all' }}>
            {String(component.props.src || 'https://example.com')}
          </code>
        </div>,
      ),
  },
];

export const builtInComponentRegistry = new Map(
  builtInComponents.map((component) => [component.name, component]),
);

export function getBuiltInComponent(name: string): BuiltInComponentMeta | undefined {
  return builtInComponentRegistry.get(name);
}

export function getSlashComponentItems(query = ''): BuiltInComponentMeta[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return builtInComponents;
  }

  return [...builtInComponents]
    .filter((component) =>
      [component.displayName, component.name, ...component.searchTerms].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    )
    .sort((left, right) => {
      const leftStarts = left.displayName.toLowerCase().startsWith(normalizedQuery);
      const rightStarts = right.displayName.toLowerCase().startsWith(normalizedQuery);
      if (leftStarts !== rightStarts) {
        return leftStarts ? -1 : 1;
      }
      return left.displayName.localeCompare(right.displayName);
    });
}

export function parseJsxComponent(raw: string): ParsedJsxComponent {
  const trimmed = raw.trim();
  const selfClosingMatch = trimmed.match(/^<([A-Z][\w]*)\b([^>]*)\/>\s*$/s);
  const pairedMatch = trimmed.match(/^<([A-Z][\w]*)\b([^>]*)>([\s\S]*)<\/\1>\s*$/s);

  if (!selfClosingMatch && !pairedMatch) {
    return {
      kind: 'unknown',
      name: 'Unknown',
      raw,
      reason: 'malformed',
    };
  }

  const name = selfClosingMatch?.[1] ?? pairedMatch?.[1] ?? 'Unknown';
  const meta = getBuiltInComponent(name);
  if (!meta) {
    return {
      kind: 'unknown',
      name,
      raw,
      reason: 'unsupported',
    };
  }

  const attributeSource = selfClosingMatch?.[2] ?? pairedMatch?.[2] ?? '';
  const body = selfClosingMatch ? '' : (pairedMatch?.[3] ?? '');

  return {
    kind: 'known',
    meta,
    name,
    props: parseAttributes(attributeSource),
    body,
    raw,
  };
}

export function serializeJsxComponent(component: ParsedKnownComponent): string {
  const attributeText = serializeAttributes(component.props);
  if (component.meta.selfClosing) {
    return `<${component.name}${attributeText} />`;
  }
  return `<${component.name}${attributeText}>${component.body}</${component.name}>`;
}
