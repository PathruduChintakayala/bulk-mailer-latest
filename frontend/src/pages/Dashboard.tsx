import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Mail, Send, MousePointerClick, AlertTriangle, TrendingUp, TrendingDown,
  Plus, FileText, ChevronRight, Activity, Percent,
} from 'lucide-react';
import api from '../services/api';
import PageContainer from '../components/ui/PageContainer';
import PageHeader from '../components/ui/PageHeader';
import MetricCard from '../components/ui/MetricCard';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import { AreaTrend, BarSimple } from '../components/charts/SimpleCharts';
import type { CampaignListItem } from '../types';

type RangeKey = '7d' | '30d' | '90d';

function rangeDates(key: RangeKey) {
  const end = new Date();
  const start = new Date();
  const days = key === '7d' ? 7 : key === '90d' ? 90 : 30;
  start.setDate(end.getDate() - days);
  return { from: start.toISOString(), to: end.toISOString() };
}

function Delta({ value }: { value?: number }) {
  if (value == null || Number.isNaN(value)) return null;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${up ? 'text-emerald-600' : 'text-red-600'}`}>
      <Icon size={12} /> {up ? '+' : ''}{value}%
    </span>
  );
}

export default function Dashboard() {
  const [range, setRange] = useState<RangeKey>('30d');
  const [overview, setOverview] = useState<any>(null);
  const [series, setSeries] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<CampaignListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { from, to } = rangeDates(range);
    setLoading(true);
    Promise.all([
      api.get('/analytics/overview', { params: { from, to } }),
      api.get('/analytics/timeseries', { params: { from, to, granularity: 'day' } }),
      api.get('/campaigns/'),
    ]).then(([o, t, c]) => {
      setOverview(o.data);
      setSeries(t.data);
      setCampaigns(c.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [range]);

  const cur = overview?.current || {};
  const deltas = overview?.deltas || {};
  const active = overview?.active_campaigns || [];

  const chartData = (() => {
    const map = new Map<string, { bucket: string; sent: number; opens: number; clicks: number }>();
    for (const row of series?.sent || []) map.set(row.bucket, { bucket: row.bucket, sent: row.count, opens: 0, clicks: 0 });
    for (const row of series?.opens || []) {
      const e = map.get(row.bucket) || { bucket: row.bucket, sent: 0, opens: 0, clicks: 0 };
      e.opens = row.count;
      map.set(row.bucket, e);
    }
    for (const row of series?.clicks || []) {
      const e = map.get(row.bucket) || { bucket: row.bucket, sent: 0, opens: 0, clicks: 0 };
      e.clicks = row.count;
      map.set(row.bucket, e);
    }
    return Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  })();

  const statusBars = [
    { name: 'Draft', value: campaigns.filter(c => c.status === 'draft').length },
    { name: 'Sending', value: campaigns.filter(c => c.status === 'sending' || c.status === 'scheduled').length },
    { name: 'Done', value: campaigns.filter(c => c.status === 'completed').length },
    { name: 'Paused', value: campaigns.filter(c => c.status === 'paused').length },
    { name: 'Failed', value: campaigns.filter(c => c.status === 'failed').length },
  ].filter(s => s.value > 0);

  const leaderboard = [...campaigns]
    .filter(c => c.sent_count > 0)
    .map(c => ({
      ...c,
      openRate: c.sent_count ? (c.opened_count / c.sent_count) * 100 : 0,
      ctr: c.opened_count ? (c.clicked_count / c.opened_count) * 100 : 0,
      delivery: c.sent_count ? ((c.sent_count - c.bounced_count - c.failed_count) / c.sent_count) * 100 : 0,
    }))
    .sort((a, b) => (b.ctr + b.delivery) - (a.ctr + a.delivery))
    .slice(0, 5);

  const recent = [...campaigns].slice(0, 5);
  const bounceSpike = (cur.bounce_rate || 0) >= 5 || (cur.failed || 0) > 0;

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Delivery health, engagement, and campaign performance"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex rounded-xl border border-gray-200 bg-white p-0.5">
              {(['7d', '30d', '90d'] as RangeKey[]).map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRange(k)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${
                    range === k ? 'bg-brand-50 text-brand-700' : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <Link to="/templates" className="btn-secondary btn-sm"><FileText size={14} /> Templates</Link>
            <Link to="/campaigns" className="btn-secondary btn-sm"><Mail size={14} /> All campaigns</Link>
            <Link to="/campaigns/new" className="btn-primary btn-sm"><Plus size={14} /> New campaign</Link>
          </div>
        }
      />

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-28 rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <MetricCard icon={Send} label="Emails sent" value={cur.sent?.toLocaleString() || '0'} />
              <div className="px-1"><Delta value={deltas.sent} /></div>
            </div>
            <div className="space-y-1">
              <MetricCard icon={Mail} label="Open rate" value={`${cur.open_rate ?? 0}%`} />
              <div className="px-1"><Delta value={deltas.open_rate} /></div>
            </div>
            <div className="space-y-1">
              <MetricCard icon={MousePointerClick} label="CTR" value={`${cur.ctr ?? 0}%`} />
              <div className="px-1"><Delta value={deltas.ctr} /></div>
            </div>
            <div className="space-y-1">
              <MetricCard icon={Percent} label="Delivery" value={`${cur.delivery_rate ?? 0}%`} />
              <div className="px-1"><Delta value={deltas.delivery_rate} /></div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard variant="mini" icon={Activity} label="Clicks" value={cur.clicked?.toLocaleString() || '0'} />
            <MetricCard variant="mini" icon={AlertTriangle} label="Bounces" value={`${cur.bounce_rate ?? 0}%`} />
            <MetricCard variant="mini" icon={AlertTriangle} label="Failures" value={cur.failed?.toLocaleString() || '0'} />
            <MetricCard variant="mini" icon={Mail} label="Complaints" value={cur.complaints?.toLocaleString() || '0'} />
          </div>

          {bounceSpike && (
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-100 text-amber-800 text-sm">
              <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Delivery watch</p>
                <p className="text-amber-700 mt-0.5">
                  Bounce or failure volume is elevated in this period. Check campaign drill-downs for error details.
                </p>
              </div>
            </div>
          )}

          {active.length > 0 && (
            <div className="card-static p-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Activity size={16} className="text-brand-600" /> Sending now
              </h3>
              <div className="space-y-2">
                {active.map((c: any) => (
                  <Link key={c.public_code} to={`/campaigns/${c.public_code}`}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">{c.name}</span>
                        <StatusBadge status={c.status} size="sm" />
                      </div>
                      <span className="font-mono text-[11px] text-gray-500">{c.public_code}</span>
                    </div>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {c.sent_count}/{c.total_recipients}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 card-static p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Volume & engagement</h3>
              <AreaTrend data={chartData} keys={['sent', 'opens', 'clicks']}
                labels={{ sent: 'Sent', opens: 'Opens', clicks: 'Clicks' }} />
            </div>
            <div className="card-static p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Campaign status</h3>
              <BarSimple data={statusBars} />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card-static p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">Recent campaigns</h3>
                <Link to="/campaigns" className="text-xs text-brand-600 font-medium hover:underline">View all</Link>
              </div>
              {recent.length === 0 ? (
                <EmptyState icon={Mail} title="No campaigns yet" description="Create your first campaign to see insights here."
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
                          <span className="font-mono text-[11px] text-gray-500">{c.public_code}</span>
                        </div>
                        {c.sent_count > 0 && (
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            {c.sent_count.toLocaleString()} sent · {((c.opened_count / c.sent_count) * 100).toFixed(0)}% opens
                          </div>
                        )}
                      </div>
                      <ChevronRight size={14} className="text-gray-400" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="card-static p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Top by CTR + delivery</h3>
              {leaderboard.length === 0 ? (
                <p className="text-sm text-gray-500 py-8 text-center">Send a campaign to unlock the leaderboard.</p>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((c, i) => (
                    <Link key={c.public_code} to={`/campaigns/${c.public_code}`}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                      <span className="w-6 h-6 rounded-lg bg-brand-50 text-brand-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{c.name}</div>
                        <span className="font-mono text-[11px] text-gray-500">{c.public_code}</span>
                      </div>
                      <div className="text-right text-[11px] text-gray-500">
                        <div><strong className="text-blue-600">{c.ctr.toFixed(0)}%</strong> CTR</div>
                        <div><strong className="text-emerald-600">{c.delivery.toFixed(0)}%</strong> del.</div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </PageContainer>
  );
}
