# Evidence: Non-CRDT File Operations (mkdir, delete, rename, glob)

**Dimension:** What about file operations that don't map to CRDT document mutations?
**Date:** 2026-03-21
**Sources:** MCP filesystem server API, Hocuspocus architecture, agent-tool-surfaces report §9

---

## Key files referenced

- Agent-tool-surfaces report §9: MCP Tool Surface (11 tools)
- Source-of-truth report §8: Layered architecture (CRDT → sandbox FS → git)
- Hocuspocus document naming conventions

---

## Findings

### Finding: File operations fall into two categories — content operations (CRDT-backed) and structure operations (filesystem-backed)
**Confidence:** INFERRED
**Evidence:** Analysis of MCP filesystem server's 11 tools against what can be represented as CRDT documents:

| Operation | Category | CRDT-Backed? | Rationale |
|-----------|----------|-------------|-----------|
| `read_file` | Content | Yes | Read from YText |
| `write_file` | Content | Yes | Diff → YText delta |
| `edit_file` | Content | Yes | indexOf → delete/insert on YText |
| `read_multiple_files` | Content | Yes | Batch read from multiple YTexts |
| `create_directory` | Structure | No | Directories are filesystem constructs, not documents |
| `list_directory` | Structure | Hybrid | List CRDT document names matching path prefix |
| `directory_tree` | Structure | Hybrid | Recursive list of document names |
| `move_file` | Structure | Hybrid | Rename CRDT document + update references |
| `search_files` | Navigation | Hybrid | Search CRDT document names by pattern |
| `get_file_info` | Metadata | Hybrid | Synthesize from CRDT state |
| `list_allowed_directories` | Config | No | Static configuration |

**Implications:** The MCP server needs a dual-backend: CRDT layer for content operations, filesystem/metadata layer for structure operations.

### Finding: Directory structure can be derived from CRDT document naming conventions
**Confidence:** INFERRED
**Evidence:** Hocuspocus documents are identified by name (string). If document names follow filesystem paths (e.g., `"src/components/Button.tsx"`), the directory structure is implicit:

```javascript
// list_directory("src/components/")
const allDocs = hocuspocus.getDocumentNames()  // Hypothetical API
const matching = allDocs.filter(name => name.startsWith("src/components/") &&
  !name.slice("src/components/".length).includes("/"))
```

However, Hocuspocus does NOT have a built-in `getDocumentNames()` API. The server tracks in-memory documents but not all possible documents (those only in storage aren't listed).

**Alternative:** Maintain a separate directory index (YMap or external data structure) that tracks which files exist:

```javascript
// Project-level CRDT document for file tree
const fileTree = doc.getMap("fileTree")
// fileTree structure: { "src/components/Button.tsx": { size: 1234, mtime: "..." }, ... }
```

**Implications:** A dedicated "project index" CRDT document should track the file tree. Content operations go to individual document CRDTs. Structure operations go to the project index.

### Finding: create_directory is a no-op in a CRDT-backed filesystem
**Confidence:** INFERRED
**Evidence:** Directories don't have content — they exist implicitly when files exist within them. In the CRDT model:

- `create_directory("src/utils/")` → Record in project index that directory exists (for empty directory support)
- Or simply: directories exist implicitly when listing document names that match the prefix

Most agents don't create empty directories — they create files, and the directory structure is implied. The MCP server can return success for `create_directory` as a no-op (or record in the project index for completeness).

**Implications:** Simplest approach: `create_directory` always succeeds. Directory existence is derived from file presence.

### Finding: delete_file requires CRDT document deletion, not just content clearing
**Confidence:** INFERRED
**Evidence:** Deleting a file means removing the CRDT document entirely. Hocuspocus doesn't have a built-in "delete document" API — documents are created on first access and unloaded when no connections remain.

To delete:
1. Remove from project index (YMap)
2. Clear the CRDT document content (or mark as deleted)
3. Remove from persistence backend (database/S3)
4. Delete from sandbox filesystem

```javascript
async function deleteFile(path: string) {
  // 1. Remove from project index
  const indexConn = await pool.getConnection("_project_index")
  await indexConn.transact((doc) => {
    doc.getMap("fileTree").delete(path)
  })

  // 2. Clear CRDT document (optional — or let it be garbage collected)
  const fileConn = await pool.getConnection(path)
  await fileConn.transact((doc) => {
    const ytext = doc.getText("content")
    ytext.delete(0, ytext.toString().length)
  })
  await fileConn.disconnect()

  // 3. Remove from persistence (implementation-specific)
  await persistenceBackend.deleteDocument(path)

  // 4. Remove from sandbox FS
  await sandboxFs.unlink(path)
}
```

**Implications:** File deletion is more complex than read/write because it spans multiple systems. The MCP server must coordinate CRDT cleanup, persistence cleanup, and sandbox filesystem cleanup.

### Finding: move_file/rename requires CRDT document migration
**Confidence:** INFERRED
**Evidence:** CRDT documents are identified by name. Renaming `Button.tsx` to `PrimaryButton.tsx` requires:

1. Read content from old document
2. Create new document with new name
3. Write content to new document
4. Delete old document
5. Update project index

There's no atomic rename in Hocuspocus. This must be implemented as a multi-step operation with the risk of partial failure.

**Implications:** Rename is the most complex non-content operation. Consider implementing as: copy content → update index → delete old. The agent sees it as atomic (MCP call returns after all steps complete).

### Finding: search_files (glob) and grep operate on the project index and CRDT content respectively
**Confidence:** INFERRED
**Evidence:** Two search types:

- **Path search (glob):** Query the project index for matching document names. Fast — index is a YMap.
- **Content search (grep):** Must scan CRDT documents. Options:
  - Scan all in-memory documents (fast but incomplete — only loaded docs)
  - Scan persistence backend (complete but slower)
  - Maintain a search index (best for large projects)

For the MCP server, content search is the hardest operation to make performant over CRDT-backed storage. A pragmatic approach: fall back to the sandbox filesystem for content search (since sandbox FS mirrors CRDT content).

**Implications:** Content search (grep) should use the sandbox filesystem as the search index, not the CRDT layer directly. The CRDT → sandbox sync ensures the filesystem is up-to-date. This avoids building a separate search index.

### Finding: Some operations should bypass CRDT entirely
**Confidence:** INFERRED
**Evidence:** Not all files in a project are CRDT-managed:

| File Type | CRDT-Managed? | Rationale |
|-----------|-------------|-----------|
| Source code (.tsx, .ts, .css) | Yes | Edited by humans and AI |
| package.json | Maybe | Edited by agents, rarely concurrent |
| node_modules/* | No | Generated by npm, never edited |
| .git/* | No | Git internals, never edited |
| Build output (dist/*) | No | Generated artifacts |
| Binary files (images, fonts) | No | Not text, can't use YText |
| Config files (.env, tsconfig.json) | Maybe | Infrequently edited |

**Implications:** The MCP server needs a routing layer: CRDT-managed paths go through DirectConnection; other paths go directly to the sandbox filesystem. The routing can be configured via patterns (e.g., `src/**/*.{tsx,ts,css}` → CRDT, everything else → sandbox FS).

---

## Gaps / follow-ups

* **Hocuspocus document enumeration:** No built-in API to list all documents (in-memory or persisted). The project index workaround is necessary.
* **Atomic rename:** No CRDT-level atomic rename. Multi-step implementation has partial failure risk.
* **Large project scaling:** A project index YMap with 10K+ files may have performance implications. Benchmark needed.
