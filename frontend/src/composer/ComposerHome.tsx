/**
 * Composer landing page (spec 19.1).
 *
 * Lists the templates and campaigns that can be opened in the new composer and offers the
 * supported creation paths. The existing Templates and Campaigns screens are untouched.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  Code2,
  FileText,
  LayoutTemplate,
  Mail,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react';
import * as composerApi from './api/composerApi';
import type { ComposerCampaignListItem, ComposerTemplateListItem } from './api/composerApi';
import { InlineEmpty, Pill, Spinner } from './ui/primitives';
import { Dialog, DialogButton } from './ui/Dialog';
import { SelectInput, TextArea, TextInput } from './ui/controls';

type Tab = 'templates' | 'campaigns';

const AUTO_CREATE_KEY = 'composer:auto-create-template';

export default function ComposerHome() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('templates');
  const [templates, setTemplates] = useState<ComposerTemplateListItem[]>([]);
  const [campaigns, setCampaigns] = useState<ComposerCampaignListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState('');
  // Opened once by a one-shot flag set right before navigating here (see the
  // Templates page's "New Composer" button), never by the URL itself — so a
  // refresh straight onto a stale /composer/template/new-style URL can't
  // reopen it uninvited.
  //
  // The flag is deliberately *not* cleared on mount. This route can genuinely
  // mount more than once for the same visit — a Suspense-wrapped lazy route
  // resolving, React 18 Strict Mode's dev-only double-render — and clearing a
  // read-once flag in an effect races those extra mounts: whichever one runs
  // last finds the flag already gone and renders closed, even though the
  // flag was set for this very visit. Reading it is safe to repeat as often
  // as React likes; it's only cleared once something the user actually did
  // resolves it — Cancel or a successful create, both via closeCreateDialog.
  const [createOpen, setCreateOpen] = useState(() => {
    try { return sessionStorage.getItem(AUTO_CREATE_KEY) === '1'; } catch { return false; }
  });

  const closeCreateDialog = useCallback(() => {
    setCreateOpen(false);
    try { sessionStorage.removeItem(AUTO_CREATE_KEY); } catch { /* private browsing */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [templateList, campaignList] = await Promise.all([
        composerApi.listTemplates().catch(() => []),
        composerApi.listCampaigns().catch(() => []),
      ]);
      setTemplates(templateList);
      setCampaigns(campaignList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredTemplates = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return templates;
    return templates.filter(entry =>
      `${entry.name} ${entry.description || ''}`.toLowerCase().includes(needle)
    );
  }, [templates, term]);

  const filteredCampaigns = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return campaigns;
    return campaigns.filter(entry => `${entry.name} ${entry.subject || ''}`.toLowerCase().includes(needle));
  }, [campaigns, term]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight text-gray-900">
            <Sparkles size={20} className="text-brand-600" />
            Email composer
          </h1>
          <p className="mt-1 text-[13px] text-gray-600">
            A structured visual editor and a full HTML editor, with live preview, validation and version history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/templates"
            className="rounded-xl border border-gray-200 px-3 py-2 text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Classic editor
          </Link>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            <Plus size={15} />
            New template
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-gray-100 p-0.5">
          {(
            [
              { id: 'templates' as Tab, label: 'Templates', icon: <LayoutTemplate size={14} />, count: templates.length },
              { id: 'campaigns' as Tab, label: 'Campaigns', icon: <Mail size={14} />, count: campaigns.length },
            ]
          ).map(entry => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              aria-pressed={tab === entry.id}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition-colors',
                tab === entry.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              )}
            >
              {entry.icon}
              {entry.label}
              <span className="text-[11px] tabular-nums text-gray-400">{entry.count}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={term}
            onChange={event => setTerm(event.target.value)}
            placeholder={tab === 'templates' ? 'Search templates' : 'Search campaigns'}
            aria-label="Search"
            className="w-full rounded-xl border border-gray-200 py-2 pl-8 pr-2 text-[13px] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
          <Spinner size={18} />
          <span className="text-[13px]">Loading…</span>
        </div>
      ) : tab === 'templates' ? (
        filteredTemplates.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map(entry => (
              <li key={entry.public_code}>
                <button
                  type="button"
                  onClick={() => navigate(`/composer/template/${entry.public_code}`)}
                  className="flex h-full w-full flex-col rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <FileText size={16} />
                    </span>
                    <Pill tone="gray">{entry.public_code}</Pill>
                  </span>
                  <span className="mt-3 block truncate text-[14px] font-semibold text-gray-900">{entry.name}</span>
                  <span className="mt-0.5 line-clamp-2 text-[12px] text-gray-500">
                    {entry.description || 'No description yet.'}
                  </span>
                  <span className="mt-3 text-[11px] text-gray-400">
                    {entry.updated_at ? `Updated ${new Date(entry.updated_at).toLocaleDateString()}` : 'Not saved yet'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <InlineEmpty
            icon={<LayoutTemplate size={22} />}
            title="No templates yet"
            description="Create one to start designing in the new composer."
          />
        )
      ) : filteredCampaigns.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCampaigns.map(entry => (
            <li key={entry.public_code}>
              <button
                type="button"
                onClick={() => navigate(`/composer/campaign/${entry.public_code}`)}
                className="flex h-full w-full flex-col rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <Mail size={16} />
                  </span>
                  <Pill tone={entry.status === 'draft' ? 'gray' : entry.status === 'completed' ? 'green' : 'blue'}>
                    {entry.status}
                  </Pill>
                </span>
                <span className="mt-3 block truncate text-[14px] font-semibold text-gray-900">{entry.name}</span>
                <span className="mt-0.5 line-clamp-2 text-[12px] text-gray-500">{entry.subject || 'No subject yet.'}</span>
                <span className="mt-3 text-[11px] text-gray-400">
                  {entry.updated_at ? `Updated ${new Date(entry.updated_at).toLocaleDateString()}` : 'Not saved yet'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <InlineEmpty
          icon={<Mail size={22} />}
          title="No campaigns yet"
          description="Create a campaign first, then open its content here."
        />
      )}

      <CreateTemplateDialog
        open={createOpen}
        onClose={closeCreateDialog}
        templates={templates}
        onCreated={code => { closeCreateDialog(); navigate(`/composer/template/${code}`); }}
      />
    </div>
  );
}

function CreateTemplateDialog({
  open,
  onClose,
  templates,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  templates: ComposerTemplateListItem[];
  onCreated: (code: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState<'visual' | 'html' | 'copy'>('visual');
  const [copyFrom, setCopyFrom] = useState('');
  const [pastedHtml, setPastedHtml] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setDescription('');
    setStart('visual');
    setCopyFrom(templates[0]?.public_code || '');
    setPastedHtml('');
  }, [open, templates]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Give the template a name.');
      return;
    }
    setBusy(true);
    try {
      const created = await composerApi.createTemplate({
        name: trimmed,
        description: description.trim(),
        html_output: start === 'html' ? pastedHtml : '',
      });
      if (start === 'copy' && copyFrom) {
        const source = await composerApi.loadTarget('template', copyFrom);
        const revision = source.draft;
        if (revision) {
          await composerApi.saveRevision({
            target_type: 'template',
            target_code: created.public_code,
            kind: revision.kind,
            document: revision.document,
            html_source: revision.html_source,
            subject: revision.subject ?? '',
            preheader: revision.preheader ?? '',
            theme_code: revision.theme_code,
            theme_overrides: revision.theme_overrides,
            merge_field_definitions: revision.merge_field_definitions,
            plain_text: revision.plain_text,
            plain_text_mode: revision.plain_text_mode,
            change_summary: `Copied from ${source.name}`,
          });
        }
      } else if (start === 'html' && pastedHtml.trim()) {
        await composerApi.saveRevision({
          target_type: 'template',
          target_code: created.public_code,
          kind: 'custom_html',
          html_source: pastedHtml,
          change_summary: 'Imported HTML',
        });
      }
      toast.success(`Created “${trimmed}”.`);
      onClose();
      onCreated(created.public_code);
    } catch (error) {
      toast.error(composerApi.describeError(error, 'The template could not be created.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      title="New template"
      description="Choose how you want to start. You can switch to HTML later."
      footer={
        <>
          <DialogButton onClick={onClose}>Cancel</DialogButton>
          <DialogButton variant="primary" onClick={submit} disabled={busy}>
            {busy ? <Spinner size={12} /> : <Plus size={12} />}
            Create and open
          </DialogButton>
        </>
      }
    >
      <div className="space-y-3">
        <TextInput label="Name" value={name} onChange={setName} placeholder="Monthly newsletter" />
        <TextArea label="Description" value={description} onChange={setDescription} rows={2} />
        <fieldset className="space-y-1.5">
          <legend className="text-[11px] font-medium text-gray-600">Start from</legend>
          {(
            [
              { id: 'visual' as const, label: 'A blank visual layout', icon: <LayoutTemplate size={14} />, hint: 'Blocks, rows and sections you can drag.' },
              { id: 'html' as const, label: 'Pasted or imported HTML', icon: <Code2 size={14} />, hint: 'The HTML source becomes the master copy.' },
              { id: 'copy' as const, label: 'A copy of an existing template', icon: <FileText size={14} />, hint: 'Starts from the latest saved revision.' },
            ]
          ).map(option => (
            <label
              key={option.id}
              className={clsx(
                'flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 transition-colors',
                start === option.id ? 'border-brand-300 bg-brand-50/60' : 'border-gray-200 hover:bg-gray-50'
              )}
            >
              <input
                type="radio"
                name="start-from"
                checked={start === option.id}
                onChange={() => setStart(option.id)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-gray-900">
                  {option.icon}
                  {option.label}
                </span>
                <span className="block text-[11.5px] text-gray-500">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {start === 'copy' && (
          <SelectInput
            label="Copy from"
            value={copyFrom}
            onChange={setCopyFrom}
            options={templates.map(entry => ({ value: entry.public_code, label: entry.name }))}
          />
        )}
        {start === 'html' && (
          <TextArea
            label="HTML"
            value={pastedHtml}
            onChange={setPastedHtml}
            rows={7}
            mono
            placeholder="<!doctype html>…"
            hint="Scripts and unsupported markup are removed when the email is compiled."
          />
        )}
      </div>
    </Dialog>
  );
}
