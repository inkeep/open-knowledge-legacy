# Design challenge — Per-Doc Body Templates SPEC

**Challenged:** specs/2026-04-30-per-doc-body-templates/SPEC.md
**Date:** 2026-04-30
**Challenger:** self-challenge (cold-reader subprocess permission denied; performed by primary author with adversarial discipline)

The job: independently arrive at design alternatives the spec rejected, and challenge whether the rejections hold.

---

## Challenge C1 — Why two fields instead of one auto-detecting field?

**Spec choice:** `body:` (inline string) + `bodyPath:` (file-ref). D1 LOCKED.

**Independently considered alternative:** A single `body:` field whose value is auto-detected:
- If it starts with `./` or `.open-knowledge/` and exists on disk → treat as file-ref
- Else → treat as inline content

**Does the rejection hold?** Yes — surfaced in §9 Alternatives but worth restating. The auto-detect is ambiguous: a 7-character `body: daily.md` is ambiguous between "use the literal string `daily.md`" and "load `./daily.md`." Two fields makes the decision explicit and machine-checkable. Reaffirm.

**Recommendation:** Keep two fields. No spec change.

---

## Challenge C2 — Why moment.js syntax for dates? Moment is in maintenance mode.

**Spec choice:** `{{date:FORMAT}}` uses moment.js format tokens (D6 LOCKED). Q4 delegates dayjs-vs-inline to implementer.

**Independently considered alternatives:**
- ISO-only: `{{date}}` always renders ISO 8601; users can't customize format → too rigid for daily journals where users want "Wednesday, April 30th 2026" headings.
- date-fns format tokens: `yyyy-MM-dd`, more "modern" but unfamiliar to most users; differ from moment in subtle ways.
- Temporal API: future-proof but not yet stable in target Node versions.

**Does the rejection hold?** Yes. Moment.js tokens are the canonical "format string" syntax in the Obsidian/Templater/Periodic-Notes universe — exactly the audience this spec targets. dayjs (lightweight modern alternative) explicitly mirrors the same tokens for compatibility. The actual library used in implementation can be dayjs or inline; the public token surface is "moment-compatible," which is stable even if Moment.js itself isn't actively developed. Reaffirm D6.

**Recommendation:** Keep moment-compatible tokens as the public surface. Q4 already delegates the lib choice.

---

## Challenge C3 — Why apply templates from MCP write paths AT ALL?

**Spec choice:** Templates apply on `POST /api/create-page` AND MCP `write_document`/`create_page` (D3, D4). Agent body (when non-empty) wins.

**Independently considered alternative:** Only apply templates from the editor "new file" path. MCP write_document is "agent intent" and should be verbatim — no template magic.

**Argument for the alternative:**
- Predictability: an agent expects what it sends to be what's written. Templates inserting content not in the request payload could surprise downstream agent logic.
- Attribution: when template-substituted content lands in a file via an agent's `write_document`, the file appears authored by the agent including content the agent never wrote. This is awkward for compounding-knowledge workflows.
- One materialization site (editor only) is simpler.

**Argument for spec's choice:**
- Symmetric UX: the user's "every new clip in `external-sources/` should have this scaffold" intent should hold regardless of which surface creates the file.
- The "body is empty" gate (D5) means agents that DO want explicit content win — their body wins. The template applies only when the agent explicitly didn't supply body content.
- Persona P3 (LLM agent) is exactly the surface that benefits — agents calling create_page on behalf of a user inherit the user's shape preferences without re-implementing scaffolds per agent.

**Does the rejection hold?** Tension is real. The spec's choice is defensible but worth a clearer statement of WHY agent-create-with-empty-body should opt INTO templating rather than opt out. The current framing (D4 + persona P3 success) leans on "agents inherit user shape preferences" — that's the right framing.

**Refinement:** Add to §10 D4 rationale: *"Agent-side create_page with no body is the dominant 'I'm creating a doc on behalf of the user' shape; opting into templating by default matches user expectations. Agents that want strict-verbatim creation supply a non-empty body (which always wins). The 'empty body' gate is the agent's opt-out mechanism."*

**Recommendation:** Apply the rationale clarification. **APPLIED below.**

---

## Challenge C4 — Frontmatter virtual-vs-materialized asymmetry creates a dual-truth file shape

**Spec choice:** D2 LOCKED — frontmatter remains virtual overlay; body templates are the FIRST materialize-at-create feature. Asymmetry tracked in Q1.

**Independently considered scenario:** User has rule:
```yaml
- match: "journals/daily/**"
  frontmatter:
    tags: [journal, daily]
  body: |
    # {{date}}

    ## Today
    -
```

User creates `journals/daily/2026-04-30.md`:
- File on disk: `# 2026-04-30\n\n## Today\n-\n` (no frontmatter)
- MCP `read_document` response: includes virtual frontmatter `{tags: [journal, daily]}`
- Editor view: shows just `# 2026-04-30\n\n## Today\n-\n` — no tags visible

