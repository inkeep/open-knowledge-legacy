# Design Challenge — Enriched `exec` MCP Surface

**Reader:** Cold-read challenger (no prior context).
**Scope:** Spec at `specs/2026-04-13-enriched-exec-mcp-surface/SPEC.md`.
**Protocol:** `/eng:spec` + `references/design-challenge-protocol.md`.
**Stance:** Challenge rejections in Decision Log §10 even when the spec addresses them. Independent arrival at a rejected alternative is signal.

---

## Summary of recommendations

| # | Decision | Challenge | Recommendation |
|---|---|---|---|
| 1 | D1 | Single `exec` + pipes elides the report's "hybrid 5-6 semantic + 1 bash" — current direction is exec-biased-hybrid, not the recommended inversion | **REOPEN (soft)** |
| 2 | D2 | L2-lite is inconsistent with internal report; thesis can't be tested without demotion, but spec promises both | **HOLD-WITH-NOTE** |
| 3 | D6 | Liberal allowlist with `awk`/`sed` creates per-command flag-denylist surface that grows a bug surface | **REOPEN** |
| 4 | D7 | `shell-quote` parse-only semantics not verified against hostile shapes (`$IFS`, locale, unicode, heredoc) | **REOPEN** |
| 5 | D10 | Dual-channel worth it only if any current MCP client consumes `structuredContent` — unverified | **HOLD-WITH-NOTE** |
| 6 | D11 | Shrunk enrichment may not beat native bash enough to drive Metric 1 adoption target (>50%) | **HOLD-WITH-NOTE** |
| 7 | D12 | Shadow-repo history in v0 bifurcates with disk-only `gitLog` — two canonical histories | **REOPEN** |
| 8 | D5 | V0-24-only scope excludes V0-26 `list_documents`; DEP-1 already spans both | **HOLD-WITH-NOTE** |
| 9 | Thesis | 15 tools is "functional" per Speakeasy; min-tool-count premise may be over-weighted | **HOLD-WITH-NOTE** |

---

## 1. D1 — Single `exec(command)` with pipes

**Rejection rationale in spec:** §9 Alternatives; Project-doc pitch; Option A (typed `exec_cat`/`exec_ls`/`exec_grep`) "gets MCP structured-arg validation; loses combinatorial pipes and the 'one tool' pitch." Option B (no pipes) forces breaking change later.

**Challenge:** The internal prior-art report (`reports/just-bash-virtual-filesystem-analysis/REPORT.md:54`, :461, :517) recommends "5-6 semantic tools + 1 bash escape hatch = 6-7 tools total." The spec *anchors on* this report for structuredContent refinement (D10) and tool-count calibration, but inverts its architectural conclusion.

What the hybrid actually means, read cold:
- Semantic tools carry the enrichment; `exec` is the **escape hatch** for combinatorial idioms the semantic tools don't cover.
- Enrichment lives on semantic tools; `exec` stays pure (hence report :511–514: "command-level enrichment breaks pipe fidelity").
- Spec inverts: enrichment is on `exec` too (FR7, G4), which is fine technically (MCP-layer wrap, not command-level), but erases the *architectural* distinction the report was recommending. The pitch "exec matches or exceeds semantic tools" (G1) is pulling `exec` toward **replacing** the hybrid, not being a hatch within it.

The neglected alternative: **semantic tools stay canonical + enriched; `exec` ships deliberately lean** (pass-through, no enrichment, no DEP-1). This eliminates:
- DEP-1 complexity (`enrichPath` + `/api/shadow-log`)
- Dual-channel (D10)
- Multi-path enrichment shape (FR14)
- N-amplification risk in `enrichment-data-gaps.md` §2
- The "different history in different modes" risk (FR16)

and isolates XQ1's test cleanly: do agents reach for lean-`exec` for composition and semantic tools for enrichment, or do they default to one?

**Evidence:** `evidence/internal-prior-art-contradicts-direction.md` §1; `REPORT.md:511-514` explicitly warns enriching `exec` creates tension with pipe fidelity; spec's enrichment-on-final-stage mitigation (FR6) works but forecloses the hatch-only framing.

**Assessment:** The rejection of typed-tools (Option A) is sound, but Option E ("lean `exec` + semantic tools stay primary") is **not in the Alternatives list**. This is a genuine omission. It would also shrink the v0 PR by ~60–70%.

