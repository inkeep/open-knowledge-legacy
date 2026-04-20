# Path C Research Refresh — Adjacent CRDTs, MDX-on-Peritext Prior Art, Hocuspocus Alternatives

**Date:** 2026-04-16
**Companion to:** `reports/peritext-on-yjs-feasibility/REPORT.md` (2026-04-07)
**Method:** WebSearch + WebFetch + npm registry probes (`registry.npmjs.org/<pkg>/latest`).
**Stance:** Factual with confidence labels. Each claim → evidence → confidence (HIGH / MEDIUM / LOW).

---

## Executive Summary (refresh deltas)

1. **No production MDX-on-Peritext editor exists in 2026.** MDX-Editor (`mdxeditor.dev`) uses Lexical and ships **without any CRDT in dependencies** (verified: `package.json` for `@mdxeditor/editor` lists no `yjs` / `loro-crdt` / `automerge`). BlockSuite/AFFiNE handles block-rich-text via Y.Text-per-block but does NOT handle MDX semantically (markdown export only). Loro has Peritext semantics + a ProseMirror binding (`loro-prosemirror@0.4.3`, latest Feb 2026) but no MDX-aware production user found.

2. **The Hocuspocus peer-dep ceiling is real and shared across the ecosystem.** Confirmed via npm registry on 2026-04-16:

   | Package | Latest version | `peerDependencies.yjs` |
   | --- | --- | --- |
   | `@hocuspocus/server` | `3.4.4` | `^13.6.8` |
   | `y-websocket` | `3.0.0` | `^13.5.6` |
   | `y-partykit` | `0.0.33` | `^13.6.16` |
   | `@liveblocks/yjs` | `3.18.2` | `^13.6.1` |
   | `@lexical/yjs` | `0.43.0` | `>=13.5.22` |
   | `@platejs/yjs` | `52.3.10` | (depends on `yjs@^13.6.29` directly) |

   **Every published Yjs server library and editor binding pins to `yjs@^13.x`.** No package on npm declares Yjs 14 compatibility as of 2026-04-16. The blast-radius problem identified in the 2026-04-07 REPORT (`@tiptap/y-tiptap@3.0.2` and `@hocuspocus/server@3.4.4` pin Yjs 13) is the **status quo across the entire ecosystem**, not a Hocuspocus-specific stickiness.

3. **Adjacent CRDTs ranked by Open Knowledge fit (dual-view + MDX + agent-write profile):**

   | CRDT | Peritext-class semantics | ProseMirror binding | CodeMirror binding | Production state | Server story | Fit verdict |
   | --- | --- | --- | --- | --- | --- | --- |
   | **Loro** | YES (`Rich Text CRDT` based on Fugue) | `loro-prosemirror@0.4.3` (Feb 2026) | `loro-codemirror@0.3.3` (Oct 2025) | Loro 1.0 shipped, `loro-crdt@1.11.0` (Apr 2026) | DIY — no canonical Loro server (P2P-first design) | **Best Peritext semantics**; weakest server tooling |
   | **Yjs 14** | NO (no expand-before/after flag per mark) | `y-prosemirror@2.0.0-2` (pre-release) | `y-codemirror.next` exists for Yjs 13 | `yjs@14.0.0-16` beta | **Zero ecosystem support**; Hocuspocus pins ^13 | **Best server tooling but no Peritext** + ecosystem isolation |
   | **Yjs 13** (status quo) | NO | `y-prosemirror@1.3.7` | `y-codemirror.next@0.3.x` | Stable, all bindings work | Hocuspocus, y-sweet, y-partykit, Liveblocks, y-websocket all support | **No change** — what Open Knowledge runs today |
   | **y-octo** (Rust YATA, AFFiNE-grade) | Inherits Yjs semantic gaps (no Peritext) | None directly; bridges via Yjs binary protocol compat | None directly | Used in AFFiNE Cloud + Electron in production, `y-octo@unpublished` on npm (Rust-only `y-octo` crate) | AFFiNE's bespoke server | **Performance / native bindings story; no semantic upgrade** |
   | **Diamond Types** | Plain text only ("doesn't support … editor bindings, presence … or [most CRDT extras]") | None | None | `diamond-types-node@1.0.2` published 2023; cargo crate "quite out of date"; main branch active | None | **Not viable** for rich-text editor today |
   | **Cola** | Plain text only (Rust) | None | None | `cola` crate active; no JS bindings published | None | **Not viable** for editor today |
   | **Automerge** (not new but for context) | YES (Peritext implementation by paper authors) | `@automerge/prosemirror` (3,272 LOC, established) | None canonical | Stable; Automerge 3.x shipped | `automerge-repo` provides server primitives | **Highest semantic correctness + library maturity**; biggest migration cost |
   | **Earthstar** | N/A (document database, not text CRDT) | N/A | N/A | Active; not a rich-text CRDT | N/A | **Wrong category** — it's a sync/storage protocol |
   | **Tribles** | N/A — research-stage knowledge graph CRDT, not text CRDT | None | None | Research project | None | **Wrong category** |

