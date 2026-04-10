# Evidence: The Translation Layer — write_file/edit_file → CRDT Operations

**Dimension:** What is the translation layer? When an agent calls write_file(Button.tsx, content), what happens?
**Date:** 2026-03-21
**Sources:** Yjs source code, Hocuspocus source code, prerequisite reports, diff algorithm research

---

## Key files referenced

- `~/.claude/oss-repos/yjs/src/ytype.js:1033-1076` — YText.applyDelta() implementation
- `~/.claude/oss-repos/yjs/src/ytype.js:1183-1185` — YText.insert()
- `~/.claude/oss-repos/yjs/src/ytype.js:1235-1237` — YText.delete()
- `~/.claude/oss-repos/yjs/src/ytype.js:1318` — YText.toString()
- `~/.claude/oss-repos/yjs/src/utils/Transaction.js:25-48` — Transaction batching semantics
- `~/.claude/oss-repos/hocuspocus/packages/server/src/DirectConnection.ts:29-44` — transact() API

---

## Findings

### Finding: Three translation strategies exist, with diff-based (Option C) as the most robust for agent compatibility
**Confidence:** INFERRED
**Evidence:** Synthesis of Yjs API capabilities, agent tool surface patterns (8/11 use string replacement), and CRDT conflict resolution properties.

**Option A — Parse .tsx → component properties → apply to component CRDT:**
```
Agent: write_file("Button.tsx", "<button className='bg-blue-500'>Click</button>")
  → Parse new JSX with Babel/SWC
  → Extract: { className: "bg-blue-500", children: "Click" }
  → componentCrdt.getMap("Button").set("className", "bg-blue-500")
  → componentCrdt.getMap("Button").set("children", "Click")
  → Code regenerated from CRDT → sandbox FS updated
```
- **Pros:** Property-level LWW, always valid output, Figma-like conflict resolution
- **Cons:** Lossy — can't represent arbitrary code (hooks, expressions, comments); requires full parser/printer pipeline; format divergence between agent's code and generated code
- **When:** Visual-only property changes where round-trip fidelity is acceptable

**Option B — Replace the full YText content:**
```
Agent: write_file("Button.tsx", newContent)
  → ytext.delete(0, ytext.toString().length)
  → ytext.insert(0, newContent)
```
- **Pros:** Simple, preserves agent's exact output
- **Cons:** Destroys ALL concurrent edits (entire text replaced), no conflict resolution, hostile to collaboration
- **When:** NEVER in a multi-writer environment. Only acceptable for agent-exclusive files (no humans editing simultaneously)

**Option C — Diff against current CRDT text → apply minimal YText operations:**
```
Agent: write_file("Button.tsx", newContent)
  → currentContent = ytext.toString()
  → diffs = diff(currentContent, newContent)  // e.g., fast-diff or diff-match-patch
  → doc.transact(() => {
      let cursor = 0
      for (const [op, text] of diffs) {
        if (op === EQUAL) cursor += text.length    // retain
        if (op === DELETE) { ytext.delete(cursor, text.length) }
        if (op === INSERT) { ytext.insert(cursor, text); cursor += text.length }
      }
    })
```
- **Pros:** Preserves concurrent edits outside diff regions; compatible with ALL agent edit patterns; minimal CRDT operations
- **Cons:** Text-level operations can produce invalid code when merged with concurrent edits; requires diffing step (fast — sub-ms for typical files)
- **When:** General case for all agent writes

**Implications:** Option C is the recommended default because it is transparent to agents — they see a filesystem, they write files, the system computes minimal CRDT operations. Option A can be layered on top for property-only changes where stronger conflict safety is desired.

