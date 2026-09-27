/**
 * Table editor (spec 9).
 *
 * Structure edits (rows, columns, header and footer, merge and split) happen here
 * so the canvas stays a preview surface. Cell text is plain-text edited to keep the
 * generated markup predictable across email clients.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Columns3,
  Combine,
  Copy,
  Rows3,
  Split,
  Trash2,
} from 'lucide-react';
import type { Align, TableBlock, TableCell, TableRowData, VAlign } from '../model/document';
import { findNode } from '../model/mutations';
import { useComposer } from '../store/composerStore';
import { Dialog, DialogButton } from '../ui/Dialog';
import { ColorInput, SelectInput, SpacingInput, ToggleInput } from '../ui/controls';
import { Pill } from '../ui/primitives';
import { usePalette } from '../panels/inspectorParts';

let seq = 0;
function cellId(): string {
  seq += 1;
  return `tc-${Date.now().toString(36)}-${seq}`;
}

function newCell(html = ''): TableCell {
  return { id: cellId(), html, align: 'left', vAlign: 'middle' };
}

function columnCount(rows: TableRowData[]): number {
  return rows.reduce(
    (max, row) => Math.max(max, row.cells.reduce((sum, cell) => sum + (cell.colSpan || 1), 0)),
    0
  );
}

export function TableEditor({ blockId, onClose }: { blockId: string | null; onClose: () => void }) {
  const doc = useComposer(store => store.doc);
  const updateNodeById = useComposer(store => store.updateNodeById);
  const tokens = useComposer(store => store.themeTokens());
  const palette = usePalette(tokens);
  const found = blockId ? findNode(doc, blockId) : null;
  const node = found?.location.kind === 'block' ? (found.node as { type?: string }) : null;
  const block = node?.type === 'table' ? (found!.node as TableBlock) : undefined;

  const [rows, setRows] = useState<TableRowData[]>([]);
  const [cursor, setCursor] = useState<{ row: number; cell: number }>({ row: 0, cell: 0 });
  const [selection, setSelection] = useState<string[]>([]);

  useEffect(() => {
    if (block) {
      setRows(JSON.parse(JSON.stringify(block.rows)) as TableRowData[]);
      setCursor({ row: 0, cell: 0 });
      setSelection([]);
    }
  }, [blockId]); // eslint-disable-line react-hooks/exhaustive-deps

  const cols = useMemo(() => columnCount(rows), [rows]);
  const activeCell = rows[cursor.row]?.cells[cursor.cell];

  const patch = (values: Partial<TableBlock>) => {
    if (!blockId) return;
    updateNodeById(blockId, values as Record<string, unknown>, 'Edit table');
  };

  const commitRows = (next: TableRowData[]) => {
    setRows(next);
    patch({ rows: next });
  };

  const setCellValue = (rowIndex: number, cellIndex: number, values: Partial<TableCell>) => {
    const next = rows.map((row, rIdx) =>
      rIdx === rowIndex
        ? { ...row, cells: row.cells.map((cell, cIdx) => (cIdx === cellIndex ? { ...cell, ...values } : cell)) }
        : row
    );
    commitRows(next);
  };

  const applyToSelection = (values: Partial<TableCell>) => {
    const ids = selection.length ? selection : activeCell ? [activeCell.id] : [];
    if (!ids.length) return;
    commitRows(
      rows.map(row => ({
        ...row,
        cells: row.cells.map(cell => (ids.includes(cell.id) ? { ...cell, ...values } : cell)),
      }))
    );
  };

  const insertRow = (at: number) => {
    const template = rows[Math.min(at, rows.length - 1)];
    const width = template ? template.cells.length : Math.max(1, cols);
    const next = [...rows];
    next.splice(at, 0, { id: cellId(), cells: Array.from({ length: width }, () => newCell()) });
    commitRows(next);
  };

  const duplicateRow = (index: number) => {
    const source = rows[index];
    if (!source) return;
    const next = [...rows];
    next.splice(index + 1, 0, {
      id: cellId(),
      cells: source.cells.map(cell => ({ ...cell, id: cellId() })),
    });
    commitRows(next);
  };

  const deleteRow = (index: number) => {
    if (rows.length <= 1) return;
    commitRows(rows.filter((_, rIdx) => rIdx !== index));
    setCursor(current => ({ row: Math.max(0, Math.min(current.row, rows.length - 2)), cell: 0 }));
  };

  const insertColumn = (at: number) => {
    commitRows(
      rows.map(row => {
        const cells = [...row.cells];
        cells.splice(Math.min(at, cells.length), 0, newCell());
        return { ...row, cells };
      })
    );
  };

  const deleteColumn = (at: number) => {
    if (cols <= 1) return;
    commitRows(rows.map(row => ({ ...row, cells: row.cells.filter((_, cIdx) => cIdx !== at) })));
    setCursor(current => ({ ...current, cell: Math.max(0, current.cell - 1) }));
  };

  const mergeRight = () => {
    if (!activeCell) return;
    const row = rows[cursor.row];
    const neighbour = row.cells[cursor.cell + 1];
    if (!neighbour) return;
    const merged: TableCell = {
      ...activeCell,
      html: [activeCell.html, neighbour.html].filter(Boolean).join(' '),
      colSpan: (activeCell.colSpan || 1) + (neighbour.colSpan || 1),
    };
    const cells = [...row.cells];
    cells.splice(cursor.cell, 2, merged);
    commitRows(rows.map((entry, rIdx) => (rIdx === cursor.row ? { ...entry, cells } : entry)));
  };

  const splitCell = () => {
    if (!activeCell || (activeCell.colSpan || 1) < 2) return;
    const row = rows[cursor.row];
    const span = activeCell.colSpan || 1;
    const cells = [...row.cells];
    cells.splice(
      cursor.cell,
      1,
      { ...activeCell, colSpan: 1 },
      ...Array.from({ length: span - 1 }, () => newCell())
    );
    commitRows(rows.map((entry, rIdx) => (rIdx === cursor.row ? { ...entry, cells } : entry)));
  };

  const toggleSelect = (id: string, additive: boolean) => {
    setSelection(current => {
      if (!additive) return [id];
      return current.includes(id) ? current.filter(entry => entry !== id) : [...current, id];
    });
  };

  return (
    <Dialog
      open={!!blockId && !!block}
      onClose={onClose}
      size="xl"
      title="Table"
      description="Tables are rendered as email-safe markup. Keep them simple so they survive narrow screens."
      footer={<DialogButton variant="primary" onClick={onClose}>Done</DialogButton>}
    >
      {block && (
        <div className="grid gap-4 lg:grid-cols-[1fr_248px]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <ToolbarAction icon={<Rows3 size={12} />} label="Insert row above" onClick={() => insertRow(cursor.row)} />
              <ToolbarAction icon={<ArrowDownToLine size={12} />} label="Insert row below" onClick={() => insertRow(cursor.row + 1)} />
              <ToolbarAction icon={<Copy size={12} />} label="Duplicate row" onClick={() => duplicateRow(cursor.row)} />
              <ToolbarAction
                icon={<Trash2 size={12} />}
                label="Delete row"
                onClick={() => deleteRow(cursor.row)}
                disabled={rows.length <= 1}
              />
              <span className="mx-1 h-4 w-px bg-gray-200" />
              <ToolbarAction icon={<Columns3 size={12} />} label="Insert column left" onClick={() => insertColumn(cursor.cell)} />
              <ToolbarAction icon={<ArrowUpToLine size={12} className="rotate-90" />} label="Insert column right" onClick={() => insertColumn(cursor.cell + 1)} />
              <ToolbarAction
                icon={<Trash2 size={12} />}
                label="Delete column"
                onClick={() => deleteColumn(cursor.cell)}
                disabled={cols <= 1}
              />
              <span className="mx-1 h-4 w-px bg-gray-200" />
              <ToolbarAction icon={<Combine size={12} />} label="Merge with cell to the right" onClick={mergeRight} />
              <ToolbarAction
                icon={<Split size={12} />}
                label="Split merged cell"
                onClick={splitCell}
                disabled={(activeCell?.colSpan || 1) < 2}
              />
            </div>

            <div className="overflow-auto rounded-xl border border-gray-200">
              <table className="w-full border-collapse text-[12.5px]">
                <tbody>
                  {rows.map((row, rIdx) => {
                    const isHeader = block.headerRow && rIdx === 0;
                    const isFooter = block.footerRow && rIdx === rows.length - 1;
                    return (
                      <tr key={row.id}>
                        {row.cells.map((cell, cIdx) => (
                          <td
                            key={cell.id}
                            colSpan={cell.colSpan}
                            onClick={event => {
                              setCursor({ row: rIdx, cell: cIdx });
                              toggleSelect(cell.id, event.metaKey || event.ctrlKey);
                            }}
                            className={clsx(
                              'border p-0 align-top',
                              selection.includes(cell.id)
                                ? 'border-brand-400 bg-brand-50/70'
                                : cursor.row === rIdx && cursor.cell === cIdx
                                  ? 'border-brand-400'
                                  : 'border-gray-200'
                            )}
                            style={{ backgroundColor: cell.background || undefined }}
                          >
                            <textarea
                              value={cell.html}
                              onChange={event => setCellValue(rIdx, cIdx, { html: event.target.value })}
                              onFocus={() => setCursor({ row: rIdx, cell: cIdx })}
                              rows={2}
                              aria-label={`Row ${rIdx + 1} column ${cIdx + 1}`}
                              className={clsx(
                                'block w-full resize-y bg-transparent px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-200',
                                isHeader && 'font-semibold',
                                cell.align === 'center' && 'text-center',
                                cell.align === 'right' && 'text-right'
                              )}
                              placeholder={isHeader ? 'Heading' : isFooter ? 'Footer' : 'Cell'}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[11.5px] text-gray-500">
              {rows.length} row{rows.length === 1 ? '' : 's'} × {cols} column{cols === 1 ? '' : 's'}
              {selection.length > 1 && (
                <>
                  {' · '}
                  <Pill tone="blue">{selection.length} cells selected</Pill>
                </>
              )}
            </p>
          </div>

          <aside className="space-y-3 rounded-xl bg-gray-50 p-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">Table</p>
            <ToggleInput
              label="Header row"
              value={block.headerRow}
              onChange={value => patch({ headerRow: value })}
              hint="Rendered with th cells for screen readers."
            />
            <ToggleInput label="Footer row" value={block.footerRow} onChange={value => patch({ footerRow: value })} />
            <SelectInput
              label="Table width"
              value={String(block.widthPct)}
              onChange={value => patch({ widthPct: Number(value) })}
              options={[
                { value: '100', label: 'Full width' },
                { value: '75', label: '75%' },
                { value: '50', label: '50%' },
              ]}
            />
            <SelectInput
              label="On mobile"
              value={block.mobileStrategy}
              onChange={value => patch({ mobileStrategy: value as TableBlock['mobileStrategy'] })}
              options={[
                { value: 'scroll', label: 'Allow horizontal scroll' },
                { value: 'stack', label: 'Stack cells vertically' },
              ]}
              hint="Stacking is safer for wide tables on phones."
            />
            <ColorInput
              label="Header background"
              value={block.headerBackground || null}
              onChange={value => patch({ headerBackground: value })}
              palette={palette} allowAutomatic automaticLabel="Inherit"
            />
            <ColorInput
              label="Alternate row colour"
              value={block.alternateRowColor || null}
              onChange={value => patch({ alternateRowColor: value })}
              palette={palette} allowAutomatic automaticLabel="Inherit"
            />
            <SpacingInput label="Cell padding" value={block.cellPadding} onChange={value => patch({ cellPadding: value })} />

            <div className="border-t border-gray-200 pt-3">
              <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                {selection.length > 1 ? 'Selected cells' : 'Selected cell'}
              </p>
              <div className="mb-2 flex items-center gap-1">
                {(['left', 'center', 'right'] as Align[]).map(align => (
                  <ToolbarAction
                    key={align}
                    label={`Align ${align}`}
                    active={activeCell?.align === align}
                    onClick={() => applyToSelection({ align })}
                    icon={
                      align === 'left' ? (
                        <AlignLeft size={12} />
                      ) : align === 'center' ? (
                        <AlignCenter size={12} />
                      ) : (
                        <AlignRight size={12} />
                      )
                    }
                  />
                ))}
              </div>
              <SelectInput
                label="Vertical alignment"
                value={activeCell?.vAlign || 'middle'}
                onChange={value => applyToSelection({ vAlign: value as VAlign })}
                options={[
                  { value: 'top', label: 'Top' },
                  { value: 'middle', label: 'Middle' },
                  { value: 'bottom', label: 'Bottom' },
                ]}
              />
              <div className="mt-2">
                <ColorInput
                  label="Cell background"
                  value={activeCell?.background || null}
                  onChange={value => applyToSelection({ background: value })}
                  palette={palette} allowAutomatic automaticLabel="Inherit"
                />
              </div>
            </div>
          </aside>
        </div>
      )}
    </Dialog>
  );
}

function ToolbarAction({
  icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={clsx(
        'inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        active ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-white'
      )}
    >
      {icon}
    </button>
  );
}
