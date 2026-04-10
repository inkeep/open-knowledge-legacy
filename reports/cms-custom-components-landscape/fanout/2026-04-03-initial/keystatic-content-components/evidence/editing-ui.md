---
title: Keystatic Editing UI for Content Components
source_type: primary
source_paths:
  - packages/keystatic/src/form/fields/markdoc/editor/custom-components.tsx
  - packages/keystatic/src/form/fields/markdoc/editor/FormValue.tsx
repo: https://github.com/Thinkmill/keystatic
---

# Editing UI in the ProseMirror Editor

## Two-Tier Rendering Strategy

Each content component type supports two mutually exclusive rendering approaches:

### 1. ContentView (Default) — Auto-generated editing

The **default** path uses Keystatic's `BlockWrapper` component (custom-components.tsx:65-197):

- **Chrome header**: Displays component label with selection styling
- **Edit button**: Opens a modal `Dialog` for editing props
- **FormValue component**: Auto-generates form fields from the component schema

```tsx
// custom-components.tsx:150-162
{!!Object.keys(props.component.schema).length && (
  <Button prominence="low" onPress={() => { setIsOpen(true); }}>
    Edit
  </Button>
)}
```

When the "Edit" button is pressed:
```tsx
// custom-components.tsx:166-195
<DialogContainer onDismiss={() => { setIsOpen(false); }}>
  {isOpen && (
    <Dialog>
      <Heading>Edit {props.component.label}</Heading>
      <FormValue
        schema={schema}
        value={value}
        onSave={value => {
          runCommand((state, dispatch) => {
            if (dispatch) {
              dispatch(
                state.tr.setNodeAttribute(
                  props.getPos()!, 'props',
                  toSerialized(value, schema.fields)
                )
              );
            }
            return true;
          });
        }}
      />
    </Dialog>
  )}
</DialogContainer>
```

### 2. NodeView (Custom) — Full control

Developers can provide `NodeView` for complete control over rendering and editing:

```typescript
// content-components.ts:63-73
NodeView?: (props: {
  value: ParsedValueForComponentSchema<ObjectField<Schema>>;
  onChange(value: ParsedValueForComponentSchema<ObjectField<Schema>>): void;
  onRemove(): void;
  isSelected: boolean;
  children: ReactNode;  // Only for wrapper/repeating kinds
}) => ReactNode;
```

When `NodeView` is provided, it completely replaces the BlockWrapper chrome.

## FormValue Component (FormValue.tsx)

Auto-generates editing forms from component schemas:

```tsx
// FormValue.tsx (simplified)
function FormValue({ schema, value, onSave }) {
  const [state, setState] = useState(value);
  
  return (
    <>
      <FormValueContentFromPreviewProps
        schema={schema}
        value={state}
        onChange={setState}
      />
      <ButtonGroup>
        <Button onPress={dismiss}>Cancel</Button>
        <Button onPress={() => {
          clientSideValidateProp(schema, state);
          onSave(state);
          dismiss();
        }}>Done</Button>
      </ButtonGroup>
    </>
  );
}
```

Key behaviors:
- Validates props with `clientSideValidateProp()` before saving
- Provides Cancel/Done buttons
- Changes are committed atomically via ProseMirror transaction

## Component Kind → UI Mapping

| Kind | UI Pattern | Children? | Insert Menu? |
|------|-----------|-----------|-------------|
| `block` | BlockWrapper or NodeView | No | Yes (unless forSpecificLocations) |
| `wrapper` | BlockWrapper or NodeView | Yes (block+) | Yes |
| `inline` | Inline box or NodeView | No | Yes |
| `mark` | Text formatting mark | Wraps text | Via mark toolbar |
| `repeating` | BlockWrapper with Insert button | Constrained children | Yes |

## Inline Component Editing

Inline components render as `<span>` elements with `contentEditable={false}`:

```tsx
// custom-components.tsx:450-484
<span contentEditable={false}>
  <component.NodeView
    value={value}
    onChange={...}
    isSelected={...}
    onRemove={...}
  />
</span>
```

If no NodeView is provided, inline components show a bordered box with either ContentView content or the component name as text.

## Repeating Component Insert Controls

Repeating containers show an "Insert" button or dropdown in the header:
- Single child type → direct "Insert" button
- Multiple child types → dropdown menu with options

```tsx
// custom-components.tsx:609-654
{component.children.length === 1 ? (
  <Button onPress={() => { /* insert single child type */ }}>Insert</Button>
) : (
  <MenuTrigger>
    <Button>Insert</Button>
    <Menu items={items} onAction={key => { /* insert selected type */ }}>
      {item => <Item key={item.key}>{item.label}</Item>}
    </Menu>
  </MenuTrigger>
)}
```
