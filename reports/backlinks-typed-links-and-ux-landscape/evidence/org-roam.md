# Evidence: Org-roam

**Dimension:** Backlink/wikilink architecture — Org-roam (Emacs Org-mode-based)
**Date:** 2026-04-12

---

## Key sources
- [org-roam.com — Manual](https://orgroam.com/manual.html)
- [github.com/org-roam/org-roam](https://github.com/org-roam/org-roam)

---

## Findings

### D1: Link format & representation on disk
**Confidence:** CONFIRMED

Standard Org-mode ID link syntax: `[[id:UUID][Display]]`. Every node (a headline or top-level file with an `:ID:`) carries a property drawer:

```org
:PROPERTIES:
:ID:       foo
:END:
```

Files are plain `.org` documents under `org-roam-directory`. Rendering uses Org-mode's built-in link resolver — no bespoke renderer.

### D2: Link semantics / typing
**Confidence:** CONFIRMED

Node metadata beyond the link graph lives in properties:
- `:ROAM_ALIASES:` — alternate titles also matching the node
- `:ROAM_REFS:` — external/citation references (supports `org-ref` and `org-cite`); nodes sharing a ROAM_REF become "reference links"
- Cached per-node: outline level, todo state, priority, scheduled, deadline, tags

**No first-class typed edges** ("is-prerequisite-of"). Links are untyped `id:` links. Typing is conventional via tags, property values, or link descriptions.

### D3: Backlink UX patterns
**Confidence:** CONFIRMED

`*org-roam-buffer*` is the primary backlink surface, rendered with `magit-section` widgets. Entry points:
- `org-roam-buffer-toggle` — live-tracking buffer, updates as point moves
- `org-roam-buffer-display-dedicated` — pinned buffer for a specific node

Three section types:
1. **Backlinks** — nodes linking in
2. **Reference links** — nodes sharing `ROAM_REFS`
3. **Unlinked references** — title/alias mentioned without explicit link (disabled by default; performance)

Bindings: `TAB` toggles section, `n` moves to next, `RET` opens.

No web-style hover previews — the model is "jump, don't peek."

Navigation commands: `org-roam-node-find`, `org-roam-node-insert` (both create-on-miss).

### D4: Transclusion
**Confidence:** CONFIRMED

Org-roam manual makes **no reference to transclusion.** Transclusion in Org ecosystem is via the separate `org-transclusion` package (`#+transclude:` keyword). **Add-on, not first-class** in Org-roam.

### D5: Index / storage model
**Confidence:** CONFIRMED

- **Source of truth:** `.org` files on disk
- **Cache:** SQLite at `org-roam.db` via `emacsql`. Maintains all links and nodes. Schema via `org-roam-db--table-schemata`.
- **Invalidation:** Save-triggered rebuild per-file (toggle: `org-roam-db-update-on-save`)
- **IDs:** `:ID:` property is a persistent UUID inline in the file. Links ID-based, not title-based → **renaming a file or changing heading text does NOT break links**.

### D6: ML-augmented linking
**Confidence:** CONFIRMED (none)

No ML-based link suggestion documented. `org-roam-node-insert` offers completion over known nodes, ranked by metadata only.

---

## Gaps / follow-ups
- None significant for this scope
