"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  useSyncExternalStore,
} from "react";
import { useSmartPoll } from "@/hooks/use-smart-poll";
import { useChatAdapter } from "@/hooks/use-chat-adapter";
import {
  Send,
  User,
  RefreshCw,
  Cpu,
  Trash2,
  Paperclip,
  X,
  KeyRound,
  ArrowRight,
  ChevronRight,
  Wrench,
  Users,
  Check,
  Loader2,
} from "lucide-react";
import { SimpleMarkdown } from "@/components/simple-markdown";
import { TypingDots } from "@/components/typing-dots";
import { cn } from "@/lib/utils";
import { addUnread, clearUnread, setChatActive } from "@/lib/chat-store";
import {
  getTimeFormatServerSnapshot,
  getTimeFormatSnapshot,
  subscribeTimeFormatPreference,
  withTimeFormat,
  type TimeFormatPreference,
} from "@/lib/time-format-preference";

/* ── types ─────────────────────────────────────── */

type Agent = {
  id: string;
  name: string;
  emoji: string;
  model: string;
  isDefault: boolean;
  workspace: string;
  sessionCount: number;
  lastActive: number | null;
};

type ChatBootstrapResponse = {
  agents?: Agent[];
  models?: Array<{ key?: string; name?: string }>;
  connectedProviders?: Array<{ id: string; name: string }>;
};

/* ── Agent display helpers ──────────────────────── */

function agentDisplayName(agent: Agent): string {
  if (agent.name && agent.name !== agent.id) return agent.name;
  return formatModel(agent.model);
}

function formatTime(
  d: Date | undefined,
  timeFormat: TimeFormatPreference
) {
  if (!d) return "";
  return d.toLocaleTimeString(
    "en-US",
    withTimeFormat({ hour: "numeric", minute: "2-digit" }, timeFormat)
  );
}

function formatModel(model: string) {
  const parts = model.split("/");
  return parts[parts.length - 1] || model;
}

function createChatSessionKey(agentId: string) {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `agent:${agentId}:mission-control:${suffix}`;
}

async function filesToUIParts(
  files: File[]
): Promise<
  Array<{
    type: "file";
    mediaType: string;
    filename?: string;
    url: string;
  }>
> {
  return Promise.all(
    files.map(
      (
        file
      ): Promise<{
        type: "file";
        mediaType: string;
        filename?: string;
        url: string;
      }> =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              type: "file",
              mediaType: file.type || "application/octet-stream",
              filename: file.name,
              url: reader.result as string,
            });
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        })
    )
  );
}

/* ── Tool call / agent activity parsing ─────────── */

type ToolCallSegment = {
  type: "tool_start";
  callId: string;
  toolName: string;
  displayName: string;
  args?: string;
  done: boolean;
};

type AgentSegment = {
  type: "agent_start";
  callId: string;
  agentName: string;
  done: boolean;
};

type TextSegment = { type: "text"; text: string };

type MessageSegment = TextSegment | ToolCallSegment | AgentSegment;

const TOOL_START_RE =
  /\u200B\[\[TOOL_START:([^:]*):([^:]*):([^\]]*)\]\]\u200B/g;
const TOOL_ARGS_RE =
  /\u200B\[\[TOOL_ARGS:([^:]*):([^\]]*)\]\]\u200B/g;
const TOOL_END_RE = /\u200B\[\[TOOL_END:([^\]]*)\]\]\u200B/g;
const AGENT_START_RE =
  /\u200B\[\[AGENT_START:([^:]*):([^\]]*)\]\]\u200B/g;
const ALL_MARKERS_RE =
  /\u200B\[\[(TOOL_START|TOOL_ARGS|TOOL_END|AGENT_START):[^\]]*\]\]\u200B/g;

