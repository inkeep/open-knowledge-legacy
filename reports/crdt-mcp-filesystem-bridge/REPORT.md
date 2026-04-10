---
title: "Bridging AI Coding Agents and CRDT-Authoritative Editing: The MCP Filesystem Translation Layer"
description: "How to build an MCP filesystem server that translates standard file operations (read_file, write_file, edit_file) into Yjs CRDT operations via Hocuspocus DirectConnection, enabling AI coding agents to work with a visual editor without knowing it is CRDT-backed. Covers Replit Crosis protocol analysis, Hocuspocus DirectConnection API, translation layer design for all agent edit patterns, read/write consistency, non-content file operations, bidirectional file-CRDT sync safety under concurrent mutations (updateYFragment clobber analysis), feedback loop prevention for file watchers, and CRDT-to-disk persistence latency optimization."
createdAt: 2026-03-21
updatedAt: 2026-04-07
subjects:
  - Hocuspocus
  - Yjs
  - MCP
  - Replit Crosis
  - OpenDesign
  - y-prosemirror
  - "@parcel/watcher"
topics:
  - CRDT filesystem bridge
  - agent tool translation
  - collaborative editing integration
  - bidirectional file sync
  - concurrent mutation safety
---

# Bridging AI Coding Agents and CRDT-Authoritative Editing: The MCP Filesystem Translation Layer

**Purpose:** Define how an MCP filesystem server translates standard file operations (read_file, write_file, edit_file) into CRDT operations via Hocuspocus DirectConnection, so that AI coding agents can interact with a CRDT-authoritative visual editor without any awareness of the underlying collaborative infrastructure.

---

## Executive Summary

After analyzing Replit Crosis source code, Hocuspocus DirectConnection source code and tests, Yjs YText APIs, and 11 AI coding agent tool surfaces, the central finding is:

**A CRDT-backed MCP filesystem server is both feasible and architecturally clean.** The key insight is that Hocuspocus DirectConnection provides a zero-overhead, in-process API for reading and writing Yjs documents, and all agent edit patterns (string replacement, full file write, patch application) can be translated to minimal Yjs YText operations via a simple diff step. No agent needs to know about CRDTs — the translation is fully transparent.

**Key Findings:**

- **Hocuspocus DirectConnection is the ideal integration point.** It provides direct, in-process access to Yjs documents with full API access (`getMap()`, `getText()`, `getArray()`), immediate propagation to WebSocket clients (microseconds), transaction origin tracking to distinguish AI from human writes, and automatic persistence hook integration. No WebSocket overhead.

- **The diff-based translation strategy (Option C) is the most robust for agent compatibility.** When an agent calls `write_file(path, content)`, the MCP server computes a minimal diff between the current YText content and the new content, then applies it as a Yjs delta — preserving concurrent edits outside the changed regions. This works with all 11 agents studied, regardless of their edit mechanism.

- **String replacement (8/11 agents) maps directly to YText operations.** `edit_file(old_string, new_string)` translates to: `indexOf(old_string)` on `ytext.toString()` → `ytext.delete(index, old_string.length)` → `ytext.insert(index, new_string)` — all within a single atomic transaction. Concurrent edits to other regions of the file are unaffected.

- **Replit has validated the "all writes through one protocol" principle in production.** Crosis source code confirms that Replit Agent and human editors use the identical channel protocol — no special bot API exists. OpenDesign should follow the same principle with CRDT: all writers (visual editor, code editor, AI agent) go through Yjs.

- **A text CRDT (YText) should be the source of truth for the MCP bridge, not a component CRDT.** While the source-of-truth report recommends a dual-layer model (component CRDT + generated code), the MCP bridge should operate on the text layer to preserve round-trip fidelity. Agents read back exactly what they or others wrote — no reformatting, no comment stripping, no property extraction.

- **Non-content operations (mkdir, delete, rename, glob, grep) require a hybrid approach.** Content operations go through CRDT. Structure operations (directory management, file deletion, renaming) use a project index CRDT document plus sandbox filesystem coordination. Content search (grep) should use the sandbox filesystem as the search index.

- **updateYFragment will silently clobber concurrent CRDT mutations when called from a file watcher.** Source code analysis confirms that `updateYFragment` (y-prosemirror v1.x) performs a two-way diff against the CURRENT CRDT state and forces it to match the ProseMirror node derived from disk content. If an agent has modified the CRDT since the last disk write, those modifications are overwritten. This is the critical flaw in the file watcher → CRDT sync path (Path 3). Mitigation requires either a content hash gate, lock-based exclusion, or a three-way merge (no off-the-shelf solution exists).

- **Sub-500ms CRDT → disk persistence is feasible with no Hocuspocus code changes.** Setting `debounce: 200, maxDebounce: 500` tightens the persistence window. Serialization cost for a 10KB document is estimated at 3-12ms per write. Binary CRDT persistence and markdown serialization can run at different cadences, with git commits remaining at 30-60s.

- **Feedback loops (CRDT → disk → watcher → CRDT) require two-layer prevention.** @parcel/watcher provides no process information in events — application-level write tracking with content hashes is needed to ignore self-writes. Hocuspocus's `skipStoreHooks` flag (v4+) prevents file-watcher-originated CRDT mutations from re-triggering persistence.

---

## Research Rubric

