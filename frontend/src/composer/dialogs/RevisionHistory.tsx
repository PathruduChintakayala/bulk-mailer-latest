/**
 * Version history (spec 22.4, 22.5).
 *
 * Published revisions are immutable, so restoring one creates a new draft rather than
 * editing history. Comparison uses the HTML that each revision produced.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { CheckCircle2, Clock, Download, Eye, GitCompare, History, RotateCcw, ShieldCheck, XCircle } from 'lucide-react';
import * as composerApi from '../api/composerApi';
import type { RevisionContent, RevisionSummary } from '../api/types';
import { useComposer, relativeTime } from '../store/composerStore';
import { Dialog, DialogButton } from '../ui/Dialog';
import { InlineEmpty, Pill, Segmented, Spinner } from '../ui/primitives';
import { DiffView } from '../code/DiffView';

type View = 'list' | 'compare' | 'preview';

export function RevisionHistory({ open, onClose }: { open: boolean; onClose: () => void }) {
  const revisions = useComposer(store => store.revisions);
  const draftCode = useComposer(store => store.draftCode);
  const htmlSource = useComposer(store => store.htmlSource);
  const compiled = useComposer(store => store.compiled);
  const restore = useComposer(store => store.restore);
  const canPublish = useComposer(store => store.can('publish_templates'));

  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<string | null>(null);
  const [compareWith, setCompareWith] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, RevisionContent>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const ordered = useMemo(
    () => [...revisions].sort((a, b) => b.revision_no - a.revision_no),
    [revisions]
  );

  useEffect(() => {
    if (open) {
      setView('list');
      setSelected(ordered[0]?.public_code ?? null);
      setCompareWith(ordered[1]?.public_code ?? null);
    }
  }, [open, ordered]);

  const load = useCallback(
    async (code: string): Promise<RevisionContent | null> => {
      if (cache[code]) return cache[code];
      setLoading(true);
      try {
        const content = await composerApi.getRevision(code);
        setCache(current => ({ ...current, [code]: content }));
        return content;
      } catch (error) {
        toast.error(composerApi.describeError(error, 'That revision could not be loaded.'));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [cache]
  );

  useEffect(() => {
    if (!open) return;
    if (selected) void load(selected);
    if (view === 'compare' && compareWith) void load(compareWith);
  }, [compareWith, load, open, selected, view]);

  const selectedRevision = ordered.find(entry => entry.public_code === selected) || null;
  const selectedContent = selected ? cache[selected] : undefined;
  const compareContent = compareWith ? cache[compareWith] : undefined;

  const htmlOf = (content: RevisionContent | undefined, fallback = ''): string =>
    content?.html_source || content?.compiled_html || fallback;

  const doRestore = async () => {
    if (!selectedRevision) return;
    if (
      !window.confirm(
        `Restore revision ${selectedRevision.revision_no}? A new draft is created from it; the current draft stays in history.`
      )
    )
      return;
    setBusy(true);
    const ok = await restore(selectedRevision.public_code);
    setBusy(false);
    if (ok) {
      toast.success(`Restored revision ${selectedRevision.revision_no} into a new draft.`);
      onClose();
    }
  };

  const exportRevision = async () => {
    if (!selectedRevision) return;
    const content = await load(selectedRevision.public_code);
    if (!content) return;
    const blob = new Blob([content.compiled_html || content.html_source || ''], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `revision-${selectedRevision.revision_no}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title="Version history"
      description="Every save creates a revision. Published revisions cannot be changed."
      footer={
        <>
          <DialogButton onClick={onClose}>Close</DialogButton>
          <DialogButton onClick={exportRevision} disabled={!selectedRevision}>
            <Download size={12} />
            Export
          </DialogButton>
          <DialogButton
            variant="primary"
            onClick={doRestore}
            busy={busy}
            disabled={!selectedRevision || selectedRevision.public_code === draftCode}
          >
            <RotateCcw size={12} />
            Restore as new draft
          </DialogButton>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="min-w-0">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
            {ordered.length} revision{ordered.length === 1 ? '' : 's'}
          </p>
          <ul className="max-h-[52vh] space-y-1 overflow-y-auto pr-1">
            {ordered.length ? (
              ordered.map(revision => (
                <li key={revision.public_code}>
                  <button
                    type="button"
                    onClick={() => setSelected(revision.public_code)}
                    className={clsx(
                      'w-full rounded-xl border px-2.5 py-2 text-left transition-colors',
                      selected === revision.public_code
                        ? 'border-brand-400 bg-brand-50/70'
                        : 'border-gray-200 hover:border-brand-300'
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-semibold text-gray-900">Revision {revision.revision_no}</span>
                      {revision.public_code === draftCode && <Pill tone="blue">Current draft</Pill>}
                      {revision.status === 'published' && (
                        <Pill tone="green" icon={<ShieldCheck size={9} />}>
                          Published
                        </Pill>
                      )}
                      {revision.kind === 'custom_html' && <Pill tone="violet">Custom HTML</Pill>}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-gray-500">
                      {revision.author_name || 'Unknown author'} ·{' '}
                      {revision.created_at ? relativeTime(new Date(revision.created_at).getTime()) : 'unknown time'}
                    </span>
                    {revision.change_summary && (
                      <span className="mt-0.5 block truncate text-[11px] text-gray-600">{revision.change_summary}</span>
                    )}
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                      <ValidationBadge summary={revision.validation_summary} />
                      {revision.campaign_usage > 0 && (
                        <Pill tone="amber">
                          Used by {revision.campaign_usage} campaign{revision.campaign_usage === 1 ? '' : 's'}
                        </Pill>
                      )}
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li>
                <InlineEmpty icon={<History size={18} />} title="No revisions yet" description="Save the draft to create the first revision." />
              </li>
            )}
          </ul>
        </div>

        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Revision view"
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'list', label: 'Details' },
                { value: 'preview', label: 'Preview', icon: <Eye size={11} /> },
                { value: 'compare', label: 'Compare', icon: <GitCompare size={11} /> },
              ]}
            />
            {view === 'compare' && (
              <label className="flex items-center gap-1.5 text-[11.5px] text-gray-600">
                Compare with
                <select
                  value={compareWith || ''}
                  onChange={event => setCompareWith(event.target.value || null)}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-[11.5px] focus:border-brand-400 focus:outline-none"
                >
                  <option value="">Current draft</option>
                  {ordered
                    .filter(entry => entry.public_code !== selected)
                    .map(entry => (
                      <option key={entry.public_code} value={entry.public_code}>
                        Revision {entry.revision_no}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {loading && <Spinner size={14} className="text-gray-400" />}
          </div>

          {view === 'list' && selectedRevision && (
            <dl className="grid gap-x-4 gap-y-1.5 rounded-xl bg-gray-50 p-3 text-[12px] sm:grid-cols-2">
              <Detail label="Revision" value={`#${selectedRevision.revision_no}`} />
              <Detail label="Status" value={selectedRevision.status} />
              <Detail label="Type" value={selectedRevision.kind === 'visual' ? 'Visual' : 'Custom HTML'} />
              <Detail label="Author" value={selectedRevision.author_name || '—'} />
              <Detail
                label="Created"
                value={selectedRevision.created_at ? new Date(selectedRevision.created_at).toLocaleString() : '—'}
              />
              <Detail
                label="Published"
                value={selectedRevision.published_at ? new Date(selectedRevision.published_at).toLocaleString() : 'Not published'}
              />
              <Detail label="Subject" value={selectedRevision.subject || '—'} />
              <Detail label="Preheader" value={selectedRevision.preheader || '—'} />
              <Detail label="Theme" value={selectedRevision.theme_code || 'Default'} />
              <Detail label="Campaign usage" value={String(selectedRevision.campaign_usage)} />
              {selectedRevision.change_summary && (
                <div className="sm:col-span-2">
                  <dt className="text-[10.5px] uppercase tracking-wide text-gray-400">Summary</dt>
                  <dd className="text-gray-800">{selectedRevision.change_summary}</dd>
                </div>
              )}
              {selectedRevision.status === 'published' && (
                <p className="sm:col-span-2 flex items-start gap-1.5 rounded-lg bg-white px-2 py-1.5 text-[11.5px] text-gray-600">
                  <ShieldCheck size={12} className="mt-px shrink-0 text-emerald-600" />
                  Published revisions are frozen. Restoring copies this content into a new draft.
                </p>
              )}
              {!canPublish && (
                <p className="sm:col-span-2 text-[11px] text-gray-500">
                  You can restore revisions, but publishing requires the publish permission.
                </p>
              )}
            </dl>
          )}

          {view === 'preview' && (
            <div className="h-[48vh] overflow-hidden rounded-xl border border-gray-200 bg-white">
              {selectedContent?.compiled_html ? (
                <iframe
                  title={`Revision ${selectedRevision?.revision_no ?? ''} preview`}
                  srcDoc={selectedContent.compiled_html}
                  sandbox=""
                  className="h-full w-full"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[12px] text-gray-500">
                  {loading ? <Spinner size={18} /> : 'No compiled output was stored for this revision.'}
                </div>
              )}
            </div>
          )}

          {view === 'compare' && (
            <DiffView
              before={htmlOf(selectedContent)}
              after={compareWith ? htmlOf(compareContent) : htmlSource || compiled?.html || ''}
              beforeLabel={`Revision ${selectedRevision?.revision_no ?? '—'}`}
              afterLabel={
                compareWith
                  ? `Revision ${ordered.find(entry => entry.public_code === compareWith)?.revision_no ?? '—'}`
                  : 'Current draft'
              }
              height={440}
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10.5px] uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="truncate text-gray-800">{value}</dd>
    </div>
  );
}

function ValidationBadge({ summary }: { summary: RevisionSummary['validation_summary'] }) {
  if (!summary) {
    return (
      <Pill tone="gray" icon={<Clock size={9} />}>
        Not validated
      </Pill>
    );
  }
  const blockers = Number(summary.blockers || 0);
  const errors = Number(summary.errors || 0);
  const warnings = Number(summary.warnings || 0);
  if (blockers || errors) {
    return (
      <Pill tone="red" icon={<XCircle size={9} />}>
        {blockers + errors} problem{blockers + errors === 1 ? '' : 's'}
      </Pill>
    );
  }
  if (warnings) {
    return <Pill tone="amber">{warnings} warning{warnings === 1 ? '' : 's'}</Pill>;
  }
  return (
    <Pill tone="green" icon={<CheckCircle2 size={9} />}>
      Passed
    </Pill>
  );
}