function parseMessageSegments(text: string): MessageSegment[] {
  if (!text.includes("\u200B[[")) {
    return text.trim() ? [{ type: "text", text }] : [];
  }

  const segments: MessageSegment[] = [];
  const toolCalls = new Map<string, ToolCallSegment>();
  const agentCalls = new Map<string, AgentSegment>();

  let m: RegExpExecArray | null;

  TOOL_START_RE.lastIndex = 0;
  while ((m = TOOL_START_RE.exec(text)) !== null) {
    toolCalls.set(m[1], {
      type: "tool_start",
      callId: m[1],
      toolName: m[2],
      displayName: m[3],
      done: false,
    });
  }
  TOOL_ARGS_RE.lastIndex = 0;
  while ((m = TOOL_ARGS_RE.exec(text)) !== null) {
    const tc = toolCalls.get(m[1]);
    if (tc) tc.args = m[2];
  }
  TOOL_END_RE.lastIndex = 0;
  while ((m = TOOL_END_RE.exec(text)) !== null) {
    const tc = toolCalls.get(m[1]);
    if (tc) tc.done = true;
    const ac = agentCalls.get(m[1]);
    if (ac) ac.done = true;
  }
  AGENT_START_RE.lastIndex = 0;
  while ((m = AGENT_START_RE.exec(text)) !== null) {
    agentCalls.set(m[1], {
      type: "agent_start",
      callId: m[1],
      agentName: m[2],
      done: false,
    });
  }

  const parts = text.split(ALL_MARKERS_RE);
  let markerIdx = 0;
  ALL_MARKERS_RE.lastIndex = 0;
  const markers: RegExpExecArray[] = [];
  while ((m = ALL_MARKERS_RE.exec(text)) !== null) markers.push(m);

  for (let i = 0; i < parts.length; i++) {
    const cleaned = parts[i].trim();
    if (cleaned) segments.push({ type: "text", text: parts[i] });

    if (markerIdx < markers.length) {
      const marker = markers[markerIdx++];
      const full = marker[0];
      const inner = full
        .replace(/\u200B/g, "")
        .replace(/^\[\[/, "")
        .replace(/\]\]$/, "");
      const colonIdx = inner.indexOf(":");
      const callId =
        colonIdx >= 0 ? inner.slice(colonIdx + 1).split(":")[0] : "";

      if (full.includes("TOOL_START:")) {
        const tc = toolCalls.get(callId);
        if (tc) segments.push(tc);
      } else if (full.includes("AGENT_START:")) {
        const ac = agentCalls.get(callId);
        if (ac) segments.push(ac);
      }
    }
  }

  return segments;
}

function ToolCallBlock({
  segment,
}: {
  segment: ToolCallSegment | AgentSegment;
}) {
  const [open, setOpen] = useState(false);
  const isAgent = segment.type === "agent_start";
  const label = isAgent
    ? `Calling ${(segment as AgentSegment).agentName}`
    : (segment as ToolCallSegment).displayName;
  const args = !isAgent ? (segment as ToolCallSegment).args : undefined;
  const isDone = segment.done;

  return (
    <div className="my-2 rounded-lg border border-mc-border/20 bg-mc-bg-tertiary/50">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-mc-bg-tertiary/80"
      >
        <ChevronRight
          className={cn(
            "h-3 w-3 shrink-0 text-mc-text-secondary/60 transition-transform",
            open && "rotate-90"
          )}
        />
        {isAgent ? (
          <Users className="h-3 w-3 shrink-0 text-mc-accent-purple" />
        ) : (
          <Wrench className="h-3 w-3 shrink-0 text-mc-accent-yellow" />
        )}
        <span className="flex-1 truncate font-medium text-mc-text-secondary/70">
          {label}
        </span>
        {isDone ? (
          <Check className="h-3 w-3 shrink-0 text-mc-accent-green" />
        ) : (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-mc-text-secondary/50" />
        )}
      </button>
      {open && args && (
        <div className="border-t border-mc-border/10 px-3 py-2">
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-relaxed text-mc-text-secondary/60">
            {tryFormatJson(args)}
          </pre>
        </div>
      )}
    </div>
  );
}

function tryFormatJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function MessageContent({ text }: { text: string }) {
  if (!text.trim()) return null;

  const segments = parseMessageSegments(text);
  if (segments.length === 0) return null;

  if (segments.length === 1 && segments[0].type === "text") {
    return (
      <div className="space-y-1 [&>*:last-child]:mb-0">
        <SimpleMarkdown>{segments[0].text}</SimpleMarkdown>
      </div>
    );
  }

  return (
    <div className="space-y-1 [&>*:last-child]:mb-0">
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          const cleaned = seg.text.trim();
          if (!cleaned) return null;
          return <SimpleMarkdown key={i}>{cleaned}</SimpleMarkdown>;
        }
        return <ToolCallBlock key={seg.callId} segment={seg} />;
      })}
    </div>
  );
}

