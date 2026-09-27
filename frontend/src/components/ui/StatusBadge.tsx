import { getCampaignStatus } from '../../constants/campaignStatus';

interface Props {
  status: string;
  size?: 'sm' | 'md';
  className?: string;
}

export default function StatusBadge({ status, size = 'md', className = '' }: Props) {
  const style = getCampaignStatus(status);

  return (
    <span
      className={`badge ${style.bg} ${style.text} ring-0 ${size === 'sm' ? 'text-[10px]' : ''} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot} ${status === 'sending' ? 'animate-pulse' : ''}`} />
      {style.label}
    </span>
  );
}
