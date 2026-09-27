import { useState, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import Modal from '../../components/ui/Modal';
import { Plus, Pencil, Trash2, Check, FileSignature } from 'lucide-react';
import toast from 'react-hot-toast';

interface Signature {
  id: string;
  name: string;
  html: string;
  isDefault: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  editor: Editor;
}

const STORAGE_KEY = 'bulkmailer_signatures';

function loadSignatures(): Signature[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch { return []; }
}

function saveSignatures(sigs: Signature[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sigs));
}

export default function SignatureManager({ open, onClose, editor }: Props) {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [editing, setEditing] = useState<Signature | null>(null);
  const [name, setName] = useState('');
  const [html, setHtml] = useState('');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (open) setSignatures(loadSignatures());
  }, [open]);

  const handleSave = () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    const sigs = [...signatures];
    if (editing) {
      const idx = sigs.findIndex(s => s.id === editing.id);
      if (idx >= 0) sigs[idx] = { ...sigs[idx], name, html };
    } else {
      sigs.push({ id: Date.now().toString(), name, html, isDefault: sigs.length === 0 });
    }
    saveSignatures(sigs);
    setSignatures(sigs);
    setShowForm(false);
    setEditing(null);
    setName('');
    setHtml('');
    toast.success(editing ? 'Signature updated' : 'Signature created');
  };

  const handleDelete = (id: string) => {
    const sigs = signatures.filter(s => s.id !== id);
    saveSignatures(sigs);
    setSignatures(sigs);
    toast.success('Signature deleted');
  };

  const handleSetDefault = (id: string) => {
    const sigs = signatures.map(s => ({ ...s, isDefault: s.id === id }));
    saveSignatures(sigs);
    setSignatures(sigs);
  };

  const handleInsert = (sig: Signature) => {
    editor.chain().focus().insertContent(
      `<div data-signature="true" style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:14px;">` +
      sig.html +
      `</div>`
    ).run();
    onClose();
  };

  const handleEdit = (sig: Signature) => {
    setEditing(sig);
    setName(sig.name);
    setHtml(sig.html);
    setShowForm(true);
  };

  return (
    <Modal open={open} onClose={onClose} title="Email Signatures" width="lg">
      {!showForm ? (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              {signatures.length === 0 ? 'No signatures yet' : `${signatures.length} signature${signatures.length !== 1 ? 's' : ''}`}
            </p>
            <button onClick={() => { setShowForm(true); setEditing(null); setName(''); setHtml(''); }} className="btn-primary !py-1.5 !px-3 text-sm">
              <Plus size={14} /> New
            </button>
          </div>

          {signatures.map(sig => (
            <div key={sig.id} className="card-static p-3 flex items-start gap-3 group">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-gray-800">{sig.name}</span>
                  {sig.isDefault && <span className="badge-purple text-[10px] !py-0">Default</span>}
                </div>
                <div className="text-xs text-gray-500 mt-1 line-clamp-2" dangerouslySetInnerHTML={{ __html: sig.html }} />
              </div>
              <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <button type="button" onClick={() => handleInsert(sig)} className="p-1.5 rounded-lg hover:bg-brand-50 text-brand-500 cursor-pointer" title="Insert" aria-label={`Insert signature ${sig.name}`}>
                  <FileSignature size={14} />
                </button>
                {!sig.isDefault && (
                  <button type="button" onClick={() => handleSetDefault(sig.id)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer" title="Set as default" aria-label={`Set ${sig.name} as default signature`}>
                    <Check size={14} />
                  </button>
                )}
                <button type="button" onClick={() => handleEdit(sig)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer" title="Edit" aria-label={`Edit signature ${sig.name}`}>
                  <Pencil size={14} />
                </button>
                <button type="button" onClick={() => handleDelete(sig.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-500 hover:text-red-500 cursor-pointer" title="Delete" aria-label={`Delete signature ${sig.name}`}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Signature Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input-field !py-2 text-sm" placeholder="e.g. Work, Personal" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Content (HTML)</label>
            <textarea
              value={html} onChange={e => setHtml(e.target.value)}
              className="input-field !py-2 text-sm font-mono min-h-[120px]"
              placeholder={'<p>Best regards,</p>\n<p><strong>John Doe</strong></p>\n<p>john@company.com</p>'}
            />
          </div>
          {html && (
            <div className="border rounded-xl p-3 bg-gray-50">
              <p className="text-[10px] text-gray-400 mb-1.5 uppercase font-medium">Preview</p>
              <div className="text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} className="btn-primary flex-1">
              {editing ? 'Update Signature' : 'Create Signature'}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
