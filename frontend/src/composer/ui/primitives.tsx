/** Small, accessible building blocks shared by every composer surface. */

import {
  ButtonHTMLAttributes,
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';

// ── ToolButton ────────────────────────────────────────────────────────────────

export interface ToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
  label: string;
  /** Show the label beside the icon instead of only in the tooltip. */
  showLabel?: boolean;
  active?: boolean;
  danger?: boolean;
  size?: 'sm' | 'md';
  shortcut?: string;
  tone?: 'default' | 'subtle';
}

export function ToolButton({
  icon,
  label,
  showLabel = false,
  active = false,
  danger = false,
  size = 'md',
  shortcut,
  tone = 'default',
  className,
  ...rest
}: ToolButtonProps) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      title={title}
      aria-label={showLabel ? undefined : label}
      aria-pressed={rest['aria-pressed'] ?? (active || undefined)}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        size === 'sm' ? 'h-7 min-w-7 px-1.5 text-xs' : 'h-8 min-w-8 px-2 text-[13px]',
        showLabel && (size === 'sm' ? 'px-2' : 'px-2.5'),
        danger
          ? 'text-red-600 hover:bg-red-50'
          : active
            ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200'
            : tone === 'subtle'
              ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
              : 'text-gray-700 hover:bg-gray-100',
        className
      )}
      {...rest}
    >
      {icon}
      {showLabel && <span className="whitespace-nowrap">{label}</span>}
    </button>
  );
}

export function ToolbarDivider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-gray-200" aria-hidden="true" />;
}

export function ToolbarGroup({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label={label}>
      {children}
    </div>
  );
}

// ── Popover ───────────────────────────────────────────────────────────────────

interface PopoverContextValue {
  close: () => void;
}
const PopoverContext = createContext<PopoverContextValue>({ close: () => {} });
export const usePopoverContext = () => useContext(PopoverContext);

export interface PopoverProps {
  trigger: (props: { open: boolean; toggle: () => void; ref: (node: HTMLElement | null) => void }) => ReactNode;
  children: ReactNode;
  align?: 'start' | 'end' | 'center';
  width?: number;
  /** Accessible label for the popover surface. */
  label: string;
}

export function Popover({ trigger, children, align = 'start', width = 260, label }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const anchorRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const id = useId();

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const panelWidth = width;
    let left = rect.left;
    if (align === 'end') left = rect.right - panelWidth;
    if (align === 'center') left = rect.left + rect.width / 2 - panelWidth / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8));
    const estimatedHeight = panelRef.current?.offsetHeight ?? 240;
    const below = rect.bottom + 6;
    const top = below + estimatedHeight > window.innerHeight - 8 ? Math.max(8, rect.top - estimatedHeight - 6) : below;
    setPosition({ top, left });
  }, [align, width]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onScroll = () => place();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        anchorRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {trigger({
        open,
        toggle: () => setOpen(value => !value),
        ref: node => {
          anchorRef.current = node;
        },
      })}
      {open &&
        createPortal(
          <PopoverContext.Provider value={{ close }}>
            <div
              ref={panelRef}
              id={id}
              role="dialog"
              aria-label={label}
              style={{ top: position.top, left: position.left, width }}
              className="fixed z-[70] rounded-xl border border-gray-200 bg-white p-3 shadow-xl"
            >
              {children}
            </div>
          </PopoverContext.Provider>,
          document.body
        )}
    </>
  );
}

// ── Menu ──────────────────────────────────────────────────────────────────────

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  description?: string;
  onSelect?: () => void;
  /** Renders a labelled separator above this item. */
  groupLabel?: string;
}

export function Menu({
  items,
  label,
  trigger,
  align = 'end',
  width = 240,
}: {
  items: MenuItem[];
  label: string;
  trigger: (props: { open: boolean; toggle: () => void; ref: (node: HTMLElement | null) => void }) => ReactNode;
  align?: 'start' | 'end' | 'center';
  width?: number;
}) {
  return (
    <Popover trigger={trigger} align={align} width={width} label={label}>
      <MenuList items={items} />
    </Popover>
  );
}

