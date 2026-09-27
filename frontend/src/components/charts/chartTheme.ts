/**
 * Colours and shared pieces for every chart.
 *
 * The three series colours are the brand blue, green and orange, with the
 * green and orange shifted slightly so that all three stay apart for
 * colour-blind viewers and clear 3:1 contrast on white.
 */
export const SERIES = {
  sent: '#034ea2',
  opens: '#00a65a',
  clicks: '#e8650c',
} as const;

/** Colour follows the entity, so a series keeps its colour whatever else is shown. */
export const SERIES_ORDER = [SERIES.sent, SERIES.opens, SERIES.clicks];

/** One hue, light to dark, for steps that have an order (a funnel). */
export const ORDINAL_BLUE = ['#034ea2', '#1463b8', '#3f86d0', '#7bafe3', '#a9cbee'];

/** Reserved for states; never used as "just another series". */
export const STATUS: Record<string, { color: string; label: string }> = {
  pending: { color: '#94a3b8', label: 'Pending' },
  sending: { color: '#d97706', label: 'Sending' },
  sent: { color: '#15803d', label: 'Sent' },
  failed: { color: '#dc2626', label: 'Failed' },
  bounced: { color: '#9f1239', label: 'Bounced' },
  unsubscribed: { color: '#7c3aed', label: 'Unsubscribed' },
  // campaign states
  draft: { color: '#94a3b8', label: 'Draft' },
  scheduled: { color: '#2563eb', label: 'Scheduled' },
  paused: { color: '#ea580c', label: 'Paused' },
  completed: { color: '#15803d', label: 'Completed' },
};

export const INK = { primary: '#0f172a', secondary: '#475569', muted: '#64748b' };
export const GRID_LINE = '#eef1f4';
export const SURFACE = '#ffffff';

export const FONT = 'Inter, system-ui, -apple-system, sans-serif';

export const tooltipBase = {
  backgroundColor: SURFACE,
  borderColor: '#e2e8f0',
  borderWidth: 1,
  padding: [8, 12],
  textStyle: { color: INK.primary, fontSize: 12, fontFamily: FONT },
  extraCssText: 'border-radius:12px;box-shadow:0 8px 24px rgba(15,23,42,0.10);',
};

export const axisLabel = { color: INK.muted, fontSize: 11, fontFamily: FONT };

export const legendBase = {
  icon: 'roundRect',
  itemWidth: 10,
  itemHeight: 10,
  itemGap: 16,
  textStyle: { color: INK.secondary, fontSize: 12, fontFamily: FONT },
};

export function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(value) >= 10_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return value.toLocaleString();
}

/** The server buckets by UTC day ("2026-09-27") or hour ("2026-09-27 06:00"). */
export function bucketToDate(bucket: string): Date {
  const iso = bucket.length <= 10 ? `${bucket}T00:00:00Z` : `${bucket.replace(' ', 'T')}:00Z`;
  return new Date(iso);
}

export function formatBucket(bucket: string, withYear = false): string {
  const date = bucketToDate(bucket);
  if (Number.isNaN(date.getTime())) return bucket;
  if (bucket.length <= 10) {
    // A day bucket is a calendar day, not an instant: show it as written
    return date.toLocaleDateString(undefined, {
      day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined, timeZone: 'UTC',
    });
  }
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
