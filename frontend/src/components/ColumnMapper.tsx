import type { ColumnMapping } from '../types';

interface Props {
  columns: string[];
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}

export default function ColumnMapper({ columns, mapping, onChange }: Props) {
  const updateMapping = (updates: Partial<ColumnMapping>) => {
    onChange({ ...mapping, ...updates });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email Column <span className="text-red-500">*</span>
          </label>
          <select
            value={mapping.email_column}
            onChange={(e) => updateMapping({ email_column: e.target.value })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Select column...</option>
            {columns.map((col) => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name Column</label>
          <select
            value={mapping.name_column || ''}
            onChange={(e) => updateMapping({ name_column: e.target.value || undefined })}
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Select column...</option>
            {columns.map((col) => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Map your email column (required) and optional name column. Use the Merge Fields section below to map additional columns as personalization variables.
      </p>
    </div>
  );
}
