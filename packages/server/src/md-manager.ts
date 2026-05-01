import { MarkdownManager, sharedExtensions } from '@inkeep/open-knowledge-core';
import { getSchema } from '@tiptap/core';

export const mdManager = new MarkdownManager({ extensions: sharedExtensions });

export const schema = getSchema(sharedExtensions);
