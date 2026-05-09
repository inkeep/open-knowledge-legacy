import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { Glob } from 'bun';
import * as ts from 'typescript';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const SCAN_ROOTS = [join(REPO_ROOT, 'packages/core/src'), join(REPO_ROOT, 'packages/app/src')];

interface DuRegistration {
  readonly name: string;
  readonly helper: string;
  readonly variantLabels: ReadonlySet<string>;
  readonly uniqueLabels: ReadonlySet<string>;
}

const REGISTRY: readonly DuRegistration[] = [
  {
    name: 'UrnIpcLookup',
    helper: 'assertNeverUrnIpcLookup',
    variantLabels: new Set(['mapped', 'http-only', 'unknown']),
    uniqueLabels: new Set(['mapped', 'http-only']),
  },
  {
    name: 'SpawnFailureReason',
    helper: 'assertNeverSpawnFailureReason',
    variantLabels: new Set(['invalid-path', 'not-installed', 'timeout', 'spawn-error']),
    uniqueLabels: new Set(['spawn-error', 'not-installed']),
  },
];

export const IPC_EXHAUSTIVENESS_OPT_OUT_LIMIT = 2;

const OPT_OUT_MARKER = /\/\/\s*ipc-exhaustiveness-check:\s*opt-out\s*—/;

function isExcludedPath(absPath: string): boolean {
  if (absPath.endsWith('.d.ts')) return true;
  if (/\.test\.tsx?$/.test(absPath)) return true;
  if (/\.type-tests\.tsx?$/.test(absPath)) return true;
  if (absPath.includes('/node_modules/')) return true;
  if (absPath.includes('/dist/')) return true;
  return false;
}

function* enumerateSourceFiles(): Generator<string> {
  for (const root of SCAN_ROOTS) {
    const glob = new Glob('**/*.{ts,tsx}');
    for (const rel of glob.scanSync({ cwd: root })) {
      const abs = join(root, rel);
      if (isExcludedPath(abs)) continue;
      yield abs;
    }
  }
}

interface SwitchInfo {
  readonly node: ts.SwitchStatement;
  readonly line: number;
  readonly caseLabels: readonly string[];
  readonly hasDefault: boolean;
  readonly defaultStatements: readonly ts.Statement[];
  readonly hasOptOutComment: boolean;
}

