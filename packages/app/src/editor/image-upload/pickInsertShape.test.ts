import { describe, expect, test } from 'bun:test';
import type { UploadConfig } from '@inkeep/open-knowledge-core';
import { DEFAULT_UPLOAD_CONFIG } from '@inkeep/open-knowledge-core';
import { pickInsertShape } from './index.ts';

function cfg(overrides: Partial<UploadConfig> = {}): UploadConfig {
  return { ...DEFAULT_UPLOAD_CONFIG, ...overrides };
}

// SPEC §6 FR-1a emit-dispatch matrix + SPEC M5 operator tunability.
describe('pickInsertShape — emit-dispatch by extension × emitFormat × wikiEmbedExtensions', () => {
  describe('default config (emitFormat="wikiembed")', () => {
    test('image extension emits wikiembed', () => {
      expect(pickInsertShape('photo.png', cfg()).kind).toBe('wikiembed');
      expect(pickInsertShape('diagram.svg', cfg()).kind).toBe('wikiembed');
    });

    test('non-image wikiembed extension emits wikiembed', () => {
      expect(pickInsertShape('draft.pdf', cfg()).kind).toBe('wikiembed');
      expect(pickInsertShape('clip.mp4', cfg()).kind).toBe('wikiembed');
      expect(pickInsertShape('song.mp3', cfg()).kind).toBe('wikiembed');
    });

    test('opaque extension emits markdown-link', () => {
      expect(pickInsertShape('archive.zip', cfg()).kind).toBe('markdown-link');
      expect(pickInsertShape('report.docx', cfg()).kind).toBe('markdown-link');
      expect(pickInsertShape('data.csv', cfg()).kind).toBe('markdown-link');
    });
  });

  describe('operator override emitFormat="markdown-image"', () => {
    const override = cfg({ emitFormat: 'markdown-image' });

    test('image extension emits plain image (markdown-image style)', () => {
      expect(pickInsertShape('photo.png', override).kind).toBe('image');
      expect(pickInsertShape('diagram.svg', override).kind).toBe('image');
    });

    test('non-image wikiembed extension emits markdown-link (NOT image)', () => {
      // Matches SPEC §6 matrix row 4: non-image + markdown-image → `[file](path)` markdown link.
      expect(pickInsertShape('draft.pdf', override).kind).toBe('markdown-link');
      expect(pickInsertShape('clip.mp4', override).kind).toBe('markdown-link');
    });

    test('opaque extension still emits markdown-link regardless of emitFormat', () => {
      expect(pickInsertShape('archive.zip', override).kind).toBe('markdown-link');
    });
  });

  describe('operator override wikiEmbedExtensions', () => {
    test('adding a custom extension lifts it into wikiembed dispatch', () => {
      const custom = cfg({ wikiEmbedExtensions: ['zip', 'png'] });
      expect(pickInsertShape('archive.zip', custom).kind).toBe('wikiembed');
      expect(pickInsertShape('photo.png', custom).kind).toBe('wikiembed');
    });

    test('removing an extension drops it to markdown-link', () => {
      const narrow = cfg({ wikiEmbedExtensions: ['png'] });
      expect(pickInsertShape('draft.pdf', narrow).kind).toBe('markdown-link');
      expect(pickInsertShape('photo.png', narrow).kind).toBe('wikiembed');
    });

    test('extension matching is case-insensitive', () => {
      expect(pickInsertShape('PHOTO.PNG', cfg()).kind).toBe('wikiembed');
      expect(pickInsertShape('Clip.MP4', cfg()).kind).toBe('wikiembed');
    });
  });

  describe('markdown files emit wiki-link (link semantic, not embed)', () => {
    // .md / .mdx are first-class OK docs, not opaque assets. The drop surface
    // emits a [[foo]] wiki-link so navigation, fileIndex resolution, and
    // source-mode broken-link decoration all compose for free. `![[foo.md]]`
    // would imply transclusion, which OK doesn't support today.
    test('.md emits wiki-link', () => {
      expect(pickInsertShape('notes.md', cfg()).kind).toBe('wiki-link');
    });

    test('.mdx emits wiki-link', () => {
      expect(pickInsertShape('notes.mdx', cfg()).kind).toBe('wiki-link');
    });

    test('extension matching is case-insensitive', () => {
      expect(pickInsertShape('NOTES.MD', cfg()).kind).toBe('wiki-link');
      expect(pickInsertShape('NOTES.MDX', cfg()).kind).toBe('wiki-link');
    });

    test('md wins even when md is explicitly in wikiEmbedExtensions', () => {
      const custom = cfg({ wikiEmbedExtensions: ['png', 'md'] });
      expect(pickInsertShape('notes.md', custom).kind).toBe('wiki-link');
    });

    test('md is not affected by emitFormat override', () => {
      const override = cfg({ emitFormat: 'markdown-image' });
      expect(pickInsertShape('notes.md', override).kind).toBe('wiki-link');
    });
  });

  test('file without extension emits markdown-link', () => {
    // No ext → opaque.
    expect(pickInsertShape('README', cfg()).kind).toBe('markdown-link');
  });
});
