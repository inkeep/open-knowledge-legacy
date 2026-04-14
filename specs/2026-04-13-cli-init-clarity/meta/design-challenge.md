# Design Challenge Findings

**Artifact:** `specs/2026-04-13-cli-init-clarity/SPEC.md`
**Challenge date:** 2026-04-13
**Total findings:** 5 (2 high, 2 medium, 1 low)

The spec is well-structured and the decision log is unusually thorough for its scope — most of the obvious alternatives are already identified and either adopted or rejected with rationale. The challenges below target the framing and architectural placement, not the mechanics.

---

## High-merit challenges (spec should consider)

### [H] Finding 1: Framing treats a defaults problem as a legibility problem

**Category:** DESIGN
**Source:** DC3 (framing validity)
**Location:** §1 Complication, §3 NG5, §9
**Issue:** Nick's verbatim complaint is "*included all my markdown files*" — the surface he describes is scope, not output verbosity. The spec reframes this as three "legibility gaps" and locks in `**/*.md` as the default via NG5 ("NEVER auto-narrow the default include scope"). The Resolution (R1-R3) makes the system *more verbose about a broad default* rather than asking whether the default should be broad.

**Current design:** `**/*.md` at project root remains the default. Preview output explains what that caught; a "how to adjust" hint points to `config.yml`. NG5 rules out any heuristic narrowing as "magic" that "breaks the invariant that what the CLI shows matches what the watcher will index."

**Alternative:** Narrow the default when a strong signal is present — e.g., if `docs/` exists at project root, default `content.dir` to `docs/` (with `**/*.md`); otherwise fall back to current behavior. The invariant NG5 invokes (preview matches watcher) is preserved trivially because the preview reads the same resolved config the watcher uses. "Auto-narrowing" is only "magic" if it's hidden; if the preview explicitly says *"Detected `docs/` — scoped content to `docs/**/*.md` (override with `content.dir` in config.yml)"*, it's legible and scoped.

**Trade-off:** Gains: Nick's actual complaint goes away for the modal case (projects with a conventional `docs/` directory). The preview still explains what happened, but what happened is now *scoped*, not *everything*. Loses: a small rule in config-loading that new users must understand (vs. a literal default). Adds one more piece of behavior to explain — but the current spec already has to explain the preview + how to adjust scope, so the net cognitive load may be lower, not higher.

**Status:** CHALLENGED

**Suggested resolution:** Re-examine NG5. The rejection rationale ("magic narrowing breaks the invariant") conflates *hidden* heuristics with *explicit* ones. A detection rule that's printed in the preview isn't magic — it's a legible default. Consider whether the right split is: (a) ship R1+R2+R3 as-is *and* narrow the default to a detected `docs/` when present, or (b) if narrower defaults are genuinely off-limits for strategic reasons, articulate those reasons in the spec rather than framing them as an invariance constraint.

---

### [H] Finding 2: R4 + D2 build a shared API for a consumer that may never exist

**Category:** DESIGN
**Source:** DC1 (simpler alternative)
**Location:** §2 G4, §6 R4, §10 D2, §12 A4, evidence/ed-4-status.md
**Issue:** Evidence explicitly documents that `projects/day-0-editor-completeness/` does not exist on disk and ED-4 is a forward-looking name with no specced shape. A4 is classified LOW confidence with expiry "Until ED-4 is specced." Yet R4 makes "reusable function consumable by future web onboarding" a **Must** requirement, and D2 places `previewContent()` in `packages/server/` — across a package boundary — specifically to serve that hypothetical consumer. The evidence file even anticipates the risk: *"If ED-4 ends up requiring richer data (progressive enumeration, per-directory grouping), the synchronous `previewContent()` API may need extension."* That's the admission that the API shape is a guess.

**Current design:** `previewContent()` exported from `@inkeep/open-knowledge-server`; CLI imports it; future ED-4 imports it.

**Alternative:** Ship `previewContent()` as a CLI-local helper at `packages/cli/src/content/preview.ts`. It still imports `ContentFilter` from the server package (no duplicated logic, invariant I-A3 is preserved — the invariant is about *behavior parity*, not *module location*). If/when ED-4 materializes and its needs are known, promote the helper to the server package (or to `packages/core/`) with a shape informed by actual requirements. Cost of promotion: a file move + one import rewrite.

**Trade-off:** Gains: no speculative API surface in a library package; simpler mental model (CLI-specific concern lives in CLI); zero coupling between CLI presentation logic and a server-package export; the API shape is designed against a real second consumer rather than a projected one. Loses: R4 ("reusable function") as currently stated can't be claimed as delivered — but the goal R4 serves (I-A3 parity for ED-4) is preserved, just deferred to when ED-4 is real.

