import { describe, expect, test } from 'bun:test';
import {
  extractPageAliases,
  extractPageIdentity,
  extractPageTitle,
  parseFrontmatterMetadata,
} from './page-identity.ts';

describe('extractPageIdentity', () => {
  test('uses frontmatter title and aliases as reusable match labels', () => {
    const content = [
      '---',
      'title: Project Alpha',
      'aliases:',
      '  - Alpha Project',
      '  - "Project, A"',
      '---',
      '',
      '# Different Heading',
      '',
      'Body.',
    ].join('\n');

    expect(extractPageIdentity(content, 'project-alpha')).toEqual({
      docName: 'project-alpha',
      title: 'Project Alpha',
      aliases: ['Alpha Project', 'Project, A'],
      matchLabels: ['Project Alpha', 'Alpha Project', 'Project, A'],
      normalizedMatchLabels: ['project-alpha', 'alpha-project', 'project-a'],
    });
  });

  test('reuses shared slug normalization for match-label comparisons', () => {
    const content = [
      '---',
      'title: Café Menu',
      'aliases:',
      '  - Cafe Menu',
      '  - 東京 2026',
      '---',
      '',
      'Body.',
    ].join('\n');

    expect(extractPageIdentity(content, 'cafe-menu')).toEqual({
      docName: 'cafe-menu',
      title: 'Café Menu',
      aliases: ['Cafe Menu', '東京 2026'],
      matchLabels: ['Café Menu', 'Cafe Menu', '東京 2026'],
      normalizedMatchLabels: ['cafe-menu', '東京-2026'],
    });
  });
});

describe('extractPageAliases', () => {
  test('supports inline alias arrays and exact deduplication', () => {
    const content = ['---', 'aliases: ["Alpha", "Project, A", "Alpha"]', '---', '', 'Body.'].join(
      '\n',
    );

    expect(extractPageAliases(content)).toEqual(['Alpha', 'Project, A']);
  });
});

describe('parseFrontmatterMetadata', () => {
  test('extracts all fields from valid frontmatter', () => {
    const raw = [
      '---',
      'title: Vector Search',
      'description: How vector search works',
      'tags: [retrieval, embeddings, ANN]',
      'category: method',
      'cluster: retrieval',
      '---',
    ].join('\n');

    expect(parseFrontmatterMetadata(raw)).toEqual({
      cluster: 'retrieval',
      category: 'method',
      tags: ['retrieval', 'embeddings', 'ANN'],
    });
  });

  test('returns undefined for missing individual fields', () => {
    const raw = ['---', 'title: Some Page', 'cluster: planning', '---'].join('\n');

    const result = parseFrontmatterMetadata(raw);
    expect(result.cluster).toBe('planning');
    expect(result.category).toBeUndefined();
    expect(result.tags).toBeUndefined();
  });

  test('handles block array syntax for tags', () => {
    const raw = [
      '---',
      'tags:',
      '  - memory',
      '  - consolidation',
      '  - long-term',
      'category: concept',
      '---',
    ].join('\n');

    const result = parseFrontmatterMetadata(raw);
    expect(result.tags).toEqual(['memory', 'consolidation', 'long-term']);
    expect(result.category).toBe('concept');
  });

  test('handles inline array syntax for tags', () => {
    const raw = ['---', 'tags: [sparse, dense, hybrid]', 'cluster: retrieval', '---'].join('\n');

    expect(parseFrontmatterMetadata(raw).tags).toEqual(['sparse', 'dense', 'hybrid']);
  });

  test('handles empty frontmatter without throwing', () => {
    expect(parseFrontmatterMetadata('')).toEqual({
      cluster: undefined,
      category: undefined,
      tags: undefined,
    });

    expect(parseFrontmatterMetadata('---\n---')).toEqual({
      cluster: undefined,
      category: undefined,
      tags: undefined,
    });
  });

  test('handles malformed YAML without throwing', () => {
    const raw = '---\nthis is not: valid: yaml: at all\n---';
    const result = parseFrontmatterMetadata(raw);
    expect(result.cluster).toBeUndefined();
    expect(result.category).toBeUndefined();
    expect(result.tags).toBeUndefined();
  });

  test('handles quoted scalar values', () => {
    const raw = ['---', 'cluster: "long-term-memory"', "category: 'concept'", '---'].join('\n');

    expect(parseFrontmatterMetadata(raw)).toEqual({
      cluster: 'long-term-memory',
      category: 'concept',
      tags: undefined,
    });
  });

  test('handles tags with quoted items', () => {
    const raw = ['---', 'tags: ["graph theory", \'knowledge bases\', plain]', '---'].join('\n');

    expect(parseFrontmatterMetadata(raw).tags).toEqual([
      'graph theory',
      'knowledge bases',
      'plain',
    ]);
  });

  test('returns undefined for empty tags array', () => {
    const raw = ['---', 'tags: []', '---'].join('\n');
    expect(parseFrontmatterMetadata(raw).tags).toBeUndefined();
  });

  test('handles frontmatter without delimiters', () => {
    const raw = 'cluster: evaluation\ncategory: benchmark';
    const result = parseFrontmatterMetadata(raw);
    expect(result.cluster).toBe('evaluation');
    expect(result.category).toBe('benchmark');
  });
});

describe('extractPageTitle', () => {
  test('falls through to the first body heading when frontmatter has no title', () => {
    const content = '---\nauthor: Alice\n---\n\n# First Heading\n\nBody.';

    expect(extractPageTitle(content, 'project-alpha')).toBe('First Heading');
  });

  test('falls through to the filename when there is no title or heading', () => {
    expect(extractPageTitle('Plain body text.', 'project-alpha')).toBe('project-alpha');
  });
});
