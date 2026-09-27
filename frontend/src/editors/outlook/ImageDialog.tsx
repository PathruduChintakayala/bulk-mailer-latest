import { useState, useEffect, useCallback } from 'react';
import type { Editor } from '@tiptap/react';
import Modal from '../../components/ui/Modal';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Upload, ImageIcon, Globe, Loader2, Check } from 'lucide-react';
import { assetUrl, absoluteAssetUrl } from '../../constants/assets';

interface Props {
  open: boolean;
  onClose: () => void;
  editor: Editor;
}

type Tab = 'upload' | 'assets' | 'url';

interface Asset {
  filename: string;
  url: string;
  size: number;
  content_type: string;
}

export default function ImageDialog({ open, onClose, editor }: Props) {
  const [tab, setTab] = useState<Tab>('upload');
  const [uploading, setUploading] = useState(false);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [altText, setAltText] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const loadAssets = useCallback(async () => {
    setLoadingAssets(true);
    try {
      const res = await api.get('/assets/');
      // Older uploads have no stored content type, so the file extension counts too
      setAssets(res.data.filter((a: Asset) =>
        a.content_type?.startsWith('image/') || /\.(png|jpe?g|gif|svg|webp)$/i.test(a.filename || a.url || '')
      ));
    } catch { /* ignore */ }
    finally { setLoadingAssets(false); }
  }, []);

  useEffect(() => {
    if (open && tab === 'assets') loadAssets();
  }, [open, tab, loadAssets]);

  const insertImage = (src: string) => {
    const serverUrl = absoluteAssetUrl(src);
    editor.chain().focus().setImage({ src: serverUrl, alt: altText || undefined }).run();
    onClose();
    setUrlInput('');
    setAltText('');
  };

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File must be under 5MB');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/assets/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      insertImage(res.data.url);
      toast.success('Image uploaded');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    } finally { setUploading(false); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'upload', label: 'Upload', icon: Upload },
    { key: 'assets', label: 'Assets', icon: ImageIcon },
    { key: 'url', label: 'URL', icon: Globe },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Insert Image" width="lg">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100/80 p-1 rounded-xl mb-4">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Alt text (shared) */}
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-600 mb-1">Alt Text (accessibility)</label>
        <input value={altText} onChange={e => setAltText(e.target.value)} className="input-field !py-2 text-sm" placeholder="Describe this image..." />
      </div>

      {/* Upload */}
      {tab === 'upload' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
            dragOver ? 'border-brand-400 bg-brand-50/50' : 'border-gray-200 hover:border-gray-300'
          }`}
          onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; input.onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleFileUpload(f); }; input.click(); }}
        >
          {uploading ? (
            <Loader2 size={32} className="mx-auto text-brand-500 animate-spin" />
          ) : (
            <>
              <Upload size={32} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500 font-medium">Drop an image here or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF, SVG, WebP up to 5MB</p>
            </>
          )}
        </div>
      )}

      {/* Assets gallery */}
      {tab === 'assets' && (
        <div>
          {loadingAssets ? (
            <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
          ) : assets.length === 0 ? (
            <p className="text-center py-8 text-sm text-gray-400">No images uploaded yet</p>
          ) : (
            <div className="grid grid-cols-4 gap-2 max-h-[300px] overflow-y-auto pr-1">
              {assets.map(asset => (
                <button key={asset.filename} onClick={() => insertImage(asset.url)}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-brand-400 hover:ring-2 hover:ring-brand-400/20 transition-all">
                  <img src={assetUrl(asset.url)} alt={asset.filename}
                    className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                    <Check size={20} className="text-white opacity-0 group-hover:opacity-100 drop-shadow-lg transition-opacity" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* URL */}
      {tab === 'url' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Image URL</label>
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)} className="input-field !py-2 text-sm" placeholder="https://example.com/image.png" />
          </div>
          {urlInput && (
            <div className="border rounded-lg p-3 bg-gray-50">
              <img src={urlInput} alt="Preview" className="max-h-32 mx-auto rounded" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          )}
          <button onClick={() => { if (urlInput) insertImage(urlInput); }} disabled={!urlInput}
            className="btn-primary w-full">
            Insert Image
          </button>
        </div>
      )}
    </Modal>
  );
}
