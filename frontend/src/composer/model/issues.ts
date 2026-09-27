/** Validation issue shape shared by the Problems panel and the Review dashboard. */

export type IssueSeverity = 'blocker' | 'error' | 'warning' | 'info';

export type IssueCategory =
  | 'content'
  | 'personalization'
  | 'accessibility'
  | 'compatibility'
  | 'delivery'
  | 'compliance'
  | 'html'
  | 'links'
  | 'security';

export const ISSUE_CATEGORIES: { id: IssueCategory; label: string; description: string }[] = [
  { id: 'content', label: 'Content', description: 'Empty or placeholder content and missing message fields.' },
  { id: 'personalization', label: 'Personalization', description: 'Merge field syntax, mapping and defaults.' },
  { id: 'accessibility', label: 'Accessibility', description: 'Alternative text, heading order, contrast and link clarity.' },
  { id: 'compatibility', label: 'Compatibility', description: 'Markup and CSS support across email clients.' },
  { id: 'delivery', label: 'Delivery', description: 'Message size, external resources and broken references.' },
  { id: 'compliance', label: 'Compliance', description: 'Unsubscribe, organization address and legal content.' },
  { id: 'html', label: 'HTML', description: 'Document structure and markup validity.' },
  { id: 'links', label: 'Links', description: 'URL validity, protocols and tracking.' },
  { id: 'security', label: 'Security', description: 'Scripts, embedded content and unsafe URLs.' },
];

export const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  blocker: 0,
  error: 1,
  warning: 2,
  info: 3,
};

export const SEVERITY_LABELS: Record<IssueSeverity, string> = {
  blocker: 'Blocker',
  error: 'Error',
  warning: 'Warning',
  info: 'Information',
};

export interface ValidationIssue {
  /** Stable rule identifier, e.g. `image.missing_alt`. */
  code: string;
  severity: IssueSeverity;
  category: IssueCategory;
  message: string;
  /** What the author is expected to do about it. */
  expected?: string | null;
  /** Document node id for visual navigation. */
  nodeId?: string | null;
  /** Human-readable element description, e.g. "Image in Section 2". */
  element?: string | null;
  /** 1-based source position for HTML navigation. */
  line?: number | null;
  column?: number | null;
  /** Which compatibility bucket the issue belongs to, when relevant. */
  compatibility?: string | null;
  /** Whether policy allows an author to dismiss this issue. */
  dismissible?: boolean;
}

export interface ValidationSummary {
  blockers: number;
  errors: number;
  warnings: number;
  info: number;
  /** True when nothing blocks or errors. */
  passed: boolean;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  summary: ValidationSummary;
  /** Which gates the current issue set blocks, resolved from admin policy. */
  blocks: {
    save: boolean;
    publish: boolean;
    test_send: boolean;
    launch: boolean;
  };
}

export function summarize(issues: ValidationIssue[]): ValidationSummary {
  const summary: ValidationSummary = { blockers: 0, errors: 0, warnings: 0, info: 0, passed: true };
  for (const issue of issues) {
    if (issue.severity === 'blocker') summary.blockers += 1;
    else if (issue.severity === 'error') summary.errors += 1;
    else if (issue.severity === 'warning') summary.warnings += 1;
    else summary.info += 1;
  }
  summary.passed = summary.blockers === 0 && summary.errors === 0;
  return summary;
}

export function sortIssues(issues: ValidationIssue[]): ValidationIssue[] {
  return [...issues].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    const byLine = (a.line ?? 0) - (b.line ?? 0);
    if (byLine !== 0) return byLine;
    return a.code.localeCompare(b.code);
  });
}

export function groupByCategory(issues: ValidationIssue[]): Record<IssueCategory, ValidationIssue[]> {
  const groups = {} as Record<IssueCategory, ValidationIssue[]>;
  for (const { id } of ISSUE_CATEGORIES) groups[id] = [];
  for (const issue of issues) {
    if (!groups[issue.category]) groups[issue.category] = [];
    groups[issue.category].push(issue);
  }
  return groups;
}

export function issueKey(issue: ValidationIssue): string {
  return [issue.code, issue.nodeId || '', issue.line ?? '', issue.column ?? ''].join('|');
}