The user's mental model: "I added `tags: [journal, daily]` to the rule." Reality: agents see the tags via MCP enrichment; the editor user does not. If the user later edits the file and saves, the on-disk file still has no frontmatter — the editor never had the tags to write back.

**Does the spec's choice (defer migration) hold?**

The asymmetry IS confusing for the specific case where the rule has BOTH `frontmatter:` AND `body:` set. The rule has both = "I want both materialized." But the spec materializes only `body`. This is a real UX gap.

**Refinement options:**
1. **Materialize rule's `frontmatter:` ONLY when `body:` (or `bodyPath:`) is also set on the same rule.** This narrowly closes the dual-truth case for templated rules without migrating the global "frontmatter is virtual overlay" semantic. Rules with frontmatter-only stay virtual-overlay-only (legacy behavior); rules with body+frontmatter materialize both.
2. **Always materialize when creating a new file** (full migration) — broader scope, fits Q1's open question.
3. **Keep the spec as-is** — accept the asymmetry; Q1 is the future-spec hook.

**Recommendation:** Surface this as a real design question. Option 1 (narrow materialization when body template is set) is a defensible middle path that preserves backwards-compatibility while closing the dual-truth gap for the specific case where the user opted into templating. It's a small scope expansion within this spec. The user (Tim) should decide.

**Action:** Promote this to §11 Q1 with the three options + recommendation, asking the user (Tim) to direct. **APPLIED below — Q1 elevated.**

---

## Challenge C5 — Why "last-match-wins"? Hugo uses most-specific-wins.

**Spec choice:** Last-match-wins among `folders[]` rules (D10).

**Independently considered alternative:** Most-specific-glob-wins (Hugo + most config-driven systems). The rule with the longest non-glob prefix or fewest wildcards wins. More predictable — declaration order shouldn't matter.

**Argument for spec's choice:**
- Existing OK semantic for `folders[].frontmatter` is last-match-wins.
- Aligning body templates with the existing precedence keeps one mental model.
- Users already think about declaration order when authoring config.yml's folder rules.

**Does the rejection hold?** Yes. Changing precedence semantics for body templates would create a worse asymmetry than the frontmatter-virtual-vs-materialized one — within the SAME rule, two fields would resolve via two different precedence rules. Reaffirm D10.

**Recommendation:** Keep last-match-wins. No spec change.

---

## Challenge C6 — `{{user}}` resolution to agent display name might leak unwanted context into user files

**Spec choice:** D11 fallback chain: principal-identity display name → agent display name → `"file-system"` → empty.

**Independently considered scenario:** User creates daily journal via Claude Code MCP. `{{user}}` resolves to "Claude Code" (agent display name). User's daily journal frontmatter ends up with `author: Claude Code` — semantically wrong; the user is the user, not the agent.

**Refinement options:**
1. Resolve `{{user}}` ONLY to principal-identity; fall back to empty (no agent name leak).
2. Add a separate `{{agent}}` variable for agent display name; keep `{{user}}` strict.
3. Keep current chain — accept the semantic.

**Recommendation:** Option 1 is the cleanest user-mental-model match: `{{user}}` = the human owning the file. If no principal identity is established (e.g., file-system writer), resolve to empty and warn. Document in spec.

**Action:** Add to §11 as Q5 (new), or refine D11. Going with refining D11 since this is a small change. **APPLIED below — D11 refined to "principal display name → empty (with `body-template-user-unresolved` warn)." Agent display name is OUT of the chain.**

---

## Challenge C7 — Should there be a max-template-render-depth or recursion guard?

**Spec choice:** No explicit recursion guard. Variable substitution is one-pass string replacement (D6 + FR-4 + FR-5).

**Independently considered scenario:** A template includes `{{date}}` and the substitution produces a string that itself contains `{{...}}`. With single-pass replacement, the result is treated as literal — no recursion happens. So there's no recursion to guard against.

**Does the spec hold?** Yes — single-pass is implicit in the design and the warn-on-undefined behavior. Worth making explicit for the implementer.

**Recommendation:** Add a brief note to FR-4 acceptance: *"Substitution is single-pass — substituted values are NOT re-scanned for `{{...}}`."* **APPLIED below.**

---

## Summary of design challenges

- **C1 (two-fields):** Reaffirm. No change.
- **C2 (moment.js syntax):** Reaffirm. No change.
- **C3 (MCP write_document templating):** Defensible; add rationale clarification to D4. **APPLIED.**
- **C4 (frontmatter dual-truth):** Real gap; promote Q1 to surface 3 options for user direction. **APPLIED.**
- **C5 (last-match-wins):** Reaffirm. No change.
- **C6 (`{{user}}` agent name leak):** Real semantic gap; tighten D11 to principal-only. **APPLIED.**
- **C7 (recursion guard):** Implicit; add explicit note to FR-4. **APPLIED.**

No challenges reopen LOCKED decisions; all surfaced refinements are surgical extensions or clarifications consistent with the spec's spirit.