**Recommendation:** **REOPEN (soft).** Present Option E explicitly at verify time. If user still chooses enriched-exec, document the explicit trade-off: "we chose exec-biased-hybrid over hatch-only hybrid because [reason]." The rationale in §10 D1 today doesn't address hatch-only.

---

## 2. D2 — L2-lite prompting posture

**Rejection rationale in spec:** "L2-lite sits between report-recommended hybrid and our original L2"; revised 2026-04-13 after internal prior art surfaced (§3 NG5).

**Challenge:** The root XQ1 (project) is: "Does minimum tool count beat semantic tool richness for agent MCP surfaces?" L2-lite explicitly does **not** demote semantic tools — both are "side-by-side by use case." This is a compromise position that doesn't actually test the thesis.

Two tensions:
- (a) If semantic tools are presented equally, agent selection will be dominated by prior tool-use priors (training data on `Read`/`Grep` is enormous; `exec` is novel; semantic tool names are descriptive). L2-lite biases adoption **against** `exec`, then Metric 1 (>50% exec share within 30 days) becomes a test of prompting strength, not surface quality.
- (b) Conversely, the internal report's "hybrid, both audiences" recommendation (REPORT.md:463–466) implies **neither is demoted** — which is L2-lite. So L2-lite is report-aligned, but then Metric 1's >50% target is inconsistent with the prompting that drives it.

Put differently: the spec locks in a prompting level (L2-lite) that matches the report, while setting a success metric that requires the prompting to be more aggressive than the report recommends. One of these is miscalibrated.

**Evidence:** §7 Metric 1 target vs §2 G3 vs `evidence/internal-prior-art-contradicts-direction.md` §1. Spec Risks row ("L2-lite is still too forward-leaning") flags the opposite direction.

**Assessment:** The rejection logic holds for the prompting level choice *in isolation*. But the combination of L2-lite + Metric 1 >50% target creates an internal contradiction: the metric can't be hit without more aggressive prompting, and more aggressive prompting contradicts the report.

**Recommendation:** **HOLD-WITH-NOTE.** Either (a) lower Metric 1 target to something like "≥25% of reads/lists/searches via exec for dual-surface agents" — achievable with non-demotion prompting — or (b) plan a pre-committed prompting escalation (L2-lite → L2-aggressive at 14d if adoption <20%) so the metric has a real path. Spec should flag this contradiction explicitly rather than locking both values.

---

## 3. D6 — Liberal allowlist with `awk` and `sed`

**Rejection rationale in spec:** "Start conservative, expand based on observed denial telemetry" (Risks row); FR3 locks `grep`, `ls`, `cat`, `find`, `head`, `tail`, `wc`, `sort`, `uniq`. Q1 has `cut` tentative; `awk`/`sed` mentioned under "expansion" risk.

**Challenge (direct, not in spec):** Neither `awk` nor `sed` is in the locked Must-list, but Q1 and the "allowlist too restrictive" risk explicitly flag pressure to add them. The user's prompt to me pressure-tests this — and correctly: both commands have write vectors.
- `awk`: `print > "file"` and `printf > "file"` redirect within the language; `system("...")` shells out; `getline` can read arbitrary files.
- `sed`: `-i`/`--in-place`, `w` command (`s/pat/rep/w outfile`), `W` command.
- `find`: already in locked list — has `-exec`, `-execdir`, `-delete`, `-fprintf`, `-fls`.

Parser-level flag denylist per command is the mitigation (see §14 Risks: "Deny all `-o`/`--output-file`-style flags at parser level; test per command"). This is tractable for fixed-flag commands, **not tractable for `awk`/`sed`/`find`**:
- `awk`'s write vectors are inside the program string argument, not flags. Detecting `print >` requires parsing awk programs.
- `sed -i` is a flag, catchable. But `s//w file` is inside the script argument, not a flag.
- `find -exec ls {} \;` is structurally like any other argument group and requires a separate mini-parser.

The rejection assumes "denylist flags at parser level" is sufficient. For `awk`/`sed`/`find`, it is not — the allowlist either accepts write surfaces or needs per-command sub-parsers, which is the bug surface the user questioned.

**Evidence:** Standard POSIX behavior for `awk`, `sed`, `find`; `packages/cli/src/bash/index.ts:186` already uses `execFile` for `grep` (no shell), but args are still command-interpreted.

**Assessment:** The *current* locked set (grep/ls/cat/find/head/tail/wc/sort/uniq) is mostly safe with flag-denylist, but `find` is already a latent write vector via `-exec`/`-delete`. The pressure in Q1 to add `awk`/`sed`/`cut` is where the surface breaks.

