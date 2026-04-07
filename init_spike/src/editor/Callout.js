import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const colors = {
    warning: '#fff3cd',
    info: '#cff4fc',
    error: '#f8d7da',
};
export function Callout({ type, children }) {
    return (_jsxs("div", { style: {
            padding: '12px 16px',
            borderRadius: '6px',
            backgroundColor: colors[type] || '#f0f0f0',
        }, children: [_jsx("strong", { children: type.toUpperCase() }), ": ", children] }));
}
//# sourceMappingURL=Callout.js.map