# Evidence: D4 — Alternative short-name candidates

**Dimension:** D4 — Evaluate `oknow`, `oknw`, `wiki`, `kb`, `onk`, `ink`, `know`, `openkb` as alternatives.
**Date:** 2026-04-16
**Sources:** local `npm view` + `brew info` probes, subagent web research

---

## Key sources referenced
- `npm view <candidate>` for each
- `brew info <candidate>` for each
- https://github.com/fedwiki/wiki
- https://github.com/vadimdemedes/ink
- https://manpages.debian.org/unstable/ink/ink.1.en.html
- https://en.wikipedia.org/wiki/Kilobyte (KB as SI unit)
- https://www.okx.com/en-us/learn/okb (for OKB cross-check)
- https://github.com/VectifyAI/OpenKB (PyPI `openkb` CLI)
- https://github.com/mrvautin/openKB (npm `openkb` KB/wiki web app)
- Subagent Debian/Arch checks

---

## Findings

### Finding: `wiki` — HARD collision
**Confidence:** CONFIRMED
**Evidence:**
- npm `wiki@0.39.4` (Federated Wiki) has `bin: wiki` — **active**, 126 versions, ships a CLI that starts a local MediaWiki-like server on port 3000. https://github.com/fedwiki/wiki
- Homebrew formula `wiki` exists (deprecated, scheduled disable 2026-09-12): fetches MediaWiki summaries.
```text
$ brew info wiki
==> wiki: stable 1.4.1 (bottled)
https://github.com/walle/wiki
Deprecated because it is not maintained upstream! It will be disabled on 2026-09-12.
```
**Implications:** Users on npm globally installed Federated Wiki would have `ok` — sorry, `wiki` — already taken. Brew formula is deprecated but live until Sept 2026. Worst name on this list for real PATH/bin collisions.

