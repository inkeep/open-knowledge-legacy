# Evidence: Attribution in Version History (D7)

**Dimension:** D7 — Human vs AI attribution in version history
**Date:** 2026-04-08
**Sources:** Git docs, Claude Code git integration, Google Docs, Figma, Notion, Yjs transactions docs

---

## Findings

### Finding: Git author/committer split maps naturally to human/system attribution
**Confidence:** CONFIRMED
**Evidence:** Git convention: Author = person who wrote the work, Committer = person/system who applied it. Already documented in `auto-persistence-architecture.md`: "human = author, system = committer." Claude Code adds `Co-Authored-By: Claude <noreply@anthropic.com>` by default. Aider adds `(aider)` to author name.

**Implication:** Auto-save commits: author = human editor, committer = system. Agent writes: author = agent identity, co-authored-by = human present. Named checkpoints: author = human who triggered, co-authored-by = contributing agents.

### Finding: Yjs transaction origins do NOT survive serialization
**Confidence:** CONFIRMED
**Evidence:** Yjs docs: `doc.transact(fn, origin)` tags mutations at runtime. Origins are accessible via `event.transaction.origin`. However, origins are NOT encoded in `Y.encodeStateAsUpdate()`. They are runtime metadata only, lost on serialize/restore.

**Implication:** Per-character attribution cannot survive the markdown round-trip. Attribution must live in git history (commit metadata), not in the document format. `git blame` provides line-level historical attribution for free.

### Finding: Color-coded per-author changes is the dominant visual pattern
**Confidence:** CONFIRMED
**Evidence:** Google Docs uses author-specific colors for change highlighting. Figma shows per-author avatars on versions. GitHub uses Co-authored-by for multi-author display. The existing Open Knowledge presence design already uses distinct colors/icons for human vs agent.

**Implication:** Timeline entries should show author avatar/icon (human face vs agent sparkle) + name + timestamp. The existing presence bar pattern extends naturally to the timeline.

---

## Gaps / follow-ups
- Fine-grained per-paragraph attribution (which sections were agent-written) would require a separate attribution log or Y.Map sidecar — not investigated in depth
