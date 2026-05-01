---
date: 2026-04-30
sources: ["intake conversation, /spec session, 2026-04-30"]
type: user-elicited
---

# User-stated outcomes (intake)

Captured verbatim from the user during Step 1 intake. These are user-provided
facts (not agent inference) — they seed worldmodel scoping, Step 3a SCR
framing, and Step 3b persona discipline.

## Driver

User-reported bug from the same session, 2026-04-30:
> The frontmatter elements change order as I edit them. They should maintain
> order. I'm not sure why they change order after I edit them. Example:
> adding an "s" to the end of one will put the item in a different order.
> Expected behavior: order should be maintained.

Diagnosed in conversation: `PropertyPanel.renameProperty` issues a delete-old-key
+ add-new-key patch on `Y.Map('metadata')`; Y.Map preserves insertion order, so
the renamed key always lands at the end.

## Architectural premise (user-stated)

> I expect that the frontmatter editor is just a fancy WYSIWYG editor flavor
> on top of the underlying collaborative document text.

Confirmed in follow-up: single source of truth = `Y.Text('source')`.
`Y.Map('metadata')` becomes either a derived projection cache or is fully
eliminated. The duplicate-key concern (raised by user as the original driver
for the realtime schema sketch) is naturally handled by Y.Text — two `title:`
lines can coexist in the YAML region.

## Reorder UX (user-stated)

> Drag-to-reorder behavior should be added, would be treated similar to
> moving selected text from A to B cursor position. Newlines should be
> handled by our editor, position writes shouldn't be considered for
> collaborative change until they are dropped (mouseup).

Three points captured:
1. Drag-to-reorder is in scope for this spec.
2. Semantically equivalent to moving selected text — delete from old position,
   insert at new position, both as Y.Text operations.
3. Drag is local-only during the drag gesture; the Y.Text mutation is
   committed only on mouseup (drop). The editor is responsible for managing
   YAML structure (newlines, indentation, key positioning) at commit time.

## Migration / backward compat (user-stated)

> This is a greenfield project. Do not worry about migration issues. The
> client and server can both be killed/restarted without fear at this stage.

No migration concern. Safe to rip out the `Y.Map('metadata')` per-key schema
introduced by the predecessor spec
(`specs/2026-04-30-crdt-direct-frontmatter-writes`) if the design path warrants.

## Confirmed direction (Step 1 close)

User confirmed both:
1. Single source of truth = `Y.Text('source')`; `Y.Map('metadata')` is
   derived projection or eliminated.
2. OK with this spec superseding several decisions from the predecessor
   spec, given greenfield permission.

## What this seeds

- **Worldmodel scoping** — investigate every consumer of `Y.Map('metadata')`
  in the predecessor spec's wake (server observers, MCP `frontmatter_patch`
  if it still exists, agent writes via `applyAgentMarkdownWrite`, L3 hook,
  file watcher reads, persistence). What gets ripped vs. what stays.
- **SCR Situation framing** — current PropertyPanel uses a Y.Map-keyed
  schema; rename does delete+add; order doesn't survive.
- **SCR Resolution direction** — property panel binds to YAML region of
  Y.Text('source'); name + value + position are all Y.Text edits.
- **Persona** — single user-facing persona: knowledge worker editing
  frontmatter properties through the WYSIWYG editor.
