# Evidence: Agent Reads — Generating Code from CRDT on Demand

**Dimension:** How do you handle agent reads? Generate on demand or serve cached?
**Date:** 2026-03-21
**Sources:** Yjs API, Hocuspocus architecture, prerequisite reports (source-of-truth, agent-tool-surfaces)

---

## Key files referenced

- `~/.claude/oss-repos/yjs/src/ytype.js:1318` — YText.toString() for text retrieval
- `~/.claude/oss-repos/hocuspocus/packages/server/src/DirectConnection.ts:29-44` — transact() for reading
- Source-of-truth report §4: Dual-layer architecture (component CRDT + text CRDT)
- Agent-tool-surfaces report §8: How agents read files (line ranges, formats)

---

## Findings

### Finding: Two architectures produce different read strategies
**Confidence:** INFERRED
**Evidence:** Synthesis of the source-of-truth report's dual-layer model and agent tool surface requirements.

**Architecture 1 — Text CRDT as source of truth (simpler):**
The file's text content lives in a Yjs YText. Reading is trivial: `ytext.toString()`.

```
Agent: read_file("Button.tsx")
  → directConnection.transact((doc) => {
      return doc.getText("content").toString()
    })
  → Return text content to agent
```

- **Latency:** ~µs (in-memory string concatenation)
- **Freshness:** Always current (reads from live CRDT state)
- **No generation step:** Text IS the content

**Architecture 2 — Component CRDT as source of truth (dual-layer):**
Component properties live in YMap/YArray. Source code must be GENERATED from them.

```
Agent: read_file("Button.tsx")
  → directConnection.transact((doc) => {
      const componentModel = doc.getMap("components").get("Button")
      return generateTsx(componentModel)  // AST generation + Prettier
    })
  → Return generated code to agent
```

- **Latency:** ~ms (AST construction + code printing)
- **Freshness:** Always current (generates from live CRDT state)
- **Consistency risk:** Generated code may differ from what agents wrote (reformatting, comment stripping)

**Implications:** Architecture 1 is strongly recommended for the MCP bridge because it preserves round-trip fidelity — agents read back exactly what they (or others) wrote. Architecture 2 introduces format divergence that breaks agent edit patterns (exact string matching fails when code is reformatted).

### Finding: Read-after-write consistency is guaranteed by in-process DirectConnection
**Confidence:** CONFIRMED
**Evidence:** DirectConnection operates on the same in-memory Yjs Doc instance. After `transact()` completes (write), subsequent `transact()` (read) sees the updated state immediately. No network round-trip, no propagation delay.

```
write_file("Button.tsx", newContent)  → transact: apply delta to YText
read_file("Button.tsx")               → transact: ytext.toString()
// Guaranteed to return newContent (plus any concurrent edits merged by Yjs)
```

**Implications:** No caching layer needed between the MCP server and Hocuspocus. The DirectConnection IS the fast path.

### Finding: Partial reads (line ranges) require string splitting, not special CRDT operations
**Confidence:** CONFIRMED
**Evidence:** Agent-tool-surfaces report §8 — 7 of 11 agents support partial reads with line offsets. YText has no line-aware API. Implementation:

```javascript
const fullText = ytext.toString()
const lines = fullText.split('\n')
const requested = lines.slice(offset, offset + limit)
return requested.map((line, i) => `${offset + i + 1}\t${line}`).join('\n')
```

For Claude Code specifically, the response must be in `cat -n` format (spaces + line number + tab + content).

**Implications:** The MCP server handles line splitting in the response formatting layer, not in the CRDT layer. This is a thin wrapper — no CRDT complexity.

### Finding: File metadata (size, mtime) can be synthesized from CRDT state
**Confidence:** INFERRED
**Evidence:** Agents occasionally request file metadata via `get_file_info`. Since the file is virtual:

- **size:** `Buffer.byteLength(ytext.toString(), 'utf8')`
- **mtime:** Track last update timestamp in CRDT metadata or Hocuspocus onChange hook
- **type:** Derived from file extension in the document name

**Implications:** Metadata requests don't require actual filesystem stat calls — they can be computed from CRDT state.

### Finding: Caching is unnecessary but document connection pooling is valuable
**Confidence:** INFERRED
**Evidence:** `toString()` on a YText with N characters is O(N) — it traverses the linked list of Items. For typical source files (< 10K lines), this is sub-millisecond. Caching the string would introduce staleness risks without meaningful performance gain.

However, opening/closing DirectConnections has overhead (document lifecycle hooks). The MCP server should maintain a pool of open DirectConnections for active documents, with idle timeout for cleanup.

**Implications:** Connection pooling pattern:
```javascript
class CRDTConnectionPool {
  private connections = new Map<string, DirectConnection>()

  async getConnection(documentName: string): Promise<DirectConnection> {
    if (!this.connections.has(documentName)) {
      const conn = await hocuspocus.openDirectConnection(documentName)
      this.connections.set(documentName, conn)
    }
    return this.connections.get(documentName)!
  }

  async release(documentName: string) {
    const conn = this.connections.get(documentName)
    if (conn) {
      await conn.disconnect()
      this.connections.delete(documentName)
    }
  }
}
```

---

## Gaps / follow-ups

* **Binary files:** Agents may try to read image files or other binaries. These bypass the CRDT entirely — served from sandbox filesystem or object storage.
* **Very large files:** Files > 100KB may have noticeable toString() overhead. Benchmark needed for files at 1MB+.
* **Encoding:** YText stores UTF-16 internally. Agent expectations vary (most assume UTF-8). The MCP server must handle encoding correctly.
