"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Brain,
  Search,
  ChevronRight,
  ChevronDown,
  Trash2,
  Copy,
  Pencil,
  ClipboardCopy,
  ExternalLink,
  RefreshCw,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineMarkdownEditor } from "./inline-markdown-editor";
import {
  vectorBadge,
  formatBytes,
  formatAgo,
  shortWorkspace,
  normalizeMemoryPath,
  journalKey,
  agentMemoryKey,
  selectedJournalFile,
  selectedAgentId,
  parseDateLike,
  getPeriodKey,
  groupByPeriod,
  BouncingDots,
} from "./utils";
import type {
  VectorState,
  DailyEntry,
  MemoryMd,
  AgentMemoryFile,
  WorkspaceFile,
  DetailMeta,
  CtxMenuState,
} from "./types";

const WORKSPACE_FILES_COLLAPSED_KEY = "memory.workspace-files-collapsed";

export function MemoryView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [daily, setDaily] = useState<DailyEntry[]>([]);
  const [memoryMd, setMemoryMd] = useState<MemoryMd>(null);
  const [agentMemoryFiles, setAgentMemoryFiles] = useState<AgentMemoryFile[]>([]);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [ensuringIndex, setEnsuringIndex] = useState(false);
  const [selected, setSelected] = useState<string | null>("memory");
  const [detailContent, setDetailContent] = useState<string | null>(null);
  const [detailMeta, setDetailMeta] = useState<DetailMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | null>(null);
  const [indexingFile, setIndexingFile] = useState<string | null>(null);
  const [reindexingAll, setReindexingAll] = useState(false);
  const [collapsedPeriods, setCollapsedPeriods] = useState<Set<string>>(new Set());
  const [workspaceFilesCollapsed, setWorkspaceFilesCollapsed] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitializedCollapse = useRef(false);
  const hasLoadedWorkspaceFilesCollapse = useRef(false);
  const jumpTarget = searchParams.get("memoryPath") || searchParams.get("memoryFile");
  const jumpLine = searchParams.get("memoryLine");
  const [scrollToLine, setScrollToLine] = useState<number | null>(null);

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState>(null);
  const [renaming, setRenaming] = useState<DailyEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<DailyEntry | null>(null);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  // ── Save ──────────────────────────────────────────────

  const saveContent = useCallback(
    async (content: string) => {
      if (!detailMeta) return;
      if (detailMeta.kind === "workspace-file") return;
      setSaveStatus("saving");
      try {
        let body: Record<string, unknown> = { content };
        if (detailMeta.kind === "journal") {
          if (!detailMeta.fileName) throw new Error("missing journal file name");
          body = { file: detailMeta.fileName, content };
        } else if (detailMeta.kind === "agent-memory") {
          if (!detailMeta.agentId) throw new Error("missing agent id");
          body = { agentMemory: detailMeta.agentId, content };
        }

        const res = await fetch("/api/memory", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const data = await res.json();
          setDetailContent(content);
          setDetailMeta((m) =>
            m
              ? {
                  ...m,
                  words: data.words || content.split(/\s+/).filter(Boolean).length,
                  size: data.size || new TextEncoder().encode(content).length,
                }
              : null
          );
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus(null), 2000);
        } else {
          setSaveStatus("unsaved");
        }
      } catch {
        setSaveStatus("unsaved");
      }
    },
    [detailMeta]
  );

  const handleContentChange = useCallback(
    (newMarkdown: string) => {
      setSaveStatus("unsaved");
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        void saveContent(newMarkdown);
      }, 300);
    },
    [saveContent]
  );

  const handleSave = useCallback(
    (markdown: string) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      void saveContent(markdown);
    },
    [saveContent]
  );

  // ── Context menu ─────────────────────────────────────

  useEffect(() => {
    if (!ctxMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [ctxMenu]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, entry: DailyEntry) => {
      e.preventDefault();
      e.stopPropagation();
      setCtxMenu({ x: e.clientX, y: e.clientY, entry });
    },
    []
  );

  // ── Select / load ─────────────────────────────────────

  const selectLongTermMemory = useCallback(() => {
    if (!memoryMd) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSelected("memory");
    setSaveStatus(null);
    setDetailContent(memoryMd.content);
    setDetailMeta({
      title: "Core Workspace MEMORY.md",
      words: memoryMd.words,
      size: memoryMd.size,
      fileKey: "memory-core",
      mtime: memoryMd.mtime,
      kind: "core",
      vectorState: memoryMd.vectorState,
      workspace: "default",
    });
  }, [memoryMd]);

  const loadJournalFile = useCallback((file: string, title: string) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSelected(journalKey(file));
    setSaveStatus(null);
    fetch(`/api/memory?file=${encodeURIComponent(file)}`)
      .then((r) => r.json())
      .then((data) => {
        setDetailContent(data.content || "");
        setDetailMeta({
          title,
          words: data.words,
          size: data.size,
          fileKey: journalKey(file),
          fileName: file,
          kind: "journal",
          mtime: data.mtime,
          vectorState: daily.find((d) => d.name === file)?.vectorState,
          workspace: "default/memory",
        });
      })
      .catch(() => {
        setDetailContent("Failed to load.");
        setDetailMeta({
          title,
          fileKey: journalKey(file),
          fileName: file,
          kind: "journal",
        });
      });
  }, [daily]);

  const selectAgentMemory = useCallback((entry: AgentMemoryFile) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSelected(agentMemoryKey(entry.agentId));
    setSaveStatus(null);
    fetch(`/api/memory?agentMemory=${encodeURIComponent(entry.agentId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(String(data.error));
        setDetailContent(String(data.content || ""));
        setDetailMeta({
          title: `${entry.agentName} · ${entry.fileName}`,
          words: Number(data.words || 0),
          size: Number(data.size || 0),
          fileKey: agentMemoryKey(entry.agentId),
          kind: "agent-memory",
          mtime: data.mtime,
          vectorState: (data.vectorState as VectorState) || entry.vectorState,
          workspace: entry.workspace,
          agentId: entry.agentId,
        });
      })
      .catch(() => {
        setDetailContent(entry.exists ? "Failed to load." : "");
        setDetailMeta({
          title: `${entry.agentName} · ${entry.fileName}`,
          words: entry.words,
          size: entry.size,
          fileKey: agentMemoryKey(entry.agentId),
          kind: "agent-memory",
          mtime: entry.mtime,
          vectorState: entry.vectorState,
          workspace: entry.workspace,
          agentId: entry.agentId,
        });
      });
  }, []);

  const loadWorkspaceFile = useCallback((file: WorkspaceFile) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const key = `workspace:${file.name}`;
    setSelected(key);
    setSaveStatus(null);
    fetch(`/api/memory?file=${encodeURIComponent(file.name)}&workspaceRoot=1`)
      .then((r) => r.json())
      .then((data) => {
        setDetailContent(String(data.content || ""));
        setDetailMeta({
          title: file.name,
          words: data.words ?? file.words,
          size: data.size ?? file.size,
          fileKey: key,
          fileName: file.name,
          kind: "workspace-file",
          mtime: data.mtime ?? file.mtime,
          vectorState: file.vectorState,
        });
      })
      .catch(() => {
        setDetailContent("Failed to load.");
        setDetailMeta({
          title: file.name,
          words: file.words,
          size: file.size,
          fileKey: key,
          fileName: file.name,
          kind: "workspace-file",
          mtime: file.mtime,
          vectorState: file.vectorState,
        });
      });
  }, []);

  // ── Fetch ─────────────────────────────────────────────

  const fetchMemoryData = useCallback(async (initializeDetail = false) => {
    setLoading(true);
    try {
      const r = await fetch("/api/memory");
      const data = await r.json();
      const nextDaily = Array.isArray(data.daily) ? (data.daily as DailyEntry[]) : [];
      const nextAgents = Array.isArray(data.agentMemoryFiles)
        ? (data.agentMemoryFiles as AgentMemoryFile[])
        : [];
      const nextCore = (data.memoryMd || null) as MemoryMd;
      const nextWorkspaceFiles = Array.isArray(data.workspaceFiles)
        ? (data.workspaceFiles as WorkspaceFile[])
        : [];

      setDaily(nextDaily);
      setMemoryMd(nextCore);
      setAgentMemoryFiles(nextAgents);
      setWorkspaceFiles(nextWorkspaceFiles);

      if (!initializeDetail) return;
      if (nextCore) {
        setDetailContent(nextCore.content);
        setDetailMeta({
          title: "Core Workspace MEMORY.md",
          words: nextCore.words,
          size: nextCore.size,
          fileKey: "memory-core",
          mtime: nextCore.mtime,
          kind: "core",
          vectorState: nextCore.vectorState,
          workspace: "default",
        });
        setSelected("memory");
      } else if (nextAgents.length > 0) {
        selectAgentMemory(nextAgents[0]);
      }
    } finally {
      setLoading(false);
    }
  }, [selectAgentMemory]);

  // ── Mutations ─────────────────────────────────────────

  const deleteEntry = useCallback(
    async (entry: DailyEntry) => {
      try {
        const res = await fetch(
          `/api/memory?file=${encodeURIComponent(entry.name)}`,
          { method: "DELETE" }
        );
        const data = await res.json();
        if (data.ok) {
          setDaily((prev) => prev.filter((d) => d.name !== entry.name));
          if (selected === journalKey(entry.name)) {
            if (memoryMd) {
              selectLongTermMemory();
            } else {
              setSelected(null);
              setDetailContent(null);
              setDetailMeta(null);
            }
          }
          setActionMsg({ ok: true, msg: `Deleted ${entry.name}` });
        } else {
          setActionMsg({ ok: false, msg: data.error || "Delete failed" });
        }
      } catch {
        setActionMsg({ ok: false, msg: "Delete failed" });
      }
      setConfirmDelete(null);
      setTimeout(() => setActionMsg(null), 3000);
    },
    [memoryMd, selectLongTermMemory, selected]
  );

  const renameEntry = useCallback(
    async (entry: DailyEntry, newName: string) => {
      if (!newName.trim() || newName === entry.name) {
        setRenaming(null);
        return;
      }
      try {
        const res = await fetch("/api/memory", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rename", file: entry.name, newName }),
        });
        const data = await res.json();
        if (data.ok) {
          setDaily((prev) =>
            prev.map((d) =>
              d.name === entry.name ? { ...d, name: data.file } : d
            )
          );
          if (selected === journalKey(entry.name)) {
            setSelected(journalKey(data.file));
            setDetailMeta((m) =>
              m
                ? { ...m, fileKey: journalKey(data.file), fileName: data.file, title: data.file }
                : null
            );
          }
          setActionMsg({ ok: true, msg: `Renamed to ${data.file}` });
        } else {
          setActionMsg({ ok: false, msg: data.error || "Rename failed" });
        }
      } catch {
        setActionMsg({ ok: false, msg: "Rename failed" });
      }
      setRenaming(null);
      setTimeout(() => setActionMsg(null), 3000);
    },
    [selected]
  );

  const duplicateEntry = useCallback(async (entry: DailyEntry) => {
    try {
      const res = await fetch("/api/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate", file: entry.name }),
      });
      const data = await res.json();
      if (data.ok) {
        await fetchMemoryData();
        setActionMsg({ ok: true, msg: `Duplicated as ${data.file}` });
      } else {
        setActionMsg({ ok: false, msg: data.error || "Duplicate failed" });
      }
    } catch {
      setActionMsg({ ok: false, msg: "Duplicate failed" });
    }
    setTimeout(() => setActionMsg(null), 3000);
  }, [fetchMemoryData]);

  const copyEntryName = useCallback((entry: DailyEntry) => {
    navigator.clipboard.writeText(entry.name).then(() => {
      setActionMsg({ ok: true, msg: "Filename copied to clipboard" });
      setTimeout(() => setActionMsg(null), 2000);
    });
  }, []);

  const indexJournalEntry = useCallback(
    async (entry: DailyEntry) => {
      const key = journalKey(entry.name);
      if (indexingFile) return;
      setIndexingFile(key);
      try {
        const res = await fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "index-memory", file: entry.name }),
        });
        const data = await res.json();
        if (data.ok) {
          await fetchMemoryData();
          setActionMsg({ ok: true, msg: `Indexed ${entry.name}` });
        } else {
          setActionMsg({ ok: false, msg: data.error || "Indexing failed" });
        }
      } catch {
        setActionMsg({ ok: false, msg: "Indexing failed" });
      } finally {
        setIndexingFile(null);
        setTimeout(() => setActionMsg(null), 3000);
      }
    },
    [fetchMemoryData, indexingFile]
  );

  const indexAgentMemory = useCallback(
    async (entry: AgentMemoryFile) => {
      const key = agentMemoryKey(entry.agentId);
      if (indexingFile) return;
      setIndexingFile(key);
      try {
        const res = await fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "index-memory",
            agentId: entry.agentId,
            file: entry.fileName,
          }),
        });
        const data = await res.json();
        if (data.ok) {
          await fetchMemoryData();
          setActionMsg({ ok: true, msg: `Indexed ${entry.agentName} memory` });
        } else {
          setActionMsg({ ok: false, msg: data.error || "Indexing failed" });
        }
      } catch {
        setActionMsg({ ok: false, msg: "Indexing failed" });
      } finally {
        setIndexingFile(null);
        setTimeout(() => setActionMsg(null), 3000);
      }
    },
    [fetchMemoryData, indexingFile]
  );

  const ensureWorkspaceIndex = useCallback(async () => {
    if (ensuringIndex) return;
    setEnsuringIndex(true);
    try {
      const res = await fetch("/api/vector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ensure-extra-paths" }),
      });
      const data = await res.json();
      if (data.ok) {
        await fetchMemoryData();
        setActionMsg({ ok: true, msg: "Workspace files added to index" });
      } else {
        setActionMsg({ ok: false, msg: data.error || "Index failed" });
      }
    } catch {
      setActionMsg({ ok: false, msg: "Index failed" });
    } finally {
      setEnsuringIndex(false);
      setTimeout(() => setActionMsg(null), 3000);
    }
  }, [ensuringIndex, fetchMemoryData]);

  const reindexAllMemory = useCallback(async () => {
    if (reindexingAll) return;
    setReindexingAll(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "index-memory", force: true }),
      });
      const data = await res.json();
      if (data.ok) {
        await fetchMemoryData();
        setActionMsg({ ok: true, msg: "Full memory reindex completed" });
      } else {
        setActionMsg({ ok: false, msg: data.error || "Reindex failed" });
      }
    } catch {
      setActionMsg({ ok: false, msg: "Reindex failed" });
    } finally {
      setReindexingAll(false);
      setTimeout(() => setActionMsg(null), 3000);
    }
  }, [fetchMemoryData, reindexingAll]);

  // ── Effects ───────────────────────────────────────────

  useEffect(() => {
    void fetchMemoryData(true);
  }, [fetchMemoryData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(WORKSPACE_FILES_COLLAPSED_KEY);
      if (raw == null) return;
      setWorkspaceFilesCollapsed(raw === "1");
    } catch {
      // ignore
    } finally {
      hasLoadedWorkspaceFilesCollapse.current = true;
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasLoadedWorkspaceFilesCollapse.current) return;
    try {
      window.localStorage.setItem(
        WORKSPACE_FILES_COLLAPSED_KEY,
        workspaceFilesCollapsed ? "1" : "0"
      );
    } catch {
      // ignore
    }
  }, [workspaceFilesCollapsed]);

  const clearSearchJumpParams = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    let changed = false;
    for (const key of ["memoryPath", "memoryFile", "memoryLine", "memoryQuery"]) {
      if (next.has(key)) {
        next.delete(key);
        changed = true;
      }
    }
    if (!changed) return;
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  // ── Computed ──────────────────────────────────────────

  const filteredDaily = useMemo(() => {
    if (!search.trim()) return daily;
    const q = search.toLowerCase();
    return daily.filter(
      (e) => e.date.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)
    );
  }, [daily, search]);

  const filteredAgentMemories = useMemo(() => {
    if (!search.trim()) return agentMemoryFiles;
    const q = search.toLowerCase();
    return agentMemoryFiles.filter((entry) => {
      return (
        entry.agentName.toLowerCase().includes(q) ||
        entry.agentId.toLowerCase().includes(q) ||
        entry.fileName.toLowerCase().includes(q) ||
        entry.workspace.toLowerCase().includes(q)
      );
    });
  }, [agentMemoryFiles, search]);

  const filteredWorkspaceFiles = useMemo(() => {
    if (!search.trim()) return workspaceFiles;
    const q = search.toLowerCase();
    return workspaceFiles.filter((f) => f.name.toLowerCase().includes(q));
  }, [workspaceFiles, search]);

  const hasUnindexedWorkspaceFiles = workspaceFiles.some(
    (f) => f.vectorState === "not_indexed" || f.vectorState === "stale"
  );

  const periodGroups = groupByPeriod(filteredDaily);

  const periodGroupKeys = periodGroups.map((g) => g.key).join(",");
  useEffect(() => {
    if (loading || periodGroups.length === 0 || hasInitializedCollapse.current) return;
    hasInitializedCollapse.current = true;
    setCollapsedPeriods((prev) => {
      const next = new Set(prev);
      periodGroups.forEach(({ key }) => {
        if (key !== "Today" && key !== "Yesterday" && key !== "This Week") next.add(key);
      });
      return next;
    });
  }, [loading, periodGroupKeys]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Jump-to params ────────────────────────────────────

  useEffect(() => {
    if (loading || !jumpTarget) return;
    const normalized = normalizeMemoryPath(jumpTarget);
    if (!normalized) { clearSearchJumpParams(); return; }

    const lineNum = jumpLine ? parseInt(jumpLine, 10) : null;
    const validLine = lineNum && Number.isFinite(lineNum) ? lineNum : null;

    const normalizedLower = normalized.toLowerCase();
    const isLongTerm = normalizedLower === "memory.md" || normalizedLower === "memory";

    if (isLongTerm && memoryMd) {
      selectLongTermMemory();
      if (validLine) setScrollToLine(validLine);
      clearSearchJumpParams();
      return;
    }

    const byJournal = daily.find((d) => d.name.toLowerCase() === normalizedLower);
    if (byJournal) {
      loadJournalFile(byJournal.name, byJournal.date);
      if (validLine) setScrollToLine(validLine);
      clearSearchJumpParams();
      return;
    }

    const byAgentPath = agentMemoryFiles.find((entry) => {
      const p = entry.path.toLowerCase();
      return p === normalizedLower || (normalizedLower.endsWith(`/${entry.fileName.toLowerCase()}`) && normalizedLower.includes(shortWorkspace(entry.workspace).toLowerCase()));
    });
    if (byAgentPath) {
      selectAgentMemory(byAgentPath);
      if (validLine) setScrollToLine(validLine);
      clearSearchJumpParams();
      return;
    }

    const byWorkspace = workspaceFiles.find((f) => f.name.toLowerCase() === normalizedLower);
    if (byWorkspace) {
      setWorkspaceFilesCollapsed(false);
      loadWorkspaceFile(byWorkspace);
      if (validLine) setScrollToLine(validLine);
      clearSearchJumpParams();
      return;
    }

    loadJournalFile(normalized, normalized);
    if (validLine) setScrollToLine(validLine);
    clearSearchJumpParams();
  }, [agentMemoryFiles, clearSearchJumpParams, daily, jumpLine, jumpTarget, loadJournalFile, loadWorkspaceFile, loading, memoryMd, selectAgentMemory, selectLongTermMemory, workspaceFiles]);

  useEffect(() => {
    if (scrollToLine == null) return;
    const timer = setTimeout(() => setScrollToLine(null), 500);
    return () => clearTimeout(timer);
  }, [scrollToLine]);

  // ── Helpers ───────────────────────────────────────────

  const togglePeriod = (key: string) => {
    setCollapsedPeriods((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const isExpanded = (key: string) => !collapsedPeriods.has(key);
  const currentJournalFile = selectedJournalFile(selected);
  const currentAgentId = selectedAgentId(selected);
  const selectedDailyEntry = currentJournalFile
    ? daily.find((d) => d.name === currentJournalFile) || null
    : null;
  const selectedAgentMemory = currentAgentId
    ? agentMemoryFiles.find((a) => a.agentId === currentAgentId) || null
    : null;
  const canIndexSelectedJournal =
    !!selectedDailyEntry &&
    (selectedDailyEntry.vectorState === "stale" || selectedDailyEntry.vectorState === "not_indexed");
  const canIndexSelectedAgent =
    !!selectedAgentMemory &&
    (selectedAgentMemory.vectorState === "stale" || selectedAgentMemory.vectorState === "not_indexed" || Boolean(selectedAgentMemory.dirty));

  // ── Render ────────────────────────────────────────────

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
      {/* Left panel — search + file list */}
      <div className="flex max-h-96 w-full shrink-0 flex-col overflow-hidden border-b border-mc-border bg-mc-bg-secondary md:max-h-none md:w-80 md:border-b-0 md:border-r">
        {/* Search */}
        <div className="shrink-0 p-3">
          <div className="flex items-center gap-2 rounded-lg border border-mc-border bg-mc-bg px-3 py-2 text-sm text-mc-text-secondary">
            <Search className="h-4 w-4 shrink-0 text-mc-text-secondary" />
            <input
              placeholder="Search memory files, agents, workspaces..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search memory files"
              className="flex-1 bg-transparent text-sm text-mc-text outline-none placeholder:text-mc-text-secondary/70"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {/* Core workspace memory */}
          {memoryMd && (
            <button
              type="button"
              onClick={selectLongTermMemory}
              className={cn(
                "mb-4 flex w-full flex-col gap-1.5 rounded-xl border p-4 text-left transition-colors",
                selected === "memory"
                  ? "border-mc-accent-purple/30 bg-mc-accent-purple/10 ring-1 ring-mc-accent-purple/20"
                  : "border-mc-accent-purple/20 bg-mc-accent-purple/5 hover:bg-mc-accent-purple/10"
              )}
            >
              <div className="flex items-center gap-2 text-mc-accent-purple">
                <Brain className="h-4 w-4" />
                <span className="text-sm font-medium">Core Workspace MEMORY.md</span>
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                {(() => {
                  const badge = vectorBadge(memoryMd);
                  if (!badge) return null;
                  const Icon = badge.Icon;
                  return (
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-1 py-0.5 text-xs font-medium", badge.className)}>
                      <Icon className="h-2.5 w-2.5" />
                      {badge.label}
                    </span>
                  );
                })()}
                <span className="text-xs text-mc-text-secondary">
                  {memoryMd.words} words • {formatAgo(memoryMd.mtime) || "Updated recently"}
                </span>
              </div>
            </button>
          )}

          {/* Workspace reference files */}
          {filteredWorkspaceFiles.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 flex items-center gap-2 px-1">
                <button
                  type="button"
                  onClick={() => setWorkspaceFilesCollapsed((prev) => !prev)}
                  aria-expanded={!workspaceFilesCollapsed}
                  aria-controls="workspace-files-list"
                  className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-mc-text-secondary/60 transition-colors hover:text-mc-text-secondary"
                >
                  {workspaceFilesCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>Workspace Files</span>
                  <span className="rounded bg-mc-bg-tertiary px-1.5 py-0.5 text-xs text-mc-text-secondary">
                    {filteredWorkspaceFiles.length}
                  </span>
                </button>
                {hasUnindexedWorkspaceFiles && (
                  <button
                    type="button"
                    onClick={() => void ensureWorkspaceIndex()}
                    disabled={ensuringIndex}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-300 hover:bg-sky-500/20 disabled:opacity-60"
                  >
                    {ensuringIndex ? <BouncingDots /> : <RefreshCw className="h-2.5 w-2.5" />}
                    {ensuringIndex ? "Indexing…" : "Add to Index"}
                  </button>
                )}
              </div>
              <div
                id="workspace-files-list"
                className={cn("space-y-1.5", workspaceFilesCollapsed && "hidden")}
              >
                {filteredWorkspaceFiles.map((file) => {
                  const key = `workspace:${file.name}`;
                  const selectedHere = selected === key;
                  const badge = vectorBadge(file);
                  return (
                    <button
                      key={file.name}
                      type="button"
                      onClick={() => loadWorkspaceFile(file)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                        selectedHere
                          ? "border-mc-accent/35 bg-mc-accent/10 ring-1 ring-mc-accent/20"
                          : "border-mc-border bg-mc-bg hover:bg-mc-bg-tertiary"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 shrink-0 text-mc-text-secondary/60" />
                        <span className="flex-1 truncate text-xs font-medium text-mc-text">
                          {file.name}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {badge && (() => {
                          const BadgeIcon = badge.Icon;
                          return (
                            <span className={cn("inline-flex items-center gap-1 rounded-full border px-1 py-0.5 text-xs font-medium", badge.className)}>
                              <BadgeIcon className="h-2.5 w-2.5" />
                              {badge.label}
                            </span>
                          );
                        })()}
                        <span className="text-xs text-mc-text-secondary/70">
                          {file.words > 0 ? `${file.words}w` : "empty"}
                          {file.mtime ? ` • ${formatAgo(file.mtime)}` : ""}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Agent memory files */}
          <div className="mb-2 flex items-center gap-2 px-1">
            <span className="text-xs font-medium uppercase tracking-wider text-mc-text-secondary/60">
              Agent MEMORY Files
            </span>
            <span className="rounded bg-mc-bg-tertiary px-1.5 py-0.5 text-xs text-mc-text-secondary">
              {filteredAgentMemories.length}
            </span>
          </div>

          <div className="mb-4 space-y-1.5">
            {filteredAgentMemories.map((entry) => {
              const key = agentMemoryKey(entry.agentId);
              const selectedHere = selected === key;
              const needsIndex =
                entry.vectorState === "stale" ||
                entry.vectorState === "not_indexed" ||
                Boolean(entry.dirty);
              const badge = vectorBadge(entry);

              return (
                <button
                  key={entry.agentId}
                  type="button"
                  onClick={() => selectAgentMemory(entry)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                    selectedHere
                      ? "border-mc-accent-cyan/35 bg-mc-accent-cyan/10 ring-1 ring-mc-accent-cyan/20"
                      : "border-mc-border bg-mc-bg hover:bg-mc-bg-tertiary"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-mc-text">
                        {entry.agentName}
                      </p>
                      <p className="truncate text-xs text-mc-text-secondary/70">
                        {entry.agentId} • {shortWorkspace(entry.workspace)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {entry.isDefault && (
                        <span className="rounded bg-mc-accent-purple/20 px-1.5 py-0.5 text-xs font-medium text-mc-accent-purple">
                          default
                        </span>
                      )}
                      {!entry.exists && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs font-medium text-amber-300">
                          missing
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {badge && (() => {
                      const BadgeIcon = badge.Icon;
                      return (
                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-1 py-0.5 text-xs font-medium", badge.className)}>
                          <BadgeIcon className="h-2.5 w-2.5" />
                          {badge.label}
                        </span>
                      );
                    })()}
                    {entry.dirty && (
                      <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-300">
                        index dirty
                      </span>
                    )}
                    <span className="text-xs text-mc-text-secondary/70">
                      {entry.exists ? `${entry.words}w` : "No file"} • {entry.indexedFiles ?? 0} files
                    </span>
                    {needsIndex && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          if (indexingFile !== key) void indexAgentMemory(entry);
                        }}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            ev.stopPropagation();
                            if (indexingFile !== key) void indexAgentMemory(entry);
                          }
                        }}
                        className={cn(
                          "ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-xs font-medium text-sky-300 hover:bg-sky-500/20",
                          indexingFile === key && "opacity-60 pointer-events-none"
                        )}
                      >
                        {indexingFile === key ? (
                          <BouncingDots />
                        ) : (
                          <RefreshCw className="h-2.5 w-2.5" />
                        )}
                        {indexingFile === key ? "Indexing" : "Index"}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}

            {!loading && filteredAgentMemories.length === 0 && (
              <p className="px-1 text-xs text-mc-text-secondary/70">No matching agent memory files.</p>
            )}
          </div>

          {/* Daily journal section */}
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-medium uppercase tracking-wider text-mc-text-secondary/60">
              Daily Journal
            </span>
            <span className="rounded bg-mc-bg-tertiary px-1.5 py-0.5 text-xs text-mc-text-secondary">
              {filteredDaily.length}
            </span>
          </div>

          {loading ? (
            <div className="mt-4 flex items-center gap-2 px-1 text-sm text-mc-text-secondary">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Loading memory files...
            </div>
          ) : (
            <div className="mt-2 space-y-0">
              {periodGroups.map(({ key, entries: entriesInGroup }) => {
                const expanded = isExpanded(key);
                return (
                  <div key={key} className="border-b border-mc-border/50 last:border-0">
                    <button
                      type="button"
                      onClick={() => togglePeriod(key)}
                      className="flex w-full items-center gap-1.5 py-2 text-left text-xs font-medium text-mc-text-secondary hover:text-mc-text-secondary"
                    >
                      {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <span>
                        {key} ({entriesInGroup.length})
                      </span>
                    </button>
                    {expanded && (
                      <div className="space-y-0.5 pb-2 pl-5">
                        {entriesInGroup.map((e) => {
                          const isRenaming = renaming?.name === e.name;
                          const isDeleting = confirmDelete?.name === e.name;
                          const key = journalKey(e.name);

                          if (isDeleting) {
                            return (
                              <div
                                key={e.name}
                                className="flex items-center gap-2 rounded-lg bg-mc-accent-red/10 px-3 py-1.5"
                              >
                                <Trash2 className="h-3 w-3 shrink-0 text-mc-accent-red" />
                                <span className="flex-1 truncate text-xs text-mc-accent-red">
                                  Delete {e.name}?
                                </span>
                                <button
                                  type="button"
                                  onClick={() => deleteEntry(e)}
                                  className="rounded bg-mc-accent-red px-2 py-0.5 text-xs font-medium text-white hover:opacity-90"
                                >
                                  Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(null)}
                                  className="text-xs text-mc-text-secondary hover:text-mc-text"
                                >
                                  Cancel
                                </button>
                              </div>
                            );
                          }

                          if (isRenaming) {
                            return (
                              <div
                                key={e.name}
                                className="flex items-center gap-2 rounded-lg border border-mc-accent-purple/30 bg-mc-bg-secondary px-3 py-1.5"
                              >
                                <Pencil className="h-3 w-3 shrink-0 text-mc-accent-purple" />
                                <input
                                  value={renameValue}
                                  onChange={(ev) => setRenameValue(ev.target.value)}
                                  onKeyDown={(ev) => {
                                    if (ev.key === "Enter") void renameEntry(e, renameValue);
                                    if (ev.key === "Escape") setRenaming(null);
                                  }}
                                  onBlur={() => void renameEntry(e, renameValue)}
                                  aria-label="Rename file"
                                  className="flex-1 bg-transparent text-sm text-mc-text outline-none"
                                  autoFocus
                                />
                              </div>
                            );
                          }

                          return (
                            <button
                              key={e.name}
                              type="button"
                              onClick={() => loadJournalFile(e.name, e.date)}
                              onContextMenu={(ev) => handleContextMenu(ev, e)}
                              className={cn(
                                "flex w-full justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
                                selected === key
                                  ? "bg-mc-bg-tertiary text-mc-accent-purple"
                                  : "text-mc-text-secondary hover:bg-mc-bg-tertiary/60 hover:text-mc-text"
                              )}
                            >
                              <span className="text-sm">
                                {(() => {
                                  const d = parseDateLike(e.date);
                                  return isNaN(d.getTime())
                                    ? e.date
                                    : d.toLocaleDateString("en-US", {
                                        weekday: "short",
                                        month: "short",
                                        day: "numeric",
                                      });
                                })()}
                              </span>
                              <span className="flex items-center gap-2">
                                <span className="text-xs text-mc-text-secondary/60">
                                  {e.words ?? 0}w
                                </span>
                                {(() => {
                                  const badge = vectorBadge(e);
                                  if (!badge) return null;
                                  const Icon = badge.Icon;
                                  return (
                                    <span
                                      className={cn(
                                        "inline-flex items-center gap-1 rounded-full border px-1 py-0.5 text-xs font-medium",
                                        badge.className
                                      )}
                                      title={`Vector status: ${badge.label}`}
                                    >
                                      <Icon className="h-2.5 w-2.5" />
                                      {badge.label}
                                    </span>
                                  );
                                })()}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right panel — detail view */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-mc-bg/40">
        {detailMeta ? (
          <>
            <div className="shrink-0 border-b border-mc-border px-6 py-4">
              <div className="flex flex-wrap items-center gap-2.5">
                {detailMeta.kind === "workspace-file" ? (
                  <FileText className="h-4 w-4 text-mc-accent" />
                ) : (
                  <Brain className="h-4 w-4 text-mc-accent-purple" />
                )}
                <h2 className="text-xs font-semibold text-mc-text">
                  {detailMeta.title}
                </h2>

                {detailMeta.vectorState && (() => {
                  const badge = vectorBadge({ vectorState: detailMeta.vectorState });
                  if (!badge) return null;
                  const Icon = badge.Icon;
                  return (
                    <span className={cn("inline-flex items-center gap-1 rounded-full border px-1 py-0.5 text-xs font-medium", badge.className)}>
                      <Icon className="h-2.5 w-2.5" />
                      {badge.label}
                    </span>
                  );
                })()}

                {saveStatus === "saving" && (
                  <span className="text-xs text-mc-text-secondary">Saving...</span>
                )}
                {saveStatus === "saved" && (
                  <span className="text-xs text-mc-accent-green">Saved</span>
                )}
                {saveStatus === "unsaved" && (
                  <span className="text-xs text-mc-accent-yellow">Unsaved</span>
                )}

                {detailMeta.kind === "workspace-file" &&
                  (detailMeta.vectorState === "not_indexed" || detailMeta.vectorState === "stale") && (
                  <button
                    type="button"
                    onClick={() => void ensureWorkspaceIndex()}
                    disabled={ensuringIndex}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Add this file to the vector index"
                  >
                    {ensuringIndex ? <BouncingDots /> : <RefreshCw className="h-3 w-3" />}
                    {ensuringIndex ? "Indexing..." : "Add to Index"}
                  </button>
                )}

                {canIndexSelectedJournal && selectedDailyEntry && (
                  <button
                    type="button"
                    onClick={() => void indexJournalEntry(selectedDailyEntry)}
                    disabled={indexingFile === journalKey(selectedDailyEntry.name)}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Re-index this memory entry"
                  >
                    {indexingFile === journalKey(selectedDailyEntry.name) ? <BouncingDots /> : <RefreshCw className="h-3 w-3" />}
                    {indexingFile === journalKey(selectedDailyEntry.name) ? "Indexing..." : "Index now"}
                  </button>
                )}

                {canIndexSelectedAgent && selectedAgentMemory && (
                  <button
                    type="button"
                    onClick={() => void indexAgentMemory(selectedAgentMemory)}
                    disabled={indexingFile === agentMemoryKey(selectedAgentMemory.agentId)}
                    className="ml-auto inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-xs font-medium text-sky-300 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Re-index this agent memory file"
                  >
                    {indexingFile === agentMemoryKey(selectedAgentMemory.agentId) ? <BouncingDots /> : <RefreshCw className="h-3 w-3" />}
                    {indexingFile === agentMemoryKey(selectedAgentMemory.agentId) ? "Indexing..." : "Index now"}
                  </button>
                )}
              </div>

              <p className="mt-1 text-xs text-mc-text-secondary/60">
                {detailMeta.words != null && `${detailMeta.words} words`}
                {detailMeta.size != null && ` • ${formatBytes(detailMeta.size)}`}
                {detailMeta.workspace && ` • ${detailMeta.workspace}`}
                {detailMeta.mtime && ` • ${formatAgo(detailMeta.mtime)}`}
                {detailMeta.kind !== "workspace-file" && (
                  <>
                    {" • Use "}
                    <span className="inline-flex items-center rounded-md border border-mc-border bg-mc-bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-mc-text">
                      Edit
                    </span>
                    {" to modify • "}
                    <kbd className="rounded border border-mc-border bg-mc-bg-secondary px-1 py-0.5 text-[11px] font-mono text-mc-text">⌘S</kbd>
                    {" to save"}
                  </>
                )}
                {detailMeta.kind === "workspace-file" && " • Read-only workspace file"}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6 min-w-0">
              {detailMeta.kind === "agent-memory" && selectedAgentMemory && !selectedAgentMemory.exists && (
                <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  This agent has no `{selectedAgentMemory.fileName}` yet. Start typing and save to create it.
                </div>
              )}

              {detailMeta.kind === "agent-memory" && selectedAgentMemory?.hasAltCaseFile && (
                <div className="mb-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
                  Both `MEMORY.md` and `memory.md` exist in this workspace. Mission Control edits the canonical file shown in the title.
                </div>
              )}

              {detailContent != null ? (
                <InlineMarkdownEditor
                  key={detailMeta.fileKey}
                  content={detailContent}
                  onContentChange={handleContentChange}
                  onSave={handleSave}
                  placeholder="Click to start writing..."
                  scrollToLine={scrollToLine}
                />
              ) : null}
            </div>
          </>
        ) : !loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-mc-text-secondary/60">
            Select a memory entry
          </div>
        ) : null}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          ref={ctxRef}
          className="fixed z-50 min-w-44 overflow-hidden rounded-lg border border-mc-border bg-mc-bg-secondary/95 py-1 shadow-xl backdrop-blur-sm"
          style={{
            left: Math.min(ctxMenu.x, window.innerWidth - 200),
            top: Math.min(ctxMenu.y, window.innerHeight - 220),
          }}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-mc-text-secondary transition-colors hover:bg-mc-bg-tertiary hover:text-mc-text"
            onClick={() => {
              loadJournalFile(ctxMenu.entry.name, ctxMenu.entry.date);
              setCtxMenu(null);
            }}
          >
            <ExternalLink className="h-3.5 w-3.5 text-mc-text-secondary" />
            Open
          </button>
          {(ctxMenu.entry.vectorState === "stale" || ctxMenu.entry.vectorState === "not_indexed") && (
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-sky-300 transition-colors hover:bg-sky-500/10"
              onClick={() => {
                void indexJournalEntry(ctxMenu.entry);
                setCtxMenu(null);
              }}
              disabled={indexingFile === journalKey(ctxMenu.entry.name)}
            >
              {indexingFile === journalKey(ctxMenu.entry.name) ? <BouncingDots /> : <RefreshCw className="h-3.5 w-3.5" />}
              {indexingFile === journalKey(ctxMenu.entry.name) ? "Indexing..." : "Index now"}
            </button>
          )}
          <div className="mx-2 my-1 h-px bg-mc-border" />
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-mc-text-secondary transition-colors hover:bg-mc-bg-tertiary hover:text-mc-text"
            onClick={() => {
              setRenaming(ctxMenu.entry);
              setRenameValue(ctxMenu.entry.name);
              setCtxMenu(null);
            }}
          >
            <Pencil className="h-3.5 w-3.5 text-mc-text-secondary" />
            Rename
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-mc-text-secondary transition-colors hover:bg-mc-bg-tertiary hover:text-mc-text"
            onClick={() => {
              void duplicateEntry(ctxMenu.entry);
              setCtxMenu(null);
            }}
          >
            <Copy className="h-3.5 w-3.5 text-mc-text-secondary" />
            Duplicate
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-mc-text-secondary transition-colors hover:bg-mc-bg-tertiary hover:text-mc-text"
            onClick={() => {
              copyEntryName(ctxMenu.entry);
              setCtxMenu(null);
            }}
          >
            <ClipboardCopy className="h-3.5 w-3.5 text-mc-text-secondary" />
            Copy Filename
          </button>
          <div className="mx-2 my-1 h-px bg-mc-border" />
          <button
            type="button"
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-mc-accent-red transition-colors hover:bg-mc-accent-red/10"
            onClick={() => {
              setConfirmDelete(ctxMenu.entry);
              setCtxMenu(null);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}

      {/* Toast */}
      {actionMsg && (
        <div
          className={cn(
            "fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-2.5 text-sm shadow-lg backdrop-blur-sm transition-all",
            actionMsg.ok
              ? "border-mc-accent-green/30 bg-mc-accent-green/10 text-mc-accent-green"
              : "border-mc-accent-red/30 bg-mc-accent-red/10 text-mc-accent-red"
          )}
        >
          {actionMsg.msg}
        </div>
      )}
    </div>
  );
}