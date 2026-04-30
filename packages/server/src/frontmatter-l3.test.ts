/**
 * Integration tests for the L3 frontmatter validation hook
 * (`validateAndRevertFrontmatterIfBad`).
 *
 * These exercise the hook directly with a bare Y.Doc — the disk-write path is
 * not invoked. The hook's contract is per-key validation + revert + callback;
 * downstream effects (CC1 broadcast, disk persistence) are tested in their
 * own modules.
 */

import { describe, expect, test } from 'bun:test';
import type { FrontmatterValidationError } from '@inkeep/open-knowledge-core';
import * as Y from 'yjs';
import { FRONTMATTER_VALIDATION_REVERT_ORIGIN } from './frontmatter-edit-origin.ts';
import {
  type FrontmatterL3Ctx,
  type FrontmatterLkgCache,
  validateAndRevertFrontmatterIfBad,
} from './frontmatter-l3.ts';

function makeCtx(): {
  ctx: FrontmatterL3Ctx;
  rejections: { docName: string; error: FrontmatterValidationError }[];
  lkg: FrontmatterLkgCache;
} {
  const lkg: FrontmatterLkgCache = new Map();
  const rejections: { docName: string; error: FrontmatterValidationError }[] = [];
  const ctx: FrontmatterL3Ctx = {
    lkgCache: lkg,
    onFrontmatterRejected: (docName, error) => rejections.push({ docName, error }),
  };
  return { ctx, rejections, lkg };
}

describe('validateAndRevertFrontmatterIfBad', () => {
  test('returns no-op when origin is the revert origin (loop guard)', () => {
    const doc = new Y.Doc();
    doc.getMap('metadata').set('title', 'Hello');
    const { ctx } = makeCtx();

    const outcome = validateAndRevertFrontmatterIfBad(
      doc,
      'docs/foo',
      FRONTMATTER_VALIDATION_REVERT_ORIGIN,
      ctx,
    );

    expect(outcome).toBe('no-op');
  });

  test('valid metaMap → outcome=valid, LKG cache populated', () => {
    const doc = new Y.Doc();
    doc.getMap('metadata').set('title', 'Hello');
    doc.getMap('metadata').set('count', 3);
    doc.getMap('metadata').set('tags', ['a', 'b']);
    const { ctx, rejections, lkg } = makeCtx();

    const outcome = validateAndRevertFrontmatterIfBad(doc, 'docs/foo', undefined, ctx);

    expect(outcome).toBe('valid');
    expect(rejections).toHaveLength(0);
    expect(lkg.get('docs/foo')).toEqual({ title: 'Hello', count: 3, tags: ['a', 'b'] });
  });

  test('unchanged metaMap (matches LKG) → outcome=no-op', () => {
    const doc = new Y.Doc();
    doc.getMap('metadata').set('title', 'Hello');
    const { ctx } = makeCtx();
    // First pass populates LKG.
    validateAndRevertFrontmatterIfBad(doc, 'docs/foo', undefined, ctx);

    // Second pass with no changes.
    const outcome = validateAndRevertFrontmatterIfBad(doc, 'docs/foo', undefined, ctx);

    expect(outcome).toBe('no-op');
  });

  test('invalid value shape (object) → reverted, key deleted, callback fires', () => {
    const doc = new Y.Doc();
    // Bypass the typed `setFrontmatterProperty` to land an invalid shape.
    doc.getMap('metadata').set('count', { nested: 'object' } as unknown as number);
    const { ctx, rejections } = makeCtx();

    const outcome = validateAndRevertFrontmatterIfBad(doc, 'docs/foo', undefined, ctx);

    expect(outcome).toBe('reverted');
    expect(doc.getMap('metadata').has('count')).toBe(false);
    expect(rejections).toHaveLength(1);
    expect(rejections[0]?.docName).toBe('docs/foo');
    expect(rejections[0]?.error.code).toBe('SCHEMA_INVALID');
    if (rejections[0]?.error.code === 'SCHEMA_INVALID') {
      expect(rejections[0].error.issues[0]?.path).toEqual(['count']);
    }
  });

  test('invalid key restored from LKG when prior good value exists', () => {
    const doc = new Y.Doc();
    doc.getMap('metadata').set('title', 'Good Title');
    const { ctx } = makeCtx();
    // First pass: populate LKG with the good value.
    validateAndRevertFrontmatterIfBad(doc, 'docs/foo', undefined, ctx);

    // Now corrupt the slot directly.
    doc.getMap('metadata').set('title', { bad: 'shape' } as unknown as string);

    const outcome = validateAndRevertFrontmatterIfBad(doc, 'docs/foo', undefined, ctx);

    expect(outcome).toBe('reverted');
    expect(doc.getMap('metadata').get('title')).toBe('Good Title');
  });

  test('mixed valid + invalid → only invalid keys are reverted', () => {
    const doc = new Y.Doc();
    doc.getMap('metadata').set('title', 'Hello');
    doc.getMap('metadata').set('count', { bad: 'shape' } as unknown as number);
    const { ctx, rejections } = makeCtx();

    const outcome = validateAndRevertFrontmatterIfBad(doc, 'docs/foo', undefined, ctx);

    expect(outcome).toBe('reverted');
    expect(doc.getMap('metadata').get('title')).toBe('Hello');
    expect(doc.getMap('metadata').has('count')).toBe(false);
    expect(rejections).toHaveLength(1);
    if (rejections[0]?.error.code === 'SCHEMA_INVALID') {
      expect(rejections[0].error.issues).toHaveLength(1);
      expect(rejections[0].error.issues[0]?.path).toEqual(['count']);
    }
  });

  test('legacy `frontmatter` slot is ignored by the hook', () => {
    const doc = new Y.Doc();
    doc.getMap('metadata').set('frontmatter', '---\ntitle: Hello\n---\n');
    const { ctx, lkg } = makeCtx();

    const outcome = validateAndRevertFrontmatterIfBad(doc, 'docs/foo', undefined, ctx);

    expect(outcome).toBe('valid');
    // LKG only tracks per-key entries, not the legacy slot.
    expect(lkg.get('docs/foo')).toEqual({});
  });

  test('revert transaction uses FRONTMATTER_VALIDATION_REVERT_ORIGIN', () => {
    const doc = new Y.Doc();
    doc.getMap('metadata').set('count', { bad: 'shape' } as unknown as number);
    const { ctx } = makeCtx();

    let observedOrigin: unknown = null;
    doc.getMap('metadata').observe((_event, transaction) => {
      observedOrigin = transaction.origin;
    });

    validateAndRevertFrontmatterIfBad(doc, 'docs/foo', undefined, ctx);

    expect(observedOrigin).toBe(FRONTMATTER_VALIDATION_REVERT_ORIGIN);
  });
});
