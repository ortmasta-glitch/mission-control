import { NextRequest, NextResponse } from "next/server";
import { getOpenClawClient } from "@/lib/openclaw/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat
 *
 * Chat endpoint that sends a message to an OpenClaw agent and returns the response.
 * Works with Vercel AI SDK v5's TextStreamChatTransport.
 *
 * Request body: { messages, agentId, sessionKey? }
 * Each UIMessage has { id, role, parts: [{ type: 'text', text }, { type: 'file', url, filename }] }
 */

type MessagePart = {
  type: string;
  text?: string;
  url?: string;
  filename?: string;
  mimeType?: string;
};

type Message = {
  role: string;
  parts?: MessagePart[];
  content?: string;
};

function dataUrlToSafeMessagePart(
  dataUrl: string,
  filename: string
): string {
  try {
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
    if (!base64) return `[Attached: ${filename} (empty)]`;
    const buf = Buffer.from(base64, "base64");
    if (buf.includes(0))
      return `[Attached: ${filename} (binary file - not included in message)]`;
    const text = buf.toString("utf-8");
    return `[Attached: ${filename}]\n${text}`;
  } catch {
    return `[Attached: ${filename} (could not decode)]`;
  }
}

function extractContent(messages: Message[]): string {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg) return "";

  const textParts: string[] = [];
  const fileParts: string[] = [];

  if (lastUserMsg.parts) {
    for (const p of lastUserMsg.parts) {
      if (p.type === "text" && p.text) {
        textParts.push(p.text);
      } else if (p.type === "file" && p.url) {
        const name = (p.filename || "file").replace(/\s+/g, " ");
        fileParts.push(dataUrlToSafeMessagePart(p.url, name));
      }
    }
  } else if (lastUserMsg.content) {
    textParts.push(lastUserMsg.content);
  }

  const textBlock = textParts.join("").trim();
  const fileBlock = fileParts.length
    ? "\n\n" + fileParts.join("\n\n---\n\n")
    : "";
  return (textBlock + fileBlock).trim();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages: Message[] = body.messages || [];
    const agentId: string = body.agentId || body.agent || "main";
    const sessionKey: string | undefined = body.sessionKey || undefined;

    const prompt = extractContent(messages);

    if (!prompt) {
      return new Response("Please send a message or attach a file.", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Try the OpenClaw gateway
    const client = getOpenClawClient();

    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch (connectErr) {
        return new Response(
          `Error: Gateway connection failed — ${
            connectErr instanceof Error
              ? connectErr.message
              : String(connectErr)
          }`,
          {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          }
        );
      }
    }

    // Create a session for this chat if we don't have one
    let sessionId: string;
    try {
      const session = await client.createSession(
        "chat",
        agentId
      );
      sessionId = session.id || "";
    } catch {
      // If session creation fails, try sending directly
      sessionId = sessionKey || "";
    }

    // Send the message via the gateway
    if (sessionId) {
      try {
        await client.sendMessage(sessionId, prompt);
      } catch (sendErr) {
        return new Response(
          `Error: Failed to send message — ${
            sendErr instanceof Error ? sendErr.message : String(sendErr)
          }`,
          {
            status: 502,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          }
        );
      }

      // Wait briefly for a response, then try to get history
      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        const history = await client.getSessionHistory(sessionId);
        if (Array.isArray(history) && history.length > 0) {
          // Find the last assistant message
          const assistantMsgs = history
            .filter((m: unknown) => {
              const msg = (typeof m === "object" && m !== null ? m : {}) as Record<string, unknown>;
              return msg.role === "assistant" || msg.role === "bot";
            })
            .reverse();
          if (assistantMsgs.length > 0) {
            const lastAssistant = assistantMsgs[0] as Record<string, unknown>;
            const text =
              typeof lastAssistant.content === "string"
                ? lastAssistant.content
                : typeof lastAssistant.text === "string"
                  ? lastAssistant.text
                  : JSON.stringify(lastAssistant.content || lastAssistant.text || "");
            return new Response(text, {
              status: 200,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          }
        }
      } catch {
        // History fetch failed — fall through
      }
    }

    // Fallback: try gateway RPC directly for a synchronous response
    try {
      const result = await client.call<string>("chat.send", {
        agent_id: agentId,
        message: prompt,
        session_key: sessionKey,
      });

      const text =
        typeof result === "string"
          ? result
          : JSON.stringify(result);

      return new Response(text || "No response from agent.", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    } catch (rpcErr) {
      return new Response(
        `Error: ${
          rpcErr instanceof Error ? rpcErr.message : String(rpcErr)
        }`,
        {
          status: 502,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }
      );
    }
  } catch (err) {
    console.error("Chat API error:", err);
    const errMsg =
      err instanceof Error ? err.message : "Failed to get agent response";
    return new Response(`Error: ${errMsg}`, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}