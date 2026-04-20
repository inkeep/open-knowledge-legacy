/**
 * Tests for rehypeStripVscodeSpans — structural fallback for VS Code
 * clipboard HTML. Handles the case where the vscode-editor-data MIME
 * is NOT available and we only see the monospace per-line-div shape.
 */

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToMdast } from '../html-to-mdast.ts';
import { rehypeStripVscodeSpans } from './strip-vscode-spans.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('rehypeStripVscodeSpans', () => {
  test('converts VS Code structural per-line-divs to a single code block', () => {
    const html = fixture('vscode-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripVscodeSpans],
    });
    const types = mdast.children.map((c) => c.type);
    expect(types).toContain('code');
  });

  test('preserves per-line content with \\n joiners', () => {
    const html = fixture('vscode-sample.html');
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripVscodeSpans],
    });
    const code = mdast.children.find((c) => c.type === 'code') as
      | { type: 'code'; value: string }
      | undefined;
    expect(code).toBeDefined();
    if (!code) return;
    expect(code.value).toContain('const x = 1;');
    expect(code.value).toContain("const y = 'hello';");
    expect(code.value).toContain('return x + y;');
  });

  test('non-VS-Code HTML passes through unchanged', () => {
    const before = htmlToMdast('<p>regular prose</p>');
    const after = htmlToMdast('<p>regular prose</p>', {
      additionalCleanupPlugins: [rehypeStripVscodeSpans],
    });
    expect(after).toEqual(before);
  });

  test('single-line monospace div (not VS Code) is not transformed', () => {
    // Below threshold (<2 child divs) — leave as-is.
    const html =
      '<div style="font-family:monospace"><span style="color:red">just one line</span></div>';
    const mdast = htmlToMdast(html, {
      additionalCleanupPlugins: [rehypeStripVscodeSpans],
    });
    const types = mdast.children.map((c) => c.type);
    expect(types).not.toContain('code');
  });
});
