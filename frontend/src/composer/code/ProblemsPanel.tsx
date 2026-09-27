/**
 * Problems, Warnings and Output panel for HTML mode (spec 16).
 *
 * Every row is clickable: HTML issues jump to the line and column in the source,
 * document issues select the block on the visual canvas.
 */

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  ListFilter,
  Terminal,
  XCircle,
} from 'lucide-react';
import { SEVERITY_LABELS, type IssueSeverity, type ValidationIssue } from '../model/issues';
import { PANEL_MAX, PANEL_MIN, setPref, usePref } from '../store/preferences';
import { InlineEmpty, Pill } from '../ui/primitives';
import { ResizeHandle } from '../shell/SplitPane';

export interface OutputLine {
  at: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

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

export function ProblemsPanel({
  issues,
  output,
  onNavigate,
  compiling,
}: {
  issues: ValidationIssue[];
  output: OutputLine[];
  onNavigate: (issue: ValidationIssue) => void;
  compiling: boolean;
}) {
  const open = usePref('problemsPanelOpen');
  const height = usePref('problemsPanelHeight');
  const [tab, setTab] = useState<'problems' | 'warnings' | 'output'>('problems');
  const [severityFilter, setSeverityFilter] = useState<IssueSeverity | 'all'>('all');

  const problems = useMemo(() => issues.filter(issue => issue.severity === 'blocker' || issue.severity === 'error'), [issues]);
  const warnings = useMemo(() => issues.filter(issue => issue.severity === 'warning' || issue.severity === 'info'), [issues]);
  const list = tab === 'problems' ? problems : warnings;
  const filtered = severityFilter === 'all' ? list : list.filter(issue => issue.severity === severityFilter);

  const tabs: { id: 'problems' | 'warnings' | 'output'; label: string; count?: number }[] = [
    { id: 'problems', label: 'Problems', count: problems.length },
    { id: 'warnings', label: 'Warnings', count: warnings.length },
    { id: 'output', label: 'Output' },
  ];

  return (
    <section
      className="flex shrink-0 flex-col border-t border-gray-200 bg-white"
      style={{ height: open ? height : undefined }}
      aria-label="Problems and output"
    >
      {open && (
        <ResizeHandle
          orientation="vertical"
          edge="start"
          onDelta={delta => setPref('problemsPanelHeight', clamp(height + delta))}
          onReset={() => setPref('problemsPanelHeight', 200)}
          label="Resize the problems panel"
        />
      )}

      <div className="flex items-center gap-1 border-b border-gray-100 px-2 py-1">
        {tabs.map(entry => (
          <button
            key={entry.id}
            type="button"
            onClick={() => {
              setTab(entry.id);
              if (!open) setPref('problemsPanelOpen', true);
            }}
            aria-current={tab === entry.id}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11.5px] font-medium transition-colors',
              tab === entry.id && open ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:bg-gray-50'
            )}
          >
            {entry.id === 'output' && <Terminal size={11} />}
            {entry.label}
            {typeof entry.count === 'number' && entry.count > 0 && (
              <span
                className={clsx(
                  'rounded-full px-1.5 text-[10px] font-semibold tabular-nums',
                  entry.id === 'problems' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'
                )}
              >
                {entry.count}
              </span>
            )}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1">
          {compiling && <span className="text-[11px] text-gray-400">Checking…</span>}
          {tab !== 'output' && open && (
            <label className="flex items-center gap-1 text-[11px] text-gray-500">
              <ListFilter size={11} />
              <span className="sr-only">Filter by severity</span>
              <select
                value={severityFilter}
                onChange={event => setSeverityFilter(event.target.value as IssueSeverity | 'all')}
                className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[11px] focus:border-brand-400 focus:outline-none"
              >
                <option value="all">All</option>
                <option value="blocker">Blockers</option>
                <option value="error">Errors</option>
                <option value="warning">Warnings</option>
                <option value="info">Information</option>
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => setPref('problemsPanelOpen', !open)}
            aria-label={open ? 'Collapse the problems panel' : 'Expand the problems panel'}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'output' ? (
            output.length ? (
              <ul className="p-2 font-mono text-[11.5px] leading-relaxed">
                {output.map((line, index) => (
                  <li
                    key={`${line.at}-${index}`}
                    className={clsx(
                      line.level === 'error' ? 'text-red-700' : line.level === 'warn' ? 'text-amber-700' : 'text-gray-600'
                    )}
                  >
                    <span className="text-gray-400">{new Date(line.at).toLocaleTimeString()} </span>
                    {line.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-3 text-[12px] text-gray-500">Compile output will appear here.</p>
            )
          ) : filtered.length ? (
            <table className="w-full text-left text-[12px]">
              <tbody>
                {filtered.map((issue, index) => {
                  const Icon = SEVERITY_ICON[issue.severity];
                  return (
                    <tr
                      key={`${issue.code}-${index}`}
                      onClick={() => onNavigate(issue)}
                      tabIndex={0}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onNavigate(issue);
                        }
                      }}
                      className="cursor-pointer border-b border-gray-50 hover:bg-gray-50 focus:bg-brand-50 focus:outline-none"
                    >
                      <td className="w-6 py-1.5 pl-2.5 align-top">
                        <Icon size={13} className={SEVERITY_TONE[issue.severity]} />
                      </td>
                      <td className="py-1.5 pr-2 align-top">
                        <p className="text-gray-800">{issue.message}</p>
                        {issue.expected && <p className="text-[11px] text-gray-500">{issue.expected}</p>}
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-gray-400">
                          <span className="font-mono">{issue.code}</span>
                          {issue.element && <span>· {issue.element}</span>}
                          {issue.compatibility && (
                            <Pill tone="violet" title="Affected clients">
                              {issue.compatibility}
                            </Pill>
                          )}
                          {issue.dismissible === false && <Pill tone="red">Cannot be dismissed</Pill>}
                        </p>
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-right align-top text-[11px] tabular-nums text-gray-500">
                        {issue.line ? `Ln ${issue.line}, Col ${issue.column ?? 1}` : SEVERITY_LABELS[issue.severity]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="p-4">
              <InlineEmpty
                icon={<CheckCircle2 size={18} className="text-emerald-500" />}
                title={tab === 'problems' ? 'No problems found' : 'No warnings'}
                description={
                  tab === 'problems'
                    ? 'Nothing blocks this email from being saved or sent.'
                    : 'Nothing to review right now.'
                }
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function clamp(value: number): number {
  return Math.min(PANEL_MAX.problems, Math.max(PANEL_MIN.problems, value));
}
