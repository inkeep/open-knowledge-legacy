import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  collectReferencedAssets,
  extractLocalAssetHrefs,
  resolveReferencedAssetPath,
} from './asset-references.ts';
import type { FileIndexEntry } from './file-watcher.ts';

function withFixture(fn: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'ok-assets-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('asset reference extraction', () => {
  test('extracts markdown image, markdown link, and img src hrefs', () => {
    expect(
      extractLocalAssetHrefs(
        [
          '![Alt](./a.png)',
          '[Photo](./b.jpg)',
          '![Spaced](<./my photo.png>)',
          '![[wiki.png]]',
          '[[linked-wiki.jpg]]',
          '<img src="./c.jpeg" />',
          '<image src="./d.png" />',
        ].join('\n'),
      ),
    ).toEqual([
      './a.png',
      './b.jpg',
      './my photo.png',
      'wiki.png',
      'linked-wiki.jpg',
      './c.jpeg',
      './d.png',
    ]);
  });

  test('ignores asset-looking references in fenced code, inline code, and comments', () => {
    expect(
      extractLocalAssetHrefs(
        [
          '![Real](./real.png)',
          '',
          '```md',
          '![Example](./code.png)',
          '![[code-wiki.jpg]]',
          '```',
          'Inline `![Code](./inline.png)` text',
          '<!-- ![Comment](./comment.png) -->',
          '<!--',
          '<img src="./comment-block.jpeg" />',
          '-->',
          '<img src="./real-html.jpeg" />',
        ].join('\n'),
      ),
    ).toEqual(['./real.png', './real-html.jpeg']);
  });

  test('resolves only existing local assets inside contentDir', () =>
    withFixture((dir) => {
      mkdirSync(join(dir, 'docs'));
      writeFileSync(join(dir, 'docs', 'photo.png'), 'png');
      writeFileSync(join(dir, 'docs', 'My Photo.png'), 'png');

      expect(
        resolveReferencedAssetPath({
          contentDir: dir,
          fromDocName: 'docs/guide',
          href: './photo.png',
        }),
      ).toBe(realpathSync(resolve(dir, 'docs/photo.png')));
      expect(
        resolveReferencedAssetPath({
          contentDir: dir,
          fromDocName: 'docs/guide',
          href: '/docs/photo.png',
        }),
      ).toBe(realpathSync(resolve(dir, 'docs/photo.png')));
      expect(
        resolveReferencedAssetPath({
          contentDir: dir,
          fromDocName: 'docs/guide',
          href: '<./My%20Photo.png>',
        }),
      ).toBe(realpathSync(resolve(dir, 'docs/My Photo.png')));

      expect(
        resolveReferencedAssetPath({
          contentDir: dir,
          fromDocName: 'docs/guide',
          href: 'https://example.com/photo.png',
        }),
      ).toBeNull();
      expect(
        resolveReferencedAssetPath({
          contentDir: dir,
          fromDocName: 'docs/guide',
          href: '../outside.png',
        }),
      ).toBeNull();
      expect(
        resolveReferencedAssetPath({
          contentDir: dir,
          fromDocName: 'docs/guide',
          href: './missing.png',
        }),
      ).toBeNull();
    }));

  test('collects referenced assets with referencing docs and ignores unreferenced files', () =>
    withFixture((dir) => {
      mkdirSync(join(dir, 'docs'), { recursive: true });
      writeFileSync(join(dir, 'docs', 'guide.md'), '![Photo](./photo.png)\n![[embed.jpg]]');
      writeFileSync(join(dir, 'docs', 'second.md'), '[same](./photo.png)');
      writeFileSync(join(dir, 'docs', 'photo.png'), 'png');
      writeFileSync(join(dir, 'docs', 'embed.jpg'), 'jpg');
      writeFileSync(join(dir, 'docs', 'orphan.png'), 'png');
      const now = new Date().toISOString();
      const fileIndex = new Map<string, FileIndexEntry>([
        [
          'docs/guide',
          {
            size: 1,
            modified: now,
            canonicalPath: join(dir, 'docs/guide.md'),
            inode: 1,
            aliases: [],
          },
        ],
        [
          'docs/second',
          {
            size: 1,
            modified: now,
            canonicalPath: join(dir, 'docs/second.md'),
            inode: 2,
            aliases: [],
          },
        ],
      ]);

      const assets = collectReferencedAssets({
        contentDir: dir,
        fileIndex,
        readMarkdown: (path) =>
          path.endsWith('guide.md')
            ? '![Photo](./photo.png)\n![[embed.jpg]]'
            : '[same](./photo.png)',
      });

      expect(assets).toHaveLength(2);
      expect(assets.find((asset) => asset.path === 'docs/photo.png')).toMatchObject({
        kind: 'asset',
        path: 'docs/photo.png',
        assetExt: '.png',
        mediaKind: 'image',
        referencedBy: ['docs/guide', 'docs/second'],
      });
      expect(assets.find((asset) => asset.path === 'docs/embed.jpg')).toMatchObject({
        kind: 'asset',
        path: 'docs/embed.jpg',
        assetExt: '.jpg',
        mediaKind: 'image',
        referencedBy: ['docs/guide'],
      });
    }));
});
