'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, Upload, Trash2, Download, FileText, AlertTriangle,
  Loader2, FolderOpen, Check,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const CATEGORIES = ['financial', 'advertising', 'hr', 'legal', 'operations'] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_ICONS: Record<Category, string> = {
  financial: '💰',
  advertising: '📢',
  hr: '👥',
  legal: '⚖️',
  operations: '⚙️',
};

interface Document {
  id: string;
  category: Category;
  filename: string;
  original_name: string;
  size_bytes: number;
  mime_type: string | null;
  uploaded_at: string;
  encrypted: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function DocumentsPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('financial');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/documents');
      if (res.ok) setDocuments(await res.json());
    } catch {
      setError('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', activeCategory);
      const res = await fetch('/api/documents', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Upload failed');
      }
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
      await loadDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setDocuments(d => d.filter(doc => doc.id !== id));
      setDeleteConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const categoryDocs = documents.filter(d => d.category === activeCategory);

  return (
    <div className="min-h-screen bg-mc-bg text-mc-text">
      {/* Header */}
      <header className="border-b border-mc-border bg-mc-bg-secondary px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-mc-text-secondary hover:text-mc-text transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <FolderOpen className="w-5 h-5 text-mc-accent" />
        <h1 className="font-semibold text-lg">Document Repository</h1>
        <span className="ml-auto text-xs text-mc-text-secondary">{documents.length} documents total</span>
      </header>

      <div className="flex h-[calc(100vh-57px)]">
        {/* Sidebar — categories */}
        <aside className="w-48 border-r border-mc-border bg-mc-bg-secondary flex-shrink-0 py-3">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                activeCategory === cat
                  ? 'bg-mc-accent/10 text-mc-accent border-r-2 border-mc-accent'
                  : 'text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary'
              }`}
            >
              <span>{CATEGORY_ICONS[cat]}</span>
              <span className="capitalize">{cat}</span>
              <span className="ml-auto text-xs opacity-60">
                {documents.filter(d => d.category === cat).length}
              </span>
            </button>
          ))}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-2 mb-6">
              <span className="text-2xl">{CATEGORY_ICONS[activeCategory]}</span>
              <h2 className="text-xl font-semibold capitalize">{activeCategory}</h2>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded flex items-center gap-2 text-red-400 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
                <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400">✕</button>
              </div>
            )}

            {/* Upload success */}
            {uploadSuccess && (
              <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded flex items-center gap-2 text-green-400 text-sm">
                <Check className="w-4 h-4" />
                File uploaded successfully
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`mb-6 border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-mc-accent bg-mc-accent/10'
                  : 'border-mc-border hover:border-mc-accent/50 hover:bg-mc-bg-tertiary'
              }`}
            >
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInput} />
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-mc-accent animate-spin" />
                  <p className="text-sm text-mc-text-secondary">Uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="w-8 h-8 text-mc-text-secondary" />
                  <p className="text-sm font-medium">Drop a file here or click to upload</p>
                  <p className="text-xs text-mc-text-secondary">
                    CSV, XLSX, PDF — stored encrypted at rest
                    {(activeCategory === 'financial' || activeCategory === 'advertising') && (
                      <span className="ml-1 text-mc-accent">· auto-parsed into dashboard</span>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* File list */}
            {loading ? (
              <div className="text-center py-12 text-mc-text-secondary">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                Loading…
              </div>
            ) : categoryDocs.length === 0 ? (
              <div className="text-center py-12 text-mc-text-secondary">
                <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>No documents in {activeCategory} yet</p>
                <p className="text-xs mt-1 opacity-60">Upload a file above to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {categoryDocs.map(doc => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 p-3 bg-mc-bg-secondary border border-mc-border rounded-lg hover:border-mc-border/80 transition-colors"
                  >
                    <FileText className="w-5 h-5 text-mc-text-secondary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.original_name}</p>
                      <p className="text-xs text-mc-text-secondary">
                        {formatBytes(doc.size_bytes)} · {formatDistanceToNow(new Date(doc.uploaded_at), { addSuffix: true })}
                        {doc.encrypted ? ' · 🔒' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={`/api/documents/${doc.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-mc-text-secondary hover:text-mc-text hover:bg-mc-bg-tertiary rounded transition-colors"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      {deleteConfirm === doc.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(doc.id)}
                            className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-2 py-1 text-xs border border-mc-border rounded text-mc-text-secondary hover:text-mc-text"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(doc.id)}
                          className="p-2 text-mc-text-secondary hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