| # | Dimension | Priority | Depth | Status |
|---|-----------|----------|-------|--------|
| 1 | Replit Crosis: how agent/bot writes flow through the protocol | P0 | Deep | CONFIRMED |
| 2 | Hocuspocus DirectConnection: server-side CRDT mutation API | P0 | Deep | CONFIRMED |
| 3 | The translation layer: write_file/edit_file → CRDT operations | P0 | Deep | CONFIRMED |
| 4 | Agent reads: generating code from CRDT on demand | P0 | Deep | CONFIRMED |
| 5 | String replacement edits on CRDT-generated code | P0 | Deep | CONFIRMED |
| 6 | Non-CRDT file operations (mkdir, delete, rename, glob) | P0 | Moderate | INFERRED |
| 7 | Prior art: VS Code Live Share + Copilot, Cursor on CRDT files | P1 | Moderate | CONFIRMED |
| 8 | updateYFragment under concurrent mutations (file watcher + agent) | P0 | Deep | CONFIRMED |
| 9 | Feedback loop prevention: CRDT → disk → watcher → CRDT | P0 | Deep | CONFIRMED |
| 10 | CRDT → disk persistence latency floor (<500ms feasibility) | P0 | Deep | CONFIRMED |

**Stance:** Factual with conclusions.
**Non-goals:** Implementing the solution, designing the component CRDT schema, UI/UX for conflict resolution, choosing specific parser/printer libraries.

---

## Detailed Findings

### 1. Replit Crosis: The "All Writes Through One Protocol" Principle

**Finding:** Replit's Crosis protocol makes no distinction between human and AI agent writes. All file operations flow through identical OT channels over a single WebSocket, validating that AI agents can participate in a collaborative editing protocol without special APIs.

**Evidence:** [evidence/crosis-agent-writes.md](evidence/crosis-agent-writes.md)

The Crosis client (`client.ts:534-541`) opens channels by specifying a service name (`"ot"`, `"files"`, `"exec"`) and a file name. The server assigns a numeric channel ID. All subsequent messages — whether from a human editor or an AI agent — use the same `channel.send()` path through the same WebSocket (`client.ts:1506-1530`). The protobuf-encoded `api.Command` has no field for "writer type."

A file watching daemon on the server generates OT messages when files change on disk, broadcasting them to all subscribed clients. This is how build tool output (e.g., `npm install` modifying `package-lock.json`) appears in the editor — the file watcher IS a writer, just like the human and the AI.

```
Human Editor ─────┐
AI Agent ──────────┤──── WebSocket ──── OT Channels ──── Server (authority)
File Watcher ──────┘
```

**Implications for OpenDesign:**
- Follow the same principle: all writes go through Yjs, regardless of source
- No "agent API" vs "editor API" — one CRDT layer serves everyone
- The MCP server is just another writer, like Copilot in VS Code is just another extension

**Decision triggers:**
- If OpenDesign supports multiple concurrent AI agents editing the same project: each agent is a separate Crosis-like client with its own channels
- If OpenDesign adds build tool output to the editor: the file watcher pattern (sandbox FS change → CRDT update) applies

---

### 2. Hocuspocus DirectConnection: The Server-Side CRDT Write API

**Finding:** Hocuspocus DirectConnection provides zero-overhead, in-process access to Yjs documents with full API access, immediate propagation to WebSocket clients, transaction origin tracking, and automatic persistence integration. It is the ideal integration point for an MCP filesystem server.

**Evidence:** [evidence/hocuspocus-direct-connection.md](evidence/hocuspocus-direct-connection.md)

#### The API Surface

```typescript
// Open a connection to a document (creates if needed, reuses if in memory)
const conn = await hocuspocus.openDirectConnection("src/components/Button.tsx", {
  agentId: "claude-code-1",
  sessionId: "abc123"
})

// Mutate the document — full Yjs API available
await conn.transact((doc) => {
  const ytext = doc.getText("content")
  ytext.delete(50, 10)       // Delete 10 chars at position 50
  ytext.insert(50, "new text") // Insert replacement
})
// → Changes broadcast to all WebSocket clients IMMEDIATELY

// Read the document
await conn.transact((doc) => {
  const content = doc.getText("content").toString()
  // content includes all concurrent edits from other writers
})

// Clean up
await conn.disconnect()
// → Persistence hooks flush, document unloads if no other connections
```

#### Key Properties

| Property | Value | Source |
|----------|-------|--------|
| Latency (transact) | ~µs (in-process, no network) | `DirectConnection.ts:29-44` |
| Update propagation | Immediate (same event loop tick) | `Document.ts:221-233` |
| Origin tracking | `{ source: "local", context }` | `types.ts:6-50` |
| Persistence | Debounced store (2s default), immediate on disconnect | `Hocuspocus.ts:263-311` |
| Document lifecycle | Creates on first access, unloads when no connections | `Hocuspocus.ts:593-611` |
| Bidirectional visibility | Confirmed — reads WebSocket client data, writes visible to clients | Test: `openDirectConnection.ts:45-73` |

#### Transaction Origin Tracking

DirectConnection writes are tagged with `{ source: "local", context }`, distinguishable from WebSocket writes (`{ source: "connection" }`) and Redis sync (`{ source: "redis" }`). The custom context (e.g., agent ID) flows through to all `onChange` hooks, enabling:
- Audit logging per agent
- Conflict resolution policies (e.g., "AI writes yield to human writes")
- Undo isolation (revert only AI changes)

**Implications for the MCP bridge:**
- The MCP server runs in the same Node.js process as Hocuspocus (or connects via DirectConnection)
- Each MCP tool call translates to one `conn.transact()` call
- Connection pooling should maintain open DirectConnections for active documents

