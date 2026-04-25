import { describe, expect, test } from 'bun:test';
import { pickInsertShape } from './index';

// Emit-dispatch matrix: zero user-facing upload config. Dispatch reads
// the fixed constants `WIKI_EMBED_EXTENSIONS` + `IMAGE_EXTENSIONS` +
// `DEFAULT_EMIT_FORMAT`. The extension-matrix coverage that matters
// (image / non-image wikiembed / opaque / markdown-doc) stays.
describe('pickInsertShape — emit-dispatch by extension', () => {
  test('image extension emits wikiembed', () => {
    expect(pickInsertShape('photo.png').kind).toBe('wikiembed');
    expect(pickInsertShape('diagram.svg').kind).toBe('wikiembed');
  });

  test('non-image wikiembed extension emits wikiembed', () => {
    expect(pickInsertShape('draft.pdf').kind).toBe('wikiembed');
    expect(pickInsertShape('clip.mp4').kind).toBe('wikiembed');
    expect(pickInsertShape('song.mp3').kind).toBe('wikiembed');
  });

  test('opaque extension emits markdown-link', () => {
    expect(pickInsertShape('archive.zip').kind).toBe('markdown-link');
    expect(pickInsertShape('report.docx').kind).toBe('markdown-link');
    expect(pickInsertShape('data.csv').kind).toBe('markdown-link');
  });

  test('extension matching is case-insensitive', () => {
    expect(pickInsertShape('PHOTO.PNG').kind).toBe('wikiembed');
    expect(pickInsertShape('Clip.MP4').kind).toBe('wikiembed');
  });

  // .md / .mdx are first-class OK docs, not opaque assets. The drop surface
  // emits a [[foo]] wiki-link so navigation, fileIndex resolution, and
  // source-mode broken-link decoration all compose for free. `![[foo.md]]`
  // would imply transclusion, which OK doesn't support today.
  describe('markdown files emit wiki-link (link semantic, not embed)', () => {
    test('.md emits wiki-link', () => {
      expect(pickInsertShape('notes.md').kind).toBe('wiki-link');
    });

    test('.mdx emits wiki-link', () => {
      expect(pickInsertShape('notes.mdx').kind).toBe('wiki-link');
    });

    test('extension matching is case-insensitive', () => {
      expect(pickInsertShape('NOTES.MD').kind).toBe('wiki-link');
      expect(pickInsertShape('NOTES.MDX').kind).toBe('wiki-link');
    });
  });

  test('file without extension emits markdown-link', () => {
    expect(pickInsertShape('README').kind).toBe('markdown-link');
  });
});
