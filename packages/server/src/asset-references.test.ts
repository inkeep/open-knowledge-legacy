import { describe, expect, spyOn, test } from 'bun:test';
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
  test('extracts markdown image, markdown link, wiki link, and HTML link hrefs', () => {
    expect(
      extractLocalAssetHrefs(
        [
          '![Alt](./a.png)',
          '[Photo](./b.jpg)',
          '[PDF](./paper.pdf)',
          '![Spaced](<./my photo.png>)',
          '![[wiki.png]]',
          '[[linked-wiki.jpg]]',
          '[[linked-wiki.pdf]]',
          '<a href="./download.csv">Download</a>',
          '<a href=./unquoted.pdf>Unquoted</a>',
          '<a href=“./smart.pdf”>Smart</a>',
          "<a href='./single-quoted.pdf'>Single</a>",
          '<a data-href="./ignored.pdf">Ignored</a>',
          '<img src="./c.jpeg" />',
          '<img data-src="./placeholder.png" src="./real.png" />',
          '<image src="./d.png" />',
        ].join('\n'),
      ),
    ).toEqual([
      './a.png',
      './b.jpg',
      './paper.pdf',
      './my photo.png',
      'wiki.png',
      'linked-wiki.jpg',
      'linked-wiki.pdf',
      './download.csv',
      './unquoted.pdf',
      './smart.pdf',
      './single-quoted.pdf',
      './c.jpeg',
      './real.png',
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
      writeFileSync(join(dir, 'docs', 'paper.pdf'), 'pdf');
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
          href: './paper.pdf',
        }),
      ).toBe(realpathSync(resolve(dir, 'docs/paper.pdf')));

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
      writeFileSync(
        join(dir, 'docs', 'second.md'),
        '[same](./photo.png)\n[paper](./paper.pdf)\n<a href="./data.csv">Data</a>',
      );
      writeFileSync(join(dir, 'docs', 'photo.png'), 'png');
      writeFileSync(join(dir, 'docs', 'embed.jpg'), 'jpg');
      writeFileSync(join(dir, 'docs', 'paper.pdf'), 'pdf');
      writeFileSync(join(dir, 'docs', 'data.csv'), 'csv');
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
            : '[same](./photo.png)\n[paper](./paper.pdf)\n<a href="./data.csv">Data</a>',
      });

      expect(assets).toHaveLength(4);
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
      expect(assets.find((asset) => asset.path === 'docs/paper.pdf')).toMatchObject({
        kind: 'asset',
        path: 'docs/paper.pdf',
        assetExt: '.pdf',
        mediaKind: null,
        referencedBy: ['docs/second'],
      });
      expect(assets.find((asset) => asset.path === 'docs/data.csv')).toMatchObject({
        kind: 'asset',
        path: 'docs/data.csv',
        assetExt: '.csv',
        mediaKind: null,
        referencedBy: ['docs/second'],
      });
    }));

  test('returns empty asset list when content directory cannot be resolved', () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const assets = collectReferencedAssets({
        contentDir: join(tmpdir(), 'ok-missing-content-dir'),
        fileIndex: new Map(),
        readMarkdown: () => '',
      });

      expect(assets).toEqual([]);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('returns null when resolving from a missing content directory', () => {
    const warnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(
        resolveReferencedAssetPath({
          contentDir: join(tmpdir(), 'ok-missing-content-dir'),
          fromDocName: 'docs/guide',
          href: './photo.png',
        }),
      ).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
