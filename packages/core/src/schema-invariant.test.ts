/**
 * R10: Schema add-only invariant enforcement.
 *
 * This test captures every node type + attrs + default-presence + content
 * expression AND the sharedExtensions array ordering. It fails on:
 *   - Removed node type
 *   - Removed attr
 *   - Attr missing default
 *   - Content expression narrowed
 *   - sharedExtensions ordering changed
 *
 * Adding new nodes/attrs with defaults causes a snapshot mismatch — regenerate
 * via `bun run generate-schema-snapshot` (or manually update schema-snapshot.json)
 * and verify the diff is purely additive before committing.
 *
 * Rationale: y-prosemirror@1.3.7 destructively deletes Y.Items whose
 * schema.node() throws. The delete is multi-peer replicated and undo-resistant.
 * Any schema narrowing = silent data loss. See CLAUDE.md §9 + SPEC §9 R10.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { getSchema } from '@tiptap/core';
import { sharedExtensions } from './extensions/shared.ts';

// ── Schema shape capture ────────────────────────────────────────────

interface AttrShape {
  hasDefault: boolean;
}

interface NodeShape {
  attrs: Record<string, AttrShape>;
  content: string;
  group: string;
  inline: boolean;
  atom: boolean;
}

interface MarkShape {
  attrs: Record<string, AttrShape>;
  excludes: string;
  group: string;
  inclusive: boolean;
  spanning: boolean;
}

interface SchemaSnapshot {
  nodes: Record<string, NodeShape>;
  marks?: Record<string, MarkShape>;
  extensionOrder: string[];
}

function captureSchemaShape(): SchemaSnapshot {
  const schema = getSchema(sharedExtensions);
  const nodes: Record<string, NodeShape> = {};
  const marks: Record<string, MarkShape> = {};

  for (const [name, nodeType] of Object.entries(schema.nodes)) {
    const attrs: Record<string, AttrShape> = {};
    for (const [attrName, attrSpec] of Object.entries(nodeType.spec.attrs ?? {})) {
      attrs[attrName] = {
        hasDefault: 'default' in (attrSpec as Record<string, unknown>),
      };
    }
    nodes[name] = {
      attrs,
      content: nodeType.spec.content ?? '',
      group: nodeType.spec.group ?? '',
      inline: !!nodeType.spec.inline,
      atom: !!nodeType.spec.atom,
    };
  }

  for (const [name, markType] of Object.entries(schema.marks)) {
    const attrs: Record<string, AttrShape> = {};
    for (const [attrName, attrSpec] of Object.entries(markType.spec.attrs ?? {})) {
      attrs[attrName] = {
        hasDefault: 'default' in (attrSpec as Record<string, unknown>),
      };
    }
    marks[name] = {
      attrs,
      // `excludes` controls mark co-occurrence (CLAUDE.md STOP on Code
      // mark's deliberate widening). `undefined` means "exclude marks of
      // the same type," which PM canonicalizes to the mark's name; `''`
      // means "coexist with everything" (widened state).
      excludes: typeof markType.spec.excludes === 'string' ? markType.spec.excludes : name,
      group: markType.spec.group ?? '',
      inclusive: markType.spec.inclusive !== false,
      spanning: markType.spec.spanning !== false,
    };
  }

  const extensionOrder = sharedExtensions.map((ext) => {
    if ('name' in ext && typeof ext.name === 'string') return ext.name;
    if ('configure' in ext) return '(configured)';
    return String(ext);
  });

  return { nodes, marks, extensionOrder };
}

// ── Snapshot loading ────────────────────────────────────────────────

const SNAPSHOT_PATH = new URL('./schema-snapshot.json', import.meta.url).pathname;

function loadSnapshot(): SchemaSnapshot | null {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8')) as SchemaSnapshot;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('R10: schema add-only invariant', () => {
  const current = captureSchemaShape();
  const snapshot = loadSnapshot();

  test('schema-snapshot.json exists', () => {
    expect(snapshot).not.toBeNull();
  });

  if (!snapshot) return;

  test('no node types removed', () => {
    for (const nodeType of Object.keys(snapshot.nodes)) {
      expect(current.nodes[nodeType]).toBeDefined();
    }
  });

  test('no attrs removed from existing node types', () => {
    for (const [nodeType, expected] of Object.entries(snapshot.nodes)) {
      const actual = current.nodes[nodeType];
      if (!actual) continue; // covered by "no node types removed"
      for (const attrName of Object.keys(expected.attrs)) {
        expect(actual.attrs[attrName]).toBeDefined();
      }
    }
  });

  test('all attrs have default values', () => {
    for (const [, shape] of Object.entries(current.nodes)) {
      for (const [, attrShape] of Object.entries(shape.attrs)) {
        expect(attrShape.hasDefault).toBe(true);
      }
    }
  });

  test('content expressions not narrowed (superset check)', () => {
    for (const [nodeType, expected] of Object.entries(snapshot.nodes)) {
      const actual = current.nodes[nodeType];
      if (!actual) continue;
      // Content expression must be identical or wider (superset).
      // For now, strict equality — widening detection is non-trivial with
      // ProseMirror content expressions. If a legitimate widening is needed,
      // update the snapshot.
      if (expected.content !== '') {
        expect(actual.content).toBe(expected.content);
      }
    }
  });

  test('sharedExtensions ordering unchanged', () => {
    expect(current.extensionOrder).toEqual(snapshot.extensionOrder);
  });

  // ── Mark invariants (R10 applied to PM marks — same y-prosemirror
  //    destructive-delete risk as nodes; see CLAUDE.md WARN on Code
  //    mark's deliberately-widened excludes). `current.marks` is always
  //    captured; `snapshot.marks` may be absent for snapshots written
  //    before F14 added mark coverage — the branch gracefully skips
  //    mark-specific assertions in that case. Once the snapshot carries
  //    `marks`, a narrowed `excludes` or removed attr/mark fails loudly.
  const snapshotMarks = snapshot.marks;
  if (snapshotMarks) {
    test('no marks removed', () => {
      for (const markName of Object.keys(snapshotMarks)) {
        expect(current.marks?.[markName]).toBeDefined();
      }
    });

    test('no attrs removed from existing marks', () => {
      for (const [markName, expected] of Object.entries(snapshotMarks)) {
        const actual = current.marks?.[markName];
        if (!actual) continue;
        for (const attrName of Object.keys(expected.attrs)) {
          expect(actual.attrs[attrName]).toBeDefined();
        }
      }
    });

    test('all mark attrs have default values', () => {
      for (const [, shape] of Object.entries(current.marks ?? {})) {
        for (const [, attrShape] of Object.entries(shape.attrs)) {
          expect(attrShape.hasDefault).toBe(true);
        }
      }
    });

    test('mark excludes not narrowed (STOP rule on Code mark widening)', () => {
      // Narrowing `excludes` re-adds mark-exclusion constraints a
      // previous build had relaxed. Cannonical bug case: upstream
      // Tiptap bumping `Code.excludes` back to `_` — CLAUDE.md calls
      // this out explicitly. The check: current `excludes` must be
      // equal to OR wider than the snapshot's. "Wider" is hard to
      // generalize for PM mark-group expressions, so we treat `''`
      // (coexist with everything) as universally wider and otherwise
      // demand identity — conservative but matches the actual risk.
      for (const [markName, expected] of Object.entries(snapshotMarks)) {
        const actual = current.marks?.[markName];
        if (!actual) continue;
        if (actual.excludes === '') continue; // widest — always acceptable
        expect(actual.excludes).toBe(expected.excludes);
      }
    });
  }

  test('rawMdxFallback node can be constructed at runtime (R13 patch guard)', () => {
    // The y-prosemirror R13 patch substitutes rawMdxFallback on schema.node()
    // throw. If this construction itself fails, the patch silently drops the
    // node from the PM view. This test ensures the substitution path works.
    const schema = getSchema(sharedExtensions);
    const node = schema.node('rawMdxFallback', { reason: 'test' }, [schema.text('test')]);
    expect(node.type.name).toBe('rawMdxFallback');
    expect(node.textContent).toBe('test');
  });

  test('snapshot matches current schema (regenerate if additive-only changes)', () => {
    // This catches NEW additions that haven't been committed to the snapshot.
    // When adding a new node/attr, regenerate the snapshot and verify the
    // diff is purely additive.
    const currentJson = JSON.stringify(current, null, 2);
    const snapshotJson = JSON.stringify(snapshot, null, 2);
    if (currentJson !== snapshotJson) {
      // Provide a helpful diff message
      const newNodes = Object.keys(current.nodes).filter((n) => !(n in snapshot.nodes));
      const missingNodes = Object.keys(snapshot.nodes).filter((n) => !(n in current.nodes));
      if (missingNodes.length > 0) {
        throw new Error(
          `Schema NARROWED — removed node types: ${missingNodes.join(', ')}. This is forbidden by R10.`,
        );
      }
      if (newNodes.length > 0) {
        throw new Error(
          `Schema snapshot outdated — new node types: ${newNodes.join(', ')}. ` +
            'Regenerate schema-snapshot.json and verify the diff is additive-only.',
        );
      }
      throw new Error(
        'Schema snapshot mismatch. Regenerate schema-snapshot.json and verify the diff is additive-only. ' +
          'If removing or renaming attrs/types, STOP — this violates R10 (y-prosemirror data loss).',
      );
    }
  });
});