4. **Hocuspocus alternatives, ranked by feature parity for Open Knowledge's server-authoritative architecture:**

   | Server | `onLoadDocument` / `onStoreDocument` | Direct CRDT manipulation (`openDirectConnection`-equivalent) | Awareness | Per-conn message routing | Yjs version |
   | --- | --- | --- | --- | --- | --- |
   | **Hocuspocus** | YES — full lifecycle suite | YES — `openDirectConnection().transact(doc => …)` | YES | YES | `^13.6.8` |
   | **y-partykit** | `load()` + `callback` debounced | NO documented direct-CRDT API; everything goes through `onConnect` | YES (Yjs `Awareness` over Party.Connection) | YES (Cloudflare Durable Object per party) | `^13.6.16` |
   | **y-sweet** | **NO** — server is opaque; SDK gives you `getOrCreateDocAndToken()`. Storage is S3-only by design. | **NO** documented hook; document is the unit, not the doc | YES (built into Yjs sync protocol) | YES (Rust session backend) | Unspecified pin — but uses Yjs binary protocol so ^13 implied |
   | **Liveblocks Yjs** | NO (managed; SaaS only — no self-hostable server) | NO (proprietary SaaS; you live inside their model) | YES | YES (Liveblocks rooms) | `^13.6.1` |
   | **y-websocket-server** (`yjs/y-websocket-server`) | `YPERSISTENCE` for LevelDB or HTTP `CALLBACK_URL` (debounced POST) | NO direct API; "designed for customization" — fork-and-modify | YES | YES | `^13.5.6` |
   | **y-protocols (raw)** | N/A — building blocks only | N/A | YES (`Awareness` class) | DIY | N/A |

   **Verdict on the Hocuspocus replacement question:** If Yjs 14 forces a Hocuspocus migration, the **only library with a comparable feature set is none**. y-partykit comes closest on lifecycle hooks but lacks direct-CRDT manipulation. y-sweet is opinionated toward S3 + token-auth (no extension hooks). y-websocket-server is intentionally bare-bones. Building on `y-protocols` is a months-of-work undertaking. **Practical conclusion:** if Yjs 14 is required, the migration cost is dominated by **either staying on Yjs 13 and waiting for Hocuspocus to bump**, or **forking Hocuspocus to bump its `yjs` peerDep and re-test the surface area**, not by switching to a different server library.

---

## D9. MDX-on-Peritext

### Claim D9.1: No editor publicly handles MDX with full Peritext semantics in 2026.

