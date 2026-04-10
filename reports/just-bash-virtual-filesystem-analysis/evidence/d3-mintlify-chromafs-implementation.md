# Evidence: How Mintlify ChromaFs Uses just-bash

**Dimension:** D3 — ChromaFs implementation pattern
**Date:** 2026-04-02
**Sources:** https://www.mintlify.com/blog/how-we-built-a-virtual-filesystem-for-our-assistant, X posts from Malte Ubl (@cramforce) and Dens Sumesh (@densumesh)

---

## Key sources referenced

- Mintlify blog: "How we built a virtual filesystem for our Assistant" (2026-04-02)
- X post by Malte Ubl confirming "Mintlify assistant is powered by just-bash with a custom filesystem"
- Existing report: `mintlify-karpathy-workflow-deep-dive/` for broader context

---

## Findings

### Finding: ChromaFs implements IFileSystem backed by Chroma vector database
**Confidence:** CONFIRMED
**Evidence:** Mintlify blog post (2026-04-02)

Architecture: just-bash provides the shell environment; ChromaFs translates every IFileSystem call into a Chroma query. "just-bash exposes a pluggable IFileSystem interface, so it handles all the parsing, piping, and flag logic while ChromaFs translates every underlying filesystem call into a Chroma query."

### Finding: ChromaFs bootstraps from a gzipped path tree, not lazy discovery
**Confidence:** CONFIRMED
**Evidence:** Mintlify blog post

At startup, ChromaFs fetches a gzipped JSON document (`__path_tree__`) from the Chroma collection containing the entire file hierarchy. This creates:
- A `Set<string>` of all file paths
- A `Map<string, string[]>` mapping directories to their children
- Each entry includes `isPublic` (boolean) and `groups` (permission array for RBAC)

This means `readdir()`, `exists()`, `getAllPaths()`, `find`, and `ls` operate entirely in-memory with zero network calls after initialization.

### Finding: cat resolves to chunk-reassembly from Chroma
**Confidence:** CONFIRMED
**Evidence:** Mintlify blog post

"Pages in Chroma are split into chunks for embedding, so when the agent runs `cat /auth/oauth.mdx`, ChromaFs fetches all chunks with a matching page slug, sorts by `chunk_index`, and joins them into the full page."

Results are cached so repeated reads (common during grep workflows) never hit the database twice.

### Finding: grep uses a two-stage coarse-filter/fine-filter strategy
**Confidence:** CONFIRMED
**Evidence:** Mintlify blog post

"ChromaFs intercepts grep, parses flags with yargs-parser, and translates them into Chroma queries."

Stage 1 (Coarse filter): Chroma query identifies candidate files containing search terms or regex patterns.
Stage 2 (Fine filter): Actual regex matching against bulkPrefetched results cached in Redis.

This enables "large recursive queries to complete in milliseconds."

### Finding: All write operations throw EROFS
**Confidence:** CONFIRMED
**Evidence:** Mintlify blog post

"Every write operation throws an EROFS (Read-Only File System) error. The agent explores freely but can never mutate documentation." This makes the system stateless — no session cleanup, no risk of one agent corrupting another's view.

### Finding: RBAC via path pruning, not Linux permissions
**Confidence:** CONFIRMED
**Evidence:** Mintlify blog post

"ChromaFs prunes slugs using the current user's session token before building the file tree. Unauthorized paths become entirely invisible to the agent—they cannot be accessed or even referenced."

This is a user-space access control model where the filesystem view itself changes per user, rather than returning permission errors on access.

### Finding: Lazy file pointers for large OpenAPI specs
**Confidence:** CONFIRMED
**Evidence:** Mintlify blog post

Large OpenAPI specifications stored in customer S3 buckets are registered as lazy file pointers that "only fetch when it runs cat" — matching just-bash's LazyFileProvider pattern.

### Finding: Performance — p90 boot time ~100ms, zero marginal compute per conversation
**Confidence:** CONFIRMED
**Evidence:** Mintlify blog post

Replacing container-based sandboxes with ChromaFs:
- P90 session creation: ~46 seconds → ~100 milliseconds
- Marginal compute cost per conversation: ~$0 (reuses existing database infrastructure)
- Scale: 30,000+ daily conversations across 850,000 monthly interactions

---

## Gaps / follow-ups

* ChromaFs is closed-source — implementation details are from blog post only
* How ChromaFs handles stat() metadata (mtime, size) not documented
* Whether ChromaFs implements readdirWithFileTypes for performance not mentioned
* Whether ChromaFs uses just-bash's defineCommand for custom grep or patches at the IFileSystem level
