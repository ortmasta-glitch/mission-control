"use client";

import { useState, useCallback, useRef } from "react";

/**
 * Lightweight chat hook that mirrors @ai-sdk/react's useChat API.
 *
 * This is the UI-shell adapter. When @ai-sdk/react is installed,
 * this can be swapped for the real useChat + TextStreamChatTransport.
 *
 * Provides: messages, sendMessage, status, setMessages, error
 */

export type ChatMessagePart =
  | { type: "text"; text: string }
  | {
      type: "file";
      mediaType: string;
      filename?: string;
      url: string;
    };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  parts: ChatMessagePart[];
  createdAt?: Date;
};

export type ChatStatus = "idle" | "submitted" | "streaming" | "error";

export type UseChatOptions = {
  api?: string;
  body?: Record<string, unknown>;
};

export type UseChatReturn = {
  messages: ChatMessage[];
  sendMessage: (
    message: { text: string; files?: ChatMessagePart[] },
    options?: { body?: Record<string, unknown> }
  ) => Promise<void>;
  status: ChatStatus;
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  error: Error | null;
};

export function useChatAdapter(_options?: UseChatOptions): UseChatReturn {
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const setMessages = useCallback(
    (update: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
      if (typeof update === "function") {
        setMessagesState(update);
      } else {
        setMessagesState(update);
      }
    },
    []
  );

  const sendMessage = useCallback(
    async (
      message: { text: string; files?: ChatMessagePart[] },
      options?: { body?: Record<string, unknown> }
    ) => {
      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      setStatus("submitted");

      const userParts: ChatMessagePart[] = [];
      if (message.text.trim()) {
        userParts.push({ type: "text", text: message.text.trim() });
      }
      if (message.files?.length) {
        userParts.push(...message.files);
      }

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        parts: userParts,
        createdAt: new Date(),
      };

      setMessagesState((prev) => [...prev, userMsg]);

      try {
        const apiEndpoint = "/api/chat";
        const requestBody = {
          messages: [...messages, userMsg].map((m) => ({
            id: m.id,
            role: m.role,
            parts: m.parts,
          })),
          ...(options?.body || {}),
        };

        const response = await fetch(apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          throw new Error(
            errText || `${response.status} ${response.statusText}`
          );
        }

        setStatus("streaming");

        if (response.body) {
          // Stream the response
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let accumulated = "";
          const assistantMsgId = crypto.randomUUID();

          setMessagesState((prev) => [
            ...prev,
            {
              id: assistantMsgId,
              role: "assistant",
              parts: [{ type: "text", text: "" }],
              createdAt: new Date(),
            },
          ]);

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            accumulated += decoder.decode(value, { stream: true });

            setMessagesState((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      parts: [{ type: "text" as const, text: accumulated }],
                    }
                  : m
              )
            );
          }
        } else {
          // Non-streaming response
          const text = await response.text();

          setMessagesState((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              parts: [{ type: "text" as const, text }],
              createdAt: new Date(),
            },
          ]);
        }

        setStatus("idle");
      } catch (err) {
        if (controller.signal.aborted) {
          // User cancelled — don't show error
          setStatus("idle");
          return;
        }
        const error =
          err instanceof Error
            ? err
            : new Error(String(err));
        setError(error);
        setStatus("error");
      } finally {
        abortRef.current = null;
      }
    },
    [messages]
  );

  return {
    messages,
    sendMessage,
    status,
    setMessages,
    error,
  };
}