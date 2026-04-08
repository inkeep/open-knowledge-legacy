# SPEC: Agent Markdown Write Path + Three-Way Merge Source Toggle

**Status:** Final
**Created:** 2026-04-07
**Baseline commit:** `feat/init-spike` branch (init_spike spike complete)
**Implementer:** AI coding agent (Claude Code)
**Location:** `init_spike/` (extends existing spike code)
**Nature:** Derisking spike — validate two alternative approaches to the R3 clobber problem (agent writes lost during source mode toggle-back). Both approaches are implemented and tested; the spike produces evidence for which approach to ship.

**Pace:** Thoroughness over speed. Each alternative should be fully implemented, tested with real scenarios, and documented with evidence. If something doesn't work, document precisely what broke and why.

---

## 1. Problem Statement (SCR)

**Situation:** The init_spike validated the core editor + CRDT + persistence stack. 6/7 validations passed. The source toggle (V4b) works: serialize-on-toggle via `updateYFragment` preserves content through WYSIWYG↔source cycles.

**Complication:** The V4b divergence test revealed a product-breaking limitation (spec risk R3): when a user is in source mode and an AI agent writes via DirectConnection, the agent's write is silently lost on toggle-back. `updateYFragment` replaces the entire Y.Doc with the user's parsed markdown — which was a snapshot taken *before* the agent wrote. This is the core use case of the product (human + agent co-editing), and it's broken in one of the two editor modes.

The previously recommended mitigation (Option I: awareness-based mode locking) is bad UX — telling agents "you can't write right now" is antithetical to an agent-native product. We need approaches that actually solve the merge, not avoid it.

**Resolution:** Implement and validate two alternative approaches that let agent writes coexist with source mode editing:

1. **Alternative A (Agent Markdown Writes):** Change the agent write path from raw Y.XmlElement construction to markdown parse→updateYFragment. This unifies the write path so agent writes can be injected directly into the source mode CodeMirror buffer as text.

2. **Alternative B (Three-Way Merge on Toggle-Back):** Store the markdown snapshot when entering source mode. On toggle-back, compute the diff between snapshot and user-edited markdown, then apply only the changed paragraphs to the Y.Doc — preserving agent writes in paragraphs the user didn't touch.

Both approaches are complementary, not competing. Alternative A changes how writes enter the system. Alternative B changes how writes are reconciled on toggle-back. The spike implements both and tests them independently and together.

---

## 2. Success Criteria

### End-to-End Validation Principle

Same as the init_spike: real browser sessions, real WebSocket connections, real agent writes. The foundation IS the integration test.

### Primary validation: the divergence test passes

The V4b divergence test that currently fails must pass:

1. User is in source mode editing paragraph A
2. Agent writes paragraph C via DirectConnection (non-conflicting — different paragraph)
3. User toggles back to WYSIWYG
4. **Both** the user's edit to paragraph A **and** the agent's paragraph C are present

This is the P0 acceptance criterion. Everything else supports this.

### Secondary validation: conflicting edits are handled gracefully

1. User is in source mode editing paragraph A
2. Agent writes to the **same** paragraph A via DirectConnection
3. User toggles back to WYSIWYG
4. Document is not corrupted. Both versions are either merged or one wins with the other recoverable. The behavior is documented.

This is characterization, not pass/fail — the product design for conflict resolution is a future decision. But the system must not silently lose data or corrupt the document.

---

## 3. What to Implement

### A1: Agent Markdown Write Path

**Hypothesis:** If the agent writes markdown text (parsed through the same path as toggle-back) instead of raw Y.XmlElements, source mode can receive agent writes as simple text insertions into the CodeMirror buffer.

**Implementation:**

1. **New agent write API:** Create a new endpoint `POST /api/agent-write-md` that accepts a markdown string and a position hint (append, prepend, or after-paragraph-N).

   ```typescript
   // Request body
   { markdown: string; position?: 'append' | 'prepend' | { after: number } }
   ```

