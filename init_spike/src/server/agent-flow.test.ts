/**
 * End-to-end test: Agent writes via DirectConnection → changes reflected in editor serialization.
 *
 * This validates the critical user flow:
 * 1. Agent writes a paragraph via DirectConnection (V3)
 * 2. The Y.Doc is updated with the new content
 * 3. Serializing the Y.Doc to markdown (WYSIWYG → source path) includes the agent's content
 * 4. Re-parsing that markdown back to Y.Doc (source → WYSIWYG path) preserves the agent's content
 *
 * This is a server-side test that exercises the same code paths as the browser editor,
 * without requiring a browser. The CRDT layer (Yjs) and serialization layer (@tiptap/markdown)
 * are the same in both environments.
 */
import { describe, expect, test } from 'bun:test';
import { Hocuspocus } from '@hocuspocus/server';
import { getSchema } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { updateYFragment, yXmlFragmentToProsemirrorJSON } from '@tiptap/y-tiptap';
import * as Y from 'yjs';
import { sharedExtensions } from '../editor/extensions/shared';
import { threeWayMerge } from '../editor/three-way-merge';

const mdManager = new MarkdownManager({ extensions: sharedExtensions });
const schema = getSchema(sharedExtensions);

type Conn = Awaited<ReturnType<Hocuspocus['openDirectConnection']>>;

/** Get the Y.Doc from a DirectConnection, throwing if unavailable */
function getDoc(conn: Conn) {
  const doc = conn.document;
  if (!doc) throw new Error('DirectConnection has no document');
  return doc;
}

/** Get the default XmlFragment from a DirectConnection */
function getFragment(conn: Conn) {
  return getDoc(conn).getXmlFragment('default');
}

