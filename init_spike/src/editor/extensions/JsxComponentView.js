import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NodeViewWrapper } from '@tiptap/react';
import { Callout } from '../Callout';
/**
 * Parses a simple JSX-like string to extract the component name, type prop, and children text.
 * This is intentionally simple — it handles the <Callout type="...">children</Callout> pattern.
 */
function parseJsxContent(raw) {
    const tagMatch = raw.match(/<(\w+)\s+type="([^"]*)">([\s\S]*?)<\/\1>/);
    if (tagMatch) {
        return {
            component: tagMatch[1],
            type: tagMatch[2],
            children: tagMatch[3].trim(),
        };
    }
    return { component: 'Unknown', type: 'info', children: raw.trim() };
}
export function JsxComponentView({ node }) {
    const content = node.attrs.content || '';
    const parsed = parseJsxContent(content);
    return (_jsx(NodeViewWrapper, { className: "jsx-component-wrapper", contentEditable: false, children: parsed.component === 'Callout' ? (_jsx(Callout, { type: parsed.type, children: parsed.children })) : (_jsxs("div", { style: {
                padding: '12px 16px',
                borderRadius: '6px',
                backgroundColor: '#f0f0f0',
                fontFamily: 'monospace',
                fontSize: '13px',
            }, children: [_jsxs("strong", { children: ["<", parsed.component, ">"] }), _jsx("pre", { style: { margin: '8px 0 0', whiteSpace: 'pre-wrap' }, children: content })] })) }));
}
//# sourceMappingURL=JsxComponentView.js.map