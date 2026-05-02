import { describe, expect, test } from 'bun:test';
import { renderToString } from 'react-dom/server';
import { GBrainSidebarSearch, GBrainSidebarSearchView } from './GBrainSidebarSearch';

const matchedStatus = {
  state: 'matched',
  sourceId: 'open-knowledge',
  sourceName: 'Open Knowledge',
  localPath: '/repo/open-knowledge',
} as const;

describe('GBrainSidebarSearch static rendering', () => {
  test('stays quiet while status is loading or gbrain is not installed', () => {
    const loadingHtml = renderToString(<GBrainSidebarSearch initialStatus={null} />);
    const notInstalledHtml = renderToString(
      <GBrainSidebarSearch
        initialStatus={{ state: 'not-installed', message: 'gbrain is not installed.' }}
      />,
    );

    expect(loadingHtml).toBe('');
    expect(notInstalledHtml).toBe('');
  });

  test('renders compact diagnostics when gbrain is not configured', () => {
    const html = renderToString(
      <GBrainSidebarSearch
        initialStatus={{
          state: 'not-configured',
          message: 'gbrain is installed, but sources are not configured.',
          diagnostic: 'raw CLI stderr should stay hidden',
        }}
      />,
    );

    expect(html).toContain('data-testid="gbrain-diagnostics"');
    expect(html).toContain('gbrain is installed, but sources are not configured.');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('raw CLI stderr should stay hidden');
    expect(html).not.toContain('aria-label="Search gbrain"');
  });

  test('renders compact diagnostics when the current folder is not registered', () => {
    const html = renderToString(
      <GBrainSidebarSearch
        initialStatus={{
          state: 'not-registered',
          projectPath: '/repo/open-knowledge',
          message: 'This folder is not registered as a gbrain source.',
        }}
      />,
    );

    expect(html).toContain('data-testid="gbrain-diagnostics"');
    expect(html).toContain('This folder is not registered as a gbrain source.');
    expect(html).not.toContain('aria-label="Search gbrain"');
  });

  test('renders a concise diagnostic for unexpected status errors', () => {
    const html = renderToString(
      <GBrainSidebarSearch
        initialStatus={{
          state: 'error',
          code: 'timeout',
          message: 'gbrain did not respond in time.',
          diagnostic: 'stack trace should stay hidden',
        }}
      />,
    );

    expect(html).toContain('data-testid="gbrain-diagnostics"');
    expect(html).toContain('gbrain did not respond in time.');
    expect(html).not.toContain('stack trace should stay hidden');
    expect(html).not.toContain('aria-label="Search gbrain"');
  });

  test('renders a matched-source search module', () => {
    const html = renderToString(<GBrainSidebarSearch initialStatus={matchedStatus} />);

    expect(html).toContain('data-testid="gbrain-search"');
    expect(html).toContain('gbrain search');
    expect(html).toContain('aria-label="Search gbrain"');
    expect(html).toContain('placeholder="Search Open Knowledge"');
    expect(html).toContain('aria-label="Submit gbrain search"');
  });

  test('renders result rows without local file links', () => {
    const html = renderToString(
      <GBrainSidebarSearch
        initialSearchResponse={{
          ok: true,
          sourceId: 'open-knowledge',
          limit: 10,
          results: [
            {
              sourceId: 'open-knowledge',
              slug: 'notes/family-calendar',
              title: 'Family calendar',
              snippet: 'Calendar notes from the project.',
              score: 0.87,
            },
          ],
        }}
        initialStatus={matchedStatus}
      />,
    );

    expect(html).toContain('Family calendar');
    expect(html).toContain('notes/family-calendar');
    expect(html).toContain('Calendar notes from the project.');
    expect(html).toContain('0.87');
    expect(html).not.toContain('<a ');
  });

  test('renders empty, loading, and search error states', () => {
    const emptyHtml = renderToString(
      <GBrainSidebarSearch
        initialSearchResponse={{ ok: true, sourceId: 'open-knowledge', limit: 10, results: [] }}
        initialStatus={matchedStatus}
      />,
    );
    expect(emptyHtml).toContain('No gbrain results found.');

    const loadingHtml = renderToString(
      <GBrainSidebarSearchView
        isSearching={true}
        onQueryChange={() => {}}
        onSubmit={() => {}}
        query="calendar"
        searchResponse={null}
        sourceName="Open Knowledge"
      />,
    );
    expect(loadingHtml).toContain('Searching gbrain...');

    const errorHtml = renderToString(
      <GBrainSidebarSearch
        initialSearchResponse={{
          ok: false,
          code: 'missing-embeddings',
          message: 'gbrain search is not ready for this project yet.',
        }}
        initialStatus={matchedStatus}
      />,
    );
    expect(errorHtml).toContain('gbrain search is not ready for this project yet.');
  });
});