**Status:** CHALLENGED

**Suggested resolution:** Weigh the ~30 LOC speculative cost (risk table row 3 already flags this) against the *wrong-shape-lock-in* risk. A shared API designed for one caller tends to ossify around that caller's needs. If ED-4 surfaces progressive/streaming requirements, the synchronous shape is a backwards-compat obstacle even at 30 LOC. Consider downgrading R4 from Must to "organized so that promotion is cheap" and keeping the helper in CLI until ED-4 exists. Separately, consider `packages/core/` over `packages/server/` if the helper *is* promoted — the server package carries Node/Hocuspocus weight that a CLI pre-server process and a browser onboarding flow don't need.

---

## Medium-merit challenges (worth surfacing but spec may have it right)

### [M] Finding 3: R3 (cross-platform `--open`) is scope-grafted onto an init-clarity spec

**Category:** DESIGN
**Source:** DC1 (simpler alternative) / DC3 (framing)
**Location:** §1 Complication ¶3, §6 R3, §10 D1
**Issue:** The spec's Complication weaves R3 into the narrative ("the 'next steps' hint relies on a bridge that doesn't fully exist"), but the causal chain is thin: Nick's complaint is that `init` was unclear — not that `start --open` failed on his platform (he's on macOS per the implicit context; `execFile('open')` works there). D1's rationale for bundling is that R3 "reduces to a small platform-switch (already partially built)," which is a convenience argument, not a coherence argument.

**Current design:** Ship R1 + R2 + R3 as one spec, one PR.

**Alternative:** Ship R1 + R2 (preview + dry-run) as this spec. R3 is a 10-line bugfix in its own right — it doesn't need a spec at all; it's a platform-support bug. Open a tracking issue, fix it, done. This also surfaces R3's real risk (WSL, SSH sessions, headless) in its own context rather than as a footnote in §14.

**Trade-off:** Gains: clean wedges. R1+R2 resolve Nick's complaint directly; R3's success criterion ("works on Linux/Windows") lives with the platform-compat concerns where it belongs. Reduces "PR with everything" risk — if R3's cross-platform testing turns into a rabbit hole (WSL edge cases, headless detection, exit-code semantics), it doesn't block the preview shipping. Loses: one extra PR's overhead; the convenience of batching.

**Status:** CHALLENGED

**Suggested resolution:** This is genuinely a judgment call on batching. The spec is consistent internally; the question is whether the coherence argument ("three legibility gaps at first contact") is strong enough to justify bundling. If R3's cross-platform matrix is already tested and boring, bundle stays fine. If testing R3 surfaces WSL/SSH/headless questions, the spec will accumulate complexity it didn't plan for — and the preview shipping will be held hostage.

---

### [M] Finding 4: `--dry-run` conflates two distinct previews

**Category:** DESIGN
**Source:** DC2 (stakeholder gap — evaluator persona)
**Location:** §5 P2, §6 R2, §10 D6
**Issue:** `--dry-run` in CLI conventions means "show me what side effects would occur" (files written, MCP registered). The spec's dry-run does that *plus* prints the content preview. For P2 (the Evaluator persona who *specifically wants to see content scope before committing*), these are two different questions: "what will init scaffold in `.open-knowledge/`?" vs. "what content will the watcher pick up?" D6 further mutates dry-run by defaulting editor to `claude` (skipping the multiselect), which means dry-run output doesn't faithfully represent what real init would do for that user.

**Current design:** `init --dry-run` = preview content + describe scaffold + describe MCP writes for default editor. One verb, three answers.

**Alternative:** Split the verbs. `open-knowledge preview` (or `open-knowledge content`) — read-only, shows file count/scope/sample, no scaffold described. `open-knowledge init --dry-run` — shows scaffold + MCP effects, doesn't run the content walk unless you also pass `--preview`. This cleanly separates "what scope does the default config produce?" (ongoing question — see Finding 5) from "what would init write to my tree?" (one-shot pre-commit check).

**Trade-off:** Gains: P2's question ("is the default scope sane for my repo?") has a dedicated verb that's cheap to re-run when repo contents change. Dry-run stays faithful to its CLI-convention meaning. D6's editor-multiselect-skipping hack becomes unnecessary because the preview verb doesn't ask about editors. Loses: one more command for users to learn; slight documentation overhead.

**Status:** CHALLENGED

**Suggested resolution:** Cross-reference with Finding 5 (ongoing-use gap). If a standalone `preview` verb is added for the ongoing case, R2 (dry-run) can stay minimal: "scaffold + MCP effects, not content walk." If no standalone verb is added, keeping everything under `--dry-run` is defensible but the D6 hack remains a smell worth explaining in output.

