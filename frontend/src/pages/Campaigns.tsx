import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../services/api';
import toast from 'react-hot-toast';
import type { Campaign } from '../types';
import {
  Plus, Mail, Search, Sparkles, Pencil, ChevronRight, Copy,
} from 'lucide-react';
import PageContainer from '../components/ui/PageContainer';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';
import SegmentedControl from '../components/ui/SegmentedControl';
import StatusBadge from '../components/ui/StatusBadge';
import { CAMPAIGN_STATUS, CAMPAIGN_STATUS_ORDER, getCampaignStatus } from '../constants/campaignStatus';

type StatusFilter = 'all' | Campaign['status'];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');

  const loadCampaigns = () => {
    api.get('/campaigns/').then(r => setCampaigns(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { loadCampaigns(); }, []);

  const handleClone = async (e: React.MouseEvent, campaignCode: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await api.post(`/campaigns/${campaignCode}/clone`);
      loadCampaigns();
      toast.success('Campaign cloned');
    } catch { toast.error('Failed to clone campaign'); }
  };

  const filtered = campaigns.filter(c => {
    if (filter !== 'all' && c.status !== filter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.subject.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = campaigns.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  const filterOptions = [
    { value: 'all' as StatusFilter, label: 'All', count: campaigns.length },
    ...CAMPAIGN_STATUS_ORDER.map(s => ({
      value: s as StatusFilter,
      label: CAMPAIGN_STATUS[s].label,
      count: counts[s] || 0,
    })),
  ];

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Campaigns"
        subtitle={`${campaigns.length} total campaign${campaigns.length !== 1 ? 's' : ''}`}
        actions={<Link to="/campaigns/new" className="btn-primary"><Plus size={16} /> New Campaign</Link>}
      />

      {/* Search + Filter */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            className="input-field !pl-10 w-full" placeholder="Search campaigns..."
            aria-label="Search campaigns by name or subject"
            type="search"
          />
        </div>
        <SegmentedControl
          ariaLabel="Filter campaigns by status"
          value={filter}
          onChange={setFilter}
          options={filterOptions}
        />
      </div>

      {/* Campaign list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="card-static p-4 flex items-center gap-4">
              <div className="skeleton w-11 h-11 rounded-xl" />
              <div className="flex-1 space-y-2"><div className="skeleton h-4 w-48" /><div className="skeleton h-3 w-32" /></div>
              <div className="skeleton h-6 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={search || filter !== 'all' ? 'No matching campaigns' : 'No campaigns yet'}
          description={search || filter !== 'all'
            ? 'Try a different search term or clear the status filter'
            : 'Create your first email campaign to get started'}
          action={
            search || filter !== 'all' ? (
              <button type="button" className="btn-secondary" onClick={() => { setSearch(''); setFilter('all'); }}>
                Clear filters
              </button>
            ) : (
              <Link to="/campaigns/new" className="btn-primary"><Plus size={16} /> New Campaign</Link>
            )
          }
        />
      ) : (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-2">
          {filtered.map(campaign => {
            const status = getCampaignStatus(campaign.status);
            const openRate = campaign.sent_count > 0 ? ((campaign.opened_count / campaign.sent_count) * 100).toFixed(1) : '—';
            const clickRate = campaign.sent_count > 0 ? ((campaign.clicked_count / campaign.sent_count) * 100).toFixed(1) : '—';

            return (
              <motion.div key={campaign.public_code} variants={item}>
                <Link to={`/campaigns/${campaign.public_code}`}
                  className="card group p-4 flex items-center gap-3 sm:gap-4 cursor-pointer">
                  {/* Status icon */}
                  <div className={`w-11 h-11 rounded-xl ${status.bg} flex items-center justify-center flex-shrink-0`}>
                    <Mail size={18} className={status.text} />
                  </div>

                  {/* Campaign info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="font-semibold text-sm text-gray-900 truncate group-hover:text-brand-600 transition-colors">
                        {campaign.name}
                      </h3>
                      <span className="font-mono text-[11px] text-gray-500">{campaign.public_code}</span>
                      <StatusBadge status={campaign.status} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-xs text-gray-500 truncate">{campaign.subject}</p>
                      {campaign.creator_name && (
                        <span className="text-[10px] text-gray-500 flex-shrink-0 hidden sm:inline">by {campaign.creator_name}</span>
                      )}
                    </div>
                    {/* Condensed stats on mobile */}
                    {campaign.sent_count > 0 && (
                      <div className="flex md:hidden items-center gap-3 mt-1.5 text-[11px] text-gray-500">
                        <span><strong className="text-gray-900">{campaign.sent_count.toLocaleString()}</strong> sent</span>
                        <span><strong className="text-emerald-600">{openRate}%</strong> opens</span>
                        <span><strong className="text-blue-600">{clickRate}%</strong> clicks</span>
                      </div>
                    )}
                  </div>

                  {/* Stats for sent campaigns */}
                  {campaign.sent_count > 0 && (
                    <div className="hidden md:flex items-center gap-5 text-xs flex-shrink-0">
                      <div className="text-center min-w-[50px]">
                        <div className="font-bold text-gray-900">{campaign.sent_count.toLocaleString()}</div>
                        <div className="text-gray-500 mt-0.5">Sent</div>
                      </div>
                      <div className="text-center min-w-[50px]">
                        <div className="font-bold text-emerald-600">{openRate}%</div>
                        <div className="text-gray-500 mt-0.5">Opens</div>
                      </div>
                      <div className="text-center min-w-[50px]">
                        <div className="font-bold text-blue-600">{clickRate}%</div>
                        <div className="text-gray-500 mt-0.5">Clicks</div>
                      </div>
                      <div className="text-center min-w-[50px]">
                        <div className="font-bold text-gray-900">{campaign.total_recipients.toLocaleString()}</div>
                        <div className="text-gray-500 mt-0.5">Recipients</div>
                      </div>
                    </div>
                  )}

                  {/* Draft badge — recipients count */}
                  {campaign.status === 'draft' && campaign.total_recipients > 0 && (
                    <span className="hidden md:inline-flex badge-gray ring-0 text-xs">
                      {campaign.total_recipients} recipients
                    </span>
                  )}

                  {/* Edit for drafts */}
                  {campaign.status === 'draft' && (
                    <Link to={`/campaigns/${campaign.public_code}/edit`}
                      onClick={e => e.stopPropagation()}
                      className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 flex-shrink-0"
                      title="Edit draft"
                      aria-label={`Edit draft ${campaign.name}`}>
                      <Pencil size={15} />
                    </Link>
                  )}

                  {/* Clone */}
                  <button
                    type="button"
                    onClick={e => handleClone(e, campaign.public_code)}
                    className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 flex-shrink-0 cursor-pointer"
                    title="Clone campaign"
                    aria-label={`Clone ${campaign.name}`}>
                    <Copy size={15} />
                  </button>

                  {/* Date */}
                  <span className="text-[11px] text-gray-500 hidden lg:block w-20 text-right flex-shrink-0">
                    {campaign.created_at ? new Date(campaign.created_at).toLocaleDateString() : ''}
                  </span>

                  <ChevronRight size={16} className="text-gray-400 group-hover:text-brand-500 transition-colors flex-shrink-0" />
                </Link>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </PageContainer>
  );
}
