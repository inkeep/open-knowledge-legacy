---
"@inkeep/open-knowledge": patch
---

fix(rename): preserve file content when renaming via the sidebar.

Renaming a file via the sidebar inline-rename (right-click → Rename, or F2) was erasing the file content on disk: the editor showed an empty placeholder under the new name, and the original content survived only in the renaming tab's IndexedDB cache (which is why renaming back made it "reappear"). Cold reloads or other tabs/clients saw the renamed file as empty.

Two layered fixes:

- `FileTree` ignores selection-change events whose docName isn't yet in the local `documents` list. `@pierre/trees` fires `onSelectionChange` synchronously when an inline rename commits — before the rename API has written the file at the new path — and the resulting premature navigation was opening a server-side Y.Doc against a missing file, which the persistence layer subsequently flushed back to disk as 0 bytes.
- `persistence.onStoreDocument` refuses to materialize a 0-byte file when the Y.Doc was never confirmed to exist on disk AND the serialized markdown is empty. This blocks accidental orphan files from any code path that opens a Y.Doc for a non-existent docName (browser races, `/api/document?docName=<missing>`, MCP queries on deleted docs, future callers). Legitimate first-write paths (`/api/create-page`, agent writes via `/api/agent-write-md`) are unaffected.
