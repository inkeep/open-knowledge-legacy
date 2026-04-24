/**
 * Tests for remark-prosemirror handler table (Tiers A/B/C).
 *
 * Exercises the mdast→PM handler mapping via parse + JSON inspection.
 * Uses POST-RENAME schema names per D16/D17: emphasis/strong/thematicBreak.
 */
import { describe, expect, test } from 'bun:test';
import type { JSONContent } from '@tiptap/core';
import { sharedExtensions } from '../extensions/shared.ts';
import { MarkdownManager } from './index.ts';

interface PmMarkJson {
  type: string;
  attrs?: Record<string, unknown>;
}

const mdManager = new MarkdownManager({ extensions: sharedExtensions });

// Helper: parse markdown and find first node of type in the JSONContent tree
function findInJson(json: JSONContent, type: string): JSONContent | null {
  if (json.type === type) return json;
  for (const child of json.content ?? []) {
    const found = findInJson(child, type);
    if (found) return found;
  }
  return null;
}

// Helper: find a mark on a text node
function findMarkInJson(json: JSONContent, markType: string): PmMarkJson | null {
  if (json.marks) {
    const mark = json.marks.find((m) => m.type === markType) as PmMarkJson | undefined;
    if (mark) return mark;
  }
  for (const child of json.content ?? []) {
    const found = findMarkInJson(child, markType);
    if (found) return found;
  }
  return null;
}

describe('Tier B fidelity: emphasis delimiter', () => {
  test('underscore emphasis carries sourceDelimiter = "_"', () => {
    const json = mdManager.parse('_word_\n');
    const emphMark = findMarkInJson(json, 'emphasis');
    expect(emphMark).toBeDefined();
    expect(emphMark.attrs?.sourceDelimiter).toBe('_');
  });

  test('asterisk emphasis carries sourceDelimiter = "*"', () => {
    const json = mdManager.parse('*word*\n');
    const emphMark = findMarkInJson(json, 'emphasis');
    expect(emphMark).toBeDefined();
    expect(emphMark.attrs?.sourceDelimiter).toBe('*');
  });
});

describe('Tier B fidelity: strong delimiter', () => {
  test('double-underscore strong carries sourceDelimiter = "__"', () => {
    const json = mdManager.parse('__word__\n');
    const strongMark = findMarkInJson(json, 'strong');
    expect(strongMark).toBeDefined();
    expect(strongMark.attrs?.sourceDelimiter).toBe('__');
  });

  test('double-asterisk strong carries sourceDelimiter = "**"', () => {
    const json = mdManager.parse('**word**\n');
    const strongMark = findMarkInJson(json, 'strong');
    expect(strongMark).toBeDefined();
    expect(strongMark.attrs?.sourceDelimiter).toBe('**');
  });
});

describe('Tier B fidelity: heading style', () => {
  test('ATX heading carries headingStyle = "atx"', () => {
    const json = mdManager.parse('## Title\n');
    const heading = findInJson(json, 'heading');
    expect(heading).toBeDefined();
    expect(heading.attrs.level).toBe(2);
    expect(heading.attrs.headingStyle).toBe('atx');
  });
});

describe('Tier B fidelity: code block fence', () => {
  test('backtick fence carries fenceDelimiter and fenceLength', () => {
    const json = mdManager.parse('```js\ncode\n```\n');
    const code = findInJson(json, 'codeBlock');
    expect(code).toBeDefined();
    expect(code.attrs.language).toBe('js');
    expect(code.attrs.fenceDelimiter).toBe('`');
    expect(code.attrs.fenceLength).toBe(3);
  });

  test('tilde fence carries fenceDelimiter = "~"', () => {
    const json = mdManager.parse('~~~\ncode\n~~~\n');
    const code = findInJson(json, 'codeBlock');
    expect(code).toBeDefined();
    expect(code.attrs.fenceDelimiter).toBe('~');
  });
});

describe('Tier B fidelity: thematic break', () => {
  test('--- carries sourceRaw = "---"', () => {
    const json = mdManager.parse('---\n');
    const hr = findInJson(json, 'thematicBreak');
    expect(hr).toBeDefined();
    expect(hr.attrs.sourceRaw).toBe('---');
  });

  test('*** carries sourceRaw = "***"', () => {
    const json = mdManager.parse('***\n');
    const hr = findInJson(json, 'thematicBreak');
    expect(hr).toBeDefined();
    expect(hr.attrs.sourceRaw).toBe('***');
  });
});

