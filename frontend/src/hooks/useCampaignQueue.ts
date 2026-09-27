import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import type { CampaignQueue } from '../types';

const ACTIVE_INTERVAL_MS = 2000;
const IDLE_INTERVAL_MS = 15000;

/** Statuses where the numbers are still moving. */
export function isQueueActive(status?: string | null) {
  return status === 'sending' || status === 'scheduled';
}

/**
 * Live send status for one campaign. Polls quickly while it is sending and
 * slowly otherwise, and stops when the page is left.
 */
export function useCampaignQueue(campaignCode?: string) {
  const [queue, setQueue] = useState<CampaignQueue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const load = useCallback(async (): Promise<CampaignQueue | null> => {
    if (!campaignCode) return null;
    try {
      const res = await api.get<CampaignQueue>(`/campaigns/${campaignCode}/queue`);
      if (!alive.current) return null;
      setQueue(res.data);
      setError(null);
      return res.data;
    } catch (err: any) {
      if (alive.current) setError(err.response?.data?.detail || 'Could not load send status');
      return null;
    }
  }, [campaignCode]);

  useEffect(() => {
    alive.current = true;
    const tick = async () => {
      const data = await load();
      if (!alive.current) return;
      const delay = isQueueActive(data?.status) ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
      timer.current = setTimeout(tick, delay);
    };
    tick();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  return { queue, error, refresh: load };
}
