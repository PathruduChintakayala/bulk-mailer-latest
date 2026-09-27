/**
 * Crash recovery (spec 21.4).
 *
 * A local copy of the working content is written on a short debounce so an
 * interrupted session can be restored, compared with the server copy, or
 * discarded. The copy is cleared once a save succeeds.
 */

import type { EmailDocument } from '../model/document';
import type { MergeFieldDefinitionDto, PlainTextMode, RevisionKind, TargetType } from '../api/types';

export interface RecoveryCopy {
  targetType: TargetType;
  targetCode: string;
  baseRevisionCode: string | null;
  kind: RevisionKind;
  document: EmailDocument | null;
  htmlSource: string | null;
  subject: string;
  preheader: string;
  plainText: string | null;
  plainTextMode: PlainTextMode;
  themeCode: string | null;
  mergeFieldDefinitions: MergeFieldDefinitionDto[];
  selectionId: string | null;
  savedAt: string;
  /** Set when the tab closed without a clean teardown. */
  unclean: boolean;
}

const PREFIX = 'composer2:recovery:';
const SESSION_FLAG = 'composer2:session-open';

function keyFor(targetType: TargetType, targetCode: string): string {
  return `${PREFIX}${targetType}:${targetCode}`;
}

export function writeRecoveryCopy(copy: Omit<RecoveryCopy, 'savedAt' | 'unclean'>): void {
  try {
    const payload: RecoveryCopy = { ...copy, savedAt: new Date().toISOString(), unclean: true };
    localStorage.setItem(keyFor(copy.targetType, copy.targetCode), JSON.stringify(payload));
    sessionStorage.setItem(SESSION_FLAG, '1');
  } catch {
    /* quota or private mode: recovery is best effort */
  }
}

export function readRecoveryCopy(targetType: TargetType, targetCode: string): RecoveryCopy | null {
  try {
    const raw = localStorage.getItem(keyFor(targetType, targetCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecoveryCopy;
    if (!parsed || typeof parsed !== 'object' || !parsed.savedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearRecoveryCopy(targetType: TargetType, targetCode: string): void {
  try {
    localStorage.removeItem(keyFor(targetType, targetCode));
  } catch {
    /* ignore */
  }
}

/** Called on a clean unmount so the next visit does not offer a stale restore. */
export function markCleanExit(targetType: TargetType, targetCode: string): void {
  try {
    const raw = localStorage.getItem(keyFor(targetType, targetCode));
    if (!raw) return;
    const parsed = JSON.parse(raw) as RecoveryCopy;
    parsed.unclean = false;
    localStorage.setItem(keyFor(targetType, targetCode), JSON.stringify(parsed));
  } catch {
    /* ignore */
  }
}

export function recoveryAge(copy: RecoveryCopy): string {
  const saved = new Date(copy.savedAt).getTime();
  if (Number.isNaN(saved)) return 'recently';
  const seconds = Math.max(0, Math.round((Date.now() - saved) / 1000));
  if (seconds < 60) return 'less than a minute ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Prune copies older than a week so localStorage does not grow without bound. */
export function pruneOldRecoveryCopies(maxAgeDays = 7): void {
  try {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const doomed: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as RecoveryCopy;
        if (new Date(parsed.savedAt).getTime() < cutoff) doomed.push(key);
      } catch {
        doomed.push(key);
      }
    }
    doomed.forEach(key => localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}
