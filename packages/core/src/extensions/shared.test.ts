import { describe, expect, test } from 'bun:test';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
// App-side extensions — includes the same schema plus view-layer overrides only
import { sharedExtensions as appExtensions } from '../../../app/src/editor/extensions/shared.ts';
import { sharedExtensions as coreExtensions } from './shared.ts';

const mdManager = new MarkdownManager({ extensions: coreExtensions });

/**
 * Schema-parity drift test (§3.3 invariant, OS09).
 *
 * Ensures packages/core and packages/app produce structurally identical
 * ProseMirror schemas. App may ONLY override view-layer fields (addNodeView,
 * view-specific keyboard shortcuts). Any .extend({ addAttributes() }) in app
 * causes a schema drift between server persistence and client editor — silent
 * data corruption on round-trip.
 *
 * This test catches violations mechanically.
 */
describe('Schema parity: core vs app (OS09)', () => {
  const coreSchema = getSchema(coreExtensions);
  const appSchema = getSchema(appExtensions);

  test('node type names are identical', () => {
    const coreNames = Object.keys(coreSchema.nodes).sort();
    const appNames = Object.keys(appSchema.nodes).sort();
    expect(appNames).toEqual(coreNames);
  });

  test('mark type names are identical', () => {
    const coreNames = Object.keys(coreSchema.marks).sort();
    const appNames = Object.keys(appSchema.marks).sort();
    expect(appNames).toEqual(coreNames);
  });

  test('node specs have identical attrs', () => {
    for (const name of Object.keys(coreSchema.nodes)) {
      const coreSpec = coreSchema.nodes[name].spec;
      const appSpec = appSchema.nodes[name]?.spec;
      expect(appSpec).toBeDefined();

      // Compare attrs — the key property that must not drift
      expect(JSON.stringify(appSpec.attrs)).toBe(JSON.stringify(coreSpec.attrs));
    }
  });

  test('node specs have identical content expressions', () => {
    for (const name of Object.keys(coreSchema.nodes)) {
      const coreSpec = coreSchema.nodes[name].spec;
      const appSpec = appSchema.nodes[name]?.spec;
      expect(appSpec).toBeDefined();
      expect(appSpec.content).toBe(coreSpec.content);
    }
  });

  test('node specs have identical group membership', () => {
    for (const name of Object.keys(coreSchema.nodes)) {
      const coreSpec = coreSchema.nodes[name].spec;
      const appSpec = appSchema.nodes[name]?.spec;
      expect(appSpec).toBeDefined();
      expect(appSpec.group).toBe(coreSpec.group);
    }
  });

  test('node specs have identical atom flag', () => {
    for (const name of Object.keys(coreSchema.nodes)) {
      const coreSpec = coreSchema.nodes[name].spec;
      const appSpec = appSchema.nodes[name]?.spec;
      expect(appSpec).toBeDefined();
      expect(!!appSpec.atom).toBe(!!coreSpec.atom);
    }
  });

  test('mark specs have identical attrs', () => {
    for (const name of Object.keys(coreSchema.marks)) {
      const coreSpec = coreSchema.marks[name].spec;
      const appSpec = appSchema.marks[name]?.spec;
      expect(appSpec).toBeDefined();
      expect(JSON.stringify(appSpec.attrs)).toBe(JSON.stringify(coreSpec.attrs));
    }
  });
});

describe('Link extension round-trip', () => {
  test('inline link parses and serializes correctly', () => {
    const original = 'Check out [this link](https://example.com) for more.';
    const parsed = mdManager.parse(original);
    const serialized = mdManager.serialize(parsed);
    expect(serialized.trim()).toBe(original);
  });

  test('link with title parses and serializes correctly', () => {
    const original = '[Example](https://example.com "My title")';
    const parsed = mdManager.parse(original);
    const serialized = mdManager.serialize(parsed);
    expect(serialized.trim()).toBe(original);
  });

  test('multiple links in a paragraph round-trip correctly', () => {
    const original = 'See [foo](https://foo.com) and [bar](https://bar.com).';
    const parsed = mdManager.parse(original);
    const serialized = mdManager.serialize(parsed);
    expect(serialized.trim()).toBe(original);
  });

  test('link href is preserved after round-trip', () => {
    const original = '[click here](https://example.com/path?q=1&r=2)';
    const parsed = mdManager.parse(original);
    const serialized = mdManager.serialize(parsed);
    expect(serialized.trim()).toBe(original);
  });
});
