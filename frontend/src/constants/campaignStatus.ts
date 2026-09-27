export interface CampaignStatusStyle {
  bg: string;
  text: string;
  dot: string;
  label: string;
}

export const CAMPAIGN_STATUS: Record<string, CampaignStatusStyle> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-700', dot: 'bg-gray-400', label: 'Draft' },
  scheduled: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', label: 'Scheduled' },
  sending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Sending' },
  paused: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500', label: 'Paused' },
  completed: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Completed' },
  failed: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', label: 'Failed' },
};

export const CAMPAIGN_STATUS_ORDER = [
  'draft', 'sending', 'completed', 'scheduled', 'paused', 'failed',
] as const;

export function getCampaignStatus(status?: string | null): CampaignStatusStyle {
  return CAMPAIGN_STATUS[status || 'draft'] || CAMPAIGN_STATUS.draft;
}
