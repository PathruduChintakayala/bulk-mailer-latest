/**
 * Link editor (spec 9).
 *
 * Supports every allowed destination type, validates URL safety before the value
 * can be applied, and offers a test-open that never runs inside the editor frame.
 */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Braces, ExternalLink, Trash2 } from 'lucide-react';
import type { LinkSpec, LinkType } from '../model/document';
import { Dialog, DialogButton } from '../ui/Dialog';
import { SelectInput, TextInput, ToggleInput } from '../ui/controls';
import { SYSTEM_LINK_TOKENS, isSafeUrl, linkHref } from '../visual/styles';

const TYPE_OPTIONS: { value: LinkType; label: string; group: string }[] = [
  { value: 'url', label: 'Web address (https)', group: 'Destinations' },
  { value: 'email', label: 'Email address', group: 'Destinations' },
  { value: 'tel', label: 'Phone number', group: 'Destinations' },
  { value: 'merge', label: 'From a merge field', group: 'Destinations' },
  { value: 'unsubscribe', label: 'Unsubscribe', group: 'System links' },
  { value: 'preferences', label: 'Preference centre', group: 'System links' },
  { value: 'view_in_browser', label: 'View in browser', group: 'System links' },
];

export interface LinkDialogRequest {
  link: LinkSpec | null;
  /** Present when editing inline text: the selected words. */
  displayText?: string;
  onApply: (link: LinkSpec | null, displayText?: string) => void;
}

