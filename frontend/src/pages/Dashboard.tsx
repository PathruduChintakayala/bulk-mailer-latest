import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mail, AlertTriangle, TrendingUp, TrendingDown, Minus,
  Plus, FileText, ChevronRight, Activity, UserMinus, XCircle, ShieldAlert,
} from 'lucide-react';
import api from '../services/api';
import PageContainer from '../components/ui/PageContainer';
import PageHeader from '../components/ui/PageHeader';
import MetricCard from '../components/ui/MetricCard';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import {
  ChartCard, TrendChart, trendTable, StatusBars, FunnelSteps, RateComparison, Sparkline,
  type RateItem,
} from '../components/charts/Charts';
import { SERIES } from '../components/charts/chartTheme';
import type { CampaignListItem } from '../types';

type RangeKey = '7d' | '30d' | '90d';
const RANGE_DAYS: Record<RangeKey, number> = { '7d': 7, '30d': 30, '90d': 90 };
const RANGE_LABEL: Record<RangeKey, string> = { '7d': '7 days', '30d': '30 days', '90d': '90 days' };

const TREND_KEYS = ['sent', 'opens', 'clicks'];
const TREND_LABELS = { sent: 'Sent', opens: 'Opens', clicks: 'Clicks' };

function rangeDates(key: RangeKey) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - RANGE_DAYS[key]);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Every UTC day of the range, so days without email show as zero instead of vanishing. */
function dayBuckets(days: number): string[] {
  const today = new Date();
  const buckets: string[] = [];
  for (let i = days; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    buckets.push(d.toISOString().slice(0, 10));
  }
  return buckets;
}

interface Change { text: string; direction: 'up' | 'down' | 'flat'; good: boolean }

/** Change against the previous period: percent for counts, points for rates. */
function change(current = 0, previous = 0, kind: 'count' | 'rate', upIsGood = true): Change | null {
  if (!current && !previous) return null;
  const diff = current - previous;
  const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const good = direction === 'flat' ? true : (direction === 'up') === upIsGood;
  const sign = diff > 0 ? '+' : '';
  if (kind === 'rate') return { text: `${sign}${diff.toFixed(1)} pts`, direction, good };
  if (!previous) return { text: 'new', direction, good };
  return { text: `${sign}${((diff / previous) * 100).toFixed(0)}%`, direction, good };
}

