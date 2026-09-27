import { useState } from 'react';
import { ChevronDown, Plus, AlertCircle } from 'lucide-react';
import type { MergeFieldDefinition } from '../types';

interface MergeFieldPickerProps {
  mode: 'template' | 'campaign_scratch' | 'campaign_with_template';
  campaignFields?: MergeFieldDefinition[];
  templateFields?: MergeFieldDefinition[];
  onInsert: (key: string) => void;
  onNavigateToMapping?: () => void;
}

export default function MergeFieldPicker({
  mode,
  campaignFields = [],
  templateFields = [],
  onInsert,
  onNavigateToMapping,
}: MergeFieldPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const allFields = mode === 'template'
    ? templateFields
    : mode === 'campaign_scratch'
    ? campaignFields
    : [...templateFields, ...campaignFields.filter(cf => !templateFields.some(tf => tf.key === cf.key))];

  const systemFields = allFields.filter(f => f.is_system);
  const uploadedFields = allFields.filter(f => f.source_kind === 'uploaded_column');
  const customFields = allFields.filter(f => f.source_kind === 'custom' && !f.is_system);

  const hasAnyFields = allFields.length > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 transition-colors"
        title="Insert merge field"
      >
        <Plus size={14} />
        <span className="hidden sm:inline">Merge Field</span>
        <ChevronDown size={12} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-50 w-72 max-h-80 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
            {!hasAnyFields ? (
              <div className="p-4 text-center">
                <AlertCircle size={20} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm text-gray-500 mb-2">No merge fields available</p>
                <p className="text-xs text-gray-400 mb-3">
                  {mode === 'template'
                    ? 'Add template arguments in the panel below.'
                    : 'Map fields in the Map Columns step to create merge fields.'}
                </p>
                {onNavigateToMapping && mode !== 'template' && (
                  <button
                    onClick={() => { setIsOpen(false); onNavigateToMapping(); }}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    Go to Map Columns →
                  </button>
                )}
              </div>
            ) : (
              <div className="p-2">
                {systemFields.length > 0 && (
                  <FieldGroup label="System" fields={systemFields} onInsert={(key) => { onInsert(key); setIsOpen(false); }} />
                )}
                {uploadedFields.length > 0 && (
                  <FieldGroup label="Recipient Fields" fields={uploadedFields} onInsert={(key) => { onInsert(key); setIsOpen(false); }} />
                )}
                {customFields.length > 0 && (
                  <FieldGroup label="Custom Fields" fields={customFields} onInsert={(key) => { onInsert(key); setIsOpen(false); }} />
                )}
                {mode === 'campaign_with_template' && templateFields.length > 0 && (
                  <FieldGroup label="Template Arguments" fields={templateFields} onInsert={(key) => { onInsert(key); setIsOpen(false); }} />
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FieldGroup({ label, fields, onInsert }: { label: string; fields: MergeFieldDefinition[]; onInsert: (key: string) => void }) {
  return (
    <div className="mb-1">
      <p className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      {fields.map(field => (
        <button
          key={field.key}
          onClick={() => onInsert(field.key)}
          className="w-full flex items-center justify-between px-2 py-1.5 text-left rounded-lg hover:bg-purple-50 transition-colors group"
        >
          <div className="min-w-0">
            <span className="text-sm text-gray-700 group-hover:text-purple-700">{field.label}</span>
            <span className="ml-2 text-[10px] font-mono text-purple-400">{`{{${field.key}}}`}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {field.required && <span className="text-[9px] text-red-400 font-medium">REQ</span>}
          </div>
        </button>
      ))}
    </div>
  );
}
