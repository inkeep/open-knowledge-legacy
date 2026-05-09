import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { ProblemTypeSchema } from '@inkeep/open-knowledge-core';
import { Glob } from 'bun';
import * as ts from 'typescript';

const PROBLEM_TYPE_LABELS: ReadonlySet<string> = new Set(ProblemTypeSchema.options);

interface DuRegistration {
  readonly name: string;
  readonly helper: string;
  readonly variantLabels: ReadonlySet<string>;
  readonly uniqueLabels: ReadonlySet<string>;
}

const REGISTRY: readonly DuRegistration[] = [
  {
    name: 'ClassifiedLinkTarget',
    helper: 'assertNeverLinkTarget',
    variantLabels: new Set(['doc', 'external', 'anchor', 'asset']),
    uniqueLabels: new Set(['anchor', 'external']),
  },
  {
    name: 'DiskEvent',
    helper: 'assertNeverDiskEvent',
    variantLabels: new Set([
      'create',
      'update',
      'delete',
      'rename',
      'conflict',
      'asset-create',
      'asset-delete',
    ]),
    uniqueLabels: new Set(['asset-create', 'asset-delete', 'rename', 'conflict']),
  },
  {
    name: 'ProblemType',
    helper: 'assertNeverProblemType',
    variantLabels: PROBLEM_TYPE_LABELS,
    uniqueLabels: PROBLEM_TYPE_LABELS,
  },
];

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const SCAN_ROOTS = [
  join(REPO_ROOT, 'packages/core/src'),
  join(REPO_ROOT, 'packages/server/src'),
  join(REPO_ROOT, 'packages/app/src'),
];

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
}

function getStringCaseLabel(expr: ts.Expression): string | null {
  if (ts.isStringLiteral(expr)) return expr.text;
  if (ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  return null;
}

function collectSwitches(source: ts.SourceFile): SwitchInfo[] {
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
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        out.push({
          node,
          line: line + 1,
          caseLabels,
          hasDefault,
          defaultStatements,
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
  if (ts.isExpressionStatement(stmt)) {
    return expressionCallsHelper(stmt.expression, helper);
  }
  if (ts.isReturnStatement(stmt) && stmt.expression !== undefined) {
    return expressionCallsHelper(stmt.expression, helper);
  }
  if (ts.isThrowStatement(stmt)) {
    return expressionCallsHelper(stmt.expression, helper);
  }
  if (ts.isBlock(stmt)) {
    for (const inner of stmt.statements) {
      if (statementCallsHelper(inner, helper)) return true;
    }
  }
  return false;
}

function expressionCallsHelper(expr: ts.Expression, helper: string): boolean {
  if (!ts.isCallExpression(expr)) return false;
  return ts.isIdentifier(expr.expression) && expr.expression.text === helper;
}

interface Failure {
  readonly file: string;
  readonly line: number;
  readonly du: string;
  readonly reason: string;
}

function scanRepo(): Failure[] {
  const failures: Failure[] = [];
  for (const absPath of enumerateSourceFiles()) {
    const text = readFileSync(absPath, 'utf8');
    const kind = absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const source = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, kind);
    const switches = collectSwitches(source);
    for (const sw of switches) {
      for (const du of REGISTRY) {
        if (!matchesDu(sw.caseLabels, du)) continue;
        if (!sw.hasDefault) {
          failures.push({
            file: relative(REPO_ROOT, absPath),
            line: sw.line,
            du: du.name,
            reason: `switch over ${du.name} missing 'default: ${du.helper}(target)'`,
          });
          continue;
        }
        if (!defaultEndsWithHelper(sw.defaultStatements, du.helper)) {
          failures.push({
            file: relative(REPO_ROOT, absPath),
            line: sw.line,
            du: du.name,
            reason: `switch over ${du.name} default does not call ${du.helper}(target)`,
          });
        }
      }
    }
  }
  return failures;
}

describe('exhaustiveness coverage (US-003, FR11 b, D33)', () => {
  test('every switch over a registered DU ends with default: assertNeverXyz(target)', () => {
    const failures = scanRepo();
    if (failures.length > 0) {
      const lines = failures.map((f) => `  ${f.file}:${f.line} (${f.du}) — ${f.reason}`);
      throw new Error(
        `Exhaustiveness violations (${failures.length}):\n${lines.join('\n')}\n\n` +
          'Fix: add `default: assertNeverXyz(target)` (the per-DU helper) at each ' +
          'site to force compile-time discovery when a new variant is added.',
      );
    }
    expect(failures).toEqual([]);
  });

  test('the AST scanner finds the canonical ClassifiedLinkTarget consumer', () => {
    let foundClassifiedLinkTargetConsumer = false;
    for (const absPath of enumerateSourceFiles()) {
      const text = readFileSync(absPath, 'utf8');
      const kind = absPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const source = ts.createSourceFile(absPath, text, ts.ScriptTarget.Latest, true, kind);
      for (const sw of collectSwitches(source)) {
        const linkTargetDu = REGISTRY.find((d) => d.name === 'ClassifiedLinkTarget');
        if (!linkTargetDu) continue;
        if (matchesDu(sw.caseLabels, linkTargetDu)) {
          foundClassifiedLinkTargetConsumer = true;
          break;
        }
      }
      if (foundClassifiedLinkTargetConsumer) break;
    }
    expect(foundClassifiedLinkTargetConsumer).toBe(true);
  });

  test('PROBLEM_TYPE_LABELS holds the expected URN baseline (anti-vacuousness)', () => {
    expect(PROBLEM_TYPE_LABELS.size).toBeGreaterThanOrEqual(30);
  });
});
