/**
 * Review dashboard (spec 20).
 *
 * A grouped, navigable report rather than a single icon: each issue explains what is
 * wrong, what is expected, and takes the author straight to the element or line.
 */

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Circle,
  Info,
  ShieldAlert,
  Sparkles,
  XCircle,
} from 'lucide-react';
import * as composerApi from '../api/composerApi';
import {
  ISSUE_CATEGORIES,
  SEVERITY_LABELS,
  groupByCategory,
  sortIssues,
  type IssueCategory,
  type IssueSeverity,
  type ValidationIssue,
} from '../model/issues';
import { useComposer } from '../store/composerStore';
import { setPref } from '../store/preferences';
import { Dialog, DialogButton } from '../ui/Dialog';
import { InlineEmpty, Pill, Spinner } from '../ui/primitives';

const SEVERITY_ICON: Record<IssueSeverity, typeof AlertOctagon> = {
  blocker: AlertOctagon,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_TONE: Record<IssueSeverity, string> = {
  blocker: 'text-red-700',
  error: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-blue-600',
};

export function ReviewDashboard({
  open,
  onClose,
  onNavigate,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (issue: ValidationIssue) => void;
}) {
  const compiled = useComposer(store => store.compiled);
  const compiling = useComposer(store => store.compiling);
  const requestCompile = useComposer(store => store.requestCompile);
  const draftCode = useComposer(store => store.draftCode);
  const canOverride = useComposer(store => store.can('override_validation_warnings'));
  const doc = useComposer(store => store.doc);
  const updateNodeById = useComposer(store => store.updateNodeById);

  const [category, setCategory] = useState<IssueCategory | 'overview'>('overview');
  const [dismissed, setDismissed] = useState<string[]>([]);

  const report = compiled?.validation;
  const issues = useMemo(
    () => sortIssues((report?.issues || []).filter(issue => !dismissed.includes(issueId(issue)))),
    [dismissed, report]
  );
  const grouped = useMemo(() => groupByCategory(issues), [issues]);

  const summary = useMemo(() => {
    const counts = { blocker: 0, error: 0, warning: 0, info: 0 };
    issues.forEach(issue => {
      counts[issue.severity] += 1;
    });
    return counts;
  }, [issues]);

  const readiness = summary.blocker > 0 ? 'blocked' : summary.error > 0 ? 'problems' : summary.warning > 0 ? 'review' : 'ready';

  const dismiss = async (issue: ValidationIssue) => {
    if (!draftCode) return;
    const reason = window.prompt('Why is this issue acceptable? The reason is recorded in the audit history.');
    if (!reason) return;
    try {
      await composerApi.dismissIssue(draftCode, { code: issue.code, node_id: issue.nodeId ?? null, reason });
      setDismissed(current => [...current, issueId(issue)]);
      toast.success('Issue dismissed for this revision.');
    } catch (error) {
      toast.error(composerApi.describeError(error, 'That issue could not be dismissed.'));
    }
  };

  /** Corrections we can make safely without guessing the author's intent. */
  const autoFix = (issue: ValidationIssue): boolean => {
    if (!issue.nodeId) return false;
    if (issue.code === 'a11y.image_alt' || issue.code === 'image.missing_alt') {
      updateNodeById(issue.nodeId, { alt: '' }, 'Mark image as decorative');
      toast.success('Image marked as decorative. Add real alt text if it carries meaning.');
      return true;
    }
    if (issue.code === 'compat.image_dimensions' || issue.code === 'image.missing_dimensions') {
      const node = doc.sections
        .flatMap(section => section.rows)
        .flatMap(row => row.columns)
        .flatMap(column => column.blocks)
        .find(block => block.id === issue.nodeId);
      const image = node as { naturalWidth?: number | null; naturalHeight?: number | null } | undefined;
      if (image?.naturalWidth) {
        updateNodeById(issue.nodeId, { width: image.naturalWidth, height: image.naturalHeight }, 'Set image dimensions');
        toast.success('Dimensions set from the original image.');
        return true;
      }
    }
    return false;
  };

  const navigate = (issue: ValidationIssue) => {
    if (issue.line) setPref('mode', 'html');
    onNavigate(issue);
    onClose();
  };

  const tabs: { id: IssueCategory | 'overview'; label: string; count: number }[] = [
    { id: 'overview', label: 'Overview', count: issues.length },
    ...ISSUE_CATEGORIES.map(entry => ({ id: entry.id, label: entry.label, count: grouped[entry.id]?.length || 0 })),
  ];

  const visible = category === 'overview' ? issues : grouped[category] || [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title="Review this email"
      description="Checks run against the compiled output, which is exactly what recipients receive."
      footer={
        <>
          <DialogButton onClick={() => requestCompile(true)}>Re-run checks</DialogButton>
          <DialogButton variant="primary" onClick={onClose}>
            Done
          </DialogButton>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[212px_1fr]">
        <nav aria-label="Review categories" className="space-y-0.5">
          {tabs.map(entry => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setCategory(entry.id)}
              aria-current={category === entry.id}
              className={clsx(
                'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors',
                category === entry.id ? 'bg-brand-50 font-semibold text-brand-800' : 'text-gray-700 hover:bg-gray-50'
              )}
            >
              <span className="truncate">{entry.label}</span>
              {entry.count > 0 && (
                <span className="shrink-0 rounded-full bg-gray-200 px-1.5 text-[10px] font-semibold tabular-nums text-gray-700">
                  {entry.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="min-w-0 space-y-3">
          {compiling && !report ? (
            <div className="flex h-40 items-center justify-center text-gray-400">
              <Spinner size={20} />
            </div>
          ) : (
            <>
              {category === 'overview' && (
                <div className="space-y-3">
                  <div
                    className={clsx(
                      'flex items-start gap-2.5 rounded-xl px-3 py-2.5',
                      readiness === 'ready'
                        ? 'bg-emerald-50'
                        : readiness === 'review'
                          ? 'bg-amber-50'
                          : 'bg-red-50'
                    )}
                  >
                    {readiness === 'ready' ? (
                      <BadgeCheck size={18} className="mt-px shrink-0 text-emerald-600" />
                    ) : readiness === 'review' ? (
                      <AlertTriangle size={18} className="mt-px shrink-0 text-amber-600" />
                    ) : (
                      <ShieldAlert size={18} className="mt-px shrink-0 text-red-600" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-gray-900">
                        {readiness === 'ready'
                          ? 'This email is ready to send'
                          : readiness === 'review'
                            ? 'Ready, with things worth reviewing'
                            : readiness === 'problems'
                              ? 'Problems need fixing first'
                              : 'Sending is blocked'}
                      </p>
                      <p className="text-[12px] leading-snug text-gray-700">
                        {readiness === 'ready'
                          ? 'No blockers, errors or warnings were found in the compiled output.'
                          : 'Work through the categories on the left. Blockers must be resolved; warnings are advisory.'}
                      </p>
                      {report && (
                        <p className="mt-1 flex flex-wrap gap-1.5">
                          {report.blocks.save && <Pill tone="red">Blocks saving</Pill>}
                          {report.blocks.publish && <Pill tone="red">Blocks publishing</Pill>}
                          {report.blocks.test_send && <Pill tone="amber">Blocks test sends</Pill>}
                          {report.blocks.launch && <Pill tone="red">Blocks campaign launch</Pill>}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label="Blockers" value={summary.blocker} tone="red" />
                    <Stat label="Errors" value={summary.error} tone="red" />
                    <Stat label="Warnings" value={summary.warning} tone="amber" />
                    <Stat label="Information" value={summary.info} tone="blue" />
                  </div>

                  <div className="grid gap-1.5 sm:grid-cols-3">
                    {ISSUE_CATEGORIES.map(entry => {
                      const list = grouped[entry.id] || [];
                      const worst = list[0]?.severity;
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setCategory(entry.id)}
                          className="flex items-start gap-2 rounded-xl border border-gray-200 px-2.5 py-2 text-left transition-colors hover:border-brand-300"
                        >
                          {list.length === 0 ? (
                            <CheckCircle2 size={14} className="mt-px shrink-0 text-emerald-500" />
                          ) : (
                            <Circle size={14} className={clsx('mt-px shrink-0', SEVERITY_TONE[worst || 'info'])} />
                          )}
                          <span className="min-w-0">
                            <span className="block text-[12px] font-semibold text-gray-900">{entry.label}</span>
                            <span className="block text-[11px] leading-snug text-gray-500">
                              {list.length === 0 ? 'All checks passed' : `${list.length} to review`}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {category !== 'overview' && (
                <p className="text-[12px] leading-snug text-gray-600">
                  {ISSUE_CATEGORIES.find(entry => entry.id === category)?.description}
                </p>
              )}

              {visible.length ? (
                <ul className="max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
                  {visible.map((issue, index) => {
                    const Icon = SEVERITY_ICON[issue.severity];
                    const fixable = issue.code.includes('image_alt') || issue.code.includes('image_dimensions');
                    return (
                      <li key={`${issue.code}-${index}`} className="rounded-xl border border-gray-200 px-2.5 py-2">
                        <div className="flex items-start gap-2">
                          <Icon size={14} className={clsx('mt-px shrink-0', SEVERITY_TONE[issue.severity])} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] text-gray-900">{issue.message}</p>
                            {issue.expected && (
                              <p className="mt-0.5 text-[11.5px] leading-snug text-gray-600">{issue.expected}</p>
                            )}
                            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-gray-400">
                              <span className="font-mono">{issue.code}</span>
                              <Pill tone={issue.severity === 'warning' ? 'amber' : issue.severity === 'info' ? 'blue' : 'red'}>
                                {SEVERITY_LABELS[issue.severity]}
                              </Pill>
                              {issue.element && <span>{issue.element}</span>}
                              {issue.line && <span>Line {issue.line}</span>}
                              {issue.compatibility && <Pill tone="violet">{issue.compatibility}</Pill>}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {(issue.nodeId || issue.line) && (
                              <button
                                type="button"
                                onClick={() => navigate(issue)}
                                className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-200"
                              >
                                Go to
                                <ArrowRight size={10} />
                              </button>
                            )}
                            {fixable && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (!autoFix(issue)) toast.error('This one needs a manual fix.');
                                }}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-50"
                              >
                                <Sparkles size={10} />
                                Fix
                              </button>
                            )}
                            {issue.dismissible !== false && canOverride && (
                              <button
                                type="button"
                                onClick={() => void dismiss(issue)}
                                className="text-[11px] font-medium text-gray-400 hover:text-gray-700"
                              >
                                Dismiss
                              </button>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                category !== 'overview' && (
                  <InlineEmpty
                    icon={<CheckCircle2 size={20} className="text-emerald-500" />}
                    title="All checks passed"
                    description="Nothing to fix in this category."
                  />
                )
              )}
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'red' | 'amber' | 'blue' }) {
  return (
    <div
      className={clsx(
        'rounded-xl px-2.5 py-2',
        value === 0 ? 'bg-gray-50' : tone === 'red' ? 'bg-red-50' : tone === 'amber' ? 'bg-amber-50' : 'bg-blue-50'
      )}
    >
      <p className="text-[18px] font-semibold tabular-nums text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-600">{label}</p>
    </div>
  );
}

function issueId(issue: ValidationIssue): string {
  return [issue.code, issue.nodeId || '', issue.line ?? ''].join('|');
}
