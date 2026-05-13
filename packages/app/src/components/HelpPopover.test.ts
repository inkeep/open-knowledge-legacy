import { describe, expect, test } from 'bun:test';
import SRC from './HelpPopover?raw';

describe('HelpPopover module', () => {
  test('Component module imports cleanly', async () => {
    const mod = await import('./HelpPopover');
    expect(typeof mod.HelpPopover).toBe('function');
  });
});

describe('HelpPopover Resources section', () => {
  test('section header reads "Resources"', () => {
    expect(SRC).toMatch(/>\s*Resources\s*</);
    expect(SRC).not.toMatch(/Help\s*&(amp;)?\s*Resources/);
  });

  test('accessible names match the visible heading (WCAG 2.5.3 Label in Name)', () => {
    expect(SRC).toContain('<span className="sr-only">Resources</span>');
    expect(SRC).toContain('<nav aria-label="Resources">');
    expect(SRC).not.toMatch(/Help\s+(and|&(amp;)?)\s+resources/i);
  });

  test('does NOT render a Setup section header', () => {
    expect(SRC).not.toMatch(/>\s*Setup\s*</);
  });

  test('does NOT render the install entry (moved to in-context Open in… menus)', () => {
    expect(SRC).not.toContain('Install for Claude Chat');
    expect(SRC).not.toContain('InstallInClaudeDesktopDialog');
  });

  test('does NOT render a Settings entry (moved to <SettingsButton />)', () => {
    expect(SRC).not.toContain('<span>Settings</span>');
    expect(SRC).not.toContain('SETTINGS_OPEN_HASH');
    expect(SRC).not.toContain('help-popover-settings');
  });
});

describe('HelpPopover links — order, labels, hrefs', () => {
  function extractLinkOrder(): Array<{ label: string; href: string }> {
    const items = SRC.match(/\{\s*label:\s*'([^']+)',\s*href:\s*'([^']+)'/g) ?? [];
    return items.map((entry) => {
      const match = entry.match(/label:\s*'([^']+)',\s*href:\s*'([^']+)'/);
      if (!match) throw new Error(`bad parse: ${entry}`);
      return { label: match[1], href: match[2] };
    });
  }

  test('renders exactly five external links in the required order', () => {
    const order = extractLinkOrder();
    expect(order).toEqual([
      { label: 'Documentation', href: 'https://openknowledge.ai/docs' },
      { label: 'GitHub', href: 'https://github.com/inkeep/open-knowledge' },
      { label: 'Website', href: 'https://openknowledge.ai/' },
      { label: 'Discord', href: 'https://go.inkeep.com/ok-discord' },
      { label: 'Twitter', href: 'https://x.com/inkeep' },
    ]);
  });

  test('uses single-noun labels (no "Twitter / X", no "Homepage")', () => {
    expect(SRC).not.toMatch(/'Twitter \/ X'/);
    expect(SRC).not.toMatch(/'Homepage'/);
  });

  test('imports GithubIcon and DiscordIcon', () => {
    expect(SRC).toContain("from './icons/github'");
    expect(SRC).toContain("from './icons/discord'");
  });

  test('does NOT import LinkedinIcon (LinkedIn link was removed)', () => {
    expect(SRC).not.toContain('LinkedinIcon');
    expect(SRC).not.toContain('./icons/linkedin');
  });

  test('does NOT import the Download icon (Setup section deleted)', () => {
    expect(SRC).not.toMatch(/\bDownload\b\s*[,}]/);
  });
});
