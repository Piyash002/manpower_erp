'use client';

import React, { useRef, useState } from 'react';
import { Upload, ExternalLink, X, Loader2 } from 'lucide-react';

interface DocumentUploadFieldProps {
  label?: string;
  value: string;
  onChange: (url: string) => void;
}

export function DocumentUploadField({
  label = 'Supporting Document / Proof (Optional)',
  value,
  onChange,
}: DocumentUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  const handleFile = async (file: File) => {
    setUploading(true);
    setUploadErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'receipt_proof');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!json.success || !json.url) {
        throw new Error(json.message || 'Upload failed');
      }
      onChange(json.url);
    } catch (err: any) {
      setUploadErr(err?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-1">
      <label className="block font-medium text-slate-700">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Upload className="w-3.5 h-3.5" />
          )}
          {uploading ? 'Uploading...' : value ? 'Replace File' : 'Upload File'}
        </button>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Or paste document URL..."
          className="flex-1 min-w-[160px] border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs bg-white"
        />
        {value && (
          <>
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-[11px] font-medium hover:bg-emerald-100"
            >
              <ExternalLink className="w-3 h-3" /> View
            </a>
            <button
              type="button"
              onClick={() => onChange('')}
              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100"
              title="Clear attachment"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
      {uploadErr && <div className="text-[11px] text-rose-600">{uploadErr}</div>}
    </div>
  );
}

