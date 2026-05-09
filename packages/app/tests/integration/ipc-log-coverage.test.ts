import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { Glob } from 'bun';
import * as ts from 'typescript';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const MAIN_ROOT = join(REPO_ROOT, 'packages/desktop/src/main');

export const IPC_LOG_ADJACENCY_MAX_STATEMENTS = 5;

function isExcludedPath(absPath: string): boolean {
  if (absPath.endsWith('.d.ts')) return true;
  if (/\.test\.tsx?$/.test(absPath)) return true;
  if (absPath.includes('/node_modules/')) return true;
  if (absPath.includes('/dist/')) return true;
  if (absPath.endsWith('/ipc-log.ts')) return true;
  return false;
}

function* enumerateMainSourceFiles(): Generator<string> {
  const glob = new Glob('**/*.ts');
  for (const rel of glob.scanSync({ cwd: MAIN_ROOT })) {
    const abs = join(MAIN_ROOT, rel);
    if (isExcludedPath(abs)) continue;
    yield abs;
  }
}

interface FailReturn {
  readonly file: string;
  readonly line: number;
  readonly reasonExpr: string;
}

function unwrapValueExpression(expr: ts.Expression): ts.Expression {
  let cur: ts.Expression = expr;
  while (
    ts.isAsExpression(cur) ||
    ts.isTypeAssertionExpression(cur) ||
    ts.isSatisfiesExpression(cur) ||
    ts.isParenthesizedExpression(cur)
  ) {
    cur = cur.expression;
  }
  return cur;
}

function isOkFalseObjectLiteral(expr: ts.Expression): boolean {
  const unwrapped = unwrapValueExpression(expr);
  if (!ts.isObjectLiteralExpression(unwrapped)) return false;
  for (const prop of unwrapped.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === 'ok' &&
      prop.initializer.kind === ts.SyntaxKind.FalseKeyword
    ) {
      return true;
    }
  }
  return false;
}

function extractReasonExpr(expr: ts.Expression, source: ts.SourceFile): string {
  const unwrapped = unwrapValueExpression(expr);
  if (!ts.isObjectLiteralExpression(unwrapped)) return '<unknown>';
  for (const prop of unwrapped.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      (prop.name.text === 'reason' || prop.name.text === 'error')
    ) {
      return prop.initializer.getText(source);
    }
  }
  return '<no-reason>';
}

function findPrecedingLogCall(
  returnStmt: ts.ReturnStatement,
  block: ts.Block | ts.SourceFile,
): boolean {
  const statements = block.statements;
  const returnIndex = statements.indexOf(returnStmt as unknown as ts.Statement);
  if (returnIndex < 0) return false;
  const start = Math.max(0, returnIndex - IPC_LOG_ADJACENCY_MAX_STATEMENTS);
  for (let i = returnIndex - 1; i >= start; i--) {
    const stmt = statements[i];
    if (statementContainsLogIpcError(stmt)) return true;
  }
  return false;
}

function statementContainsLogIpcError(stmt: ts.Node): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (found) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'logIpcError'
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(stmt);
  return found;
}

function findEnclosingBlock(node: ts.Node): ts.Block | ts.SourceFile | null {
  let cur: ts.Node | undefined = node.parent;
  while (cur !== undefined) {
    if (ts.isBlock(cur) || ts.isSourceFile(cur)) return cur;
    cur = cur.parent;
  }
  return null;
}

function isChannelRegistrationCall(node: ts.CallExpression): boolean {
  if (!ts.isIdentifier(node.expression)) return false;
  if (node.expression.text !== 'handle' && node.expression.text !== 'register') return false;
  if (node.arguments.length < 2) return false;
  const firstArg = node.arguments[0];
  if (!ts.isStringLiteral(firstArg) && !ts.isNoSubstitutionTemplateLiteral(firstArg)) return false;
  return firstArg.text.startsWith('ok:');
}

