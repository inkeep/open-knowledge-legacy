/**
 * Unit tests for `TypedChildrenGuard` — the filterTransaction plugin that
 * prevents inserting non-jsxComponent content directly inside typed-children
 * containers (Steps, Cards, Tabs, etc.).
 *
 * Tests the pure depth predicate `shouldRejectTypedChildrenInsertion` so we
 * don't need a full editor instance. The three depth cases are:
 *
 *   (a) `$pos.depth === containerDepth`     → reject non-jsxComponent insertions
 *   (b) `$pos.depth === containerDepth + 1` → reject non-jsxComponent insertions
 *   (c) `$pos.depth  >  containerDepth + 1` → allow (inside a legit jsxComponent child)
 *
 * Plus: CRDT-origin transactions (ySyncPluginKey meta) are ALWAYS allowed —
 * tested via the filterTransaction wrapper, which short-circuits before the
 * predicate is called.
 */

// Uses the real registry (which knows Steps/Cards/Tabs have emptyChildName).
// Avoiding `mock.module` here because it leaks to other test files in the same
// `bun test` process — see `provider-pool.test.ts` S4 comment.

import { describe, expect, test } from 'bun:test';
import { Schema } from '@tiptap/pm/model';
import { EditorState, type Plugin, TextSelection } from '@tiptap/pm/state';
import { shouldRejectTypedChildrenInsertion, TypedChildrenGuard } from './typed-children-guard.ts';

// ─── Minimal schema that mirrors the jsxComponent container shape ─────────
// Mirrors `packages/core/src/extensions/jsx-component.ts`: block-level,
// `content: 'block*'`, carries a `componentName` attr.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    text: { group: 'inline' },
    jsxComponent: {
      group: 'block',
      content: 'block*',
      isolating: true,
      defining: true,
      attrs: {
        componentName: { default: '' },
      },
    },
  },
  marks: {},
});

/** Build a doc with a single top-level `<Steps><Step/></Steps>` structure. */
function stepsDoc() {
  const step = schema.node(
    'jsxComponent',
    { componentName: 'Step' },
    schema.node('paragraph', null, [schema.text('Step content')]),
  );
  const steps = schema.node('jsxComponent', { componentName: 'Steps' }, [step]);
  return schema.node('doc', null, [steps]);
}

/** Build a doc with a single `<Callout>` (container without `emptyChildName`). */
function calloutDoc() {
  const para = schema.node('paragraph', null, [schema.text('hello')]);
  const callout = schema.node('jsxComponent', { componentName: 'Callout' }, [para]);
  return schema.node('doc', null, [callout]);
}

/** Build a doc with Cards containing a Card (nested typed containers). */
function cardsNestedDoc() {
  const inner = schema.node('paragraph', null, [schema.text('inner')]);
  const card = schema.node('jsxComponent', { componentName: 'Card' }, [inner]);
  const cards = schema.node('jsxComponent', { componentName: 'Cards' }, [card]);
  return schema.node('doc', null, [cards]);
}

// ─── shouldRejectTypedChildrenInsertion — the pure depth predicate ────────

