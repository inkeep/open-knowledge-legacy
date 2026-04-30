/**
 * Exhaustiveness coverage meta-test (US-003 / D33 / FR11 b).
 *
 * Static-analysis gate that AST-scans the codebase for every `switch (x.kind)`
 * (or equivalent property-keyed switch) whose case labels match a registered
 * discriminated-union type, and asserts the switch terminates with
 * `default: assertNeverXyz(target)`.
 *
 * The defended failure mode is the consumer-forgets-the-guard one: a developer
 * adds a new switch over `ClassifiedLinkTarget`, doesn't include `default:
 * assertNeverLinkTarget(target)`, and a future variant addition silently
 * drops on the floor at that site. Per-DU `*.exhaustiveness.test.ts` files
 * (D25, superseded) only proved themselves exhaustive — they couldn't catch
 * a consumer that omitted the helper.
 *
 * The DU registry is opt-in: only types listed here are scanned. Adding a new
 * registered DU is a single-line edit. Switches are matched via case-label
 * containment (every case label must belong to the DU's variant set, AND at
 * least one case label must be unique to this DU — disambiguates from other
 * DUs that share kind names like `'doc'`).
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { Glob } from 'bun';
import * as ts from 'typescript';

interface DuRegistration {
  /** Display name (used in failure messages). */
  readonly name: string;
  /** Helper expected at `default: <helper>(target)`. */
  readonly helper: string;
  /** Every kind/discriminator value the DU defines. */
  readonly variantLabels: ReadonlySet<string>;
  /**
   * Disambiguator labels — case labels that uniquely identify this DU
   * relative to other registered DUs (e.g., `'doc'` is shared between
   * `ClassifiedLinkTarget` and `ResolvedNavigationTarget`, so it cannot
   * disambiguate). At least one case label must be in this set for the
   * heuristic to claim the switch is over this DU.
   */
  readonly uniqueLabels: ReadonlySet<string>;
}

const REGISTRY: readonly DuRegistration[] = [
  {
    name: 'ClassifiedLinkTarget',
    helper: 'assertNeverLinkTarget',
    variantLabels: new Set(['doc', 'external', 'anchor', 'asset']),
    // 'doc' is shared with ResolvedNavigationTarget; 'asset' is generic
    // enough to appear elsewhere. 'anchor' and 'external' are distinctive
    // enough to identify a ClassifiedLinkTarget switch.
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
    // Compound names + 'rename'/'conflict' are unique to DiskEvent in this
    // codebase. Generic 'create'/'update'/'delete' alone do not disambiguate
    // (they appear in RawFileEvent.type).
    uniqueLabels: new Set(['asset-create', 'asset-delete', 'rename', 'conflict']),
  },
  {
    name: 'ProblemType',
    helper: 'assertNeverProblemType',
    // Seeded with the URN tokens defined in core/src/schemas/api.ts. The
    // helper does not exist yet — there are no consumer switches over
    // ProblemType today (handler-migration stories add them). This entry
    // is vacuously satisfied; the test proactively guards future consumers.
    variantLabels: new Set([
      'urn:ok:error:malformed-upload',
      'urn:ok:error:collision-exhaustion',
      'urn:ok:error:storage-full',
      'urn:ok:error:storage-readonly',
      'urn:ok:error:storage-error',
      'urn:ok:error:no-file-received',
      'urn:ok:error:parent-doc-name-required',
      'urn:ok:error:path-escape',
      'urn:ok:error:method-not-allowed',
      'urn:ok:error:invalid-request',
      'urn:ok:error:internal-server-error',
    ]),
    uniqueLabels: new Set([
      'urn:ok:error:malformed-upload',
      'urn:ok:error:collision-exhaustion',
      'urn:ok:error:storage-full',
      'urn:ok:error:storage-readonly',
      'urn:ok:error:storage-error',
      'urn:ok:error:no-file-received',
      'urn:ok:error:parent-doc-name-required',
      'urn:ok:error:path-escape',
      'urn:ok:error:method-not-allowed',
      'urn:ok:error:invalid-request',
      'urn:ok:error:internal-server-error',
    ]),
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
      // Skip switches that contain non-literal case expressions (e.g.,
      // computed keys, identifiers) — heuristic doesn't apply.
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
  // Allow `helper(x)`, `return helper(x)`, `throw helper(x)` at any position
  // in the default body — block fall-through cases (e.g., logging then
  // calling the helper) but require the helper to actually be called.
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
    // Sanity check: the registry actually identifies real consumers. If this
    // ever returns 0, the heuristic has drifted and the meta-test became
    // vacuous — fail loud rather than silently green.
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
});
