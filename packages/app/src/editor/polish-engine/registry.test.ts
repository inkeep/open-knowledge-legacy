/**
 * Registry unit tests — validates ConstructConfig parsing and
 * dispatch routing (line entries → ViewPlugin, cross-scan → StateField).
 */

import { describe, expect, test } from 'bun:test';
import { blockquoteConstruct } from './constructs/blockquote';
import { defaultRegistry } from './index';

describe('ConstructConfig parsing', () => {
  test('blockquote config has required fields', () => {
    expect(blockquoteConstruct.id).toBe('blockquote');
    expect(blockquoteConstruct.nodeName).toBe('Blockquote');
    expect(blockquoteConstruct.kind).toBe('line');
    expect(blockquoteConstruct.class).toBe('cm-blockquote-line');
    expect(blockquoteConstruct.markerNodeName).toBe('QuoteMark');
    expect(blockquoteConstruct.markerClass).toBe('cm-quote-mark');
  });

  test('blockquote depthClass returns correct classes', () => {
    // Create mock nodes with parent chain for depth testing
    type MockNode = { name: string; parent: MockNode | null };
    const mockNode = (depth: number): MockNode => {
      let node: MockNode = { name: 'Blockquote', parent: null };
      for (let i = 1; i < depth; i++) {
        node = { name: 'Blockquote', parent: node };
      }
      return node;
    };

    expect(blockquoteConstruct.depthClass?.(mockNode(1))).toBe('');
    expect(blockquoteConstruct.depthClass?.(mockNode(2))).toBe('cm-blockquote-depth-2');
    expect(blockquoteConstruct.depthClass?.(mockNode(3))).toBe('cm-blockquote-depth-3');
    expect(blockquoteConstruct.depthClass?.(mockNode(4))).toBe('cm-blockquote-depth-3');
  });
});

describe('dispatch routing', () => {
  test('kind=line entries are not cross-scan', () => {
    const lineConfigs = defaultRegistry.filter((c) => c.kind === 'line');
    expect(lineConfigs.length).toBeGreaterThan(0);
    for (const config of lineConfigs) {
      expect(config.crossScan).toBeUndefined();
    }
  });

  test('kind=cross-scan-mark entries have crossScan config', () => {
    const crossScanConfigs = defaultRegistry.filter((c) => c.kind === 'cross-scan-mark');
    for (const config of crossScanConfigs) {
      expect(config.crossScan).toBeDefined();
    }
  });

  test('default registry contains blockquote', () => {
    expect(defaultRegistry.some((c) => c.id === 'blockquote')).toBe(true);
  });

  test('constructPolishEngine returns a non-empty Extension array', async () => {
    const { constructPolishEngine } = await import('./index');
    const extensions = constructPolishEngine(defaultRegistry);
    expect(extensions.length).toBeGreaterThan(0);
  });
});