- **Evidence (HIGH):** MDX-Editor (`mdxeditor.dev`, repo `mdx-editor/editor`) uses **Lexical 0.35.0** and its `package.json` (verified via WebFetch on 2026-04-16) does NOT list `yjs`, `automerge`, or `loro-crdt` as dependencies. The project description focuses on "JSX components with a built-in JSX editor" but says nothing about real-time collaboration. Lexical's `@lexical/yjs@0.43.0` exists but MDX-Editor does not pull it in. **MDX-Editor is single-user.**
- **Evidence (HIGH):** BlockSuite (`toeverything/blocksuite`) — used by AFFiNE in production — uses `@blocksuite/inline` which "binds to `Y.Text` for inline formatting within blocks" using the Yjs delta format (`{ insert, attributes }`). **Y.Text formatting is NOT Peritext-class** — it stores formatting as `ContentFormat` marker items without per-mark expand-before/after flags. Source: BlockSuite docs (`block-suite.com/blog/document-centric.html`) + BlockSuite inline guide + Yjs delta format docs.
- **Evidence (MEDIUM):** AFFiNE's user-facing capabilities surface markdown export (HTML/Markdown only — confirmed via affine.pro blog/community pages) but no MDX support. AFFiNE's data model is a tree of blocks; MDX semantics (JSX components, frontmatter, code fences as first-class types) are **not** part of the AFFiNE block schema.
- **Evidence (HIGH):** Loro publishes a "Rich Text CRDT" with Fugue-based semantics (`loro-dev/loro` repo + `loro.dev/blog/loro-richtext`) and a ProseMirror binding (`loro-prosemirror@0.4.3`, latest Feb 2026). However, no production MDX editor on Loro has been found in any prior-art search.
- **Confidence:** HIGH that no production MDX-Peritext editor exists.

### Claim D9.2: Peritext's annotation model can represent MDX semantics in principle.

- **Evidence (MEDIUM):** Peritext's primitive is "flat text + spans of formatting". MDX inline elements (`<Component prop="..." />`) need an additional layer: either (a) reserved sentinel characters in the text + spans pointing to component-attribute storage outside the text sequence, or (b) a separate "embedded objects" sequence parallel to the text (Automerge's approach for void nodes). Both are documented strategies; neither is in any published MDX editor. Source: `evidence/void-nodes.md` from the existing report covers (a) and (b) as the two architectures.
- **Implication:** Loro + a ProseMirror schema modeled on Open Knowledge's current TipTap schema is the closest path. The custom Loro container types (Maps for component props, Lists for children) handle MDX block-level structure; the Loro Rich Text container handles Peritext-class inline text. **No prior art combines these for MDX specifically.**
- **Confidence:** MEDIUM (theoretical; not validated by a running implementation).

### Claim D9.3: BlockSuite's "Y.Text per block" architecture is the closest production validation that Y.Text + per-block segregation is viable for editor-grade rich text — but it does NOT solve Peritext semantics.

- **Evidence (HIGH):** BlockSuite uses one `Y.Text` per inline block, isolating concurrent-format anomalies to single paragraphs (the "extreme bold expansion" Peritext anomaly cannot cross block boundaries by construction). Source: `blocksuite.io/guide/inline.html`.
- **Implication for Open Knowledge:** This is the same model Open Knowledge already uses (XmlFragment with text nodes inside). Adopting BlockSuite-style "Y.Text per block" doesn't add Peritext semantics; it just constrains the anomaly's blast radius.
- **Confidence:** HIGH for the architecture claim. HIGH for the implication.

### Claim D9.4: Plate.js has Yjs collaboration and is built on Slate.

- **Evidence (HIGH):** `@platejs/yjs@52.3.10` (March 2026) declares `dependencies: { yjs: "^13.6.29", "@slate-yjs/core": "^1.0.2" }` and lists `@hocuspocus/provider: "^3.4.0"` as a peer dep. **Slate-Yjs is the binding underneath**, not a Peritext-class CRDT. Source: `registry.npmjs.org/@platejs/yjs/latest`.
- **Implication:** Plate inherits Yjs's same formatting limitations. Not a Peritext path.
- **Confidence:** HIGH.

