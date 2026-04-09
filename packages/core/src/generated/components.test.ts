/**
 * Per-built-in extraction tests — one test per component in D15.
 * Validates that react-docgen-typescript extraction produces the expected
 * PropDef shape for each built-in. Catches upstream drift (fumadocs-ui adds
 * a prop, changes a type, etc.) on every CI run.
 */
import { describe, expect, test } from 'bun:test';
import { componentManifest } from './components.ts';

function getProp(componentName: string, propName: string) {
  const meta = componentManifest[componentName];
  return meta?.props.find((p) => p.name === propName);
}

function hasComponent(name: string) {
  return name in componentManifest;
}

describe('Per-built-in extraction tests', () => {
  // --- Fumadocs (canonical, 10 families) ---

  test('Callout has type enum with info/warn/error variants', () => {
    expect(hasComponent('Callout')).toBe(true);
    const typeProp = getProp('Callout', 'type');
    expect(typeProp).toBeDefined();
    expect(typeProp?.type).toBe('enum');
    expect(typeProp?.enumValues).toContain('info');
    expect(typeProp?.enumValues).toContain('warn');
    expect(typeProp?.enumValues).toContain('error');
  });

  test('Tabs exists with category layout', () => {
    expect(hasComponent('Tabs')).toBe(true);
    expect(componentManifest.Tabs.category).toBe('layout');
  });

  test('Tab has optional value prop', () => {
    expect(hasComponent('Tab')).toBe(true);
    const valueProp = getProp('Tab', 'value');
    expect(valueProp).toBeDefined();
    expect(valueProp?.type).toBe('string');
  });

  test('Card has optional title:reactnode and href:string', () => {
    expect(hasComponent('Card')).toBe(true);
    const titleProp = getProp('Card', 'title');
    expect(titleProp).toBeDefined();
    expect(titleProp?.type).toBe('reactnode');
    const hrefProp = getProp('Card', 'href');
    expect(hrefProp).toBeDefined();
    expect(hrefProp?.type).toBe('string');
  });

  test('Cards exists', () => {
    expect(hasComponent('Cards')).toBe(true);
  });

  test('Steps has children:reactnode', () => {
    expect(hasComponent('Steps')).toBe(true);
    const childrenProp = getProp('Steps', 'children');
    expect(childrenProp).toBeDefined();
    expect(childrenProp?.type).toBe('reactnode');
  });

  test('Step has children:reactnode', () => {
    expect(hasComponent('Step')).toBe(true);
    const childrenProp = getProp('Step', 'children');
    expect(childrenProp).toBeDefined();
    expect(childrenProp?.type).toBe('reactnode');
  });

  test('Accordion has title:reactnode', () => {
    expect(hasComponent('Accordion')).toBe(true);
    const titleProp = getProp('Accordion', 'title');
    expect(titleProp).toBeDefined();
    expect(titleProp?.type).toBe('reactnode');
  });

  test('Accordions has type:enum', () => {
    expect(hasComponent('Accordions')).toBe(true);
    const typeProp = getProp('Accordions', 'type');
    expect(typeProp).toBeDefined();
    expect(typeProp?.type).toBe('enum');
  });

  test('ImageZoom exists with category media', () => {
    expect(hasComponent('ImageZoom')).toBe(true);
    expect(componentManifest.ImageZoom.category).toBe('media');
  });

  test('Files exists', () => {
    expect(hasComponent('Files')).toBe(true);
  });

  test('File has name:string', () => {
    expect(hasComponent('File')).toBe(true);
    const nameProp = getProp('File', 'name');
    expect(nameProp).toBeDefined();
    expect(nameProp?.type).toBe('string');
  });

  test('Folder has name:string and defaultOpen:boolean', () => {
    expect(hasComponent('Folder')).toBe(true);
    const nameProp = getProp('Folder', 'name');
    expect(nameProp).toBeDefined();
    expect(nameProp?.type).toBe('string');
    const defaultOpenProp = getProp('Folder', 'defaultOpen');
    expect(defaultOpenProp).toBeDefined();
    expect(defaultOpenProp?.type).toBe('boolean');
  });

  test('TypeTable exists with category data', () => {
    expect(hasComponent('TypeTable')).toBe(true);
    expect(componentManifest.TypeTable.category).toBe('data');
  });

  test('Banner has variant:enum', () => {
    expect(hasComponent('Banner')).toBe(true);
    const variantProp = getProp('Banner', 'variant');
    expect(variantProp).toBeDefined();
    expect(variantProp?.type).toBe('enum');
  });

  test('InlineTOC exists with defaultOpen:boolean', () => {
    expect(hasComponent('InlineTOC')).toBe(true);
    const defaultOpenProp = getProp('InlineTOC', 'defaultOpen');
    expect(defaultOpenProp).toBeDefined();
    expect(defaultOpenProp?.type).toBe('boolean');
  });

  // --- Docskit (gap fill, 3) ---

  test('Video has src:string', () => {
    expect(hasComponent('Video')).toBe(true);
    const srcProp = getProp('Video', 'src');
    expect(srcProp).toBeDefined();
    expect(srcProp?.type).toBe('string');
    expect(srcProp?.required).toBe(true);
  });

  test('Frame has children:reactnode and hint:string', () => {
    expect(hasComponent('Frame')).toBe(true);
    const childrenProp = getProp('Frame', 'children');
    expect(childrenProp).toBeDefined();
    expect(childrenProp?.type).toBe('reactnode');
    const hintProp = getProp('Frame', 'hint');
    expect(hintProp).toBeDefined();
    expect(hintProp?.type).toBe('string');
  });

  test('CodeGroup exists with category content', () => {
    expect(hasComponent('CodeGroup')).toBe(true);
    expect(componentManifest.CodeGroup.category).toBe('content');
  });

  // --- Shadcn (gap fill, 2) ---

  test('Mermaid has chart:string', () => {
    expect(hasComponent('Mermaid')).toBe(true);
    const chartProp = getProp('Mermaid', 'chart');
    expect(chartProp).toBeDefined();
    expect(chartProp?.type).toBe('string');
    expect(chartProp?.required).toBe(true);
  });

  test('Audio has src:string and optional title:string', () => {
    expect(hasComponent('Audio')).toBe(true);
    const srcProp = getProp('Audio', 'src');
    expect(srcProp).toBeDefined();
    expect(srcProp?.type).toBe('string');
    expect(srcProp?.required).toBe(true);
    const titleProp = getProp('Audio', 'title');
    expect(titleProp).toBeDefined();
    expect(titleProp?.type).toBe('string');
    expect(titleProp?.required).toBe(false);
  });
});
