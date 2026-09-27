import {
  AlertCircle, AlertTriangle, Info, CheckCircle, ChevronRight,
} from 'lucide-react';

export type EditorIssueSeverity = 'error' | 'warning' | 'info';

export interface EditorIssue {
  id: string;
  severity: EditorIssueSeverity;
  code: string;
  title: string;
  description?: string;
  blockId?: string;
  fieldPath?: 'subject' | 'preheader' | 'body' | 'attachment';
  mergeFieldKey?: string;
  actionLabel?: string;
}

interface Props {
  issues: EditorIssue[];
  onFocusIssue?: (issue: EditorIssue) => void;
}

export default function ReviewTab({ issues, onFocusIssue }: Props) {
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const infos = issues.filter(i => i.severity === 'info');

  if (issues.length === 0) {
    return (
      <div className="flex items-center gap-2 px-4 py-3">
        <CheckCircle size={16} className="text-emerald-500" />
        <span className="text-sm text-emerald-700 font-medium">All checks passed</span>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 max-h-[280px] overflow-y-auto space-y-2">
      {errors.length > 0 && (
        <IssueGroup severity="error" issues={errors} onFocus={onFocusIssue} />
      )}
      {warnings.length > 0 && (
        <IssueGroup severity="warning" issues={warnings} onFocus={onFocusIssue} />
      )}
      {infos.length > 0 && (
        <IssueGroup severity="info" issues={infos} onFocus={onFocusIssue} />
      )}
    </div>
  );
}

function IssueGroup({ severity, issues, onFocus }: { severity: EditorIssueSeverity; issues: EditorIssue[]; onFocus?: (i: EditorIssue) => void }) {
  const config = {
    error: { icon: AlertCircle, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', iconColor: 'text-red-500' },
    warning: { icon: AlertTriangle, bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', iconColor: 'text-amber-500' },
    info: { icon: Info, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', iconColor: 'text-blue-500' },
  }[severity];

  const Icon = config.icon;

  return (
    <div className={`${config.bg} border ${config.border} rounded-lg overflow-hidden`}>
      {issues.map(issue => (
        <button
          key={issue.id}
          onClick={() => onFocus?.(issue)}
          className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/50 transition-colors border-b last:border-b-0 ${config.border}`}
          aria-label={`${issue.title}. Click to navigate.`}
        >
          <Icon size={14} className={`${config.iconColor} flex-shrink-0`} />
          <div className="flex-1 min-w-0">
            <span className={`text-xs font-medium ${config.text}`}>{issue.title}</span>
            {issue.description && (
              <span className="text-[10px] text-gray-500 ml-2">{issue.description}</span>
            )}
          </div>
          <ChevronRight size={12} className="text-gray-400 flex-shrink-0" />
        </button>
      ))}
    </div>
  );
}

/** Utility to compute badge for the Review tab */
export function getReviewBadge(issues: EditorIssue[]): { label: string; color: string } | null {
  const errors = issues.filter(i => i.severity === 'error').length;
  const warnings = issues.filter(i => i.severity === 'warning').length;
  if (errors > 0) return { label: `${errors}`, color: 'bg-red-500 text-white' };
  if (warnings > 0) return { label: `${warnings}`, color: 'bg-amber-500 text-white' };
  if (issues.length === 0) return { label: '✓', color: 'bg-emerald-500 text-white' };
  return null;
}
