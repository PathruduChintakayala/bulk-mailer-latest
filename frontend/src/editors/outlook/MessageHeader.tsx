import { useState, useCallback } from 'react';
import {
  User, Users, Plus, X, Paperclip, Braces,
} from 'lucide-react';
import type { SenderIdentity, MergeFieldDefinition } from '../../types';

interface MessageHeaderProps {
  // Context
  editorContext: 'campaign' | 'template';

  // Sender
  senderIdentity?: SenderIdentity | null;
  onChangeSender?: () => void;

  // Audience (campaign only)
  totalRecipients?: number;
  suppressedCount?: number;
  onViewRecipients?: () => void;

  // Subject
  subject: string;
  onSubjectChange: (value: string) => void;
  mergeFields?: MergeFieldDefinition[];
  onInsertMergeField?: (key: string) => void;

  // Preheader
  preheader: string;
  onPreheaderChange: (value: string) => void;

  // Attachments
  attachments?: { filename: string; size: number; id: number }[];
  onRemoveAttachment?: (id: number) => void;
}

export default function MessageHeader({
  editorContext,
  senderIdentity,
  onChangeSender,
  totalRecipients = 0,
  suppressedCount = 0,
  onViewRecipients,
  subject,
  onSubjectChange,
  mergeFields = [],
  preheader,
  onPreheaderChange,
  attachments = [],
  onRemoveAttachment,
}: MessageHeaderProps) {
  const [showPreheader, setShowPreheader] = useState(!!preheader);
  const [showMergeMenu, setShowMergeMenu] = useState<'subject' | 'preheader' | null>(null);

  const handleSubjectChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip newlines
    const value = e.target.value.replace(/[\r\n]/g, '');
    onSubjectChange(value);
  }, [onSubjectChange]);

  const handlePreheaderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[\r\n]/g, '');
    onPreheaderChange(value);
  }, [onPreheaderChange]);

  const insertFieldInto = (target: 'subject' | 'preheader', key: string) => {
    const insertion = `{{${key}}}`;
    if (target === 'subject') {
      onSubjectChange(subject + insertion);
    } else {
      onPreheaderChange(preheader + insertion);
    }
    setShowMergeMenu(null);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Templates store body content only — subject and preheader belong to the campaign.
  const isCampaign = editorContext === 'campaign';

  if (!isCampaign && attachments.length === 0) return null;

  return (
    <div className="bg-white border-b border-gray-200 flex-shrink-0">
      {/* From / Reply-To row */}
      {editorContext === 'campaign' && senderIdentity && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm border-b border-gray-100">
          <span className="text-gray-500 w-16 text-xs font-medium flex-shrink-0">From:</span>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <User size={14} className="text-gray-400 flex-shrink-0" />
            <span className="font-medium text-gray-700 truncate">
              {senderIdentity.from_name}
            </span>
            <span className="text-gray-500 truncate">
              &lt;{senderIdentity.from_email}&gt;
            </span>
            {senderIdentity.reply_to && (
              <span className="text-gray-500 text-xs ml-2 truncate">
                Reply-To: {senderIdentity.reply_to}
              </span>
            )}
          </div>
          {onChangeSender && (
            <button
              type="button"
              onClick={onChangeSender}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium flex-shrink-0 cursor-pointer"
            >
              Change
            </button>
          )}
        </div>
      )}

      {/* Audience row (campaign only) */}
      {editorContext === 'campaign' && totalRecipients > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 text-sm border-b border-gray-100">
          <span className="text-gray-500 w-16 text-xs font-medium flex-shrink-0">To:</span>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Users size={14} className="text-gray-400 flex-shrink-0" />
            <span className="text-gray-700">
              <span className="font-medium">{totalRecipients.toLocaleString()}</span> valid recipients
            </span>
            {suppressedCount > 0 && (
              <span className="text-gray-500 text-xs">· {suppressedCount} suppressed</span>
            )}
          </div>
          {onViewRecipients && (
            <button
              type="button"
              onClick={onViewRecipients}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium flex-shrink-0 cursor-pointer"
            >
              View recipients
            </button>
          )}
        </div>
      )}

      {/* Subject row */}
      {isCampaign && (
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100">
        <span className="text-gray-500 w-16 text-xs font-medium flex-shrink-0">Subject:</span>
        <div className="flex-1 min-w-0 relative">
          <input
            type="text"
            value={subject}
            onChange={handleSubjectChange}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
            placeholder="Enter subject line…"
            className="w-full text-sm font-medium text-gray-900 bg-transparent border-none outline-none placeholder:text-gray-300 focus:ring-0 p-0"
            aria-label="Email subject"
          />
        </div>
        <span className={`text-xs flex-shrink-0 tabular-nums ${subject.length > 60 ? 'text-amber-600' : 'text-gray-500'}`}>
          {subject.length}/60
        </span>
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowMergeMenu(showMergeMenu === 'subject' ? null : 'subject')}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-brand-600 transition-colors cursor-pointer"
            title="Insert merge field"
            aria-label="Insert merge field into subject"
          >
            <Braces size={14} />
          </button>
          {showMergeMenu === 'subject' && (
            <MergeFieldDropdown
              fields={mergeFields}
              onSelect={(key) => insertFieldInto('subject', key)}
              onClose={() => setShowMergeMenu(null)}
            />
          )}
        </div>
      </div>
      )}

      {/* Preheader row */}
      {isCampaign && (showPreheader ? (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100">
          <span className="text-gray-500 w-16 text-xs font-medium flex-shrink-0">Preview:</span>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={preheader}
              onChange={handlePreheaderChange}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
              placeholder="Preheader text shown in inbox…"
              className="w-full text-sm text-gray-700 bg-transparent border-none outline-none placeholder:text-gray-400 focus:ring-0 p-0"
              aria-label="Preheader text"
            />
          </div>
          <span className={`text-xs flex-shrink-0 tabular-nums ${preheader.length > 100 ? 'text-amber-600' : 'text-gray-500'}`}>
            {preheader.length}/100
          </span>
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowMergeMenu(showMergeMenu === 'preheader' ? null : 'preheader')}
              className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-brand-600 transition-colors cursor-pointer"
              title="Insert merge field"
              aria-label="Insert merge field into preheader"
            >
              <Braces size={14} />
            </button>
            {showMergeMenu === 'preheader' && (
              <MergeFieldDropdown
                fields={mergeFields}
                onSelect={(key) => insertFieldInto('preheader', key)}
                onClose={() => setShowMergeMenu(null)}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => { setShowPreheader(false); onPreheaderChange(''); }}
            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-red-500 transition-colors cursor-pointer"
            title="Remove preheader"
            aria-label="Remove preheader"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="px-4 py-1.5 border-b border-gray-100">
          <button
            type="button"
            onClick={() => setShowPreheader(true)}
            className="text-xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1 cursor-pointer"
          >
            <Plus size={12} /> Add preheader
          </button>
        </div>
      ))}

      {/* Attachments strip */}
      {attachments.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 overflow-x-auto border-b border-gray-100">
          <Paperclip size={14} className="text-gray-400 flex-shrink-0" />
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 text-xs flex-shrink-0">
              <span className="font-medium text-gray-700 max-w-[120px] truncate">{att.filename}</span>
              <span className="text-gray-500">{formatSize(att.size)}</span>
              {onRemoveAttachment && (
                <button
                  type="button"
                  onClick={() => onRemoveAttachment(att.id)}
                  className="text-gray-500 hover:text-red-500 transition-colors cursor-pointer"
                  aria-label={`Remove ${att.filename}`}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Merge Field Dropdown ────────────────────────────────────────────

function MergeFieldDropdown({
  fields,
  onSelect,
  onClose,
}: {
  fields: MergeFieldDefinition[];
  onSelect: (key: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px] max-h-[240px] overflow-y-auto">
        {fields.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-500">No merge fields available</div>
        ) : (
          fields.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => onSelect(f.key)}
              className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2 text-xs cursor-pointer"
            >
              <span className="font-mono text-brand-600 bg-brand-50 px-1 rounded text-[10px]">
                {`{{${f.key}}}`}
              </span>
              <span className="text-gray-600 truncate">{f.label}</span>
              {f.required && <span className="text-red-500 text-[9px] font-bold ml-auto">REQ</span>}
            </button>
          ))
        )}
      </div>
    </>
  );
}