function MenuList({ items }: { items: MenuItem[] }) {
  const { close } = usePopoverContext();
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const first = listRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])');
    first?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || []);
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div ref={listRef} role="menu" className="-m-1 flex flex-col" onKeyDown={onKeyDown}>
      {items.map(item => (
        <div key={item.id}>
          {item.groupLabel && (
            <div className="mt-1 border-t border-gray-100 px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 first:mt-0 first:border-0 first:pt-1">
              {item.groupLabel}
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect?.();
              close();
            }}
            className={clsx(
              'flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              item.disabled
                ? 'cursor-not-allowed text-gray-300'
                : item.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-gray-700 hover:bg-gray-100'
            )}
          >
            {item.icon && <span className="mt-0.5 shrink-0">{item.icon}</span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.label}</span>
              {item.description && <span className="block text-[11px] text-gray-500">{item.description}</span>}
            </span>
            {item.shortcut && <kbd className="mt-0.5 shrink-0 text-[10px] text-gray-400">{item.shortcut}</kbd>}
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Segmented ─────────────────────────────────────────────────────────────────

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
  fullWidth = false,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode; title?: string }[];
  onChange: (value: T) => void;
  label: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={clsx(
        'inline-flex items-center gap-0.5 rounded-lg bg-gray-100 p-0.5',
        fullWidth && 'flex w-full'
      )}
    >
      {options.map(option => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.title || option.label}
            onClick={() => onChange(option.value)}
            className={clsx(
              'inline-flex items-center justify-center gap-1.5 rounded-[7px] font-medium transition-all',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-xs',
              fullWidth && 'flex-1',
              selected ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            )}
          >
            {option.icon}
            <span className="truncate">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Disclosure ────────────────────────────────────────────────────────────────

export function Disclosure({
  title,
  children,
  defaultOpen = true,
  right,
  dense = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  right?: ReactNode;
  dense?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  return (
    <section className="border-b border-gray-100 last:border-b-0">
      <div className="flex items-center gap-1 pr-2">
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className={clsx(
            'flex min-w-0 flex-1 items-center gap-1.5 text-left text-[12px] font-semibold uppercase tracking-wide text-gray-500',
            'transition-colors hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
            dense ? 'px-3 py-2' : 'px-3 py-2.5'
          )}
        >
          <ChevronDown size={13} className={clsx('shrink-0 transition-transform', !open && '-rotate-90')} />
          <span className="truncate">{title}</span>
        </button>
        {right}
      </div>
      {open && (
        <div id={panelId} className={clsx('space-y-3 px-3', dense ? 'pb-2.5' : 'pb-3.5')}>
          {children}
        </div>
      )}
    </section>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────

export function Pill({
  tone = 'gray',
  children,
  icon,
  title,
}: {
  tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'violet';
  children: ReactNode;
  icon?: ReactNode;
  title?: string;
}) {
  const tones: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-600 ring-gray-500/10',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
    amber: 'bg-amber-50 text-amber-700 ring-amber-600/10',
    red: 'bg-red-50 text-red-700 ring-red-600/10',
    blue: 'bg-blue-50 text-blue-700 ring-blue-600/10',
    violet: 'bg-accent-50 text-accent-700 ring-accent-600/10',
  };
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1',
        tones[tone]
      )}
    >
      {icon}
      {children}
    </span>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function InlineEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center">
      {icon && <div className="text-gray-400">{icon}</div>}
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {description && <p className="max-w-xs text-xs text-gray-500">{description}</p>}
      {action}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={clsx('animate-spin', className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Announce transient status changes to assistive technology. */
export function LiveRegion({ message }: { message: string | null }) {
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {message || ''}
    </div>
  );
}
