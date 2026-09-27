/**
 * Source revision comparison (spec 18).
 *
 * Side-by-side or inline diff of two revisions, with copy for a changed section so an
 * author can lift one fix out of an older revision without restoring the whole thing.
 */

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { Columns2, Copy, Rows2 } from 'lucide-react';
import { Segmented } from '../ui/primitives';

interface DiffRow {
  kind: 'same' | 'added' | 'removed';
  leftNo: number | null;
  rightNo: number | null;
  text: string;
}

/** Longest common subsequence over lines; inputs here are small enough for the table. */
function diffLines(before: string, after: string): DiffRow[] {
  const left = before.split('\n');
  const right = after.split('\n');
  const rows = left.length;
  const cols = right.length;

  // Guard against pathological sizes: fall back to a coarse block diff.
  if (rows * cols > 4_000_000) {
    return [
      ...left.map((text, index) => ({ kind: 'removed' as const, leftNo: index + 1, rightNo: null, text })),
      ...right.map((text, index) => ({ kind: 'added' as const, leftNo: null, rightNo: index + 1, text })),
    ];
  }

  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const out: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (left[i] === right[j]) {
      out.push({ kind: 'same', leftNo: i + 1, rightNo: j + 1, text: left[i] });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ kind: 'removed', leftNo: i + 1, rightNo: null, text: left[i] });
      i += 1;
    } else {
      out.push({ kind: 'added', leftNo: null, rightNo: j + 1, text: right[j] });
      j += 1;
    }
  }
  while (i < rows) {
    out.push({ kind: 'removed', leftNo: i + 1, rightNo: null, text: left[i] });
    i += 1;
  }
  while (j < cols) {
    out.push({ kind: 'added', leftNo: null, rightNo: j + 1, text: right[j] });
    j += 1;
  }
  return out;
}

export function DiffView({
  before,
  after,
  beforeLabel,
  afterLabel,
  height = 420,
}: {
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  height?: number;
}) {
  const [mode, setMode] = useState<'split' | 'inline'>('split');
  const [onlyChanges, setOnlyChanges] = useState(true);
  const rows = useMemo(() => diffLines(before, after), [before, after]);
  const changes = useMemo(() => rows.filter(row => row.kind !== 'same'), [rows]);

  const visible = useMemo(() => {
    if (!onlyChanges) return rows;
    // Keep two lines of context around each change so the diff stays readable.
    const keep = new Set<number>();
    rows.forEach((row, index) => {
      if (row.kind === 'same') return;
      for (let offset = -2; offset <= 2; offset += 1) keep.add(index + offset);
    });
    return rows.filter((_, index) => keep.has(index));
  }, [onlyChanges, rows]);

  const added = changes.filter(row => row.kind === 'added').length;
  const removed = changes.filter(row => row.kind === 'removed').length;

  const copyChanged = () => {
    const text = changes
      .filter(row => row.kind === 'added')
      .map(row => row.text)
      .join('\n');
    void navigator.clipboard?.writeText(text);
    toast.success('Changed lines copied.');
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Diff layout"
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'split', label: 'Side by side', icon: <Columns2 size={11} /> },
            { value: 'inline', label: 'Inline', icon: <Rows2 size={11} /> },
          ]}
        />
        <label className="flex items-center gap-1.5 text-[11.5px] text-gray-600">
          <input
            type="checkbox"
            checked={onlyChanges}
            onChange={event => setOnlyChanges(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Only changed lines
        </label>
        <p className="text-[11.5px] tabular-nums text-gray-500">
          <span className="text-emerald-700">+{added}</span> <span className="text-red-700">−{removed}</span>
        </p>
        <button
          type="button"
          onClick={copyChanged}
          disabled={!added}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11.5px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <Copy size={11} />
          Copy changed lines
        </button>
      </div>

      <div className="overflow-auto rounded-xl border border-gray-200" style={{ maxHeight: height }}>
        <div className="sticky top-0 z-10 grid grid-cols-2 gap-px border-b border-gray-200 bg-gray-50 text-[11px] font-semibold text-gray-600">
          <p className="px-2 py-1">{beforeLabel}</p>
          {mode === 'split' && <p className="px-2 py-1">{afterLabel}</p>}
        </div>
        <table className="w-full border-collapse font-mono text-[11.5px] leading-relaxed">
          <tbody>
            {visible.map((row, index) => (
              <tr
                key={`${row.leftNo}-${row.rightNo}-${index}`}
                className={clsx(
                  row.kind === 'added' && 'bg-emerald-50',
                  row.kind === 'removed' && 'bg-red-50'
                )}
              >
                <td className="w-10 select-none border-r border-gray-100 px-1 text-right text-gray-400">{row.leftNo ?? ''}</td>
                {mode === 'split' ? (
                  <>
                    <td className="w-1/2 whitespace-pre-wrap break-all px-2 text-gray-700">
                      {row.kind !== 'added' ? row.text : ''}
                    </td>
                    <td className="w-10 select-none border-x border-gray-100 px-1 text-right text-gray-400">
                      {row.rightNo ?? ''}
                    </td>
                    <td className="w-1/2 whitespace-pre-wrap break-all px-2 text-gray-700">
                      {row.kind !== 'removed' ? row.text : ''}
                    </td>
                  </>
                ) : (
                  <td className="whitespace-pre-wrap break-all px-2 text-gray-700">
                    <span className={clsx('mr-1 font-semibold', row.kind === 'added' ? 'text-emerald-700' : row.kind === 'removed' ? 'text-red-700' : 'text-transparent')}>
                      {row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '}
                    </span>
                    {row.text}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!changes.length && <p className="text-[12px] text-gray-500">These two versions are identical.</p>}
    </div>
  );
}