**Recommendation:** **REOPEN.** Three actions:
- Lock a v0 allowlist that excludes `find -exec`/`-delete` via flag denylist, with explicit test cases.
- Declare `awk`/`sed` **NEVER** (not NOT NOW) unless we adopt a real shell-command sub-parser. Move them from Q1 expansion-candidate to §3 NEVER.
- Add to FR list: "Parser performs per-command flag validation; any unrecognized flag is **denied** (allowlist, not denylist)." This inverts the model so adding flags is explicit.

---

## 4. D7 — Shell-grammar parser (`shell-quote`)

**Rejection rationale in spec:** D7 is still INVESTIGATING (not locked). Candidates listed: `shell-quote`, hand-rolled, wasm-based.

**Challenge:** `shell-quote`'s `.parse()` returns an AST-ish structure but does *not* execute the shell's own tokenization semantics in all cases. Hostile inputs to consider:
- `$IFS`-based splitting: `cat$IFS/etc/passwd` — does `shell-quote` keep `$IFS` as a variable ref that later evaluates to whitespace? If the parser treats it as a literal variable and our code rejects variables, safe. If it concatenates, unsafe.
- Heredocs: `cat <<EOF ... EOF` — does shell-quote parse the body, or fall back?
- Process substitution: `cat <(echo x)` — `<(` is a subshell by another name.
- Unicode homoglyphs: cyrillic `с` in `сat` — parser sees a different token, executes arbitrary fallthrough.
- ANSI-C quoting: `$'...'` — backslash escapes inside.
- Brace expansion: `cat {a,b,c}.md` — shell-quote returns what exactly? If literal, our extractor may see paths we didn't validate.
- Tilde: `cat ~/foo` — home dir resolution outside contentDir.
- Glob: `cat *.md` — do we expand? Where? (If not, commands that rely on globbing break; if we do, we're a shell.)

The rejection doesn't address any of these. The spec tests fixture in §14 mentions "dedicated hostile-input test file" — but enumeration requires knowing what `shell-quote` *does*, and that should be in evidence before locking D7.

**Evidence:** `shell-quote` docs + source (not inspected in evidence/); general POSIX shell-injection corpora (NIST CWE-78).

**Assessment:** D7 is correctly still INVESTIGATING, so strictly this isn't a locked decision to reopen. But the spec treats D7 as "pick one at impl time" when it should be a spike with a written hostile-input corpus **before** D7 locks.

**Recommendation:** **REOPEN** (elevate D7 urgency). Require an evidence file `evidence/shell-parser-hostile-inputs.md` with each input shape, `shell-quote` behavior, and accept/reject outcome **before** spec verify. This is a 1-way-door security boundary — the spec Quality Bar (references/quality-bar.md) treats security boundaries as must-have.

---

## 5. D10 — Dual-channel enrichment (markdown + structuredContent)

**Rejection rationale in spec:** "MCP spec 2025-11-25 supports dual-channel; markdown serves LLM readers, structured serves harness UIs (V0-26 viewer)." Evidence in `shadow-repo-identity-and-sdk.md` §2 confirms SDK 1.29.0 supports it when `outputSchema` declared.

**Challenge:** The justification relies on "V0-26 viewer" as a consumer. Two verification gaps:
- Is the V0-26 viewer spec **committed** to consuming `structuredContent`, or is it speculative? If the viewer isn't yet designed, we're building a contract for a hypothetical consumer.
- Current MCP clients in the wild (Claude Code CLI, Cursor, Codex, Claude Desktop) — do any of them surface `structuredContent` to the user or agent today? Spec Risks row says "Both channels emitted; no client-side break if unread" — which is *tolerance*, not *value*. If no client reads it, the structured channel is dead weight: every `exec` call pays serialization cost, schema maintenance cost, and doubled-source-of-truth cost for zero consumer benefit.

The duplication also introduces a **consistency invariant** that isn't specified: if `content[0].text` contains "Referenced files: foo.md, bar.md" and `structuredContent.enrichedPaths` contains `[foo.md]`, who's right? The spec doesn't call out that the two channels must match, and drift is easy (e.g., markdown truncates at N paths but structured doesn't).

**Evidence:** `evidence/shadow-repo-identity-and-sdk.md` §2 confirms SDK support only; no evidence of client consumption.

**Assessment:** Rejection rationale ("cleaner for machine consumption") is aspirational, not verified. For v0 Reach-tier, single-channel markdown is simpler and sufficient.

