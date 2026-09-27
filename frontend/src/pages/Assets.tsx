import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import toast from 'react-hot-toast';
import { Upload, Trash2, Copy, Image, Loader2, Sparkles } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import PageContainer from '../components/ui/PageContainer';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import { assetUrl } from '../constants/assets';
import type { Asset } from '../types';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const item = { hidden: { opacity: 0, scale: 0.95 }, show: { opacity: 1, scale: 1, transition: { duration: 0.25 } } };

export default function Assets() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => { loadAssets(); }, []);

  const loadAssets = async () => {
    try { const res = await api.get('/assets/'); setAssets(res.data); }
    finally { setLoading(false); }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        await api.post('/assets/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      toast.success(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`);
      loadAssets();
    } catch (err: any) { toast.error(err.response?.data?.detail || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const handleDelete = async (code: string) => {
    try { await api.delete(`/assets/${code}`); toast.success('Asset deleted'); loadAssets(); }
    catch (err: any) { toast.error(err.response?.data?.detail || 'Failed to delete'); }
    finally { setDeleteTarget(null); }
  };

  const copyUrl = (url: string) => {
    const resolved = assetUrl(url);
    const fullUrl = resolved.startsWith('http') ? resolved : `${window.location.origin}${resolved}`;
    navigator.clipboard.writeText(fullUrl);
    toast.success('URL copied to clipboard');
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  return (
    <PageContainer className="space-y-6">
      <PageHeader title="Assets" subtitle="Upload images and files to use in your campaigns" />

      {/* Upload zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`card-static border-2 border-dashed p-8 text-center transition-all ${
          dragOver ? 'border-brand-400 bg-brand-50/50' : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={28} className="animate-spin text-brand-500" />
            <p className="text-sm text-gray-500">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-100 to-accent-100 flex items-center justify-center">
              <Upload size={24} className="text-brand-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">Drop files here or click to upload</p>
              <p className="text-xs text-gray-400 mt-1">PNG, JPG, GIF, SVG, WebP, ICO — Max 5MB each</p>
            </div>
            <label className="btn-primary cursor-pointer mt-1">
              <Upload size={14} /> Choose Files
              <input type="file" accept="image/*,.ico,.svg" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
            </label>
          </div>
        )}
      </div>

      {/* Asset grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card-static p-3">
              <div className="skeleton h-32 rounded-xl mb-2" />
              <div className="skeleton h-3 w-20" />
            </div>
          ))}
        </div>
      ) : assets.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No assets yet"
          description="Upload images above to use them across all your campaigns"
          iconTone="bg-gradient-to-br from-accent-100 to-pink-100"
          iconColor="text-accent-500"
        />
      ) : (
        <motion.div variants={container} initial="hidden" animate="show"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {assets.map(asset => (
            <motion.div key={asset.public_code} variants={item}>
              <div className="card group overflow-hidden">
                <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden relative">
                  <img
                    src={assetUrl(asset.url)}
                    alt={asset.original_name || asset.filename}
                    className="w-full h-full object-contain p-2"
                    onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
                  />
                  <Image size={32} className="text-gray-300 hidden" />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/50 sm:bg-black/50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center justify-center gap-2 max-sm:bg-transparent max-sm:items-end max-sm:justify-end max-sm:p-1.5">
                    <button type="button" onClick={() => copyUrl(asset.url)} className="p-2.5 bg-white rounded-xl shadow-lg hover:bg-gray-50 transition-colors cursor-pointer" title="Copy URL" aria-label={`Copy URL for ${asset.filename}`}>
                      <Copy size={16} className="text-gray-700" />
                    </button>
                    <button type="button" onClick={() => setDeleteTarget(asset.public_code)} className="p-2.5 bg-white rounded-xl shadow-lg hover:bg-red-50 transition-colors cursor-pointer" title="Delete" aria-label={`Delete ${asset.original_name || asset.filename}`}>
                      <Trash2 size={16} className="text-red-500" />
                    </button>
                  </div>
                </div>
                <div className="px-3 py-2.5 border-t border-gray-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate flex-1" title={asset.original_name || asset.filename}>{asset.original_name || asset.filename}</p>
                    <span className="font-mono text-[11px] text-gray-500 flex-shrink-0">{asset.public_code}</span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">{formatSize(asset.size)}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Asset"
        message="Are you sure you want to delete this asset? If it's used in any emails, the image will no longer appear."
        confirmLabel="Delete"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageContainer>
  );
}
