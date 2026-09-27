import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import api from '../services/api';
import type { UploadResponse } from '../types';
import toast from 'react-hot-toast';
import { Upload, FileSpreadsheet } from 'lucide-react';

interface Props {
  campaignCode: string;
  onUploadComplete: (result: UploadResponse) => void;
}

export default function FileUpload({ campaignCode, onUploadComplete }: Props) {
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
      toast.error('Only CSV and Excel files are supported');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post(`/campaigns/${campaignCode}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`File uploaded: ${res.data.total_rows} rows detected`);
      onUploadComplete(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    }
  }, [campaignCode, onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition ${
        isDragActive
          ? 'border-brand-500 bg-brand-50'
          : 'border-gray-300 hover:border-brand-400 hover:bg-gray-50'
      }`}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center">
        {isDragActive ? (
          <Upload className="w-12 h-12 text-brand-500 mb-4" />
        ) : (
          <FileSpreadsheet className="w-12 h-12 text-gray-400 mb-4" />
        )}
        <p className="text-lg font-medium text-gray-700">
          {isDragActive ? 'Drop file here' : 'Drag & drop your file here'}
        </p>
        <p className="text-sm text-gray-400 mt-1">or click to browse</p>
        <p className="text-xs text-gray-400 mt-3">Supports CSV, XLSX, XLS — up to 50K rows</p>
      </div>
    </div>
  );
}
