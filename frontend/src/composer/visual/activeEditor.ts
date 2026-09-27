/**
 * The single rich-text instance that is currently live.
 *
 * Only one block is editable at a time, so the formatting toolbar in the canvas
 * header needs a way to reach that instance without threading it through the tree.
 */

import { create } from 'zustand';
import type { Editor } from '@tiptap/react';

interface ActiveEditorState {
  editor: Editor | null;
  blockId: string | null;
  setEditor: (blockId: string | null, editor: Editor | null) => void;
}

export const useActiveEditor = create<ActiveEditorState>(set => ({
  editor: null,
  blockId: null,
  setEditor: (blockId, editor) => set({ blockId, editor }),
}));
