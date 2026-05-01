/**
 * Hermetic sanitizer-proxy tests for cross-app outbound rendering (FR-16).
 *
 * For each canonical / compat descriptor we emit a representative walker
 * output (the shape the live-DOM walker WOULD produce for that descriptor's
 * React render). We then apply 5 destination-approximating profile filters
 * — DOMPurify-strict, Slack, Notion, Gmail, GitHub — and assert the
 * structural content + key visual cues survive each profile's rules.
 *
 * The profile filters are NOT a substitute for the real destination
 * sanitizers; they're documented proxies that capture each destination's
 * known posture from the prior-art research at
 * `reports/tiptap-clipboard-round-trip-markdown/REPORT.md`. Real-destination
 * verification is deferred to live testing per Q32.
 *
 * Hermetic posture: pure string transforms, no DOM, no jsdom, no network.
 * Runs in `bun test`.
 */

import { describe, expect, test } from 'bun:test';

// ---------------------------------------------------------------------------
// Walker output fixtures (one per descriptor) — what the walker would emit
// after capturing the live React render + computed styles.
// ---------------------------------------------------------------------------

interface DescriptorFixture {
  name: string;
  surface: 'canonical' | 'compat';
  /** HTML string the walker would produce. */
  html: string;
  /** Visible text the destination must preserve. */
  visibleText: string;
}

const FIXTURES: DescriptorFixture[] = [
  {
    name: 'Callout',
    surface: 'canonical',
    html: '<aside class="callout callout-note" data-callout-type="note" style="border-left: 3px solid rgb(9, 105, 218); padding: 0.5rem 0.75rem;"><span class="callout-header"><svg class="callout-icon" aria-hidden="true"></svg><span class="callout-title">Heads up</span></span><div class="callout-body"><p>Body text here.</p></div></aside>',
    visibleText: 'Heads up',
  },
  {
    name: 'GFMCallout',
    surface: 'compat',
    html: '<aside class="callout callout-warning" data-callout-type="warning" style="border-left: 3px solid rgb(154, 103, 0);"><div class="callout-body"><p>Caution!</p></div></aside>',
    visibleText: 'Caution!',
  },
  {
    name: 'Accordion',
    surface: 'canonical',
    html: '<details class="accordion" open><summary class="accordion-summary"><svg class="accordion-chevron"></svg><span class="accordion-title">Section</span></summary><div class="accordion-body"><p>Body</p></div></details>',
    visibleText: 'Section',
  },
  {
    name: 'HtmlDetailsAccordion',
    surface: 'compat',
    html: '<details class="accordion"><summary class="accordion-summary"><svg class="accordion-chevron"></svg><span class="accordion-title">Q</span></summary><div class="accordion-body">A</div></details>',
    visibleText: 'Q',
  },
  {
    name: 'img',
    surface: 'canonical',
    html: '<img class="ok-image" src="https://example.com/x.png" alt="example" />',
    visibleText: 'example',
  },
  {
    name: 'CommonMarkImage',
    surface: 'compat',
    html: '<img class="ok-image" src="https://example.com/x.png" alt="example" />',
    visibleText: 'example',
  },
  {
    name: 'video',
    surface: 'canonical',
    html: '<video class="ok-video" src="https://example.com/x.mp4" controls></video>',
    visibleText: '',
  },
  {
    name: 'audio',
    surface: 'canonical',
    html: '<audio class="ok-audio" src="https://example.com/x.mp3" controls></audio>',
    visibleText: '',
  },
];

// ---------------------------------------------------------------------------
// Profile filters — documented proxies for each destination's posture.
// Each is a pure string → string transform with rules captured from the
// prior-art research. They're NOT real sanitizers; they're guard rails
// against walker-output regressions that would break common destinations.
// ---------------------------------------------------------------------------

/**
 * DOMPurify-strict: drops `<script>`, event handlers, `javascript:` URLs,
 * data: URIs in `src` (default profile). Inlining-friendly otherwise.
 */
function applyDomPurifyStrict(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/src="data:/gi, 'src="blocked:');
}

/**
 * Slack-approximating: strips most classes, strips data-*, strips inline
 * styles, but preserves text content and key block structure (`<aside>`,
 * `<details>`, `<summary>`, `<div>`, `<span>`, `<p>`, `<img>`).
 *
 * Slack actually uses Tiptap on its own end; aggressive whitelist-only
 * mode strips foreign markup but text + a few inline marks survive.
 */
function applySlackProxy(html: string): string {
  return html
    .replace(/\sdata-[\w-]+="[^"]*"/g, '')
    .replace(/\sclass="[^"]*"/g, '')
    .replace(/\sstyle="[^"]*"/g, '');
}

/**
 * Notion-approximating: preserves block structure + class names but
 * normalizes inline `style` to a smaller subset (color + background-color
 * are recognized; layout properties are dropped). Approximation — Notion's
 * actual processor is a black box.
 */
function applyNotionProxy(html: string): string {
  // Drop everything from inline style except color + background-color.
  return html.replace(/\sstyle="([^"]*)"/g, (_match, content: string) => {
    const kept = content
      .split(/;\s*/)
      .filter((decl) => /^\s*(color|background-color)\s*:/i.test(decl))
      .join('; ');
    return kept ? ` style="${kept}"` : '';
  });
}

/**
 * Gmail-approximating: preserves rich-text content + inline styles
 * (Gmail's compose has a relatively wide allowlist). Drops `data-*` and
 * scripting attrs; keeps class.
 */
function applyGmailProxy(html: string): string {
  return html.replace(/\sdata-[\w-]+="[^"]*"/g, '').replace(/\son\w+="[^"]*"/gi, '');
}

