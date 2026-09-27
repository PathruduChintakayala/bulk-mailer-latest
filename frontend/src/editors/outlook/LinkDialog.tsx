import { useState, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import Modal from '../../components/ui/Modal';
import { Link, Unlink } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  editor: Editor;
}

export default function LinkDialog({ open, onClose, editor }: Props) {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [newTab, setNewTab] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Pre-populate from existing link
    const attrs = editor.getAttributes('link');
    if (attrs.href) {
      setUrl(attrs.href);
      setTitle(attrs.title || '');
      setNewTab(attrs.target === '_blank');
      setIsEditing(true);
    } else {
      setUrl('');
      setTitle('');
      setNewTab(true);
      setIsEditing(false);
    }
    // Get selected text
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, '');
    setText(selectedText);
    // Auto-detect URL in selected text
    if (selectedText && /^https?:\/\//.test(selectedText) && !attrs.href) {
      setUrl(selectedText);
    }
  }, [open, editor]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    const linkAttrs: any = {
      href: url,
      target: newTab ? '_blank' : undefined,
      rel: newTab ? 'noopener noreferrer' : undefined,
      title: title || undefined,
    };

    if (text && text !== editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, '')) {
      // If display text changed, replace selection content
      editor.chain().focus()
        .insertContent(`<a href="${url}"${newTab ? ' target="_blank" rel="noopener noreferrer"' : ''}${title ? ` title="${title}"` : ''}>${text}</a>`)
        .run();
    } else {
      editor.chain().focus().setLink(linkAttrs).run();
    }
    onClose();
  };

  const handleUnlink = () => {
    editor.chain().focus().unsetLink().run();
    onClose();
  };

  const isValid = url && /^(https?:\/\/|mailto:|tel:)/.test(url);

  return (
    <Modal open={open} onClose={onClose} title={isEditing ? 'Edit Link' : 'Insert Link'} width="md">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">URL *</label>
          <input
            value={url} onChange={e => setUrl(e.target.value)}
            className={`input-field !py-2 text-sm ${url && !isValid ? 'border-red-300 focus:ring-red-500/20 focus:border-red-500' : ''}`}
            placeholder="https://example.com"
            autoFocus
          />
          {url && !isValid && (
            <p className="text-xs text-red-500 mt-1">URL must start with http://, https://, mailto:, or tel:</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Display Text</label>
          <input value={text} onChange={e => setText(e.target.value)} className="input-field !py-2 text-sm" placeholder="Link text" />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Title (tooltip)</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className="input-field !py-2 text-sm" placeholder="Optional tooltip" />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={newTab} onChange={e => setNewTab(e.target.checked)}
            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          <span className="text-sm text-gray-700">Open in new tab</span>
        </label>

        <div className="flex items-center gap-2 pt-2">
          <button type="submit" disabled={!isValid} className="btn-primary flex-1">
            <Link size={14} />
            {isEditing ? 'Update Link' : 'Insert Link'}
          </button>
          {isEditing && (
            <button type="button" onClick={handleUnlink} className="btn-danger">
              <Unlink size={14} /> Unlink
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
