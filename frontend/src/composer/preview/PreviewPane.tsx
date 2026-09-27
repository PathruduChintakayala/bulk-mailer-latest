/**
 * Preview pane: device controls, zoom, recipient navigation, optional client
 * header chrome and the plain-text view (spec 19).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  ImageOff,
  Image as ImageIcon,
  Info,
  Maximize,
  Monitor,
  Moon,
  RefreshCw,
  Search,
  Smartphone,
  Sun,
  Tablet,
  Type,
  User,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Pill, Popover, Segmented, Spinner, ToolButton, ToolbarDivider, InlineEmpty } from '../ui/primitives';
import { previewWidthFor, usePreferences, type PreviewDevice } from '../store/preferences';
import { useComposer, relativeTime } from '../store/composerStore';
import * as composerApi from '../api/composerApi';
import { PreviewFrame } from './PreviewFrame';
import type { RecipientPreviewResponse } from '../api/types';

export function PreviewPane({ onSelectNode }: { onSelectNode?: (nodeId: string) => void }) {
  const { prefs, set: setPref, patch } = usePreferences();
  const {
    compiled,
    compiling,
    lastGoodHtml,
    lastGoodAt,
    previewStale,
    compileError,
    requestCompile,
    subject,
    preheader,
    sender,
    targetType,
    targetCode,
    recipientCount,
    kind,
    doc,
    htmlSource,
    themeCode,
    mergeDefs,
    plainText,
    plainTextMode,
  } = useComposer();

  const [recipientIndex, setRecipientIndex] = useState(0);
  const [recipientPreview, setRecipientPreview] = useState<RecipientPreviewResponse | null>(null);
  const [recipientMode, setRecipientMode] = useState(false);
  const [loadingRecipient, setLoadingRecipient] = useState(false);
  const [blockedLink, setBlockedLink] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [availableWidth, setAvailableWidth] = useState(900);

  const targetWidth = previewWidthFor(prefs);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) setAvailableWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const effectiveZoom = useMemo(() => {
    if (!prefs.previewFit) return prefs.previewZoom;
    const usable = Math.max(240, availableWidth - 48);
    return Math.min(1, Math.round((usable / targetWidth) * 100) / 100);
  }, [prefs.previewFit, prefs.previewZoom, availableWidth, targetWidth]);

  const loadRecipient = useCallback(
    async (index: number) => {
      if (targetType !== 'campaign' || !targetCode) return;
      setLoadingRecipient(true);
      try {
        const response = await composerApi.previewWithRecipient({
          target_type: targetType,
          target_code: targetCode,
          recipient_index: index,
          kind,
          document: kind === 'visual' ? doc : null,
          html_source: kind === 'custom_html' ? htmlSource : null,
          subject,
          preheader,
          theme_code: themeCode,
          merge_field_definitions: mergeDefs,
          plain_text: plainTextMode === 'manual' ? plainText : null,
          plain_text_mode: plainTextMode,
        });
        setRecipientPreview(response);
        setRecipientIndex(response.recipient?.index ?? index);
      } catch {
        setRecipientPreview(null);
      } finally {
        setLoadingRecipient(false);
      }
    },
    [targetType, targetCode, kind, doc, htmlSource, subject, preheader, themeCode, mergeDefs, plainText, plainTextMode]
  );

  useEffect(() => {
    if (recipientMode) void loadRecipient(recipientIndex);
    // Re-resolving on every keystroke would be wasteful; the compile cycle drives it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientMode, compiled?.at]);

  const html = recipientMode && recipientPreview ? recipientPreview.html : compiled?.html || lastGoodHtml;
  const shownPlainText = recipientMode && recipientPreview ? recipientPreview.plain_text : compiled?.plainText || plainText;
  const shownSubject = recipientMode && recipientPreview ? recipientPreview.subject : subject;
  const shownPreheader = recipientMode && recipientPreview ? recipientPreview.preheader : preheader;

  const deviceOptions: { value: PreviewDevice; label: string; icon: JSX.Element; title: string }[] = [
    { value: 'desktop', label: 'Desktop', icon: <Monitor size={13} />, title: 'Desktop, 700px' },
    { value: 'tablet', label: 'Tablet', icon: <Tablet size={13} />, title: 'Tablet, 600px' },
    { value: 'mobile', label: 'Mobile', icon: <Smartphone size={13} />, title: 'Mobile, 375px' },
    { value: 'custom', label: 'Custom', icon: <Type size={13} />, title: 'Custom width' },
  ];

  const popOut = () => {
    const target = window.open('', '_blank', 'width=820,height=900');
    if (!target) return;
    target.document.open();
    target.document.write(html || '<p>Nothing to preview.</p>');
    target.document.close();
    target.document.title = `Preview — ${shownSubject || 'Untitled'}`;
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-gray-100" aria-label="Email preview">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-gray-200 bg-white px-2.5 py-1.5">
        <Segmented
          label="Preview device"
          size="sm"
          value={prefs.previewDevice}
          onChange={value => setPref('previewDevice', value)}
          options={deviceOptions}
        />

        {prefs.previewDevice === 'custom' && (
          <label className="inline-flex items-center gap-1 text-[11px] text-gray-600">
            <span className="sr-only">Custom preview width</span>
            <input
              type="number"
              min={280}
              max={1400}
              value={prefs.previewCustomWidth}
              onChange={event => setPref('previewCustomWidth', Number(event.target.value) || 700)}
              className="w-16 rounded-md border border-gray-200 px-1.5 py-1 text-center tabular-nums focus:border-brand-400 focus:outline-none"
            />
            px
          </label>
        )}

        <ToolbarDivider />

        <ToolButton
          size="sm"
          icon={<ZoomOut size={13} />}
          label="Zoom out"
          disabled={prefs.previewFit}
          onClick={() => patch({ previewZoom: Math.max(0.25, Math.round((prefs.previewZoom - 0.1) * 100) / 100) })}
        />
        <span className="min-w-9 text-center text-[11px] tabular-nums text-gray-600">
          {Math.round(effectiveZoom * 100)}%
        </span>
        <ToolButton
          size="sm"
          icon={<ZoomIn size={13} />}
          label="Zoom in"
          disabled={prefs.previewFit}
          onClick={() => patch({ previewZoom: Math.min(2, Math.round((prefs.previewZoom + 0.1) * 100) / 100) })}
        />
        <ToolButton
          size="sm"
          icon={<Maximize size={13} />}
          label={prefs.previewFit ? 'Show at actual size' : 'Fit to the available width'}
          active={prefs.previewFit}
          onClick={() => patch({ previewFit: !prefs.previewFit, previewZoom: 1 })}
        />

        <ToolbarDivider />

        <ToolButton
          size="sm"
          icon={prefs.previewImagesEnabled ? <ImageIcon size={13} /> : <ImageOff size={13} />}
          label={prefs.previewImagesEnabled ? 'Simulate blocked images' : 'Show images'}
          active={!prefs.previewImagesEnabled}
          onClick={() => setPref('previewImagesEnabled', !prefs.previewImagesEnabled)}
        />
        <ToolButton
          size="sm"
          icon={prefs.previewDarkSimulation ? <Moon size={13} /> : <Sun size={13} />}
          label={prefs.previewDarkSimulation ? 'Show light appearance' : 'Simulate dark mode'}
          active={prefs.previewDarkSimulation}
          onClick={() => setPref('previewDarkSimulation', !prefs.previewDarkSimulation)}
        />

        <ToolbarDivider />

        <Segmented
          label="Preview content"
          size="sm"
          value={prefs.previewContent}
          onChange={value => setPref('previewContent', value)}
          options={[
            { value: 'html', label: 'HTML' },
            { value: 'plain', label: 'Plain text' },
          ]}
        />

        <div className="flex-1" />

        {targetType === 'campaign' && recipientCount > 0 && (
          <ToolButton
            size="sm"
            icon={<User size={13} />}
            label={recipientMode ? 'Use template example data' : 'Preview with recipient data'}
            showLabel
            active={recipientMode}
            onClick={() => setRecipientMode(value => !value)}
          />
        )}

        <ToolButton
          size="sm"
          icon={<Eye size={13} />}
          label={prefs.previewShowEmailHeader ? 'Hide the email header' : 'Show the email header'}
          active={prefs.previewShowEmailHeader}
          onClick={() => setPref('previewShowEmailHeader', !prefs.previewShowEmailHeader)}
        />
        <ToolButton size="sm" icon={<ExternalLink size={13} />} label="Open the preview in a new window" onClick={popOut} />
        <ToolButton
          size="sm"
          icon={compiling ? <Spinner size={13} /> : <RefreshCw size={13} />}
          label="Refresh the preview"
          onClick={() => requestCompile(true)}
        />
      </div>

      {/* Status strip */}
      {(previewStale || compileError || (compiled?.autoAppended?.length ?? 0) > 0 || (compiled?.removed?.length ?? 0) > 0) && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 bg-amber-50/70 px-3 py-1.5 text-[11px] text-amber-900">
          {compileError ? (
            <>
              <AlertTriangle size={12} className="shrink-0" />
              <span className="font-medium">{compileError}</span>
              <span className="text-amber-700">
                Showing the last successful render{lastGoodAt ? ` from ${relativeTime(lastGoodAt)}` : ''}.
              </span>
            </>
          ) : previewStale ? (
            <>
              <Info size={12} className="shrink-0" />
              <span>Out-of-date preview — refreshing…</span>
            </>
          ) : null}
          {!!compiled?.removed?.length && (
            <Pill tone="amber" title={compiled.removed.join(', ')}>
              {compiled.removed.length} unsupported construct{compiled.removed.length === 1 ? '' : 's'} removed
            </Pill>
          )}
          {!!compiled?.autoAppended?.length && (
            <Pill tone="blue" title={compiled.autoAppended.join(', ')}>
              Added by policy: {compiled.autoAppended.join(', ')}
            </Pill>
          )}
        </div>
      )}

      {/* Recipient navigator */}
      {recipientMode && (
        <RecipientNavigator
          preview={recipientPreview}
          loading={loadingRecipient}
          index={recipientIndex}
          total={recipientPreview?.total ?? recipientCount}
          onGo={index => void loadRecipient(index)}
        />
      )}

      {/* Body */}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto p-4">
        {prefs.previewContent === 'plain' ? (
          <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Plain-text alternative
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-relaxed text-gray-800">
              {shownPlainText || 'No plain-text version has been generated yet.'}
            </pre>
          </div>
        ) : (
          <div className="mx-auto" style={{ width: Math.min(targetWidth * effectiveZoom + 2, availableWidth) }}>
            {prefs.previewShowEmailHeader && (
              <EmailHeaderChrome
                from={sender?.from_name || sender?.from_email || 'Your organization'}
                fromEmail={sender?.from_email || 'not configured'}
                replyTo={sender?.reply_to || null}
                to={recipientPreview?.recipient?.email || 'recipient@example.com'}
                subject={shownSubject || '(no subject)'}
                preheader={shownPreheader || ''}
              />
            )}
            <div className="overflow-hidden rounded-b-xl border border-t-0 border-gray-200 bg-white shadow-sm">
              <PreviewFrame
                title="Email preview"
                html={html}
                width={targetWidth}
                zoom={effectiveZoom}
                imagesEnabled={prefs.previewImagesEnabled}
                darkSimulation={prefs.previewDarkSimulation}
                onSelectNode={onSelectNode}
                onLinkBlocked={setBlockedLink}
              />
            </div>
          </div>
        )}
      </div>

      {blockedLink !== null && (
        <div className="flex shrink-0 items-center gap-2 border-t border-gray-200 bg-blue-50 px-3 py-1.5 text-[11px] text-blue-900">
          <Info size={12} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            Links are not followed in the preview. This one points to <code className="font-mono">{blockedLink || '(empty)'}</code>.
          </span>
          <ToolButton size="sm" label="Dismiss" showLabel onClick={() => setBlockedLink(null)} />
        </div>
      )}
    </section>
  );
}

