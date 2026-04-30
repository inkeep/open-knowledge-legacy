# Run: 2026-04-22-initial

**Status:** Active
**Owner:** research orchestrator (this Claude instance)
**Started:** 2026-04-22

## Purpose

Gather evidence for the streaming-upload-refactor report. D1 anchored; dispatching parallel subagents for D2 (peer-editor upload architecture survey) and D3-D6 (Node.js/Bun streaming primitives + SHA-256 + temp lifecycle + error paths). D7-D9 synthesized by orchestrator from primary-source evidence captured in D2-D6.

## Rubric delta (this run)

Covering dimensions D1-D9 end-to-end in a single pass. D1 is already captured by the orchestrator. This run's subagent work produces the remaining evidence files.

## Source anchors (do not re-discover)

### Peer editors — open-source repos to inspect

| Editor | Repo URL | Upload-relevant paths |
|---|---|---|
| Outline | https://github.com/outline/outline | `server/routes/api/attachments/` ; `server/commands/attachment*`  |
| AFFiNE | https://github.com/toeverything/AFFiNE | `packages/backend/server/src/core/storage/` ; `packages/backend/server/src/plugins/storage/` ; `tools/cli` ; blob service |
| Docmost | https://github.com/docmost/docmost | `apps/server/src/core/attachment/` |
| HedgeDoc | https://github.com/hedgedoc/hedgedoc | `lib/web/middleware/` ; `public/js/lib/` ; image-upload controller |
| SilverBullet | https://github.com/silverbulletmd/silverbullet | `server/http_server.ts` (Deno) ; `plugos/syscalls/` |
| TinaCMS | https://github.com/tinacms/tinacms | `packages/@tinacms/app` ; `packages/@tinacms/graphql` ; media handlers |
| Obsidian / Logseq / Foam / Dendron / Zettlr | (for each: confirm OS-file-copy via drag-drop; NO HTTP upload) — cite Obsidian Developer Docs, Logseq source for `drop` handlers |

### Node.js streaming primitives — docs + source

| Lib | Primary docs | Source of truth |
|---|---|---|
| busboy | https://github.com/mscdex/busboy | README for streaming API; no internal buffering of file part |
| multer | https://github.com/expressjs/multer | `storage/disk.js` for the DiskStorage streaming pattern |
| @fastify/multipart | https://github.com/fastify/fastify-multipart | README + `lib/*` for the `saveRequestFiles()` helper |
| formidable | https://github.com/node-formidable/formidable | `src/File.js` (writes to disk by default) |
| Bun.Request.formData() | https://bun.sh/docs/api/http | Memory semantics docs; File is a Blob |
| hapi @hapi/busboy | https://github.com/hapijs/nes | less relevant — included for completeness |

### SHA-256 streaming patterns

- Node.js stdlib: `require('node:crypto').createHash('sha256')` — is writable/duplex? (spoiler: it's a Hash that accepts `.update(chunk)` AND supports `.pipe()` when wrapped). Cite official docs.
- `stream.pipeline(source, hashTransform, writeStream)` — how errors propagate.
- OSS examples: `minio-js` `Client.putObject` streaming path; `aws-sdk-js-v3` `@aws-sdk/lib-storage` `Upload` class; `git-lfs` pre-push hash.

### Temp-file lifecycle

- OS tmp (`os.tmpdir()`) — cross-device `rename` fails with `EXDEV`.
- `<contentDir>/.open-knowledge/tmp/` — same-filesystem rename works, visible to server-lock cleanup.
- Orphan recovery: server startup scan + age-based cleanup. Cite multer's `DiskStorage` pattern + seaweedfs's tempfile policy.

### Error paths

- `ENOSPC` — how busboy + multer + @fastify/multipart surface disk-full.
- Aborted uploads — `req.on('aborted')` vs `req.on('close')` with `!req.complete` in Node 18+.
- Malformed multipart — busboy's `Unexpected end of form` emission.

## Worker output contract

Each subagent returns:

1. **Confirmed findings** (CONFIRMED / INFERRED / UNCERTAIN / NOT FOUND) with file:line or URL citation.
2. **Code snippets** (short, <10 lines) proving each finding.
3. **Gaps** — what couldn't be found and what was searched.
4. **Tensions** — where sources disagree; orchestrator resolves during synthesis.

Workers do NOT write files to the run folder or evidence/. They return structured Markdown; orchestrator captures evidence.

## Coverage tasks (parent-owned)

- [ ] D1 — Current-state anchor (DONE — orchestrator captured)
- [ ] D2 — Peer-editor upload architecture survey (subagent 1)
- [ ] D3 — Node.js/Bun streaming multipart primitives (subagent 2)
- [ ] D4 — On-the-fly SHA-256 patterns (subagent 2)
- [ ] D5 — Temp-file lifecycle (subagent 2)
- [ ] D6 — Error paths (subagent 2)
- [ ] D7-D9 — Integration + config shape + perf (orchestrator synthesis after D2-D6)
