import { describe, expect, test } from 'bun:test';
import * as Y from 'yjs';
import {
  composeFrontmatterForStore,
  getFrontmatter,
  getFrontmatterMap,
  setFrontmatterFromYaml,
  setFrontmatterProperty,
} from './frontmatter-y.ts';

function makeDoc(): Y.Doc {
  return new Y.Doc();
}

describe('getFrontmatter — legacy single-string slot', () => {
  test('returns the legacy string when no per-key entries exist', () => {
    const doc = makeDoc();
    const metaMap = doc.getMap('metadata');
    metaMap.set('frontmatter', '---\ntitle: Hello\n---\n');
    expect(getFrontmatter(doc)).toBe('---\ntitle: Hello\n---\n');
  });

  test('returns empty string when neither legacy nor per-key entries exist', () => {
    expect(getFrontmatter(makeDoc())).toBe('');
  });

  test('returns empty string when legacy slot is non-string', () => {
    const doc = makeDoc();
    doc.getMap('metadata').set('frontmatter', 42);
    expect(getFrontmatter(doc)).toBe('');
  });
});

describe('getFrontmatter — synthesized from per-key entries', () => {
  test('synthesizes YAML from primitive per-key entries', () => {
    const doc = makeDoc();
    const metaMap = doc.getMap('metadata');
    metaMap.set('title', 'Hello');
    metaMap.set('count', 42);
    metaMap.set('draft', false);
    const fm = getFrontmatter(doc);
    expect(fm.startsWith('---\n')).toBe(true);
    expect(fm.endsWith('\n---\n')).toBe(true);
    expect(fm).toContain('title: Hello');
    expect(fm).toContain('count: 42');
    expect(fm).toContain('draft: false');
  });

  test('per-key entries take precedence over legacy slot when both present', () => {
    const doc = makeDoc();
    const metaMap = doc.getMap('metadata');
    metaMap.set('frontmatter', '---\ntitle: Stale\n---\n');
    metaMap.set('title', 'Fresh');
    const fm = getFrontmatter(doc);
    expect(fm).toContain('title: Fresh');
    expect(fm).not.toContain('title: Stale');
  });

  test('synthesizes lists as YAML block sequences', () => {
    const doc = makeDoc();
    doc.getMap('metadata').set('tags', ['a', 'b', 'c']);
    const fm = getFrontmatter(doc);
    expect(fm).toContain('tags:');
    expect(fm).toContain('- a');
    expect(fm).toContain('- b');
    expect(fm).toContain('- c');
  });

  test('unwraps Y.Text slots for editable strings', () => {
    const doc = makeDoc();
    const metaMap = doc.getMap('metadata');
    const title = new Y.Text('Hello from Y.Text');
    metaMap.set('title', title);
    expect(getFrontmatter(doc)).toContain('title: Hello from Y.Text');
  });

  test('unwraps Y.Array<Y.Text> slots for lists', () => {
    const doc = makeDoc();
    const metaMap = doc.getMap('metadata');
    const tags = new Y.Array<Y.Text>();
    tags.push([new Y.Text('docs'), new Y.Text('crdt')]);
    metaMap.set('tags', tags);
    const fm = getFrontmatter(doc);
    expect(fm).toContain('- docs');
    expect(fm).toContain('- crdt');
  });

  test('preserves user-source order across per-key entries', () => {
    const doc = makeDoc();
    const metaMap = doc.getMap('metadata');
    metaMap.set('z', 1);
    metaMap.set('a', 'two');
    metaMap.set('m', true);
    const lines = getFrontmatter(doc).trim().split('\n');
    const yamlLines = lines.slice(1, -1);
    expect(yamlLines[0]).toMatch(/^z:/);
    expect(yamlLines[1]).toMatch(/^a:/);
    expect(yamlLines[2]).toMatch(/^m:/);
  });
});

describe('getFrontmatterMap', () => {
  test('returns empty object when neither legacy nor per-key entries exist', () => {
    expect(getFrontmatterMap(makeDoc())).toEqual({});
  });

  test('returns empty object in legacy-only mode (string slot ignored)', () => {
    const doc = makeDoc();
    doc.getMap('metadata').set('frontmatter', '---\ntitle: Foo\n---\n');
    expect(getFrontmatterMap(doc)).toEqual({});
  });

  test('returns per-key entries as a typed map', () => {
    const doc = makeDoc();
    const metaMap = doc.getMap('metadata');
    metaMap.set('title', 'Hello');
    metaMap.set('count', 42);
    metaMap.set('draft', false);
    metaMap.set('tags', ['a', 'b']);
    expect(getFrontmatterMap(doc)).toEqual({
      title: 'Hello',
      count: 42,
      draft: false,
      tags: ['a', 'b'],
    });
  });

  test('skips slots whose value violates the supported shape set', () => {
    const doc = makeDoc();
    const metaMap = doc.getMap('metadata');
    metaMap.set('title', 'Hello');
    metaMap.set('weird', { nested: 'bad' });
    expect(getFrontmatterMap(doc)).toEqual({ title: 'Hello' });
  });
});

describe('setFrontmatterProperty', () => {
  test('writes a primitive value to the per-key slot', () => {
    const doc = makeDoc();
    setFrontmatterProperty(doc, 'title', 'Hello');
    expect(doc.getMap('metadata').get('title')).toBe('Hello');
    expect(getFrontmatterMap(doc)).toEqual({ title: 'Hello' });
  });

  test('writes a list value', () => {
    const doc = makeDoc();
    setFrontmatterProperty(doc, 'tags', ['a', 'b']);
    expect(getFrontmatterMap(doc)).toEqual({ tags: ['a', 'b'] });
  });

  test('null value deletes the slot', () => {
    const doc = makeDoc();
    setFrontmatterProperty(doc, 'title', 'Hello');
    setFrontmatterProperty(doc, 'title', null);
    expect(doc.getMap('metadata').has('title')).toBe(false);
  });
});

