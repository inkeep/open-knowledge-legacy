# Evidence: D8 — User-facing config shape post-refactor

**Dimension:** What happens to `upload.maxBytes`, `/api/upload-config` response, P1.3 scenario, and the client dedup-toast UX after streaming removes the OOM-guard rationale.
**Date:** 2026-04-22
**Sources:** D2 (peer survey), D7 (dedup integration), OK SPEC §3 NG6 + §6 FR-5 + §13 P1.3, D1 (current-state).

---

## Current user-facing surface (pre-refactor)

- **`packages/cli/src/config/schema.ts:63`** — `upload.maxBytes: z.number().int().min(0).default(DEFAULT_MAX_UPLOAD_BYTES)`. Default 25 MB.
- **`packages/server/src/api-extension.ts`** — config passed into `readUploadBody(req, maxBytes)` as `limits.fileSize` for busboy. On exceed: 413 with `{ error: 'max-bytes', attemptedBytes, maxBytes, message }`.
- **`packages/app/src/editor/image-upload/index.ts:181, 273, 338-346`** — client reads `maxBytes` from `/api/upload-config`, formats the byte-specific rejection toast: `"File is 30 MB but the upload limit is 25 MB."`
- **SPEC P1.3** — dedicated E2E scenario for oversized-file rejection. "The only rejection path post-D-M."
- **SPEC §3 NG6** — `upload.maxBytes: 25 MB default` documented with revisit trigger "100MB+ video assets forcing Git LFS."

---

## Peer evidence on user-facing caps (from D2)

- **Obsidian, Logseq (local), Foam, Zettlr:** no cap (local-first, OS FS).
- **Outline:** 1 MB default, env-tunable. Server never touches bytes — cap is S3 policy + pre-signed metadata check.
- **Docmost:** 50 MB default, env-tunable. Streaming to storage.
- **AFFiNE:** per-workspace quota (not a size cap per-file); 500 KB generic fallback.
- **HedgeDoc:** cap not located; v1 had `uploads.max_size`.
- **SilverBullet:** NO cap at all. `io.ReadAll` without `MaxBytesReader`.
- **TinaCMS:** NO cap (no `limits:` on multer).

**Synthesis:** Among peers, caps cluster at 1 MB → 50 MB. Two peers (SilverBullet, TinaCMS) ship with no cap — both depend on reverse-proxy limits. **Docmost is the only peer that streams AND caps** — the architecturally clean model.

---

## User's directive

Quote: "what does maxBytes do again? what would happen if we just remove that? it's in a user's own computer. do other editors set max sizes or similar?"

The question is about user-facing cap removal. Key context: OK is a local-first editor running on the user's own machine.

---

## Three options

### Option X: Remove `upload.maxBytes` config + P1.3 scenario + client toast entirely. Internal-only memory-safety constant.

- `upload.maxBytes` deleted from Zod schema, `/api/upload-config` response, client `UploadConfig` type, byte-size toast formatter, P1.3 scenario from `evidence/e2e-acceptance-scenarios.md` and `tmp/ship/qa-progress.json` (QA-003).
- Internal: busboy `limits.fileSize` set to a conservative constant (e.g. 10 GB) — purely a process-memory backstop. Streaming means 10 GB costs no memory; the backstop only fires on adversarial/buggy clients uploading infinite streams. User-invisible.
- Client: on 413, show generic "Upload failed" toast (or still surface `attemptedBytes` + a generic ceiling for debuggability — but not configurable by user).
- P1.3 scenario: deleted. "No rejection path" is now literally true.

**Peer match:** Closest to Obsidian / Logseq — no user-facing cap.

### Option Y: Remove config but keep a sensibly-large default (say 5 GB) + keep the 413 response shape for diagnostic honesty.

- `upload.maxBytes` still exists in config, default raised to 5 GB. In practice no user hits it.
- `/api/upload-config` still exposes the field.
- Client toast still formatted with size + limit.
- P1.3 scenario retained but effectively never triggers in realistic usage.

**Peer match:** Similar to Docmost's 50 MB default, just higher.

### Option Z: Keep current 25 MB default.

- Status quo. Rationale ("memory-safety guard") was true pre-streaming; post-streaming, rationale disappears. Keeping a user-facing cap without architectural need is friction.

---

## Recommendation

**Option X.** Rationale:

1. **Architectural alignment:** Streaming eliminates the OOM rationale. Keeping a user-facing cap after the underlying justification disappears is deferred tech debt by the user's own definition ("NO DEFERRED TECH DEBT").
2. **Local-first alignment:** OK's product positioning is local-first ("user's own computer"). Every local-first peer (Obsidian, Logseq, Foam, Zettlr) has no cap. OK's client-server architecture is an implementation detail; from the user's POV they're running their own editor on their own laptop.
3. **SPEC §3 NG6 revisit trigger was "100MB+ video forcing Git LFS."** That trigger describes a sync/Git concern, not an upload concern. Removing `maxBytes` from upload doesn't change the Git LFS story; the user can still hit LFS limits at `git push` time, but that's a different subsystem.
4. **Removing the field simplifies the config surface.** `/api/upload-config` goes from 6 fields to 5: `attachmentFolderPath, emitFormat, dedup, wikiEmbedExtensions` (plus a hint that dedup has sub-fields). Cleaner user mental model.

**Internal backstop:** busboy `limits.fileSize = Number.POSITIVE_INFINITY` effectively (or a pathologically-large constant like 1 TB). Rationale: the only remaining reason for a memory-safety cap is "adversarial client streams forever" — which still takes disk, not memory, and the orphan-recovery (D5) cleans up the tempfile. A "1 TB stream finally crashes the disk" scenario is symmetric to a user dropping a 1 TB file — neither should happen, but both have natural failure modes that aren't application-layer concerns. We can still set an `Number.MAX_SAFE_INTEGER` default for busboy's own bookkeeping without surfacing it.

**What this removes:**

| Surface | Before | After |
|---|---|---|
| `upload.maxBytes` Zod field | `z.number().int().min(0).default(25*1024*1024)` | ❌ removed |
| `/api/upload-config` response | Includes `maxBytes` | No `maxBytes` field |
| Client `UploadConfig` type | `maxBytes?: number` | ❌ removed |
| Client byte-size toast | `"File is 30 MB but the upload limit is 25 MB."` | generic `"Upload failed"` on rare 413 |
| SPEC P1.3 scenario | "Drop exceeds maxBytes — byte-size-specific rejection" | ❌ removed (scenario deleted from `evidence/e2e-acceptance-scenarios.md`) |
| QA-003 scenario in `qa-progress.json` | validated, covers P1.3 | ❌ removed |
| `packages/server/src/api-extension.ts` | `max-bytes` error class + 413 reason | Keep internal; just don't surface `attemptedBytes/maxBytes` payload |
| Docs site `configuration.mdx` | upload table row for `maxBytes` | ❌ removed |
| Docs site `assets-and-embeds.mdx` | mention of 25 MB limit | ❌ removed |

**What this keeps:**

- Internal `UploadWriteError` union still classifies `payload-too-large` for adversarial/pathological streams (untested error class; surface rarely hit).
- All other upload errors (`storage-full`, `storage-readonly`, `malformed-upload`) behave identically.

---

## Client dedup-toast UX (SPEC D-B) — unchanged

Dedup toast is independent of maxBytes. Streaming refactor does not touch dedup; Option X removes only the rejection-toast path. Dedup continues to fire `"Already at <path> — reusing."` per D-B LOCKED.

---

## Key files / references

- OK internal: `packages/cli/src/config/schema.ts:63`, `packages/app/src/editor/image-upload/index.ts:181, :273, :338-346`, `packages/server/src/api-extension.ts`
- SPEC: `specs/2026-04-16-editor-asset-and-embed-surface/SPEC.md` §3 NG6, §6 FR-5, §13 P1.3
- E2E evidence: `specs/2026-04-16-editor-asset-and-embed-surface/evidence/e2e-acceptance-scenarios.md` P1.3
- QA: `tmp/ship/qa-progress.json` QA-003
- D2 peer survey (this report)

---

## Gaps / follow-ups

- **Test surface reduction.** Removing P1.3 deletes ~30 lines of E2E fixture code. Net reduction in test surface aligns with the "simpler is better" framing.
- **Security note.** No new attack surface — streaming to disk with no cap is the same pattern Zettlr / Obsidian use locally, and SilverBullet uses remotely (under reverse proxy). The only pathological case is adversarial disk-fill, which is symmetric to "user has a big directory" and handled by OS filesystem limits, not application logic.
- **Future multi-tenant concern.** If OK ever runs as a shared multi-user service (not the current product), `upload.maxBytes` becomes meaningful again. SPEC §15 Future Work already lists "Security-focused upload allowlist" as deferred for the same multi-tenant trigger; `maxBytes` as a hard cap belongs in the same bucket. Revisit if/when that multi-tenant trigger fires.