### Finding: YText has no native "replace" — must compose delete + insert in a transaction
**Confidence:** CONFIRMED
**Evidence:** `ytype.js:1183-1237` — YText exposes `insert(index, content)` and `delete(index, length)` but no `replace()`. The Yjs community discussion ([discuss.yjs.dev/t/2690](https://discuss.yjs.dev/t/is-it-possible-to-force-a-y-text-deletion-and-or-have-a-special-replace-method/2690)) confirms this.

String replacement must be implemented as:
```javascript
const fullText = ytext.toString()
const index = fullText.indexOf(oldString)
if (index !== -1) {
  doc.transact(() => {
    ytext.delete(index, oldString.length)
    ytext.insert(index, newString)
  })
}
```

All operations in a single `doc.transact()` are batched into ONE update message broadcast to peers (`Transaction.js:25-48`).

**Implications:** The edit_file(old_string, new_string) operation maps cleanly to YText: indexOf to find position, delete + insert in a transaction. This is the exact pattern for 8/11 agents.

### Finding: applyDelta() is the most efficient API for multi-region edits
**Confidence:** CONFIRMED
**Evidence:** `ytype.js:1033-1076` — `applyDelta()` accepts a Quill-compatible delta with retain/delete/insert operations and applies them in a single transaction internally.

```javascript
// Convert diff output to delta for multi-region changes
const changeDelta = delta.create()
  .retain(5)           // Keep first 5 characters
  .delete(3)           // Delete 3 characters
  .insert('new text')  // Insert replacement
  .retain(100)         // Skip to next change
  .delete(10)          // Delete at second location
  .insert('more new')  // Insert second replacement
  .done()
ytext.applyDelta(changeDelta)
```

**Implications:** For write_file (full content replacement via diff), converting diff output to a delta and calling applyDelta() once is more efficient than multiple insert/delete calls.

### Finding: fast-diff is the standard diff library for Yjs text operations
**Confidence:** CONFIRMED
**Evidence:** Yjs documentation and community ([Y.Text docs](https://docs.yjs.dev/api/shared-types/y.text)) recommend `fast-diff` for computing minimal operations between old and new text. The workflow: `fast-diff(oldText, newText)` → convert result to delta → `ytext.applyDelta(delta)`.

Google's `diff-match-patch` is an alternative with more features (fuzzy matching, patch creation) but is heavier. For the MCP translation layer, `fast-diff` is sufficient and faster.

**Implications:** The diff computation adds negligible latency (sub-millisecond for typical source files). The translation layer can compute minimal CRDT operations efficiently.

### Finding: Transaction batching ensures atomic updates to all peers
**Confidence:** CONFIRMED
**Evidence:** `Transaction.js:25-48` — "A transaction is created for every change on the Yjs model. It is possible to bundle changes on the Yjs model in a single transaction to minimize the number of messages sent and the number of observer calls."

Multiple edits in one `doc.transact()` → one binary update → one broadcast to all peers.

**Implications:** A write_file that touches 50 lines results in ONE update message, not 50. This keeps network overhead low even for large agent writes.

---

## The Recommended Translation Flow

### For `write_file(path, content)`:

```
1. MCP server receives write_file(path, content)
2. Open/reuse DirectConnection for the document
3. Get current text: currentContent = ytext.toString()
4. If content === currentContent → no-op, return success
5. Compute diff: diffs = fastDiff(currentContent, content)
6. Convert diffs to Yjs delta operations
7. directConnection.transact((doc) => {
     doc.getText("content").applyDelta(delta)
   })
8. Changes propagate to all WebSocket clients immediately
9. Return success to agent
```

### For `edit_file(path, edits: [{oldText, newText}])`:

```
1. MCP server receives edit_file(path, edits)
2. Open/reuse DirectConnection for the document
3. Get current text: currentContent = ytext.toString()
4. For each edit, find oldText position in currentContent
5. Build a single delta with all edits (sorted by position, applied right-to-left to avoid offset shifts)
6. directConnection.transact((doc) => {
     doc.getText("content").applyDelta(combinedDelta)
   })
7. Return success or "not found" per edit
```

---

## Gaps / follow-ups

* **Conflict handling:** When an agent's diff-based write overlaps with a concurrent human edit, Yjs will merge at the character level. This may produce invalid code. Detection/recovery strategy needed.
* **Round-trip consistency:** After write_file, the agent may immediately read_file. The read must return the post-write state, not a stale cached version.
* **Large file performance:** Diff computation on very large files (10K+ lines) may be non-trivial. Benchmark needed.
