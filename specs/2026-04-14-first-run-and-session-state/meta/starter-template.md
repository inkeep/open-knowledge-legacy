# Starter README template (draft)

Produced by `initContent()` when `fileCount === 0`. Written to `<contentDir>/README.md`.

## Constraints on the content

- Must be parseable by our markdown pipeline without warnings (CommonMark + GFM + our MDX extensions).
- Must demonstrate: one heading, one paragraph, one `[[wiki-link]]`, one JSX component, one external link.
- Must be 10 lines or fewer of visible content (excluding code fence lines).
- Must not reference features that don't exist yet.
- Must not be cute. No "Congratulations!" headings. No emojis unless the user asked for them (they didn't).
- Must round-trip through our serializer without normalization (serialize(parse(x)) === x).

## Proposed content

```markdown
# Welcome

This is your first page. Edit it — or delete it and start over.

Open Knowledge uses a small dialect of markdown with wiki-links and JSX components. Try `[[linking to a page that doesn't exist yet]]` — the link will turn red until you create that page.

<Callout type="note">
Components like this one round-trip as inline JSX. See the [docs](https://github.com/inkeep/open-knowledge) for the full list.
</Callout>
```

That's 6 lines of content — under the 10-line cap — and touches heading, paragraph, wiki-link, JSX component (`<Callout>`), and an external link. The wiki-link is deliberately a red-link (non-existent target) because that's a teaching moment: users should understand that creating a `[[Foo]]` link before `Foo.md` exists is normal.

## Alternatives considered

1. **Pure markdown, no JSX component** — safer but doesn't surface that JSX components are available. Rejected because the product's distinguishing feature is the component layer and the starter should show it.
2. **Demo page with five feature examples (table, code block, image, callout, wiki-link)** — rejected as too much noise for a starter. Users delete it before reading half of it.
3. **Empty heading + one-line "Start typing"** — rejected as undersells the product. First impression should demonstrate capability.
4. **Personalized content** (use git config `user.name`, insert project dir name) — rejected per D9 (fixed string, no variables in v1). Reduces test surface area.

## Known acceptable normalizations

- Trailing newline handling — the serializer emits one trailing `\n`.
- `<Callout type="note">` round-trips as a JsxComponent node. Confirmed against the fidelity tests.

## To confirm at implementation time

- [ ] The wiki-link `[[linking to a page that doesn't exist yet]]` renders as a red-link in the editor. If the UI treats long wiki-link text poorly, shorten it.
- [ ] `<Callout type="note">...</Callout>` works at the current component schema version. If it doesn't, substitute whichever callout-like component does.
- [ ] Confirm with Sarah before ship — this is first-impression content, she should sign off on the copy.