**Remaining uncertainty:** DirectConnection has had correctness bugs (issues #832, #833, fixed in v2.13.2). Edge cases with custom origins and concurrent WebSocket disconnections should be tested carefully.

---

### 3. The Translation Layer: write_file/edit_file → CRDT Operations

**Finding:** The diff-based translation strategy is the most robust for agent compatibility. When an agent writes a file, the MCP server computes a minimal character-level diff between the current YText and the new content, then applies it as a Yjs delta. This preserves concurrent edits and works with all agent edit patterns.

**Evidence:** [evidence/translation-layer-design.md](evidence/translation-layer-design.md)

#### Three Translation Strategies Evaluated

| Strategy | Mechanism | Concurrent Edit Safety | Agent Compatibility | Recommended? |
|----------|-----------|----------------------|--------------------|----|
| **A: Property extraction** | Parse .tsx → extract props → set on YMap | Highest (property LWW) | Low — lossy, format divergence | No (for MCP bridge) |
| **B: Full text replacement** | Delete all → insert new | None — destroys concurrent edits | High — exact output preserved | No — hostile to collaboration |
| **C: Diff-based minimal ops** | fast-diff(current, new) → YText delta | Good — preserves edits outside changed regions | Highest — works with all agents | **Yes** |

#### The Recommended Flow: write_file

```
1. Agent calls write_file("src/components/Button.tsx", newContent)
2. MCP server gets/opens DirectConnection for document
3. Read current: currentContent = ytext.toString()
4. Short-circuit: if newContent === currentContent → return success (no-op)
5. Compute diff: diffs = fastDiff(currentContent, newContent)
6. Convert to Yjs delta: retain/delete/insert operations
7. Apply atomically:
   conn.transact((doc) => {
     doc.getText("content").applyDelta(delta)
   })
8. Changes propagate to all WebSocket clients (µs)
9. Return success to agent
```

The `fast-diff` library produces a minimal character-level diff. For a typical source file edit (changing a few lines), this produces 3-5 delta operations. The diff computation is sub-millisecond for files under 100KB.

#### The Recommended Flow: edit_file (string replacement)

```
1. Agent calls edit_file("Button.tsx", [{oldText: "bg-blue-500", newText: "bg-red-500"}])
2. MCP server gets/opens DirectConnection
3. Read current: fullText = ytext.toString()
4. Find position: index = fullText.indexOf("bg-blue-500")
5. Validate: check uniqueness (no second occurrence)
6. Apply atomically:
   conn.transact((doc) => {
     const ytext = doc.getText("content")
     ytext.delete(index, oldText.length)
     ytext.insert(index, newText)
   })
7. Return success or error ("not found" / "multiple occurrences")
```

For multiple edits in one call, sort by position descending (right-to-left) to avoid offset corruption, or build a single delta.

**Implications:**
- The diff step adds negligible overhead (~0.1ms for typical files)
- All 11 agent edit patterns ultimately resolve to the same YText operations
- The MCP server is a thin translation layer — not a complex parser/generator

**Decision triggers:**
- If round-trip fidelity is critical (agents must read back exactly what they wrote): use text CRDT (Architecture 1)
- If visual editor needs structured component data: add the component CRDT layer ABOVE the text CRDT, with the MCP bridge operating on the text layer

---

### 4. Agent Reads: Fresh, In-Memory, Zero-Cache

**Finding:** Agent reads should return `ytext.toString()` directly from the in-memory CRDT document. No caching, no code generation step, no stale data. DirectConnection guarantees read-after-write consistency.

**Evidence:** [evidence/agent-reads-code-generation.md](evidence/agent-reads-code-generation.md)

#### read_file Implementation

```typescript
async function readFile(path: string, offset?: number, limit?: number): Promise<string> {
  const conn = await pool.getConnection(path)
  let content: string = ""

  await conn.transact((doc) => {
    content = doc.getText("content").toString()
  })

  if (offset !== undefined || limit !== undefined) {
    const lines = content.split('\n')
    const start = (offset ?? 1) - 1  // Convert 1-indexed to 0-indexed
    const count = limit ?? lines.length
    return lines.slice(start, start + count)
      .map((line, i) => `${start + i + 1}\t${line}`)
      .join('\n')
  }

  return content
}
```

#### Read Properties

| Property | Value |
|----------|-------|
| Freshness | Always current — reads live CRDT state |
| Latency | ~µs (in-memory string concatenation) |
| Read-after-write consistency | Guaranteed — same in-process Doc instance |
| Partial reads (line ranges) | String split in response layer, not CRDT layer |
| Binary files | Bypass CRDT — serve from sandbox FS |

#### Why NOT a Component CRDT for Reads

The source-of-truth report recommends a dual-layer model where the component CRDT is authoritative and code is generated. For the MCP bridge specifically, this introduces a problem: generated code may differ from what the agent wrote (reformatting, comment stripping, expression simplification). Since 8/11 agents use exact string matching for edits, any formatting change breaks subsequent edit operations.

The MCP bridge should operate on the text layer, where agents read back exactly what they (or others) wrote. The component CRDT layer can exist alongside but is not involved in the MCP bridge's read/write path.

**Decision triggers:**
- If the visual editor modifies the component CRDT (not the text): the text CRDT must be regenerated from the component model. The MCP bridge then reads the regenerated text. This introduces the formatting divergence problem — address with a code formatter that both the generator and agents agree on (e.g., Prettier with fixed config).

---

### 5. String Replacement Edits on CRDT-Backed Text

**Finding:** The string replacement pattern used by 8/11 agents maps directly to YText operations. The key insight is that `indexOf()` runs on the live CRDT state within a transaction, so concurrent edits to other regions don't cause stale-offset bugs.

**Evidence:** [evidence/string-replacement-edits.md](evidence/string-replacement-edits.md)

#### How All Agent Edit Formats Translate

| Agent Format | Translation to YText |
|---|---|
| `old_string → new_string` (Claude Code, OpenCode, Continue, OpenHands, Devin) | `indexOf(old) → delete(index, len) → insert(index, new)` |
| `SEARCH/REPLACE blocks` (Aider, Cline) | Parse search block → same indexOf + delete + insert |
| `*** Begin Patch` (Codex CLI) | Parse patch hunks → positioned delete + insert per hunk |
| `Semantic diff + apply model` (Cursor, Windsurf) | Apply model produces full file → use write_file path (diff-based) |
| `Line-number replace` (Lovable) | Convert line numbers to char offsets → delete + insert |

All formats converge to: **find a position, delete a range, insert new text** — exactly what YText supports.

#### Concurrency Safety

The operation runs inside `conn.transact()`, which is atomic with respect to the CRDT. The `indexOf()` search runs on the CURRENT document state, which includes any concurrent edits that have been applied. This means:

- Human inserts text BEFORE the agent's target → target shifts position → `indexOf()` finds it at the new position → edit succeeds
- Human edits WITHIN the agent's target string → `indexOf()` fails → MCP returns "not found" → agent re-reads and retries
- Human edits AFTER the agent's target → no effect on `indexOf()` → edit succeeds

This is the same concurrency model as editing a real file — the race condition window is between the agent's read and write, not within the write itself.

#### Multi-Edit Batching

For agents that send multiple edits in one call, sort positions descending and apply right-to-left:

```javascript
conn.transact((doc) => {
  const ytext = doc.getText("content")
  const text = ytext.toString()
  // Find all positions, sort descending
  const ops = edits.map(e => ({ idx: text.indexOf(e.old), ...e }))
    .filter(e => e.idx !== -1)
    .sort((a, b) => b.idx - a.idx)
  // Apply right-to-left (preserves earlier offsets)
  for (const op of ops) {
    ytext.delete(op.idx, op.old.length)
    ytext.insert(op.idx, op.new)
  }
})
```

**Implications:** No fuzzy matching needed in the MCP server. Agents handle fuzzy matching on their side (OpenCode's 9-level chain, Aider's diff-match-patch). The MCP server receives the final, resolved edit and applies it with strict exact match.

---

### 6. Non-CRDT File Operations

**Finding:** File operations split into content operations (CRDT-backed) and structure operations (hybrid CRDT index + sandbox filesystem). Content search should use the sandbox filesystem as the search backend.

**Evidence:** [evidence/non-crdt-file-operations.md](evidence/non-crdt-file-operations.md)

#### Operation Routing Table

| MCP Tool | Backend | Implementation |
|----------|---------|---------------|
| `read_file` | CRDT | `ytext.toString()` |
| `write_file` | CRDT | Diff → delta → `ytext.applyDelta()` |
| `edit_file` | CRDT | indexOf → delete + insert |
| `read_multiple_files` | CRDT | Batch `ytext.toString()` per document |
| `create_directory` | No-op / Index | Directories exist implicitly; record in project index if empty dir support needed |
| `list_directory` | Project Index | Query index CRDT for matching path prefixes |
| `directory_tree` | Project Index | Recursive prefix query on index |
| `move_file` | CRDT + Index + FS | Copy content to new doc → update index → delete old doc → update sandbox FS |
| `search_files` | Project Index | Glob match on document names in index |
| `get_file_info` | CRDT Metadata | Synthesize size/mtime from CRDT state |
| `list_allowed_directories` | Config | Static configuration |

#### The Project Index

A dedicated CRDT document (`_project_index`) tracks the file tree as a YMap:

```javascript
// Project index structure
{
  "src/components/Button.tsx": { size: 1234, mtime: 1711036800000 },
  "src/components/Card.tsx": { size: 890, mtime: 1711036800000 },
  "src/styles/globals.css": { size: 456, mtime: 1711036800000 },
  ...
}
```

This enables `list_directory`, `directory_tree`, and `search_files` without enumerating CRDT documents (which Hocuspocus doesn't support natively).

#### Content Search (grep)

Content search across files is the hardest operation over CRDT-backed storage. Scanning all documents requires loading each into memory. The pragmatic solution: **use the sandbox filesystem as the search index.** Since the CRDT → sandbox sync ensures files are current, searching the sandbox FS is equivalent to searching CRDT content.

```
Agent: grep("useState", "src/**/*.tsx")
  → MCP server delegates to sandbox FS: rg "useState" src/ --glob "*.tsx"
  → Returns results (sandbox FS reflects CRDT state)
```

#### CRDT-Managed vs Bypass Routing

Not all files should go through CRDT:

| Path Pattern | Routing | Rationale |
|---|---|---|
| `src/**/*.{tsx,ts,css,json}` | CRDT | Source code — edited by humans and AI |
| `node_modules/**` | Bypass → sandbox FS | Generated, never edited collaboratively |
| `.git/**` | Bypass → sandbox FS | Git internals |
| `dist/**`, `build/**` | Bypass → sandbox FS | Build output |
| `*.png`, `*.jpg`, `*.woff` | Bypass → sandbox FS | Binary files (YText can't represent) |
| `package.json`, `tsconfig.json` | CRDT (optional) | Config files — infrequently concurrent |

The routing can be configured via glob patterns, similar to `.gitignore`.

**Decision triggers:**
- If project file count exceeds 10K: the project index YMap may need sharding or a more scalable index
- If offline support is needed: the project index must sync offline, adding complexity

---

### 7. Prior Art: The "Transparent Collaboration Layer" Pattern

**Finding:** No existing tool implements a CRDT-backed MCP filesystem server. However, the pattern of hiding collaborative infrastructure behind a familiar API is validated by VS Code Live Share (Copilot doesn't know about Fluid Framework), Replit (Agent uses Crosis like any other client), and Google Docs (Apps Script doesn't manage OT state).

**Evidence:** [evidence/prior-art-live-share-cursor.md](evidence/prior-art-live-share-cursor.md)

#### Prior Art Comparison

| System | Writer | Collaboration Layer | Writer Awareness | AI + Collab? |
|--------|--------|-------------------|-----------------|-------------|
| **Replit** | Agent via Crosis | OT protocol | Minimal — uses SDK, doesn't manage OT | **Yes — validated in production** |
| **VS Code Live Share** | Copilot | Fluid Framework | None — uses standard VS Code API | Partially — suggestions only, not direct writes |
| **Cursor 2.0** | Agent via worktrees | Git isolation | None — sees regular files | No — avoids concurrent editing entirely |
| **Bolt.new / Lovable** | Agent via sandbox | None (single-user) | N/A | N/A — no collaboration |
| **OpenDesign (proposed)** | Agent via MCP | Yjs via DirectConnection | **None — sees MCP filesystem** | **Yes — the design in this report** |

The key insight from Replit: they didn't build a special "agent API." They just made the agent use the same protocol as everyone else. OpenDesign should do the same with CRDT — the MCP server is a "CRDT client" that happens to speak MCP to the outside world.

Cursor's worktree approach (branch isolation) is complementary: use the CRDT bridge for real-time property/style changes, use branch isolation for large structural refactors where concurrent merge risk is too high.

**Remaining uncertainty:** How Replit handles the UX when agent and human edits conflict (overlapping regions) is not documented. This is an open design question for OpenDesign as well.

---

### 8. updateYFragment Under Concurrent Mutations: The Clobber Problem

**Finding:** `updateYFragment` (y-prosemirror v1.x) performs a two-way diff between the desired ProseMirror state and the current CRDT state, then mutates the CRDT to match the desired state. When the file watcher applies disk content while an agent has concurrently modified the CRDT, the agent's work is silently overwritten.

**Evidence:** [evidence/updateyfragment-concurrent-mutations.md](evidence/updateyfragment-concurrent-mutations.md)

#### The Algorithm

`updateYFragment` works in three phases:

1. **Left scan:** Match children from left to right until a mismatch is found
2. **Right scan:** Match children from right to left until a mismatch is found
3. **Middle resolution:** For the unmatched middle, delete CRDT children and insert ProseMirror children

All mutations are wrapped in `y.transact(() => { ... }, ySyncPluginKey)`.

#### The Clobber Scenario

Consider three paragraphs `[A, B, C]` on disk. An agent via DirectConnection modifies the CRDT to `[A, B', C, D]` (edits paragraph B and appends paragraph D). Meanwhile, the file watcher reads disk (still `[A, B, C]`) and calls `updateYFragment`:

1. `yChildren` reads CURRENT CRDT state: `[A, B', C, D]`
2. `pChildren` from disk: `[A, B, C]`
3. Left scan: A matches A, B' does NOT match B (different content) -- `left = 1`
4. Right scan: C matches C -- `right = 1`
5. Middle: CRDT has `[B', D]` (2 items), ProseMirror has `[B]` (1 item)
6. Algorithm: B' has same node type as B, so it updates B' in-place with B's content. D has no match, so it is deleted.

**Result: Agent's changes (B' and D) are destroyed.** This is a confirmed clobber path.

#### Why This Matters

This is not a theoretical concern -- it is the default behavior of the standard function that most TipTap/Hocuspocus projects would reach for when implementing file-to-CRDT sync. The function was designed for controlled contexts (initial document load, server-side import where no concurrent editors exist), not for live bidirectional sync with concurrent writers.

#### Transaction Origin

`updateYFragment` uses `ySyncPluginKey` as the transaction origin. This is a ProseMirror PluginKey, not a custom identifier. However, Hocuspocus distinguishes three origin types: `{ source: "connection" }` for WebSocket clients, `{ source: "redis" }` for Redis sync, and `{ source: "local", context?, skipStoreHooks? }` for DirectConnection writes. A file watcher path could use a custom local origin with a context tag (e.g., `{ source: "local", context: { origin: "file-watcher" } }`) -- but this requires NOT using `updateYFragment` directly and instead building a custom sync function that uses the correct Hocuspocus transaction origin.

#### The Three-Way Merge Gap

`updateYFragment` is fundamentally a two-way diff: "make the CRDT look like this ProseMirror node." It has no concept of a common ancestor -- the state the file was in when last written to disk. A three-way merge would require:

1. **Ancestor:** The last state written to disk (snapshot at time of last CRDT → disk persistence)
2. **Theirs:** The current disk content (what the file watcher just read)
3. **Ours:** The current CRDT state (may include agent mutations since the last disk write)

The merge would then apply only the delta between ancestor and theirs to the CRDT, preserving any concurrent mutations between ancestor and ours. No such three-way merge exists in the Yjs/y-prosemirror ecosystem for ProseMirror documents.

#### Mitigation Strategies

| Strategy | Complexity | Effectiveness | Trade-offs |
|----------|-----------|---------------|------------|
| **Skip if CRDT is ahead of disk** — Before calling updateYFragment, compare disk content to last-known-written content. If identical, skip (the watcher is seeing our own write). | Low | Prevents self-clobber (Loop 1) but NOT external-change clobber | Does not handle Cursor editing the file while agent edits CRDT |
| **Content hash gate** — Hash disk content and CRDT-serialized content. Only apply if they differ AND the diff is not a subset of pending CRDT changes. | Medium | Good for Loop 1, partial for concurrent | Requires serializing CRDT to markdown for comparison |
| **Last-written snapshot + three-way merge** — Store the markdown state at each disk write. On file change, three-way merge (last-written vs disk vs CRDT-serialized). | High | Best concurrent safety | Requires building a ProseMirror-aware three-way merge; no off-the-shelf solution exists |
| **Lock-based mutual exclusion** — During agent writes, pause the file watcher. During file watcher updates, queue agent writes. | Medium | Complete prevention | Adds latency; reduces perceived real-time collaboration |
| **CRDT timestamp comparison** — Use Yjs document state vector to detect whether CRDT has been modified since the last disk write. If so, merge instead of overwrite. | Medium-High | Good concurrent safety | Requires understanding Yjs state vectors and building custom merge logic |

**Decision triggers:**
- If the system only needs to prevent self-clobber (own writes echoing back): the content hash gate is sufficient
- If concurrent external edits (Cursor + agent simultaneously) must be safe: three-way merge or lock-based exclusion is required
- If source toggle is the primary use case: lock-based exclusion is simplest (user is explicitly in "source mode" so CRDT writes can be paused)

---

### 9. Feedback Loop Prevention: CRDT → Disk → Watcher → CRDT

**Finding:** Two distinct feedback loops can occur in the bidirectional sync architecture. Both are preventable with a combination of Hocuspocus's `skipStoreHooks` flag and application-level write tracking, but neither is prevented by default.

**Evidence:** [evidence/feedback-loop-prevention.md](evidence/feedback-loop-prevention.md)

#### Loop 1: CRDT → Disk → Watcher → CRDT (Echo Loop)

```
Agent writes CRDT → onStoreDocument → serialize to .md → fs.writeFile
  → @parcel/watcher fires → read .md → updateYFragment → writes to CRDT
  → onChange → onStoreDocument → serialize to .md → ...
```

This loop occurs when the system's own disk writes trigger the file watcher, which then writes the same content back to the CRDT.

**Prevention:** Application-level write tracking. Before writing to disk, record the file path and content hash. When the watcher fires, check if the event matches a tracked write. If so, skip the CRDT update.

#### Loop 2: External → Watcher → CRDT → Disk → Watcher (Persistence Echo)

```
Cursor writes .md → watcher fires → read .md → write to CRDT
  → onChange → onStoreDocument → serialize to .md → fs.writeFile
  → watcher fires → read .md → ...
```

This loop occurs when an external tool writes a file, the watcher syncs it to CRDT, and the resulting CRDT change triggers persistence back to the same file.

**Prevention:** Use Hocuspocus's `skipStoreHooks: true` on the transaction origin when the file watcher writes to the CRDT:

```typescript
conn.transact((doc) => {
  // Apply disk content to CRDT
}, { source: 'local', skipStoreHooks: true, context: { origin: 'file-watcher' } });
```

This prevents the file-watcher-originated CRDT mutation from triggering `onStoreDocument`, breaking the loop.

#### @parcel/watcher Limitations

The `Event` type provides only `{ path: string, type: 'create' | 'update' | 'delete' }`. No PID, no process information, no file handle. There is no way to distinguish our own writes from external writes at the watcher level -- application-level tracking is mandatory.

Events are batched with ~25-50ms coalescing on macOS (FSEvents) and ~0-10ms on Linux (inotify). If our write and an external write occur within the same coalescing window, both arrive in a single batch. Content hash verification (not just timestamp) is necessary for reliable discrimination.

#### Combined Prevention Architecture

```
┌──────────────────────────────────────────────────┐
│                Write Tracker                      │
│  Map<path, { hash, timestamp }>                  │
│                                                   │
│  recordWrite(path, content)  → add to map        │
│  isOwnWrite(path, content)   → check map + hash  │
└──────────┬──────────────────────────┬────────────┘
           │                          │
           ▼                          ▼
  ┌─────────────────┐      ┌─────────────────────┐
  │ CRDT → Disk     │      │ Disk → CRDT         │
  │ (onStoreDoc)    │      │ (file watcher)      │
  │                 │      │                      │
  │ 1. Serialize    │      │ 1. isOwnWrite?      │
  │ 2. recordWrite  │      │    → skip if yes    │
  │ 3. fs.writeFile │      │ 2. Read file        │
  └─────────────────┘      │ 3. transact w/      │
                           │    skipStoreHooks    │
                           └──────────────────────┘
```

**Remaining uncertainty:** Atomic file writes (write to temp file, then rename) may cause @parcel/watcher to report delete+create instead of update. The write tracker must account for both event patterns.

---

### 10. CRDT → Disk Persistence Latency: Sub-500ms Is Feasible

**Finding:** The Hocuspocus debounce configuration is fully parameterizable. Setting `debounce: 200, maxDebounce: 500` achieves sub-500ms CRDT-to-disk latency with no code changes to Hocuspocus. The cost is acceptable for typical document sizes.

**Evidence:** [evidence/crdt-disk-latency-floor.md](evidence/crdt-disk-latency-floor.md)

#### Hocuspocus Debounce Mechanics

```typescript
// Current defaults
{ debounce: 2_000, maxDebounce: 10_000 }

// Proposed for sub-500ms
{ debounce: 200, maxDebounce: 500 }
```

The `debounce` parameter is a trailing-edge timer: each new change resets the timer. The `maxDebounce` is the absolute ceiling since the first change. The debounce implementation (`debounce.ts`) supports these values directly -- `debounce: 0` means immediate execution.

The `saveMutex.runExclusive()` in `storeDocumentHooks` ensures only one save runs at a time per document. If a save takes longer than the debounce interval, the next save waits until the current one completes. This provides natural self-throttling: the system cannot write faster than the storage backend allows.

#### Cost Analysis for 200ms Intervals (10KB Document)

| Step | Time | Notes |
|------|------|-------|
| Yjs binary encoding (`encodeStateAsUpdate`) | ~0.01ms | Sub-millisecond for small docs |
| ProseMirror serialization (CRDT → PM JSON → markdown) | ~2-10ms | Inferred; no published benchmarks |
| `fs.writeFile` (10KB) | ~0.5-2ms | Async, kernel-buffered |
| **Total per write** | **~3-12ms** | |
| **Writes per second** (at 200ms debounce) | **~5/s max** | |
| **CPU overhead** | **~1.5-6%** | 3-12ms every 200ms |

SSD endurance: 10KB * 5 writes/s = 50KB/s = ~1.5TB/year. Well within consumer SSD endurance (600+ TBW).

#### Separating Binary and Markdown Persistence

The architecture naturally supports different cadences:

| Layer | What | Cadence | Cost | Purpose |
|-------|------|---------|------|---------|
| **Layer 1** | Yjs binary (`encodeStateAsUpdate`) | 200ms | ~0.01ms per write | Crash recovery |
| **Layer 2** | Markdown serialization → .md file | 200-500ms | ~3-12ms per write | Cursor interop, source toggle |
| **Layer 3** | Git commit | 30-60s | ~50-200ms per commit | Version history |

Layer 1 and Layer 2 can be separate `onStoreDocument` hooks with independent logic. Layer 1 runs on every call (cheap). Layer 2 can apply its own debounce or skip if content hasn't changed since last write.

**Decision triggers:**
- If source toggle latency must be <200ms: use `debounce: 100, maxDebounce: 200` and verify serialization cost for target document sizes
- If git performance matters: keep git commits at 30-60s regardless of persistence cadence. Git add + commit for a 10KB file is ~50-200ms; at 200ms persistence intervals this would be prohibitive, confirming the need for separate cadences
- If documents exceed 100KB: benchmark serialization cost at that size before committing to sub-500ms persistence

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Coding Agents                         │
│  (Claude Code, Cursor, Codex, Devin, Lovable, etc.)         │
│  Speak: MCP filesystem tools (read_file, write_file, etc.)  │
└────────────────────────┬────────────────────────────────────┘
                         │ MCP Protocol (JSON-RPC)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              CRDT-Backed MCP Filesystem Server               │
│                                                              │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │ Content Ops   │  │ Structure Ops │  │ Search Ops       │  │
│  │ read/write/   │  │ mkdir/delete/ │  │ grep/glob        │  │
│  │ edit          │  │ rename/list   │  │                  │  │
│  └──────┬───────┘  └──────┬────────┘  └──────┬───────────┘  │
│         │                 │                   │              │
│         ▼                 ▼                   ▼              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Diff Engine  │  │ Project     │  │ Sandbox FS          │  │
│  │ (fast-diff)  │  │ Index CRDT  │  │ (search backend)    │  │
│  └──────┬───────┘  └──────┬──────┘  └─────────────────────┘  │
│         │                 │                                   │
│         ▼                 ▼                                   │
│  ┌──────────────────────────────────────────────────────┐    │
│  │          DirectConnection Pool                        │    │
│  │          (Hocuspocus in-process API)                   │    │
│  └──────────────────────┬───────────────────────────────┘    │
└─────────────────────────┼───────────────────────────────────┘
                          │ Yjs binary protocol
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Hocuspocus Server                            │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Yjs Documents│  │ Persistence  │  │ WebSocket Server   │  │
│  │ (in-memory)  │  │ (DB/S3)      │  │                    │  │
│  └──────────────┘  └──────────────┘  └─────────┬──────────┘  │
└────────────────────────────────────────────────┼────────────┘
                                                 │ WebSocket
                          ┌──────────────────────┼──────────┐
                          ▼                      ▼          ▼
                    ┌──────────┐          ┌──────────┐ ┌────────┐
                    │ Visual   │          │ Code     │ │ Other  │
                    │ Editor   │          │ Editor   │ │ Users  │
                    └──────────┘          └──────────┘ └────────┘
```

### Data Flow for write_file

```
Agent: write_file("Button.tsx", newContent)
  │
  ▼
MCP Server: pool.getConnection("Button.tsx")
  │
  ▼
DirectConnection: conn.transact((doc) => {
  │  current = doc.getText("content").toString()
  │  delta = fastDiff(current, newContent) → toYjsDelta()
  │  doc.getText("content").applyDelta(delta)
  │})
  │
  ├──→ Yjs emits "update" event
  │      │
  │      ├──→ Broadcast to WebSocket clients (µs)
  │      │     └──→ Visual editor updates live
  │      │     └──→ Code editor updates live
  │      │
  │      └──→ onChange hook fires
  │            └──→ Debounced persistence (2s)
  │            └──→ Sandbox FS write (for dev server)
  │
  ▼
MCP Server: return { success: true }
```

---

## Limitations & Open Questions

### Not Fully Answered

- **Concurrent edit conflict UX:** When a diff-based agent write overlaps with a concurrent human edit in the same region, Yjs merges at the character level. This may produce syntactically invalid code. Detection (AST parse after merge) is straightforward, but the recovery UX (who gets notified? how to resolve?) is an open design question.

- **Component CRDT ↔ Text CRDT synchronization:** The source-of-truth report recommends a component CRDT as the visual editing substrate. If the visual editor modifies the component CRDT, the text CRDT must be regenerated. This report focuses on the text CRDT layer (what agents interact with). The synchronization between component and text CRDTs is a separate design challenge.

- **Large file performance:** YText `toString()` is O(N) for N characters. For very large files (10K+ lines, 500KB+), the diff computation may add noticeable latency. Benchmark data is needed for files at 1MB+.

- **CRDT document granularity:** Should each file be a separate Yjs document, or should related files (e.g., a component and its styles) share a document? Separate documents provide better isolation but more overhead for operations spanning multiple files.

- **Hocuspocus DirectConnection stability:** Issues #832 (state corruption) and #833 (context not passed) suggest edge cases with DirectConnection. v2.13.2 fixed a critical data loss bug. Production deployment should include thorough edge-case testing.

- **Three-way merge for ProseMirror documents:** No off-the-shelf three-way merge exists for ProseMirror/Yjs documents. Building one requires: (a) storing the last-written-to-disk state as a snapshot, (b) diffing both the snapshot-to-disk and snapshot-to-CRDT directions, (c) combining the diffs while detecting conflicts. This is architecturally possible but represents significant implementation effort. The closest existing work is git's patience diff applied to ProseMirror nodes (mentioned in a Yjs Community discussion where a user patched y-prosemirror with a custom patience-diff variant).

- **Markdown serialization benchmarks:** The 2-10ms estimate for serializing a 10KB ProseMirror document to markdown is inferred from typical JSON serialization costs, not measured. Actual benchmarks are needed before committing to sub-200ms persistence intervals, especially for documents with complex node structures (tables, code blocks, nested lists).

- **y-prosemirror v2.0.0 delta-based approach:** The local repository contains y-prosemirror v2.0.0 which replaces `updateYFragment` with a fundamentally different delta diff/apply approach. The v2 sync plugin computes a delta between the Y.Type's deep delta representation and the ProseMirror node delta, then applies it via `ytype.applyDelta()`. Whether this new approach has the same clobbering characteristics under concurrent mutations has not been analyzed.

### Out of Scope (per Rubric)

- Implementing the MCP server (deferred to spec/implementation phase)
- Designing the component CRDT schema
- UI/UX for conflict resolution
- Choosing specific parser/printer libraries for code generation

---

## References

### Evidence Files
- [evidence/crosis-agent-writes.md](evidence/crosis-agent-writes.md) — Replit Crosis source code analysis: channel multiplexing, write path, bot/agent handling
- [evidence/hocuspocus-direct-connection.md](evidence/hocuspocus-direct-connection.md) — Hocuspocus DirectConnection API, latency, propagation, lifecycle, test cases
- [evidence/translation-layer-design.md](evidence/translation-layer-design.md) — Three translation strategies evaluated, diff-based flow, YText API for programmatic edits
- [evidence/agent-reads-code-generation.md](evidence/agent-reads-code-generation.md) — Read strategies, freshness guarantees, connection pooling
- [evidence/string-replacement-edits.md](evidence/string-replacement-edits.md) — String replacement → YText mapping, multi-edit batching, concurrency safety
- [evidence/non-crdt-file-operations.md](evidence/non-crdt-file-operations.md) — Directory/rename/delete operations, project index, search routing
- [evidence/prior-art-live-share-cursor.md](evidence/prior-art-live-share-cursor.md) — VS Code Live Share, Cursor worktrees, Replit Agent, transparent collaboration pattern
- [evidence/updateyfragment-concurrent-mutations.md](evidence/updateyfragment-concurrent-mutations.md) — updateYFragment source code trace, clobber scenario analysis, transaction origins, three-way merge gap
- [evidence/crdt-disk-latency-floor.md](evidence/crdt-disk-latency-floor.md) — Hocuspocus debounce configuration, serialization cost analysis, SSD write amplification, separated persistence layers
- [evidence/feedback-loop-prevention.md](evidence/feedback-loop-prevention.md) — @parcel/watcher event limitations, write tracking patterns, skipStoreHooks for loop prevention

### External Sources
- [Hocuspocus GitHub](https://github.com/ueberdosis/hocuspocus) — Collaboration server source code
- [Yjs GitHub](https://github.com/yjs/yjs) — CRDT implementation source code
- [Crosis GitHub](https://github.com/replit/crosis) — Replit client SDK source code
- [Y.Text API Docs](https://docs.yjs.dev/api/shared-types/y.text) — YText documentation
- [Making Repl.it Collaborative at Heart](https://blog.replit.com/collab) — Replit OT architecture
- [Replit Agent Case Study](https://www.langchain.com/breakoutagents/replit) — Replit Agent multi-agent architecture
- [Cursor 2.0 Changelog](https://cursor.com/changelog/2-0) — Cursor worktree isolation for agents
- [Fluid Framework FAQ](https://fluidframework.com/docs/faq) — Microsoft's collaboration framework (used by VS Code Live Share)
- [Hocuspocus DirectConnection Issue #832](https://github.com/ueberdosis/hocuspocus/issues/832) — State corruption bug (fixed)
- [Hocuspocus DirectConnection Issue #833](https://github.com/ueberdosis/hocuspocus/issues/833) — Context passing bug (fixed)
- [fast-diff npm](https://www.npmjs.com/package/fast-diff) — Character-level diff library for Yjs
- [diff-match-patch](https://github.com/google/diff-match-patch) — Google's diff library (alternative to fast-diff)
- [MCP Filesystem Server](https://github.com/modelcontextprotocol/servers) — Official MCP filesystem server
- [y-prosemirror GitHub](https://github.com/yjs/y-prosemirror) — ProseMirror editor binding for Yjs (source of updateYFragment)
- [y-prosemirror sync-plugin.js (v1.x)](https://github.com/yjs/y-prosemirror/blob/25cea84874eace50745fd2433847aabceef92b65/src/plugins/sync-plugin.js) — updateYFragment implementation
- [@parcel/watcher GitHub](https://github.com/parcel-bundler/watcher) — Native C++ file watcher with batched events
- [Yjs encodeStateAsUpdate Performance (Issue #675)](https://github.com/yjs/yjs/issues/675) — Binary encoding benchmark data
- [updateYFragment Algorithm Accuracy (Yjs Community)](https://discuss.yjs.dev/t/y-prosemirror-updateyfragment-algorithm-accuracy/1273) — Discussion of diff algorithm aggressiveness
- [Server-Side YDoc Content Replacement (Yjs Community)](https://discuss.yjs.dev/t/how-to-replace-prosemirror-content-in-ydoc-on-server-side/2625) — Dmonad's guidance on server-side content replacement
- [Hocuspocus v4 Release Notes](https://github.com/ueberdosis/hocuspocus/blob/main/RELEASE_NOTES_V4.md) — skipStoreHooks flag and store hook changes

### Related Research
- [~/reports/ai-coding-agent-tool-surfaces/](../ai-coding-agent-tool-surfaces/) — Covers 11 agents' tool surfaces in detail; informs the "what operations must the MCP server support" question
- [~/reports/source-of-truth-persistence-collaboration/](../source-of-truth-persistence-collaboration/) — Recommends the CRDT-authoritative model and dual-layer architecture; the MCP bridge operates on the text layer of this architecture
