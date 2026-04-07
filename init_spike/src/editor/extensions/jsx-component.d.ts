import { Node } from '@tiptap/core';
declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        jsxComponent: {
            insertJsxComponent: (content: string) => ReturnType;
        };
    }
}
export declare const JsxComponent: Node<any, any>;
