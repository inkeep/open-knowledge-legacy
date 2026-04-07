import type { ThreeWayMergeResult } from './three-way-merge';
export interface TiptapEditorHandle {
    getMarkdown: () => string;
    /** Three-way merge: apply only user's changes, preserving concurrent agent writes */
    applyThreeWayMerge: (snapshotMarkdown: string, userEditedMarkdown: string) => ThreeWayMergeResult;
    /** Subscribe to Y.Doc content changes. Returns unsubscribe function. */
    onContentChange: (callback: (markdown: string) => void) => () => void;
}
export declare const TiptapEditor: import("react").ForwardRefExoticComponent<import("react").RefAttributes<TiptapEditorHandle>>;