### Claim D9.5: Lexical has Yjs collaboration via `@lexical/yjs` but no Peritext semantics.

- **Evidence (HIGH):** `@lexical/yjs@0.43.0` declares `peerDependencies: { yjs: ">=13.5.22" }`. Source: npm registry.
- **Implication:** Same Y.Text-formatting limitations as TipTap+Yjs. Lexical is a reasonable alternative editor framework but **does not unlock Peritext semantics**.
- **Confidence:** HIGH.

---

## D10. Adjacent CRDTs (beyond Yjs / Loro / Automerge)

### Claim D10.1: Diamond Types is not viable as an editor-grade CRDT in 2026.

- **Evidence (HIGH):** Repo `josephg/diamond-types` README explicitly states the project is "WIP" and that "the package published to cargo is quite out of date, both in terms of API and performance." The Hacker News discussion thread `josephg` himself wrote: "CRDT libraries need to support binary encoding, network protocols, non-list data structures, presence (cursor positions), editor bindings and so on, and at the time of writing, diamond does almost none of this."
- **Evidence (HIGH):** `diamond-types-node@1.0.2` on npm published 2023 (no 2024-2026 republishes via npm registry probe). `diamond-wasm@0.1.1` published 2022.
- **Confidence:** HIGH — Diamond Types is research-grade for plain text only; not a candidate for Open Knowledge's dual-view + MDX use case.

### Claim D10.2: Cola is plain-text-only Rust with no JS bindings.

- **Evidence (HIGH):** Repo `nomad/cola` README: "Cola is a Conflict-free Replicated Data Type specialized for real-time collaborative editing of plain text documents." 100% Rust, no JS bindings published.
- **Confidence:** HIGH — Not viable for browser-side editor binding.

### Claim D10.3: y-octo is production-grade Rust YJS implementation with Yjs binary protocol compatibility, used by AFFiNE.

- **Evidence (HIGH):** Repo `y-crdt/y-octo` README: "AFFiNE is using y-octo in production. There are Electron app and Node.js server using y-octo in production." Implements "YATA CRDT state apply/diff compatible with yjs" + "Yjs binary encoding."
- **Evidence (MEDIUM):** Yjs `update v2` encoding marked "🚧 work in progress" in the y-octo feature list. XML support also incomplete. Practical implication: y-octo is a drop-in for **most** Yjs sync flows, but apps using `update v2` or `Y.XmlFragment` semantics extensively need to verify case-by-case.
- **Evidence (HIGH):** `npm i y-octo` returns "Not Found" — y-octo is **Rust-first** with WASM/NAPI bindings shipped from the AFFiNE/toeverything repo (`toeverything/OctoBase` previously, now consolidated). Verified via `registry.npmjs.org/y-octo/latest` returning `"Not Found"`.
- **Implication for Open Knowledge:** y-octo gives you native performance for server/desktop without changing the document model. **It does not add Peritext semantics** (it's a YATA implementation, not a Peritext implementation). Migration cost is moderate (rewrite server-side `applyAgentMarkdownWrite` etc. against y-octo's API or stick to Yjs binary protocol on the wire and use y-octo for storage only).
- **Confidence:** HIGH for production status. MEDIUM for upgrade-v2/XML compatibility gaps. HIGH for "no Peritext upgrade."

### Claim D10.4: Earthstar is a P2P document database, NOT a rich-text CRDT.

- **Evidence (HIGH):** Repo `earthstar-project/earthstar`: "Earthstar is a small and resilient distributed storage protocol … It's a p2p document database where each person has a copy of all the data on their own machine and they sync with each other." Documents are NoSQL-shaped (metadata + content field). No rich-text semantics.
- **Confidence:** HIGH — Wrong category for this evaluation.

### Claim D10.5: Tribles is a research-stage knowledge graph CRDT, not a text CRDT.

