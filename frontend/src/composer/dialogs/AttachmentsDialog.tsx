/**
 * Campaign attachments (spec 26).
 *
 * Attachments belong to the campaign, not to the email body, so they live here rather
 * than as a content block. Limits come from administration settings.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Download, FileWarning, Paperclip, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import * as composerApi from '../api/composerApi';
import type { AttachmentResponse } from '../api/types';
import { useComposer } from '../store/composerStore';
import { Dialog, DialogButton } from '../ui/Dialog';
import { InlineEmpty, Pill, Spinner } from '../ui/primitives';

interface Job {
  id: string;
  file: File;
  percent: number;
  status: 'uploading' | 'failed';
  error?: string;
  controller: AbortController;
}

export function AttachmentsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const campaignCode = useComposer(store => store.targetCode);
  const targetType = useComposer(store => store.targetType);
  const settings = useComposer(store => store.settings);
  const canEdit = useComposer(store => store.canEdit);

  const [attachments, setAttachments] = useState<AttachmentResponse[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [maxTotalKb, setMaxTotalKb] = useState(Number(settings?.max_total_attachment_size_kb ?? 10240));
  const [maxCount, setMaxCount] = useState(Number(settings?.max_attachment_count ?? 5));
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const allowed = (settings?.allowed_attachment_types as string[] | undefined) || [];
  const blocked = (settings?.blocked_attachment_types as string[] | undefined) || [];
  const maxFileKb = Number(settings?.max_attachment_size_kb ?? 5120);

  const refresh = useCallback(async () => {
    if (targetType !== 'campaign') return;
    setLoading(true);
    try {
      const data = await composerApi.listAttachments(campaignCode);
      setAttachments(data.attachments);
      setTotalSize(data.total_size);
      setMaxTotalKb(data.max_total_size_kb);
      setMaxCount(data.max_count);
    } catch (error) {
      toast.error(composerApi.describeError(error, 'Attachments could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [campaignCode, targetType]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const validate = (file: File): string | null => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (blocked.includes(extension)) return `${extension} files are blocked by policy.`;
    if (allowed.length && !allowed.includes(extension)) return `Only ${allowed.join(', ')} files are allowed.`;
    if (file.size / 1024 > maxFileKb) return `${file.name} is ${Math.round(file.size / 1024)}KB. The limit is ${maxFileKb}KB.`;
    if (attachments.length + jobs.length >= maxCount) return `A campaign can have at most ${maxCount} attachments.`;
    if ((totalSize + file.size) / 1024 > maxTotalKb) return `That would exceed the ${maxTotalKb}KB total limit.`;
    if (attachments.some(entry => entry.filename === file.name)) return `${file.name} is already attached.`;
    return null;
  };

  const upload = (files: File[]) => {
    files.forEach(file => {
      const problem = validate(file);
      if (problem) {
        toast.error(problem);
        return;
      }
      const job: Job = {
        id: `${file.name}-${Date.now()}`,
        file,
        percent: 0,
        status: 'uploading',
        controller: new AbortController(),
      };
      setJobs(current => [...current, job]);
      composerApi
        .uploadAttachment(
          campaignCode,
          file,
          percent => setJobs(current => current.map(entry => (entry.id === job.id ? { ...entry, percent } : entry))),
          job.controller.signal
        )
        .then(() => {
          setJobs(current => current.filter(entry => entry.id !== job.id));
          void refresh();
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
  };

  const remove = async (attachment: AttachmentResponse) => {
    if (!window.confirm(`Remove ${attachment.filename} from this campaign?`)) return;
    try {
      await composerApi.deleteAttachment(campaignCode, attachment.id);
      toast.success('Attachment removed.');
      void refresh();
    } catch (error) {
      toast.error(composerApi.describeError(error, 'The attachment could not be removed.'));
    }
  };

  const usedPct = maxTotalKb ? Math.min(100, Math.round(((totalSize / 1024) / maxTotalKb) * 100)) : 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Attachments"
      description="Files are attached to every recipient's email. Large attachments hurt deliverability."
      footer={<DialogButton variant="primary" onClick={onClose}>Done</DialogButton>}
    >
      {targetType !== 'campaign' ? (
        <InlineEmpty
          icon={<Paperclip size={20} />}
          title="Attachments are set per campaign"
          description="Open a campaign to add attachments. Templates do not carry files."
        />
      ) : (
        <div className="space-y-3">
          <div
            onDragOver={event => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={event => {
              event.preventDefault();
              setDragActive(false);
              upload(Array.from(event.dataTransfer.files));
            }}
            className={clsx(
              'flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed px-3 py-3 transition-colors',
              dragActive ? 'border-brand-400 bg-brand-50/60' : 'border-gray-200 bg-gray-50/60'
            )}
          >
            <Upload size={16} className="text-gray-400" />
            <p className="min-w-0 flex-1 text-[12px] leading-snug text-gray-600">
              Drop files here or{' '}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={!canEdit}
                className="font-semibold text-brand-700 underline hover:text-brand-800 disabled:opacity-40"
              >
                browse your device
              </button>
              . Up to {maxCount} files, {maxFileKb}KB each
              {allowed.length ? `, ${allowed.join(', ')} only` : ''}.
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={event => {
                upload(Array.from(event.target.files || []));
                event.target.value = '';
              }}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-[11.5px] text-gray-600">
              <span>
                {attachments.length} of {maxCount} files
              </span>
              <span className="tabular-nums">
                {Math.round(totalSize / 1024)}KB of {maxTotalKb}KB
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-200">
              <div
                className={clsx('h-full rounded-full transition-all', usedPct > 85 ? 'bg-red-500' : 'bg-brand-500')}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            {usedPct > 85 && (
              <p className="mt-1 flex items-center gap-1 text-[11px] text-red-700">
                <FileWarning size={11} />
                Close to the provider limit. Consider linking to files instead.
              </p>
            )}
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
                        <span className="block h-full rounded-full bg-brand-500 transition-all" style={{ width: `${job.percent}%` }} />
                      </span>
                    )}
                  </span>
                  {job.status === 'uploading' ? (
                    <>
                      <span className="text-[11px] tabular-nums text-gray-500">{job.percent}%</span>
                      <button
                        type="button"
                        onClick={() => {
                          job.controller.abort();
                          setJobs(current => current.filter(entry => entry.id !== job.id));
                        }}
                        aria-label={`Cancel uploading ${job.file.name}`}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100"
                      >
                        <X size={12} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setJobs(current => current.filter(entry => entry.id !== job.id));
                        upload([job.file]);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-200"
                    >
                      <RotateCcw size={11} />
                      Retry
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {loading ? (
            <div className="flex h-20 items-center justify-center text-gray-400">
              <Spinner size={18} />
            </div>
          ) : attachments.length ? (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {attachments.map(attachment => (
                <li key={attachment.id} className="flex items-center gap-2 px-2.5 py-2">
                  <Paperclip size={13} className="shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-gray-900">{attachment.filename}</span>
                    <span className="block text-[10.5px] text-gray-500">
                      {attachment.content_type || 'unknown type'} · {Math.round(attachment.size / 1024)}KB
                      {attachment.is_inline && ' · inline'}
                    </span>
                  </span>
                  {attachment.is_inline && <Pill tone="blue">Inline</Pill>}
                  <a
                    href={attachment.download_url}
                    download
                    title={`Download ${attachment.filename}`}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <Download size={13} />
                  </a>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void remove(attachment)}
                      title={`Remove ${attachment.filename}`}
                      aria-label={`Remove ${attachment.filename}`}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <InlineEmpty icon={<Paperclip size={20} />} title="No attachments" description="This campaign sends without files." />
          )}
        </div>
      )}
    </Dialog>
  );
}