### Finding: `ink` — HARD collision (system + brand)
**Confidence:** CONFIRMED
**Evidence:**
- Debian package `ink` ships `/usr/bin/ink` (man page: https://manpages.debian.org/unstable/ink/ink.1.en.html). It's a printer ink-level checker using libinklevel (supports Canon, Epson, HP, Sony). Present in Debian stable and unstable.
- npm `ink@7.0.0` is Vadim Demedes' "React for CLI" framework — one of the most recognized CLI-authoring libraries in the JS ecosystem. README lists use by Gatsby, Parcel, Yarn, Terraform, Prisma, Shopify, NYT. `ink` has no `bin` field, but the brand association is massive — anyone searching "ink cli" finds Ink.js first.
**Implications:** Any CLI named `ink` collides with a real Linux system binary AND with arguably the most famous CLI-authoring brand in JavaScript. Double whammy — immediate "no."

### Finding: `kb` — HARD collision (acronym overload)
**Confidence:** CONFIRMED
**Evidence:**
- npm `kb@0.0.5` has `bin: kb` (obscure — Chinese dev, 2 dependencies, no stars in the ecosystem).
- No Debian, Arch, or Homebrew package.
- Crucially: "KB" is an overloaded acronym in computing: kilobyte (IEC/SI standard — https://en.wikipedia.org/wiki/Kilobyte), keyboard, knowledge base. Every developer reads "kb" as one of these three meanings first.
**Implications:** Even absent a hard PATH collision, the cognitive load is severe — "knowledge base" is only the third-most-likely parse. Search engines disambiguate poorly.

### Finding: `onk` — SOFT collision
**Confidence:** CONFIRMED
**Evidence:**
- npm `onk@1.2.1` has `bin: onk` — a Vue scaffolding tool (Chinese dev, very low popularity). Would block an unscoped `onk` publish, but scoped packages (`@inkeep/...`) are unaffected.
- No apt/brew/Arch package.
- No strong brand or acronym meaning.
**Implications:** Essentially clear for the scoped-package + bin shipping pattern. Downside: phonetically awkward ("oh-en-kay"), no mnemonic anchor — reads as letter-salad. Memorability weak.

### Finding: `oknow` — CLEAR, but 5 chars
**Confidence:** CONFIRMED
**Evidence:**
- npm `oknow@1.0.0` is an abandoned promise library, no `bin` field.
- No apt/brew/Arch collision.
- No brand.
**Implications:** Safe. Pronounceable ("oh-know" — plays on "open knowledge"). But 5 characters — same length as `claude`, barely shorter than `oknwl` or a hypothetical `okbase`. Not a major brevity win over something like `ok`.

### Finding: `oknw` — CLEAR, but unpronounceable
**Confidence:** CONFIRMED
**Evidence:**
- No npm package found.
- No apt/brew/Arch package.
- No brand meaning.
**Implications:** Mechanically clear, but reads as letter-salad. Violates the "pronounceable or known initials" heuristic from D3. Hard to speak aloud ("oh-kay-en-double-you"). Poor brand.

### Finding: `openkb` — HARD collision (PyPI CLI + npm semantic competitor)
**Confidence:** CONFIRMED
**Evidence:**
- **PyPI `openkb`** — [VectifyAI/OpenKB](https://github.com/VectifyAI/OpenKB), "Open LLM Knowledge Base." Python, installed via `pip install openkb`. 179 GitHub stars. Ships the `openkb` bin with subcommands `openkb init`, `openkb add`, `openkb query`, `openkb chat`, `openkb watch`, `openkb lint`, `openkb list`, `openkb status`. Active development (90+ commits).
- **npm `openkb@1.0.22`** — [mrvautin/openKB](https://github.com/mrvautin/openKB), "Open Source Nodejs Markdown based knowledge base/FAQ/Wiki app with powerful lunr search." 29 versions. No `bin` field (it's an `npm start` web app, not a PATH binary), but keywords list `knowledge base, markdown, kb, documentation, faq, wiki, openkb` — direct semantic overlap with Inkeep's product space.
- **GitHub repo forks** — multiple independent forks named `openKB` (noduslabs, go-faast, pillows). The name "openKB" is established in the OSS knowledge-base naming space.
- **No Homebrew formula.** `brew info openkb` returns "No available formula" (suggests `openvdb`, `opencbm`, etc. — unrelated).
- **No Debian/Ubuntu/Arch package.** Clear at distro level.
**Implications:** This is the **most severe collision on the entire candidate list**. The PyPI tool is not just a brand collision — it literally claims the `openkb` PATH entry via `pip install`, with an almost-identical subcommand vocabulary (`openkb init`, `openkb add`, `openkb query`). Any user who has both Python (near-universal in the AI-dev audience) and runs `pip install openkb` then `npm install -g @inkeep/open-knowledge` will have two `openkb` binaries fighting for the same PATH slot, whichever got installed later wins, with no warning. The semantic collision is worse: VectifyAI's OpenKB is *also* an LLM-oriented knowledge-base tool. Users would confuse the two products in search, support threads, and demos.
**Severity:** **HARD**

---

### Finding: `know` — CLEAR
**Confidence:** CONFIRMED
**Evidence:**
- npm `know@1.1.4` is an abandoned data-structure cache, no `bin` field.
- No apt/brew/Arch collision.
- Weak brand (common English verb).
**Implications:** Mechanically safe but loses the brevity goal and overlaps with generic English ("I know").

---

## Summary Table (severity ascending)

| Candidate | Severity | Collision / issue |
|-----------|----------|-------------------|
| `oknw`    | CLEAR    | None — but unpronounceable |
| `oknow`   | CLEAR    | None — 5 chars, weak brevity win |
| `know`    | CLEAR    | None — generic English |
| `onk`     | SOFT     | Obscure npm vue-scaffold with `bin: onk` |
| `kb`      | HARD     | "KB" = kilobyte/keyboard/knowledge base overload |
| `wiki`    | HARD     | npm `wiki` (Federated Wiki, active) has `bin: wiki`; brew formula (deprecated) |
| `ink`     | HARD     | Debian `/usr/bin/ink` printer util + Ink.js React-for-CLI mega-brand |
| `openkb`  | **HARD** | PyPI `openkb` (VectifyAI) ships same bin + same `init/add/query/chat` subcommands + same LLM-KB domain; npm `openkb` is active KB/wiki web app |

---

## Gaps / follow-ups
- Did not explore `onk` or `oknw` mnemonic fit beyond "letter-soup with no anchor" — the pronounceability heuristic from D3 was enough to deprioritize.
- Did not evaluate novel candidates like `osk`, `okd`, `okn` (these were not in the rubric). Could be a follow-up.
