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

interface SchemaSnapshot {
  nodes: Record<string, NodeShape>;
  extensionOrder: string[];
}

function captureSchemaShape(): SchemaSnapshot {
  const schema = getSchema(sharedExtensions);
  const nodes: Record<string, NodeShape> = {};

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

  const extensionOrder = sharedExtensions.map((ext) => {
    if ('name' in ext && typeof ext.name === 'string') return ext.name;
    if ('configure' in ext) return '(configured)';
    return String(ext);
  });

  return { nodes, extensionOrder };
}

// ── Snapshot loading ────────────────────────────────────────────────

const SNAPSHOT_PATH = new URL('./schema-snapshot.json', import.meta.url).pathname;

function loadSnapshot(): SchemaSnapshot | null {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8')) as SchemaSnapshot;
}

// ── Allowed narrowings ──────────────────────────────────────────────

/**
 * Explicit narrowings that have been authorized against precedent #9 with
 * linked spec evidence. Every entry names (a) the exact node-attribute
 * combination being narrowed and (b) the spec citation explaining why the
 * R13 schema-throw safety net is sufficient coverage. Adding a new entry
 * REQUIRES the companion spec section AND a live-fire regression test in
 * `packages/app/tests/integration/` (e.g. SH01/SH05 shape).
 *
 * This is the NOT a loophole — it's a registry that surfaces every
 * authorized narrowing in one place so future audits can enumerate them
 * without re-reading specs.
 */
interface AllowedNarrowing {
  nodeType: string;
  kind: 'content' | 'attr-removed';
  /** Attr name for `attr-removed`; undefined otherwise. */
  attrName?: string;
  specRef: string;
  regressionTestRef: string;
}

const ALLOWED_NARROWINGS: AllowedNarrowing[] = [
  // jsxInline greenfield narrowing: atom-widening (allowed via content
  // expression exception at line 126) plus attr removals listed explicitly.
  {
    nodeType: 'jsxInline',
    kind: 'content',
    specRef: 'specs/2026-04-14-component-blocks-v2/SPEC.md §FR-4 / NG14',
    regressionTestRef:
      'packages/app/tests/integration/jsx-schema-narrowing-safety.test.ts (SH05: pre-narrowing jsxInline materialization) + packages/app/tests/integration/y-tiptap-schema-throw-substitution.test.ts (R13 substitution on schema throw)',
  },
  {
    nodeType: 'jsxInline',
    kind: 'attr-removed',
    attrName: 'attributes',
    specRef: 'specs/2026-04-14-component-blocks-v2/SPEC.md §FR-4 / NG14',
    regressionTestRef:
      'packages/app/tests/integration/jsx-schema-narrowing-safety.test.ts (SH05: pre-narrowing jsxInline materialization) + packages/app/tests/integration/y-tiptap-schema-throw-substitution.test.ts (R13 substitution on schema throw)',
  },
  {
    nodeType: 'jsxInline',
    kind: 'attr-removed',
    attrName: 'sourceRaw',
    specRef: 'specs/2026-04-14-component-blocks-v2/SPEC.md §FR-4 / NG14',
    regressionTestRef:
      'packages/app/tests/integration/jsx-schema-narrowing-safety.test.ts (SH05: pre-narrowing jsxInline materialization) + packages/app/tests/integration/y-tiptap-schema-throw-substitution.test.ts (R13 substitution on schema throw)',
  },
  // M4 (CB-v2 MD-Foundation pre-QA review): drop the legacy `content` attr
  // on `jsxComponent`. It was dead storage — duplicated on every node but
  // never read (the PM `content: 'block*'` content expression handles
  // actual child content; the attr was a relic of an earlier iteration).
  // The dead `(pmNode.attrs.content ? null : null)` ternary in
  // `packages/core/src/markdown/index.ts` was removed alongside. Because
  // the attr was unused, there is no Y.Item data to migrate — the narrow
  // is safe under precedent #9's "attrs are add-only" rule modulo this
  // registration. The regression suite below + the R13 y-prosemirror
  // substitution test jointly prove that removing this attr cannot cause
  // Y.Item data loss on downstream peers.
  {
    nodeType: 'jsxComponent',
    kind: 'attr-removed',
    attrName: 'content',
    specRef:
      'specs/2026-04-23-cb-v2-md-foundation/SPEC.md + pre-QA review M4 (packages/core/src/extensions/jsx-component.ts attrs L44 cleanup)',
    regressionTestRef:
      'packages/core/src/extensions/jsx-component.test.ts + packages/app/tests/integration/y-tiptap-schema-throw-substitution.test.ts',
  },
];

