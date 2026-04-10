---
type: evidence
source: synthesis of architectural findings from all 7 sub-reports
date: 2026-04-03
---

# Viable Paths Forward: Architecture Options

## Path 1: ProseMirror + remark-mdx + Custom MDX Node Schemas

**Framework**: Milkdown or TipTap (both ProseMirror-based)
**CRDT binding**: y-prosemirror (v1 stable, v2 pre-release)

**What exists today**:
- Milkdown has remark as canonical pipeline with bidirectional specs
- Adding remark-mdx is one line: `$remark('remarkMdx', () => remarkMdx)`
- y-prosemirror v1 is stable, maintained, used in production by TipTap

**What must be built**:
- ProseMirror NodeSpec for each MDX MDAST type (mdxJsxFlowElement,
  mdxJsxTextElement, mdxjsEsm, mdxFlowExpression, mdxTextExpression)
- Container node for JSX flow elements (content: "block+") with name
  and attributes as node attrs
- Atom node for ESM and expressions (opaque, store raw string)
- Disable remarkHtmlTransformer to prevent JSX corruption

**Feasibility**: Medium. The remark integration is straightforward. The
hard part is ProseMirror schema design for editable JSX children and
prop editing UX. Milkdown's GFM preset provides a working template.

**Advantages**:
- ProseMirror's strict schema validates documents on apply
- y-prosemirror is actively maintained
- Attribute-per-key CRDT merging works for flat props
- TipTap adds content validation plugin (filters invalid Yjs transactions)
- v2 has attribution/suggestion system for tracked changes

**Risks**:
- Complex attrs (arrays, nested objects) still LWW per attribute
- Must normalize MDX on load (one parse/serialize cycle) to establish
  stable baseline
- Schema must handle unknown components gracefully

## Path 2: Slate + remark-mdx + Forked slate-yjs

**Framework**: Plate (Slate-based)
**CRDT binding**: Forked slate-yjs

**What exists today**:
- Plate has remark-mdx in its markdown pipeline
- TinaCMS demonstrates full MDX -> Slate -> MDX for registered components
- slate-yjs mapping is type-agnostic (handles any Slate element)

**What must be built**:
- Fork slate-yjs and patch #390 (inline void crash), #386 (null parent),
  #391 (move_node offset)
- Custom MDX deserializer that preserves unknown JSX as structured Slate
  elements (not the current paragraph-text fallback)
- Expression prop storage as raw strings
- Import/ESM preservation in document-level metadata

**Feasibility**: Medium-High effort. The fork maintenance burden is the
primary cost. slate-yjs has not been maintained for 3 years.

**Advantages**:
- Type-agnostic mapping means zero changes to binding for MDX nodes
- Plate has the most mature MDX parse/serialize pipeline (via TinaCMS)
- Slate's flexible schema allows rapid prototyping

**Risks**:
- Forked slate-yjs becomes a permanent maintenance obligation
- Inline void elements have known crash bug
- TinaCMS pipeline requires template registration (schema-dependent)
- Slate normalization is post-hoc (invalid states can be applied)

## Path 3: Hybrid -- ProseMirror Editor + MDX-as-Canonical

**Architecture**: ProseMirror for editing, Yjs for CRDT, MDX files in git
as source of truth.

**Key design decisions**:
- Yjs state is EPHEMERAL (session-scoped only)
- On session start: parse MDX fresh, initialize new Y.Doc
- On save: serialize ProseMirror -> MDAST -> MDX, write to git
- No persistent Yjs state across sessions

**Trade-offs**:
- Eliminates tombstone drift (fresh parse every time)
- Eliminates session boundary divergence
- Loses offline collaboration capability entirely
- Loses edit history between sessions
- Collaboration is session-scoped only

**Feasibility**: Simplest architecturally. Avoids the hardest problems.

## Path 4: CRDT-First with MDX as Derived Artifact

**Architecture**: Yjs binary state as canonical. MDX generated on demand.

**Key design decisions**:
- Yjs state stored as binary (not MDX text)
- MDX files in git are derived artifacts (generated for build/preview)
- Direct MDX edits in git must be merged back into Yjs state

**Trade-offs**:
- Full offline collaboration support
- Persistent edit history
- Loses "MDX is the source" property
- Git stores large binary Yjs files
- Direct MDX editing requires three-way merge (active research problem)

**Feasibility**: Architecturally clean for collaboration but fundamentally
conflicts with the "markdown in git is canonical" requirement.

## Path 5: Opaque Component Blocks + Rich Text Zones

**Architecture**: MDX components treated as opaque blocks with prop editing
via forms/panels. Only the children rich-text zones are collaboratively
editable in the visual editor.

**How it works**:
- MDX components are atom/void nodes in the editor
- Component props are edited via a side panel (not inline)
- Children rich-text content is parsed into editable ProseMirror/Slate nodes
- The component boundary is a CRDT container; internals are standard rich text

**Advantages**:
- Sidesteps schema explosion (one generic component node type)
- Sidesteps expression prop editing (raw string in side panel)
- Standard rich text CRDT inside component children
- Closest to TinaCMS's existing architecture

**Risks**:
- Prop editing is form-based, not WYSIWYG
- Concurrent prop edits still LWW per flattened prop
- Components without children are fully opaque (no inline editing)
