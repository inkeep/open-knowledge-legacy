# Audit Findings

**Artifact:** `/Users/timothycardona/inkeep/open-knowledge/specs/2026-04-15-preview-url-pre-edit/SPEC.md`
**Audit date:** 2026-04-15
**Total findings:** 6 (2 high, 2 medium, 2 low)

---

## High Severity

### [H] Finding 1: Hocuspocus 4.0.0-rc.1 DOES expose a public per-document subscriber API — D4 cost analysis is built on a false premise

**Category:** FACTUAL
**Source:** T2 (OSS source — local node_modules)
**Location:** SPEC.md §3 (NG5), §10 (D4), §15 Future Work; `evidence/subscriber-presence-cost.md` (entire file); `evidence/current-state.md` §"Hocuspocus subscriber introspection"
**Issue:** The spec and both evidence files claim Hocuspocus 4.0.0-rc.1 has **no public API** for per-room subscriber enumeration and that implementing D4 requires a custom Extension + in-memory `Map<docName, Set<connectionId>>` (~1–2 days of plumbing). This claim is wrong. The shipped `Document` class exposes public methods directly.
**Current text (subscriber-presence-cost.md):** "Hocuspocus 4.0-rc.1 does **not** expose a public API for per-room subscriber enumeration. There is no `.getConnections()` / `.getSubscribers()` / `.getClients()` on either the `Server` or `Document` classes."
**Current text (current-state.md):** "**No** `.getConnections()` / `.getSubscribers()` / `.getClients()` on Document or Server."
**Evidence:** `node_modules/@hocuspocus/server/dist/index.d.ts:128-212` (`declare class Document extends Doc`) declares all of:
- `connections: Map<Connection, { clients: Set<any> }>` (line 134) — public field
- `hasConnection(connection): boolean` (line 171)
- `getConnectionsCount(): number` (line 181)
- `getConnections(): Array<Connection>` (line 185)
- `getClients(connection): Set<any>` (line 189)

Usage pattern would be: `hocuspocus.documents.get(docName)?.getConnectionsCount() ?? 0` — a one-liner, not a custom Extension. The spec already calls `hocuspocus.documents.get(docName)` in 12 places in `packages/server/src/standalone.ts` (verified via grep).
**Status:** CONTRADICTED
**Suggested resolution:** Re-investigate D4 with the correct API surface. The cost is plausibly minutes, not 1–2 days. This finding is **decision-implicating** — D4's demotion to Future Work was justified primarily by the cost escalation in `subscriber-presence-cost.md`. With the correct cost basis, D4 may belong back in scope. Per assess-findings routing, surface to user before any auto-edit. Per-process map / new HTTP endpoint plumbing is unnecessary in the same-process case. The split-cloud-deploy concern (MCP and Hocuspocus on separate hosts) remains valid but is itself NG-tier (no cloud deploy yet).

---

### [H] Finding 2: Requirement R6 cites encoding behavior that `hashFromDocName` does not perform

