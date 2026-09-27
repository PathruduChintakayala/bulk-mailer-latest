import type { Editor } from '@tiptap/react';
import { useState } from 'react';
import {
  Braces, Search, AlertTriangle, CheckCircle, Highlighter,
} from 'lucide-react';
import type { MergeFieldDefinition } from '../../types';
import ToolbarButton from './ToolbarButton';

interface Props {
  editor: Editor;
  mergeFields: MergeFieldDefinition[];
  onInsertMergeField: (key: string) => void;
  validationIssues?: { type: string; message: string }[];
}

export default function PersonalizeTab({ mergeFields, onInsertMergeField, validationIssues = [] }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightFields, setHighlightFields] = useState(false);

  const filtered = mergeFields.filter(f =>
    f.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const systemFields = filtered.filter(f => f.is_system);
  const uploadedFields = filtered.filter(f => f.source_kind === 'uploaded_column' && !f.is_system);
  const customFields = filtered.filter(f => f.source_kind === 'custom' && !f.is_system);

  const issueCount = validationIssues.length;

  return (
    <div className="flex items-start gap-3 px-3 py-2 min-h-[40px]">
      {/* Search + Field Picker */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1 max-w-[220px]">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search fields…"
              className="w-full text-xs pl-7 pr-2 py-1.5 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-1 focus:ring-brand-500/30 outline-none"
              aria-label="Search merge fields"
            />
          </div>
          <ToolbarButton
            onClick={() => setHighlightFields(!highlightFields)}
            active={highlightFields}
            title="Highlight personalized content"
            aria-label="Highlight personalized content"
          >
            <Highlighter size={14} />
          </ToolbarButton>
          {issueCount > 0 && (
            <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              <AlertTriangle size={12} /> {issueCount}
            </span>
          )}
          {issueCount === 0 && mergeFields.length > 0 && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <CheckCircle size={12} /> All valid
            </span>
          )}
        </div>

        {/* Field Groups */}
        <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto">
          {uploadedFields.length > 0 && (
            <FieldGroup label="Recipient" fields={uploadedFields} onInsert={onInsertMergeField} />
          )}
          {customFields.length > 0 && (
            <FieldGroup label="Custom" fields={customFields} onInsert={onInsertMergeField} />
          )}
          {systemFields.length > 0 && (
            <FieldGroup label="System" fields={systemFields} onInsert={onInsertMergeField} />
          )}
          {filtered.length === 0 && (
            <span className="text-xs text-gray-400 py-1">
              {searchTerm ? 'No fields match' : 'No merge fields configured'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function FieldGroup({ label, fields, onInsert }: { label: string; fields: MergeFieldDefinition[]; onInsert: (key: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide mr-1">{label}:</span>
      {fields.map(f => (
        <button
          key={f.key}
          onClick={() => onInsert(f.key)}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-brand-50 text-brand-700 hover:bg-brand-100 rounded-md border border-brand-200/50 transition-colors"
          title={`Insert {{${f.key}}}${f.default_value ? ` (default: ${f.default_value})` : ''}`}
          aria-label={`Insert ${f.label} merge field`}
        >
          <Braces size={10} />
          {f.label}
          {f.required && <span className="text-red-500 text-[9px]">*</span>}
        </button>
      ))}
    </div>
  );
}