---

## Dismissed (independently arrived at, but rejection holds)

### [Dismissed] Use the npm `open` package instead of inline `execFile` switch

**Why considered:** Cross-platform browser-launch is a solved problem; sindresorhus/open handles WSL, SSH, and headless cases that an inline `execFile` won't.

**Why the spec's rejection holds:** D3's rationale is sound — the inline switch is ~10 lines, covers the three platforms cleanly, and failure is non-fatal (URL is printed). The `open` package brings transitive deps and a larger audit surface for code that ultimately just shells out. The spec explicitly keeps the door open ("revisit if launcher edge cases multiply"), which is the right posture.

### [Dismissed] Spawn Hocuspocus to count files

**Why considered:** Running the server is the only path that *guaranteed* matches what the watcher will index.

**Why the spec's rejection holds:** Over-engineered for read-only enumeration. The evidence shows `ContentFilter` + the same walk the watcher does produces byte-identical results; spawning a server adds startup latency, port conflicts, and failure modes for zero correctness gain.

### [Dismissed] Duplicate ContentFilter logic in CLI

**Why considered:** Would sever the server-package dependency for the CLI's pre-server phase.

**Why the spec's rejection holds:** CLI already depends on `@inkeep/open-knowledge-server` (evidence confirms this is a workspace dep). Duplication would create the exact drift risk invariant I-A3 exists to prevent. Note: Finding 2 challenges D2's *location* but not this rejection — Finding 2 agrees that `ContentFilter` should be reused from the server package, just that `previewContent()` itself can live in the CLI and import it.

---

## Missing dimensions

### [L] Finding 5: No story for the ongoing-use case

**Category:** DESIGN
**Source:** DC2 (stakeholder gap)
**Location:** §3 non-goals (absent), §4 personas (absent), §15 Future Work
**Issue:** The preview renders once — during init, or once during `start`'s auto-init. After that, the user is blind to scope changes. Scenarios the spec doesn't address:
- User adds a vendored `third-party-docs/` directory with 800 markdown files. The watcher picks them up silently. No way to re-check without `rm -rf .open-knowledge/` and re-running init (destructive) or reading config.yml manually (defeats the point of the preview).
- User edits `content.exclude` in config.yml. Did the new pattern actually exclude what they intended? No dry-run for config edits exists.
- User reports "my sidebar got cluttered" after a repo restructure. No support-path answer beyond "read config.yml and count files by hand."

**Current design:** Preview is first-run only, gated by `didAutoInit` on the start path.

**Alternative:** Add `open-knowledge preview` (or `content` or `status`) as a read-only verb that prints the same block on demand. Shares `previewContent()` with init. Cost: ~15 LOC of command scaffolding. Makes the preview a queryable capability, not a one-shot output. This also folds naturally into Finding 4's split-verbs alternative.

**Trade-off:** Gains: the preview becomes a durable support/debugging tool, not just an onboarding artifact. Users have a cheap answer to "did my config change do what I expected?" Loses: one more command in the CLI surface; a small amount of doc overhead.

**Status:** CHALLENGED (flagged as absent dimension, not contested existing design)

**Suggested resolution:** This is adjacent scope but genuinely small. Consider adding it to this spec (one more verb, shared implementation) or explicitly deferring to Future Work with a pointer. The current Future Work section captures `--json` and "interactive scope adjustment" but not the bare query-verb case.

### Configuration discoverability gap (note, not separate finding)

The preview's closing line — *"Adjust: edit .open-knowledge/config.yml"* — tells the user to modify a file they've never seen. Consider including a 2-3-line snippet of the relevant config keys in the preview output (or in `--dry-run` only, to avoid steady-state verbosity), so the user sees the shape of what to edit. This is a small polish and fits under R1's acceptance criteria without scope change.

---

## Confirmed Design Choices (summary)

Held up under challenge:
- **Reuse `ContentFilter`** (not duplicate, not spawn server) — robust rationale, evidence-backed, preserves invariant I-A3.
- **Inline `execFile` switch over sindresorhus/open** — D3's trade-off is well-calibrated; escape hatch documented.
- **Preview failure must not block init (D4)** — correct UX invariant; spec notes it as LOCKED.
- **Preview matches watcher via ContentFilter (Q5)** — investigation was thorough; the answer is structurally correct.
- **5-path sample cap (Q2)** — defensible default; reversible if feedback dictates.
- **No `--json` in v1 (D5)** — appropriate deferral; no P3 demand signal yet.

The spec's decision log is unusually disciplined; the challenges above target framing (Findings 1, 3), architectural placement (Finding 2), and a verb/surface gap (Findings 4, 5) rather than anything mechanical.