function isAllowedNarrowing(
  nodeType: string,
  kind: AllowedNarrowing['kind'],
  attrName?: string,
): boolean {
  return ALLOWED_NARROWINGS.some(
    (a) => a.nodeType === nodeType && a.kind === kind && a.attrName === attrName,
  );
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

  test('no attrs removed from existing node types (outside allowed narrowings)', () => {
    for (const [nodeType, expected] of Object.entries(snapshot.nodes)) {
      const actual = current.nodes[nodeType];
      if (!actual) continue; // covered by "no node types removed"
      for (const attrName of Object.keys(expected.attrs)) {
        if (actual.attrs[attrName] !== undefined) continue;
        if (isAllowedNarrowing(nodeType, 'attr-removed', attrName)) continue;
        // Unauthorized removal — fail explicitly.
        throw new Error(
          `Schema NARROWED — attr '${attrName}' removed from node type '${nodeType}'. ` +
            'This violates precedent #9 unless registered in ALLOWED_NARROWINGS with spec evidence.',
        );
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
      // Content expression must be identical (strict-equality check).
      // Widening is legitimate (e.g. block+ → block* broadens) but
      // ProseMirror content expressions lack a structural-subset operator
      // in userspace — detecting "actual is a superset of expected"
      // requires parsing the expression grammar. So the ratchet treats
      // ANY change as suspect: when the expression changes, the delta
      // must be explicitly registered in ALLOWED_NARROWINGS (with
      // `kind: 'content'`) AND the schema-snapshot.json must be
      // regenerated.
      //
      // Mi2 review fix: this is a registry with social enforcement, not a
      // mechanical close on the same-commit escape hatch. A developer who
      // narrows the schema AND regenerates the snapshot in one commit
      // produces `expected === actual` here and the test silently passes.
      // Both the snapshot diff and the ALLOWED_NARROWINGS update are
      // required to land for the change to be auditable; PR review reads
      // the registry diff as the load-bearing gate. A truly mechanical
      // close requires a separate baseline file + a regen script that
      // refuses to run unless the registry has a matching entry; that
      // hardening is tracked but not in scope for the foundation.
      if (expected.content === actual.content) continue; // unchanged — OK
      if (expected.content !== '' && isAllowedNarrowing(nodeType, 'content')) {
        // Explicit registration consulted — delta is authorized.
        continue;
      }
      // Unauthorized content-expression change (narrowing OR widening
      // without registration). Fail loudly — if this is a legit widening,
      // register it in ALLOWED_NARROWINGS with `kind: 'content'`, spec
      // ref, and regression-test ref (same pattern as attr-removed).
      throw new Error(
        `Schema content expression changed on node type '${nodeType}': ` +
          `'${expected.content}' → '${actual.content}'. ` +
          'This requires an ALLOWED_NARROWINGS entry with kind:"content" + ' +
          'spec evidence. Precedent #9 (schema add-only) / R13 y-prosemirror ' +
          'schema-throw safety net relies on this ratchet to prevent silent ' +
          'Y.Item data loss on downstream peers.',
      );
    }
  });

  test('sharedExtensions ordering unchanged', () => {
    expect(current.extensionOrder).toEqual(snapshot.extensionOrder);
  });

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
