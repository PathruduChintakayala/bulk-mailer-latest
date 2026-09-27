/**
 * Asset library and uploader (spec 7.1, 7.2, 7.4).
 *
 * Handles local upload, drag and drop, clipboard paste and external URLs, with
 * per-file progress, retry and cancel. Metadata edits happen in place so alt text
 * is never an afterthought.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  Archive,
  ArchiveRestore,
  Check,
  Copy,
  FolderOpen,
  Grid3x3,
  Image as ImageIcon,
  Link2,
  List as ListIcon,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import * as composerApi from '../api/composerApi';
import type { AssetRecord } from '../api/types';
import { useComposer } from '../store/composerStore';
import { Dialog, DialogButton } from '../ui/Dialog';
import { InlineEmpty, Pill, Segmented, Spinner } from '../ui/primitives';
import { TextInput } from '../ui/controls';
import { isSafeUrl } from '../visual/styles';
import type { PickedAsset } from '../panels/inspectorParts';

interface UploadJob {
  id: string;
  file: File;
  percent: number;
  status: 'uploading' | 'failed' | 'done';
  error?: string;
  controller: AbortController;
}

export interface AssetPickerRequest {
  onPick: (asset: PickedAsset) => void;
  purpose?: string;
}

export function AssetLibrary({ request, onClose }: { request: AssetPickerRequest | null; onClose: () => void }) {
  const settings = useComposer(store => store.settings);
  const can = useComposer(store => store.can);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [term, setTerm] = useState('');
  const [folder, setFolder] = useState('');
  const [sort, setSort] = useState<'recent' | 'name' | 'size' | 'usage'>('recent');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selected, setSelected] = useState<AssetRecord | null>(null);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [externalUrl, setExternalUrl] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const maxKb = Number(settings?.max_image_size_kb ?? 2048);
  const allowedFormats = (settings?.allowed_image_formats as string[] | undefined) || ['png', 'jpg', 'jpeg', 'gif', 'webp'];

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await composerApi.listAssets({ search: term, folder, sort, include_archived: includeArchived });
      setAssets(data.assets);
      setFolders(data.folders);
    } catch (error) {
      toast.error(composerApi.describeError(error, 'The asset library could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [folder, includeArchived, sort, term]);

  useEffect(() => {
    if (request) void refresh();
  }, [request, refresh]);

  const validateFile = useCallback(
    (file: File): string | null => {
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      if (!allowedFormats.includes(extension)) {
        return `${extension || 'That file type'} is not allowed. Use ${allowedFormats.join(', ')}.`;
      }
      if (file.size / 1024 > maxKb) {
        return `The file is ${Math.round(file.size / 1024)}KB. The limit is ${maxKb}KB.`;
      }
      return null;
    },
    [allowedFormats, maxKb]
  );

  const startUpload = useCallback(
    (files: File[]) => {
      files.forEach(file => {
        const problem = validateFile(file);
        if (problem) {
          toast.error(problem);
          return;
        }
        const job: UploadJob = {
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          file,
          percent: 0,
          status: 'uploading',
          controller: new AbortController(),
        };
        setJobs(current => [...current, job]);
        composerApi
          .uploadAsset(
            file,
            percent => setJobs(current => current.map(entry => (entry.id === job.id ? { ...entry, percent } : entry))),
            job.controller.signal
          )
          .then(() => {
            setJobs(current => current.map(entry => (entry.id === job.id ? { ...entry, status: 'done', percent: 100 } : entry)));
            void refresh();
            setTimeout(() => setJobs(current => current.filter(entry => entry.id !== job.id)), 1200);
          })
          .catch(error => {
            setJobs(current =>
              current.map(entry =>
                entry.id === job.id
                  ? { ...entry, status: 'failed', error: composerApi.describeError(error, 'The upload failed.') }
                  : entry
              )
            );
          });
      });
    },
    [refresh, validateFile]
  );

  // Clipboard paste, so a screenshot can go straight into the library.
  useEffect(() => {
    if (!request) return;
    const onPaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files || []);
      if (files.length) {
        event.preventDefault();
        startUpload(files);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [request, startUpload]);

  const pick = (asset: AssetRecord) => {
    if (!request) return;
    void composerApi.markAssetUsed(asset.public_code);
    request.onPick({
      url: asset.url,
      alt: asset.alt_text || '',
      width: asset.width,
      height: asset.height,
      code: asset.public_code,
    });
    onClose();
  };

  const useExternal = () => {
    if (!request) return;
    const url = externalUrl.trim();
    if (!isSafeUrl(url)) {
      toast.error('Enter an https:// image address.');
      return;
    }
    if (url.toLowerCase().startsWith('http://')) {
      toast('Images loaded over plain HTTP are often blocked. https is safer.', { icon: '⚠' });
    }
    request.onPick({ url });
    onClose();
  };

  const visible = useMemo(() => assets, [assets]);

  return (
    <Dialog
      open={!!request}
      onClose={onClose}
      size="xl"
      title="Images"
      description="Upload new images, or reuse something already in the library."
      bodyClassName="pt-3"
      footer={
        <>
          <DialogButton onClick={onClose}>Cancel</DialogButton>
          <DialogButton variant="primary" onClick={() => selected && pick(selected)} disabled={!selected}>
            Use this image
          </DialogButton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={term}
              onChange={event => setTerm(event.target.value)}
              placeholder="Search by name, alt text or tag"
              aria-label="Search assets"
              className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-2 text-[12.5px] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <select
            value={folder}
            onChange={event => setFolder(event.target.value)}
            aria-label="Folder"
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-[12.5px] focus:border-brand-400 focus:outline-none"
          >
            <option value="">All folders</option>
            {folders.map(name => (
              <option key={name} value={name}>
                {name || 'Unfiled'}
              </option>
            ))}
          </select>

          <select
            value={sort}
            onChange={event => setSort(event.target.value as typeof sort)}
            aria-label="Sort by"
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-[12.5px] focus:border-brand-400 focus:outline-none"
          >
            <option value="recent">Newest first</option>
            <option value="name">Name</option>
            <option value="size">Size</option>
            <option value="usage">Most used</option>
          </select>

          <Segmented
            label="View"
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'grid', label: 'Grid', icon: <Grid3x3 size={11} /> },
              { value: 'list', label: 'List', icon: <ListIcon size={11} /> },
            ]}
          />

          <label className="flex items-center gap-1.5 text-[11.5px] text-gray-600">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={event => setIncludeArchived(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Show archived
          </label>
        </div>

        {/* Upload surface */}
        <div
          onDragOver={event => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={event => {
            event.preventDefault();
            setDragActive(false);
            startUpload(Array.from(event.dataTransfer.files));
          }}
          className={clsx(
            'flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed px-3 py-2.5 transition-colors',
            dragActive ? 'border-brand-400 bg-brand-50/60' : 'border-gray-200 bg-gray-50/60'
          )}
        >
          <Upload size={16} className="text-gray-400" />
          <p className="min-w-0 flex-1 text-[12px] text-gray-600">
            Drop images here, paste from the clipboard, or{' '}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="font-semibold text-brand-700 underline hover:text-brand-800"
            >
              browse your device
            </button>
            . Up to {maxKb}KB, {allowedFormats.join(', ')}.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={allowedFormats.map(format => `.${format}`).join(',')}
            className="hidden"
            onChange={event => {
              startUpload(Array.from(event.target.files || []));
              event.target.value = '';
            }}
          />
        </div>

        {jobs.length > 0 && (
          <ul className="space-y-1.5">
            {jobs.map(job => (
              <li key={job.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-gray-800">{job.file.name}</span>
                  {job.status === 'failed' ? (
                    <span className="block text-[11px] text-red-600">{job.error}</span>
                  ) : (
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-gray-200">
                      <span
                        className="block h-full rounded-full bg-brand-500 transition-all"
                        style={{ width: `${job.percent}%` }}
                      />
                    </span>
                  )}
                </span>
                {job.status === 'uploading' && (
                  <>
                    <span className="text-[11px] tabular-nums text-gray-500">{job.percent}%</span>
                    <button
                      type="button"
                      onClick={() => {
                        job.controller.abort();
                        setJobs(current => current.filter(entry => entry.id !== job.id));
                      }}
                      aria-label={`Cancel uploading ${job.file.name}`}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    >
                      <X size={12} />
                    </button>
                  </>
                )}
                {job.status === 'failed' && (
                  <button
                    type="button"
                    onClick={() => {
                      setJobs(current => current.filter(entry => entry.id !== job.id));
                      startUpload([job.file]);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-200"
                  >
                    <RotateCcw size={11} />
                    Retry
                  </button>
                )}
                {job.status === 'done' && <Check size={14} className="text-emerald-600" />}
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-3 lg:grid-cols-[1fr_252px]">
          <div className="min-h-[220px]">
            {loading ? (
              <div className="flex h-40 items-center justify-center text-gray-400">
                <Spinner size={18} />
              </div>
            ) : visible.length ? (
              view === 'grid' ? (
                <div className="grid max-h-[42vh] grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4 lg:grid-cols-5">
                  {visible.map(asset => (
                    <button
                      key={asset.public_code}
                      type="button"
                      onClick={() => setSelected(asset)}
                      onDoubleClick={() => pick(asset)}
                      className={clsx(
                        'group relative overflow-hidden rounded-lg border-2 bg-gray-50 transition-all',
                        selected?.public_code === asset.public_code
                          ? 'border-brand-500 ring-2 ring-brand-200'
                          : 'border-transparent hover:border-brand-300'
                      )}
                    >
                      <span className="flex aspect-square items-center justify-center">
                        <img
                          src={asset.url}
                          alt={asset.alt_text || asset.original_name}
                          loading="lazy"
                          className="max-h-full max-w-full object-contain"
                        />
                      </span>
                      <span className="block truncate border-t border-gray-100 bg-white px-1.5 py-1 text-left text-[10.5px] text-gray-600">
                        {asset.original_name || asset.filename}
                      </span>
                      {asset.archived_at && (
                        <span className="absolute left-1 top-1">
                          <Pill tone="gray">Archived</Pill>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="max-h-[42vh] overflow-y-auto">
                  <table className="w-full text-left text-[12px]">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-gray-200 text-[10.5px] uppercase tracking-wide text-gray-400">
                        <th className="py-1.5 pr-2 font-semibold">Name</th>
                        <th className="py-1.5 pr-2 font-semibold">Folder</th>
                        <th className="py-1.5 pr-2 font-semibold">Size</th>
                        <th className="py-1.5 pr-2 font-semibold">Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(asset => (
                        <tr
                          key={asset.public_code}
                          onClick={() => setSelected(asset)}
                          onDoubleClick={() => pick(asset)}
                          className={clsx(
                            'cursor-pointer border-b border-gray-100',
                            selected?.public_code === asset.public_code ? 'bg-brand-50' : 'hover:bg-gray-50'
                          )}
                        >
                          <td className="py-1.5 pr-2">
                            <span className="flex items-center gap-2">
                              <img src={asset.url} alt="" className="h-6 w-6 rounded object-cover" loading="lazy" />
                              <span className="truncate">{asset.original_name || asset.filename}</span>
                            </span>
                          </td>
                          <td className="py-1.5 pr-2 text-gray-500">{asset.folder || 'Unfiled'}</td>
                          <td className="py-1.5 pr-2 tabular-nums text-gray-500">{Math.round(asset.size / 1024)}KB</td>
                          <td className="py-1.5 pr-2 tabular-nums text-gray-500">{asset.usage_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <InlineEmpty
                icon={<ImageIcon size={20} />}
                title="No images yet"
                description="Upload an image to reuse it across templates and campaigns."
              />
            )}

            <div className="mt-3 rounded-xl border border-gray-200 p-2.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <Link2 size={11} />
                Use an external image
              </p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={externalUrl}
                  onChange={event => setExternalUrl(event.target.value)}
                  placeholder="https://cdn.example.com/image.png"
                  aria-label="External image URL"
                  className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[12px] focus:border-brand-400 focus:outline-none"
                />
                <DialogButton onClick={useExternal} disabled={!externalUrl.trim()}>
                  Use URL
                </DialogButton>
              </div>
            </div>
          </div>

          <AssetDetails
            asset={selected}
            canManage={can('manage_assets')}
            onChanged={refresh}
            onSelectFolder={setFolder}
          />
        </div>
      </div>
    </Dialog>
  );
}

function AssetDetails({
  asset,
  canManage,
  onChanged,
  onSelectFolder,
}: {
  asset: AssetRecord | null;
  canManage: boolean;
  onChanged: () => void;
  onSelectFolder: (folder: string) => void;
}) {
  const [name, setName] = useState('');
  const [alt, setAlt] = useState('');
  const [folder, setFolder] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    setName(asset?.original_name || '');
    setAlt(asset?.alt_text || '');
    setFolder(asset?.folder || '');
    setTags((asset?.tags || []).join(', '));
    setConfirmArchive(false);
  }, [asset]);

  if (!asset) {
    return (
      <aside className="rounded-xl bg-gray-50 p-3 text-[12px] leading-snug text-gray-500">
        Select an image to see its details, edit alt text and check where it is used.
      </aside>
    );
  }

  const save = async () => {
    setSaving(true);
    try {
      await composerApi.updateAsset(asset.public_code, {
        original_name: name.trim() || asset.original_name,
        alt_text: alt,
        folder: folder.trim(),
        tags: tags
          .split(',')
          .map(tag => tag.trim())
          .filter(Boolean),
      });
      toast.success('Image details saved.');
      onChanged();
    } catch (error) {
      toast.error(composerApi.describeError(error, 'The details could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async () => {
    try {
      await composerApi.updateAsset(asset.public_code, { archived: !asset.archived_at });
      toast.success(asset.archived_at ? 'Image restored.' : 'Image archived.');
      onChanged();
    } catch (error) {
      toast.error(composerApi.describeError(error, 'That change could not be applied.'));
    }
  };

  return (
    <aside className="space-y-3 rounded-xl bg-gray-50 p-3">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <img src={asset.url} alt={asset.alt_text || ''} className="max-h-32 w-full object-contain" />
      </div>

      <dl className="space-y-1 text-[11.5px]">
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Type</dt>
          <dd className="font-medium text-gray-800">{asset.content_type || '—'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Size</dt>
          <dd className="font-medium tabular-nums text-gray-800">{Math.round(asset.size / 1024)}KB</dd>
        </div>
        {asset.width && asset.height && (
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500">Dimensions</dt>
            <dd className="font-medium tabular-nums text-gray-800">
              {asset.width}×{asset.height}
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Used in</dt>
          <dd className="font-medium tabular-nums text-gray-800">
            {asset.usage_count} place{asset.usage_count === 1 ? '' : 's'}
          </dd>
        </div>
      </dl>

      <TextInput label="Name" value={name} onChange={setName} disabled={!canManage} />
      <TextInput
        label="Alt text"
        value={alt}
        onChange={setAlt}
        disabled={!canManage}
        hint="Describe the image for screen readers and blocked-image fallbacks."
      />
      <TextInput
        label="Folder"
        value={folder}
        onChange={setFolder}
        disabled={!canManage}
        action={
          asset.folder ? (
            <button
              type="button"
              onClick={() => onSelectFolder(asset.folder)}
              className="inline-flex items-center gap-1 text-[10.5px] font-medium text-brand-700"
            >
              <FolderOpen size={10} />
              Filter
            </button>
          ) : undefined
        }
      />
      <TextInput label="Tags" value={tags} onChange={setTags} disabled={!canManage} hint="Comma separated." />

      <div className="flex flex-wrap gap-1.5">
        <DialogButton variant="primary" onClick={save} busy={saving} disabled={!canManage}>
          Save details
        </DialogButton>
        <DialogButton
          onClick={() => {
            void navigator.clipboard?.writeText(asset.url);
            toast.success('URL copied.');
          }}
        >
          <Copy size={12} />
          Copy URL
        </DialogButton>
      </div>

      {canManage && (
        <div className="border-t border-gray-200 pt-2">
          {asset.archived_at ? (
            <DialogButton onClick={toggleArchive}>
              <ArchiveRestore size={12} />
              Restore
            </DialogButton>
          ) : confirmArchive ? (
            <div className="space-y-1.5">
              <p className="text-[11px] leading-snug text-amber-800">
                {asset.usage_count > 0
                  ? `This image is used in ${asset.usage_count} place${asset.usage_count === 1 ? '' : 's'}. Archiving keeps existing emails working but hides it from the picker.`
                  : 'Archiving hides this image from the picker. It can be restored later.'}
              </p>
              <div className="flex gap-1.5">
                <DialogButton variant="danger" onClick={toggleArchive}>
                  <Archive size={12} />
                  Archive
                </DialogButton>
                <DialogButton onClick={() => setConfirmArchive(false)}>Cancel</DialogButton>
              </div>
            </div>
          ) : (
            <DialogButton variant="ghost" onClick={() => setConfirmArchive(true)}>
              <Trash2 size={12} />
              Archive image
            </DialogButton>
          )}
        </div>
      )}
    </aside>
  );
}
