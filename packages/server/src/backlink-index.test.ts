import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BacklinkIndex,
  type ExtractedWikiLink,
  extractWikiLinksFromProsemirrorJson,
} from './backlink-index.ts';

describe('extractWikiLinksFromProsemirrorJson', () => {
  test('extracts wiki-link targets with context snippets', () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Alpha links to ' },
            { type: 'wikiLink', attrs: { target: 'beta', alias: null, anchor: null } },
            { type: 'text', text: ' for deployment notes.' },
          ],
        },
      ],
    };

    expect(extractWikiLinksFromProsemirrorJson(json)).toEqual<ExtractedWikiLink[]>([
      {
        target: 'beta',
        snippet: 'Alpha links to beta for deployment notes.',
      },
    ]);
  });

  test('handles multiple links in the same paragraph without duplicating sources', () => {
    const json = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'wikiLink', attrs: { target: 'alpha', alias: 'Alpha', anchor: null } },
            { type: 'text', text: ' and ' },
            { type: 'wikiLink', attrs: { target: 'beta', alias: null, anchor: 'heading' } },
          ],
        },
      ],
    };

    expect(extractWikiLinksFromProsemirrorJson(json)).toEqual([
      { target: 'alpha', snippet: 'Alpha and beta#heading' },
      { target: 'beta', snippet: 'Alpha and beta#heading' },
    ]);
  });
});

describe('BacklinkIndex', () => {
  test('rebuilds from disk and persists cache per branch', async () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'ok-backlinks-project-'));
    const contentDir = join(projectDir, 'content');
    mkdirSync(contentDir, { recursive: true });

    try {
      writeFileSync(join(contentDir, 'alpha.md'), '# Alpha\n\nSee [[beta]].\n', 'utf-8');
      writeFileSync(
        join(contentDir, 'beta.md'),
        '# Beta\n\nReferenced by [[alpha]] and [[alpha#details|Alpha details]].\n',
        'utf-8',
      );

      const index = new BacklinkIndex({ projectDir, contentDir });
      index.rebuildFromDisk();

      expect(index.getBacklinks('beta')).toEqual([
        {
          source: 'alpha',
          snippet: 'See beta.',
        },
      ]);
      expect(index.getForwardLinks('beta')).toEqual(['alpha']);
      expect(index.getHubs()).toEqual([
        { docName: 'alpha', count: 1 },
        { docName: 'beta', count: 1 },
      ]);
      expect(index.getOrphans(['alpha', 'beta', 'gamma'])).toEqual(['gamma']);

      await index.saveToDisk();
      const cacheRaw = readFileSync(
        join(projectDir, '.open-knowledge', 'cache', 'main', 'backlinks.json'),
        'utf-8',
      );
      expect(cacheRaw).toContain('"beta"');

      const reloaded = new BacklinkIndex({ projectDir, contentDir });
      expect(await reloaded.loadFromDisk()).toBe(true);
      expect(reloaded.getBacklinks('beta')).toEqual([
        {
          source: 'alpha',
          snippet: 'See beta.',
        },
      ]);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