2. **Server-side write path:** The endpoint:
   a. Opens a DirectConnection to the document
   b. Gets the current Y.XmlFragment content
   c. Serializes current content to markdown (via MarkdownManager)
   d. Splices the agent's markdown into the full markdown at the specified position
   e. Parses the combined markdown back to a ProseMirror node
   f. Applies via `updateYFragment` (diff-based)
   g. Disconnects

3. **Source mode injection:** When the editor is in source mode and an agent write occurs:
   a. The Y.Doc observer on the XmlFragment fires (the hidden TiptapEditor picks up the change)
   b. The App component detects the Y.Doc changed while in source mode
   c. The new content is serialized to markdown and compared with the current CodeMirror content
   d. The diff is applied as a CodeMirror dispatch (inserting the new paragraph at the right position)
   e. The user sees the agent's text appear in the source editor in real-time

4. **Update agent-sim.ts:** Add a `--markdown` flag that uses the new endpoint.

**Test procedure:**
1. Start dev server, open editor in browser
2. Type some content in WYSIWYG mode
3. Toggle to source mode
4. Run `agent-sim.ts --markdown` from terminal
5. Verify: agent's paragraph appears in the CodeMirror source view in real-time
6. Edit a different paragraph in source mode
7. Toggle back to WYSIWYG
8. Verify: both user's edit and agent's paragraph are present

**Pass criteria:** Agent writes appear in source mode in real-time. Toggle-back preserves both user edits and agent writes.

**Fail criteria:** Agent writes don't appear in source mode, or toggle-back loses either set of changes. Document the exact failure.

### A2: Three-Way Merge on Toggle-Back

**Hypothesis:** By computing a diff between the original snapshot and the user's edited markdown, we can apply only the user's actual changes to the Y.Doc — leaving agent writes (in paragraphs the user didn't touch) intact.

**Implementation:**

1. **Store snapshot on toggle-to-source:** When the user clicks "Source", save the serialized markdown as `snapshotMarkdown` (in addition to the current `sourceContent` state).

2. **Diff on toggle-back:** When the user clicks "WYSIWYG":
   a. Compute line-level diff between `snapshotMarkdown` (base) and `sourceContent` (user-edited)
   b. For each changed hunk in the diff:
      - Map the line range to paragraph indices in the Y.XmlFragment
      - Apply `updateYFragment` only to those paragraphs
   c. Paragraphs not in any hunk are left untouched in the Y.Doc (preserving agent writes)

3. **Paragraph-level mapping:** The mapping between markdown lines and Y.XmlFragment children is:
   - Serialize each Y.XmlFragment child independently to markdown
   - Build a map: `paragraph index → markdown line range`
   - Use this map to translate diff hunks to Y.Doc operations

4. **Conflict detection:** If a diff hunk overlaps with a paragraph that was modified by the agent (compare snapshot paragraph with current Y.Doc paragraph):
   - Flag as conflict
   - For P0: user's version wins (same as current behavior, but only for the conflicting paragraph — non-conflicting paragraphs are preserved)
   - Log the conflict for observability

5. **Fallback:** If the mapping fails (markdown structure changed too drastically for paragraph-level mapping), fall back to the current whole-doc `updateYFragment` with a console warning.

**Test procedure:**
1. Start dev server, open editor in browser
2. Type some content: paragraph A, paragraph B
3. Toggle to source mode
4. Run `agent-sim.ts` from terminal (adds paragraph C via DirectConnection to Y.Doc)
5. Edit paragraph A in source mode
6. Toggle back to WYSIWYG
7. Verify: paragraph A has user's edit, paragraph B unchanged, paragraph C (agent's) present
8. Conflicting test: repeat but agent edits paragraph A too
9. Verify: document not corrupted, user's version of paragraph A wins, paragraph B/C intact

**Pass criteria:** Non-conflicting divergence test passes — agent's paragraph C survives toggle-back. Conflicting case: user wins for the conflicting paragraph, document not corrupted.

**Fail criteria:** Agent's paragraph C still lost on toggle-back, or document corruption on conflict. Document the exact failure.