describe('Tier B fidelity: hard break', () => {
  test('backslash hard break carries hardBreakStyle = "backslash"', () => {
    const json = mdManager.parse('line\\\nbreak\n');
    const brk = findInJson(json, 'hardBreak');
    expect(brk).toBeDefined();
    expect(brk.attrs.hardBreakStyle).toBe('backslash');
  });
});

describe('Tier B fidelity: list markers', () => {
  test('dash bullet list carries bulletMarker = "-"', () => {
    const json = mdManager.parse('- item\n');
    const list = findInJson(json, 'list');
    expect(list).toBeDefined();
    expect(list.attrs.bulletMarker).toBe('-');
  });

  test('plus bullet list carries bulletMarker = "+"', () => {
    const json = mdManager.parse('+ item\n');
    const list = findInJson(json, 'list');
    expect(list).toBeDefined();
    expect(list.attrs.bulletMarker).toBe('+');
  });

  test('ordered list with dot carries listMarkerDelimiter = "."', () => {
    const json = mdManager.parse('1. item\n');
    const list = findInJson(json, 'list');
    expect(list).toBeDefined();
    expect(list.attrs.listMarkerDelimiter).toBe('.');
  });
});

describe('Tier B fidelity: listItem PM-schema artifact stripping (R6d / US-011)', () => {
  // PM `listItem` content schema is `paragraph block*`. When source mdast has
  // a non-paragraph first child (e.g. `code`), `nodeType.createAndFill`
  // synthesizes an empty paragraph so the PM doc validates. The PM→mdast
  // handler must strip that synthetic paragraph so the listItem round-trips
  // back to its original mdast shape — otherwise the empty paragraph emits
  // as `""` between the marker and the first real block, producing
  // `1. \n\n   ```...` which CommonMark refuses to interpret as list
  // continuation, escaping the first block from the listItem on re-parse.
  // Regression: CommonMark Lists section example index 23
  // (`"1. ```\n   foo\n   ```\n\n   bar\n"`).

  test('listItem with code as first child round-trips byte-identically', () => {
    const input = '1. ```\n   foo\n   ```\n\n   bar\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
    expect(r1).toBe(input);
  });

  test('listItem with code as only child round-trips byte-identically', () => {
    const input = '1. ```\n   foo\n   ```\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
    expect(r1).toBe(input);
  });

  test('listItem with paragraph first stays unchanged (no spurious strip)', () => {
    const input = '1. foo\n\n   ```\n   bar\n   ```\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
    expect(r1).toBe(input);
  });

  test('genuinely empty listItem (single empty para child) is preserved', () => {
    // `1.\n` parses to a list with one empty listItem. The single-child
    // empty paragraph is the listItem's own content, not a synthesized
    // artifact, so the strip rule must NOT fire (children.length === 1).
    const input = '1.\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
    // Verify the listItem is preserved (with its emptiness)
    const json = mdManager.parse(input);
    const listItem = findInJson(json, 'listItem');
    expect(listItem).toBeDefined();
  });

  test('listItem with thematicBreak as first child round-trips', () => {
    // Another non-paragraph block first child to confirm fix is general.
    const input = '1. ---\n\n   foo\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
  });

  test('listItem with blockquote as first child round-trips', () => {
    const input = '1. > foo\n   > bar\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
  });

  test('nested listItem with code block round-trips', () => {
    const input = '1. - ```\n     foo\n     ```\n\n     bar\n';
    const r1 = mdManager.serialize(mdManager.parse(input));
    const r2 = mdManager.serialize(mdManager.parse(r1));
    expect(r1).toBe(r2);
  });
});

describe('Tier C: link style', () => {
  test('inline link carries linkStyle = "inline"', () => {
    const json = mdManager.parse('[text](https://example.com)\n');
    const linkMark = findMarkInJson(json, 'link');
    expect(linkMark).toBeDefined();
    expect(linkMark.attrs.href).toBe('https://example.com');
    expect(linkMark.attrs.linkStyle).toBe('inline');
  });
});

