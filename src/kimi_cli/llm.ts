/**
 * LLM abstraction layer — corresponds to Python's llm.py
 * Provides a unified interface for multiple LLM providers.
 */

import type { Message, ModelCapability, TokenUsage } from "./types";

// ── Provider Types ─────────────────────────────────────────

export type ProviderType =
  | "kimi"
  | "openai_legacy"
  | "openai_responses"
  | "anthropic"
  | "google_genai"
  | "gemini"
  | "vertexai"
  | "_echo"
  | "_scripted_echo"
  | "_chaos";

// ── Stream Chunk Types ─────────────────────────────────────

export interface TextChunk {
  type: "text";
  text: string;
}

export interface ThinkChunk {
  type: "think";
  text: string;
}

export interface ToolCallChunk {
  type: "tool_call";
  id: string;
  name: string;
  arguments: string;
}

export interface UsageChunk {
  type: "usage";
  usage: TokenUsage;
}

export interface DoneChunk {
  type: "done";
  messageId?: string;
}

export type StreamChunk =
  | TextChunk
  | ThinkChunk
  | ToolCallChunk
  | UsageChunk
  | DoneChunk;

// ── LLM Provider Interface ────────────────────────────────

export interface LLMProviderConfig {
  type: ProviderType;
  baseUrl: string;
  apiKey: string;
  customHeaders?: Record<string, string>;
  env?: Record<string, string>;
  oauth?: string | null;
}

export interface LLMModelConfig {
  model: string;
  provider: string;
  maxContextSize: number;
  capabilities?: ModelCapability[];
}

export interface ChatOptions {
  /** System prompt */
  system?: string;
  /** Generation temperature */
  temperature?: number;
  /** Top-p nucleus sampling */
  topP?: number;
  /** Maximum output tokens */
  maxTokens?: number;
  /** Enable/disable thinking */
  thinking?: "high" | "low" | "off";
  /** Tool definitions for the model */
  tools?: ToolDefinition[];
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Abstract interface for LLM providers.
 * Each provider (Anthropic, OpenAI, Kimi, etc.) implements this.
 */
export interface LLMProvider {
  readonly modelName: string;

  /**
   * Send a chat completion request and return a stream of chunks.
   */
  chat(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<StreamChunk>;
}

// ── LLM Class ──────────────────────────────────────────────

/**
 * Wraps an LLM provider with model capabilities and context limits.
 */
export class LLM {
  readonly provider: LLMProvider;
  readonly maxContextSize: number;
  readonly capabilities: Set<ModelCapability>;
  readonly modelConfig: LLMModelConfig | null;
  readonly providerConfig: LLMProviderConfig | null;

  constructor(opts: {
    provider: LLMProvider;
    maxContextSize: number;
    capabilities: Set<ModelCapability>;
    modelConfig?: LLMModelConfig | null;
    providerConfig?: LLMProviderConfig | null;
  }) {
    this.provider = opts.provider;
    this.maxContextSize = opts.maxContextSize;
    this.capabilities = opts.capabilities;
    this.modelConfig = opts.modelConfig ?? null;
    this.providerConfig = opts.providerConfig ?? null;
  }

  get modelName(): string {
    return this.provider.modelName;
  }

  /**
   * Check if the model has a specific capability.
   */
  hasCapability(cap: ModelCapability): boolean {
    return this.capabilities.has(cap);
  }

