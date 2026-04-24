import { NextResponse } from "next/server";
import { getOpenClawClient } from "@/lib/openclaw/client";

export const dynamic = "force-dynamic";

type ChatBootstrapAgent = {
  id: string;
  name: string;
  emoji: string;
  model: string;
  isDefault: boolean;
  workspace: string;
  sessionCount: number;
  lastActive: number | null;
};

type ChatBootstrapModel = {
  key: string;
  name: string;
};

type ChatBootstrapProvider = {
  id: string;
  name: string;
};

type ChatBootstrapResponse = {
  agents: ChatBootstrapAgent[];
  models: ChatBootstrapModel[];
  connectedProviders: ChatBootstrapProvider[];
  warnings?: string[];
  degraded?: boolean;
};

const PROVIDER_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  openrouter: "OpenRouter",
  groq: "Groq",
  xai: "xAI",
  mistral: "Mistral",
  ollama: "Ollama",
};

function formatModelName(model: string): string {
  const parts = model.split("/");
  return parts[parts.length - 1] || model;
}

/**
 * GET /api/chat/bootstrap
 *
 * Fetches agent, model, and provider info from the OpenClaw gateway
 * for the Chat UI. Falls back gracefully when the gateway is offline.
 */
export async function GET() {
  const warnings: string[] = [];

  let agents: ChatBootstrapAgent[] = [];
  let models: ChatBootstrapModel[] = [];
  let connectedProviders: ChatBootstrapProvider[] = [];

  try {
    const client = getOpenClawClient();

    // Try connecting if not already connected
    if (!client.isConnected()) {
      try {
        await client.connect();
      } catch (connectErr) {
        warnings.push(
          `Gateway connection failed: ${connectErr instanceof Error ? connectErr.message : String(connectErr)}`
        );
      }
    }

    // Fetch agents
    try {
      const rawAgents = await client.listAgents();
      if (Array.isArray(rawAgents)) {
        agents = rawAgents.map((a: unknown) => {
          const agent = (typeof a === "object" && a !== null ? a : {}) as Record<string, unknown>;
          const identity =
            typeof agent.identity === "object" && agent.identity !== null
              ? (agent.identity as Record<string, unknown>)
              : {};
          return {
            id: String(agent.id || "main"),
            name:
              String(identity.name || agent.name || agent.id || "main").trim() ||
              String(agent.id || "main"),
            emoji: String(identity.emoji || agent.emoji || "🤖").trim() || "🤖",
            model: String(agent.model || "unknown"),
            isDefault: Boolean(agent.isDefault || agent.id === "main"),
            workspace: String(agent.workspace || ""),
            sessionCount: Number(agent.sessionCount || 0),
            lastActive:
              agent.lastActive != null ? Number(agent.lastActive) : null,
          };
        });

        // Ensure at least one agent exists
        if (agents.length === 0) {
          agents.push({
            id: "main",
            name: "Agent",
            emoji: "🤖",
            model: "unknown",
            isDefault: true,
            workspace: "",
            sessionCount: 0,
            lastActive: null,
          });
        }
      }
    } catch (agentErr) {
      warnings.push(
        `Failed to list agents: ${agentErr instanceof Error ? agentErr.message : String(agentErr)}`
      );
      // Provide a fallback agent
      agents = [
        {
          id: "main",
          name: "Agent",
          emoji: "🤖",
          model: "unknown",
          isDefault: true,
          workspace: "",
          sessionCount: 0,
          lastActive: null,
        },
      ];
    }

    // Fetch models
    try {
      const rawModels = await client.listModels();
      if (Array.isArray(rawModels)) {
        models = rawModels
          .map((m: { id?: string; name?: string; key?: string }) => ({
            key: String(m.key || m.id || ""),
            name: String(m.name || m.key || m.id || ""),
          }))
          .filter((m) => m.key);
      }
    } catch {
      // Models are optional — the UI works without them
    }

    // Build provider list from agent model prefixes
    const providerIds = new Set<string>();
    for (const agent of agents) {
      if (agent.model && agent.model !== "unknown") {
        const prefix = agent.model.split("/")[0];
        if (prefix) providerIds.add(prefix);
      }
    }
    connectedProviders = Array.from(providerIds)
      .map((id) => ({ id, name: PROVIDER_NAMES[id] || id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    warnings.push(
      `Gateway unavailable: ${err instanceof Error ? err.message : String(err)}`
    );
    // Provide a fallback agent so the UI still renders
    agents = [
      {
        id: "main",
        name: "Agent",
        emoji: "🤖",
        model: "unknown",
        isDefault: true,
        workspace: "",
        sessionCount: 0,
        lastActive: null,
      },
    ];
  }

  const response: ChatBootstrapResponse = {
    agents,
    models,
    connectedProviders,
    ...(warnings.length > 0
      ? { warnings, degraded: true }
      : {}),
  };

  return NextResponse.json(response);
}