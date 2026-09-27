/**
 * Draft recovery and concurrent-edit conflicts (spec 21.4, 21.5).
 *
 * Recovery is offered, never applied silently, and a conflict never overwrites a newer
 * server revision: the author compares first and then chooses.
 */

import { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, GitCompare, History, RefreshCw, Save, Trash2, Users } from 'lucide-react';
import { useComposer, relativeTime } from '../store/composerStore';
import type { RecoveryCopy } from '../store/recovery';
import { Dialog, DialogButton } from '../ui/Dialog';
import { Pill } from '../ui/primitives';
import { DiffView } from '../code/DiffView';

export function RecoveryDialog() {
  const offer = useComposer(store => store.recoveryOffer);
  const applyRecovery = useComposer(store => store.applyRecovery);
  const dismissRecovery = useComposer(store => store.dismissRecovery);
  const htmlSource = useComposer(store => store.htmlSource);
  const compiled = useComposer(store => store.compiled);
  const [comparing, setComparing] = useState(false);

  if (!offer) return null;

  return (
    <Dialog
      open
      onClose={dismissRecovery}
      size={comparing ? 'xl' : 'md'}
      title="Unsaved work was found"
      description={`This browser has a local copy from ${relativeTime(new Date(offer.savedAt).getTime())} that was never saved to the server.`}
      footer={
        <>
          <DialogButton
            variant="ghost"
            onClick={() => {
              dismissRecovery();
              toast.success('Local copy discarded.');
            }}
          >
            <Trash2 size={12} />
            Discard local copy
          </DialogButton>
          <DialogButton onClick={() => setComparing(current => !current)}>
            <GitCompare size={12} />
            {comparing ? 'Hide comparison' : 'Compare'}
          </DialogButton>
          <DialogButton onClick={dismissRecovery}>Keep the server version</DialogButton>
          <DialogButton
            variant="primary"
            onClick={() => {
              applyRecovery(offer);
              toast.success('Local copy restored. Review it, then save.');
            }}
          >
            <History size={12} />
            Restore local copy
          </DialogButton>
        </>
      }
    >
      <div className="space-y-3">
        <RecoveryFacts copy={offer} />
        {comparing && (
          <DiffView
            before={compiled?.html || htmlSource}
            after={offer.htmlSource || JSON.stringify(offer.document, null, 2)}
            beforeLabel="Server version"
            afterLabel="Local copy"
            height={360}
          />
        )}
      </div>
    </Dialog>
  );
}

function RecoveryFacts({ copy }: { copy: RecoveryCopy }) {
  return (
    <dl className="grid gap-x-4 gap-y-1 rounded-xl bg-gray-50 p-3 text-[12px] sm:grid-cols-2">
      <Fact label="Saved locally" value={new Date(copy.savedAt).toLocaleString()} />
      <Fact label="Editing mode" value={copy.kind === 'visual' ? 'Visual' : 'Custom HTML'} />
      <Fact label="Subject" value={copy.subject || '—'} />
      <Fact label="Preheader" value={copy.preheader || '—'} />
      <Fact label="Plain text" value={copy.plainTextMode === 'manual' ? 'Manually edited' : 'Generated'} />
      <Fact label="Target" value={`${copy.targetType} ${copy.targetCode}`} />
    </dl>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10.5px] uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="truncate text-gray-800">{value}</dd>
    </div>
  );
}

export function ConflictDialog() {
  const conflict = useComposer(store => store.conflict);
  const reloadFromServer = useComposer(store => store.reloadFromServer);
  const save = useComposer(store => store.save);
  const htmlSource = useComposer(store => store.htmlSource);
  const compiled = useComposer(store => store.compiled);
  const [comparing, setComparing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!conflict) return null;

  const who = conflict.author_name || 'Another user';
  const when = conflict.updated_at ? relativeTime(new Date(conflict.updated_at).getTime()) : 'recently';

  return (
    <Dialog
      open
      onClose={() => setComparing(false)}
      closeOnEscape={false}
      size={comparing ? 'xl' : 'md'}
      title="Someone else saved a newer version"
      description={`${who} saved revision ${conflict.revision_no} ${when}. Your changes have not been lost.`}
      footer={
        <>
          <DialogButton onClick={() => setComparing(current => !current)}>
            <GitCompare size={12} />
            {comparing ? 'Hide comparison' : 'Compare versions'}
          </DialogButton>
          <DialogButton
            onClick={async () => {
              if (!window.confirm('Reload the server version? Your unsaved changes will be discarded.')) return;
              setBusy(true);
              await reloadFromServer();
              setBusy(false);
            }}
            busy={busy}
          >
            <RefreshCw size={12} />
            Discard mine and reload
          </DialogButton>
          <DialogButton
            variant="primary"
            onClick={async () => {
              setBusy(true);
              const ok = await save({ summary: `Saved alongside revision ${conflict.revision_no}` });
              setBusy(false);
              if (ok) toast.success('Saved as a new revision on top of theirs.');
            }}
            busy={busy}
          >
            <Save size={12} />
            Save mine as a new revision
          </DialogButton>
        </>
      }
    >
      <div className="space-y-3">
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] leading-snug text-amber-900">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          Saving now creates a new revision based on theirs, so nothing is overwritten. If you are unsure, compare first.
        </p>
        <dl className="grid gap-x-4 gap-y-1 rounded-xl bg-gray-50 p-3 text-[12px] sm:grid-cols-2">
          <Fact label="Their revision" value={`#${conflict.revision_no}`} />
          <Fact label="Author" value={who} />
          <Fact label="Saved" value={conflict.updated_at ? new Date(conflict.updated_at).toLocaleString() : '—'} />
          <Fact label="Summary" value={conflict.change_summary || '—'} />
        </dl>
        <p className="flex items-center gap-1.5 text-[11.5px] text-gray-600">
          <Users size={12} />
          <Pill tone="blue">Optimistic concurrency</Pill>
          Two people can edit at once; the second save always becomes a new revision.
        </p>
        {comparing && (
          <DiffView
            before={compiled?.html || htmlSource}
            after={htmlSource}
            beforeLabel={`Revision ${conflict.revision_no} (theirs)`}
            afterLabel="Your unsaved draft"
            height={340}
          />
        )}
      </div>
    </Dialog>
  );
}