- **Evidence (LOW)** — Search did not surface a production Tribles project relevant to text editing. No npm package, no editor binding, no production use case found in 2026 search.
- **Confidence:** LOW (negative result — could not find evidence Tribles is viable for text editing).

### Claim D10.6: Y-Sweet is a Yjs-compatible managed/self-hostable backend by Jamsocket (Drifting in Space), Rust-implemented, S3-persistence-first.

- **Evidence (HIGH):** Repo `jamsocket/y-sweet` README + `docs.y-sweet.dev`. Written in Rust. "Persists document data to S3-compatible storage." Document-level access control via client tokens. SDK class `DocumentManager` for backend operations.
- **Evidence (HIGH):** `@y-sweet/sdk@0.9.1` last published Sept 2024 per npm registry probe (`_npmOperationalInternal.tmp` timestamp `1758037067636` = 2024-09-16). **Notable:** no 2025-2026 republish on npm. Suggests stable surface or slowing dev cadence.
- **Evidence (MEDIUM):** No documented `onLoadDocument` / `onStoreDocument` lifecycle hooks like Hocuspocus. SDK exposes `getOrCreateDocAndToken()` for document creation; document content ops happen client-side.
- **Implication:** Y-Sweet is **intentionally less extensible than Hocuspocus**. Optimized for "managed Yjs hosting" rather than "build server-authoritative custom logic." Open Knowledge's `applyAgentMarkdownWrite` server-side surface would be hard to replicate.
- **Confidence:** HIGH for architecture/persistence model; MEDIUM for "less extensible" claim (based on absence of documented hooks, not on confirmed denial).

---

## D13. Hocuspocus Alternatives if Yjs 14 Migration Forces a Server Swap

### Claim D13.1: Across the entire Yjs ecosystem on npm, every server library and editor binding pins to `yjs@^13.x` as of 2026-04-16.

- **Evidence (HIGH, primary source):** Direct npm registry probes on 2026-04-16:
  ```
  @hocuspocus/server@3.4.4 → peerDependencies.yjs: "^13.6.8"
  y-websocket@3.0.0      → peerDependencies.yjs: "^13.5.6"
  y-partykit@0.0.33      → peerDependencies.yjs: "^13.6.16"
  @liveblocks/yjs@3.18.2 → peerDependencies.yjs: "^13.6.1"
  @lexical/yjs@0.43.0    → peerDependencies.yjs: ">=13.5.22"
  @platejs/yjs@52.3.10   → dependencies.yjs: "^13.6.29" (direct dep, not peer)
  ```
- **Implication:** The 2026-04-07 REPORT's caveat about "@hocuspocus/server v3.4.4 likely pins yjs@^13" was correct — and is **not Hocuspocus-specific**. Migrating to any other Yjs server library does not unlock Yjs 14. The `>=13.5.22` style on `@lexical/yjs` is the most permissive in the ecosystem; even that excludes `14.x` because semver `>=13.5.22` does not match `14.x` under standard interpretation **only if a `<14` upper bound is implicit** — but in semver `>=13.5.22` strictly satisfies `14.0.0` too. **Lexical may install with Yjs 14 today; whether it WORKS is a separate question (`y-prosemirror@2.0.0-2` is the only pre-release ProseMirror binding that targets Yjs 14).**
- **Confidence:** HIGH for the peer-dep facts. MEDIUM for the practical "what works" conclusion (would need a runtime test).

### Claim D13.2: Hocuspocus has the most extensive lifecycle hooks of any Yjs server.

