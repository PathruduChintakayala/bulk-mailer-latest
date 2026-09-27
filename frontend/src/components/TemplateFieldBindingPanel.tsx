import { useState, useEffect } from 'react';
import { Check, AlertTriangle, AlertCircle, ChevronDown } from 'lucide-react';
import type { MergeFieldDefinition, TemplateFieldBinding } from '../types';

interface TemplateFieldBindingPanelProps {
  templateFields: MergeFieldDefinition[];
  campaignFields: MergeFieldDefinition[];
  initialBindings: TemplateFieldBinding[];
  sampleValues: Record<string, string>;
  onApply: (bindings: TemplateFieldBinding[]) => void;
  onCancel: () => void;
}

export default function TemplateFieldBindingPanel({
  templateFields,
  campaignFields,
  initialBindings,
  sampleValues,
  onApply,
  onCancel,
}: TemplateFieldBindingPanelProps) {
  const [bindings, setBindings] = useState<TemplateFieldBinding[]>(initialBindings);

  useEffect(() => {
    setBindings(initialBindings);
  }, [initialBindings]);

  const updateBinding = (templateKey: string, campaignKey: string | null) => {
    setBindings(prev =>
      prev.map(b =>
        b.template_field_key === templateKey
          ? { ...b, campaign_field_key: campaignKey || null }
          : b
      )
    );
  };

  const getStatus = (tf: MergeFieldDefinition): 'mapped' | 'using_default' | 'required_missing' | 'unresolved' => {
    const binding = bindings.find(b => b.template_field_key === tf.key);
    const hasCampaignField = !!binding?.campaign_field_key;
    const hasDefault = !!tf.default_value;

    if (hasCampaignField) return 'mapped';
    if (hasDefault) return 'using_default';
    if (tf.required) return 'required_missing';
    return 'unresolved';
  };

  const hasBlockingErrors = templateFields.some(tf => getStatus(tf) === 'required_missing');

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-800">Map Template Fields</h3>
        <p className="text-sm text-gray-500 mt-1">
          Connect template arguments to your campaign's data fields.
        </p>
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_1fr_auto_auto] gap-3 px-4 py-2 bg-gray-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b">
          <span>Template Field</span>
          <span>Req</span>
          <span>Map to Campaign Field</span>
          <span>Sample</span>
          <span>Status</span>
        </div>

        {templateFields.map(tf => {
          const status = getStatus(tf);
          const binding = bindings.find(b => b.template_field_key === tf.key);
          const sampleVal = binding?.campaign_field_key ? sampleValues[binding.campaign_field_key] : tf.default_value;

          return (
            <div key={tf.key} className="grid grid-cols-[1fr_auto_1fr_auto_auto] gap-3 px-4 py-3 border-b border-gray-100 items-center last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">{tf.label || tf.key}</p>
                <p className="text-[10px] font-mono text-purple-400">{`{{${tf.key}}}`}</p>
              </div>

              <div className="w-8 text-center">
                {tf.required && <span className="text-[10px] text-red-500 font-bold">Yes</span>}
              </div>

              <div className="relative">
                <select
                  value={binding?.campaign_field_key || ''}
                  onChange={(e) => updateBinding(tf.key, e.target.value || null)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white appearance-none pr-8 focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                >
                  <option value="">— Not mapped —</option>
                  {campaignFields.map(cf => (
                    <option key={cf.key} value={cf.key}>{cf.label || cf.key}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>

              <div className="w-24 truncate">
                <span className="text-xs text-gray-400">{sampleVal || '—'}</span>
              </div>

              <div className="w-20">
                <StatusBadge status={status} defaultValue={tf.default_value} />
              </div>
            </div>
          );
        })}
      </div>

      {hasBlockingErrors && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">
            One or more required fields have no mapping and no default value. Please map them before applying.
          </p>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
          Cancel
        </button>
        <button
          onClick={() => onApply(bindings)}
          disabled={hasBlockingErrors}
          className="px-5 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={hasBlockingErrors ? 'Resolve required field mappings first' : 'Apply template with these bindings'}
        >
          Apply Template
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status, defaultValue }: { status: string; defaultValue?: string | null }) {
  switch (status) {
    case 'mapped':
      return (
        <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
          <Check size={10} /> Mapped
        </span>
      );
    case 'using_default':
      return (
        <span className="flex items-center gap-1 text-[10px] text-amber-600 font-medium" title={`Default: ${defaultValue}`}>
          <Check size={10} /> Default
        </span>
      );
    case 'required_missing':
      return (
        <span className="flex items-center gap-1 text-[10px] text-red-600 font-medium">
          <AlertTriangle size={10} /> Required
        </span>
      );
    default:
      return (
        <span className="text-[10px] text-gray-400">Empty</span>
      );
  }
}