export function LinkDialog({ request, onClose }: { request: LinkDialogRequest | null; onClose: () => void }) {
  const [type, setType] = useState<LinkType>('url');
  const [value, setValue] = useState('');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [newTab, setNewTab] = useState(true);
  const [tracking, setTracking] = useState(true);

  useEffect(() => {
    if (!request) return;
    const link = request.link;
    setType(link?.type || 'url');
    setValue(link?.value || '');
    setTitle(link?.title || '');
    setText(request.displayText || '');
    setNewTab((link?.target || '_blank') === '_blank');
    setTracking(link?.trackingEnabled !== false);
  }, [request]);

  const isSystem = type in SYSTEM_LINK_TOKENS;
  const problem = useMemo(() => validate(type, value), [type, value]);
  const resolved = linkHref({ type, value, target: newTab ? '_blank' : '_self' });

  const apply = () => {
    if (!request) return;
    if (problem?.blocking) return;
    request.onApply(
      {
        type,
        value: isSystem ? '' : value.trim(),
        title: title.trim() || null,
        target: newTab ? '_blank' : '_self',
        trackingEnabled: tracking,
      },
      request.displayText !== undefined ? text : undefined
    );
    onClose();
  };

  return (
    <Dialog
      open={!!request}
      onClose={onClose}
      title={request?.link ? 'Edit link' : 'Insert link'}
      description="Only https, mailto, tel, merge-field and system links can be used in email."
      footer={
        <>
          {request?.link && (
            <DialogButton
              variant="ghost"
              onClick={() => {
                request?.onApply(null);
                onClose();
              }}
            >
              <Trash2 size={13} />
              Remove link
            </DialogButton>
          )}
          <DialogButton onClick={onClose}>Cancel</DialogButton>
          <DialogButton variant="primary" onClick={apply} disabled={!!problem?.blocking}>
            Apply
          </DialogButton>
        </>
      }
    >
      <div className="space-y-3.5">
        {request?.displayText !== undefined && (
          <TextInput label="Display text" value={text} onChange={setText} placeholder="The words recipients click" />
        )}

        <SelectInput label="Link type" value={type} options={TYPE_OPTIONS} onChange={setType} />

        {isSystem ? (
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-[12px] leading-snug text-gray-600">
            The destination is generated for each recipient and inserted as{' '}
            <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">{SYSTEM_LINK_TOKENS[type]}</code>.
          </div>
        ) : (
          <TextInput
            label={
              type === 'email'
                ? 'Email address'
                : type === 'tel'
                  ? 'Phone number'
                  : type === 'merge'
                    ? 'Merge expression'
                    : 'Web address'
            }
            value={value}
            onChange={setValue}
            placeholder={
              type === 'email'
                ? 'name@example.com'
                : type === 'tel'
                  ? '+44 20 7000 0000'
                  : type === 'merge'
                    ? '{{ profile_url }}'
                    : 'https://example.com/page'
            }
            hint={type === 'merge' ? 'Merge values in URLs are URL-encoded automatically.' : undefined}
            action={
              type === 'merge' ? (
                <span className="inline-flex items-center gap-1 text-[10.5px] text-gray-400">
                  <Braces size={10} />
                  personalization
                </span>
              ) : undefined
            }
          />
        )}

        {problem && (
          <p
            className={
              problem.blocking
                ? 'flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-2 text-[12px] leading-snug text-red-700'
                : 'flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[12px] leading-snug text-amber-800'
            }
          >
            <AlertTriangle size={13} className="mt-px shrink-0" />
            {problem.message}
          </p>
        )}

        <TextInput
          label="Title (tooltip)"
          value={title}
          onChange={setTitle}
          placeholder="Optional, shown on hover"
          hint="Screen readers may also announce this, so keep it meaningful."
        />

        {!isSystem && (
          <>
            <ToggleInput label="Open in a new tab" value={newTab} onChange={setNewTab} />
            <ToggleInput
              label="Track clicks"
              hint="Rewrites the URL through the tracking endpoint when the campaign is sent."
              value={tracking}
              onChange={setTracking}
            />
          </>
        )}

        {resolved && !problem?.blocking && (
          <div className="rounded-lg border border-gray-200 px-2.5 py-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">Resolves to</p>
            <p className="mt-0.5 break-all font-mono text-[11.5px] text-gray-700">{resolved}</p>
            {/^https?:/i.test(resolved) && (
              <a
                href={resolved}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-700 hover:text-brand-800"
              >
                <ExternalLink size={11} />
                Test this link in a new tab
              </a>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function validate(type: LinkType, raw: string): { message: string; blocking: boolean } | null {
  if (type in SYSTEM_LINK_TOKENS) return null;
  const value = raw.trim();
  if (!value) return { message: 'Enter a destination before applying the link.', blocking: true };
  if (value !== raw) return { message: 'Leading or trailing spaces were removed.', blocking: false };

  if (type === 'email') {
    return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value)
      ? null
      : { message: 'That does not look like a valid email address.', blocking: true };
  }
  if (type === 'tel') {
    return /\d{3,}/.test(value) ? null : { message: 'Enter a phone number with at least three digits.', blocking: true };
  }
  if (type === 'merge') {
    return /\{\{\s*[A-Za-z_]\w*/.test(value)
      ? null
      : { message: 'A merge link must contain an expression such as {{ profile_url }}.', blocking: true };
  }

  const lowered = value.toLowerCase();
  if (lowered.startsWith('javascript:') || lowered.startsWith('vbscript:')) {
    return { message: 'Script URLs are blocked because email clients treat them as malicious.', blocking: true };
  }
  if (lowered.startsWith('data:')) {
    return { message: 'Data URLs are not allowed for links.', blocking: true };
  }
  if (lowered.startsWith('file:') || lowered.startsWith('ftp:')) {
    return { message: 'That protocol is not supported in email.', blocking: true };
  }
  if (!isSafeUrl(value)) {
    return { message: 'Enter a full address beginning with https://.', blocking: true };
  }
  if (lowered.startsWith('http://')) {
    return { message: 'Use https:// so the link is not flagged as insecure.', blocking: false };
  }
  if (/\s/.test(value)) {
    return { message: 'URLs cannot contain spaces. Encode them as %20.', blocking: true };
  }
  return null;
}