function EmailHeaderChrome({
  from,
  fromEmail,
  replyTo,
  to,
  subject,
  preheader,
}: {
  from: string;
  fromEmail: string;
  replyTo: string | null;
  to: string;
  subject: string;
  preheader: string;
}) {
  return (
    <div className="rounded-t-xl border border-gray-200 bg-gradient-to-b from-gray-50 to-white px-4 py-3">
      <p className="truncate text-[15px] font-semibold text-gray-900">{subject}</p>
      {preheader && <p className="mt-0.5 truncate text-[12px] text-gray-500">{preheader}</p>}
      <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-2 gap-y-0.5 text-[11px]">
        <dt className="text-gray-400">From</dt>
        <dd className="truncate text-gray-700">
          {from} <span className="text-gray-400">&lt;{fromEmail}&gt;</span>
        </dd>
        {replyTo && (
          <>
            <dt className="text-gray-400">Reply-to</dt>
            <dd className="truncate text-gray-700">{replyTo}</dd>
          </>
        )}
        <dt className="text-gray-400">To</dt>
        <dd className="truncate text-gray-700">{to}</dd>
      </dl>
    </div>
  );
}

function RecipientNavigator({
  preview,
  loading,
  index,
  total,
  onGo,
}: {
  preview: RecipientPreviewResponse | null;
  loading: boolean;
  index: number;
  total: number;
  onGo: (index: number) => void;
}) {
  const [jump, setJump] = useState('');
  const missing = preview?.missing_fields || [];
  const defaults = preview?.defaults_used || [];

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-3 py-1.5">
      <ToolButton
        size="sm"
        icon={<ChevronLeft size={13} />}
        label="Previous recipient"
        disabled={loading || index <= 0}
        onClick={() => onGo(index - 1)}
      />
      <span className="text-[11px] tabular-nums text-gray-600">
        Row {index + 1} of {total || '—'}
      </span>
      <ToolButton
        size="sm"
        icon={<ChevronRight size={13} />}
        label="Next recipient"
        disabled={loading || !preview?.has_next}
        onClick={() => onGo(index + 1)}
      />

      <form
        className="flex items-center gap-1"
        onSubmit={event => {
          event.preventDefault();
          const parsed = Number(jump);
          if (Number.isFinite(parsed) && parsed >= 1) onGo(Math.floor(parsed) - 1);
        }}
      >
        <label className="sr-only" htmlFor="recipient-jump">
          Go to row
        </label>
        <input
          id="recipient-jump"
          value={jump}
          onChange={event => setJump(event.target.value)}
          placeholder="Row"
          className="w-14 rounded-md border border-gray-200 px-1.5 py-1 text-center text-[11px] tabular-nums focus:border-brand-400 focus:outline-none"
        />
        <ToolButton size="sm" icon={<Search size={12} />} label="Go to this row" type="submit" />
      </form>

      {preview?.recipient && (
        <span className="min-w-0 truncate text-[11px] text-gray-700" title={preview.recipient.email}>
          {preview.recipient.email}
        </span>
      )}

      {loading && <Spinner size={12} className="text-gray-400" />}

      <div className="flex-1" />

      {!!defaults.length && (
        <Popover
          label="Fields using defaults"
          width={260}
          trigger={({ toggle, ref }) => (
            <span ref={node => ref(node)} className="inline-flex">
              <button
                type="button"
                onClick={toggle}
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-blue-600/10"
              >
                {defaults.length} default{defaults.length === 1 ? '' : 's'} used
              </button>
            </span>
          )}
        >
          <ul className="space-y-1 text-[12px] text-gray-700">
            {defaults.map(key => (
              <li key={key} className="font-mono">
                {key}
              </li>
            ))}
          </ul>
        </Popover>
      )}

      {!!missing.length && (
        <Popover
          label="Fields with no value"
          width={260}
          trigger={({ toggle, ref }) => (
            <span ref={node => ref(node)} className="inline-flex">
              <button
                type="button"
                onClick={toggle}
                className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-red-600/10"
              >
                <AlertTriangle size={11} />
                {missing.length} missing
              </button>
            </span>
          )}
        >
          <ul className="space-y-1 text-[12px] text-gray-700">
            {missing.map(key => (
              <li key={key} className="font-mono">
                {key}
              </li>
            ))}
          </ul>
        </Popover>
      )}

      {preview && Object.keys(preview.resolved_values).length > 0 && (
        <Popover
          label="Resolved field values"
          width={320}
          align="end"
          trigger={({ toggle, ref }) => (
            <span ref={node => ref(node)} className="inline-flex">
              <ToolButton size="sm" label="Resolved values" showLabel onClick={toggle} />
            </span>
          )}
        >
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-left text-[11.5px]">
              <thead>
                <tr className="text-gray-400">
                  <th className="pb-1 font-medium">Field</th>
                  <th className="pb-1 font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Object.entries(preview.resolved_values).map(([key, value]) => (
                  <tr key={key}>
                    <td className="py-1 pr-2 font-mono text-gray-600">{key}</td>
                    <td className="py-1 text-gray-900">
                      {value || <span className="italic text-gray-400">empty</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Popover>
      )}

      {!preview && !loading && (
        <div className="w-full pt-1">
          <InlineEmpty title="No recipient data" description="Upload recipients to preview real values." />
        </div>
      )}
    </div>
  );
}
