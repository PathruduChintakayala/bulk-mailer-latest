/**
 * Composer header (spec 2.1 and 2.2).
 *
 * Name, breadcrumbs, save state, undo/redo, test send, save options, the
 * prominent Visual/HTML mode switch and the compose/preview layout control.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudOff,
  Code2,
  Columns2,
  Copy,
  Eye,
  FileCode2,
  FileText,
  History,
  LayoutPanelLeft,
  Maximize2,
  Minimize2,
  MonitorSmartphone,
  MoreHorizontal,
  Paintbrush,
  Redo2,
  RefreshCw,
  Rows2,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  SquareSplitHorizontal,
  SquareSplitVertical,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import { Menu, MenuItem, Pill, Popover, Spinner, ToolButton, ToolbarDivider } from '../ui/primitives';
import { saveStatusLabel, useComposer, type SaveStatus } from '../store/composerStore';
import { LAYOUTS, LayoutId, usePreferences } from '../store/preferences';

const LAYOUT_ICONS: Record<LayoutId, JSX.Element> = {
  'compose-only': <Square size={14} />,
  'preview-only': <Eye size={14} />,
  'compose-left': <SquareSplitHorizontal size={14} />,
  'compose-right': <Columns2 size={14} />,
  'compose-above': <SquareSplitVertical size={14} />,
  'compose-below': <Rows2 size={14} />,
};

function SaveIndicator({ status, lastSavedAt, message }: { status: SaveStatus; lastSavedAt: number | null; message: string | null }) {
  // Re-render every 30s so "Saved 2m ago" stays truthful.
  const [, force] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => force(value => value + 1), 30000);
    return () => clearInterval(timer);
  }, []);

  const label = saveStatusLabel(status, lastSavedAt);
  const config: Record<SaveStatus, { tone: Parameters<typeof Pill>[0]['tone']; icon: JSX.Element }> = {
    clean: { tone: 'gray', icon: <Cloud size={11} /> },
    dirty: { tone: 'amber', icon: <Cloud size={11} /> },
    saving: { tone: 'blue', icon: <Spinner size={11} /> },
    saved: { tone: 'green', icon: <Check size={11} /> },
    failed: { tone: 'red', icon: <AlertTriangle size={11} /> },
    offline: { tone: 'amber', icon: <CloudOff size={11} /> },
    conflict: { tone: 'red', icon: <Users size={11} /> },
    blocked: { tone: 'red', icon: <ShieldCheck size={11} /> },
  };
  const { tone, icon } = config[status];

  return (
    <Pill tone={tone} icon={icon} title={message || label}>
      {label}
    </Pill>
  );
}

export function ComposerHeader({
  onOpenTestSend,
  onOpenReview,
  onOpenHistory,
  onOpenTheme,
  onOpenMergeFields,
  onOpenSaveAsTemplate,
  onOpenAttachments,
  onClose,
}: {
  onOpenTestSend: () => void;
  onOpenReview: () => void;
  onOpenHistory: () => void;
  onOpenTheme: () => void;
  onOpenMergeFields: () => void;
  onOpenSaveAsTemplate: () => void;
  onOpenAttachments: () => void;
  onClose: () => void;
}) {
  const {
    targetType,
    targetName,
    targetStatus,
    breadcrumb,
    saveStatus,
    saveMessage,
    lastSavedAt,
    canEdit,
    lockedReason,
    kind,
    revisionNo,
    compiling,
    compiled,
    setTargetName,
    save,
    publish,
    undo,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    can,
    forkToHtml,
    requestCompile,
  } = useComposer();
  const { prefs, set: setPref } = usePreferences();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(targetName);
  useEffect(() => setNameDraft(targetName), [targetName]);

  const summary = compiled?.validation?.summary;
  const problemCount = (summary?.blockers || 0) + (summary?.errors || 0);
  const warningCount = summary?.warnings || 0;

  const saveMenu: MenuItem[] = [
    { id: 'save', label: 'Save', shortcut: 'Ctrl+S', icon: <Save size={14} />, onSelect: () => void save() },
    {
      id: 'save-continue',
      label: 'Save and continue editing',
      icon: <Check size={14} />,
      onSelect: () => void save({ summary: 'Saved and continued editing' }),
    },
    {
      id: 'save-close',
      label: 'Save and close',
      icon: <X size={14} />,
      onSelect: async () => {
        const ok = await save();
        if (ok) onClose();
      },
    },
    {
      id: 'publish',
      label: 'Publish revision',
      description: 'Freeze this revision so campaigns can use it.',
      icon: <ShieldCheck size={14} />,
      disabled: !can('publish_templates'),
      groupLabel: 'Release',
      onSelect: () => void publish('Published from the composer'),
    },
    {
      id: 'save-as-template',
      label: 'Save as new template',
      icon: <Copy size={14} />,
      disabled: !can('create_templates'),
      groupLabel: 'Copy',
      onSelect: onOpenSaveAsTemplate,
    },
  ];

  const moreMenu: MenuItem[] = [
    { id: 'review', label: 'Review and validation', icon: <ShieldCheck size={14} />, onSelect: onOpenReview },
    { id: 'history', label: 'Version history', icon: <History size={14} />, onSelect: onOpenHistory },
    { id: 'theme', label: 'Theme and brand', icon: <Paintbrush size={14} />, onSelect: onOpenTheme },
    { id: 'merge', label: 'Merge fields', icon: <Sparkles size={14} />, onSelect: onOpenMergeFields },
    ...(targetType === 'campaign'
      ? [{ id: 'attachments', label: 'Attachments', icon: <FileText size={14} />, onSelect: onOpenAttachments }]
      : []),
    {
      id: 'fork',
      label: 'Switch to custom HTML',
      description: 'Makes HTML canonical; visual editing becomes unavailable.',
      icon: <FileCode2 size={14} />,
      disabled: kind === 'custom_html' || !can('use_custom_html'),
      groupLabel: 'Advanced',
      onSelect: () => {
        const proceed = window.confirm(
          'Editing the generated HTML creates a Custom HTML revision.\n\n' +
            'The current visual revision is preserved and can be restored from version history, ' +
            'but the visual editor will no longer be available for this content.\n\nContinue?'
        );
        if (proceed) void forkToHtml();
      },
    },
    {
      id: 'reset-prefs',
      label: 'Reset editor preferences',
      icon: <RefreshCw size={14} />,
      onSelect: () => usePreferences.getState().reset(),
    },
  ];

  return (
    <header className="z-30 shrink-0 border-b border-gray-200 bg-white">
      {/* Row 1: identity, status, actions */}
      <div className="flex h-14 items-center gap-3 px-3">
        <ToolButton
          icon={<ArrowLeft size={16} />}
          label="Close the composer"
          onClick={onClose}
          className="shrink-0"
        />

        <div className="min-w-0 flex-1">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[11px] text-gray-500">
            {breadcrumb.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={10} className="text-gray-300" />}
                {crumb.to ? (
                  <Link to={crumb.to} className="truncate hover:text-brand-700 hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="truncate">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                aria-label={targetType === 'template' ? 'Template name' : 'Campaign name'}
                onChange={event => setNameDraft(event.target.value)}
                onBlur={() => {
                  setEditingName(false);
                  if (nameDraft.trim() && nameDraft !== targetName) setTargetName(nameDraft.trim());
                  else setNameDraft(targetName);
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') {
                    setNameDraft(targetName);
                    setEditingName(false);
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-brand-300 px-1.5 py-0.5 font-display text-[15px] font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            ) : (
              <button
                type="button"
                onClick={() => canEdit && targetType === 'template' && setEditingName(true)}
                disabled={!canEdit || targetType !== 'template'}
                title={targetType === 'template' ? 'Rename this template' : undefined}
                className={clsx(
                  'min-w-0 truncate font-display text-[15px] font-bold leading-tight text-gray-900',
                  canEdit && targetType === 'template' && 'rounded px-0.5 hover:bg-gray-100'
                )}
              >
                {targetName || 'Untitled'}
              </button>
            )}
            <Pill tone={targetStatus === 'published' ? 'green' : targetStatus === 'draft' ? 'gray' : 'blue'}>
              {targetStatus}
            </Pill>
            <Pill tone="gray" title="Working revision number">
              Rev {revisionNo}
            </Pill>
            {kind === 'custom_html' && (
              <Pill tone="violet" icon={<Code2 size={11} />} title="HTML is canonical for this revision">
                Custom HTML
              </Pill>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <SaveIndicator status={saveStatus} lastSavedAt={lastSavedAt} message={saveMessage} />

          <button
            type="button"
            onClick={onOpenReview}
            title="Open the review and validation dashboard"
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium ring-1 transition-colors',
              problemCount
                ? 'bg-red-50 text-red-700 ring-red-600/10 hover:bg-red-100'
                : warningCount
                  ? 'bg-amber-50 text-amber-700 ring-amber-600/10 hover:bg-amber-100'
                  : 'bg-emerald-50 text-emerald-700 ring-emerald-600/10 hover:bg-emerald-100'
            )}
          >
            {compiling ? <Spinner size={11} /> : <ShieldCheck size={12} />}
            {problemCount ? `${problemCount} to fix` : warningCount ? `${warningCount} warning${warningCount === 1 ? '' : 's'}` : 'Checks passed'}
          </button>

          <ToolbarDivider />

          <ToolButton
            icon={<Undo2 size={15} />}
            label={canUndo() ? `Undo ${undoLabel()}` : 'Nothing to undo'}
            shortcut="Ctrl+Z"
            disabled={!canUndo()}
            onClick={undo}
          />
          <ToolButton
            icon={<Redo2 size={15} />}
            label={canRedo() ? `Redo ${redoLabel()}` : 'Nothing to redo'}
            shortcut="Ctrl+Y"
            disabled={!canRedo()}
            onClick={redo}
          />

          <ToolbarDivider />

          <ToolButton
            icon={<Send size={14} />}
            label="Send a test"
            showLabel
            disabled={!can('send_test_emails')}
            onClick={onOpenTestSend}
          />

          <div className="flex items-center rounded-lg bg-brand-600 text-white shadow-sm">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!canEdit || saveStatus === 'saving'}
              className="inline-flex h-8 items-center gap-1.5 rounded-l-lg px-3 text-[13px] font-semibold transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50"
            >
              {saveStatus === 'saving' ? <Spinner size={13} /> : <Save size={14} />}
              Save
            </button>
            <Menu
              label="Save options"
              items={saveMenu}
              trigger={({ toggle, ref, open }) => (
                <button
                  type="button"
                  ref={node => ref(node)}
                  onClick={toggle}
                  aria-expanded={open}
                  aria-label="More save options"
                  disabled={!canEdit}
                  className="inline-flex h-8 w-7 items-center justify-center rounded-r-lg border-l border-white/25 transition-colors hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:opacity-50"
                >
                  <ChevronDown size={13} />
                </button>
              )}
            />
          </div>

          <Menu
            label="More actions"
            items={moreMenu}
            width={280}
            trigger={({ toggle, ref, open }) => (
              <span ref={node => ref(node)} className="inline-flex">
                <ToolButton
                  icon={<MoreHorizontal size={16} />}
                  label="More actions"
                  aria-expanded={open}
                  onClick={toggle}
                />
              </span>
            )}
          />
        </div>
      </div>

      {/* Row 2: mode switch, layout, workspace toggles */}
      <div className="flex h-11 items-center gap-2 border-t border-gray-100 bg-gray-50/60 px-3">
        <div
          role="radiogroup"
          aria-label="Editing mode"
          className="inline-flex items-center gap-1 rounded-xl bg-white p-1 ring-1 ring-gray-200"
        >
          <ModeButton
            active={prefs.mode === 'visual'}
            disabled={kind === 'custom_html'}
            icon={<LayoutPanelLeft size={14} />}
            label="Visual"
            title={
              kind === 'custom_html'
                ? 'This revision uses custom HTML, so the visual editor is unavailable.'
                : 'Structured, block-based editing'
            }
            onClick={() => setPref('mode', 'visual')}
          />
          <ModeButton
            active={prefs.mode === 'html'}
            icon={<Code2 size={14} />}
            label="HTML"
            title="Edit the HTML source with validation and IntelliSense"
            onClick={() => setPref('mode', 'html')}
          />
        </div>

        {kind === 'visual' && prefs.mode === 'html' && (
          <Pill tone="amber" icon={<AlertTriangle size={11} />} title="Generated HTML is read-only for visual templates">
            Generated HTML is read-only
          </Pill>
        )}

        <ToolbarDivider />

        <Popover
          label="Compose and preview layout"
          width={288}
          trigger={({ toggle, ref, open }) => (
            <button
              type="button"
              ref={node => ref(node)}
              onClick={toggle}
              aria-expanded={open}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] font-medium text-gray-700 transition-colors hover:border-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {LAYOUT_ICONS[prefs.layout]}
              {LAYOUTS.find(entry => entry.id === prefs.layout)?.label}
              <ChevronDown size={12} className="text-gray-400" />
            </button>
          )}
        >
          <LayoutPicker />
        </Popover>

        <ToolButton
          icon={<LayoutPanelLeft size={15} />}
          label={prefs.leftPanelOpen ? 'Hide the left panel' : 'Show the left panel'}
          active={prefs.leftPanelOpen}
          onClick={() => setPref('leftPanelOpen', !prefs.leftPanelOpen)}
        />
        <ToolButton
          icon={<MonitorSmartphone size={15} />}
          label={prefs.rightPanelOpen ? 'Hide the properties panel' : 'Show the properties panel'}
          active={prefs.rightPanelOpen}
          onClick={() => setPref('rightPanelOpen', !prefs.rightPanelOpen)}
        />

        <div className="flex-1" />

        {!canEdit && lockedReason && (
          <Pill tone="amber" icon={<AlertTriangle size={11} />}>
            {lockedReason}
          </Pill>
        )}

        <ToolButton
          icon={<RefreshCw size={14} className={compiling ? 'animate-spin' : undefined} />}
          label="Refresh the preview"
          onClick={() => requestCompile(true)}
        />
        <ToolButton
          icon={prefs.fullScreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          label={prefs.fullScreen ? 'Exit full screen' : 'Enter full screen'}
          shortcut="F11"
          active={prefs.fullScreen}
          onClick={() => setPref('fullScreen', !prefs.fullScreen)}
        />
      </div>
    </header>
  );
}

function ModeButton({
  active,
  icon,
  label,
  title,
  onClick,
  disabled,
}: {
  active: boolean;
  icon: JSX.Element;
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-all',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        disabled && 'cursor-not-allowed opacity-40',
        active ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function LayoutPicker() {
  const { prefs, set } = usePreferences();
  return (
    <div className="space-y-1">
      <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        Compose and preview
      </p>
      {LAYOUTS.map(layout => (
        <button
          key={layout.id}
          type="button"
          onClick={() => set('layout', layout.id)}
          aria-pressed={prefs.layout === layout.id}
          className={clsx(
            'flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
            prefs.layout === layout.id ? 'bg-brand-50 text-brand-800' : 'text-gray-700 hover:bg-gray-100'
          )}
        >
          <span className="mt-0.5 shrink-0">{LAYOUT_ICONS[layout.id]}</span>
          <span className="min-w-0">
            <span className="block text-[12.5px] font-medium">{layout.label}</span>
            <span className="block text-[10.5px] text-gray-500">{layout.description}</span>
          </span>
          {prefs.layout === layout.id && <Check size={13} className="ml-auto mt-0.5 shrink-0 text-brand-600" />}
        </button>
      ))}
    </div>
  );
}