describe('shouldRejectTypedChildrenInsertion', () => {
  test('case (a) $pos.depth === containerDepth — reject paragraph directly inside Steps', () => {
    const state = EditorState.create({ doc: stepsDoc() });
    // Position just inside <Steps>, before the <Step>: doc(0)→Steps(1)
    //   doc    open = 0
    //   Steps  open = 1
    // Insert a paragraph at position 1 (inside Steps, before first child).
    const tr = state.tr.insert(1, schema.node('paragraph', null, [schema.text('illegal')]));
    expect(shouldRejectTypedChildrenInsertion(tr)).toBe(true);
  });

  test('case (b) $pos.depth === containerDepth + 1 — reject text inside non-jsxComponent child of Steps', () => {
    // Construct a corrupted doc: Steps contains a paragraph (not jsxComponent).
    // This shouldn't happen in practice but the guard protects against it
    // when it does.
    const para = schema.node('paragraph', null, [schema.text('stray')]);
    const steps = schema.node('jsxComponent', { componentName: 'Steps' }, [para]);
    const doc = schema.node('doc', null, [steps]);
    const state = EditorState.create({ doc });
    // Position inside the stray paragraph: doc(0)→Steps(1)→paragraph(2)
    // Insert a paragraph at position 3 (inside the paragraph, after 's').
    //   paragraph "stray" spans [2..8]; pos 3 resolves with depth=2.
    // This is containerDepth+1 = 1+1 = 2.
    const tr = state.tr.insert(3, schema.node('paragraph', null, [schema.text('more')]));
    expect(shouldRejectTypedChildrenInsertion(tr)).toBe(true);
  });

  test('case (c) $pos.depth > containerDepth + 1 — allow text inside jsxComponent child of Steps', () => {
    const state = EditorState.create({ doc: stepsDoc() });
    // Position inside the <Step>'s paragraph text: doc(0)→Steps(1)→Step(2)→paragraph(3)
    //   Step content paragraph "Step content" — text goes at pos 4 (inside paragraph).
    //   containerDepth (Steps) = 1; $pos.depth inside the paragraph = 3.
    //   3 > 1 + 1 → allowed.
    const tr = state.tr.insertText(' more', 15); // inside "Step content"
    expect(shouldRejectTypedChildrenInsertion(tr)).toBe(false);
  });

  test('non-typed container (no emptyChildName) — allow paragraph insertion inside Callout', () => {
    const state = EditorState.create({ doc: calloutDoc() });
    // Insert a paragraph directly inside Callout (position 1).
    const tr = state.tr.insert(1, schema.node('paragraph', null, [schema.text('allowed')]));
    expect(shouldRejectTypedChildrenInsertion(tr)).toBe(false);
  });

  test('jsxComponent insertion inside typed container — allowed', () => {
    const state = EditorState.create({ doc: stepsDoc() });
    // Insert another <Step> at position 1 (direct child of Steps — which is
    // exactly what the "Add Step" pill / slash command does).
    const newStep = schema.node(
      'jsxComponent',
      { componentName: 'Step' },
      schema.node('paragraph'),
    );
    const tr = state.tr.insert(1, newStep);
    expect(shouldRejectTypedChildrenInsertion(tr)).toBe(false);
  });

  test('nested typed containers — nearest ancestor rules (Card inside Cards)', () => {
    const state = EditorState.create({ doc: cardsNestedDoc() });
    // Structure: doc(0)→Cards(1)→Card(2)→paragraph(3)
    // Card has no `emptyChildName` (mocked above) so positions INSIDE Card
    // are allowed even though Cards demands jsxComponent children.
    // Insert inside the inner paragraph — $pos.depth=3, nearest ancestor is Card (depth=2).
    const tr = state.tr.insertText(' more', 5);
    expect(shouldRejectTypedChildrenInsertion(tr)).toBe(false);
  });

  test('no-op transactions (no doc change) — not rejected', () => {
    const state = EditorState.create({ doc: stepsDoc() });
    // An empty transaction has no insertion steps → predicate short-circuits
    // to `dominated=false`.
    const tr = state.tr;
    expect(shouldRejectTypedChildrenInsertion(tr)).toBe(false);
  });

  test('paragraph outside any typed container — allowed', () => {
    const para = schema.node('paragraph', null, [schema.text('plain')]);
    const doc = schema.node('doc', null, [para]);
    const state = EditorState.create({ doc });
    const tr = state.tr.insert(0, schema.node('paragraph', null, [schema.text('new')]));
    expect(shouldRejectTypedChildrenInsertion(tr)).toBe(false);
  });
});

// ─── TypedChildrenGuard (filterTransaction integration) ───────────────────
// Uses a tiny mock plugin that mimics `ySyncPluginKey` meta — we want to
// verify the plugin SHORT-CIRCUITS on CRDT-origin transactions, independent
// of what the predicate would say.

describe('TypedChildrenGuard filterTransaction', () => {
  test('CRDT-origin transactions (ySyncPluginKey meta) always pass through', async () => {
    // Top-level import so the same module instance (and same PluginKey
    // identity) is used by both this test and the guard extension.
    const { ySyncPluginKey } = await import('y-prosemirror');

    const guardPlugin = TypedChildrenGuard.config.addProseMirrorPlugins?.call({
      editor: { view: null },
    } as never) as Plugin[] | undefined;
    expect(guardPlugin).toBeDefined();
    expect(guardPlugin).toHaveLength(1);

    const state = EditorState.create({ doc: stepsDoc(), plugins: guardPlugin });
    // Construct a transaction that WOULD be rejected by the predicate
    // (paragraph directly inside Steps) but carries the ySyncPluginKey meta.
    const tr = state.tr.insert(1, schema.node('paragraph', null, [schema.text('remote edit')]));
    tr.setMeta(ySyncPluginKey, { isChangeOrigin: true });

    const filter = guardPlugin?.[0].spec.filterTransaction;
    expect(filter).toBeDefined();
    // With ySyncPluginKey meta set, filterTransaction returns true (allow) even
    // though the predicate alone would return `dominated=true`.
    expect(filter?.(tr, state)).toBe(true);
  });

  test('non-CRDT transactions that violate typed-children are rejected', () => {
    const guardPlugin = TypedChildrenGuard.config.addProseMirrorPlugins?.call({
      editor: { view: null },
    } as never) as Plugin[] | undefined;
    const state = EditorState.create({ doc: stepsDoc(), plugins: guardPlugin });
    const tr = state.tr.insert(1, schema.node('paragraph', null, [schema.text('user edit')]));
    const filter = guardPlugin?.[0].spec.filterTransaction;
    expect(filter?.(tr, state)).toBe(false);
  });

  test('transactions that do not change doc are passed through', () => {
    const guardPlugin = TypedChildrenGuard.config.addProseMirrorPlugins?.call({
      editor: { view: null },
    } as never) as Plugin[] | undefined;
    const state = EditorState.create({ doc: stepsDoc(), plugins: guardPlugin });
    // Selection-only transaction — docChanged=false. Put the selection in
    // an inline-content node (the Step's paragraph, at pos 4) to satisfy
    // TextSelection's invariants.
    const tr = state.tr.setSelection(TextSelection.create(state.doc, 4));
    const filter = guardPlugin?.[0].spec.filterTransaction;
    expect(filter?.(tr, state)).toBe(true);
  });
});