**Recommendation:** **HOLD-WITH-NOTE.** Keep D10 but add an Assumption row: "A7: Some MCP client in use (Claude Code, Cursor, Codex, Desktop) reads `structuredContent` for tool responses within 90 days." Expiry: 90 days post-ship. If unused, demote to single-channel at v1 cleanup. Also add an FR: "markdown `### Referenced files` and `structuredContent.enrichedPaths` derive from one builder function — no independent formatting paths."

---

## 6. D11 — Shrunk v0 enrichment (no `modified`, no multi-path `backlinkCount`)

**Rejection rationale in spec:** "Avoids widening DEP-1 scope + N-amplification latency; preserves Reach-tier ship speed." `exec("cat X")` single-path enrichment unaffected.

**Challenge:** Metric 1 is ">50% of reads/lists/searches via exec within 30 days." For single-path reads, `exec("cat X.md")` matches or exceeds `read_document` (good). For **multi-path** outputs — `ls`, `grep`, `find` — the enrichment is title + description + tags + catalogCategory + path. Missing: backlinkCount, modified time.

The question: does this meaningfully beat native `ls`/`grep`? The agent already has:
- `ls` → filenames (and with `-l`, modified time + size).
- `grep` → filename + line + match text.

Our enrichment adds frontmatter and catalog. For a coding agent doing "find all files in `articles/` about X," this is valuable *if* frontmatter is populated (many wiki files). For a coding agent doing `ls docs/` on a repo with sparse frontmatter, the enrichment adds little over native `ls` with `-l`.

The shadow-repo history (D12) is in scope for **single-path** reads. So `exec("cat X.md")` gets the rich history; `exec("ls articles/")` does not. The differentiator that the spec leans on (history) is exactly the multi-path case the spec excludes.

**Evidence:** §7 Metric 1 target vs FR14 shape; `evidence/enrichment-data-gaps.md` on N-amplification.

**Assessment:** The rejection trades a real risk (N-amplification latency) for a real risk (under-differentiation). It's a judgment call, but the spec Risks row already flags "insufficient to drive adoption" as MED/MED. The mitigation cites D12 shadow-repo history — but FR14 excludes that from multi-path. So the mitigation doesn't apply where the risk hits hardest.

**Recommendation:** **HOLD-WITH-NOTE.** Either (a) accept that Metric 1 will likely miss and re-scope to "single-path reads match/exceed," or (b) add a minimal multi-path enrichment that *includes* the last-writer id (the cheap fragment of shadow-repo history) without the full log. One more field for multi-path, N calls amortized against branch-head SHA cache (already in Risks mitigation).

---

## 7. D12 — Shadow-repo history in v0 (and FR16 disk-only fallback)

**Rejection rationale in spec:** Locked 2026-04-13. "Shadow-repo agent-attribution history is the primary differentiator" (§14 Risks mitigation). FR16 falls back to `gitLog` disk-only when Hocuspocus unreachable; `historySource` field tells the agent which source.

**Challenge:** Two histories become canonical, gated by runtime mode:
- Integrated mode (Hocuspocus running): shadow-repo history (agent attribution, writer IDs, branch context).
- Disk-only mode (`open-knowledge mcp` without server): `gitLog` (commit history, author email).

The agent's workflow may straddle both modes (CI without server; local with server). Questions:
- If the user reviews a document's history via `exec("cat X.md")` once with server and once without, the two answers differ in schema *and* content. FR16 adds `historySource` — but downstream agent reasoning ("last writer was Tim") will be wrong depending on mode.
- What if the shadow-repo and project git log **disagree** about a given commit's authorship? The spec Risks row flags this (LOW-MED / LOW) but mitigation is just "documentation notes the distinction." That's not a mitigation; it's an acknowledgment.

Canonical-source question: which history is *truth*? If shadow-repo is the agent-attribution ground truth, disk-only mode serving git log is serving an inferior answer. If git log is ground truth, shadow-repo is a side index. The spec leaves this ambiguous.

**Evidence:** SPEC §6 FR15/FR16; §14 Risks row "Shadow-repo + git log disagree"; `packages/server/src/shadow-repo.ts` (bare repo at `.git/openknowledge/`).

**Assessment:** The bifurcation is real and the mitigation is weak. For a spec that treats history as "the primary differentiator," the source-of-truth question should be resolved.

