# Evidence: D6 — y-prosemirror mark composition (canonical reference for the TipTap/Hocuspocus stack)

**Dimension:** D6
**Date:** 2026-04-17
**Sources:** y-prosemirror GitHub, Yjs issue #291, y-prosemirror issue #34, Yjs docs, prior OK research report peritext-on-yjs-feasibility

---

## Key pages referenced

- https://github.com/yjs/y-prosemirror — y-prosemirror binding
- https://github.com/yjs/y-prosemirror/issues/34 — "Did not deal with the problem of overlapping marks with same name" (dongtc, 2020-12-10)
- https://github.com/yjs/yjs/issues/291 — "Different outcomes for Y.Text when artificially delaying text attribute updates" (2021-04-11, assigned to dmonad)
- https://docs.yjs.dev/api/shared-types/y.text — Y.Text API reference
- Prior OK report: reports/peritext-on-yjs-feasibility/evidence/ytext-formatting-api.md (pre-verified Yjs source-code findings)

---

## Findings

### Finding: y-prosemirror maps ProseMirror tree to Y.XmlFragment, NOT Y.Text

**Confidence:** CONFIRMED
**Evidence:** y-prosemirror README:

> "This binding maps a Y.XmlFragment to the ProseMirror state."

ProseMirror's schema tree (paragraphs, headings, lists as nodes with mark arrays on text) is mirrored into nested Y.XmlFragment/Y.XmlText types. **Marks are per-text-node attribute sets**, not characters in the shared text.

### Finding: Yjs stores format as ContentFormat marker items (zero-length control items) inserted into the CRDT sequence

**Confidence:** CONFIRMED
**Evidence:** yjs/src/structs/ContentFormat.js (pre-verified in reports/peritext-on-yjs-feasibility/evidence/ytext-formatting-api.md):

```javascript
export class ContentFormat {
  constructor (key, value) {
    this.key = key   // e.g., "bold"
    this.value = value // e.g., true or null (to unset)
  }
  isCountable () { return false } // zero-length in user space
}
```

`format(index, length, { bold: true })` inserts a ContentFormat `{key:"bold", value:true}` before the range and a ContentFormat `{key:"bold", value:null}` after it. **These are NOT visible characters in the text — they are zero-length CRDT items alongside text characters.**

### Finding: Yjs does NOT implement Peritext boundary semantics (per-mark expand flags)

**Confidence:** CONFIRMED
**Evidence:** Peritext paper + Yjs source code analysis. The Peritext paper (§Example 3 and §"Comparison with CRDTs using inline control characters") states explicitly that Yjs's inline-control-character approach suffers the same class of anomalies as naive markdown merging. Yjs has no per-mark `expand: "before"/"after"/"none"/"both"` flag.

### Finding: y-prosemirror issue #34 — concurrent overlapping marks of SAME TYPE with DIFFERENT ATTRIBUTES silently drop one

**Confidence:** CONFIRMED
**Evidence:** https://github.com/yjs/y-prosemirror/issues/34 (dongtc, 2020-12-10)

> ProseMirror supports multiple marks of the same type with different attributes (e.g., two comment marks with different IDs on overlapping text ranges). However, y-prosemirror's sync-plugin fails to preserve this correctly.

Root cause: `sync-plugin.js:670` uses `pattrs[mark.type.name] = mark.attrs`, overwriting marks with same type name regardless of differing attributes. Issue reporter's observation: "You can see lost a mark." Issue closed without documented fix.

### Finding: Yjs issue #291 — concurrent format with delayed delivery produces inconsistent bold boundaries

**Confidence:** CONFIRMED
**Evidence:** https://github.com/yjs/yjs/issues/291 (2021-04-11, assigned to dmonad)

Scenario: Starting text "helloworld", two clients.
- Single-doc sequential: `format(3,3,{bold:true})` then `format(0,4,{bold:true})` → `[{insert:"hellow",attrs:{bold:true}},{insert:"orld"}]` (correct)
- Two-doc synchronous: same as single-doc (correct)
- Two-doc with asynchronous delay: → `[{insert:"hell",attrs:{bold:true}},{insert:"oworld"}]` (INCORRECT — the middle "o" and beyond lose bold that was explicitly applied)

Reporter's analysis: "The timeout will delay applying the change on the other struct by putting it in a macro task. This means that both local changes will be applied before the update from the respective other struct."

Status: filed 2021-04-11, assigned to Kevin Jahns (dmonad). Public resolution/fix not documented.

### Finding: For same-type same-attr marks (common case: two users bold different spans that overlap), Y.Text is correct — it's the "overlapping with different attributes" and "delayed remote order" edge cases that break

**Confidence:** INFERRED
**Evidence:** peritext-on-yjs-feasibility/REPORT.md §D1 Finding summary: "Y.Text formatting works correctly for all non-concurrent and most concurrent editing scenarios" and "The Peritext boundary anomaly is a known theoretical limitation, not a practical blocker for typical editing patterns."

---

## Implications

- The dominant shipping OSS stack (TipTap + y-prosemirror + Yjs) uses **structured marks in a tree CRDT** (Y.XmlFragment), NOT char-RGA on serialized chars.
- Marks are attributes on text nodes; bolding a span is a ContentFormat marker-item operation, not a character insert of `**`.
- Known defects: #34 (same-type-different-attr dropped marks) and #291 (delayed-delivery boundary inconsistency). Both are documented but not product-blocking for typical workloads.
- The Peritext boundary-expansion problem is ACKNOWLEDGED but NOT user-visible in typical y-prosemirror workloads — there's no public bug report with a user-reported "rest of document became bold" artifact as a result.

---

## Gaps / follow-ups

- Whether #34 was actually fixed or worked-around in a later version isn't clear; the issue appears closed but no PR is linked in search results.
- No quantitative data on how often the #291 delayed-delivery anomaly occurs in production.
- Atlassian's Atlaskit (ProseMirror-based) may have its own separate merge algorithm (Synchrony) that is not y-prosemirror; different defect profile.
