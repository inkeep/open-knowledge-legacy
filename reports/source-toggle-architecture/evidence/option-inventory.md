# Evidence: Complete Architecture Option Inventory

**Dimension:** D2 — All viable architectures for source toggle with CRDT backing
**Date:** 2026-04-07
**Sources:** yjs source code analysis, y-prosemirror source, competitor analysis

---

## Options Identified (9 total, 3 viable)

### Option A: Serialize-on-toggle (non-collaborative source view)
**Mechanism:** On toggle to source: Y.XmlFragment → PM JSON → markdown string → plain CodeMirror. On toggle back: markdown → PM Node → updateYFragment (diff-based writeback).
**Feasibility:** CONFIRMED — all conversion functions exist
**Complexity:** LOW (~200 lines)
**Source collab:** No
**Agent live updates in source:** No
**Round-trip risk:** One cycle per toggle (bounded)

### Option B: Dual keys + observer-based sync
**Mechanism:** doc.get('prosemirror') (tree) + doc.get('source') (text). Observers on each trigger bidirectional conversion. Transaction origin guards prevent infinite loops.
**Feasibility:** POSSIBLE but fragile
**Complexity:** HIGH (~800+ lines, ongoing maintenance)
**Source collab:** Yes (both types are collaborative)
**Agent live updates in source:** Yes
**Round-trip risk:** Continuous (every keystroke triggers conversion)

### Option C: Y.Text-canonical with custom ProseMirror binding
**Mechanism:** Single Y.Text. CodeMirror binds via y-codemirror.next. ProseMirror renders from parsed markdown — requires completely replacing y-prosemirror.
**Feasibility:** POSSIBLE but massive effort
**Complexity:** VERY HIGH (rewriting y-prosemirror)
**Source collab:** Yes
**Agent live updates in source:** Yes
**Round-trip risk:** Continuous
**Note:** This is the Automerge/Peritext model applied to Yjs. Architecturally sound but requires starting over.

### Option D: Server-side mirror (Hocuspocus extension)
**Feasibility:** POSSIBLE — same conversion problem as B plus added latency
**Complexity:** HIGH + operational
**Assessment:** Strictly worse than B. Same conversion challenge, more moving parts.

### Option E: Subdocument approach
**Feasibility:** POSSIBLE — subdocs add complexity without solving conversion
**Assessment:** Strictly worse than B. Hocuspocus must handle subdoc sync separately.

### Option F: Shared Y.Text with PM rendering (no y-prosemirror)
**Feasibility:** POSSIBLE but very high effort — same as C
**Assessment:** Equivalent to C. Both require replacing y-prosemirror.

### Option G: CodeMirror decorations on Y.XmlFragment.toString()
**Feasibility:** NOT VIABLE — toString() produces XML, not markdown
**Assessment:** Wrong output format. Also read-only.

### Option H: Hybrid Y.Text canonical + PM on commit
**Mechanism:** Y.Text canonical. WYSIWYG uses temporary tree type, synced on mode switch.
**Assessment:** Degrades to Option A for the WYSIWYG side. No advantage.

### Option I: Toggle-with-lock (awareness-based mode exclusion)
**Mechanism:** Option A + awareness protocol lock. When user enters source mode, broadcast via awareness. Other users see read-only indicator. Eliminates concurrent-mode editing problem entirely.
**Feasibility:** CONFIRMED — awareness protocol supports custom state fields
**Complexity:** LOW-MEDIUM (~250 lines, extends Option A)
**Source collab:** No (single user in source at a time)
**Agent live updates in source:** No (agent writes appear on toggle-back)
**Round-trip risk:** One cycle per toggle (bounded, same as A)
**Note:** y-prosemirror's configureYProsemirror command (line 38-66) supports pausing sync, which enables this pattern.

---

## Viable options summary

| Option | Complexity | Source Collab | Agent Visibility | Round-trip Risk |
|--------|-----------|---------------|-----------------|-----------------|
| A (serialize-on-toggle) | LOW | No | No | Bounded |
| B (dual keys + sync) | HIGH | Yes | Yes | Continuous |
| I (toggle-with-lock) | LOW-MED | No | No | Bounded |

Options C/F (Y.Text-canonical) are architecturally ideal but require rebuilding the CRDT binding layer — a multi-month effort that's out of scope for the current product timeline.

Options D, E, G, H are strictly worse than A, B, or I on every dimension.
