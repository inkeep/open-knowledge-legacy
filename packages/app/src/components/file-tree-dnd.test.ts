import { describe, expect, test } from 'bun:test';
import {
  computeMoveDestinationPath,
  joinContentPath,
  lastSegment,
  parentDirOfDocName,
  validateMoveToFolder,
} from './file-tree-dnd';

describe('file-tree-dnd', () => {
  test('parentDirOfDocName', () => {
    expect(parentDirOfDocName('a')).toBe('');
    expect(parentDirOfDocName('a/b')).toBe('a');
    expect(parentDirOfDocName('a/b/c')).toBe('a/b');
    // Edge cases
    expect(parentDirOfDocName('')).toBe('');
    expect(parentDirOfDocName('/a')).toBe('');
  });

  test('lastSegment', () => {
    expect(lastSegment('notes')).toBe('notes');
    expect(lastSegment('proj/page')).toBe('page');
    // Edge cases
    expect(lastSegment('')).toBe('');
    expect(lastSegment('a/')).toBe('');
  });

  test('joinContentPath', () => {
    expect(joinContentPath('', 'x')).toBe('x');
    expect(joinContentPath('a', 'b')).toBe('a/b');
  });

  test('computeMoveDestinationPath', () => {
    expect(computeMoveDestinationPath({ kind: 'file', path: 'old/page' }, 'new')).toBe('new/page');
    expect(computeMoveDestinationPath({ kind: 'file', path: 'page' }, '')).toBe('page');
    expect(computeMoveDestinationPath({ kind: 'folder', path: 'a/nested' }, 'b')).toBe('b/nested');
  });

  test('validateMoveToFolder rejects folder into itself', () => {
    expect(validateMoveToFolder({ kind: 'folder', path: 'docs' }, 'docs')).toEqual({
      ok: false,
      reason: 'self',
    });
  });

  test('validateMoveToFolder rejects folder into its descendant', () => {
    expect(validateMoveToFolder({ kind: 'folder', path: 'docs' }, 'docs/sub')).toEqual({
      ok: false,
      reason: 'descendant',
    });
    expect(validateMoveToFolder({ kind: 'folder', path: 'a/b' }, 'a/b/c/d')).toEqual({
      ok: false,
      reason: 'descendant',
    });
  });

  test('validateMoveToFolder allows sibling moves', () => {
    const r = validateMoveToFolder({ kind: 'folder', path: 'x/y' }, 'z');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.destinationPath).toBe('z/y');
  });

  test('validateMoveToFolder allows file sibling moves', () => {
    const r = validateMoveToFolder({ kind: 'file', path: 'a/readme' }, 'b');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.destinationPath).toBe('b/readme');
  });

  test('validateMoveToFolder no_op when already in target folder', () => {
    expect(validateMoveToFolder({ kind: 'file', path: 'notes/a' }, 'notes')).toEqual({
      ok: false,
      reason: 'no_op',
    });
  });

  test('validateMoveToFolder no_op when root file dropped on root', () => {
    expect(validateMoveToFolder({ kind: 'file', path: 'readme' }, '')).toEqual({
      ok: false,
      reason: 'no_op',
    });
  });

  test('validateMoveToFolder allows moving folder to root', () => {
    const r = validateMoveToFolder({ kind: 'folder', path: 'nested/deep' }, '');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.destinationPath).toBe('deep');
  });

  test('validateMoveToFolder no_op when root folder dropped on root', () => {
    expect(validateMoveToFolder({ kind: 'folder', path: 'docs' }, '')).toEqual({
      ok: false,
      reason: 'no_op',
    });
  });
});
