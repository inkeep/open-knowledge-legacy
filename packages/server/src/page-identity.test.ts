import { describe, expect, test } from 'bun:test';
import { extractPageAliases, extractPageIdentity, extractPageTitle } from './page-identity.ts';

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

describe('extractPageTitle', () => {
  test('falls through to the first body heading when frontmatter has no title', () => {
    const content = '---\nauthor: Alice\n---\n\n# First Heading\n\nBody.';

    expect(extractPageTitle(content, 'project-alpha')).toBe('First Heading');
  });

  test('falls through to the filename when there is no title or heading', () => {
    expect(extractPageTitle('Plain body text.', 'project-alpha')).toBe('project-alpha');
  });
});
