import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Glob } from 'bun';
import ts from 'typescript';

const SANCTIONED_PRIMITIVES = new Set<string>([
  'composeAndWriteRawBody',
  'replaceRawBody',
  'deriveFragmentFromYtext',
]);

const TRANSITIVE_PRIMITIVE_CALLERS = new Set<string>([
  'applyDiskContentToDoc',
  'applyDiskContent',
  'applyAgentMarkdownWrite',
]);

const SANCTIONED_NON_PRIMITIVE_ORIGINS = new Set<string>([
  'OBSERVER_SYNC_ORIGIN',
  'CONFIG_VALIDATION_REVERT_ORIGIN',
  'CONFIG_FILE_WATCHER_ORIGIN',
  'PARK_SNAPSHOT_ORIGIN',
  'EFFECT_CAPTURE_ORIGIN',
]);

const KNOWN_PAIRED_WRITE_ORIGINS = new Set<string>([
  'MANAGED_RENAME_ORIGIN',
  'ROLLBACK_ORIGIN',
  'FILE_WATCHER_ORIGIN',
  'AGENT_WRITE_ORIGIN',
  'undoOrigin',
]);

const KNOWN_PAIRED_WRITE_ORIGIN_PROPS = new Set<string>(['session.origin', 'session.undoOrigin']);

interface TransactCall {
  readonly file: string;
  readonly line: number;
  readonly originExpr: string;
  readonly fnBody: ts.Node | undefined;
}

const SERVER_SRC_DIR = join(import.meta.dir);

function loadServerSourceFiles(): ReadonlyArray<readonly [string, ts.SourceFile]> {
  const out: Array<readonly [string, ts.SourceFile]> = [];
  const glob = new Glob('**/*.ts');
  for (const rel of glob.scanSync({ cwd: SERVER_SRC_DIR, absolute: false, onlyFiles: true })) {
    if (rel.endsWith('.test.ts') || rel.endsWith('.d.ts')) continue;
    const abs = join(SERVER_SRC_DIR, rel);
    const text = readFileSync(abs, 'utf-8');
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.ES2022, /* setParentNodes */ true);
    out.push([abs, sf] as const);
  }
  return out;
}

/** Render a property-access chain (`session.dc.document.transact`) to its
 * trailing two segments — enough to identify `<x>.transact` and to extract
 * the receiver-side trailing accessor for origin matching. */
function renderAccessChain(node: ts.Node): string {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) {
    return `${renderAccessChain(node.expression)}.${node.name.text}`;
  }
  if (ts.isCallExpression(node)) return renderAccessChain(node.expression);
  return node.getText(node.getSourceFile());
}

function isTransactPropertyAccess(node: ts.Expression): boolean {
  return ts.isPropertyAccessExpression(node) && node.name.text === 'transact';
}

