import { describe, expect, test } from 'bun:test';
import { parseOpenKnowledgeUrl } from './url-scheme.ts';

/**
 * Covers AC1 + validation half of AC3/AC4/AC5/AC6. Pure function — no
 * Electron bindings touched at module top, so Bun runs it directly.
 */

describe('parseOpenKnowledgeUrl — valid inputs', () => {
  test('parses well-formed open/project/doc URL', () => {
    const result = parseOpenKnowledgeUrl('openknowledge://open?project=/abs/path&doc=foo.md');
    expect(result).toEqual({
      host: 'open',
      project: '/abs/path',
      doc: 'foo.md',
    });
  });

  test('url-decodes project + doc before validation', () => {
    const result = parseOpenKnowledgeUrl(
      'openknowledge://open?project=%2Fabs%2Fmy%20path&doc=foo%20bar.md',
    );
    expect(result).toEqual({
      host: 'open',
      project: '/abs/my path',
      doc: 'foo bar.md',
    });
  });

  test('accepts nested doc-names only when they are flat (no slashes)', () => {
    // Doc names are in-project leafs — not paths. A `subdir/foo.md` shape is
    // reserved for a future iteration that wants to carry hierarchy.
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=a_b-c.md')).toMatchObject({
      doc: 'a_b-c.md',
    });
  });
});

describe('parseOpenKnowledgeUrl — protocol + host validation', () => {
  test('rejects non-openknowledge protocol', () => {
    expect(parseOpenKnowledgeUrl('https://open?project=/abs/path&doc=foo.md')).toBeNull();
  });

  test('rejects unknown host (host !== "open")', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://delete?project=/abs/path&doc=foo.md')).toBeNull();
  });

  test('rejects empty host', () => {
    // `openknowledge:` with no authority part — URL parser may treat as opaque.
    expect(parseOpenKnowledgeUrl('openknowledge:?project=/abs&doc=x')).toBeNull();
  });

  test('rejects obviously malformed URL', () => {
    expect(parseOpenKnowledgeUrl('not a url')).toBeNull();
  });

  test('rejects empty string', () => {
    expect(parseOpenKnowledgeUrl('')).toBeNull();
  });
});

describe('parseOpenKnowledgeUrl — required params', () => {
  test('rejects missing project', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?doc=foo.md')).toBeNull();
  });

  test('rejects missing doc', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs/path')).toBeNull();
  });

  test('rejects empty project', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=&doc=foo.md')).toBeNull();
  });

  test('rejects empty doc', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=')).toBeNull();
  });
});

describe('parseOpenKnowledgeUrl — null-byte defense', () => {
  test('rejects literal null byte in raw input', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs\x00&doc=x.md')).toBeNull();
  });

  test('rejects %00 in project', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=%00/safe/proj&doc=x.md')).toBeNull();
  });

  test('rejects %00 in doc', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=x%00.md')).toBeNull();
  });
});

describe('parseOpenKnowledgeUrl — path-traversal defense', () => {
  test('rejects literal ../ in project', () => {
    expect(
      parseOpenKnowledgeUrl('openknowledge://open?project=/abs/../etc/passwd&doc=x.md'),
    ).toBeNull();
  });

  test('rejects ../../ in project', () => {
    expect(
      parseOpenKnowledgeUrl('openknowledge://open?project=../../etc/passwd&doc=x.md'),
    ).toBeNull();
  });

  test('rejects URL-encoded %2e%2e path traversal', () => {
    expect(
      parseOpenKnowledgeUrl('openknowledge://open?project=%2e%2e%2f%2e%2e%2fetc%2fpasswd&doc=x.md'),
    ).toBeNull();
  });

  test('rejects relative project path', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=relative/path&doc=x.md')).toBeNull();
  });

  test('rejects ".." as literal doc', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=..')).toBeNull();
  });

  test('rejects slash in doc', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=sub/foo.md')).toBeNull();
  });

  test('rejects backslash in doc (Windows-style separator)', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=sub\\foo.md')).toBeNull();
  });

  test('rejects URL-encoded ../ prefix in doc', () => {
    expect(
      parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=%2e%2e%2ffoo.md'),
    ).toBeNull();
  });
});