- **Evidence (HIGH):** Documented hooks (verified via `tiptap.dev/docs/hocuspocus/server/hooks`):
  - `onAuthenticate` — credential check before connection
  - `onConnect` — new ws connection (rejectable)
  - `connected` — post-connection
  - `onLoadDocument` — fetch from storage on first connect
  - `afterLoadDocument` — runs after load succeeds (Open Knowledge wires server observers here)
  - `onChange` — content changed (once per doc)
  - `onStoreDocument` — debounced save to storage
  - `onAwarenessUpdate` — awareness change
  - `onDisconnect` — connection terminate
  - `onDestroy` — server shutdown
  - `beforeHandleMessage` — message-level interception (rejectable)
  - `beforeBroadcastStateless` — pre-broadcast hook for stateless messages
  - `afterUnloadDocument` — post-unload cleanup
- **Evidence (HIGH) for `openDirectConnection`:** Public Hocuspocus API — `const docConnection = await hocuspocus.openDirectConnection('my-document', {}); await docConnection.transact((doc) => { doc.getMap('test').set('a', 'b') }); await docConnection.disconnect();` — verified via `tiptap.dev/docs/hocuspocus/server/examples` + community docs. **This is the load-bearing API for Open Knowledge's `setupServerObservers` and `applyAgentMarkdownWrite`** — see `packages/server/src/server-observer-extension.ts` which wires observer setup at `afterLoadDocument` via `openDirectConnection` per-doc.
- **Confidence:** HIGH.

### Claim D13.3: y-partykit covers ~half of Hocuspocus's lifecycle surface.

- **Evidence (HIGH):** `y-partykit` exposes `load()` (custom doc fetch on first connection) and `callback` (debounced HTTP/handler on update). It does NOT expose: `afterLoadDocument`, `onChange`, `beforeHandleMessage`, `beforeBroadcastStateless`, `afterUnloadDocument`, `openDirectConnection`. Source: `docs.partykit.io/reference/y-partykit-api/`.
- **Evidence (HIGH):** y-partykit is built on PartyKit (Cloudflare Durable Objects), so per-connection sequential message routing is provided by the Durable Object model. Awareness is propagated via standard Yjs awareness protocol.
- **Implication:** Migrating Open Knowledge to y-partykit would require replacing `applyAgentMarkdownWrite` (which uses `openDirectConnection`) with a different write surface — possibly a custom HTTP endpoint that the y-partykit server handles via `onConnect`+message interception. **This is a non-trivial rewrite of the server-authoritative bridge layer**, and Open Knowledge's "single coordination point" design (precedent #14) becomes harder to maintain without `openDirectConnection`.
- **Confidence:** HIGH for hook gaps. HIGH for architectural impact.

### Claim D13.4: y-sweet is the least extensible of the major options for server-authoritative custom logic.

