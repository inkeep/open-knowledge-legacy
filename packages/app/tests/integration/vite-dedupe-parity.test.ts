import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';
import { RENDERER_DEDUPE } from '../../vite.dedupe';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const APP_VITE_CONFIG = resolve(REPO_ROOT, 'packages/app/vite.config.ts');
const DESKTOP_VITE_CONFIG = resolve(REPO_ROOT, 'packages/desktop/electron.vite.config.ts');

const SHARED_DEDUPE_IDENTIFIER = 'RENDERER_DEDUPE';

interface DedupeInfo {
  readonly file: string;
  readonly inlineEntries: readonly string[];
  readonly spreadIdentifiers: readonly string[];
  readonly elementCount: number;
  readonly line: number;
}

function extractDedupeArrays(filePath: string): DedupeInfo[] {
  const content = readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const out: DedupeInfo[] = [];
  function visit(node: ts.Node): void {
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === 'dedupe') ||
        (ts.isStringLiteral(node.name) && node.name.text === 'dedupe')) &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      const inlineEntries: string[] = [];
      const spreadIdentifiers: string[] = [];
      let elementCount = 0;
      for (const el of node.initializer.elements) {
        elementCount += 1;
        if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) {
          inlineEntries.push(el.text);
        } else if (ts.isSpreadElement(el) && ts.isIdentifier(el.expression)) {
          spreadIdentifiers.push(el.expression.text);
        }
      }
      const start = node.getStart(source);
      const { line } = source.getLineAndCharacterOfPosition(start);
      out.push({
        file: filePath,
        inlineEntries,
        spreadIdentifiers,
        elementCount,
        line: line + 1,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return out;
}

describe('vite + electron-vite dedupe parity', () => {
  test('both configs declare exactly one resolve.dedupe array', () => {
    const appArrays = extractDedupeArrays(APP_VITE_CONFIG);
    const desktopArrays = extractDedupeArrays(DESKTOP_VITE_CONFIG);
    expect(appArrays).toHaveLength(1);
    expect(desktopArrays).toHaveLength(1);
  });

  test('both configs spread the same shared dedupe constant', () => {
    const [appInfo] = extractDedupeArrays(APP_VITE_CONFIG);
    const [desktopInfo] = extractDedupeArrays(DESKTOP_VITE_CONFIG);
    expect(appInfo.spreadIdentifiers).toContain(SHARED_DEDUPE_IDENTIFIER);
    expect(desktopInfo.spreadIdentifiers).toContain(SHARED_DEDUPE_IDENTIFIER);
  });

  test('shared RENDERER_DEDUPE has at least one entry (anti-vacuousness floor)', () => {
    expect(RENDERER_DEDUPE.length).toBeGreaterThan(0);
  });

  test('both configs contain the same dedupe entries (inline literals + spreads agree)', () => {
    const [appInfo] = extractDedupeArrays(APP_VITE_CONFIG);
    const [desktopInfo] = extractDedupeArrays(DESKTOP_VITE_CONFIG);
    const appInline = new Set(appInfo.inlineEntries);
    const desktopInline = new Set(desktopInfo.inlineEntries);
    const appSpreads = new Set(appInfo.spreadIdentifiers);
    const desktopSpreads = new Set(desktopInfo.spreadIdentifiers);

    const onlyInAppInline = [...appInline].filter((e) => !desktopInline.has(e)).sort();
    const onlyInDesktopInline = [...desktopInline].filter((e) => !appInline.has(e)).sort();
    const onlyInAppSpreads = [...appSpreads].filter((s) => !desktopSpreads.has(s)).sort();
    const onlyInDesktopSpreads = [...desktopSpreads].filter((s) => !appSpreads.has(s)).sort();

    if (
      onlyInAppInline.length > 0 ||
      onlyInDesktopInline.length > 0 ||
      onlyInAppSpreads.length > 0 ||
      onlyInDesktopSpreads.length > 0
    ) {
      const lines: string[] = [
        `Vite + electron-vite dedupe lists drift.`,
        `Both configs must declare the same dedupe entries (inline literals + spread`,
        `identifiers) — a y-* dependency in one but not the other reintroduces the`,
        `dual-import failure mode the dedupe gate closes.`,
      ];
      if (onlyInAppInline.length > 0) {
        lines.push(`  Inline entries only in packages/app/vite.config.ts:`);
        for (const entry of onlyInAppInline) lines.push(`    - ${entry}`);
      }
      if (onlyInDesktopInline.length > 0) {
        lines.push(`  Inline entries only in packages/desktop/electron.vite.config.ts:`);
        for (const entry of onlyInDesktopInline) lines.push(`    - ${entry}`);
      }
      if (onlyInAppSpreads.length > 0) {
        lines.push(`  Spread identifiers only in packages/app/vite.config.ts:`);
        for (const id of onlyInAppSpreads) lines.push(`    - ...${id}`);
      }
      if (onlyInDesktopSpreads.length > 0) {
        lines.push(`  Spread identifiers only in packages/desktop/electron.vite.config.ts:`);
        for (const id of onlyInDesktopSpreads) lines.push(`    - ...${id}`);
      }
      throw new Error(lines.join('\n'));
    }

    expect(appInline.size).toBe(desktopInline.size);
    expect(appSpreads.size).toBe(desktopSpreads.size);
    expect(appInfo.elementCount).toBe(desktopInfo.elementCount);
  });
});