**Category:** FACTUAL / COHERENCE
**Source:** T1 (own codebase) + L4 (evidence-synthesis fidelity)
**Location:** SPEC.md §6 row "docName encoding matches app"; `evidence/current-state.md` §"Hash routing"
**Issue:** R6 acceptance criteria says the resolver must "Per-segment encodeURIComponent, aligned with `hashFromDocName`." The evidence file restates: "`{baseUrl}/#/{encodeURIComponent-per-segment docName}` — `hashFromDocName` is the canonical builder." But `hashFromDocName` does **not** encode anything — it does raw template interpolation.
**Current text (R6 Notes):** "Per-segment encodeURIComponent, aligned with `hashFromDocName`."
**Evidence:** `packages/app/src/lib/doc-hash.ts:23-26`:
```ts
export function hashFromDocName(docName: string, anchor?: string | null): string {
  const base = `#/${docName}`;
  return anchor ? `${base}?anchor=${encodeURIComponent(anchor)}` : base;
}
```
Only the anchor is encoded. The docName is interpolated raw. The decoder `docNameFromHash` (line 14) does `split('/').map(decodeURIComponent).join('/')`, so it tolerates either encoded or unencoded segments — but the writer side has no encoder today.
**Status:** CONTRADICTED (the "alignment" is asymmetric in current code)
**Suggested resolution:** Choose one:
(a) Spec stays correct as-is, and the implementation should do per-segment encoding (which is the right behavior — raw `My Doc` would produce a malformed URL otherwise) AND `hashFromDocName` should be fixed to match. Note this in the spec as an in-scope code change.
(b) Update R6 to acknowledge that `hashFromDocName` does no encoding today, and that the resolver introduces per-segment encoding as a new convention with `hashFromDocName` to be aligned.
Either way, the evidence file's "canonical builder" claim is wrong as written and should be corrected. This is decision-implicating only insofar as D5 ("Hash route is the URL contract") rests on `hashFromDocName` being the canonical builder; if the resolver becomes the de-facto canonical encoder, that minor recharacterization is worth surfacing.

---

## Medium Severity

### [M] Finding 3: Existing `server.openOnAgentEdit` config field is adjacent to spec scope but unmentioned

**Category:** COHERENCE (L4 — evidence-synthesis fidelity / scope completeness)
**Source:** L4 + reader pass
**Location:** SPEC.md §8 Current state; §9 (config); §16 SCOPE
**Issue:** `packages/cli/src/config/schema.ts:22` already has `server.openOnAgentEdit: z.boolean().default(false)`. This is the existing answer to "should the system do something when an agent edits?" The spec proposes a new `preview.baseUrl` config namespace and never references the existing `openOnAgentEdit` field. Either it's irrelevant (then say so — a reader will wonder why a new namespace is being introduced when an `openOnAgentEdit`-shaped knob exists), or it overlaps and the spec needs to address co-existence (e.g. should `openOnAgentEdit=true` change anything in the `previewUrl` flow?).
**Current text (§9 surfaces):** "**Config file:** new optional `preview.baseUrl` field in `.open-knowledge/config.yml`."
**Evidence:** `packages/cli/src/config/schema.ts:15-24` shows existing `server` block with `port`, `host`, `openOnAgentEdit`. The current state section (§8) lists `Config schema lives in packages/cli/src/config/schema.ts` with "*to investigate — confirm extension point for `preview.baseUrl`*" — and the investigation did happen (per evidence/current-state.md §"Config schema") but the existing `openOnAgentEdit` field was not noted in either place.
**Status:** INCOHERENT (incomplete current-state characterization)
**Suggested resolution:** Add a one-line note in §8 or §9 explaining that `server.openOnAgentEdit` is unrelated to (or intentionally orthogonal to) `preview.baseUrl`. If they're related, scope decision needed. Also remove the "*to investigate*" parenthetical in §8 — that question has been resolved.

---

### [M] Finding 4: M1 instrumentation acceptance is unverifiable as written

**Category:** COHERENCE (L7 — sourcing / verifiability)
**Source:** Reader pass + L7
**Location:** SPEC.md §7 Success metrics
**Issue:** M1 says "Instrumentation: correlate agent tool-call logs (not persistent today — see evidence/observability-gap.md *TBD*)." Two problems: (a) the referenced evidence file doesn't exist, and (b) the `*TBD*` marker means M1's success criterion (≥70%) cannot actually be measured today. The spec passes its resolution-completeness gate ("Acceptance criteria are verifiable") only if M1 either gets a real instrumentation plan or is downgraded.
**Current text:** "Instrumentation: correlate agent tool-call logs (not persistent today — see evidence/observability-gap.md *TBD*)."
**Evidence:** `ls evidence/` shows only `current-state.md` and `subscriber-presence-cost.md`. No `observability-gap.md`.
**Status:** UNVERIFIABLE / dead reference
**Suggested resolution:** Either (a) write the missing evidence file with a concrete instrumentation plan (even if "manual sampling"), (b) explicitly mark M1 as "instrumentation deferred — Future Work" with a note that the spec ships without a measurable success metric for the CLAUDE.md guidance loop, or (c) propose a lightweight measurement (e.g. a debug log line per `previewUrl` emission + per `preview_navigate` browser action) that's actually buildable in this spec.

---

## Low Severity

### [L] Finding 5: D5 reversibility classification ("1-way door: Yes") is debatable

**Category:** COHERENCE (L1 — cross-finding consistency)
**Source:** Reader pass + L1
**Location:** SPEC.md §10 D5
**Issue:** D5 marks the hash route `#/{docName}` as a 1-way door. While true that changing the route format would break running consumers, this isn't a *new* commitment created by this spec — it's a pre-existing system property. Tagging it as a 1-way door **decision** of this spec slightly overstates the spec's authority (the spec is *adopting* the existing contract, not making it). Minor framing issue; doesn't change behavior. A reader could reasonably interpret D5 as "this spec now locks the hash route" when really "this spec depends on the hash route as already locked."
**Current text:** "| D5 | Hash route `#/{docName}` is the URL contract | Technical | LOCKED | Yes | Already shipped; ..."
**Status:** INCOHERENT (minor — framing of decision authority)
**Suggested resolution:** Reword D5 as "Adopt existing hash route `#/{docName}` as the URL contract" or move to Assumptions table with HIGH confidence and "verified — already shipped" note.

