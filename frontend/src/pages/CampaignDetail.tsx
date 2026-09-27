import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../services/api';
import { useCampaignQueue } from '../hooks/useCampaignQueue';
import type { Campaign } from '../types';
import {
  Play, Pause, Trash2, ArrowLeft, Send, Eye, MousePointerClick, Pencil,
  AlertTriangle, UserMinus, Clock, CheckCircle2, RefreshCw,
  Mail, Calendar, Hourglass, Loader2, XCircle, RotateCcw
} from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../components/ConfirmDialog';
import PageContainer from '../components/ui/PageContainer';
import StatusBadge from '../components/ui/StatusBadge';
import IconButton from '../components/ui/IconButton';
import SegmentedControl from '../components/ui/SegmentedControl';
import RecipientTable from '../components/RecipientTable';
import { ChartCard, TrendChart, trendTable, StatusDonut, FunnelSteps } from '../components/charts/Charts';
import { SERIES } from '../components/charts/chartTheme';

const ACTIVITY_KEYS = ['opens', 'clicks'];
const ACTIVITY_LABELS = { opens: 'Opens', clicks: 'Clicks' };

type TabKey = 'overview' | 'activity' | 'links' | 'recipients';

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');
  const [analytics, setAnalytics] = useState<any>(null);
  const [eventSeries, setEventSeries] = useState<any>(null);
  const [links, setLinks] = useState<{ url: string; clicks: number; ctr: number }[]>([]);
  const [recipientStatus, setRecipientStatus] = useState<string>('');

  const loadCampaign = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const res = await api.get(`/campaigns/${id}`);
      setCampaign(res.data);
    } catch (err: any) {
      setLoadError(err.response?.data?.detail || 'We could not load this campaign.');
    }
  }, [id]);

  useEffect(() => { loadCampaign(); }, [loadCampaign]);

  const loadAnalytics = useCallback(() => {
    if (!id) return;
    api.get(`/analytics/campaigns/${id}`).then(r => setAnalytics(r.data)).catch(() => {});
    api.get(`/analytics/campaigns/${id}/events/timeseries`, { params: { granularity: 'hour' } })
      .then(r => setEventSeries(r.data)).catch(() => {});
    api.get(`/analytics/campaigns/${id}/links`).then(r => setLinks(r.data.links || [])).catch(() => {});
  }, [id]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const { queue, refresh: refreshQueue } = useCampaignQueue(id);

  // The queue is polled; pull the campaign and its analytics again whenever it moves
  const queueSignature = queue ? `${queue.status}:${queue.processed}:${queue.sending}` : '';
  const lastSignature = useRef('');
  useEffect(() => {
    if (!queueSignature) return;
    const first = lastSignature.current === '';
    lastSignature.current = queueSignature;
    if (first) return;
    loadCampaign();
    loadAnalytics();
  }, [queueSignature, loadCampaign, loadAnalytics]);

  const status = queue?.status ?? campaign?.status;
  const total = queue?.total ?? campaign?.total_recipients ?? 0;
  const processed = queue?.processed ?? ((campaign?.sent_count ?? 0) + (campaign?.failed_count ?? 0));
  const stats = campaign ? {
    total_recipients: total,
    sent_count: campaign.sent_count,
    failed_count: queue?.failed ?? campaign.failed_count,
    opened_count: campaign.opened_count,
    clicked_count: campaign.clicked_count,
    bounced_count: campaign.bounced_count,
    unsubscribed_count: campaign.unsubscribed_count,
    progress_pct: total > 0 ? (processed / total * 100) : 0,
  } : null;
  const lastError = queue?.last_error ?? campaign?.last_error ?? null;

  const runAction = async (path: string, success: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.post(`/campaigns/${id}/${path}`);
      toast.success(res.data?.message || success);
      await Promise.all([refreshQueue(), loadCampaign()]);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handlePause = () => runAction('pause', 'Campaign paused');
  const handleResume = () => runAction('resume', 'Campaign resumed');
  const handleRetryFailed = () => runAction('retry-failed', 'Failed recipients queued again');

  const handleDelete = async () => {
    try {
      await api.delete(`/campaigns/${id}`);
      toast.success('Campaign deleted');
      navigate('/campaigns');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Could not delete this campaign');
      setShowDeleteConfirm(false);
    }
  };

  const openRecipients = (filter: string) => {
    setRecipientStatus(filter);
    setTab('recipients');
  };

  if (loadError) {
    return (
      <PageContainer>
        <div className="card-static p-8 text-center max-w-md mx-auto">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-50 flex items-center justify-center">
            <AlertTriangle size={26} className="text-red-500" />
          </div>
          <h2 className="section-title">Campaign unavailable</h2>
          <p className="text-sm text-gray-500 mt-1.5">{loadError}</p>
          <div className="flex items-center justify-center gap-2 mt-5">
            <button type="button" onClick={() => navigate('/campaigns')} className="btn-secondary">
              <ArrowLeft size={15} /> All campaigns
            </button>
            <button type="button" onClick={loadCampaign} className="btn-primary">
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (!campaign || !stats) {
    return (
      <PageContainer className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="skeleton w-10 h-10 rounded-xl" />
          <div className="space-y-2">
            <div className="skeleton h-6 w-56" />
            <div className="skeleton h-3 w-72" />
          </div>
        </div>
        <div className="skeleton h-24 rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-32 rounded-2xl" />)}
        </div>
        <div className="skeleton h-56 rounded-2xl" />
      </PageContainer>
    );
  }

  const openRate = stats.sent_count > 0 ? ((stats.opened_count / stats.sent_count) * 100) : 0;
  const clickRate = stats.sent_count > 0 ? ((stats.clicked_count / stats.sent_count) * 100) : 0;
  const bounceRate = stats.sent_count > 0 ? ((stats.bounced_count / stats.sent_count) * 100) : 0;
  // Failed sends were never counted as sent, so only bounces reduce delivery
  const deliveryRate = stats.sent_count > 0
    ? ((Math.max(stats.sent_count - stats.bounced_count, 0) / stats.sent_count) * 100) : 0;
  const showQueue = status !== 'draft' && !!queue;

  const funnelSteps = [
    { label: 'Recipients', value: analytics?.funnel?.included ?? stats.total_recipients },
    { label: 'Sent', value: analytics?.funnel?.sent ?? stats.sent_count },
    { label: 'Delivered', value: Math.max((analytics?.funnel?.sent ?? stats.sent_count) - stats.bounced_count, 0) },
    { label: 'Opened', value: analytics?.funnel?.opened ?? stats.opened_count },
    { label: 'Clicked', value: analytics?.funnel?.clicked ?? stats.clicked_count },
  ];
  const byStatus: Record<string, number> = queue?.by_status ?? analytics?.by_status ?? {};
  const statusData = ['sent', 'pending', 'sending', 'failed', 'bounced', 'unsubscribed']
    .map(key => ({ key, value: Number(byStatus[key] || 0) }));

  const activity = (() => {
    const map = new Map<string, { bucket: string; opens: number; clicks: number }>();
    for (const row of eventSeries?.opens || []) map.set(row.bucket, { bucket: row.bucket, opens: row.count, clicks: 0 });
    for (const row of eventSeries?.clicks || []) {
      const e = map.get(row.bucket) || { bucket: row.bucket, opens: 0, clicks: 0 };
      e.clicks = row.count;
      map.set(row.bucket, e);
    }
    return Array.from(map.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
  })();
  const recipientFilters: { value: string; label: string; count?: number }[] = [
    { value: '', label: 'All', count: queue?.total },
    { value: 'pending,sending', label: 'Pending', count: queue?.queued },
    { value: 'sent', label: 'Sent', count: queue?.sent },
    { value: 'failed', label: 'Failed', count: queue?.failed },
    { value: 'bounced', label: 'Bounced', count: queue?.bounced },
    { value: 'unsubscribed', label: 'Unsubscribed', count: queue?.unsubscribed },
  ];

  return (
    <PageContainer className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3 min-w-0">
          <IconButton icon={ArrowLeft} label="Back to campaigns" onClick={() => navigate('/campaigns')} className="mt-0.5" />
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="page-title truncate">{campaign.name}</h1>
              <span className="font-mono text-[11px] text-gray-500">{campaign.public_code}</span>
              <StatusBadge status={status || campaign.status} />
            </div>
            <p className="text-sm text-gray-500 mt-0.5 truncate">{campaign.subject}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(status === 'draft' || status === 'paused') && (
            <button type="button" onClick={() => navigate(`/campaigns/${id}/edit`)} className={status === 'draft' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}>
              <Pencil size={15} /> Edit
            </button>
          )}
          {status === 'sending' && (
            <button type="button" onClick={handlePause} disabled={busy} className="btn-warning btn-sm">
              <Pause size={15} /> Pause
            </button>
          )}
          {status === 'paused' && (
            <button type="button" onClick={handleResume} disabled={busy} className="btn-success btn-sm">
              <Play size={15} /> Resume
            </button>
          )}
          {(status === 'paused' || status === 'completed') && (queue?.failed ?? 0) > 0 && (
            <button type="button" onClick={handleRetryFailed} disabled={busy} className="btn-secondary btn-sm">
              <RotateCcw size={15} /> Retry {queue!.failed.toLocaleString()} failed
            </button>
          )}
          {status !== 'sending' && (
            <button type="button" onClick={() => setShowDeleteConfirm(true)} className="btn-ghost btn-sm text-red-600 hover:bg-red-50 hover:text-red-700">
              <Trash2 size={15} /> Delete
            </button>
          )}
        </div>
      </motion.div>

      {/* Why the campaign stopped */}
      {lastError && status === 'paused' && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <AlertTriangle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
          <div className="min-w-0 text-sm">
            <p className="font-semibold text-red-800">Sending paused automatically</p>
            <p className="text-red-700 mt-0.5 break-words">{lastError}</p>
            <p className="text-red-700/80 mt-1.5">
              Nothing was lost: {(queue?.queued ?? 0).toLocaleString()} recipient{queue?.queued === 1 ? ' is' : 's are'} still
              in the queue. Fix the problem in Settings, then press Resume.
            </p>
          </div>
        </div>
      )}

      {/* Send queue */}
      {showQueue && queue && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card-static p-5"
        >
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <span className="text-sm font-semibold text-gray-700">
              {status === 'scheduled' ? 'Scheduled' : 'Sending progress'}
              <span className="ml-2 font-normal text-gray-500">
                via {queue.provider === 'smtp' ? 'SMTP' : 'Amazon SES'}
              </span>
            </span>
            <span className="text-sm text-gray-600">
              {status === 'sending' && queue.eta_seconds != null && (
                <span className="mr-3 text-gray-500">about {formatDuration(queue.eta_seconds)} left</span>
              )}
              {status === 'scheduled' && queue.scheduled_at && (
                <span className="mr-3 text-gray-500">starts {new Date(toUtc(queue.scheduled_at)).toLocaleString()}</span>
              )}
              <span className="font-bold text-brand-600">{stats.progress_pct.toFixed(1)}%</span>
            </span>
          </div>
          <div
            className="w-full h-3 bg-gray-100 rounded-full overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={queue.total}
            aria-valuenow={queue.processed}
            aria-label="Recipients processed"
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(stats.progress_pct, 100)}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className={`h-full rounded-full ${
                status === 'completed'
                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
                  : status === 'paused'
                  ? 'bg-gradient-to-r from-orange-400 to-orange-500'
                  : 'bg-gradient-to-r from-brand-500 to-accent-500'
              }`}
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <QueueTile
              icon={Hourglass} label="Pending" value={queue.pending} tone="text-gray-700 bg-gray-100"
              sub={queue.retry_waiting > 0 ? `${queue.retry_waiting.toLocaleString()} waiting to retry` : 'waiting in the queue'}
              onClick={() => openRecipients('pending,sending')}
            />
            <QueueTile
              icon={Loader2} label="Sending now" value={queue.sending} tone="text-amber-700 bg-amber-50"
              sub={status === 'sending' ? `up to ${Math.round(queue.send_rate)}/sec` : 'not running'}
              spin={status === 'sending' && queue.sending > 0}
              onClick={() => openRecipients('pending,sending')}
            />
            <QueueTile
              icon={CheckCircle2} label="Sent" value={queue.sent + queue.bounced + queue.unsubscribed} tone="text-emerald-700 bg-emerald-50"
              sub={`of ${queue.total.toLocaleString()} recipients`}
              onClick={() => openRecipients('sent')}
            />
            <QueueTile
              icon={XCircle} label="Failed" value={queue.failed} tone="text-red-700 bg-red-50"
              sub={queue.failed > 0 ? 'see the reason for each' : 'none'}
              onClick={() => openRecipients('failed')}
            />
          </div>
        </motion.div>
      )}

      <SegmentedControl
        ariaLabel="Campaign detail sections"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'activity', label: 'Activity' },
          { value: 'links', label: 'Links' },
          { value: 'recipients', label: 'Recipients' },
        ]}
      />

      {tab === 'overview' && (
        <>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <MetricCard icon={Send} label="Sent" value={stats.sent_count.toLocaleString()} gradient="from-brand-500 to-accent-500" />
            <MetricCard icon={Eye} label="Open Rate" value={`${(analytics?.rates?.open ?? openRate).toFixed(1)}%`}
              sub={`${stats.opened_count.toLocaleString()} opens`} gradient="from-emerald-500 to-teal-500" />
            <MetricCard icon={MousePointerClick} label="Click Rate" value={`${(analytics?.rates?.click ?? clickRate).toFixed(1)}%`}
              sub={`CTR ${(analytics?.rates?.ctr ?? 0).toFixed(1)}%`} gradient="from-blue-500 to-cyan-500" />
            <MetricCard icon={AlertTriangle} label="Bounce Rate" value={`${(analytics?.rates?.bounce ?? bounceRate).toFixed(1)}%`}
              sub={`${stats.bounced_count.toLocaleString()} bounces`} gradient="from-red-400 to-rose-500" />
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard
              title="From recipients to clicks"
              subtitle="Each step as a share of the recipients"
              table={{ columns: ['Step', 'Recipients'], rows: funnelSteps.map(s => [s.label, s.value]) }}
            >
              <FunnelSteps steps={funnelSteps} />
              {analytics?.duration_seconds != null && (
                <p className="text-xs text-gray-500 mt-3">
                  Sending took {formatDuration(analytics.duration_seconds)}
                </p>
              )}
            </ChartCard>
            <ChartCard
              title="Recipients by status"
              subtitle="Where every recipient stands now"
              table={{
                columns: ['Status', 'Recipients'],
                rows: statusData.filter(s => s.value > 0).map(s => [s.key, s.value]),
              }}
            >
              <StatusDonut data={statusData} />
            </ChartCard>
          </div>

          <div className="card-static p-6">
            <h3 className="section-title mb-4">Campaign Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DetailRow icon={Mail} label="From"
                value={campaign.from_name ? `${campaign.from_name} <${campaign.from_email}>` : campaign.from_email} />
              <DetailRow icon={Mail} label="Reply-To" value={campaign.reply_to || '—'} />
              {campaign.creator_name && (
                <DetailRow icon={UserMinus} label="Created By" value={campaign.creator_name} />
              )}
              <DetailRow icon={CheckCircle2} label="Delivery Rate" value={`${(analytics?.rates?.delivery ?? deliveryRate).toFixed(1)}%`} />
              <DetailRow icon={UserMinus} label="Unsubscribed" value={String(stats.unsubscribed_count)} />
              <DetailRow icon={Calendar} label="Created" value={campaign.created_at ? new Date(toUtc(campaign.created_at)).toLocaleString() : '—'} />
              <DetailRow icon={Clock} label="Scheduled" value={campaign.scheduled_at ? new Date(toUtc(campaign.scheduled_at)).toLocaleString() : '—'} />
            </div>
          </div>
        </>
      )}

      {tab === 'activity' && (
        <ChartCard
          title="Opens and clicks"
          subtitle="Per hour, in your local time"
          table={activity.length ? trendTable(activity, ACTIVITY_KEYS, ACTIVITY_LABELS) : undefined}
        >
          {activity.length ? (
            <TrendChart
              data={activity}
              keys={ACTIVITY_KEYS}
              labels={ACTIVITY_LABELS}
              colors={[SERIES.opens, SERIES.clicks]}
              height={300}
            />
          ) : (
            <div className="h-[300px] flex flex-col items-center justify-center text-sm text-gray-500 text-center px-6">
              <p>No opens or clicks recorded yet.</p>
              <p className="mt-1 text-xs">They are counted only for emails sent while tracking is on (Settings → Email Provider).</p>
            </div>
          )}
        </ChartCard>
      )}

      {tab === 'links' && (
        <div className="card-static overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Top clicked links</h3>
          </div>
          {links.length === 0 ? (
            <p className="p-8 text-sm text-gray-500 text-center">No link clicks recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-5 py-2.5">URL</th>
                  <th className="text-right px-5 py-2.5">Clicks</th>
                  <th className="text-right px-5 py-2.5">CTR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {links.map(l => (
                  <tr key={l.url}>
                    <td className="px-5 py-2.5 max-w-[420px] truncate" title={l.url}>
                      <a href={l.url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{l.url}</a>
                    </td>
                    <td className="px-5 py-2.5 text-right font-medium">{l.clicks}</td>
                    <td className="px-5 py-2.5 text-right text-gray-500">{l.ctr}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'recipients' && id && (
        <div className="card-static p-5 space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter recipients by status">
            {recipientFilters.map(f => (
              <button
                key={f.value || 'all'}
                type="button"
                onClick={() => setRecipientStatus(f.value)}
                aria-pressed={recipientStatus === f.value}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  recipientStatus === f.value ? 'bg-brand-50 border-brand-200 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {f.label}
                {f.count != null && <span className="ml-1.5 text-gray-500">{f.count.toLocaleString()}</span>}
              </button>
            ))}
          </div>
          <RecipientTable
            campaignCode={id}
            status={recipientStatus || undefined}
            refreshKey={queueSignature}
            readOnly
          />
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title="Delete Campaign"
        message="Are you sure you want to delete this campaign? All recipients, tracking data, and attachments will be permanently removed."
        confirmLabel="Delete Campaign"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </PageContainer>
  );
}

/** The API returns UTC times without an offset; mark them as UTC before parsing. */
function toUtc(value: string) {
  return /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return 'under a minute';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

function QueueTile({ icon: Icon, label, value, sub, tone, spin, onClick }: {
  icon: React.ElementType; label: string; value: number; sub: string; tone: string; spin?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl border border-gray-100 p-3.5 hover:border-gray-200 hover:bg-gray-50/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <div className="flex items-center gap-2">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${tone}`}>
          <Icon size={14} className={spin ? 'animate-spin' : ''} />
        </span>
        <span className="text-xs font-medium text-gray-600">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 font-display tracking-tight mt-2">{value.toLocaleString()}</div>
      <div className="text-xs text-gray-500 mt-0.5">{sub}</div>
    </button>
  );
}

function MetricCard({ icon: Icon, label, value, sub, gradient }: {
  icon: React.ElementType; label: string; value: string; sub?: string; gradient: string;
}) {
  return (
    <div className="card-static p-5 group hover:shadow-card-hover transition-all duration-300">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md mb-3`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="text-2xl font-bold text-gray-900 font-display tracking-tight">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</div>
        <div className="text-sm font-medium text-gray-900 mt-0.5 break-words">{value}</div>
      </div>
    </div>
  );
}