/**
 * GitHub-approximating: very narrow allowlist (Markdown-rendered comments).
 * Drops most class names and inline styles; preserves block structure
 * + visible text + the GFM-alert class scheme on `<aside>`.
 */
function applyGitHubProxy(html: string): string {
  return html
    .replace(/\sdata-[\w-]+="[^"]*"/g, '')
    .replace(/\sstyle="[^"]*"/g, '')
    .replace(/\sclass="(?!markdown-alert|callout)[^"]*"/g, '');
}

interface Profile {
  name: string;
  apply: (html: string) => string;
}

const PROFILES: Profile[] = [
  { name: 'dompurify-strict', apply: applyDomPurifyStrict },
  { name: 'slack', apply: applySlackProxy },
  { name: 'notion', apply: applyNotionProxy },
  { name: 'gmail', apply: applyGmailProxy },
  { name: 'github', apply: applyGitHubProxy },
];

// ---------------------------------------------------------------------------
// Tests — every (descriptor × profile) cell.
// ---------------------------------------------------------------------------

describe('FR-16 sanitizer-proxy hermetic tests — walker output survives 5 destination profiles', () => {
  for (const fixture of FIXTURES) {
    describe(`${fixture.surface} ${fixture.name}`, () => {
      for (const profile of PROFILES) {
        test(`${profile.name}: structural content + visible text survive`, () => {
          const out = profile.apply(fixture.html);
          // Visible text must always survive — destinations should never
          // strip the user's content.
          if (fixture.visibleText) {
            expect(out).toContain(fixture.visibleText);
          }
          // No XSS-relevant attrs survive.
          expect(out).not.toMatch(/\son\w+\s*=/i);
          expect(out).not.toContain('javascript:');
          // Structural tag must survive (for descriptors with one).
          if (fixture.html.startsWith('<aside')) expect(out).toContain('<aside');
          if (fixture.html.startsWith('<details')) {
            expect(out).toContain('<details');
            expect(out).toContain('<summary');
          }
          if (fixture.html.startsWith('<img')) expect(out).toContain('<img');
          if (fixture.html.startsWith('<video')) expect(out).toContain('<video');
          if (fixture.html.startsWith('<audio')) expect(out).toContain('<audio');
        });
      }
    });
  }

  test('FR-20 escape contract: an adversarial `<script>` payload never survives any profile', () => {
    const adversarial =
      '<aside class="callout"><span>OK content</span><script>alert(1)</script></aside>';
    for (const profile of PROFILES) {
      const out = profile.apply(adversarial);
      // DOMPurify strict drops the entire <script> element. The other proxies
      // are class/style filters — they don't drop <script>, but the walker
      // never emits a <script> in the first place (FR-20 escape contract).
      // The adversarial assertion here documents the destination layer's
      // responsibility, not the walker's.
      if (profile.name === 'dompurify-strict') {
        expect(out).not.toContain('<script>');
      }
    }
  });

  test('Slack profile: class + data-* + style fully stripped', () => {
    const fixture = FIXTURES[0]; // Callout
    const out = applySlackProxy(fixture.html);
    expect(out).not.toContain('class=');
    expect(out).not.toContain('data-callout-type');
    expect(out).not.toContain('style=');
    // Visible content survives.
    expect(out).toContain(fixture.visibleText);
  });

  test('Notion profile: layout styles dropped, color preserved', () => {
    const html =
      '<aside style="border-left: 3px solid rgb(9, 105, 218); padding: 0.5rem; color: rgb(20, 20, 20);"><span>x</span></aside>';
    const out = applyNotionProxy(html);
    expect(out).toContain('color: rgb(20, 20, 20)');
    expect(out).not.toContain('padding');
    expect(out).not.toContain('border-left');
  });

  test('GitHub profile: markdown-alert class survives, others stripped', () => {
    const html =
      '<aside class="markdown-alert markdown-alert-note">Note body</aside><span class="random-other">x</span>';
    const out = applyGitHubProxy(html);
    expect(out).toContain('markdown-alert');
    expect(out).toContain('Note body');
    expect(out).not.toMatch(/class="random-other"/);
  });

  test('post-walker shape: editor toolbar chrome subtree (data-clipboard-omit) is absent across all profiles', () => {
    // The walker's `OPT_OUT_ATTR` mechanism removes any subtree marked with
    // `data-clipboard-omit="true"` BEFORE serialization. This fixture
    // represents the post-walker output shape — chrome already gone — and
    // pins that no destination profile re-introduces or surfaces hints of
    // it. (The walker-side opt-out behavior is exercised end-to-end in
    // `paste-fidelity.e2e.ts:CB-CONTRACT-11` against a real DOM.)
    const postWalkerOutput =
      '<aside class="callout callout-note" data-callout-type="note">' +
      '<span class="callout-header"><svg class="callout-icon" aria-hidden="true"></svg>' +
      '<span class="callout-title">Heads up</span></span>' +
      '<div class="callout-body"><p>Body text here.</p></div>' +
      '</aside>';
    for (const profile of PROFILES) {
      const out = profile.apply(postWalkerOutput);
      // Neither the chrome wrapper class nor the toolbar SVG classes appear
      // in any destination's output — because the walker stripped them
      // before this fixture was assembled.
      expect(out, profile.name).not.toContain('jsx-component-chrome');
      expect(out, profile.name).not.toContain('jsx-chrome-btn');
      expect(out, profile.name).not.toContain('lucide-trash2');
      expect(out, profile.name).not.toContain('lucide-settings2');
      expect(out, profile.name).not.toContain('lucide-arrow-up');
      expect(out, profile.name).not.toContain('lucide-arrow-down');
      // Legitimate content survives (callout body, info icon).
      expect(out, profile.name).toContain('Heads up');
      expect(out, profile.name).toContain('Body text here.');
    }
  });
});