function findTransactCalls(file: string, sf: ts.SourceFile): TransactCall[] {
  const calls: TransactCall[] = [];
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      isTransactPropertyAccess(node.expression) &&
      node.arguments.length >= 2
    ) {
      const fnArg = node.arguments[0];
      const originArg = node.arguments[1];
      const lineStart = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const fnBody =
        fnArg && (ts.isArrowFunction(fnArg) || ts.isFunctionExpression(fnArg))
          ? fnArg.body
          : undefined;
      calls.push({
        file,
        line: lineStart,
        originExpr: originArg ? renderAccessChain(originArg) : '<missing>',
        fnBody,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return calls;
}

function bodyCallsSanctionedPrimitive(body: ts.Node | undefined): {
  matched: boolean;
  matchedName: string | null;
} {
  if (body === undefined) return { matched: false, matchedName: null };
  let matched = false;
  let matchedName: string | null = null;
  function visit(node: ts.Node): void {
    if (matched) return;
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const calleeName = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : null;
      if (calleeName !== null) {
        if (SANCTIONED_PRIMITIVES.has(calleeName) || TRANSITIVE_PRIMITIVE_CALLERS.has(calleeName)) {
          matched = true;
          matchedName = calleeName;
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(body);
  return { matched, matchedName };
}

describe('paired-write enforcement (FR-6)', () => {
  const sources = loadServerSourceFiles();

  test('every transact() call site has a recognized origin', () => {
    const failures: string[] = [];
    for (const [file, sf] of sources) {
      for (const call of findTransactCalls(file, sf)) {
        const segs = call.originExpr.split('.');
        const head = segs[segs.length - 1] ?? call.originExpr;
        const trail = segs.length >= 2 ? `${segs[segs.length - 2]}.${head}` : head;
        const recognized =
          KNOWN_PAIRED_WRITE_ORIGINS.has(head) ||
          SANCTIONED_NON_PRIMITIVE_ORIGINS.has(head) ||
          KNOWN_PAIRED_WRITE_ORIGIN_PROPS.has(trail);
        if (!recognized) {
          failures.push(
            `${relative(SERVER_SRC_DIR, file)}:${call.line} — unrecognized origin "${call.originExpr}". ` +
              `Add it to KNOWN_PAIRED_WRITE_ORIGINS, SANCTIONED_NON_PRIMITIVE_ORIGINS, or ` +
              `KNOWN_PAIRED_WRITE_ORIGIN_PROPS in paired-write-enforcement.test.ts ` +
              `with a comment justifying its category.`,
          );
        }
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `Found ${failures.length} unrecognized transact origin(s):\n  ${failures.join('\n  ')}`,
      );
    }
  });

  test('paired-write origins route through a sanctioned primitive', () => {
    const failures: string[] = [];
    for (const [file, sf] of sources) {
      for (const call of findTransactCalls(file, sf)) {
        const head = call.originExpr.split('.').pop() ?? call.originExpr;
        const trail = (() => {
          const segs = call.originExpr.split('.');
          return segs.length >= 2 ? `${segs[segs.length - 2]}.${segs[segs.length - 1]}` : head;
        })();

        const isPaired =
          KNOWN_PAIRED_WRITE_ORIGINS.has(head) || KNOWN_PAIRED_WRITE_ORIGIN_PROPS.has(trail);
        if (!isPaired) continue;

        const { matched, matchedName } = bodyCallsSanctionedPrimitive(call.fnBody);
        if (!matched) {
          failures.push(
            `${relative(SERVER_SRC_DIR, file)}:${call.line} — paired-write origin "${call.originExpr}" ` +
              `does not route through any sanctioned primitive ` +
              `(${[...SANCTIONED_PRIMITIVES, ...TRANSITIVE_PRIMITIVE_CALLERS].join(', ')}). ` +
              `Refactor to call composeAndWriteRawBody / replaceRawBody / deriveFragmentFromYtext.`,
          );
        } else {
          const known =
            SANCTIONED_PRIMITIVES.has(matchedName ?? '') ||
            TRANSITIVE_PRIMITIVE_CALLERS.has(matchedName ?? '');
          if (!known) {
            failures.push(
              `${relative(SERVER_SRC_DIR, file)}:${call.line} — internal classifier bug: ` +
                `matched callee "${matchedName}" not in primitive set.`,
            );
          }
        }
      }
    }
    if (failures.length > 0) {
      throw new Error(
        `Found ${failures.length} paired-write transact site(s) bypassing sanctioned primitives:\n  ` +
          failures.join('\n  '),
      );
    }
  });

  test('all three sanctioned primitives are exported from bridge-intake.ts', () => {
    const intakePath = join(SERVER_SRC_DIR, 'bridge-intake.ts');
    const text = readFileSync(intakePath, 'utf-8');
    const sf = ts.createSourceFile(
      'bridge-intake.ts',
      text,
      ts.ScriptTarget.ES2022,
      /* setParentNodes */ true,
    );
    const exportedNames = new Set<string>();
    function visit(node: ts.Node): void {
      if (
        ts.isFunctionDeclaration(node) &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
        node.name
      ) {
        exportedNames.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(sf);
    for (const primitive of SANCTIONED_PRIMITIVES) {
      expect(exportedNames.has(primitive)).toBe(true);
    }
  });

  test('allowlists do not overlap (catches accidental double-classification)', () => {
    for (const name of KNOWN_PAIRED_WRITE_ORIGINS) {
      expect(SANCTIONED_NON_PRIMITIVE_ORIGINS.has(name)).toBe(false);
    }
    for (const prop of KNOWN_PAIRED_WRITE_ORIGIN_PROPS) {
      const trailingHead = prop.split('.').pop() ?? prop;
      expect(SANCTIONED_NON_PRIMITIVE_ORIGINS.has(trailingHead)).toBe(false);
    }
  });
});
