/**
 * Command menu (spec 27.1).
 *
 * Every action the header, panels and dialogs expose is reachable from the keyboard so
 * the composer can be driven without hunting through menus.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Command, Search } from 'lucide-react';

export interface PaletteCommand {
  id: string;
  label: string;
  group: string;
  keywords?: string;
  shortcut?: string;
  icon?: ReactNode;
  disabled?: boolean;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
}) {
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    setTerm('');
    setActive(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 10);
    return () => {
      clearTimeout(timer);
      restoreRef.current?.focus?.();
    };
  }, [open]);

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const available = commands.filter(command => !command.disabled);
    if (!needle) return available;
    return available.filter(command =>
      `${command.label} ${command.group} ${command.keywords || ''}`.toLowerCase().includes(needle)
    );
  }, [commands, term]);

  useEffect(() => {
    setActive(0);
  }, [term]);

  useEffect(() => {
    const item = listRef.current?.children[active] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const grouped = filtered.reduce<Record<string, PaletteCommand[]>>((acc, command) => {
    acc[command.group] = acc[command.group] || [];
    acc[command.group].push(command);
    return acc;
  }, {});

  let index = -1;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-gray-900/30 backdrop-blur-[1px]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-gray-900/10"
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive(current => Math.min(filtered.length - 1, current + 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(current => Math.max(0, current - 1));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            const command = filtered[active];
            if (command) {
              onClose();
              command.run();
            }
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
          <Search size={15} className="shrink-0 text-gray-400" />
          <input
            ref={inputRef}
            value={term}
            onChange={event => setTerm(event.target.value)}
            placeholder="Search commands"
            aria-label="Search commands"
            className="min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
          <span className="hidden items-center gap-1 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 sm:inline-flex">
            <Command size={9} />
            K
          </span>
        </div>

        <ul ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5" role="listbox" aria-label="Commands">
          {filtered.length ? (
            Object.entries(grouped).map(([group, entries]) => (
              <li key={group}>
                <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{group}</p>
                <ul>
                  {entries.map(command => {
                    index += 1;
                    const current = index;
                    return (
                      <li key={command.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active === current}
                          onMouseEnter={() => setActive(current)}
                          onClick={() => {
                            onClose();
                            command.run();
                          }}
                          className={clsx(
                            'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors',
                            active === current ? 'bg-brand-50 text-brand-900' : 'text-gray-700 hover:bg-gray-50'
                          )}
                        >
                          <span className="shrink-0 text-gray-400">{command.icon}</span>
                          <span className="min-w-0 flex-1 truncate">{command.label}</span>
                          {command.shortcut && (
                            <span className="shrink-0 rounded border border-gray-200 px-1 py-0.5 text-[10px] font-medium text-gray-500">
                              {command.shortcut}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          ) : (
            <li className="px-3 py-6 text-center text-[12.5px] text-gray-500">No commands match “{term}”.</li>
          )}
        </ul>
      </div>
    </div>,
    document.body
  );
}
