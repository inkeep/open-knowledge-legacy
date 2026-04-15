import { describe, expect, test } from 'bun:test';
import {
  buildRelativeMarkdownHref,
  classifyMarkdownHref,
  classifyWikiLinkTarget,
} from './link-targets.ts';

describe('classifyMarkdownHref', () => {
  test('returns null for empty hrefs', () => {
    expect(classifyMarkdownHref('', 'docs/index')).toBeNull();
  });

  test('classifies internal document hrefs', () => {
    expect(classifyMarkdownHref('./guide.md#install', 'docs/index')).toEqual({
      kind: 'doc',
      docName: 'docs/guide',
      anchor: 'install',
    });
  });

  test('classifies anchor-only hrefs', () => {
    expect(classifyMarkdownHref('#intro', 'docs/index')).toEqual({
      kind: 'anchor',
      anchor: 'intro',
    });
  });

  test('returns null for empty anchor-only hrefs', () => {
    expect(classifyMarkdownHref('#', 'docs/index')).toBeNull();
  });

  test('classifies external hrefs', () => {
    expect(classifyMarkdownHref('https://example.com/docs', 'docs/index')).toEqual({
      kind: 'external',
      url: 'https://example.com/docs',
    });
  });

  test('classifies protocol-relative hrefs as external', () => {
    expect(classifyMarkdownHref('//cdn.example.com/lib.js', 'docs/index')).toEqual({
      kind: 'external',
      url: '//cdn.example.com/lib.js',
    });
  });
});

describe('classifyWikiLinkTarget', () => {
  test('classifies document wiki targets', () => {
    expect(classifyWikiLinkTarget('guides/install', 'intro')).toEqual({
      kind: 'doc',
      docName: 'guides/install',
      anchor: 'intro',
    });
  });

  test('classifies external wiki targets', () => {
    expect(classifyWikiLinkTarget('https://example.com/docs', 'section')).toEqual({
      kind: 'external',
      url: 'https://example.com/docs#section',
    });
  });
});

describe('buildRelativeMarkdownHref', () => {
  test('builds same-directory hrefs with dot prefix', () => {
    expect(buildRelativeMarkdownHref('notes/index', 'notes/guide', 'intro')).toBe(
      './guide.md#intro',
    );
  });

  test('builds parent-relative hrefs across directories', () => {
    expect(buildRelativeMarkdownHref('guides/nested/page', 'guides/install', null)).toBe(
      '../install.md',
    );
  });
});