describe('setFrontmatterFromYaml', () => {
  test('writes per-key entries from a YAML body', () => {
    const doc = makeDoc();
    const ok = setFrontmatterFromYaml(doc, 'title: Hello\ncount: 42\ntags: [a, b]\n');
    expect(ok).toBe(true);
    expect(getFrontmatterMap(doc)).toEqual({
      title: 'Hello',
      count: 42,
      tags: ['a', 'b'],
    });
  });

  test('removes legacy single-string slot on success', () => {
    const doc = makeDoc();
    const metaMap = doc.getMap('metadata');
    metaMap.set('frontmatter', '---\ntitle: Stale\n---\n');
    setFrontmatterFromYaml(doc, 'title: Fresh\n');
    expect(metaMap.has('frontmatter')).toBe(false);
    expect(getFrontmatterMap(doc)).toEqual({ title: 'Fresh' });
  });

  test('per-key diff: deletes keys absent in new YAML', () => {
    const doc = makeDoc();
    setFrontmatterFromYaml(doc, 'title: A\ndraft: true\n');
    setFrontmatterFromYaml(doc, 'title: B\n');
    expect(getFrontmatterMap(doc)).toEqual({ title: 'B' });
  });

  test('per-key diff: skips updates for unchanged values (UndoManager attribution)', () => {
    const doc = makeDoc();
    setFrontmatterFromYaml(doc, 'title: A\ndraft: true\n');
    const metaMap = doc.getMap('metadata');
    let changeCount = 0;
    metaMap.observe(() => {
      changeCount++;
    });
    setFrontmatterFromYaml(doc, 'title: A\ndraft: true\n');
    expect(changeCount).toBe(0);
  });

  test('returns false on malformed YAML and leaves state unchanged', () => {
    const doc = makeDoc();
    setFrontmatterFromYaml(doc, 'title: Hello\n');
    const before = getFrontmatterMap(doc);
    const ok = setFrontmatterFromYaml(doc, 'title: [unterminated');
    expect(ok).toBe(false);
    expect(getFrontmatterMap(doc)).toEqual(before);
  });

  test('round-trip: setFrontmatterFromYaml(getFrontmatter(...))', () => {
    const doc = makeDoc();
    setFrontmatterFromYaml(doc, 'title: Hello\ntags: [a, b]\nversion: 3\n');
    const fm = getFrontmatter(doc);
    const doc2 = makeDoc();
    const yamlBody = fm.replace(/^---\r?\n/, '').replace(/\r?\n---\r?\n?$/, '\n');
    setFrontmatterFromYaml(doc2, yamlBody);
    expect(getFrontmatterMap(doc2)).toEqual(getFrontmatterMap(doc));
  });
});

describe('composeFrontmatterForStore', () => {
  test('returns empty string when neither legacy nor per-key entries exist', () => {
    expect(composeFrontmatterForStore(makeDoc())).toBe('');
  });

  test('returns legacy slot verbatim when per-key map is empty', () => {
    const doc = makeDoc();
    doc.getMap('metadata').set('frontmatter', '---\ntitle: Legacy\n---\n');
    expect(composeFrontmatterForStore(doc)).toBe('---\ntitle: Legacy\n---\n');
  });

  test('returns legacy slot verbatim when per-key matches its parsed value (no-op preserves comments + style)', () => {
    const doc = makeDoc();
    const metaMap = doc.getMap('metadata');
    // Comment-bearing fenced FM as it would land on disk.
    const fenced = '---\n# spec owner\ntitle: "Quoted Style"\nstatus: draft\n---\n';
    metaMap.set('frontmatter', fenced);
    metaMap.set('title', 'Quoted Style');
    metaMap.set('status', 'draft');
    expect(composeFrontmatterForStore(doc)).toBe(fenced);
  });

  test('synthesizes canonical YAML when per-key state has diverged from legacy', () => {
    const doc = makeDoc();
    const metaMap = doc.getMap('metadata');
    metaMap.set('frontmatter', '---\ntitle: Old\n---\n');
    metaMap.set('title', 'New'); // diverged from legacy parse
    const composed = composeFrontmatterForStore(doc);
    expect(composed).toContain('title: New');
    expect(composed).not.toContain('title: Old');
    expect(composed.startsWith('---\n')).toBe(true);
    expect(composed.endsWith('\n---\n')).toBe(true);
  });

  test('synthesizes from per-key when no legacy mirror exists', () => {
    const doc = makeDoc();
    const metaMap = doc.getMap('metadata');
    metaMap.set('title', 'Fresh');
    metaMap.set('tags', ['a', 'b']);
    const composed = composeFrontmatterForStore(doc);
    expect(composed).toContain('title: Fresh');
    expect(composed).toContain('- a');
    expect(composed).toContain('- b');
  });

  test('synthesizes from per-key when legacy mirror is malformed', () => {
    const doc = makeDoc();
    const metaMap = doc.getMap('metadata');
    metaMap.set('frontmatter', '---\ntitle: [unterminated\n---\n');
    metaMap.set('title', 'Recovered');
    const composed = composeFrontmatterForStore(doc);
    expect(composed).toContain('title: Recovered');
  });
});
