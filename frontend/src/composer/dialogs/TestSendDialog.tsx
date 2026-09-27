/**
 * Test send (spec 23).
 *
 * The draft is compiled and validated before anything leaves the building, unresolved
 * merge fields are listed explicitly, and every result is reported per recipient.
 */

import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Clock, Mail, Paperclip, Send, XCircle } from 'lucide-react';
import * as composerApi from '../api/composerApi';
import type { AttachmentResponse, TestSendResult } from '../api/types';
import { useComposer } from '../store/composerStore';
import { Dialog, DialogButton } from '../ui/Dialog';
import { Pill, Spinner } from '../ui/primitives';
import { SelectInput, TextArea, TextInput, ToggleInput } from '../ui/controls';

type SampleSource = 'recipient' | 'first_valid' | 'custom' | 'template_defaults';

export function TestSendDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useComposer();
  const canSend = useComposer(store => store.can('send_test_emails'));
  const canOverride = useComposer(store => store.can('override_validation_warnings'));

  const [recipients, setRecipients] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [senderCode, setSenderCode] = useState<string | null>(null);
  const [senders, setSenders] = useState<
    { public_code: string; from_email: string; from_name: string; reply_to?: string | null; is_default: boolean }[]
  >([]);
  const [sampleSource, setSampleSource] = useState<SampleSource>('first_valid');
  const [recipientIndex, setRecipientIndex] = useState(0);
  const [customSample, setCustomSample] = useState('');
  const [includeHtml, setIncludeHtml] = useState(true);
  const [includePlain, setIncludePlain] = useState(true);
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [overrideReason, setOverrideReason] = useState('');
  const [attachments, setAttachments] = useState<AttachmentResponse[]>([]);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<TestSendResult[]>([]);

  const validation = state.compiled?.validation;
  const blockers = validation?.summary.blockers ?? 0;
  const errors = validation?.summary.errors ?? 0;
  const testSendBlocked = validation?.blocks.test_send ?? false;
  const unresolved = useMemo(
    () =>
      (validation?.issues || [])
        .filter(issue => issue.code.startsWith('merge.') || issue.code.startsWith('personalization.'))
        .slice(0, 8),
    [validation]
  );

  useEffect(() => {
    if (!open) return;
    setResults([]);
    setSenderCode(state.sender?.code ?? null);
    setReplyTo(state.sender?.reply_to || '');
    if (state.targetType === 'campaign') {
      setSampleSource(state.recipientCount > 0 ? 'recipient' : 'template_defaults');
      composerApi
        .listAttachments(state.targetCode)
        .then(data => setAttachments(data.attachments))
        .catch(() => setAttachments([]));
    }
    composerApi
      .listSenderIdentities()
      .then(list => {
        setSenders(list);
        if (!state.sender?.code) {
          const preferred = list.find(entry => entry.is_default) || list[0];
          setSenderCode(preferred?.public_code ?? null);
          if (preferred?.reply_to) setReplyTo(preferred.reply_to);
        }
      })
      .catch(() => setSenders([]));
    state.requestCompile(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addresses = useMemo(
    () =>
      recipients
        .split(/[\s,;]+/)
        .map(entry => entry.trim())
        .filter(Boolean),
    [recipients]
  );
  const invalidAddresses = addresses.filter(entry => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entry));

  const parsedSample = useMemo(() => {
    if (sampleSource !== 'custom') return {};
    const out: Record<string, string> = {};
    customSample.split('\n').forEach(line => {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) out[key.trim()] = rest.join('=').trim();
    });
    return out;
  }, [customSample, sampleSource]);

  const send = async () => {
    if (!addresses.length) {
      toast.error('Add at least one test recipient.');
      return;
    }
    if (invalidAddresses.length) {
      toast.error(`These addresses look wrong: ${invalidAddresses.join(', ')}`);
      return;
    }
    setSending(true);
    setResults(addresses.map(recipient => ({ recipient, status: 'queued', timestamp: new Date().toISOString() })));
    try {
      const response = await composerApi.sendTest({
        target_type: state.targetType,
        target_code: state.targetCode,
        kind: state.kind,
        document: state.kind === 'visual' ? state.doc : null,
        html_source: state.kind === 'custom_html' ? state.htmlSource : null,
        subject: state.subject,
        preheader: state.preheader,
        theme_code: state.themeCode,
        merge_field_definitions: state.mergeDefs,
        plain_text: state.plainTextMode === 'manual' ? state.plainText : null,
        plain_text_mode: state.plainTextMode,
        recipients: addresses,
        sender_identity_code: senderCode,
        reply_to: replyTo || null,
        sample_source: sampleSource,
        recipient_index: sampleSource === 'recipient' ? recipientIndex : undefined,
        custom_sample: sampleSource === 'custom' ? parsedSample : undefined,
        include_html: includeHtml,
        include_plain_text: includePlain,
        include_attachments: includeAttachments,
        mark_as_test: true,
        override_reason: overrideReason || null,
      });
      setResults(response.results);
      if (response.blocked) {
        toast.error(response.message || 'Validation blocked this test send.');
      } else if (response.results.every(entry => entry.status !== 'failed')) {
        toast.success('Test email sent.');
      } else {
        toast.error('Some test emails failed. See the results below.');
      }
    } catch (error) {
      toast.error(composerApi.describeError(error, 'The test send failed.'));
      setResults(
        addresses.map(recipient => ({
          recipient,
          status: 'failed' as const,
          error: composerApi.describeError(error),
          timestamp: new Date().toISOString(),
        }))
      );
    } finally {
      setSending(false);
    }
  };

  const hardBlocked = testSendBlocked && !(canOverride && overrideReason.trim());

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Send a test email"
      description="Test messages are marked as tests and are never counted in campaign results."
      footer={
        <>
          <DialogButton onClick={onClose}>Close</DialogButton>
          <DialogButton variant="primary" onClick={send} busy={sending} disabled={!canSend || hardBlocked}>
            <Send size={12} />
            Send test
          </DialogButton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
        <div className="space-y-3">
          {!canSend && (
            <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[12px] text-amber-900">
              You do not have permission to send test emails.
            </p>
          )}

          <TextArea
            label="Test recipients"
            rows={2}
            value={recipients}
            onChange={setRecipients}
            placeholder="you@example.com, colleague@example.com"
            hint="Separate multiple addresses with commas."
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <SelectInput
              label="From"
              value={senderCode || ''}
              onChange={value => {
                setSenderCode(value || null);
                const match = senders.find(entry => entry.public_code === value);
                if (match?.reply_to) setReplyTo(match.reply_to);
              }}
              options={[
                { value: '', label: state.sender?.from_email || 'Default sender' },
                ...senders.map(entry => ({
                  value: entry.public_code,
                  label: entry.from_name ? `${entry.from_name} <${entry.from_email}>` : entry.from_email,
                })),
              ]}
            />
            <TextInput label="Reply to" value={replyTo} onChange={setReplyTo} placeholder="Optional" />
          </div>

          <div className="rounded-xl bg-gray-50 p-2.5">
            <p className="mb-1.5 text-[11px] font-medium text-gray-600">Subject and preheader</p>
            <p className="text-[12.5px] font-semibold text-gray-900">{state.subject || '(no subject)'}</p>
            <p className="text-[11.5px] text-gray-600">{state.preheader || '(no preheader)'}</p>
          </div>

          <SelectInput
            label="Merge field values"
            value={sampleSource}
            onChange={value => setSampleSource(value as SampleSource)}
            options={[
              ...(state.targetType === 'campaign' && state.recipientCount > 0
                ? [{ value: 'recipient' as SampleSource, label: 'Use an uploaded recipient' }]
                : []),
              { value: 'first_valid', label: 'Use the first recipient with complete data' },
              { value: 'template_defaults', label: 'Use template defaults' },
              { value: 'custom', label: 'Enter sample values' },
            ]}
          />

          {sampleSource === 'recipient' && (
            <TextInput
              label="Recipient row"
              value={String(recipientIndex + 1)}
              onChange={value => setRecipientIndex(Math.max(0, (Number(value) || 1) - 1))}
              hint={`1 to ${state.recipientCount}`}
            />
          )}

          {sampleSource === 'custom' && (
            <TextArea
              label="Sample values"
              rows={4}
              mono
              value={customSample}
              onChange={setCustomSample}
              placeholder={'first_name = Alex\ncompany = Northwind'}
              hint="One field per line, in the form key = value."
            />
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <ToggleInput label="Include the HTML version" value={includeHtml} onChange={setIncludeHtml} />
            <ToggleInput label="Include the plain-text version" value={includePlain} onChange={setIncludePlain} />
          </div>

          {state.targetType === 'campaign' && attachments.length > 0 && (
            <div className="rounded-xl border border-gray-200 p-2.5">
              <ToggleInput
                label={`Include ${attachments.length} attachment${attachments.length === 1 ? '' : 's'}`}
                value={includeAttachments}
                onChange={setIncludeAttachments}
              />
              <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-gray-600">
                {attachments.map(file => (
                  <li key={file.id} className="flex items-center gap-1.5">
                    <Paperclip size={10} className="text-gray-400" />
                    <span className="truncate">{file.filename}</span>
                    <span className="tabular-nums text-gray-400">{Math.round(file.size / 1024)}KB</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {testSendBlocked && canOverride && (
            <TextInput
              label="Reason for overriding validation"
              value={overrideReason}
              onChange={setOverrideReason}
              hint="Recorded in the audit history."
            />
          )}

          {results.length > 0 && (
            <div className="rounded-xl border border-gray-200">
              <p className="border-b border-gray-100 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Results
              </p>
              <ul className="divide-y divide-gray-50">
                {results.map(result => (
                  <li key={`${result.recipient}-${result.timestamp}`} className="flex items-start gap-2 px-2.5 py-1.5">
                    <ResultIcon status={result.status} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-gray-800">{result.recipient}</span>
                      {result.error && <span className="block text-[11px] text-red-600">{result.error}</span>}
                      {result.provider_response && (
                        <span className="block truncate text-[10.5px] text-gray-400">{result.provider_response}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[10.5px] text-gray-400">
                      {new Date(result.timestamp).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="space-y-2 rounded-xl bg-gray-50 p-3">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
            <Mail size={10} />
            Before sending
          </p>

          {state.compiling ? (
            <p className="flex items-center gap-1.5 text-[12px] text-gray-600">
              <Spinner size={12} />
              Compiling the current draft…
            </p>
          ) : (
            <ul className="space-y-1.5 text-[12px]">
              <li className="flex items-start gap-1.5">
                {blockers + errors > 0 ? (
                  <XCircle size={13} className="mt-px shrink-0 text-red-600" />
                ) : (
                  <CheckCircle2 size={13} className="mt-px shrink-0 text-emerald-600" />
                )}
                <span className="text-gray-700">
                  {blockers + errors > 0
                    ? `${blockers + errors} problem${blockers + errors === 1 ? '' : 's'} found`
                    : 'No blocking problems'}
                </span>
              </li>
              {(validation?.summary.warnings ?? 0) > 0 && (
                <li className="flex items-start gap-1.5">
                  <AlertTriangle size={13} className="mt-px shrink-0 text-amber-600" />
                  <span className="text-gray-700">{validation?.summary.warnings} warning(s)</span>
                </li>
              )}
              <li className="flex items-start gap-1.5">
                <Clock size={13} className="mt-px shrink-0 text-gray-400" />
                <span className="text-gray-700">
                  {state.compiled ? `${Math.round(state.compiled.sizeBytes / 1024)}KB compiled` : 'Not compiled yet'}
                </span>
              </li>
            </ul>
          )}

          {unresolved.length > 0 && (
            <div className="rounded-lg bg-white p-2">
              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-amber-700">
                Unresolved personalization
              </p>
              <ul className="space-y-0.5 text-[11px] text-gray-700">
                {unresolved.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>· {issue.message}</li>
                ))}
              </ul>
            </div>
          )}

          {testSendBlocked && (
            <p className="rounded-lg bg-red-50 px-2 py-1.5 text-[11.5px] leading-snug text-red-800">
              Organization policy blocks test sends while these problems exist.
              {canOverride ? ' Provide a reason to override.' : ' Ask an administrator to review the settings.'}
            </p>
          )}

          {addresses.length > 0 && (
            <p className="text-[11.5px] text-gray-600">
              Sending to {addresses.length} address{addresses.length === 1 ? '' : 'es'}
              {invalidAddresses.length > 0 && <Pill tone="red">{invalidAddresses.length} invalid</Pill>}
            </p>
          )}
        </aside>
      </div>
    </Dialog>
  );
}

function ResultIcon({ status }: { status: TestSendResult['status'] }) {
  if (status === 'sent') return <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-emerald-600" />;
  if (status === 'failed') return <XCircle size={13} className="mt-0.5 shrink-0 text-red-600" />;
  if (status === 'sending') return <Spinner size={13} className={clsx('mt-0.5 shrink-0 text-brand-600')} />;
  return <Clock size={13} className="mt-0.5 shrink-0 text-gray-400" />;
}