function getStringCaseLabel(expr: ts.Expression): string | null {
  if (ts.isStringLiteral(expr)) return expr.text;
  if (ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  return null;
}

function collectSwitches(source: ts.SourceFile, content: string): SwitchInfo[] {
  const out: SwitchInfo[] = [];
  function visit(node: ts.Node): void {
    if (ts.isSwitchStatement(node)) {
      const caseLabels: string[] = [];
      let hasDefault = false;
      let defaultStatements: readonly ts.Statement[] = [];
      let nonLiteralCase = false;
      for (const clause of node.caseBlock.clauses) {
        if (ts.isDefaultClause(clause)) {
          hasDefault = true;
          defaultStatements = clause.statements;
        } else {
          const label = getStringCaseLabel(clause.expression);
          if (label === null) {
            nonLiteralCase = true;
          } else {
            caseLabels.push(label);
          }
        }
      }
      if (!nonLiteralCase && caseLabels.length > 0) {
        const start = node.getStart(source);
        const { line } = source.getLineAndCharacterOfPosition(start);
        const lineStart = content.lastIndexOf('\n', start - 1) + 1;
        const previousLineEnd = lineStart - 1;
        const previousLineStart = content.lastIndexOf('\n', previousLineEnd - 1) + 1;
        const previousLine = content.slice(previousLineStart, previousLineEnd);
        const hasOptOutComment = OPT_OUT_MARKER.test(previousLine);
        out.push({
          node,
          line: line + 1,
          caseLabels,
          hasDefault,
          defaultStatements,
          hasOptOutComment,
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return out;
}

function matchesDu(caseLabels: readonly string[], du: DuRegistration): boolean {
  if (caseLabels.length === 0) return false;
  for (const label of caseLabels) {
    if (!du.variantLabels.has(label)) return false;
  }
  for (const label of caseLabels) {
    if (du.uniqueLabels.has(label)) return true;
  }
  return false;
}

function defaultEndsWithHelper(
  defaultStatements: readonly ts.Statement[],
  helper: string,
): boolean {
  if (defaultStatements.length === 0) return false;
  for (const stmt of defaultStatements) {
    if (statementCallsHelper(stmt, helper)) return true;
  }
  return false;
}

function statementCallsHelper(stmt: ts.Statement, helper: string): boolean {
  if (ts.isExpressionStatement(stmt)) return expressionCallsHelper(stmt.expression, helper);
  if (ts.isReturnStatement(stmt) && stmt.expression !== undefined) {
    return expressionCallsHelper(stmt.expression, helper);
  }
  if (ts.isThrowStatement(stmt)) return expressionCallsHelper(stmt.expression, helper);
  if (ts.isBlock(stmt)) {
    for (const inner of stmt.statements) {
      if (statementCallsHelper(inner, helper)) return true;
    }
  }
  return false;
}

function expressionCallsHelper(expr: ts.Expression, helper: string): boolean {
  if (
    ts.isCallExpression(expr) &&
    ts.isIdentifier(expr.expression) &&
    expr.expression.text === helper
  ) {
    return true;
  }
  return false;
}

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly du: string;
  readonly missing: string;
}

function collectViolations(): {
  violations: Violation[];
  optOutCount: number;
} {
  const violations: Violation[] = [];
  let optOutCount = 0;
  for (const file of enumerateSourceFiles()) {
    const content = readFileSync(file, 'utf8');
    if (!/switch\s*\(/.test(content)) continue;
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    for (const sw of collectSwitches(source, content)) {
      for (const du of REGISTRY) {
        if (!matchesDu(sw.caseLabels, du)) continue;
        if (sw.hasOptOutComment) {
          optOutCount++;
          continue;
        }
        if (!sw.hasDefault || !defaultEndsWithHelper(sw.defaultStatements, du.helper)) {
          violations.push({
            file: relative(REPO_ROOT, file),
            line: sw.line,
            du: du.name,
            missing: du.helper,
          });
        }
      }
    }
  }
  return { violations, optOutCount };
}

const MIN_SCANNED_FILES = 50;

describe('IPC exhaustiveness coverage', () => {
  test('scan covers ≥ MIN_SCANNED_FILES source files (anti-vacuousness)', () => {
    let count = 0;
    for (const _ of enumerateSourceFiles()) count++;
    expect(count).toBeGreaterThanOrEqual(MIN_SCANNED_FILES);
  });

  test('every switch over a registered IPC DU terminates in `default: <helper>(target)`', () => {
    const { violations } = collectViolations();
    if (violations.length > 0) {
      const list = violations
        .map(
          (v) =>
            `  ${v.file}:${v.line} — switch over ${v.du}; missing default ${v.missing}(target)`,
        )
        .join('\n');
      throw new Error(
        `IPC discriminated-union switch is not exhaustive.\n` +
          `Each switch over a registered IPC DU must terminate in \`default: <helper>(target)\`\n` +
          `where <helper> is an \`assertNeverXyz\` function whose param is typed \`never\`.\n` +
          `Violations:\n${list}`,
      );
    }
    expect(violations).toEqual([]);
  });

  test(`opt-out comment marker count is gated by IPC_EXHAUSTIVENESS_OPT_OUT_LIMIT (= ${IPC_EXHAUSTIVENESS_OPT_OUT_LIMIT})`, () => {
    const { optOutCount } = collectViolations();
    if (optOutCount > IPC_EXHAUSTIVENESS_OPT_OUT_LIMIT) {
      throw new Error(
        `Too many \`// ipc-exhaustiveness-check: opt-out — ...\` markers (${optOutCount} > ${IPC_EXHAUSTIVENESS_OPT_OUT_LIMIT}).\n` +
          `Either remove unnecessary opt-outs OR raise IPC_EXHAUSTIVENESS_OPT_OUT_LIMIT (each opt-out should map to a documented dynamic-dispatch site).`,
      );
    }
    expect(optOutCount).toBeLessThanOrEqual(IPC_EXHAUSTIVENESS_OPT_OUT_LIMIT);
  });
});