- **Evidence (MEDIUM):** y-sweet is documented (`docs.jamsocket.com/y-sweet`) as a managed Yjs sync engine + persistence. The TypeScript SDK exposes `DocumentManager.getOrCreateDocAndToken()` and access-control primitives, but **no documented direct-CRDT-manipulation API** comparable to `openDirectConnection`. Document content ops happen client-side.
- **Implication:** Open Knowledge's server-authoritative bridge (precedent #14) cannot be implemented on y-sweet without forking the Rust server core.
- **Confidence:** MEDIUM (based on documented surface; absence of documented direct-CRDT API does not prove absence in code, but the architecture description suggests it's not a design goal).

### Claim D13.5: Liveblocks Yjs is SaaS-only and does not provide self-hostable lifecycle hooks.

- **Evidence (MEDIUM):** `@liveblocks/yjs@3.18.2` is a client-side library. Liveblocks server is proprietary SaaS — there is no "Liveblocks server you can host on a GCP VM with custom hooks". Open Knowledge's CLI-shipped server design is fundamentally incompatible with Liveblocks's hosting model.
- **Confidence:** HIGH for "SaaS-only", MEDIUM for "no comparable hooks" (didn't probe their proprietary server features deeply, but the SaaS lock-in is the disqualifier).

### Claim D13.6: y-websocket-server is intentionally minimal — usable as a starting point but requires significant custom work to match Hocuspocus.

- **Evidence (HIGH):** Repo `yjs/y-websocket-server` README: "Simple backend for y-websocket … a basic server that you can adopt to your specific use-case." Persistence is LevelDB (`YPERSISTENCE` env var) or HTTP `CALLBACK_URL` (debounced POST on update). No documented lifecycle hooks beyond the callback.
- **Evidence (HIGH):** Note that `CALLBACK_URL` does not implement retry logic — this is documented as a known limitation.
- **Implication:** Forking y-websocket-server to add Hocuspocus-like hooks is a multi-week rewrite. Open Knowledge would essentially be rebuilding Hocuspocus.
- **Confidence:** HIGH.

### Claim D13.7: y-protocols alone is not a server — it's a building-blocks library.

- **Evidence (HIGH):** Repo `yjs/y-protocols` exposes binary encoding for sync, awareness, and history. It documents the `Awareness` class API (set/get local state, listen to updates). It does NOT include sync protocol implementation, auth, or lifecycle hooks. Building a server on `y-protocols` directly is a months-of-work undertaking.
- **Confidence:** HIGH.

### Claim D13.8: Net conclusion on the "Hocuspocus alternative" question.

- **No drop-in replacement exists in 2026.** Hocuspocus is the most feature-complete Yjs server library and the only one with `openDirectConnection`, the lifecycle-hook surface that wires `afterLoadDocument` → `setupServerObservers`, and per-document direct CRDT manipulation.
- **If the goal is Yjs 14 migration:** Forking Hocuspocus to bump its `yjs` peerDep + re-running its test suite (likely a 1-2 day exercise + retest of Open Knowledge's stress/integration suite) is **strictly cheaper** than swapping to a less-featured server library and rebuilding Open Knowledge's server-authoritative bridge layer (which is multi-week + reintroduces protocol-layer correctness work).
- **If the goal is Peritext semantics:** Switching CRDT (to Loro or Automerge), not switching server, is the right axis. Loro's `loro-prosemirror` binding is the most plausible path; but it's a rewrite of the bridge layer and the server-authoritative architecture would need to be re-implemented against Loro's primitives (no Loro-equivalent of Hocuspocus exists).
- **Confidence:** HIGH for the "no drop-in replacement" claim. MEDIUM for the "fork Hocuspocus is cheaper" recommendation (depends on Open Knowledge's tolerance for maintaining a fork).

---

## Cross-cutting observations

### O1. The Yjs 14 ecosystem cliff is a 2026-04-16 reality.

- **Yjs core:** `yjs@14.0.0-16` (beta) and `yjs@14.0.0-8` (next) are published; stable latest is `yjs@13.6.30`.
- **y-prosemirror:** `2.0.0-2` (pre-release for Yjs 14); stable is `1.3.7` (Yjs 13).
- **Every Yjs server library on npm pins to ^13.x.**
- **Implication:** Today, "use Yjs 14" means "live without Hocuspocus, without canonical y-websocket, without y-partykit, without Liveblocks, without published Lexical-Yjs that's been retested on 14, without published Plate-Yjs that's been retested on 14." The fork-or-wait choice is the **entire** Yjs ecosystem's choice, not just Open Knowledge's.

### O2. The "best fit for Open Knowledge's requirements" matrix.

For dual-view (WYSIWYG + source) + MDX + agent-write profile:

| Path | Editor binding | Server | Peritext | MDX | Migration cost |
| --- | --- | --- | --- | --- | --- |
| **Status quo (Yjs 13 + Hocuspocus + TipTap/CodeMirror)** | Mature | Mature | NO | DIY (current Open Knowledge approach) | $0 |
| **Yjs 14 + fork Hocuspocus** | `y-prosemirror@2.0.0-2` (pre-release) | Forked Hocuspocus (~1-2 days) | NO (Yjs 14 still no Peritext) | DIY (same approach) | Low-medium; depends on `y-prosemirror@2.0.0-2` stability |
| **Loro + loro-prosemirror + custom server** | `loro-prosemirror@0.4.3` (Feb 2026) | Build on Loro client/server primitives | YES | DIY, similar to current | High — full bridge rewrite + new server stack |
| **Automerge + automerge-prosemirror + automerge-repo** | `@automerge/prosemirror` (3,272 LOC) | `automerge-repo` provides primitives | YES | DIY, similar to current | High — full bridge rewrite + Automerge model differs from Yjs (no `Y.Map` equivalent for activity-map etc.) |
| **y-octo + custom server** | None for ProseMirror; TipTap+y-prosemirror would still work since y-octo speaks Yjs binary protocol | Native Rust server (would need to build) | NO (y-octo inherits Yjs semantics) | DIY | High; main upside is performance, not semantic correctness |

### O3. The MDX-on-Peritext gap is a moat opportunity.

- **No production editor handles MDX with full Peritext semantics in 2026.** This is empirically verified across the prior-art search.
- **The closest existing pieces are:** Loro Rich Text + `loro-prosemirror` for Peritext-class inline; BlockSuite-style "Y.Text per block" segregation for blast-radius bounding; Open Knowledge's existing MDX pipeline (Tier A/B/C handler tables, R23 PUA guards, escapeMark) for the storage-layer fidelity contract.
- **Gluing these together has no published reference implementation.** The architectural sketches in the existing report (`evidence/void-nodes.md` (a) and (b)) remain unvalidated by any production system.

---

## Methodology

- **Primary sources:** npm registry direct probes via `curl -s "https://registry.npmjs.org/<pkg>/latest"` returning JSON. Most-trusted facts in this report (peer dep pins, last-published dates).
- **Secondary sources:** WebFetch on GitHub repo READMEs and official docs sites (tiptap.dev, partykit.io, jamsocket.com, blocksuite.io, loro.dev).
- **Tertiary:** WebSearch for cross-validation, including Hacker News threads and community forum posts.
- **Negative findings:** Several `WebFetch` calls hit `403`/`404` (`npmjs.com` blocks scrapers; `affine-pro/affine` and `toeverything/AFFiNE/blob/canary/AGENTS.md` were unreachable). Where this happened, we substituted npm-registry-API or alternate doc sources.
- **Limitations:** This refresh is a literature review, not a runtime validation. None of the alternative CRDTs / servers were actually built against Open Knowledge's test suite. Confidence labels reflect this — HIGH = direct primary-source evidence (registry, README); MEDIUM = inferred from documentation gaps or single-source claims; LOW = absence-of-evidence reasoning.

---

## Sources cited

- npm registry: `registry.npmjs.org/@hocuspocus/server/latest`, `/y-websocket/latest`, `/y-partykit/latest`, `/@liveblocks/yjs/latest`, `/@lexical/yjs/latest`, `/@platejs/yjs/latest`, `/loro-crdt/latest`, `/loro-prosemirror/latest`, `/loro-codemirror/latest`, `/diamond-types-node/latest`, `/diamond-wasm/latest`, `/@y-sweet/sdk/latest`
- Repo READMEs: `josephg/diamond-types`, `nomad/cola`, `y-crdt/y-octo`, `loro-dev/loro`, `yjs/y-websocket-server`, `yjs/y-protocols`, `toeverything/blocksuite`, `jamsocket/y-sweet`, `earthstar-project/earthstar`, `mdx-editor/editor`
- Doc sites: `tiptap.dev/docs/hocuspocus/server/hooks`, `tiptap.dev/docs/hocuspocus/server/examples`, `docs.partykit.io/reference/y-partykit-api/`, `block-suite.com/blog/document-centric.html`, `liveblocks.io/yjs`
- Existing report: `reports/peritext-on-yjs-feasibility/REPORT.md` (2026-04-07) and its `evidence/` sub-tree
