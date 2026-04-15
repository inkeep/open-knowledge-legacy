# Evidence: D8.1–D8.4 — Auto-Commit, Message Generation, Terminology, Safety Nets

**Dimensions:** D8.1 Auto-commit/sync, D8.2 Commit message generation, D8.3 Terminology abstraction, D8.4 Safety nets
**Date:** 2026-04-14
**Sources:** Obsidian-Git source, TinaCMS source/docs, Logseq forum/source, SiYuan/Dejavu source, Joplin docs, VS Code docs, GitLens docs, JetBrains docs

---

## Key files / pages referenced

- Obsidian-Git `src/automaticsManager.ts` — interval + debounce scheduling
- Obsidian-Git `src/constants.ts` — default settings
- Obsidian-Git `CHANGELOG.md` — v2.27.0 terminology rename
- TinaCMS `packages/tinacms-gitprovider-github/src/index.ts` — commit-on-save
- Logseq: https://discuss.logseq.com/t/a-simple-script-to-commit-and-push-automatedly-for-the-desktop-app/418
- Logseq: https://github.com/logseq/git-auto
- SiYuan/Dejavu: https://github.com/siyuan-note/dejavu/blob/main/sync.go — 7-minute rule, AES-256
- Joplin: https://joplinapp.org/help/apps/conflict/ — conflict notebook
- VS Code Copilot: https://code.visualstudio.com/docs/copilot/copilot-smart-actions — AI commit messages
- GitLens: https://github.com/gitkraken/vscode-gitlens/discussions/2581 — AI commit feature
- JetBrains: https://www.jetbrains.com/help/ai-assistant/ai-in-vcs-integration.html — AI commit messages

---

## Findings

### Finding: Auto-commit trigger spectrum from interval-based to event-based to API-mediated
**Confidence:** CONFIRMED
**Evidence:**

| Tool | Trigger | Default interval | Push included? |
|------|---------|-----------------|----------------|
| Obsidian-Git | Timer interval OR file-change debounce | 0 (disabled) | Configurable separately |
| Logseq | Timer interval | 60 seconds | No (external script) |
| TinaCMS | User click ("Save") | N/A (manual trigger) | Implicit (API commit) |
| SiYuan | Custom snapshot engine | N/A | Integrated via Dejavu |
| Joplin | Sync backend polling | "Within seconds" upload, minutes download | Integrated via sync provider |

### Finding: Commit message auto-generation spans four approaches with distinct trade-offs
**Confidence:** CONFIRMED
**Evidence:**

| Approach | Tool | Semantic value | Consistency | Cost |
|----------|------|---------------|-------------|------|
| Timestamp template | Obsidian-Git (`"vault backup: {{date}}"`) | Low | High (deterministic) | Free |
| Fixed label | TinaCMS (`"Edited with TinaCMS"`), Logseq (`"Logseq auto save"`) | Low | High | Free |
| Template + variables | Obsidian-Git advanced (`{{date}}`, `{{hostname}}`) | Medium | High | Free |
| AI-generated from diff | GitHub Copilot, GitLens, JetBrains AI | High (diff-aware) | Medium (model-dependent) | LLM cost |

GitHub Copilot: customizable via `github.copilot.chat.commitMessageGeneration.instructions` (array of strings or file path). Checks git history to match existing style. GitLens: `gitlens.experimental.generateCommitMessagePrompt` supports OpenAI/Anthropic/Gemini. JetBrains: customizable via Prompt Library with `$GIT_BRANCH_NAME` variable.

### Finding: Terminology abstraction follows a clear spectrum from fully hidden to fully exposed
**Confidence:** CONFIRMED
**Evidence:**

```
Fully hidden ←————————————————————————→ Fully exposed
Joplin   TinaCMS   Logseq   Obsidian-Git(basic)   Obsidian-Git(advanced)
```

- Joplin: "Synchronise" button, "Conflicts" notebook, "Previous versions" — zero git terms
- TinaCMS: "Save", "Branch" (simplified), "Pull Request" (link only) — near-zero git terms
- Logseq: "Version control", "Git auto commit" — hybrid
- Obsidian-Git basic: "Commit-and-sync" as primary action (v2.27.0 rename from "backup")
- Obsidian-Git advanced: "hunks", "Line Author", "Sync method" (merge/rebase/reset)

### Finding: Safety nets cluster around pull-before-push and no-force-push patterns
**Confidence:** CONFIRMED
**Evidence:**

| Tool | Pull-before-push | Force-push blocked | Per-device push disable | Backup before destructive |
|------|-----------------|-------------------|----------------------|--------------------------|
| Obsidian-Git | Yes (default) | Yes (no UI surface) | Yes (`disablePush`) | No |
| TinaCMS | N/A (API) | Architecturally impossible | N/A | N/A |
| SiYuan | N/A | N/A | N/A | 7-minute temporal guard |
| Joplin | N/A | N/A | N/A | Conflict copy preserved |

Obsidian-Git additionally uses `promiseQueue` for sequential execution (prevents index lock races) and requires "YES" confirmation for `delete-repo`.

---

## Gaps / follow-ups

- Obsidian-Git's `commitMessageScript` on desktop enables arbitrary message generation — could bridge the gap between template and AI approaches
- Logseq's fixed "auto save" message creates navigation difficulties per community feedback (https://discuss.logseq.com/t/custom-commit-message/9395)