function StatTile({
  label, value, note, delta, period, spark, sparkColor, meter,
}: {
  label: string; value: string; note?: string; delta: Change | null; period: string;
  spark?: number[]; sparkColor?: string;
  /** 0 to 100: shown as a filled bar instead of a sparkline. */
  meter?: number;
}) {
  const Icon = delta?.direction === 'up' ? TrendingUp : delta?.direction === 'down' ? TrendingDown : Minus;
  return (
    <div className="card-static p-5 flex flex-col min-w-0">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-3xl font-bold text-gray-900 tracking-tight mt-1">{value}</div>
      <div className="flex items-center gap-1.5 mt-1.5 text-xs min-h-[18px]">
        {delta ? (
          <>
            <span className={`inline-flex items-center gap-0.5 font-semibold ${delta.good ? 'text-emerald-700' : 'text-red-700'}`}>
              <Icon size={13} aria-hidden /> {delta.text}
            </span>
            <span className="text-gray-500">vs previous {period}</span>
          </>
        ) : (
          <span className="text-gray-500">{note || `No activity in the last ${period}`}</span>
        )}
      </div>
      {delta && note && <div className="text-xs text-gray-500 mt-0.5">{note}</div>}
      <div className="mt-auto pt-3">
        {spark && <Sparkline data={spark} color={sparkColor} label={`${label} per day`} />}
        {meter != null && (
          <div className="h-9 flex items-end">
            <div
              className="w-full h-2 rounded-full bg-blue-100 overflow-hidden"
              role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(meter)} aria-label={label}
            >
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(Math.max(meter, 0), 100)}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [range, setRange] = useState<RangeKey>('30d');
  const [overview, setOverview] = useState<any>(null);
  const [series, setSeries] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const { from, to } = rangeDates(range);
    setLoading(true);
    Promise.all([
      api.get('/analytics/overview', { params: { from, to } }),
      api.get('/analytics/timeseries', { params: { from, to, granularity: 'day' } }),
      api.get('/campaigns/'),
    ]).then(([o, t, c]) => {
      if (cancelled) return;
      setOverview(o.data);
      setSeries(t.data);
      setCampaigns(c.data);
      setError(null);
    }).catch((err: any) => {
      if (!cancelled) setError(err.response?.data?.detail || 'The dashboard could not be loaded.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [range]);

  const cur = overview?.current || {};
  const prev = overview?.previous || {};
  const active = overview?.active_campaigns || [];
  const period = RANGE_LABEL[range];

  const trend = useMemo(() => {
    const rows = new Map(dayBuckets(RANGE_DAYS[range]).map(b => [b, { bucket: b, sent: 0, opens: 0, clicks: 0 }]));
    const fill = (list: any[] | undefined, key: 'sent' | 'opens' | 'clicks') => {
      for (const row of list || []) {
        const entry = rows.get(row.bucket) || { bucket: row.bucket, sent: 0, opens: 0, clicks: 0 };
        entry[key] = row.count;
        rows.set(row.bucket, entry);
      }
    };
    fill(series?.sent, 'sent');
    fill(series?.opens, 'opens');
    fill(series?.clicks, 'clicks');
    return Array.from(rows.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  }, [series, range]);
  const hasTrend = trend.some(d => d.sent || d.opens || d.clicks);

  const statusCounts = useMemo(() => {
    const order = ['sending', 'scheduled', 'paused', 'completed', 'draft', 'failed'];
    return order.map(key => ({ key, value: campaigns.filter(c => c.status === key).length }));
  }, [campaigns]);

  const delivered = Math.max((cur.sent || 0) - (cur.bounced || 0), 0);
  const funnel = [
    { label: 'Sent', value: cur.sent || 0 },
    { label: 'Delivered', value: delivered },
    { label: 'Opened', value: cur.opened || 0 },
    { label: 'Clicked', value: cur.clicked || 0 },
  ];

  const comparison: RateItem[] = useMemo(() => campaigns
    .filter(c => c.sent_count > 0)
    .slice(0, 6)
    .map(c => ({
      code: c.public_code,
      name: c.name,
      sent: c.sent_count,
      openRate: (c.opened_count / c.sent_count) * 100,
      clickRate: (c.clicked_count / c.sent_count) * 100,
    })), [campaigns]);

  const recent = campaigns.slice(0, 5);
  const deliveryWatch = (cur.bounce_rate || 0) >= 5 || (cur.failed || 0) > 0;
  const clicksOfOpens = cur.opened ? ((cur.clicked || 0) / cur.opened) * 100 : 0;
  // A rate can only be compared with a period in which something was sent
  const comparable = (cur.sent || 0) > 0 && (prev.sent || 0) > 0;

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={`Delivery and engagement for campaigns created in the last ${period}`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex rounded-xl border border-gray-200 bg-white p-0.5" role="group" aria-label="Period">
              {(Object.keys(RANGE_DAYS) as RangeKey[]).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRange(k)}
                  aria-pressed={range === k}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                    range === k ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {RANGE_LABEL[k]}
                </button>
              ))}
            </div>
            <Link to="/templates" className="btn-secondary btn-sm"><FileText size={14} /> Templates</Link>
            <Link to="/campaigns/new" className="btn-primary btn-sm"><Plus size={14} /> New campaign</Link>
          </div>
        }
      />

      {error && (
        <div role="alert" className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {loading && !overview ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-40 rounded-2xl" />)}
          </div>
          <div className="skeleton h-80 rounded-2xl" />
        </div>
      ) : (
        // While a new period loads, the previous numbers stay in place, dimmed
        <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              label="Emails sent" value={(cur.sent || 0).toLocaleString()} period={period}
              delta={comparable ? change(cur.sent, prev.sent, 'count') : null}
              note={cur.sent
                ? `${(cur.campaigns || 0).toLocaleString()} campaign${cur.campaigns === 1 ? '' : 's'}`
                  + (comparable ? '' : ` · nothing sent in the ${period} before`)
                : undefined}
              spark={trend.map(d => d.sent)} sparkColor={SERIES.sent}
            />
            <StatTile
              label="Open rate" value={`${(cur.open_rate || 0).toFixed(1)}%`} period={period}
              delta={comparable ? change(cur.open_rate, prev.open_rate, 'rate') : null}
              note={cur.sent ? `${(cur.opened || 0).toLocaleString()} opened` : undefined}
              spark={trend.map(d => d.opens)} sparkColor={SERIES.opens}
            />
            <StatTile
              label="Click rate" value={`${(cur.click_rate || 0).toFixed(1)}%`} period={period}
              delta={comparable ? change(cur.click_rate, prev.click_rate, 'rate') : null}
              note={cur.opened ? `${clicksOfOpens.toFixed(0)}% of those who opened` : undefined}
              spark={trend.map(d => d.clicks)} sparkColor={SERIES.clicks}
            />
            <StatTile
              label="Delivery rate" value={`${(cur.delivery_rate || 0).toFixed(1)}%`} period={period}
              delta={comparable ? change(cur.delivery_rate, prev.delivery_rate, 'rate') : null}
              note={cur.sent ? `${delivered.toLocaleString()} delivered` : undefined}
              meter={cur.sent ? cur.delivery_rate || 0 : undefined}
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard variant="mini" icon={ShieldAlert} label="Bounced" tone="text-rose-700" toneBg="bg-rose-50"
              value={`${(cur.bounced || 0).toLocaleString()} (${(cur.bounce_rate || 0).toFixed(1)}%)`} />
            <MetricCard variant="mini" icon={XCircle} label="Failed to send" tone="text-red-700" toneBg="bg-red-50"
              value={(cur.failed || 0).toLocaleString()} />
            <MetricCard variant="mini" icon={UserMinus} label="Unsubscribed" tone="text-gray-700" toneBg="bg-gray-100"
              value={(cur.unsubscribed || 0).toLocaleString()} />
            <MetricCard variant="mini" icon={AlertTriangle} label="Spam complaints" tone="text-amber-700" toneBg="bg-amber-50"
              value={(cur.complaints || 0).toLocaleString()} />
          </div>

          {deliveryWatch && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-100 text-amber-800 text-sm">
              <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Delivery needs attention</p>
                <p className="text-amber-700 mt-0.5">
                  {(cur.bounced || 0).toLocaleString()} bounced and {(cur.failed || 0).toLocaleString()} failed in this
                  period. Open a campaign and use the Failed or Bounced filter to see the reason for each address.
                </p>
              </div>
            </div>
          )}

          {active.length > 0 && (
            <div className="card-static p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Activity size={16} className="text-brand-600" /> In progress
              </h3>
              <div className="space-y-1">
                {active.map((c: any) => {
                  const done = (c.sent_count || 0) + (c.failed_count || 0);
                  const pct = c.total_recipients ? Math.min((done / c.total_recipients) * 100, 100) : 0;
                  return (
                    <Link key={c.public_code} to={`/campaigns/${c.public_code}`}
                      className="block p-3 rounded-xl hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-gray-900 truncate">{c.name}</span>
                          <StatusBadge status={c.status} size="sm" />
                        </div>
                        <span className="text-xs text-gray-600 flex-shrink-0 tabular-nums">
                          {done.toLocaleString()} of {(c.total_recipients || 0).toLocaleString()}
                          <span className="text-gray-500"> · {Math.max((c.total_recipients || 0) - done, 0).toLocaleString()} pending</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden mt-2">
                        <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <ChartCard
            title="Emails sent, opens and clicks"
            subtitle={`Per day, last ${period}`}
            table={hasTrend ? trendTable(trend.filter(d => d.sent || d.opens || d.clicks), TREND_KEYS, TREND_LABELS) : undefined}
          >
            {hasTrend
              ? <TrendChart data={trend} keys={TREND_KEYS} labels={TREND_LABELS} height={300} />
              : <div className="h-[300px] flex items-center justify-center text-sm text-gray-500">No email was sent in this period</div>}
          </ChartCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard
              title="From sent to clicked"
              subtitle="Each step as a share of emails sent"
              table={{ columns: ['Step', 'Emails'], rows: funnel.map(s => [s.label, s.value]) }}
            >
              <FunnelSteps steps={funnel} />
              {!overview?.current?.opened && (cur.sent || 0) > 0 && (
                <p className="text-xs text-gray-500 mt-3">
                  Opens and clicks are counted only while tracking is on (Settings → Email Provider).
                </p>
              )}
            </ChartCard>

            <ChartCard
              title="Campaigns by status"
              subtitle={`${campaigns.length.toLocaleString()} in total`}
              table={{
                columns: ['Status', 'Campaigns'],
                rows: statusCounts.filter(s => s.value > 0).map(s => [s.key, s.value]),
              }}
            >
              <StatusBars data={statusCounts} />
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard
              title="Open and click rate by campaign"
              subtitle="Latest campaigns that were sent. Select a bar to open the campaign"
              table={{
                columns: ['Campaign', 'Sent', 'Open rate %', 'Click rate %'],
                rows: comparison.map(c => [c.name, c.sent, Number(c.openRate.toFixed(1)), Number(c.clickRate.toFixed(1))]),
              }}
            >
              <RateComparison items={comparison} onSelect={code => navigate(`/campaigns/${code}`)} />
            </ChartCard>

            <section className="card-static p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">Recent campaigns</h3>
                <Link to="/campaigns" className="text-xs text-brand-600 font-medium hover:underline">View all</Link>
              </div>
              {recent.length === 0 ? (
                <EmptyState icon={Mail} title="No campaigns yet" description="Create your first campaign to see results here."
                  action={<Link to="/campaigns/new" className="btn-primary btn-sm"><Plus size={14} /> New campaign</Link>} />
              ) : (
                <div className="space-y-1">
                  {recent.map(c => (
                    <Link key={c.public_code} to={`/campaigns/${c.public_code}`}
                      className="group flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-gray-900 truncate group-hover:text-brand-600">{c.name}</span>
                          <StatusBadge status={c.status} size="sm" />
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          <span className="font-mono">{c.public_code}</span>
                          {c.sent_count > 0 && (
                            <> · {c.sent_count.toLocaleString()} sent · {((c.opened_count / c.sent_count) * 100).toFixed(0)}% opened
                              {c.bounced_count > 0 && <> · {c.bounced_count.toLocaleString()} bounced</>}
                            </>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-gray-400" />
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
