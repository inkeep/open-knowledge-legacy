/**
 * JsxComponentPropPanel — V2 forward-compat scaffolding for CB-v2.
 *
 * Renders as the singleton PropPanel slot when an InteractionLayer user
 * activates a jsxComponent node. V2 ships a minimal descriptor read-out
 * plus a destructive Delete affordance; CB-v2 replaces this wholesale at
 * the same `register({ type: 'jsxComponent', controls: { propPanel } })`
 * site with a descriptor-driven edit UI. See V2 spec §9.2 and FR8.
 *
 * Review 2026-04-21 Major #8: wraps content in the shared
 * `<InteractionPropPanel>` primitive so positioning, ARIA, and dismiss
 * vocabulary is unified across all four V2 PropPanels.
 */
import type { Editor } from '@tiptap/core';
import { InteractionPropPanel } from '../../components/InteractionPropPanel';
import { Button } from '../../components/ui/button';

/**
 * Extract the component name from a raw JSX fragment. Pure — extracted so
 * tests can exercise the parse without mounting React.
 */
export function extractJsxComponentName(raw: string): string {
  const match = raw.match(/<(\w+)/);
  return match ? match[1] : 'Unknown';
}

export interface JsxComponentPropPanelProps {
  editor: Editor;
  getPos: () => number | undefined;
  onDismiss: () => void;
}

export function JsxComponentPropPanel({ editor, getPos, onDismiss }: JsxComponentPropPanelProps) {
  const pos = getPos();
  const node = typeof pos === 'number' ? editor.state.doc.nodeAt(pos) : null;
  const content = (node?.attrs.content as string | undefined) ?? '';
  const componentName = extractJsxComponentName(content);

  function handleDelete() {
    const currentPos = getPos();
    if (typeof currentPos !== 'number') return;
    const currentNode = editor.state.doc.nodeAt(currentPos);
    if (!currentNode) return;
    editor
      .chain()
      .focus()
      .deleteRange({ from: currentPos, to: currentPos + currentNode.nodeSize })
      .run();
    onDismiss();
  }

  return (
    <InteractionPropPanel
      kind="jsx-component"
      ariaLabel="Component properties"
      onDeactivate={onDismiss}
    >
      <div className="flex items-center gap-2 pr-8">
        <span className="text-xs text-muted-foreground">Component</span>
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{componentName}</code>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={handleDelete}>
          Delete
        </Button>
      </div>
    </InteractionPropPanel>
  );
}