/* ── Chat panel for a single agent ─────────────── */

function ChatPanel({
  agentId,
  agentName,
  agentEmoji: emoji,
  agentModel,
  isSelected,
  isVisible,
  availableModels,
  selectedProvider,
  modelsLoaded,
  isPostOnboarding,
  onClearPostOnboarding,
}: {
  agentId: string;
  agentName: string;
  agentEmoji: string;
  agentModel: string;
  isSelected: boolean;
  isVisible: boolean;
  availableModels: Array<{ key: string; name: string }>;
  selectedProvider: string | null;
  modelsLoaded: boolean;
  isPostOnboarding: boolean;
  onClearPostOnboarding: () => void;
}) {
  const postOnboardingStarterPrompt =
    "Say hello and tell me how you can help me today.";
  const timeFormat = useSyncExternalStore(
    subscribeTimeFormatPreference,
    getTimeFormatSnapshot,
    getTimeFormatServerSnapshot
  );
  const [inputValue, setInputValue] = useState(() =>
    isPostOnboarding && isSelected ? postOnboardingStarterPrompt : ""
  );
  const chatSessionKeyRef = useRef(
    typeof window === "undefined" ? "" : createChatSessionKey(agentId)
  );
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevMsgCountRef = useRef(0);

  const addFiles = useCallback((files: FileList | File[]) => {
    const list = Array.isArray(files) ? files : Array.from(files);
    if (list.length) setAttachedFiles((prev) => [...prev, ...list]);
  }, []);

  const ensureChatSessionKey = useCallback(() => {
    const existing = chatSessionKeyRef.current.trim();
    if (existing) return existing;
    const next = createChatSessionKey(agentId);
    chatSessionKeyRef.current = next;
    return next;
  }, [agentId]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      e.dataTransfer.dropEffect = "copy";
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node))
      setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);
      const files = e.dataTransfer.files;
      if (files?.length) addFiles(files);
    },
    [addFiles]
  );

  const { messages, sendMessage, status, setMessages, error } = useChatAdapter();

  const isLoading = status === "submitted" || status === "streaming";
  const noApiKeys = modelsLoaded && availableModels.length === 0;

  // Detect new assistant messages → trigger unread notification
  useEffect(() => {
    const count = messages.length;
    if (count > prevMsgCountRef.current) {
      const newMsgs = messages.slice(prevMsgCountRef.current);
      for (const m of newMsgs) {
        if (m.role === "assistant") {
          if (!isVisible || !isSelected) {
            addUnread(agentId, agentName);
          }
        }
      }
    }
    prevMsgCountRef.current = count;
  }, [messages, isVisible, isSelected, agentId, agentName]);

  // Auto-scroll
  useEffect(() => {
    if (isSelected && isVisible) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, status, isSelected, isVisible]);

  // Focus input when panel becomes selected + visible
  useEffect(() => {
    if (isSelected && isVisible) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [isSelected, isVisible]);

  // Clear unread when panel becomes visible and selected
  useEffect(() => {
    if (isSelected && isVisible) {
      clearUnread(agentId);
    }
  }, [isSelected, isVisible, agentId]);

  const sendWithActiveModel = useCallback(
    async (payload: {
      text: string;
      files?: Array<{
        type: "file";
        mediaType: string;
        filename?: string;
        url: string;
      }>;
    }) => {
      const sessionKey = ensureChatSessionKey();
      await sendMessage(payload, {
        body: { agentId, sessionKey },
      });
    },
    [agentId, ensureChatSessionKey, sendMessage]
  );

  const retryLastUserMessage = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    const retryText =
      lastUser.parts
        ?.filter(
          (p): p is { type: "text"; text: string } => p.type === "text"
        )
        .map((p) => p.text)
        .join("") || "";
    const retryFiles =
      lastUser.parts?.filter(
        (p): p is {
          type: "file";
          mediaType: string;
          filename?: string;
          url: string;
        } => p.type === "file" && "url" in p
      ) || [];
    if (!retryText && retryFiles.length === 0) return;
    void sendWithActiveModel({
      text: retryText,
      ...(retryFiles.length > 0 ? { files: retryFiles } : {}),
    });
  }, [messages, sendWithActiveModel]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    const hasFiles = attachedFiles.length > 0;
    if ((!text && !hasFiles) || isLoading || noApiKeys) return;
    onClearPostOnboarding();
    setInputValue("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    const fileParts = hasFiles
      ? await filesToUIParts(attachedFiles)
      : undefined;
    setAttachedFiles([]);
    await sendWithActiveModel({
      text: text || "",
      files: fileParts,
    });
  }, [
    attachedFiles,
    inputValue,
    isLoading,
    noApiKeys,
    onClearPostOnboarding,
    sendWithActiveModel,
  ]);

  const clearChat = useCallback(() => {
    setMessages([]);
    prevMsgCountRef.current = 0;
    chatSessionKeyRef.current = createChatSessionKey(agentId);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [agentId, setMessages]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleTextareaChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputValue(e.target.value);
      const target = e.target;
      target.style.height = "auto";
      target.style.height = Math.min(target.scrollHeight, 200) + "px";
    },
    []
  );

  return (
    <div
      className={cn(
        "flex flex-1 flex-col overflow-hidden",
        !isSelected && "hidden"
      )}
    >
      {/* ── Messages area ───────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          noApiKeys ? (
            /* No models — redirect to settings */
            <div className="flex h-full items-center justify-center px-4 md:px-6">
              <div className="relative w-full max-w-sm animate-modal-in">
                <div className="pointer-events-none absolute -inset-12 rounded-full bg-mc-accent-cyan opacity-[0.04] blur-3xl" />
                <div className="relative rounded-2xl border border-mc-border/60 bg-mc-bg-secondary p-6 text-center shadow-lg">
                  <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-mc-accent text-mc-bg shadow-sm">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-semibold tracking-tight text-mc-text">
                    No model configured
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-mc-text-secondary">
                    Connect an AI provider and choose a model to start
                    chatting with your agent.
                  </p>
                  <a
                    href="/settings?tab=models"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-mc-accent px-4 py-2 text-xs font-medium text-mc-bg shadow-sm transition-all hover:bg-mc-accent/90 hover:shadow-md"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    Set up models
                  </a>
                </div>
              </div>
            </div>
          ) : (
            /* Normal empty state — ready to chat */
            <div className="flex h-full flex-col items-center justify-center gap-4 px-4 md:px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mc-bg-tertiary text-xl">
                {emoji}
              </div>
              <div className="text-center">
                <h3 className="text-xs font-semibold text-mc-text/90">
                  Chat with {agentName}
                </h3>
                <p className="mt-1 text-xs text-mc-text-secondary">
                  Send a message to start a conversation with your agent.
                </p>
              </div>
              {/* Quick prompts */}
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {(isPostOnboarding
                  ? [
                      "Say hello!",
                      "What can you do?",
                      "Tell me a joke",
                      "Help me get started",
                    ]
                  : [
                      "What did you do today?",
                      "Check my scheduled tasks",
                      "Summarize recent activity",
                      "What tasks are pending?",
                    ]
                ).map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      onClearPostOnboarding();
                      void sendWithActiveModel({ text: prompt });
                    }}
                    className="rounded-lg border border-mc-border/30 bg-mc-bg-tertiary px-3 py-2 text-xs text-mc-text-secondary transition-colors hover:bg-mc-bg-tertiary/80 hover:text-mc-text/70"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="mx-auto max-w-3xl px-4 py-6">
            {messages.map((message) => {
              const isUser = message.role === "user";
              const parts = message.parts ?? [];
              const text =
                parts
                  .filter(
                    (p): p is Extract<
                      (typeof parts)[number],
                      { type: "text" }
                    > => p.type === "text"
                  )
                  .map((p) => p.text)
                  .join("") || "";
              const fileParts = parts.filter(
                (p): p is Extract<
                  (typeof parts)[number],
                  { type: "file" }
                > => p.type === "file"
              );
              const imageParts = fileParts.filter(
                (p) => p.url && /^image\//i.test(p.mediaType ?? "")
              );
              const otherFileParts = fileParts.filter(
                (p) => !p.url || !/^image\//i.test(p.mediaType ?? "")
              );
              return (
                <div
                  key={message.id}
                  className={cn(
                    "mb-6 flex gap-3",
                    isUser ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs",
                      isUser
                        ? "bg-mc-bg-tertiary text-mc-text-secondary"
                        : "border border-mc-accent-purple/30 bg-mc-accent-purple/10"
                    )}
                  >
                    {isUser ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <span className="text-sm">{emoji}</span>
                    )}
                  </div>

                  {/* Message bubble */}
                  <div
                    className={cn(
                      "max-w-md rounded-xl px-4 py-3 text-xs",
                      isUser
                        ? "bg-mc-accent/20 text-mc-text"
                        : "bg-mc-bg-tertiary text-mc-text-secondary"
                    )}
                  >
                    {text ? <MessageContent text={text} /> : null}
                    {imageParts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {imageParts.map((p, i) =>
                          p.url ? (
                            <img
                              key={i}
                              src={p.url}
                              alt={p.filename ?? "Attached image"}
                              className="max-h-48 max-w-full rounded-lg border border-mc-border/20 object-contain"
                            />
                          ) : null
                        )}
                      </div>
                    )}
                    {otherFileParts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {otherFileParts.map((p, i) => (
                          <span
                            key={i}
                            className="rounded bg-mc-bg-tertiary px-1.5 py-0.5 text-xs opacity-90"
                          >
                            📎 {p.filename ?? "file"}
                          </span>
                        ))}
                      </div>
                    )}
                    <div
                      className={cn(
                        "mt-2 text-xs",
                        isUser
                          ? "text-right text-mc-text-secondary/60"
                          : "text-mc-text-secondary/40"
                      )}
                    >
                      {formatTime(
                        "createdAt" in message
                          ? (message as unknown as { createdAt: Date })
                              .createdAt
                          : new Date(),
                        timeFormat
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Loading indicator */}
            {status === "submitted" && (
              <div className="mb-6 flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-mc-border bg-mc-bg-secondary text-xs">
                  <span className="text-sm">{emoji}</span>
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-mc-bg-tertiary px-4 py-3">
                  <TypingDots size="sm" className="text-mc-text-secondary" />
                  <span className="text-xs text-mc-text-secondary">
                    Thinking...
                  </span>
                </div>
              </div>
            )}

            {/* Error display */}
            {error && (
              /No API key found|api[._-]key|auth.profiles|FailoverError|Configure auth|unauthorized|invalid.*key|401/i.test(
                error.message
              ) ? (
                <div className="mb-6 overflow-hidden rounded-xl border border-mc-accent/30 bg-mc-bg-secondary p-4 shadow-sm animate-modal-in">
                  <div className="mb-2 flex items-center gap-2">
                    <KeyRound className="h-3.5 w-3.5 text-mc-accent" />
                    <span className="text-xs font-medium text-mc-accent">
                      Your agent needs an API key to reply
                    </span>
                  </div>
                  <p className="mb-3 text-[11px] leading-relaxed text-mc-text-secondary">
                    The AI provider rejected the request. This usually means
                    your API key is missing, expired, or doesn&apos;t have
                    enough credits.
                  </p>
                  <a
                    href="/settings?tab=models"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-mc-accent px-3 py-1.5 text-xs font-medium text-mc-bg shadow-sm transition-all hover:bg-mc-accent/90"
                  >
                    <ArrowRight className="h-3 w-3" />
                    Go to Models
                  </a>
                </div>
              ) : /avoid sending your message with a different model|switch this chat back to the agent setup|could not use .* because the OpenClaw gateway/i.test(
                  error.message
                ) ? (
                <div className="mb-6 rounded-lg border border-mc-accent-purple/20 bg-mc-accent-purple/5 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-mc-accent-purple">
                      Your selected chat model was protected
                    </span>
                    <button
                      type="button"
                      onClick={retryLastUserMessage}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-mc-accent-purple transition-colors hover:bg-mc-accent-purple/10"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Try again
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-mc-accent-purple/80">
                    Mission Control stopped the request instead of sending it
                    with the wrong model. You can try again, or switch this
                    chat back to the agent setup below.
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-mc-accent-purple/60">
                    {error.message}
                  </p>
                </div>
              ) : /timeout|timed out|ECONNREFUSED|ENOTFOUND|fetch failed|network/i.test(
                  error.message
                ) ? (
                <div className="mb-6 rounded-lg border border-mc-accent-yellow/20 bg-mc-accent-yellow/5 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-mc-accent-yellow">
                      Connection problem
                    </span>
                    <button
                      type="button"
                      onClick={retryLastUserMessage}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-mc-accent-yellow transition-colors hover:bg-mc-accent-yellow/10"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Try again
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-mc-accent-yellow/70">
                    Could not reach the AI provider. Check that your internet
                    connection is working and that the OpenClaw gateway is
                    online.
                  </p>
                </div>
              ) : /rate.?limit|429|quota|exceeded|billing/i.test(
                  error.message
                ) ? (
                <div className="mb-6 rounded-lg border border-mc-accent-yellow/20 bg-mc-accent-yellow/5 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-mc-accent-yellow">
                      Usage limit reached
                    </span>
                    <button
                      type="button"
                      onClick={retryLastUserMessage}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-mc-accent-yellow transition-colors hover:bg-mc-accent-yellow/10"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Try again
                    </button>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-mc-accent-yellow/70">
                    Your AI provider says you&apos;ve hit a usage or billing
                    limit. Wait a minute and try again, or check your
                    plan&apos;s dashboard.
                  </p>
                </div>
              ) : (
                <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-red-400">
                      Something went wrong
                    </span>
                    <button
                      type="button"
                      onClick={retryLastUserMessage}
                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-500/10"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Try again
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-red-400/70">
                    {error.message}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-red-400/50">
                    If this keeps happening, try switching models or check your
                    gateway configuration.
                  </p>
                </div>
              )
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input area (drag-and-drop zone) ─────── */}
      <div
        className={cn(
          "shrink-0 border-t border-mc-border/30 bg-mc-bg/60 px-4 py-3 transition-colors",
          isDraggingOver &&
            "bg-mc-accent-purple/10 border-mc-accent-purple/20"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="mx-auto max-w-3xl space-y-2">
          {/* Attached files preview */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {attachedFiles.map((f, i) => (
                <span
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-1 rounded-md border border-mc-border/30 bg-mc-bg-tertiary px-2 py-1 text-xs"
                >
                  <Paperclip className="h-3 w-3 text-mc-text-secondary/60" />
                  <span className="max-w-32 truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setAttachedFiles((prev) =>
                        prev.filter((_, j) => j !== i)
                      )
                    }
                    className="rounded p-0.5 text-mc-text-secondary/40 hover:bg-mc-bg-tertiary hover:text-mc-text"
                    aria-label="Remove file"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {/* Input row */}
          <div className="flex min-w-0 items-end gap-2 sm:gap-3">
            <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-mc-border/30 bg-mc-bg-secondary focus-within:border-mc-accent-purple/30 focus-within:ring-1 focus-within:ring-mc-accent-purple/20">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder={
                  noApiKeys
                    ? "Add an API key to start chatting..."
                    : `Message ${agentName}...`
                }
                rows={1}
                disabled={isLoading || noApiKeys}
                className="max-h-48 flex-1 resize-none bg-transparent px-3 pt-2.5 pb-1 text-xs text-mc-text/90 outline-none placeholder:text-mc-text-secondary/60 disabled:opacity-50 sm:px-4"
              />
              {/* Inline toolbar */}
              <div className="flex items-center gap-1 px-2 pb-1.5 sm:px-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach files"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-mc-text-secondary/40 transition-colors hover:bg-mc-bg-tertiary hover:text-mc-text/70"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={clearChat}
                    title="Clear conversation"
                    className="flex h-7 w-7 items-center justify-center rounded-md text-mc-text-secondary/40 transition-colors hover:bg-mc-bg-tertiary hover:text-mc-text/70"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSend}
              disabled={
                (!inputValue.trim() && attachedFiles.length === 0) ||
                isLoading ||
                noApiKeys
              }
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                (inputValue.trim() || attachedFiles.length > 0) &&
                  !isLoading &&
                  !noApiKeys
                  ? "bg-mc-accent text-mc-bg hover:bg-mc-accent/90"
                  : "bg-mc-bg-tertiary text-mc-text-secondary/60"
              )}
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-0.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
                </span>
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-mc-text-secondary/40">
          Press Enter to send, Shift+Enter for a new line. You can also attach
          files.
        </p>
      </div>
    </div>
  );
}

/* ── Main chat view with agent selector ────────── */

export function ChatView({ isVisible = true }: { isVisible?: boolean }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>("main");
  const selectedAgentRef = useRef(selectedAgent);
  selectedAgentRef.current = selectedAgent;
  const [agentsLoading, setAgentsLoading] = useState(true);
  const [availableModels, setAvailableModels] = useState<
    Array<{ key: string; name: string }>
  >([]);
  const [connectedProviders, setConnectedProviders] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const providerDropdownRef = useRef<HTMLDivElement>(null);

  // Warm-up state
  const [warmupExpired, setWarmupExpired] = useState(false);
  const mountedAtRef = useRef(0);
  const warmingUp = !warmupExpired && agents.length === 0;

  // Post-onboarding first-time prompts
  const [isPostOnboarding, setIsPostOnboarding] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("mc-post-onboarding") === "1";
    } catch {
      return false;
    }
  });

  const clearPostOnboarding = useCallback(() => {
    if (!isPostOnboarding) return;
    setIsPostOnboarding(false);
    try {
      localStorage.removeItem("mc-post-onboarding");
    } catch {}
  }, [isPostOnboarding]);

  // Track which agents have been opened (mount ChatPanel permanently)
  const [mountedAgents, setMountedAgents] = useState<Set<string>>(
    new Set(["main"])
  );

  // Fetch chat bootstrap data
  const bootstrapLoadedRef = useRef(false);
  const fetchBootstrap = useCallback(() => {
    if (!bootstrapLoadedRef.current) setAgentsLoading(true);
    fetch("/api/chat/bootstrap", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: ChatBootstrapResponse) => {
        const agentList = data.agents || [];
        const modelList = Array.isArray(data.models) ? data.models : [];
        setAgents(agentList);
        setAvailableModels(
          modelList
            .map((m) => ({
              key: String(m.key ?? ""),
              name: String(m.name ?? m.key ?? ""),
            }))
            .filter((m) => m.key)
        );
        const providers = Array.isArray(data.connectedProviders)
          ? data.connectedProviders
          : [];
        setConnectedProviders(providers);
        if (providers.length > 0 && !selectedProvider) {
          const defaultModel =
            agentList.find((a) => a.isDefault)?.model || "";
          const defaultProv = defaultModel.split("/")[0];
          const match = providers.find(
            (p: { id: string }) => p.id === defaultProv
          );
          setSelectedProvider(match?.id || providers[0]?.id || null);
        }
        bootstrapLoadedRef.current = true;
        if (
          agentList.length > 0 &&
          !agentList.find((a: Agent) => a.id === selectedAgentRef.current)
        ) {
          setSelectedAgent(agentList[0].id);
          setMountedAgents((prev) => {
            const next = new Set(prev);
            next.add(agentList[0].id);
            return next;
          });
        }
        if (modelList.length > 0 || warmupExpired) {
          setModelsLoaded(true);
        }
        setAgentsLoading(false);
      })
      .catch(() => {
        if (warmupExpired) setModelsLoaded(true);
        setAgentsLoading(false);
      });
  }, [warmupExpired]);

  useEffect(() => {
    mountedAtRef.current = Date.now();
  }, []);

  // End warm-up after 20s
  useEffect(() => {
    const remaining = 20_000 - (Date.now() - mountedAtRef.current);
    const t = setTimeout(() => setWarmupExpired(true), Math.max(remaining, 0));
    return () => clearTimeout(t);
  }, []);

  // Poll bootstrap
  useSmartPoll(fetchBootstrap, {
    intervalMs: warmingUp ? 10000 : 30000,
    enabled: isVisible,
  });

  useEffect(() => {
    if (!isVisible) return;
    const tick = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [isVisible]);

  // Mark chat as active when visible
  useEffect(() => {
    setChatActive(isVisible);
  }, [isVisible]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!providerDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        providerDropdownOpen &&
        providerDropdownRef.current &&
        !providerDropdownRef.current.contains(e.target as Node)
      ) {
        setProviderDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [providerDropdownOpen]);

  const currentAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgent),
    [agents, selectedAgent]
  );
  const currentAgentTitle = currentAgent
    ? agentDisplayName(currentAgent)
    : "Agent";
  const currentAgentModelLabel =
    currentAgent?.model && currentAgent.model !== "unknown"
      ? formatModel(currentAgent.model)
      : "";
  const showSecondaryModelLabel =
    Boolean(currentAgentModelLabel) &&
    currentAgentModelLabel.toLowerCase() !== currentAgentTitle.toLowerCase();

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ── Top bar (thread header) ────────────── */}
      <div className="shrink-0 border-b border-mc-border bg-mc-bg-secondary px-4 py-3 md:px-6">
        <div className="flex items-center gap-2.5">
          <span className="text-sm">{currentAgent?.emoji || "🤖"}</span>
          <span className="text-sm font-medium text-mc-text">
            {currentAgentTitle}
          </span>
          {showSecondaryModelLabel && (
            <span className="text-xs text-mc-text-secondary">
              {currentAgentModelLabel}
            </span>
          )}
          {agents.length > 1 && (
            <div className="ml-auto flex items-center gap-1">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    setSelectedAgent(agent.id);
                    setMountedAgents((prev) => {
                      const next = new Set(prev);
                      next.add(agent.id);
                      return next;
                    });
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors",
                    agent.id === selectedAgent
                      ? "bg-mc-accent/20 text-mc-accent font-medium"
                      : "text-mc-text-secondary hover:bg-mc-bg-tertiary hover:text-mc-text"
                  )}
                  >
                    <span className="text-sm">{agent.emoji}</span>
                    <span className="hidden sm:inline">
                      {agentDisplayName(agent)}
                    </span>
                  </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Agent chat panels ──────────────────── */}
      {!agentsLoading && agents.length === 0 ? (
        warmingUp ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mc-bg-tertiary text-xl">
              🤖
            </div>
            <div>
              <h3 className="text-sm font-semibold text-mc-text/90">
                Getting your agent ready
                <TypingDots size="sm" className="ml-1 text-mc-text-secondary" />
              </h3>
              <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-mc-text-secondary">
                This usually only takes a few seconds.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mc-bg-tertiary text-xl">
              🤖
            </div>
            <div>
              <h3 className="text-sm font-semibold text-mc-text/90">
                No agents found
              </h3>
              <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-mc-text-secondary">
                Your agent hasn&apos;t started yet. Check that the gateway is
                online (green dot in the header), then refresh this page.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={fetchBootstrap}
                className="flex items-center gap-1.5 rounded-lg border border-mc-border/30 bg-mc-bg-tertiary px-3 py-2 text-xs text-mc-text-secondary transition-colors hover:bg-mc-bg-tertiary/80 hover:text-mc-text/70"
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </button>
              <a
                href="/settings"
                className="flex items-center gap-1.5 rounded-lg border border-mc-border/30 bg-mc-bg-tertiary px-3 py-2 text-xs text-mc-text-secondary transition-colors hover:bg-mc-bg-tertiary/80 hover:text-mc-text/70"
              >
                <Cpu className="h-3 w-3" />
                Settings
              </a>
            </div>
          </div>
        )
      ) : (
        Array.from(mountedAgents).map((agentId) => {
          const agent = agents.find((a) => a.id === agentId);
          return (
            <ChatPanel
              key={agentId}
              agentId={agentId}
              agentName={agent ? agentDisplayName(agent) : agentId}
              agentEmoji={agent?.emoji || "🤖"}
              agentModel={agent?.model || "unknown"}
              isSelected={agentId === selectedAgent}
              isVisible={isVisible}
              availableModels={availableModels}
              selectedProvider={selectedProvider}
              modelsLoaded={modelsLoaded}
              isPostOnboarding={isPostOnboarding}
              onClearPostOnboarding={clearPostOnboarding}
            />
          );
        })
      )}
    </div>
  );
}