### A3: Combined — Both approaches active

**Test procedure:**
1. Start dev server, open editor
2. Toggle to source mode
3. Run `agent-sim.ts --markdown` — verify agent text appears in source view (A1)
4. Edit a different paragraph in source mode
5. Toggle back to WYSIWYG
6. Verify: three-way merge preserves both edits (A2)
7. The combined flow should "just work" — A1 makes agent writes visible in source, A2 makes toggle-back safe

---

## 4. Implementation Order

```
Phase 1: A2 (Three-way merge) — changes toggle-back behavior only, no new write path
Phase 2: A1 (Agent markdown writes) — new write endpoint + source mode injection
Phase 3: A3 (Combined test) — verify both work together
Phase 4: RESULTS.md update — document findings
```

A2 first because it's a safer change (only affects toggle-back, not the write path) and independently solves the P0 divergence test. A1 is the more ambitious change and benefits from A2 already being in place as safety net.

---

## 5. Tech Stack

Same as init_spike. Additional dependency:

```json
{
  "dependencies": {
    "diff": "^7.0.0"
  }
}
```

The `diff` package provides line-level diffing (`diffLines`) which maps cleanly to paragraph-level markdown changes. Pure JS, no native dependencies, well-maintained (5M weekly downloads).

---

## 6. Scope Boundaries

**In scope:**
- Three-way merge on toggle-back (A2)
- Agent markdown write endpoint (A1)
- Source mode live injection of agent writes (A1)
- Updated agent-sim.ts with --markdown flag
- Updated RESULTS.md with new validation findings
- End-to-end tests for both approaches

**Out of scope:**
- Awareness protocol / mode locking (Option I) — deferred, may not be needed if A1+A2 work
- Disk-based source mode / file watcher (Cursor interop) — separate story
- Conflict resolution UX (three-way merge conflict case uses "user wins" for P0)
- Changes to the persistence layer
- Changes outside init_spike/

---

## 7. Key Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Store snapshotMarkdown on toggle-to-source, three-way merge on toggle-back, source mode Y.Doc change observer |
| `src/editor/TiptapEditor.tsx` | Expose Y.Doc change callback for source mode injection |
| `src/server/hocuspocus-plugin.ts` | New `POST /api/agent-write-md` endpoint |
| `src/server/agent-sim.ts` | Add `--markdown` flag |
| `src/server/agent-flow.test.ts` | New tests for three-way merge and markdown write path |
| `RESULTS.md` | Updated with A1/A2/A3 validation results |

---

## 8. Agent Constraints

**SCOPE:** Only files within `init_spike/`. Same constraints as init_spike spec.

**STOP_IF:**
- Three-way merge produces document corruption (not just wrong merge — actual Y.Doc structural corruption)
- The diff library can't handle the markdown patterns in the test fixture

**Key research references:**
- `reports/source-toggle-architecture/` — Option A/B/I analysis, updateYFragment behavior
- `reports/crdt-mcp-filesystem-bridge/evidence/updateyfragment-concurrent-mutations.md` — R3 risk characterization
- `specs/2026-04-07-init-spike/SPEC.md` — V4b divergence test procedure (steps 8-9)

---

## 9. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Paragraph-level mapping between markdown lines and Y.XmlFragment children is fragile | MEDIUM | MEDIUM | Fallback to whole-doc updateYFragment if mapping fails. Log the failure for debugging. |
| R2 | Agent markdown write path has higher latency than direct Y.XmlElement construction | LOW | LOW | Agent writes are at section level (TQ16). Parse→updateYFragment adds ~5-10ms. Negligible at 30s+ agent write intervals. |
| R3 | Source mode injection causes cursor jump in CodeMirror when agent text is inserted | MEDIUM | LOW | Insert at document end (append) to minimize disruption. If cursor jumps, document the behavior. |
| R4 | Three-way merge + agent markdown writes interact badly (double-application of changes) | LOW | MEDIUM | Test A3 (combined) explicitly. If interaction issues, document and recommend which to ship solo. |
