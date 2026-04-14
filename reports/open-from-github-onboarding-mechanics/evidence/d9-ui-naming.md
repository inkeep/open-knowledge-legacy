# Evidence: D9 — UI naming & information architecture

**Dimension:** What the feature is called and where it lives in the UI
**Date:** 2026-04-14
**Sources:** VSCode, GitHub Desktop, Zed, Obsidian-Git, gh CLI

---

## Findings

### Finding: "Clone" is the dominant verb across all editors studied
**Confidence:** CONFIRMED
**Evidence:**

| Editor | Primary label | Source |
|---|---|---|
| VSCode | **"Git: Clone"** | `extensions/git/package.nls.json`: `"command.clone": "Clone"` |
| VSCode QuickPick | "Clone from {provider}" / "Clone from URL" | `extensions/git/src/cloneManager.ts:30-35` |
| GitHub Desktop | **"Clone a Repository"** (mac) / "Clone a repository" (win) | `app/src/ui/clone-repository/clone-repository.tsx:262-289` |
| Zed | **"Clone Repository"** (command palette action) | `zed/crates/git_ui/src/git_ui.rs:195-201` |
| Obsidian-Git | **"Clone an existing remote repo"** | `obsidian-git/src/commands.ts:379-382` |
| gh CLI | `gh repo clone` | `pkg/cmd/repo/clone/clone.go:33-109` |

None of these use "Open from GitHub" as the canonical label. "Clone" is the industry-standard term because it maps to the `git clone` mental model users already have.

### Finding: "Open" and "Import" are used for adjacent flows, not for git clone
**Confidence:** CONFIRMED
**Evidence:**
- **VSCode:** "Open Folder", "Open Recent", "Open Workspace from File" — all for opening a folder already on disk
- **GitHub Desktop:** "Add Local Repository" — for adding a folder with `.git/` already present
- **Obsidian:** "Open vault" — local folder only
- **Logseq:** "Open graph" — local folder only

"Import" tends to refer to data import within the app (e.g., Notion import, Evernote import), not repository import.

### Finding: The audience framing ("non-developer friendly") justifies softening the word
**Confidence:** INFERRED
**Evidence:** Framing discussion

"Clone" is a git term. A non-developer may not know what cloning means. But "Open from GitHub" is also ambiguous — "open" suggests something that already exists locally; a fresh clone doesn't.

Three framings survive evaluation against non-developer mental model:
- **"Open a GitHub Repository"** — preserves "open" language users recognize, adds "GitHub" for source, "Repository" as the concrete noun.
- **"Get a repo from GitHub"** — casual, clear, avoids jargon.
- **"Clone from GitHub"** — matches industry norm; users encountering this elsewhere will recognize it; the verb "clone" in 2026 is reasonably mainstream.

All three are defensible. The strongest argument for "Clone" is discoverability when users search docs / ask Claude / cross-reference tutorials — "Clone" matches the public vocabulary.

### Finding: Editor UI placement converges on command palette / modal, with menu entry secondary
**Confidence:** CONFIRMED
**Evidence:**

- **VSCode:** Command palette (`Cmd+Shift+P` → "Git: Clone") is the primary entry; also in the Source Control panel's welcome view when no folder is open (`extensions/git/src/views/scmViewPane.ts`).
- **GitHub Desktop:** File menu → Clone Repository, AND in the welcome screen when no repo is open.
- **Zed:** Command palette action; also in `crates/welcome/` onboarding UI.
- **Obsidian-Git:** Command palette only.

Common thread: **the empty state / welcome screen** is where a non-developer encounters the feature first. Command palette is the power-user entry.

### Finding: Public vs private repo affordance
**Confidence:** CONFIRMED
**Evidence:** VSCode + Desktop treat them identically after auth — the auth step is what gates private access, not a separate UI branch. Obsidian-Git also transparent; private requires the user's PAT to be pre-configured.

For our audience: a first-time user pasting `https://github.com/user/repo` probably expects "just works" whether the repo is public or private. The auth prompt should only appear when GitHub returns 401/404 — not upfront.

---

## IA surfaces for any editor implementing this feature

Three surfaces where the feature typically lives, observed across prior art:

**S1. CLI subcommand (e.g., `<appname> clone <url> [<dir>]`)**
- Matches gh's model and common CLI patterns.
- Minimal UI work; registers alongside existing launch commands.
- Pro: trivial to ship; no new UI surfaces required.
- Con: doesn't help non-developer users who open the app first rather than the terminal.

**S2. Editor-side empty-state / first-run screen**
- When the editor boots with no project loaded (or with an empty directory), show an onboarding screen with options like "Clone from GitHub / Open folder / Start fresh."
- Requires: empty-state UI component if not already present; IPC/HTTP path from the UI into the clone orchestrator (typically a spawn of the CLI subcommand from S1).
- Pro: best UX for non-developer users.
- Con: bigger implementation lift; new UI surfaces to design and test.

**S3. Command palette / header menu inside the loaded editor**
- Once a project is loaded, a command or menu item opens a clone dialog modeled on GitHub Desktop's three-tab shape or VSCode's composite QuickPick.
- Result opens in a new window/tab or replaces current context.
- Similar implementation cost to S2; adds an always-available entry point.

**All three are compatible.** Editors with limited UI surfaces may ship S1 only; editors serving non-developer audiences typically ship all three.

---

## Naming conclusion

- **Functional name / command:** `clone` (matches gh; most discoverable via docs search)
- **User-facing label in editor UI:** "Clone from GitHub" as the primary entry, with secondary help text (e.g., "…or paste any git URL") for non-GitHub sources. The verb stays "Clone" for cross-referential discoverability across tools; "from GitHub" anchors the entry for the audience that recognizes the service name.
- **Empty-state phrasing:** "Open a project from GitHub" is an acceptable alternative if product design prefers "Open" semantically — but the underlying command is still `clone`, and pasting a non-GitHub git URL should still work.

Naming is reversible if user testing shows "Clone" is too jargon-heavy for the target audience. The underlying `<appname> clone` CLI binding can stay as the canonical interface with UI labels adapted to audience.

---

## Gaps / follow-ups

- No user research in this report. If the team has access to target-audience users, a two-variant test ("Clone from GitHub" vs "Open from GitHub") would resolve the naming debate empirically.
