import { describe, expect, test } from 'bun:test';
import { canonicalizeMarkdown, structuralSignature } from './markdown.test-helpers';

function assertIdempotentAndShape(markdown: string): void {
  const before = structuralSignature(markdown);
  const once = canonicalizeMarkdown(markdown);
  const after = structuralSignature(once);
  const twice = canonicalizeMarkdown(once);

  expect(after).toEqual(before);
  expect(twice).toBe(once);
}

describe('markdown boundary idempotence', () => {
  test('ordinary markdown converges after parse/serialize', () => {
    assertIdempotentAndShape(
      [
        '# Deployment Guide',
        '',
        '## Prerequisites',
        '',
        'You need **Docker** and `kubectl` installed.',
        '',
        '- Build the container image',
        '- Push to registry',
        '- Apply the Kubernetes manifests',
        '',
        '> Always deploy to staging first.',
      ].join('\n'),
    );
  });

  test('frontmatter is preserved across repeated parse/serialize cycles', () => {
    assertIdempotentAndShape(
      [
        '---',
        'title: Deployment Guide',
        'tags: [devops, infrastructure]',
        'description: How to deploy the application to production',
        '---',
        '',
        '# Deployment Guide',
        '',
        'See the [installation guide](https://example.com/install) for details.',
      ].join('\n'),
    );
  });

  test('jsx-component fenced blocks converge after parse/serialize', () => {
    assertIdempotentAndShape(
      [
        '# Deployment Guide',
        '',
        '```jsx-component',
        '<Callout type="warning">',
        '  Always run the integration tests before deploying to production.',
        '  Skipping tests has caused two incidents this quarter.',
        '</Callout>',
        '```',
      ].join('\n'),
    );
  });

  test('formatted table cells preserve shape through canonicalization', () => {
    assertIdempotentAndShape(
      [
        '| Name | Value | Notes |',
        '| --- | --- | --- |',
        '| service | **critical** | [runbook](https://example.com/runbook) |',
        '| pipeline | `deploy` | *watch latency* |',
      ].join('\n'),
    );
  });

  test('nested list under a list item preserves list structure', () => {
    assertIdempotentAndShape(
      ['- Prepare release', '  - Build artifacts', '  - Run smoke tests', '- Deploy'].join('\n'),
    );
  });

  test('blockquote containing nested list preserves shape', () => {
    assertIdempotentAndShape(
      ['> Incident notes', '>', '> - impact: elevated latency', '> - action: rollback'].join('\n'),
    );
  });

  test('frontmatter-only document converges and keeps frontmatter presence', () => {
    assertIdempotentAndShape(
      ['---', 'title: Frontmatter Only', 'tags: [ops, docs]', '---'].join('\n'),
    );
  });

  test('empty body converges without changing document shape', () => {
    assertIdempotentAndShape('');
  });

  test('jsx-component with odd whitespace and backticks preserves shape', () => {
    assertIdempotentAndShape(
      [
        '```jsx-component',
        '<Callout type="warning">',
        '    Keep   spacing   exactly   as written.',
        '  Use `single` and ``double`tick`` markers here.',
        '  ',
        '  One more line with trailing spaces   ',
        '</Callout>',
        '```',
      ].join('\n'),
    );
  });
});
