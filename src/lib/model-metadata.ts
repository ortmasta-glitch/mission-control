/**
 * Model metadata and friendly naming utilities.
 *
 * Provides human-readable names for common AI models and providers.
 * Adapted from openclaw-mission-control for Mission Control implementation.
 */

// ── Friendly model names ──────────────────────────────────────────────────────

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // Anthropic
  "anthropic/claude-opus-4-20250514": "Claude Opus 4",
  "anthropic/claude-sonnet-4-20250514": "Claude Sonnet 4",
  "anthropic/claude-sonnet-4-6": "Claude Sonnet 4.6",
  "anthropic/claude-haiku-3-5-20241022": "Claude Haiku 3.5",
  "anthropic/claude-3-5-sonnet-20241022": "Claude 3.5 Sonnet",
  "anthropic/claude-3-5-haiku-20241022": "Claude 3.5 Haiku",
  "anthropic/claude-3-opus-20240229": "Claude 3 Opus",

  // OpenAI
  "openai/gpt-4.1": "GPT-4.1",
  "openai/gpt-4.1-mini": "GPT-4.1 Mini",
  "openai/gpt-4.1-nano": "GPT-4.1 Nano",
  "openai/gpt-4o": "GPT-4o",
  "openai/gpt-4o-mini": "GPT-4o Mini",
  "openai/o3": "o3",
  "openai/o3-mini": "o3 Mini",
  "openai/o4-mini": "o4 Mini",
  "openai/gpt-5": "GPT-5",
  "openai/gpt-5.4": "GPT-5.4",

  // Google
  "google/gemini-2.5-pro": "Gemini 2.5 Pro",
  "google/gemini-2.5-flash": "Gemini 2.5 Flash",
  "google/gemini-2.0-flash": "Gemini 2.0 Flash",

  // xAI
  "xai/grok-3": "Grok 3",
  "xai/grok-3-mini": "Grok 3 Mini",

  // DeepSeek
  "deepseek/deepseek-r1": "DeepSeek R1",
  "deepseek/deepseek-v3": "DeepSeek V3",

  // Meta
  "meta/llama-4-maverick": "Llama 4 Maverick",
  "meta/llama-4-scout": "Llama 4 Scout",

  // Mistral
  "mistral/mistral-large": "Mistral Large",
  "mistral/mistral-medium": "Mistral Medium",
  "mistral/mistral-small": "Mistral Small",
};

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  xai: "xAI",
  deepseek: "DeepSeek",
  meta: "Meta",
  mistral: "Mistral",
  openrouter: "OpenRouter",
  ollama: "Ollama",
  local: "Local",
  unknown: "Unknown",
};

/**
 * Returns a friendly display name for a full model identifier.
 * Falls back to the portion after the last "/" if no mapping exists.
 */
export function getFriendlyModelName(fullModel: string): string {
  if (MODEL_DISPLAY_NAMES[fullModel]) return MODEL_DISPLAY_NAMES[fullModel];

  // Try to derive a reasonable name from the key
  const shortName = fullModel.split("/").pop() ?? fullModel;
  // Capitalize first letter
  return shortName.charAt(0).toUpperCase() + shortName.slice(1);
}

/**
 * Returns a friendly provider display name from a provider key.
 */
export function getProviderDisplayName(provider: string): string {
  return PROVIDER_DISPLAY_NAMES[provider.toLowerCase()] ?? provider;
}

/**
 * Extracts the provider prefix from a full model identifier.
 */
export function getModelProvider(fullModel: string): string {
  const provider = String(fullModel || "").split("/")[0]?.trim().toLowerCase();
  return provider || "unknown";
}