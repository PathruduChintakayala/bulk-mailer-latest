import React, { useState, useCallback } from 'react';
import { Plus, X, Tag, FileSpreadsheet, PenLine } from 'lucide-react';

export interface MergeFieldDef {
  name: string;
  label: string;
  defaultValue: string;
  source: 'manual' | 'csv';
}

interface MergeFieldManagerProps {
  fields: MergeFieldDef[];
  onChange: (fields: MergeFieldDef[]) => void;
  csvColumns?: string[];
  compact?: boolean;
}

const sanitizeVariableName = (input: string): string => {
  return input.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').replace(/_+/g, '_');
};

const MergeFieldManager: React.FC<MergeFieldManagerProps> = ({
  fields,
  onChange,
  csvColumns = [],
  compact = false,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newDefault, setNewDefault] = useState('');
  const [error, setError] = useState('');

  const addField = useCallback(() => {
    const sanitized = sanitizeVariableName(newName);
    if (!sanitized) {
      setError('Variable name is required');
      return;
    }
    if (fields.some(f => f.name === sanitized)) {
      setError('This variable name already exists');
      return;
    }
    onChange([...fields, { name: sanitized, label: newLabel || sanitized, defaultValue: newDefault, source: 'manual' }]);
    setNewName('');
    setNewLabel('');
    setNewDefault('');
    setError('');
    setIsAdding(false);
  }, [newName, newLabel, newDefault, fields, onChange]);

  const addFromCsv = useCallback((column: string) => {
    const sanitized = sanitizeVariableName(column);
    if (fields.some(f => f.name === sanitized)) return;
    onChange([...fields, { name: sanitized, label: column, defaultValue: '', source: 'csv' }]);
  }, [fields, onChange]);

  const removeField = useCallback((name: string) => {
    onChange(fields.filter(f => f.name !== name));
  }, [fields, onChange]);

  const unusedCsvColumns = csvColumns.filter(col => !fields.some(f => f.name === sanitizeVariableName(col)));

  return (
    <div className={`${compact ? '' : 'bg-white rounded-lg border border-gray-200 p-4'}`}>
      {!compact && (
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Tag size={14} />
            Merge Fields
          </h4>
          <span className="text-xs text-gray-400">{fields.length} field{fields.length !== 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Existing Fields */}
      {fields.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {fields.map(field => (
            <div
              key={field.name}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-100 group"
            >
              <code className="text-xs font-mono text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                {`{{${field.name}}}`}
              </code>
              <span className="text-xs text-gray-500 flex-1 truncate">{field.label}</span>
              <input
                type="text"
                value={field.defaultValue}
                onChange={e => {
                  onChange(fields.map(f =>
                    f.name === field.name ? { ...f, defaultValue: e.target.value } : f
                  ));
                }}
                placeholder="Default value"
                className="text-xs text-gray-600 border border-transparent hover:border-gray-200 focus:border-brand-300 rounded px-1.5 py-0.5 w-28 sm:w-36 outline-none bg-transparent focus:bg-white"
                title="Default value used when recipient data is missing"
              />
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                field.source === 'csv' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'
              }`}>
                {field.source === 'csv' ? <FileSpreadsheet size={10} className="inline mr-0.5" /> : <PenLine size={10} className="inline mr-0.5" />}
                {field.source}
              </span>
              <button
                type="button"
                onClick={() => removeField(field.name)}
                className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 text-gray-500 hover:text-red-500 transition-all cursor-pointer"
                title="Remove"
                aria-label={`Remove merge field ${field.name}`}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* CSV Quick-add */}
      {unusedCsvColumns.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-1.5">Add from CSV columns:</p>
          <div className="flex flex-wrap gap-1.5">
            {unusedCsvColumns.map(col => (
              <button
                key={col}
                onClick={() => addFromCsv(col)}
                className="text-xs px-2 py-1 rounded-full border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
              >
                <Plus size={10} className="inline mr-0.5" />
                {col}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Add Custom Field */}
      {isAdding ? (
        <div className="border border-blue-200 rounded-lg p-3 bg-blue-50/50">
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase">Variable Name</label>
              <input
                type="text"
                value={newName}
                onChange={e => { setNewName(e.target.value); setError(''); }}
                placeholder="e.g. company_name"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 mt-0.5 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && addField()}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase">Display Label</label>
              <input
                type="text"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="e.g. Company Name"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 mt-0.5 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none"
                onKeyDown={e => e.key === 'Enter' && addField()}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase">Default Value</label>
              <input
                type="text"
                value={newDefault}
                onChange={e => setNewDefault(e.target.value)}
                placeholder="e.g. Valued Customer"
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 mt-0.5 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none"
                onKeyDown={e => e.key === 'Enter' && addField()}
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={addField}
              className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium"
            >
              Add Field
            </button>
            <button
              onClick={() => { setIsAdding(false); setError(''); }}
              className="text-xs px-3 py-1.5 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 hover:underline"
        >
          <Plus size={12} />
          Add custom merge field
        </button>
      )}
    </div>
  );
};

export default MergeFieldManager;
