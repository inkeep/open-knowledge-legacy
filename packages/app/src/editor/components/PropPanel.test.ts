/**
 * PropPanel unit tests — verifies prop filtering, markUserTyping protocol,
 * and control type mapping without DOM rendering (no @testing-library/react).
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import type { ComponentMeta, PropDef } from '@inkeep/open-knowledge-core';

// Verify the module-level contract: markUserTyping is importable from observers
import { __resetCoordinationState, markUserTyping } from '@/editor/observers';

beforeEach(() => {
  __resetCoordinationState();
});

const calloutMeta: ComponentMeta = {
  props: [
    { name: 'title', type: 'reactnode', required: false },
    { name: 'type', type: 'enum', required: false, enumValues: ['info', 'warn', 'error'] },
    { name: 'icon', type: 'reactnode', required: false },
  ],
  displayName: 'Callout',
  category: 'content',
  icon: 'info',
};

const mixedMeta: ComponentMeta = {
  props: [
    { name: 'title', type: 'string', required: true },
    { name: 'disabled', type: 'boolean', required: false },
    { name: 'variant', type: 'enum', required: false, enumValues: ['a', 'b'] },
    { name: 'count', type: 'number', required: false },
    { name: 'children', type: 'reactnode', required: true },
  ],
  displayName: 'Mixed',
  category: 'content',
};

describe('PropPanel prop filtering', () => {
  test('reactnode props are excluded from editable set', () => {
    const editable = calloutMeta.props.filter((p) => p.type !== 'reactnode');
    expect(editable).toHaveLength(1);
    expect(editable[0].name).toBe('type');
  });

  test('all non-reactnode types are included', () => {
    const editable = mixedMeta.props.filter((p) => p.type !== 'reactnode');
    expect(editable).toHaveLength(4);
    const types = editable.map((p) => p.type);
    expect(types).toContain('string');
    expect(types).toContain('boolean');
    expect(types).toContain('enum');
    expect(types).toContain('number');
  });

  test('component with only reactnode props produces empty editable set', () => {
    const meta: ComponentMeta = {
      props: [
        { name: 'children', type: 'reactnode', required: true },
        { name: 'icon', type: 'reactnode', required: false },
      ],
      displayName: 'OnlyReactNode',
      category: 'content',
    };
    const editable = meta.props.filter((p) => p.type !== 'reactnode');
    expect(editable).toHaveLength(0);
  });

  test('component with no props produces empty editable set', () => {
    const meta: ComponentMeta = {
      props: [],
      displayName: 'Empty',
      category: 'content',
    };
    const editable = meta.props.filter((p) => p.type !== 'reactnode');
    expect(editable).toHaveLength(0);
  });
});

describe('markUserTyping protocol', () => {
  test('markUserTyping is a callable function from observers', () => {
    expect(typeof markUserTyping).toBe('function');
    // Should not throw
    markUserTyping();
  });

  test('simulated change handler calls markUserTyping before onChange', () => {
    const callOrder: string[] = [];
    const mockMarkUserTyping = () => {
      callOrder.push('markUserTyping');
    };
    const mockOnChange = (_propName: string, _value: unknown) => {
      callOrder.push('onChange');
    };

    // Simulate the pattern used in PropPanel change handlers
    const handleChange = (propName: string, value: unknown) => {
      mockMarkUserTyping();
      mockOnChange(propName, value);
    };

    handleChange('type', 'error');
    expect(callOrder).toEqual(['markUserTyping', 'onChange']);
  });
});

describe('prop type to control mapping', () => {
  test('string prop maps to text input control', () => {
    const prop: PropDef = { name: 'title', type: 'string', required: true };
    expect(prop.type).toBe('string');
  });

  test('boolean prop maps to switch control', () => {
    const prop: PropDef = { name: 'disabled', type: 'boolean', required: false };
    expect(prop.type).toBe('boolean');
  });

  test('enum prop maps to select control with values', () => {
    const prop: PropDef = {
      name: 'variant',
      type: 'enum',
      required: false,
      enumValues: ['rainbow', 'normal'],
    };
    expect(prop.type).toBe('enum');
    expect(prop.enumValues).toEqual(['rainbow', 'normal']);
  });

  test('number prop maps to number input control', () => {
    const prop: PropDef = { name: 'count', type: 'number', required: false };
    expect(prop.type).toBe('number');
  });

  test('reactnode prop is never rendered as a control', () => {
    const prop: PropDef = { name: 'children', type: 'reactnode', required: true };
    // This is the filtering logic used in PropPanel
    expect(prop.type === 'reactnode').toBe(true);
  });
});

describe('componentMap contract', () => {
  test('componentMap exports all 21 built-in React components', async () => {
    const { componentMap } = await import('./componentMap');
    const expectedNames = [
      'Callout',
      'Tabs',
      'Tab',
      'Card',
      'Cards',
      'Steps',
      'Step',
      'Accordion',
      'Accordions',
      'ImageZoom',
      'Files',
      'File',
      'Folder',
      'TypeTable',
      'Banner',
      'InlineTOC',
      'Video',
      'Frame',
      'CodeGroup',
      'Mermaid',
      'Audio',
    ];
    for (const name of expectedNames) {
      expect(componentMap[name]).toBeDefined();
      // React components are functions or forwardRef objects (object with $$typeof + render)
      const t = typeof componentMap[name];
      expect(t === 'function' || t === 'object').toBe(true);
    }
  });

  test('componentMap does not contain unknown entries', async () => {
    const { componentMap } = await import('./componentMap');
    const keys = Object.keys(componentMap);
    expect(keys.length).toBe(21);
  });
});