---

### [L] Finding 6: §8 has a stale "to investigate" annotation

**Category:** COHERENCE (L1 — staleness)
**Source:** L1 + reader pass
**Location:** SPEC.md §8
**Issue:** "Config schema lives in `packages/cli/src/config/schema.ts` (*to investigate — confirm extension point for `preview.baseUrl`*)." The investigation happened (per `evidence/current-state.md` §"Config schema"), but the parenthetical was never removed. Stale.
**Current text:** "Config schema lives in `packages/cli/src/config/schema.ts` (*to investigate — confirm extension point for `preview.baseUrl`*)."
**Status:** STALE
**Suggested resolution:** Replace with: "Config schema lives in `packages/cli/src/config/schema.ts`. New nested optional block `preview: z.object({ baseUrl: z.string().url().optional() }).optional()` fits the existing pattern (verified — `evidence/current-state.md` §Config schema)."

---

## Confirmed Claims (summary)

**Codebase citations verified (T1):**
- `packages/server/src/server-lock.ts:15,94` — `import { hostname } from 'node:os'` and `hostname: hostname()` write — confirmed.
- `packages/server/src/server-lock.ts:19` — `ServerLockMetadata = { pid, hostname, port, startedAt, worktreeRoot }` — confirmed.
- `packages/server/src/server-lock.ts:23` — comment about port=0 at startup — confirmed.
- `packages/server/src/standalone.ts:146-149` — `acquireServerLock` with `port: options.port ?? 0`, `worktreeRoot: projectDir` — confirmed (lines 145-149; off-by-one is acceptable).
- `packages/app/src/App.tsx:16` — `NavigationHandler` with `hashchange` → `openDocument` — confirmed.
- `packages/app/src/lib/doc-hash.ts` — `docNameFromHash`/`hashFromDocName` exist — confirmed (with caveat: see Finding 2 on encoding behavior).
- `packages/cli/src/content/init.ts:144` — `CLAUDE_MD_SECTION` export — confirmed at line 144.
- `packages/cli/src/mcp/server.ts:40` — `buildInstructions(config)` — confirmed at line 40.
- `packages/cli/src/mcp/tools/search.ts:67` — `content.include` filter usage — confirmed (line 67 reads `deps.config.content.include`; the actual filter is built at lines 71-76).
- `previewUrl` absent everywhere in current code — confirmed via grep.
- `enrichment.ts:212` — `enrichPath` is path-agnostic — confirmed.
- `standalone.ts:237-246` — `serializeDoc` uses `hocuspocus.documents.get` — confirmed.
- `standalone.ts:435` — `hocuspocus.closeConnections(docName)` — confirmed.

**Internal consistency verified:**
- Decisions D1, D2, D3, D7 are coherent with requirements §6 and the proposed solution §9.
- D9 (hardcode `localhost`, ignore lock hostname) is well-grounded in code reality.
- D10 + D11 are coherent with the implementation sketch.
- Q1–Q8 resolution table is consistent with the decision log.
- Future Work tiering (Identified vs Explored vs Noted) is correctly applied.
- Agent Constraints §16 is consistent with the in-scope file list.
- NG3 (NEVER) and NG4 (NOT UNLESS) temporal tags are correctly assigned.

## Unverifiable Claims

- **A4** ("Agents will reliably read `previewUrl` from tool responses and navigate before editing when CLAUDE.md tells them to") is correctly labeled LOW confidence with a 2-week dogfood verification plan. Cannot verify ahead of time.
- **M1 target** (≥70%) is a forward-looking metric. Cannot evaluate without instrumentation (see Finding 4).
- **OPEN_KNOWLEDGE_PREVIEW_BASE_URL** env var name (R2 in §6) — proposed name, no existing precedent in the codebase. Reasonable but no convention to verify against.
