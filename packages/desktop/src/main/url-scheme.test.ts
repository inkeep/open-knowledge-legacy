import { describe, expect, test } from 'bun:test';
import { parseOpenKnowledgeUrl } from './url-scheme.ts';


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

  test('accepts flat doc-name', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=a_b-c.md')).toMatchObject({
      doc: 'a_b-c.md',
    });
  });

  test('accepts nested doc-name (common MCP producer shape)', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=docs%2Fa')).toMatchObject({
      doc: 'docs/a',
    });
  });

  test('accepts deeply nested doc-name', () => {
    expect(
      parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=deep%2Fnested%2Fpath%2Fhere.md'),
    ).toMatchObject({ doc: 'deep/nested/path/here.md' });
  });

  test('accepts unicode in nested doc-name', () => {
    expect(
      parseOpenKnowledgeUrl(
        'openknowledge://open?project=/abs&doc=notes%2F%E6%97%A5%E6%9C%AC%E8%AA%9E',
      ),
    ).toMatchObject({ doc: 'notes/日本語' });
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

  test('rejects double-encoded %2500 in project (layered null-byte smuggle)', () => {
    expect(
      parseOpenKnowledgeUrl('openknowledge://open?project=%2500/safe/proj&doc=x.md'),
    ).toBeNull();
  });

  test('rejects double-encoded %2500 in doc (layered null-byte smuggle)', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=x%2500.md')).toBeNull();
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

  test('rejects ".." segment inside nested doc (`a/../b`)', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=a%2F..%2Fb')).toBeNull();
  });

  test('rejects ".." at start of nested doc (`../foo`)', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=..%2Ffoo.md')).toBeNull();
  });

  test('rejects ".." at end of nested doc (`foo/..`)', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=foo%2F..')).toBeNull();
  });

  test('rejects leading slash in doc (absolute-path shape)', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=%2Ffoo.md')).toBeNull();
  });

  test('rejects backslash in doc (Windows-style separator)', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=sub\\foo.md')).toBeNull();
  });

  test('rejects URL-encoded backslash in nested doc', () => {
    expect(parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=a%5Cb')).toBeNull();
  });

  test('rejects URL-encoded ../ prefix in doc', () => {
    expect(
      parseOpenKnowledgeUrl('openknowledge://open?project=/abs&doc=%2e%2e%2ffoo.md'),
    ).toBeNull();
  });
});

describe('parseOpenKnowledgeUrl — MCP producer/consumer round-trip', () => {
  function buildProducerUrl(project: string, docName: string): string {
    return `openknowledge://open?project=${encodeURIComponent(project)}&doc=${encodeURIComponent(docName)}`;
  }

  test.each([
    'README',
    'notes/meeting',
    'docs/a',
    'deeply/nested/path/here.md',
    'with spaces/in name',
    'unicode/日本語',
    'punct/foo - bar',
  ])('round-trips producer docName: %s', (docName: string) => {
    const url = buildProducerUrl('/abs/project', docName);
    const parsed = parseOpenKnowledgeUrl(url);
    expect(parsed).not.toBeNull();
    expect(parsed?.doc).toBe(docName);
    expect(parsed?.project).toBe('/abs/project');
  });

  test('producer-shape traversal attempts still rejected', () => {
    expect(parseOpenKnowledgeUrl(buildProducerUrl('/abs', 'a/../b'))).toBeNull();
    expect(parseOpenKnowledgeUrl(buildProducerUrl('/abs', '../escape'))).toBeNull();
    expect(parseOpenKnowledgeUrl(buildProducerUrl('/abs', '/absolute'))).toBeNull();
  });
});
