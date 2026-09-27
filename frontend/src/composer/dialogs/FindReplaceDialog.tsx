/**
 * Find and replace across the visual document (spec 5.6).
 *
 * Matches are found in text-bearing block fields only, so replacing text can never
 * damage markup or merge-field chips: merge expressions are skipped by default.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { ArrowRight, CaseSensitive, Replace, Search, WholeWord } from 'lucide-react';
import type { Block, EmailDocument } from '../model/document';
import { allBlocks, stripHtml } from '../model/mutations';
import { useComposer } from '../store/composerStore';
import { Dialog, DialogButton } from '../ui/Dialog';
import { InlineEmpty, Pill } from '../ui/primitives';

/** Fields that hold author-visible text, per block type. */
const TEXT_FIELDS: Partial<Record<Block['type'], string[]>> = {
  text: ['html'],
  heading: ['html'],
  quote: ['html', 'citation'],
  list: ['items'],
  button: ['text'],
  signature: ['html'],
  preformatted: ['text'],
  unsubscribe: ['label'],
  viewInBrowser: ['label'],
  preferenceCenter: ['label'],
  legal: ['html'],
  orgFooter: ['html'],
  contactInfo: ['html'],
  image: ['alt'],
  logo: ['alt'],
};

interface Match {
  blockId: string;
  field: string;
  label: string;
  excerpt: string;
  count: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPattern(term: string, caseSensitive: boolean, wholeWord: boolean): RegExp | null {
  if (!term) return null;
  const body = wholeWord ? `\\b${escapeRegExp(term)}\\b` : escapeRegExp(term);
  return new RegExp(body, caseSensitive ? 'g' : 'gi');
}

function fieldValues(block: Block, field: string): string[] {
  const value = (block as unknown as Record<string, unknown>)[field];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string');
  return [];
}

export function FindReplaceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const doc = useComposer(store => store.doc);
  const commit = useComposer(store => store.commit);
  const select = useComposer(store => store.select);

  const [term, setTerm] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [skipMerge, setSkipMerge] = useState(true);

  const matches = useMemo<Match[]>(() => {
    const pattern = buildPattern(term, caseSensitive, wholeWord);
    if (!pattern) return [];
    const out: Match[] = [];
    allBlocks(doc).forEach(block => {
      (TEXT_FIELDS[block.type] || []).forEach(field => {
        fieldValues(block, field).forEach(raw => {
          const plain = field === 'html' ? stripHtml(raw) : raw;
          const hits = plain.match(new RegExp(pattern.source, pattern.flags));
          if (!hits?.length) return;
          const at = plain.search(new RegExp(pattern.source, caseSensitive ? '' : 'i'));
          out.push({
            blockId: block.id,
            field,
            label: block.type,
            excerpt: plain.slice(Math.max(0, at - 24), at + term.length + 24),
            count: hits.length,
          });
        });
      });
    });
    return out;
  }, [caseSensitive, doc, term, wholeWord]);

  const total = matches.reduce((sum, match) => sum + match.count, 0);

  const replaceAll = useCallback(() => {
    const pattern = buildPattern(term, caseSensitive, wholeWord);
    if (!pattern) return;
    let replaced = 0;

    const swap = (value: string): string =>
      value.replace(new RegExp(pattern.source, pattern.flags), () => {
        replaced += 1;
        return replacement;
      });

    const inTextNodesOnly = (html: string): string => {
      // Only substitute inside text nodes so tags and merge chips stay intact.
      return html.replace(/>([^<]+)</g, (whole, text: string) => {
        if (skipMerge && /\{\{/.test(text)) return whole;
        return `>${swap(text)}<`;
      });
    };

    commit((current: EmailDocument) => {
      const next = JSON.parse(JSON.stringify(current)) as EmailDocument;
      allBlocks(next).forEach(block => {
        (TEXT_FIELDS[block.type] || []).forEach(field => {
          const record = block as unknown as Record<string, unknown>;
          const value = record[field];
          if (typeof value === 'string') {
            record[field] = field === 'html' ? inTextNodesOnly(value) : skipMerge && /\{\{/.test(value) ? value : swap(value);
          } else if (Array.isArray(value)) {
            record[field] = value.map(entry =>
              typeof entry === 'string' ? (skipMerge && /\{\{/.test(entry) ? entry : swap(entry)) : entry
            );
          }
        });
      });
      return next;
    }, 'Replace text');

    toast.success(replaced ? `Replaced ${replaced} occurrence${replaced === 1 ? '' : 's'}.` : 'Nothing was replaced.');
  }, [caseSensitive, commit, replacement, skipMerge, term, wholeWord]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="Find and replace"
      description="Searches the text in blocks. Markup and merge fields are protected."
      footer={
        <>
          <DialogButton onClick={onClose}>Close</DialogButton>
          <DialogButton variant="primary" onClick={replaceAll} disabled={!term || !total}>
            <Replace size={12} />
            Replace all
          </DialogButton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={term}
              onChange={event => setTerm(event.target.value)}
              placeholder="Find"
              aria-label="Find"
              autoFocus
              className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-2 text-[13px] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div className="relative">
            <ArrowRight size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={replacement}
              onChange={event => setReplacement(event.target.value)}
              placeholder="Replace with"
              aria-label="Replace with"
              className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-2 text-[13px] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Toggle active={caseSensitive} onClick={() => setCaseSensitive(value => !value)} label="Match case">
            <CaseSensitive size={13} />
          </Toggle>
          <Toggle active={wholeWord} onClick={() => setWholeWord(value => !value)} label="Whole word">
            <WholeWord size={13} />
          </Toggle>
          <Toggle active={skipMerge} onClick={() => setSkipMerge(value => !value)} label="Skip merge fields">
            {'{{ }}'}
          </Toggle>
          {term && (
            <Pill tone={total ? 'blue' : 'gray'}>
              {total} match{total === 1 ? '' : 'es'} in {matches.length} block{matches.length === 1 ? '' : 's'}
            </Pill>
          )}
        </div>

        {term ? (
          matches.length ? (
            <ul className="max-h-52 space-y-1 overflow-y-auto pr-1">
              {matches.map((match, index) => (
                <li key={`${match.blockId}-${match.field}-${index}`}>
                  <button
                    type="button"
                    onClick={() => select(match.blockId)}
                    className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-left hover:border-brand-300 hover:bg-gray-50"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[10.5px] uppercase tracking-wide text-gray-400">
                        {match.label} · {match.field}
                      </span>
                      <span className="text-[10.5px] tabular-nums text-gray-500">{match.count}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-gray-700">…{match.excerpt}…</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <InlineEmpty title="No matches" description="Try a different term, or turn off “whole word”." />
          )
        ) : (
          <p className="text-[12px] text-gray-500">
            In HTML mode, use the editor’s own find and replace for full regular-expression support.
          </p>
        )}
      </div>
    </Dialog>
  );
}

function Toggle({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={clsx(
        'inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[11px] font-medium transition-colors',
        active ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
      )}
    >
      {children}
    </button>
  );
}
