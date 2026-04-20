# Design Challenge — Preview URL & Pre-Edit Navigation

**Reviewer:** Cold-read challenger
**Date:** 2026-04-15
**Spec under review:** `specs/2026-04-15-preview-url-pre-edit/SPEC.md` (commit baseline `a6c279a`)
**Posture:** Adversarial — challenge whether prior rejections still hold; surface independent arrivals at rejected paths; probe load-bearing assumptions.

Findings are ordered by severity. Each one says what's challenged, what evidence I checked, and what the spec author needs to decide.

---

## C1 — [BLOCKING] The lock-file port is the wrong port

**What the spec assumes.** `server.lock` contains a `port` field, and the resolver builds `http://localhost:{lock.port}/#/{docName}` from it. FR3 reads: "valid lock file with port=5173, returns `http://localhost:5173/#/docs/a`."

**What the code actually does.**
- `packages/server/src/standalone.ts:142–149` acquires the lock with `port: options.port ?? 0`. The port written to `server.lock` is the **Hocuspocus HTTP/WebSocket server** port (CRDT sync + REST API surface from `api-extension.ts`).
- `packages/app/vite.config.ts:65–73` sets the **Vite dev server** port — `vitePort ?? 5173` — read from `process.env.VITE_PORT`. This is an entirely separate process from Hocuspocus.
- The browser URL the user opens (the editor) is served by Vite (`5173`), which then opens a WebSocket to Hocuspocus on the lock-file port. They are not the same process and not the same port.

**Implication.** The example URL in the spec (`http://localhost:5173/#/docs/test`) is what the user actually wants — but the lock file does **not** contain `5173`. It contains whatever port Hocuspocus bound to (e.g. `40123` after `port=0` is resolved post-listen). If the resolver uses `lock.port`, every emitted local URL points at the Hocuspocus HTTP server, which serves JSON, not the editor HTML — clicking it lands on a blank/error page.

**Why this matters.** The lock-fallback branch — the entire local-dev story — is wrong as designed. FR3's acceptance criterion ("returns `http://localhost:5173/#/...`") is impossible to satisfy from the current `server.lock` without some other input.