function collectHandlerBodies(source: ts.SourceFile): ts.Node[] {
  const bodies: ts.Node[] = [];
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && isChannelRegistrationCall(node)) {
      const handler = node.arguments[1];
      if (
        ts.isArrowFunction(handler) ||
        ts.isFunctionExpression(handler) ||
        ts.isFunctionDeclaration(handler)
      ) {
        if (handler.body !== undefined) bodies.push(handler.body);
      } else if (ts.isIdentifier(handler)) {
        const declBody = findHandlerDeclarationBody(source, handler.text);
        if (declBody !== null) bodies.push(declBody);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return bodies;
}

function findHandlerDeclarationBody(source: ts.SourceFile, name: string): ts.Node | null {
  let body: ts.Node | null = null;
  function visit(node: ts.Node): void {
    if (body !== null) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      const init = node.initializer;
      if (
        init !== undefined &&
        (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) &&
        init.body !== undefined
      ) {
        body = init.body;
        return;
      }
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name !== undefined &&
      node.name.text === name &&
      node.body !== undefined
    ) {
      body = node.body;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return body;
}

function collectUnpairedFailReturns(absPath: string, content: string): FailReturn[] {
  const source = ts.createSourceFile(absPath, content, ts.ScriptTarget.Latest, true);
  const out: FailReturn[] = [];
  const handlerBodies = collectHandlerBodies(source);
  if (handlerBodies.length === 0) return out;

  function visit(node: ts.Node): void {
    if (
      ts.isReturnStatement(node) &&
      node.expression !== undefined &&
      isOkFalseObjectLiteral(node.expression)
    ) {
      const block = findEnclosingBlock(node);
      const hasLog = block !== null && findPrecedingLogCall(node, block);
      if (!hasLog) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        out.push({
          file: relative(REPO_ROOT, absPath),
          line: line + 1,
          reasonExpr: extractReasonExpr(node.expression, source),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  for (const body of handlerBodies) visit(body);
  return out;
}

const CHANNEL_REGISTRATION_RE = /\b(?:handle|register)\(\s*['"]ok:[^'"]+['"]/;

function isChannelRegistrationFile(content: string): boolean {
  return CHANNEL_REGISTRATION_RE.test(content);
}

const MIN_CHANNEL_REGISTRATION_FILES = 3;

describe('IPC log coverage', () => {
  test('scan covers ≥ MIN_CHANNEL_REGISTRATION_FILES channel-registration files (anti-vacuousness)', () => {
    let count = 0;
    for (const file of enumerateMainSourceFiles()) {
      const content = readFileSync(file, 'utf8');
      if (isChannelRegistrationFile(content)) count++;
    }
    expect(count).toBeGreaterThanOrEqual(MIN_CHANNEL_REGISTRATION_FILES);
  });

  test('every `return { ok: false, ... }` in main-process channel-registration files is paired with a logIpcError call', () => {
    const violations: FailReturn[] = [];
    for (const file of enumerateMainSourceFiles()) {
      const content = readFileSync(file, 'utf8');
      if (!/ok:\s*false/.test(content)) continue;
      if (!isChannelRegistrationFile(content)) continue;
      violations.push(...collectUnpairedFailReturns(file, content));
    }
    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${v.file}:${v.line} — return { ok: false, reason: ${v.reasonExpr} }`)
        .join('\n');
      throw new Error(
        `IPC failure return is not paired with logIpcError(...).\n` +
          `Every \`return { ok: false, ... }\` in packages/desktop/src/main/**/*.ts must be preceded by\n` +
          `a \`logIpcError({ event: 'ipc.error', channel, reason, handler, cause? })\` call within\n` +
          `IPC_LOG_ADJACENCY_MAX_STATEMENTS (= ${IPC_LOG_ADJACENCY_MAX_STATEMENTS}) statements above,\n` +
          `in the same surrounding block. This pins the IPC observability asymmetry that PR #366\n` +
          `closed for HTTP errors.\n` +
          `Violations:\n${report}`,
      );
    }
    expect(violations).toEqual([]);
  });
});