describe('Tier A: passthrough', () => {
  test('blockquote round-trip', () => {
    const md = '> Quote text.\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });

  test('inline code produces code mark', () => {
    const json = mdManager.parse('Use `code` here.\n');
    const codeMark = findMarkInJson(json, 'code');
    expect(codeMark).toBeDefined();
  });

  test('paragraph round-trip', () => {
    const md = 'Hello world.\n';
    expect(mdManager.serialize(mdManager.parse(md))).toBe(md);
  });
});

// Bug B/C regression guard (2026-04-24): `handlers.wikiLinkEmbed` dispatches
// `![[file.ext]]` to PM image (image ext) or PM text+link (non-image). The
// `src`/`href` attr on those PM nodes comes from `resolveEmbed(target,
// sourcePath)` which returns a **contentDir-relative** path (e.g.
// `stories/X/IMG.PNG`). Under hash routing the browser's `location.pathname`
// is `/`, so `<img src="stories/X/IMG.PNG">` resolves to
// `http://localhost/stories/X/IMG.PNG` (correct path) only if the src starts
// with `/`. Today the dispatch emits `src: 'stories/X/IMG.PNG'` (no leading
// slash) which resolves correctly at root-level docs but breaks in subdir
// docs where the current-page URL's directory is different. The fix is to
// emit server-absolute URLs (`/stories/X/IMG.PNG`) so the browser always
// resolves against `http://localhost/<contentDir-relative>` regardless of
// the editor's hash-routed URL.
//
// These tests pin the contract: `handlers.wikiLinkEmbed` MUST emit
// server-absolute src/href when `resolveEmbed` returns a non-null path.
describe('handlers.wikiLinkEmbed — server-absolute URL contract (Bug B/C)', () => {
  test('image wiki-embed emits server-absolute src when resolveEmbed provides contentDir-relative path', () => {
    const json = mdManager.parse('![[IMG.PNG]]\n', {
      resolveEmbed: (target: string, _source: string) => {
        if (target === 'IMG.PNG') return 'stories/wiki-links-next/IMG.PNG';
        return null;
      },
      sourcePath: 'stories/wiki-links-next/README.md',
    });
    const image = findInJson(json, 'image');
    expect(image).not.toBeNull();
    // Server-absolute: the src must start with `/` so the browser resolves
    // it against location.origin regardless of the editor's hash path.
    expect(image?.attrs?.src).toMatch(/^\//);
    expect(image?.attrs?.src).toBe('/stories/wiki-links-next/IMG.PNG');
  });

  test('non-image wiki-embed (PDF) emits server-absolute href on the link mark', () => {
    const json = mdManager.parse('![[doc.pdf]]\n', {
      resolveEmbed: (target: string, _source: string) => {
        if (target === 'doc.pdf') return 'docs/sub/doc.pdf';
        return null;
      },
      sourcePath: 'docs/sub/notes.md',
    });
    const linkMark = findMarkInJson(json, 'link');
    expect(linkMark).not.toBeNull();
    expect(linkMark?.attrs?.href).toMatch(/^\//);
    expect(linkMark?.attrs?.href).toBe('/docs/sub/doc.pdf');
  });

  test('video wiki-embed (MP4) emits server-absolute href on the link mark', () => {
    const json = mdManager.parse('![[clip.mp4]]\n', {
      resolveEmbed: (target: string, _source: string) => {
        if (target === 'clip.mp4') return 'media/clip.mp4';
        return null;
      },
      sourcePath: 'notes.md',
    });
    const linkMark = findMarkInJson(json, 'link');
    expect(linkMark).not.toBeNull();
    expect(linkMark?.attrs?.href).toBe('/media/clip.mp4');
  });

  test('unresolved embed (resolveEmbed returns null) falls back to bare target', () => {
    // When the basename index doesn't know about the target, the handler
    // falls back to the bare target string. This matches today's behavior
    // for unresolved refs and is correct — the browser would 404 anyway,
    // so the server-absolute contract applies only to resolved refs.
    const json = mdManager.parse('![[missing.png]]\n', {
      resolveEmbed: () => null,
      sourcePath: 'notes.md',
    });
    const image = findInJson(json, 'image');
    expect(image).not.toBeNull();
    expect(image?.attrs?.src).toBe('missing.png');
  });

  test('image dispatch preserves sourceForm="wikiembed" marker alongside absolute src', () => {
    // sourceForm=wikiembed is load-bearing for round-trip: without it the
    // PM → mdast path would serialize as `![alt](src)` not `![[file]]`.
    // Must be preserved when the src shape changes to absolute.
    const json = mdManager.parse('![[photo.png]]\n', {
      resolveEmbed: () => 'assets/photo.png',
      sourcePath: 'notes.md',
    });
    const image = findInJson(json, 'image');
    expect(image).not.toBeNull();
    expect(image?.attrs?.sourceForm).toBe('wikiembed');
    expect(image?.attrs?.src).toBe('/assets/photo.png');
  });
});