**Options I see, none of which are in the spec today:**
1. **Hardcode `5173` in the local fallback** and accept that anyone running Vite on a non-default port (e.g. parallel worktrees, CI) gets a broken URL. Cheap but fragile — Vite uses `strictPort: vitePort !== undefined`, so non-default ports are explicit and discoverable, just not from `server.lock`.
2. **Add a second lock file** (`preview.lock` or `app.lock`) written by Vite via a small plugin, containing the Vite port. This is the only fully correct local fallback. New surface, but the existing `hocuspocusPlugin` in `vite.config.ts` proves the precedent.
3. **Drop the lock branch entirely for local dev**; require `OPEN_KNOWLEDGE_PREVIEW_BASE_URL` or `preview.baseUrl` in config even locally. The "ephemeral port" framing from the seed prompt becomes a non-feature — but it's a non-feature that doesn't actually work today, so removing it is honest.
4. **Have the CLI `start` command write a combined lock** when it spawns Vite alongside Hocuspocus. Requires CLI to actually own both processes (need to verify — `start.ts:257` mentions `previewContent` but it's unclear whether `start` boots Vite).

This is a 1-way door for FR3 and the entire "local ephemeral port" story. Recommend: surface to user before any implementation. The cheapest fix is option 1 + a runtime probe (HEAD `/` against `5173`, fall through if not 200), but options 2/4 are the only ones that handle non-default Vite ports.

---

## C2 — [HIGH] Resolution priority `config → env → lock` inverts the local-dev ergonomic

**What the spec decides (D1, LOCKED).** Config wins over env wins over lock.

**Challenge.** The two surface-level rationales given — "config must win for cloud" and "env covers tunnels/CI" — only make sense if a developer never has both a local checkout *and* a config file. But the moment a repo ships with `preview.baseUrl: "https://wiki.acme.com"` checked into `.open-knowledge/config.yml` (which the cloud-deploy story actively encourages), every local clone resolves to the production URL. A local `open-knowledge start` will hand the agent `https://wiki.acme.com/#/docs/x` even though the user is editing locally — the agent navigates the preview to prod, the user's local edit lands in a CRDT room nobody on prod is watching.

**Evidence.** D1's rationale doesn't address the local-clone-of-cloud-repo case. The Goals (G2) say "works identically in local and cloud" — but identical resolution priorities don't produce identical *user experiences* when the same repo is consumed in both contexts.

**Options:**
1. **Flip to `env → lock → config`** — env is explicit per-shell intent, lock proves local server is running, config is the deploy-time default. (Inverts D1.)
2. **Keep D1 priority but add a "local server detected" override** — if `server.lock` exists and is fresh, prefer it over config. Effectively `lock → env → config` in practice for local dev.
3. **Document and accept** — tell users to never check `preview.baseUrl` into the repo; use env or per-environment config layering. Pragmatic but bites the first user who does it.
4. **Per-deploy config files** — `.open-knowledge/config.local.yml` overrides `config.yml`. New schema surface but matches Vite/Next.js conventions.

If C1's option 3 (drop lock branch) is chosen, this challenge sharpens: there is no local override mechanism, and option 1/4 become mandatory.

---

## C3 — [HIGH] `previewUrl` on `read_document` is a footgun

**What the spec decides (D3, LOCKED).** All six tools emit `previewUrl`, including read tools. The CLAUDE.md guidance is "navigate before editing."

**Challenge.** Emitting `previewUrl` on read responses creates two failure modes that aren't acknowledged:

1. **Read-then-edit drift.** The agent reads doc A (gets URL for A), then later decides to edit doc B. If the agent mechanically navigates to "the previewUrl from the most recent tool response," it lands on A while editing B — strictly worse than no navigation. The CLAUDE.md guidance must be precise: "navigate to the URL of the doc you are about to edit," not "navigate to the most recent previewUrl."
2. **Read-only sessions get noise.** If the user is asking the agent to summarize 50 docs, `read_document` returns 50 `previewUrl` fields the agent is supposed to do nothing with. This isn't a correctness bug but it inflates token usage and trains the agent that `previewUrl` is decorative.

**Evidence.** D3 rationale: "User confirmed 2026-04-15 ('i think im ok with this')." That's not a defense — the user agreed to the outcome, not to the failure modes. The Decision Log doesn't trace these implications.

**Options:**
1. **Emit only on write tools + `get_preview_url`** — read tools stay clean, agent calls `get_preview_url(targetDoc)` immediately before `edit_document(targetDoc)`. This is the rejected D3 alternative C, but C was rejected on the grounds of "extra call before every edit" — that "extra call" is exactly what makes the intent explicit and avoids drift.
2. **Emit on read tools too, but only inside `_meta` per MCP spec** — keeps it discoverable for tooling without inflating the model's working set. (Verify whether MCP `_meta` is actually agent-invisible in Claude Code.)
3. **Keep D3 as-is and rely on CLAUDE.md precision.** The wording becomes load-bearing — needs to be stress-tested with a deliberately confusing read-then-edit scenario before shipping.

I independently arrived at C (the rejected alternative). The rejection rationale ("forces an extra call") prioritizes call count over correctness. Worth reopening.

---

## C4 — [HIGH] CLAUDE.md guidance has no enforcement; A4 confidence is LOW; M1 has no instrumentation

**The chain of weakness.**
- A4 ("Agents will reliably read `previewUrl` and navigate") is LOW confidence. Honest.
- M1 (target ≥70% navigation-before-edit) requires correlating tool-call logs that the spec itself notes are "not persistent today — see evidence/observability-gap.md *TBD*."
- D6 (PreToolUse hook) is deferred to Future Work.
- D4 (subscriber-presence warning, the only feedback loop that would tell the agent "you didn't navigate") is also Future Work.

**Net effect.** The MVP ships a hint, no enforcement, and no measurement. After two weeks of dogfooding, the spec author has no data to evaluate A4 — only vibes. The "revisit if CLAUDE.md insufficient" trigger has no evaluation criterion.

**Challenge.** This is a soft-launch with no telemetry. The honest version is one of:
1. **Ship the PreToolUse hook now.** It's a small addition (template hook in `.claude/settings.json` written by `init`). Forecloses the "agents ignore guidance" risk for Claude Code users with one file. Doesn't help non-Claude-Code MCP clients but they're a smaller surface.
2. **Ship the subscriber-presence check now.** `evidence/subscriber-presence-cost.md` quotes ~1–2 days. That's not "Future Work" cost — it's "MVP cost." The recommendation in that evidence file (option b: defer, ship URL only) explicitly trades correctness for shipping speed.
3. **Define M1 instrumentation as in-scope.** A simple in-process counter in the MCP server that records `(tool_name, doc_name, prior_navigation_within_30s)` and dumps to stderr or a file. Without this, A4 cannot be verified or refuted, and "revisit if insufficient" is a non-decision.
4. **Accept that this is a vibes-driven launch** and document it as such.

The spec currently picks (4) implicitly. Recommend explicit choice between (1)–(4) before audit.

---

## C5 — [MEDIUM] D9's "current machine" predicate is unspecified and load-bearing

**What the spec decides.** "Hardcode `localhost` when `lock.worktreeRoot` resolves to a path on the current machine."

**Challenge.** "Resolves to a path on the current machine" has no operational definition. Possible interpretations:
- `existsSync(lock.worktreeRoot)` — fooled by NFS / shared mounts.
- `lock.hostname === os.hostname()` — but the spec says to *ignore* `lock.hostname` (Risk row 3 in §14). Self-contradictory if D9 then uses it implicitly.
- `lock.pid` is alive locally (`isProcessAlive`) — strongest signal but still wrong if the user is SSH-tunneling to a remote dev host.

**Evidence.** Risk table row 3 is marked "Resolved" with mitigation "D9: hardcode `localhost` when `worktreeRoot` is on current machine," but `worktreeRoot` is just a path string — being "on the current machine" is exactly what the lock's `hostname` field was supposed to tell us, which D9 says to ignore.

**Options:**
1. **Use `lock.hostname === os.hostname()` as the predicate** and revise the spec to clarify that `hostname` is read for the *predicate* but not for the URL.
2. **Always hardcode `localhost` when the lock branch fires** and accept that remote-dev-via-SSH is broken (probably fine; not a stated persona).
3. **Probe `127.0.0.1:{port}/health` synchronously** — definitive but adds latency to every tool response. Conflicts with NFR "synchronous and cheap (<1ms)."

Recommend option 2 with an explicit note. Compounds with C1: if the lock branch is dropped, this whole question evaporates.

---

## C6 — [MEDIUM] `previewUrl` is leaked to every MCP client, regardless of who's asking

**What the spec assumes.** "`previewUrl` is emitted to whoever calls the MCP server. For cloud deploy, this leaks the public editor domain — acceptable since it's public by design."

**Challenge.** Two scenarios this misses:
1. **Local dev with a multi-tenant MCP server.** If a user runs `open-knowledge` against their personal notes and connects a third-party MCP client (not Claude Code), that client now receives `http://localhost:{port}/#/personal/...` URLs and has no concept of "navigate the preview." It just sees URLs in tool responses. Mostly harmless, but if the third-party client logs/transmits tool responses, those URLs end up in unexpected places. Low impact since `localhost` URLs don't egress meaningfully — but worth noting.
2. **Cloud deploy with non-public docs.** "URL is public by construction" assumes the cloud deploy is publicly readable. If the cloud deploy is auth-gated (likely for any real customer), the URL alone doesn't grant access — but it does enumerate doc paths, which may be sensitive (`/projects/acquisition-target-q4`).

**Evidence.** Security/privacy NFR is one sentence; doesn't differentiate local vs cloud, doesn't address path-name sensitivity.

**Recommendation.** Add a `preview.emit` config option (`always | local-only | never`) for cloud deploys that want to opt out. Cheap; future-proofs against the auth-gated case. Or explicitly accept the risk in the Decision Log.

---

## C7 — [MEDIUM] Two instruction surfaces (D11) is more risk than benefit

**What the spec decides.** Inject the same guidance into both `CLAUDE_MD_SECTION` (static, in repo) and `buildInstructions` (dynamic, MCP capability).

**Challenge.** This guarantees drift. Two strings, edited by different people at different times, with different review cycles (CLAUDE.md is repo content; buildInstructions is server code). The mitigation noted in D11 ("consider a shared constant") is right but isn't a Decision — it's a hope.

Also: do non-Claude-Code MCP clients actually surface `instructions` to their model in a way the model acts on? Anthropic's MCP spec says clients SHOULD include instructions, but actual behavior across Claude Desktop, Cursor, Cline, etc. varies. If 4 of 5 clients ignore `instructions`, this surface is dead weight.

**Options:**
1. **Single shared constant** (e.g. `PREVIEW_GUIDANCE` exported from `content/init.ts`, imported by `buildInstructions`). Eliminates drift; trivially small change.
2. **Drop buildInstructions injection** until you have evidence non-Claude-Code clients actually consume it. Saves complexity.
3. **Keep both as-is** with periodic sync audits. Highest drift risk.

Recommend (1) at minimum; (2) is defensible.

---

## C8 — [LOW] FR's "encoding round-trip" test is necessary but insufficient

The acceptance criterion says `resolvePreviewUrl("notes/My Doc — 2026")` should round-trip via `docNameFromHash`. Good. But `docNameFromHash` (per `doc-hash.ts:7–20`) does `decodeURIComponent` per segment — meaning a docName with a literal `?` character will be truncated by `docNameFromHash` (it splits on `?` for the anchor query). Test the adversarial cases: `?`, `#`, `%`, leading/trailing slashes, empty segments. None are in the FR.

---

## C9 — [LOW] G4 ("no broken URLs") is unverifiable as stated

G4: "No broken `previewUrl` values ever emitted — if we can't resolve a URL that the user's browser can actually reach, omit the field rather than fake one."

The resolver has no way to know if a URL is "reachable from the user's browser." It can only know if a config/env/lock value exists. C1 (wrong port from lock) directly violates G4 without violating any FR. Either G4 needs a runtime probe (rejected by NFR perf) or G4 should be downgraded to "no syntactically invalid URLs emitted."

---

## C10 — [LOW] Independent arrival: alternative D from §9 was rejected on weak grounds

§9 alternative D ("emit `previewUrl` always, even for non-wiki paths") was rejected: "encourages dead links." But the spec also keeps `previewUrl` on `exec` `enrichedPaths[]` filtered by `content.include` (D10). The asymmetry is subtle — `exec` returns mixed wiki + non-wiki paths, and the spec correctly omits `previewUrl` for non-wiki ones. Fine. But the rejected alternative was specifically about *always* emitting; the current design *conditionally* emits. The Decision Log conflates these — alternative D as written isn't actually what's being rejected. Cosmetic, but a future reader will be confused.

---

## Summary of independent arrivals at rejected alternatives

| Rejection | Independent arrival | Holds up? |
|---|---|---|
| Alt C in §9: separate `get_preview_url` tool | C3 — emit on writes only + dedicated tool for navigation | Rejection does NOT hold; reopen |
| D4: subscriber-presence demoted to Future Work | C4 — A4 LOW + no instrumentation = vibes launch | Rejection holds *only if* C4 instrumentation lands |
| D6: PreToolUse hook deferred | C4 — same chain | Rejection holds *only if* C4 instrumentation lands |

## Summary of new concerns not in Decision Log

| ID | Severity | Concern | Reopens which decision? |
|---|---|---|---|
| C1 | Blocking | Lock-file port ≠ Vite port; lock branch is wrong | FR3, G2, D1, §9 architecture |
| C2 | High | Config-wins priority breaks local-clone-of-cloud-repo | D1 |
| C5 | Medium | D9 "current machine" predicate is undefined | D9, Risk row 3 |
| C6 | Medium | Cloud deploy may not want to leak doc paths | NFR security |
| C7 | Medium | Two instruction surfaces will drift | D11 |
| C8 | Low | Encoding tests miss adversarial chars | FR encoding |
| C9 | Low | G4 unverifiable without runtime probe | G4 |
| C10 | Low | §9 Alt D rejection rationale is muddled | §9 alternatives |

## Recommended next actions

Before audit-step closure, surface to spec author for judgment:
1. **C1 first.** Without resolving this, FR3 and the local-dev story are broken. Pick from C1 options 1–4.
2. **C3 second.** Whether to emit `previewUrl` on read tools is a 1-way door for the public response shape.
3. **C2 + C4 together.** Both speak to "what does the MVP actually deliver vs. what does it claim to deliver."
4. C5–C10 are smaller and can be batched.