**Recommendation:** **REOPEN.** Options:
- (a) Canonicalize shadow-repo: `exec` in disk-only mode returns a clear error "history unavailable without server" for the history field — agent knows to not reason about writers. Cleaner contract.
- (b) Canonicalize git log: shadow-repo data is exposed in a *different* field (`agentActivity` as a side-channel), and `recentChanges` always means git log. No runtime-mode divergence in any given field.
- (c) Accept bifurcation but add FR: `historySource` is load-bearing, and tool description warns agents to key any attribution reasoning on the `historySource` value.

Current FR16 is closest to (c) but the spec doesn't treat `historySource` as load-bearing contract.

---

## 8. D5 — V0-24-only scope (excludes V0-26 `list_documents` enrichment)

**Rejection rationale in spec:** "Keep spec focused; V0-26 gets its own spec/implementation." DEP-1 is noted as cross-cutting but the spec deliverable excludes V0-26's un-enriched tool.

**Challenge:** DEP-1 in §16 Agent Constraints mandates migrating `read_document.ts` and `search.ts` to the shared helper (D13). `list_documents` is the **lone un-enriched tool** in the 5/6/7 current semantic set. If DEP-1 lands without `list_documents`, we've deliberately left one surface out of the shared helper — which (a) contradicts D4's "single source avoids CC9 drift" rationale, and (b) creates a second refactor PR later for one tool.

From an implementer's view: if DEP-1 is touching `read_document` and `search`, adding `list_documents` is an incremental cost, not a doubling. The scope discipline (D5) forecloses a low-cost win for a clean abstraction boundary argument. Also, V0-26's explicit goal is `list_documents` enrichment — punting it to a separate spec creates a timeline dependency + context-reload cost.

**Evidence:** SPEC §8 "Known gaps / bugs: no shared enrichment helper → drift risk"; `evidence/worldmodel.md` §1a (tool #10 `list_documents`).

**Assessment:** D5 is a reasonable scope boundary in isolation, but DEP-1's shape (included in THIS spec's constraints per §16) spans both V0-24 and V0-26. The spec is already doing V0-26 work; explicitly excluding `list_documents` is inconsistent.

**Recommendation:** **HOLD-WITH-NOTE.** Either (a) explicitly include `list_documents` in DEP-1's SCOPE (§16), keeping the "consume" side in V0-26 spec while letting the "produce" side land once; or (b) keep D5 but add a note that DEP-1 is a V0-24 AND V0-26 shared dep and the V0-26 spec should schedule closely after.

---

## 9. Thesis — "One exec tool" / min-tool-count

**Rejection rationale in spec:** Anchor on Dust.tt + root XQ1; the spec *is* testing this thesis.

**Challenge:** Per `evidence/internal-prior-art-contradicts-direction.md` §2, 15 tools is in the Speakeasy "functional" band (10: perfect, 20: 19/20, 50+: degraded). Our current 15 is not near the danger zone. The root XQ1 premise ("does min-tool-count beat semantic richness?") assumes the tool count is a live cost — for us, it may be a marginal one. Meanwhile:
- Agent compatibility research (same report) finds GitHub Copilot's 40→13 cut yielded 2–5% benchmark improvement, not a step-change.
- Well-named, non-overlapping tools at 15 count are different in kind from 40+ overlapping tools.
- Our semantic tools (`read_document`, `search`, `list_documents`) *do* overlap with native `Read`/`Grep`/`Glob` that agents already have — but `exec` also overlaps with native `Bash`. Adding `exec` doesn't *reduce* overlap.

The unchallenged assumption: that `exec` is a step toward fewer tools. In reality, shipping `exec` **adds** a 16th tool without removing any (D5 defers deprecation). The tool count increases in v0. Only in the Future Work "Identified" tier (§15) does deprecation land. So the immediate test is "does adding exec while keeping semantic tools improve agent outcomes?" — a different question from XQ1.

**Evidence:** `evidence/internal-prior-art-contradicts-direction.md` §2; §7 Metric 1; §15 Future Work / Identified.

**Assessment:** The thesis is a valid long-term research question. The v0 scope doesn't actually test it — it tests "does an additional enriched-bash surface displace usage of semantic tools." That's a weaker claim and worth stating honestly.

**Recommendation:** **HOLD-WITH-NOTE.** Rename the success framing in §7 from "tests XQ1" to "measures displacement ratio; informs XQ1 but doesn't resolve it." The actual XQ1 resolution requires the §15-Identified deprecation step, which is post-telemetry. Update problem statement §1 similarly.

---

## Top-3 most-likely-to-matter (returned to caller)

See final assistant message.
