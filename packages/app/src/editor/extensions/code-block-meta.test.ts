import { describe, expect, test } from 'bun:test';
import {
  addMetaToken,
  getMetaKeyValue,
  joinMetaTokens,
  metaHasToken,
  parsePreviewHeight,
  removeMetaToken,
  setMetaKeyValue,
  shouldShowPreview,
  splitMetaTokens,
} from './code-block-meta';

describe('splitMetaTokens', () => {
  test('null / undefined / empty → []', () => {
    expect(splitMetaTokens(null)).toEqual([]);
    expect(splitMetaTokens(undefined)).toEqual([]);
    expect(splitMetaTokens('')).toEqual([]);
  });
  test('single token', () => {
    expect(splitMetaTokens('preview')).toEqual(['preview']);
  });
  test('multiple whitespace-delimited tokens', () => {
    expect(splitMetaTokens('preview title="demo"')).toEqual(['preview', 'title="demo"']);
  });
  test('collapses extra whitespace', () => {
    expect(splitMetaTokens('  preview\t\ttitle ')).toEqual(['preview', 'title']);
  });
});

describe('joinMetaTokens', () => {
  test('empty → null', () => {
    expect(joinMetaTokens([])).toBeNull();
    expect(joinMetaTokens([''])).toBeNull();
  });
  test('single token', () => {
    expect(joinMetaTokens(['preview'])).toBe('preview');
  });
  test('multiple tokens — single-space delimited', () => {
    expect(joinMetaTokens(['preview', 'title="demo"'])).toBe('preview title="demo"');
  });
});

describe('metaHasToken', () => {
  test('present as standalone token', () => {
    expect(metaHasToken('preview', 'preview')).toBe(true);
    expect(metaHasToken('foo preview bar', 'preview')).toBe(true);
  });
  test('absent', () => {
    expect(metaHasToken(null, 'preview')).toBe(false);
    expect(metaHasToken('foo bar', 'preview')).toBe(false);
  });
  test('case-sensitive — substring match does NOT count', () => {
    expect(metaHasToken('previewer', 'preview')).toBe(false);
    expect(metaHasToken('Preview', 'preview')).toBe(false);
  });
});

describe('addMetaToken', () => {
  test('idempotent — already present', () => {
    expect(addMetaToken('preview', 'preview')).toBe('preview');
    expect(addMetaToken('foo preview', 'preview')).toBe('foo preview');
  });
  test('appends to empty', () => {
    expect(addMetaToken(null, 'preview')).toBe('preview');
    expect(addMetaToken('', 'preview')).toBe('preview');
  });
  test('appends preserving other tokens', () => {
    expect(addMetaToken('title="demo"', 'preview')).toBe('title="demo" preview');
  });
});

describe('removeMetaToken', () => {
  test('removes when present', () => {
    expect(removeMetaToken('preview', 'preview')).toBeNull();
    expect(removeMetaToken('foo preview bar', 'preview')).toBe('foo bar');
  });
  test('no-op when absent', () => {
    expect(removeMetaToken(null, 'preview')).toBeNull();
    expect(removeMetaToken('foo bar', 'preview')).toBe('foo bar');
  });
  test('case-sensitive — does NOT remove a different-case token', () => {
    expect(removeMetaToken('Preview', 'preview')).toBe('Preview');
  });
});

describe('shouldShowPreview', () => {
  test('html + preview meta → true', () => {
    expect(shouldShowPreview('html', 'preview')).toBe(true);
    expect(shouldShowPreview('HTML', 'preview')).toBe(true);
  });
  test('xml (normalized form of html) + preview meta → true', () => {
    expect(shouldShowPreview('xml', 'preview')).toBe(true);
  });
  test('html without preview meta → false', () => {
    expect(shouldShowPreview('html', null)).toBe(false);
    expect(shouldShowPreview('html', 'title="demo"')).toBe(false);
  });
  test('non-previewable language → false even with preview meta', () => {
    expect(shouldShowPreview('javascript', 'preview')).toBe(false);
    expect(shouldShowPreview('css', 'preview')).toBe(false);
  });
  test('no language → false', () => {
    expect(shouldShowPreview(null, 'preview')).toBe(false);
  });
});

describe('getMetaKeyValue', () => {
  test('present', () => {
    expect(getMetaKeyValue('h=40', 'h')).toBe('40');
    expect(getMetaKeyValue('preview h=40', 'h')).toBe('40');
    expect(getMetaKeyValue('preview h=40 title="demo"', 'h')).toBe('40');
  });
  test('absent', () => {
    expect(getMetaKeyValue(null, 'h')).toBeNull();
    expect(getMetaKeyValue('preview', 'h')).toBeNull();
  });
  test('case-sensitive key match', () => {
    expect(getMetaKeyValue('H=40', 'h')).toBeNull();
  });
  test('first occurrence wins', () => {
    expect(getMetaKeyValue('h=20 h=40', 'h')).toBe('20');
  });
});

describe('setMetaKeyValue', () => {
  test('adds when absent', () => {
    expect(setMetaKeyValue(null, 'h', '500px')).toBe('h=500px');
    expect(setMetaKeyValue('preview', 'h', '500px')).toBe('preview h=500px');
  });
  test('replaces when present, preserving position + other tokens', () => {
    expect(setMetaKeyValue('preview h=40', 'h', '500px')).toBe('preview h=500px');
    expect(setMetaKeyValue('h=40 preview', 'h', '500px')).toBe('h=500px preview');
    expect(setMetaKeyValue('preview h=40 title="demo"', 'h', '500px')).toBe(
      'preview h=500px title="demo"',
    );
  });
  test('value=null removes the token', () => {
    expect(setMetaKeyValue('preview h=40', 'h', null)).toBe('preview');
    expect(setMetaKeyValue('h=40', 'h', null)).toBeNull();
  });
  test('dedupes duplicate keys to the first-wins value', () => {
    expect(setMetaKeyValue('h=20 h=40', 'h', '500px')).toBe('h=500px');
  });
});

describe('parsePreviewHeight', () => {
  test('unitless number → rem', () => {
    expect(parsePreviewHeight('preview h=40')).toBe('40rem');
    expect(parsePreviewHeight('h=12')).toBe('12rem');
  });
  test('explicit unit preserved', () => {
    expect(parsePreviewHeight('preview h=400px')).toBe('400px');
    expect(parsePreviewHeight('h=80vh')).toBe('80vh');
    expect(parsePreviewHeight('h=50%')).toBe('50%');
    expect(parsePreviewHeight('h=24em')).toBe('24em');
  });
  test('decimal numbers', () => {
    expect(parsePreviewHeight('h=12.5')).toBe('12.5rem');
    expect(parsePreviewHeight('h=0.5vh')).toBe('0.5vh');
  });
  test('missing or malformed → null', () => {
    expect(parsePreviewHeight(null)).toBeNull();
    expect(parsePreviewHeight('preview')).toBeNull();
    expect(parsePreviewHeight('h=tall')).toBeNull();
    expect(parsePreviewHeight('h=40foo')).toBeNull();
    expect(parsePreviewHeight('h=')).toBeNull();
  });
  test('zero and zero-shaped values → null', () => {
    expect(parsePreviewHeight('h=0')).toBeNull();
    expect(parsePreviewHeight('h=0px')).toBeNull();
    expect(parsePreviewHeight('h=0.0')).toBeNull();
    expect(parsePreviewHeight('h=0.0vh')).toBeNull();
  });
});
