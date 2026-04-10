# Evidence: String Replacement Edits on CRDT-Generated Code

**Dimension:** How do you handle the old_string → new_string edit pattern (8/11 agents)?
**Date:** 2026-03-21
**Sources:** Yjs source code, agent-tool-surfaces report §7, diff algorithm analysis

---

## Key files referenced

- `~/.claude/oss-repos/yjs/src/ytype.js:1183-1237` — YText insert/delete methods
- `~/.claude/oss-repos/yjs/src/ytype.js:1033-1076` — YText.applyDelta()
- Agent-tool-surfaces report §7: Diff Application Mechanisms
- Agent-tool-surfaces report §9: MCP edit_file tool

---

## Findings

### Finding: The string replacement pattern maps directly to YText indexOf + delete + insert
**Confidence:** CONFIRMED
**Evidence:** The MCP `edit_file` tool accepts `edits: [{oldText, newText}]`. The YText API provides `toString()`, `delete(index, length)`, and `insert(index, content)`.

**Translation for single edit:**
```javascript
async function applyStringReplacement(
  directConnection: DirectConnection,
  documentName: string,
  oldString: string,
  newString: string
): Promise<{ success: boolean; error?: string }> {
  let result: { success: boolean; error?: string } = { success: false }

  await directConnection.transact((doc) => {
    const ytext = doc.getText("content")
    const fullText = ytext.toString()
    const index = fullText.indexOf(oldString)

    if (index === -1) {
      result = { success: false, error: `String not found: "${oldString.slice(0, 50)}..."` }
      return
    }

    // Check for ambiguity (multiple occurrences)
    const secondIndex = fullText.indexOf(oldString, index + 1)
    if (secondIndex !== -1) {
      result = { success: false, error: `Multiple occurrences found (${countOccurrences(fullText, oldString)}). Provide more context.` }
      return
    }

    ytext.delete(index, oldString.length)
    ytext.insert(index, newString)
    result = { success: true }
  })

  return result
}
```

**Implications:** This is the core translation for 8/11 agents. The implementation is straightforward — the complexity is in edge cases (ambiguity, concurrent edits shifting positions).

### Finding: Multi-edit batching requires right-to-left application to avoid offset corruption
**Confidence:** CONFIRMED
**Evidence:** When an agent sends multiple edits in one call (MCP `edit_file` with multiple edits array entries, or OpenCode's multi-edit), applying them left-to-right corrupts offsets because earlier edits shift positions of later edits.

**Correct approach — sort by position, apply right-to-left:**
```javascript
await directConnection.transact((doc) => {
  const ytext = doc.getText("content")
  const fullText = ytext.toString()

  // Find all edit positions
  const positioned = edits.map(({ oldText, newText }) => ({
    index: fullText.indexOf(oldText),
    oldLength: oldText.length,
    newText,
  })).filter(e => e.index !== -1)

  // Sort by position DESCENDING (right-to-left)
  positioned.sort((a, b) => b.index - a.index)

  // Apply — later positions first, so earlier offsets remain valid
  for (const edit of positioned) {
    ytext.delete(edit.index, edit.oldLength)
    ytext.insert(edit.index, edit.newText)
  }
})
```

**Alternatively, build a single delta:**
```javascript
// Convert all edits to a single delta (more efficient, handles ordering automatically)
const fullText = ytext.toString()
const deltaOps = buildDeltaFromEdits(fullText, edits)  // Compute retain/delete/insert sequence
ytext.applyDelta(deltaOps)
```

**Implications:** The delta approach is preferred for multi-edit because it handles ordering automatically and produces a single atomic update.

### Finding: Fuzzy matching is NOT needed in the CRDT bridge — exact match is sufficient
**Confidence:** INFERRED
**Evidence:** Agent-tool-surfaces report §7 shows that 5/11 agents use strict exact match (Claude Code, Devin, OpenHands, Continue, Codex). The remaining agents have their own fuzzy matching on their side before sending the edit to the tool.

The MCP server receives the FINAL old_string/new_string after the agent has already resolved any fuzzy matching. The server should use strict `indexOf()` — if the string isn't found, it's because the file changed concurrently (a real conflict), not because the agent was imprecise.

**Exception:** If the CRDT text was generated from a component model (Architecture 2 from the reads dimension), the generated code may differ slightly from what the agent read. In this case, fuzzy matching or re-generation before edit would be needed.

**Implications:** With a text CRDT (Architecture 1), the MCP server can use strict exact match. With a component CRDT (Architecture 2), additional complexity is needed.

### Finding: Concurrent edit conflicts during string replacement are detectable but not automatically resolvable
**Confidence:** INFERRED
**Evidence:** Scenario: Agent reads file, finds `old_string` at position 50. Meanwhile, human inserts 10 characters at position 30. By the time the agent's edit arrives, `old_string` is now at position 60.

With text CRDT (Architecture 1): The agent's edit is applied against the live CRDT state (not a stale snapshot). The `indexOf()` runs on the CURRENT text, which includes the human's edit. So the agent finds the string at position 60, not 50. This works correctly.

The problematic scenario: Human edits WITHIN the old_string region between agent read and agent write. Then `indexOf()` fails (string not found) — the correct behavior is to return an error to the agent, which will re-read and retry.

**Implications:** The text CRDT model handles most concurrent edit scenarios correctly because `indexOf()` runs on the live state. Only overlapping edits to the same region produce conflicts, and those are correctly detected as "not found."

### Finding: The apply_patch format (Codex) and SEARCH/REPLACE blocks (Aider, Cline) also translate to the same YText operations
**Confidence:** CONFIRMED
**Evidence:** Agent-tool-surfaces report §7 — All diff mechanisms ultimately resolve to "find text, replace text." The MCP server can normalize all formats to the same internal operation:

| Agent Format | Normalization |
|---|---|
| `old_string → new_string` (Claude Code, etc.) | Direct: indexOf + delete + insert |
| `SEARCH/REPLACE blocks` (Aider, Cline) | Parse blocks → same indexOf + delete + insert |
| `*** Begin Patch` (Codex) | Parse patch → compute affected regions → delete + insert |
| `Semantic diff + apply model` (Cursor) | Agent's apply model produces full file → use write_file path (diff-based) |
| `Line-number replace` (Lovable) | Convert line numbers to character offsets → delete + insert |

**Implications:** The MCP server needs one internal operation (positioned delete + insert on YText) and a thin parsing layer per agent format. Most agents use the MCP `edit_file` tool which already normalizes to `[{oldText, newText}]`.

---

## Gaps / follow-ups

* **Race condition window:** Between `toString()` and `delete()/insert()` within a single `transact()`, can another write interleave? No — Yjs transactions are atomic. But between agent read_file and edit_file (separate MCP calls), the file CAN change. This is the same race condition that exists with real filesystems.
* **replace_all behavior:** Claude Code's `replace_all: true` flag means replace all occurrences. Implementation: use a loop or regex-based findAll, then apply right-to-left.
