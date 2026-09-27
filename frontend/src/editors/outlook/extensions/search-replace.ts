import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface SearchReplaceState {
  searchTerm: string;
  replaceTerm: string;
  matchCase: boolean;
  wholeWord: boolean;
  currentIndex: number;
  totalMatches: number;
}

const searchReplacePluginKey = new PluginKey('searchReplace');

function getRegex(searchTerm: string, matchCase: boolean, wholeWord: boolean): RegExp | null {
  if (!searchTerm) return null;
  const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  return new RegExp(pattern, matchCase ? 'g' : 'gi');
}

function findMatches(doc: any, regex: RegExp): { from: number; to: number }[] {
  const matches: { from: number; to: number }[] = [];
  doc.descendants((node: any, pos: number) => {
    if (!node.isText || !node.text) return;
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(node.text)) !== null) {
      matches.push({ from: pos + match.index, to: pos + match.index + match[0].length });
    }
  });
  return matches;
}

export const SearchReplace = Extension.create({
  name: 'searchReplace',

  addStorage() {
    return {
      searchTerm: '',
      replaceTerm: '',
      matchCase: false,
      wholeWord: false,
      currentIndex: 0,
      totalMatches: 0,
      matches: [] as { from: number; to: number }[],
    };
  },

  addCommands(): any {
    return {
      setSearchTerm: (searchTerm: string) => ({ editor }: any): boolean => {
        editor.storage.searchReplace.searchTerm = searchTerm;
        editor.storage.searchReplace.currentIndex = 0;
        // Force re-render of decorations
        editor.view.dispatch(editor.state.tr.setMeta(searchReplacePluginKey, { searchTerm }));
        return true;
      },
      setReplaceTerm: (replaceTerm: string) => ({ editor }: any): boolean => {
        editor.storage.searchReplace.replaceTerm = replaceTerm;
        return true;
      },
      setMatchCase: (matchCase: boolean) => ({ editor }: any): boolean => {
        editor.storage.searchReplace.matchCase = matchCase;
        editor.view.dispatch(editor.state.tr.setMeta(searchReplacePluginKey, { matchCase }));
        return true;
      },
      setWholeWord: (wholeWord: boolean) => ({ editor }: any): boolean => {
        editor.storage.searchReplace.wholeWord = wholeWord;
        editor.view.dispatch(editor.state.tr.setMeta(searchReplacePluginKey, { wholeWord }));
        return true;
      },
      goToNextMatch: () => ({ editor }: any): boolean => {
        const s = editor.storage.searchReplace;
        if (s.totalMatches === 0) return false;
        s.currentIndex = (s.currentIndex + 1) % s.totalMatches;
        editor.view.dispatch(editor.state.tr.setMeta(searchReplacePluginKey, { nav: true }));
        // Scroll to match
        const match = s.matches[s.currentIndex];
        if (match) {
          editor.chain().focus().setTextSelection(match.from).run();
        }
        return true;
      },
      goToPreviousMatch: () => ({ editor }: any): boolean => {
        const s = editor.storage.searchReplace;
        if (s.totalMatches === 0) return false;
        s.currentIndex = (s.currentIndex - 1 + s.totalMatches) % s.totalMatches;
        editor.view.dispatch(editor.state.tr.setMeta(searchReplacePluginKey, { nav: true }));
        const match = s.matches[s.currentIndex];
        if (match) {
          editor.chain().focus().setTextSelection(match.from).run();
        }
        return true;
      },
      replaceCurrentMatch: () => ({ editor, tr }: any): boolean => {
        const s = editor.storage.searchReplace;
        if (s.totalMatches === 0) return false;
        const match = s.matches[s.currentIndex];
        if (!match) return false;
        tr.insertText(s.replaceTerm, match.from, match.to);
        editor.view.dispatch(tr);
        // Refresh
        setTimeout(() => {
          editor.view.dispatch(editor.state.tr.setMeta(searchReplacePluginKey, { replaced: true }));
        }, 10);
        return true;
      },
      replaceAllMatches: () => ({ editor }: any): boolean => {
        const s = editor.storage.searchReplace;
        if (s.totalMatches === 0) return false;
        const { tr } = editor.state;
        // Replace from last to first to maintain positions
        for (let i = s.matches.length - 1; i >= 0; i--) {
          tr.insertText(s.replaceTerm, s.matches[i].from, s.matches[i].to);
        }
        editor.view.dispatch(tr);
        setTimeout(() => {
          editor.view.dispatch(editor.state.tr.setMeta(searchReplacePluginKey, { replaced: true }));
        }, 10);
        return true;
      },
      clearSearch: () => ({ editor }: any): boolean => {
        editor.storage.searchReplace.searchTerm = '';
        editor.storage.searchReplace.currentIndex = 0;
        editor.storage.searchReplace.totalMatches = 0;
        editor.storage.searchReplace.matches = [];
        editor.view.dispatch(editor.state.tr.setMeta(searchReplacePluginKey, { clear: true }));
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const extensionThis = this;
    return [
      new Plugin({
        key: searchReplacePluginKey,
        state: {
          init() { return DecorationSet.empty; },
          apply(tr, _oldDecorations) {
            const storage = extensionThis.storage;
            const { searchTerm, matchCase, wholeWord, currentIndex } = storage;
            const regex = getRegex(searchTerm, matchCase, wholeWord);
            if (!regex) {
              storage.matches = [];
              storage.totalMatches = 0;
              return DecorationSet.empty;
            }
            const matches = findMatches(tr.doc, regex);
            storage.matches = matches;
            storage.totalMatches = matches.length;

            const decorations = matches.map((match, i) => {
              const cls = i === currentIndex ? 'search-match-current' : 'search-match';
              return Decoration.inline(match.from, match.to, { class: cls });
            });
            return DecorationSet.create(tr.doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },

  addKeyboardShortcuts() {
    return {
      'Mod-f': () => {
        // Handled by the editor component to open FindReplace panel
        return true;
      },
      'Mod-h': () => {
        return true;
      },
    };
  },
});
