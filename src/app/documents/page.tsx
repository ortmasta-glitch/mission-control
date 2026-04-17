'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, Upload, Trash2, Download, FileText, AlertTriangle,
  Loader2, FolderOpen, Check, Search, ArrowUpDown, AlertCircle,
  RotateCw, FileDown, Info, XCircle, CheckCircle, Clock,
} from 'lucide-react';
import { formatDistanceToNow, formatISO, parseISO } from 'date-fns';

const CATEGORIES = ['financial', 'advertising', 'hr', 'legal', 'operations'] as const;
type Category = typeof CATEGORIES[number];

const CATEGORY_ICONS: Record<Category, string> = {
  financial: '💰',
  advertising: '📢',
  hr: '👥',
  legal: '⚖️',
  operations: '⚙️',
};

const ACCEPTED_MIME_TYPES: Record<string, string[]> = {
  financial: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf'],
  advertising: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf'],
  hr: ['application/pdf', 'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'],
  legal: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'],
  operations: ['application/pdf', 'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/jpeg', 'image/png'],
};

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function hasPathTraversal(filename: string): boolean {
  const normalized = filename.replace(/\\/g, '/');
  return normalized.includes('..') || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized);
}

type SortMode = 'newest' | 'oldest' | 'largest';
type ParseStatusFilter = 'all' | 'success' | 'failed' | 'pending' | 'partial';

interface Document {
  id: string;
  category: Category;
  filename: string;
  original_name: string;
  size_bytes: number;
  mime_type: string | null;
  uploaded_at: string;
  encrypted: number;
  parse_status?: string | null;
  parse_error?: string | null;
  import_summary?: {
    rows_imported: number;
    rows_skipped: number;
    rows_failed: number;
    parse_status: string | null;
    parse_timestamp: string | null;
    parser_version: string | null;
    import_mode: string | null;
    validation?: {
      required_columns_found: string[];
      required_columns_missing: string[];
      header_normalization_applied: boolean;
      total_rows: number;
      empty_rows_skipped: number;
    };
    errors?: Array<{ row_index: number; reason: string; severity: string }>;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = parseISO(iso);
    return formatISO(d, { representation: 'complete' }).replace('T', ' ').slice(0, 19);
  } catch {
    return iso;
  }
}

function ParseStatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-xs text-mc-text-secondary">Not parsed</span>;
  const config: Record<string, { icon: JSX.Element; color: string; label: string }> = {
    success: { icon: <CheckCircle className="w-3 h-3" />, color: 'text-green-400 bg-green-400/10', label: 'Success' },
    failed: { icon: <XCircle className="w-3 h-3" />, color: 'text-red-400 bg-red-400/10', label: 'Failed' },
    partial: { icon: <AlertCircle className="w-3 h-3" />, color: 'text-yellow-400 bg-yellow-400/10', label: 'Partial' },
    pending: { icon: <Clock className="w-3 h-3" />, color: 'text-mc-text-secondary bg-mc-bg-tertiary', label: 'Pending' },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] ${c.color}`}>
      {c.icon}{c.label}
    </span>
  );
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
  const [importSummary, setImportSummary] = useState<Document['import_summary'] | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [parseStatusFilter, setParseStatusFilter] = useState<ParseStatusFilter>('all');
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
    if (hasPathTraversal(file.name)) {
      setError('Invalid filename: path traversal not allowed');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max: ${MAX_FILE_SIZE / 1024 / 1024} MB`);
      return;
    }

    setUploading(true);
    setError(null);
    setUploadSuccess(false);
    setImportSummary(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', activeCategory);

      const res = await fetch('/api/documents', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Upload failed');

      setUploadSuccess(true);
      setImportSummary(data.import_summary || null);
      await loadDocuments();

      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }, [activeCategory]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) await loadDocuments();
      else throw new Error('Delete failed');
    } catch {
      setError('Failed to delete document');
    }
    setDeleteConfirm(null);
  };

  const handleReparse = async (doc: Document) => {
    try {
      const res = await fetch(`/api/documents/${doc.id}/parse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ import_mode: 'manual' }) });
      const data = await res.json();
      if (res.ok) {
        setImportSummary({
          rows_imported: data.rows_imported,
          rows_skipped: 0,
          rows_failed: data.rows_failed,
          parse_status: data.parse_status,
          parse_timestamp: null,
          parser_version: null,
          import_mode: data.import_mode,
        });
        await loadDocuments();
      } else {
        setError(data.error || 'Re-parse failed');
      }
    } catch {
      setError('Re-parse failed');
    }
  };

  const filteredDocs = documents
    .filter(d => d.category === activeCategory)
    .filter(d => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return d.original_name.toLowerCase().includes(q) || d.filename.toLowerCase().includes(q);
    })
    .filter(d => {
      if (parseStatusFilter === 'all') return true;
      return d.parse_status === parseStatusFilter;
    })
    .sort((a, b) => {
      if (sortMode === 'newest') return new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime();
      if (sortMode === 'oldest') return new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime();
      if (sortMode === 'largest') return b.size_bytes - a.size_bytes;
      return 0;
    });

  const isEmpty = filteredDocs.length === 0;

  return (
    <div className="min-h-screen bg-mc-bg text-mc-text">
      <header className="border-b border-mc-border bg-mc-bg-secondary px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-mc-text-secondary hover:text-mc-text transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <FolderOpen className="w-5 h-5 text-mc-accent" />
        <h1 className="font-semibold text-lg">Document Repository</h1>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Upload success with import summary */}
        {uploadSuccess && importSummary && (
          <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <div className="flex items-center gap-2 text-green-400 mb-2">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Upload successful</span>
            </div>
            <div className="text-sm text-mc-text-secondary grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><span className="opacity-70">Rows imported:</span> <span className="text-mc-text">{importSummary.rows_imported}</span></div>
              <div><span className="opacity-70">Rows skipped:</span> <span className="text-mc-text">{importSummary.rows_skipped}</span></div>
              <div><span className="opacity-70">Rows failed:</span> <span className="text-mc-text">{importSummary.rows_failed}</span></div>
              <div><span className="opacity-70">Parser:</span> <span className="text-mc-text font-mono">{importSummary.parser_version}</span></div>
              {importSummary.validation && (
                <>
                  <div><span className="opacity-70">Columns found:</span> <span className="text-mc-text">{importSummary.validation.required_columns_found.join(', ') || 'none'}</span></div>
                  {importSummary.validation.required_columns_missing.length > 0 && (
                    <div><span className="opacity-70">Columns missing:</span> <span className="text-red-400">{importSummary.validation.required_columns_missing.join(', ')}</span></div>
                  )}
                  {importSummary.errors && importSummary.errors.length > 0 && (
                    <div className="col-span-full">
                      <span className="opacity-70">Errors:</span>
                      <ul className="text-xs mt-1 space-y-0.5">
                        {importSummary.errors.slice(0, 5).map((e, i) => (
                          <li key={i} className="text-red-400">Row {e.row_index}: {e.reason}</li>
                        ))}
                        {importSummary.errors.length > 5 && <li className="text-mc-text-secondary">…and {importSummary.errors.length - 5} more</li>}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-sm underline">Dismiss</button>
          </div>
        )}

        <div className="grid lg:grid-cols-4 gap-4">
          {/* Category sidebar */}
          <div className="lg:col-span-1 space-y-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setParseStatusFilter('all'); setSearchQuery(''); }}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors flex items-center justify-between ${
                  activeCategory === cat 
                    ? 'bg-mc-accent/10 border-mc-accent/30 text-mc-accent' 
                    : 'bg-mc-bg-secondary border-mc-border hover:border-mc-accent/30'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span>{CATEGORY_ICONS[cat]}</span>
                  <span className="capitalize">{cat}</span>
                </span>
                <span className="text-xs opacity-50">{documents.filter(d => d.category === cat).length}</span>
              </button>
            ))}
          </div>

          {/* Document list */}
          <div className="lg:col-span-3">
            {/* Upload zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragOver ? 'border-mc-accent bg-mc-accent/5' : 'border-mc-border hover:border-mc-accent/30'
              }`}
            >
              <Upload className="w-8 h-8 mx-auto mb-3 text-mc-text-secondary opacity-50" />
              <p className="text-sm text-mc-text-secondary mb-2">Drag & drop a file here, or click to select</p>
              <p className="text-xs text-mc-text-secondary opacity-70 mb-4">
                Accepted: {ACCEPTED_MIME_TYPES[activeCategory].join(', ')}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="inline-block px-4 py-2 bg-mc-accent text-mc-bg rounded-lg text-sm font-medium cursor-pointer hover:bg-mc-accent/90">
                {uploading ? 'Uploading…' : 'Select file'}
              </label>
            </div>

            {/* Filters */}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-mc-text-secondary" />
                <input
                  type="text"
                  placeholder="Search files…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-mc-bg-secondary border border-mc-border rounded-lg text-sm focus:outline-none"
                />
              </div>
              <select
                value={parseStatusFilter}
                onChange={e => setParseStatusFilter(e.target.value as ParseStatusFilter)}
                className="px-3 py-2 bg-mc-bg-secondary border border-mc-border rounded-lg text-sm"
              >
                <option value="all">All statuses</option>
                <option value="success">Success</option>
                <option value="partial">Partial</option>
                <option value="failed">Failed</option>
                <option value="pending">Not parsed</option>
              </select>
              <select
                value={sortMode}
                onChange={e => setSortMode(e.target.value as SortMode)}
                className="px-3 py-2 bg-mc-bg-secondary border border-mc-border rounded-lg text-sm"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="largest">Largest first</option>
              </select>
            </div>

            {/* Document table */}
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-6 h-6 animate-spin text-mc-text-secondary" />
              </div>
            ) : isEmpty ? (
              <div className="text-center py-16 text-mc-text-secondary">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>No documents in this category</p>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {filteredDocs.map(doc => (
                  <div key={doc.id} className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4 flex items-center gap-4">
                    <FileText className="w-8 h-8 text-mc-text-secondary opacity-50" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">{doc.original_name}</span>
                        <ParseStatusBadge status={doc.parse_status} />
                      </div>
                      <div className="text-xs text-mc-text-secondary flex items-center gap-3">
                        <span>{formatBytes(doc.size_bytes)}</span>
                        <span>•</span>
                        <span>{formatDistanceToNow(parseISO(doc.uploaded_at), { addSuffix: true })}</span>
                        {doc.parse_error && (
                          <>
                            <span>•</span>
                            <span className="text-red-400 truncate max-w-md">{doc.parse_error}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {(doc.category === 'financial' || doc.category === 'advertising') && (
                        <button
                          onClick={() => handleReparse(doc)}
                          className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
                          title="Re-parse"
                        >
                          <RotateCw className="w-4 h-4" />
                        </button>
                      )}
                      <a
                        href={`/api/documents/${doc.id}/download`}
                        className="p-2 hover:bg-mc-bg-tertiary rounded text-mc-text-secondary"
                        title="Download"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <button
                        onClick={() => setDeleteConfirm(doc.id)}
                        className="p-2 hover:bg-red-500/10 rounded text-red-400"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-6 max-w-md">
            <h3 className="text-lg font-medium mb-2">Delete document?</h3>
            <p className="text-sm text-mc-text-secondary mb-4">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 bg-mc-bg-tertiary rounded-lg">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
