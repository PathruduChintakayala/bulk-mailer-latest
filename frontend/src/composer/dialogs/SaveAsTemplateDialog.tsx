/**
 * Save as a new template (spec 19.2, 20.2).
 *
 * Copies the current draft content into a brand-new template so the original is never
 * touched, then offers to continue editing the copy.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Copy, LayoutTemplate } from 'lucide-react';
import * as composerApi from '../api/composerApi';
import { useComposer } from '../store/composerStore';
import { Dialog, DialogButton } from '../ui/Dialog';
import { Pill, Spinner } from '../ui/primitives';
import { TextArea, TextInput, ToggleInput } from '../ui/controls';

export function SaveAsTemplateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const store = useComposer();
  const canCreate = useComposer(state => state.can('create_templates'));

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [openAfter, setOpenAfter] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(`${store.targetName || 'Untitled email'} copy`);
    setDescription(store.targetDescription || '');
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Give the new template a name.');
      return;
    }
    setSaving(true);
    try {
      const created = await composerApi.createTemplate({
        name: trimmed,
        description: description.trim(),
        html_output: store.compiled?.html || store.lastGoodHtml || '',
      });
      await composerApi.saveRevision({
        target_type: 'template',
        target_code: created.public_code,
        kind: store.kind,
        document: store.kind === 'visual' ? store.doc : null,
        html_source: store.kind === 'custom_html' ? store.htmlSource : null,
        subject: store.subject,
        preheader: store.preheader,
        theme_code: store.themeCode,
        theme_overrides: store.themeOverrides,
        merge_field_definitions: store.mergeDefs,
        plain_text: store.plainText,
        plain_text_mode: store.plainTextMode,
        change_summary: `Copied from ${store.targetName || 'another email'}`,
        name: trimmed,
        description: description.trim(),
      });
      toast.success(`Saved as “${trimmed}”.`);
      onClose();
      if (openAfter) navigate(`/composer/template/${created.public_code}`);
    } catch (error) {
      toast.error(composerApi.describeError(error, 'The new template could not be created.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Save as a new template"
      description="The current content is copied. This email is left exactly as it is."
      footer={
        <>
          <DialogButton onClick={onClose}>Cancel</DialogButton>
          <DialogButton variant="primary" onClick={submit} disabled={saving || !canCreate}>
            {saving ? <Spinner size={12} /> : <Copy size={12} />}
            Create template
          </DialogButton>
        </>
      }
    >
      <div className="space-y-3">
        {!canCreate && (
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[12px] text-amber-900">
            You do not have permission to create templates. Ask an administrator for the “Create templates” permission.
          </p>
        )}
        <TextInput label="Template name" value={name} onChange={setName} placeholder="Monthly newsletter" />
        <TextArea label="Description" value={description} onChange={setDescription} rows={3} placeholder="What is this template for?" />
        <ToggleInput label="Open the new template after saving" value={openAfter} onChange={setOpenAfter} />
        <p className="flex items-center gap-1.5 text-[12px] text-gray-500">
          <LayoutTemplate size={12} />
          Copies the {store.kind === 'visual' ? 'visual layout' : 'HTML source'}, subject, preheader, theme and merge fields.
          <Pill tone="gray">Revision 1</Pill>
        </p>
      </div>
    </Dialog>
  );
}
