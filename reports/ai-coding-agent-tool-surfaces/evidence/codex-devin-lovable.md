# Evidence: Codex CLI, Devin, and Lovable Tool Surfaces

**Dimension:** 3 (Codex), 4 (Lovable), 5 (Devin)
**Date:** 2026-03-20
**Sources:** Codex open source (github.com/openai/codex), leaked system prompts, official docs, blog posts

---

## Key sources referenced

- https://github.com/openai/codex — Codex CLI source (Rust + TypeScript)
- https://github.com/openai/codex/blob/main/codex-rs/apply-patch/apply_patch_tool_instructions.md — apply_patch format
- https://developers.openai.com/codex/cli/features — Codex features
- https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/tree/main/Devin%20AI — Devin leaked prompt
- https://docs.devin.ai/api-reference/overview — Devin API
- https://cognition.ai/blog/devin-2 — Devin 2.0
- https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools/blob/main/Lovable/Agent%20Prompt.txt — Lovable leaked prompt
- https://lovable.dev/blog/visual-edits — Lovable visual edits
- https://www.morphllm.com/fast-apply-model — Morph Fast Apply
- https://www.npmjs.com/package/lovable-tagger — lovable-tagger npm

---

## Findings

### Finding: Codex CLI exposes a single `shell` tool — all operations go through CLI commands
**Confidence:** CONFIRMED
**Evidence:** Codex source code, developers.openai.com/codex/cli/features

Three tools total:
- `shell` — params: {command, workdir, timeout_ms, with_escalated_permissions}. The model reads via `cat`, searches via `rg`, edits via `apply_patch`.
- `update_plan` — internal planning (1-5 sentences per step, skipped for simple tasks)
- `web_search` — cached index by default, `--search` for live results

The CLI intercepts `apply_patch` commands internally rather than executing them as shell commands.

### Finding: Codex uses a custom `*** Begin Patch / *** End Patch` diff format
**Confidence:** CONFIRMED
**Evidence:** github.com/openai/codex/blob/main/codex-rs/apply-patch/apply_patch_tool_instructions.md

Three operations: Add File, Delete File, Update File (with optional Move to: for rename).
Hunks use `@@` markers with 3 lines of context. Progressive fallback matching (exact → whitespace-insensitive).
File references must be relative, never absolute.

This same format is used by OpenCode (for GPT models) and Aider (patch/V4A format).

### Finding: Codex implements OS-level sandboxing — unique among coding agents
**Confidence:** CONFIRMED
**Evidence:** Multiple sources analyzing Codex sandbox

macOS: Seatbelt (SBPL profiles + sandbox-exec). Linux: Landlock + seccomp (pure Rust).
Network blocked by default. Writable roots: CWD, /tmp, configured dirs. .git always protected.
Four policy levels: ReadOnly, WorkspaceWrite (default), DangerFullAccess, ExternalSandbox.

### Finding: Devin operates in a full cloud VM (Devbox) with rich specialized tools
**Confidence:** CONFIRMED
**Evidence:** Leaked system prompt, cognition.ai/blog/devin-2

Editor tools: open_file, create_file, str_replace, insert, remove_str, find_and_edit.
Search tools: find_filecontent, find_filename, semantic_search.
LSP tools: go_to_definition, go_to_references, hover_symbol.
Browser tools, deployment tools (expose_port), reasoning (<think> tag).
Prompt explicitly prohibits vim/cat/echo for editing.

Compound AI system: Planner, Coder, Critic, Browser Agent models.

### Finding: Devin uses `str_replace` (exact string match) as primary edit mechanism
**Confidence:** CONFIRMED
**Evidence:** Leaked system prompt

Same concept as Claude Code's Edit tool and OpenCode's edit tool — find exact text, replace it. `find_and_edit` extends to cross-file refactoring.

### Finding: Lovable uses XML-tagged tools with a two-tier diff model
**Confidence:** CONFIRMED
**Evidence:** Leaked system prompt

File tools: `<lov-write>`, `<lov-line-replace>`, `<lov-rename>`, `<lov-delete>`, `<lov-add-dependency>`.
Reading: `<lov-view>` (first 500 lines default, supports line ranges), `<lov-search-files>` (regex).
Web: `<lov-fetch-website>`, `<lov-download-to-repo>`, `web_search`.
Debug: `<lov-read-console-logs>`, `<lov-read-network-requests>`.
Image: `generate_image`, `edit_image`.

Two-tier diff:
1. `<lov-line-replace>` — line-number-based search/replace (preferred for existing files)
2. `<lov-write>` — full file with `// ... keep existing code (name)` markers, reconstructed by Morph Fast Apply

### Finding: Morph Fast Apply is a 7B specialized model running at 10,500 tok/s
**Confidence:** CONFIRMED
**Evidence:** morphllm.com/fast-apply-model

Merges edit snippets with `// ... existing code ...` markers into complete files.
98% accuracy, 262K token context. Custom CUDA kernels + speculative decoding.
API: POST https://api.morphllm.com/v1/chat/completions (OpenAI-compatible).
Models: morph-v3-fast (10,500 tok/s), morph-v3-large (5,000 tok/s), auto (routes by complexity).

### Finding: Lovable's visual edits use lovable-tagger for compile-time source mapping
**Confidence:** CONFIRMED
**Evidence:** lovable.dev/blog/visual-edits, npm lovable-tagger

Pipeline: lovable-tagger Vite plugin injects data-lov-id at compile time → user clicks element → traces to source JSX → client-side AST processing (Babel/SWC) → modify AST → convert back to clean JSX → compute minimal diff → push via Vite HMR.

### Finding: Lovable runs on StackBlitz WebContainers (WASM in browser)
**Confidence:** CONFIRMED
**Evidence:** lovable docs, webcontainers.io

Full Node.js in WebAssembly within browser tab. Not a remote VM. node_modules cached in IndexedDB. Works with intermittent connectivity.

---

## Comparative summary

| Dimension | Codex CLI | Devin | Lovable |
|-----------|-----------|-------|---------|
| Environment | Local terminal | Cloud VM | Browser WASM |
| Tool model | Single shell tool | Specialized tools | XML-tagged tools |
| Edit mechanism | apply_patch (custom diff) | str_replace (exact match) | lov-line-replace + Morph Fast Apply |
| Search | rg via shell | find_filecontent + semantic_search | lov-search-files (regex) |
| LSP | None | go_to_definition, go_to_references, hover_symbol | None |
| Browser | None (network blocked) | Built-in Chrome | lov-fetch-website |
| Sandbox | OS-level (Seatbelt/Landlock) | Cloud VM isolation | Browser sandbox |
| Open source | Yes | No | No (prompt leaked) |

---

## Implications for virtual filesystem adapter

1. Codex's shell-based approach means a virtual FS needs to intercept common CLI commands (cat, rg, ls) — or provide the `apply_patch` tool directly
2. Devin's str_replace is identical in concept to Claude Code's Edit — same adapter works
3. Lovable's lov-line-replace uses line numbers (not just string matching) — the virtual FS needs line-number support
4. Morph Fast Apply is a separate service for reconstructing files from abbreviated outputs — relevant if supporting `// ... existing code ...` markers
5. Lovable-tagger's data-lov-id injection is critical for the visual editing round-trip — the virtual FS could use similar OID attributes

---

## Gaps / follow-ups

* Codex's apply_patch exact error format and retry behavior
* Devin's str_replace — does it have any fuzzy matching or is it strictly exact?
* Lovable's lov-line-replace — exact behavior when line numbers shift due to prior edits in same response
* Morph Fast Apply integration details — how errors are handled when merge fails
