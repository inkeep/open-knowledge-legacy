import { jsx as _jsx } from "react/jsx-runtime";
import { markdown } from '@codemirror/lang-markdown';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';
export function SourceEditor({ content, onChange }) {
    const containerRef = useRef(null);
    const viewRef = useRef(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const initialContentRef = useRef(content);
    // Mount CodeMirror once
    useEffect(() => {
        if (!containerRef.current)
            return;
        const state = EditorState.create({
            doc: initialContentRef.current,
            extensions: [
                basicSetup,
                markdown(),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        onChangeRef.current(update.state.doc.toString());
                    }
                }),
            ],
        });
        const view = new EditorView({
            state,
            parent: containerRef.current,
        });
        viewRef.current = view;
        return () => {
            view.destroy();
            viewRef.current = null;
        };
    }, []);
    // Reconcile external content changes without destroying the view
    useEffect(() => {
        const view = viewRef.current;
        if (!view)
            return;
        const current = view.state.doc.toString();
        if (content !== current) {
            view.dispatch({
                changes: { from: 0, to: current.length, insert: content },
            });
        }
    }, [content]);
    return _jsx("div", { ref: containerRef, className: "source-editor" });
}
//# sourceMappingURL=SourceEditor.js.map