  /**
   * Stream a chat completion.
   */
  chat(
    messages: Message[],
    options?: ChatOptions
  ): AsyncIterable<StreamChunk> {
    return this.provider.chat(messages, options);
  }
}

// ── Model Display Name ─────────────────────────────────────

export function modelDisplayName(modelName: string | null): string {
  if (!modelName) return "";
  if (modelName === "kimi-for-coding" || modelName === "kimi-code") {
    return `${modelName} (powered by kimi-k2.5)`;
  }
  return modelName;
}

// ── Capability Detection ───────────────────────────────────

const ALL_MODEL_CAPABILITIES: Set<ModelCapability> = new Set([
  "image_in",
  "video_in",
  "thinking",
  "always_thinking",
]);

/**
 * Derive model capabilities from model config.
 */
export function deriveModelCapabilities(
  model: LLMModelConfig
): Set<ModelCapability> {
  const capabilities = new Set<ModelCapability>(model.capabilities ?? []);
  const lowerName = model.model.toLowerCase();

  if (lowerName.includes("thinking") || lowerName.includes("reason")) {
    capabilities.add("thinking");
    capabilities.add("always_thinking");
  } else if (
    model.model === "kimi-for-coding" ||
    model.model === "kimi-code"
  ) {
    capabilities.add("thinking");
    capabilities.add("image_in");
    capabilities.add("video_in");
  }

  return capabilities;
}

// ── Environment Variable Overrides ─────────────────────────

/**
 * Override provider/model settings from environment variables.
 * Returns a mapping of env vars that were applied.
 */
export function augmentProviderWithEnvVars(
  provider: LLMProviderConfig,
  model: LLMModelConfig
): Record<string, string> {
  const applied: Record<string, string> = {};

  switch (provider.type) {
    case "kimi": {
      const baseUrl = Bun.env.KIMI_BASE_URL;
      if (baseUrl) {
        provider.baseUrl = baseUrl;
        applied["KIMI_BASE_URL"] = baseUrl;
      }
      const apiKey = Bun.env.KIMI_API_KEY;
      if (apiKey) {
        provider.apiKey = apiKey;
        applied["KIMI_API_KEY"] = "******";
      }
      const modelName = Bun.env.KIMI_MODEL_NAME;
      if (modelName) {
        model.model = modelName;
        applied["KIMI_MODEL_NAME"] = modelName;
      }
      const maxCtx = Bun.env.KIMI_MODEL_MAX_CONTEXT_SIZE;
      if (maxCtx) {
        model.maxContextSize = parseInt(maxCtx, 10);
        applied["KIMI_MODEL_MAX_CONTEXT_SIZE"] = maxCtx;
      }
      const caps = Bun.env.KIMI_MODEL_CAPABILITIES;
      if (caps) {
        const parsed = caps
          .split(",")
          .map((c) => c.trim().toLowerCase())
          .filter((c): c is ModelCapability => ALL_MODEL_CAPABILITIES.has(c as ModelCapability));
        model.capabilities = parsed;
        applied["KIMI_MODEL_CAPABILITIES"] = caps;
      }
      break;
    }
    case "openai_legacy":
    case "openai_responses": {
      const baseUrl = Bun.env.OPENAI_BASE_URL;
      if (baseUrl) provider.baseUrl = baseUrl;
      const apiKey = Bun.env.OPENAI_API_KEY;
      if (apiKey) provider.apiKey = apiKey;
      break;
    }
    default:
      break;
  }

  return applied;
}

// ── Token Estimation ───────────────────────────────────────

/**
 * Simple token count estimation (~4 chars per token).
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate tokens for an array of messages.
 */
export function estimateMessagesTokenCount(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      total += estimateTokenCount(msg.content);
    } else {
      for (const part of msg.content) {
        if ("text" in part) {
          total += estimateTokenCount((part as { text: string }).text);
        }
      }
    }
    // Overhead per message (role, separators)
    total += 4;
  }
  return total;
}

// ── Factory (placeholder providers) ────────────────────────

/**
 * Create an LLM instance from provider and model config.
 * Currently creates a stub provider — real provider implementations
 * will be added when the HTTP client layer is ready.
 */
export function createLLM(
  provider: LLMProviderConfig,
  model: LLMModelConfig,
  options?: {
    thinking?: boolean | null;
    sessionId?: string | null;
  }
): LLM | null {
  if (
    provider.type !== "_echo" &&
    provider.type !== "_scripted_echo" &&
    (!provider.baseUrl || !model.model)
  ) {
    return null;
  }

  const capabilities = deriveModelCapabilities(model);

  // Determine thinking mode
  let thinkingMode: "high" | "off" | undefined;
  if (
    capabilities.has("always_thinking") ||
    (options?.thinking === true && capabilities.has("thinking"))
  ) {
    thinkingMode = "high";
  } else if (options?.thinking === false) {
    thinkingMode = "off";
  }

  // Create a stub provider — real implementations will be plugged in
  const stubProvider: LLMProvider = {
    modelName: model.model,
    async *chat(messages: Message[], chatOpts?: ChatOptions) {
      throw new Error(
        `LLM provider "${provider.type}" is not yet implemented in TypeScript. ` +
          `Model: ${model.model}`
      );
    },
  };

  return new LLM({
    provider: stubProvider,
    maxContextSize: model.maxContextSize,
    capabilities,
    modelConfig: model,
    providerConfig: provider,
  });
}
