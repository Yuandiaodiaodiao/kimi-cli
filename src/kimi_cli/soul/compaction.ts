/**
 * Compaction — corresponds to Python soul/compaction.py
 * Summarizes conversation history when context window is getting full.
 */

import type { LLM } from "../llm.ts";
import type { Message } from "../types.ts";
import type { Context } from "./context.ts";
import { logger } from "../utils/logging.ts";

/**
 * Simple compaction strategy: ask the LLM to summarize the conversation.
 */
export async function compactContext(
  context: Context,
  llm: LLM,
  opts?: {
    focus?: string;
    onBegin?: () => void;
    onEnd?: () => void;
  },
): Promise<void> {
  const history = context.history;
  if (history.length === 0) return;

  opts?.onBegin?.();

  try {
    // Build summary request
    const summaryPrompt = buildSummaryPrompt(history, opts?.focus);

    // Ask LLM to summarize
    let summary = "";
    try {
      const stream = llm.chat(
        [{ role: "user", content: summaryPrompt }],
        {
          system:
            "You are a helpful assistant that summarizes conversations concisely. " +
            "Focus on key decisions, code changes, tool results, and important context. " +
            "Be concise but preserve critical details.",
          maxTokens: 4096,
        },
      );

      for await (const chunk of stream) {
        if (chunk.type === "text") {
          summary += chunk.text;
        }
      }
    } catch (err) {
      logger.warn(`Compaction LLM call failed, using fallback: ${err}`);
      summary = buildFallbackSummary(history);
    }

    // Clear context and inject summary
    await context.compact();

    if (summary) {
      await context.appendMessage({
        role: "user",
        content: `<system-reminder>\nPrevious conversation summary:\n${summary}\n</system-reminder>`,
      });
      await context.appendMessage({
        role: "assistant",
        content:
          "I understand the previous context. I'm ready to continue from where we left off.",
      });
    }
  } finally {
    opts?.onEnd?.();
  }
}

function buildSummaryPrompt(
  history: readonly Message[],
  focus?: string,
): string {
  const parts: string[] = [
    "Please summarize the following conversation. Preserve:",
    "- Key decisions and outcomes",
    "- Important file paths and code changes",
    "- Tool call results that are still relevant",
    "- Any pending tasks or goals",
  ];

  if (focus) {
    parts.push(`\nFocus especially on: ${focus}`);
  }

  parts.push("\n--- CONVERSATION ---\n");

  for (const msg of history) {
    const role = msg.role.toUpperCase();
    const content =
      typeof msg.content === "string"
        ? msg.content
        : msg.content.map((p) => ("text" in p ? p.text : `[${p.type}]`)).join("\n");

    // Truncate very long messages
    const truncated =
      content.length > 2000
        ? content.slice(0, 2000) + "\n... [truncated]"
        : content;

    parts.push(`[${role}]: ${truncated}\n`);
  }

  return parts.join("\n");
}

function buildFallbackSummary(history: readonly Message[]): string {
  // Simple fallback: keep last few messages as summary
  const last = history.slice(-6);
  const parts = ["[Fallback summary - LLM compaction failed]"];

  for (const msg of last) {
    const content =
      typeof msg.content === "string"
        ? msg.content.slice(0, 500)
        : msg.content
            .map((p) => ("text" in p ? p.text : `[${p.type}]`))
            .join("\n")
            .slice(0, 500);
    parts.push(`[${msg.role}]: ${content}`);
  }

  return parts.join("\n");
}

/**
 * Check if compaction should be triggered.
 */
export function shouldCompact(
  tokenCount: number,
  maxContextSize: number,
  reservedContextSize: number,
  compactionTriggerRatio: number,
): boolean {
  if (tokenCount + reservedContextSize >= maxContextSize) return true;
  if (tokenCount >= maxContextSize * compactionTriggerRatio) return true;
  return false;
}