describe('Agent write → Editor reflection', () => {
  test('agent write via DirectConnection appears in Y.Doc and serializes to markdown', async () => {
    const hocuspocus = new Hocuspocus({ quiet: true });

    // Simulate: agent opens a DirectConnection and writes a paragraph
    const conn = await hocuspocus.openDirectConnection('test-agent-flow');

    await conn.transact((doc) => {
      const fragment = doc.getXmlFragment('default');
      const paragraph = new Y.XmlElement('paragraph');
      const text = new Y.XmlText();
      text.applyDelta([{ insert: 'Hello from the agent!' }]);
      paragraph.insert(0, [text]);
      fragment.push([paragraph]);
    });

    // Now serialize Y.Doc → markdown (this is what getMarkdown() does in TiptapEditor)
    const fragment = getFragment(conn);
    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const markdown = mdManager.serialize(json);

    expect(markdown).toContain('Hello from the agent!');

    await conn.disconnect();
    // Hocuspocus cleanup handled by GC
  });

  test('agent write survives full source toggle round-trip (WYSIWYG → source → WYSIWYG)', async () => {
    const hocuspocus = new Hocuspocus({ quiet: true });

    // Step 1: Seed document with initial content
    const conn = await hocuspocus.openDirectConnection('test-toggle-flow');

    await conn.transact((doc) => {
      const fragment = doc.getXmlFragment('default');

      // Existing user content
      const p1 = new Y.XmlElement('paragraph');
      const t1 = new Y.XmlText();
      t1.applyDelta([{ insert: 'User wrote this paragraph' }]);
      p1.insert(0, [t1]);
      fragment.push([p1]);
    });

    // Step 2: Agent writes another paragraph (simulates agent writing while doc is open)
    await conn.transact((doc) => {
      const fragment = doc.getXmlFragment('default');

      const p2 = new Y.XmlElement('paragraph');
      const t2 = new Y.XmlText();
      t2.applyDelta([{ insert: 'Agent added this paragraph' }]);
      p2.insert(0, [t2]);
      fragment.push([p2]);
    });

    // Step 3: Toggle to source — serialize Y.Doc → markdown
    const fragment = getFragment(conn);
    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const sourceMarkdown = mdManager.serialize(json);

    // Both user and agent content should be in the markdown
    expect(sourceMarkdown).toContain('User wrote this paragraph');
    expect(sourceMarkdown).toContain('Agent added this paragraph');

    // Step 4: Simulate user editing in source mode — add a line
    const editedMarkdown = `${sourceMarkdown}\nUser edited this in source mode\n`;

    // Step 5: Toggle back to WYSIWYG — parse markdown → updateYFragment
    const parsedJson = mdManager.parse(editedMarkdown);
    const pmNode = schema.nodeFromJSON(parsedJson);

    getDoc(conn).transact(() => {
      updateYFragment(getDoc(conn), fragment, pmNode, {
        mapping: new Map(),
        isOMark: new Map(),
      });
    });

    // Step 6: Verify — serialize again to check all content survived
    const finalJson = yXmlFragmentToProsemirrorJSON(fragment);
    const finalMarkdown = mdManager.serialize(finalJson);

    expect(finalMarkdown).toContain('User wrote this paragraph');
    expect(finalMarkdown).toContain('Agent added this paragraph');
    expect(finalMarkdown).toContain('User edited this in source mode');

    await conn.disconnect();
    // Hocuspocus cleanup handled by GC
  });

  test('agent write during source mode: non-conflicting paragraphs merge on toggle-back (three-way merge)', async () => {
    const hocuspocus = new Hocuspocus({ quiet: true });
    const conn = await hocuspocus.openDirectConnection('test-divergence');

    // Step 1: Seed with two paragraphs
    await conn.transact((doc) => {
      const fragment = doc.getXmlFragment('default');

      const p1 = new Y.XmlElement('paragraph');
      const t1 = new Y.XmlText();
      t1.applyDelta([{ insert: 'Paragraph A — user will edit this in source' }]);
      p1.insert(0, [t1]);

      const p2 = new Y.XmlElement('paragraph');
      const t2 = new Y.XmlText();
      t2.applyDelta([{ insert: 'Paragraph B — unchanged' }]);
      p2.insert(0, [t2]);

      fragment.push([p1, p2]);
    });

    // Step 2: User toggles to source — gets a snapshot of the markdown
    const fragment = getFragment(conn);
    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const snapshotMarkdown = mdManager.serialize(json);

    // Step 3: While in source mode, user edits Paragraph A in the source text
    const userEdited = snapshotMarkdown.replace(
      'Paragraph A — user will edit this in source',
      'Paragraph A — USER EDITED IN SOURCE MODE',
    );

    // Step 4: Meanwhile, agent writes a NEW paragraph via DirectConnection (non-conflicting)
    await conn.transact((doc) => {
      const frag = doc.getXmlFragment('default');
      const p3 = new Y.XmlElement('paragraph');
      const t3 = new Y.XmlText();
      t3.applyDelta([{ insert: 'Paragraph C — agent wrote this during source mode' }]);
      p3.insert(0, [t3]);
      frag.push([p3]);
    });

    // Step 5: User toggles back — THREE-WAY MERGE instead of whole-doc updateYFragment
    const result = threeWayMerge(
      getDoc(conn),
      fragment,
      snapshotMarkdown,
      userEdited,
      mdManager,
      schema,
    );

    // Step 6: Check what survived
    const finalJson = yXmlFragmentToProsemirrorJSON(fragment);
    const finalMarkdown = mdManager.serialize(finalJson);

    console.log('\n=== DIVERGENCE TEST: NON-CONFLICTING (THREE-WAY MERGE) ===');
    console.log(`Selective merge: ${result.selective}`);
    console.log(`User changes applied: ${result.userChangedCount}`);
    console.log(`Agent paragraphs preserved: ${result.agentPreservedCount}`);
    console.log(`Final markdown:\n${finalMarkdown}`);

    // P0: User's edit MUST be present
    expect(finalMarkdown).toContain('USER EDITED IN SOURCE MODE');

    // P0: Paragraph B (unchanged by user) MUST survive
    expect(finalMarkdown).toContain('Paragraph B');

    // P0: Agent's paragraph C MUST survive (this is the R3 fix!)
    expect(finalMarkdown).toContain('Paragraph C — agent wrote this during source mode');

    // The merge should have been selective
    expect(result.selective).toBe(true);
    expect(result.agentPreservedCount).toBeGreaterThan(0);

    await conn.disconnect();
  });

  test('multiple agent writes while editor has existing content', async () => {
    const hocuspocus = new Hocuspocus({ quiet: true });
    const conn = await hocuspocus.openDirectConnection('test-multi-agent');

    // Seed with content
    await conn.transact((doc) => {
      const fragment = doc.getXmlFragment('default');
      const p = new Y.XmlElement('paragraph');
      const t = new Y.XmlText();
      t.applyDelta([{ insert: 'Existing content' }]);
      p.insert(0, [t]);
      fragment.push([p]);
    });

    // 5 rapid agent writes
    for (let i = 0; i < 5; i++) {
      await conn.transact((doc) => {
        const fragment = doc.getXmlFragment('default');
        const p = new Y.XmlElement('paragraph');
        const t = new Y.XmlText();
        t.applyDelta([{ insert: `Agent write #${i + 1}` }]);
        p.insert(0, [t]);
        fragment.push([p]);
      });
    }

    // Serialize and verify all writes are present
    const fragment = getFragment(conn);
    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const markdown = mdManager.serialize(json);

    expect(markdown).toContain('Existing content');
    for (let i = 0; i < 5; i++) {
      expect(markdown).toContain(`Agent write #${i + 1}`);
    }

    // Verify fragment has 6 children (1 existing + 5 agent writes)
    expect(fragment.length).toBe(6);

    await conn.disconnect();
    // Hocuspocus cleanup handled by GC
  });

  test('conflicting divergence: user and agent edit same paragraph — user wins, document valid', async () => {
    const hocuspocus = new Hocuspocus({ quiet: true });
    const conn = await hocuspocus.openDirectConnection('test-conflict');

    // Step 1: Seed with two paragraphs
    await conn.transact((doc) => {
      const fragment = doc.getXmlFragment('default');

      const p1 = new Y.XmlElement('paragraph');
      const t1 = new Y.XmlText();
      t1.applyDelta([{ insert: 'Paragraph A — both will edit this' }]);
      p1.insert(0, [t1]);

      const p2 = new Y.XmlElement('paragraph');
      const t2 = new Y.XmlText();
      t2.applyDelta([{ insert: 'Paragraph B — untouched by both' }]);
      p2.insert(0, [t2]);

      fragment.push([p1, p2]);
    });

    // Step 2: User toggles to source — snapshot
    const fragment = getFragment(conn);
    const json = yXmlFragmentToProsemirrorJSON(fragment);
    const snapshotMarkdown = mdManager.serialize(json);

    // Step 3: User edits paragraph A in source mode
    const userEdited = snapshotMarkdown.replace(
      'Paragraph A — both will edit this',
      'Paragraph A — USER VERSION',
    );

    // Step 4: Agent ALSO edits paragraph A via DirectConnection (conflict!)
    // Agent modifies the first paragraph's text in-place
    await conn.transact((doc) => {
      const frag = doc.getXmlFragment('default');
      const firstParagraph = frag.get(0) as Y.XmlElement;
      const textNode = firstParagraph.get(0) as Y.XmlText;
      textNode.delete(0, textNode.length);
      textNode.insert(0, 'Paragraph A — AGENT VERSION');
    });

    // Step 5: Agent also adds a new paragraph C (non-conflicting)
    await conn.transact((doc) => {
      const frag = doc.getXmlFragment('default');
      const p3 = new Y.XmlElement('paragraph');
      const t3 = new Y.XmlText();
      t3.applyDelta([{ insert: 'Paragraph C — agent added this' }]);
      p3.insert(0, [t3]);
      frag.push([p3]);
    });

    // Step 6: Toggle back with three-way merge
    const result = threeWayMerge(
      getDoc(conn),
      fragment,
      snapshotMarkdown,
      userEdited,
      mdManager,
      schema,
    );

    // Step 7: Verify
    const finalJson = yXmlFragmentToProsemirrorJSON(fragment);
    const finalMarkdown = mdManager.serialize(finalJson);

    console.log('\n=== DIVERGENCE TEST: CONFLICTING (THREE-WAY MERGE) ===');
    console.log(`Conflicts: ${result.conflicts.length}`);
    console.log(`Final markdown:\n${finalMarkdown}`);

    // User's version wins for conflicting paragraph A
    expect(finalMarkdown).toContain('Paragraph A — USER VERSION');
    expect(finalMarkdown).not.toContain('AGENT VERSION');

    // Paragraph B (untouched by both) survives
    expect(finalMarkdown).toContain('Paragraph B');

    // Agent's non-conflicting paragraph C survives
    expect(finalMarkdown).toContain('Paragraph C — agent added this');

    // Conflict was detected
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0].resolution).toBe('user-wins');

    // Document is structurally valid — can serialize and re-parse
    const reparsed = mdManager.parse(finalMarkdown);
    const reNode = schema.nodeFromJSON(reparsed);
    expect(reNode).toBeTruthy();
    expect(reNode.content.childCount).toBeGreaterThan(0);

    await conn.disconnect();
  });

  test('three-way merge falls back to whole-doc when user changes paragraph count', async () => {
    const hocuspocus = new Hocuspocus({ quiet: true });
    const conn = await hocuspocus.openDirectConnection('test-fallback');

    // Seed with two paragraphs
    await conn.transact((doc) => {
      const fragment = doc.getXmlFragment('default');

      const p1 = new Y.XmlElement('paragraph');
      const t1 = new Y.XmlText();
      t1.applyDelta([{ insert: 'Paragraph A' }]);
      p1.insert(0, [t1]);

      const p2 = new Y.XmlElement('paragraph');
      const t2 = new Y.XmlText();
      t2.applyDelta([{ insert: 'Paragraph B' }]);
      p2.insert(0, [t2]);

      fragment.push([p1, p2]);
    });

    // Snapshot has 2 paragraphs
    const fragment = getFragment(conn);
    const snapshotMarkdown = mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment));

    // Agent adds paragraph C while user is in source mode
    await conn.transact((doc) => {
      const frag = doc.getXmlFragment('default');
      const p3 = new Y.XmlElement('paragraph');
      const t3 = new Y.XmlText();
      t3.applyDelta([{ insert: 'Paragraph C — agent added' }]);
      p3.insert(0, [t3]);
      frag.push([p3]);
    });

    // User ALSO adds a paragraph in source mode (paragraph count changes: 2 → 3)
    const userEdited = `${snapshotMarkdown.trim()}\n\nParagraph D — user added in source\n`;

    // Toggle back — paragraph count mismatch triggers fallback
    const result = threeWayMerge(
      getDoc(conn),
      fragment,
      snapshotMarkdown,
      userEdited,
      mdManager,
      schema,
    );

    const finalMarkdown = mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment));

    // Fallback was used (not selective)
    expect(result.selective).toBe(false);
    expect(result.fallbackReason).toContain('paragraph count changed');

    // User's content is preserved (whole-doc applies user's version)
    expect(finalMarkdown).toContain('Paragraph A');
    expect(finalMarkdown).toContain('Paragraph B');
    expect(finalMarkdown).toContain('Paragraph D — user added in source');

    // Agent's paragraph C is lost in fallback (documented trade-off)
    // Document is structurally valid
    const reparsed = mdManager.parse(finalMarkdown);
    const reNode = schema.nodeFromJSON(reparsed);
    expect(reNode).toBeTruthy();
    expect(reNode.content.childCount).toBeGreaterThan(0);

    await conn.disconnect();
  });

  test('agent markdown write via unified path (parse→updateYFragment) appends paragraph', async () => {
    const hocuspocus = new Hocuspocus({ quiet: true });
    const conn = await hocuspocus.openDirectConnection('test-md-write');

    // Seed with initial content
    await conn.transact((doc) => {
      const fragment = doc.getXmlFragment('default');
      const p1 = new Y.XmlElement('paragraph');
      const t1 = new Y.XmlText();
      t1.applyDelta([{ insert: 'Existing paragraph one' }]);
      p1.insert(0, [t1]);
      fragment.push([p1]);
    });

    // Simulate the markdown write path: serialize → splice → parse → updateYFragment
    // This is what POST /api/agent-write-md does
    const fragment = getFragment(conn);
    const currentJson = yXmlFragmentToProsemirrorJSON(fragment);
    const currentMarkdown = mdManager.serialize(currentJson);

    const agentMarkdown = 'Agent wrote this via markdown path';
    const combined = `${currentMarkdown.trim()}\n\n${agentMarkdown}\n`;

    const parsedJson = mdManager.parse(combined);
    const pmNode = schema.nodeFromJSON(parsedJson);

    getDoc(conn).transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(getDoc(conn), fragment, pmNode, meta);
    });

    // Verify both paragraphs are present
    const finalJson = yXmlFragmentToProsemirrorJSON(fragment);
    const finalMarkdown = mdManager.serialize(finalJson);

    expect(finalMarkdown).toContain('Existing paragraph one');
    expect(finalMarkdown).toContain('Agent wrote this via markdown path');

    await conn.disconnect();
  });

  test('source mode injection: agent write updates serialized markdown while in source mode', async () => {
    const hocuspocus = new Hocuspocus({ quiet: true });
    const conn = await hocuspocus.openDirectConnection('test-source-inject');

    // Seed with initial content
    await conn.transact((doc) => {
      const fragment = doc.getXmlFragment('default');
      const p1 = new Y.XmlElement('paragraph');
      const t1 = new Y.XmlText();
      t1.applyDelta([{ insert: 'User content in source mode' }]);
      p1.insert(0, [t1]);
      fragment.push([p1]);
    });

    // Simulate entering source mode: take a snapshot
    const fragment = getFragment(conn);
    const snapshotJson = yXmlFragmentToProsemirrorJSON(fragment);
    const snapshotMarkdown = mdManager.serialize(snapshotJson);
    expect(snapshotMarkdown).toContain('User content in source mode');

    // Set up Y.Doc observer (simulates what App.tsx does in source mode)
    let latestMarkdown = snapshotMarkdown;
    const observer = () => {
      const json = yXmlFragmentToProsemirrorJSON(fragment);
      latestMarkdown = mdManager.serialize(json);
    };
    fragment.observeDeep(observer);

    // Agent writes via markdown path (same as POST /api/agent-write-md)
    const agentMd = 'Agent injected this during source mode';
    const combined = `${snapshotMarkdown.trim()}\n\n${agentMd}\n`;
    const parsedJson = mdManager.parse(combined);
    const pmNode = schema.nodeFromJSON(parsedJson);

    getDoc(conn).transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(getDoc(conn), fragment, pmNode, meta);
    });

    // The observer should have fired — latestMarkdown should include agent's write
    expect(latestMarkdown).toContain('User content in source mode');
    expect(latestMarkdown).toContain('Agent injected this during source mode');

    fragment.unobserveDeep(observer);
    await conn.disconnect();
  });

  test('A3 combined: source mode + agent markdown write + three-way merge preserves all changes', async () => {
    const hocuspocus = new Hocuspocus({ quiet: true });
    const conn = await hocuspocus.openDirectConnection('test-combined-a3');

    // Step 1: Seed with two paragraphs (user content in WYSIWYG)
    await conn.transact((doc) => {
      const fragment = doc.getXmlFragment('default');

      const p1 = new Y.XmlElement('paragraph');
      const t1 = new Y.XmlText();
      t1.applyDelta([{ insert: 'Paragraph A — user will edit this' }]);
      p1.insert(0, [t1]);

      const p2 = new Y.XmlElement('paragraph');
      const t2 = new Y.XmlText();
      t2.applyDelta([{ insert: 'Paragraph B — untouched' }]);
      p2.insert(0, [t2]);

      fragment.push([p1, p2]);
    });

    // Step 2: User enters source mode — snapshot taken
    const fragment = getFragment(conn);
    const snapshotJson = yXmlFragmentToProsemirrorJSON(fragment);
    const snapshotMarkdown = mdManager.serialize(snapshotJson);

    // Step 3: Set up Y.Doc observer (simulates A1 source mode injection)
    let latestMarkdown = snapshotMarkdown;
    const observer = () => {
      const json = yXmlFragmentToProsemirrorJSON(fragment);
      latestMarkdown = mdManager.serialize(json);
    };
    fragment.observeDeep(observer);

    // Step 4: Agent writes paragraph C via markdown path (A1)
    const agentMd = 'Paragraph C — agent wrote this via markdown path';
    const currentMd = mdManager.serialize(yXmlFragmentToProsemirrorJSON(fragment));
    const combined = `${currentMd.trim()}\n\n${agentMd}\n`;
    const parsedJson = mdManager.parse(combined);
    const pmNode = schema.nodeFromJSON(parsedJson);

    getDoc(conn).transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(getDoc(conn), fragment, pmNode, meta);
    });

    // Step 5: Verify agent text appears in source view (A1 injection)
    expect(latestMarkdown).toContain('Paragraph C — agent wrote this via markdown path');

    // Step 6: User edits paragraph A in source mode
    // The user's sourceContent is the snapshotMarkdown (what they started with) + their edits
    // Agent write is visible in source via injection but user has been editing from their view
    const userEdited = snapshotMarkdown.replace(
      'Paragraph A — user will edit this',
      'Paragraph A — USER EDITED',
    );

    // Step 7: Unsubscribe observer (simulates App.tsx behavior before toggle-back)
    fragment.unobserveDeep(observer);

    // Step 8: Toggle back with three-way merge (A2)
    const result = threeWayMerge(
      getDoc(conn),
      fragment,
      snapshotMarkdown,
      userEdited,
      mdManager,
      schema,
    );

    // Step 9: Verify everything survived
    const finalJson = yXmlFragmentToProsemirrorJSON(fragment);
    const finalMarkdown = mdManager.serialize(finalJson);

    console.log('\n=== COMBINED TEST (A1 + A2 + A3) ===');
    console.log(`Selective: ${result.selective}`);
    console.log(`Agent preserved: ${result.agentPreservedCount}`);
    console.log(`Conflicts: ${result.conflicts.length}`);
    console.log(`Final markdown:\n${finalMarkdown}`);

    // User's edit to paragraph A survives
    expect(finalMarkdown).toContain('Paragraph A — USER EDITED');

    // Paragraph B (unchanged) survives
    expect(finalMarkdown).toContain('Paragraph B — untouched');

    // Agent's paragraph C survives the three-way merge!
    expect(finalMarkdown).toContain('Paragraph C — agent wrote this via markdown path');

    // Selective merge, no conflicts, agent paragraph preserved
    expect(result.selective).toBe(true);
    expect(result.conflicts).toHaveLength(0);
    expect(result.agentPreservedCount).toBeGreaterThan(0);

    await conn.disconnect();
  });

  test('agent markdown write (prepend position) inserts before existing content', async () => {
    const hocuspocus = new Hocuspocus({ quiet: true });
    const conn = await hocuspocus.openDirectConnection('test-md-prepend');

    // Seed with initial content
    await conn.transact((doc) => {
      const fragment = doc.getXmlFragment('default');
      const p1 = new Y.XmlElement('paragraph');
      const t1 = new Y.XmlText();
      t1.applyDelta([{ insert: 'Original first paragraph' }]);
      p1.insert(0, [t1]);
      fragment.push([p1]);
    });

    // Prepend agent markdown
    const fragment = getFragment(conn);
    const currentJson = yXmlFragmentToProsemirrorJSON(fragment);
    const currentMarkdown = mdManager.serialize(currentJson);

    const agentMarkdown = 'Agent prepended this';
    const combined = `${agentMarkdown}\n\n${currentMarkdown.trim()}\n`;

    const parsedJson = mdManager.parse(combined);
    const pmNode = schema.nodeFromJSON(parsedJson);

    getDoc(conn).transact(() => {
      const meta = { mapping: new Map(), isOMark: new Map() };
      updateYFragment(getDoc(conn), fragment, pmNode, meta);
    });

    // Verify order: agent's paragraph first, then original
    const finalJson = yXmlFragmentToProsemirrorJSON(fragment);
    const finalMarkdown = mdManager.serialize(finalJson);

    expect(finalMarkdown).toContain('Agent prepended this');
    expect(finalMarkdown).toContain('Original first paragraph');

    // Verify order
    const agentIdx = finalMarkdown.indexOf('Agent prepended this');
    const originalIdx = finalMarkdown.indexOf('Original first paragraph');
    expect(agentIdx).toBeLessThan(originalIdx);

    await conn.disconnect();
  });
});
