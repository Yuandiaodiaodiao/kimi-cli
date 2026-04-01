/**
 * StatusBar component — bottom status bar.
 * Corresponds to the bottom toolbar in Python's prompt.py.
 *
 * Displays: model name, token count, context usage, session id
 */

import React from "react";
import { Box, Text } from "ink";
import { getToolbarColors, getMessageColors } from "../theme";
import type { StatusUpdate } from "../../wire/types";

interface StatusBarProps {
  modelName?: string;
  status: StatusUpdate | null;
  isStreaming: boolean;
  stepCount: number;
  isCompacting?: boolean;
  planMode?: boolean;
}

export function StatusBar({
  modelName = "",
  status,
  isStreaming,
  stepCount,
  isCompacting = false,
  planMode = false,
}: StatusBarProps) {
  const toolbar = getToolbarColors();
  const colors = getMessageColors();

  // Context usage
  const contextUsage = status?.context_usage;
  const contextTokens = status?.context_tokens;
  const maxContextTokens = status?.max_context_tokens;

  // Token usage
  const tokenUsage = status?.token_usage;
  const inputTokens = tokenUsage?.inputTokens ?? 0;
  const outputTokens = tokenUsage?.outputTokens ?? 0;

  // Format context bar
  const contextPercent = contextUsage != null ? Math.round(contextUsage * 100) : null;
  const contextColor =
    contextPercent != null
      ? contextPercent > 80
        ? colors.error
        : contextPercent > 60
          ? "#f2cc60"
          : colors.dim
      : colors.dim;

  return (
    <Box
      borderStyle="single"
      borderColor={toolbar.separator}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box gap={2}>
        {/* Model name */}
        {modelName && (
          <Text color={colors.assistant} bold>
            {modelName}
          </Text>
        )}

        {/* Plan mode indicator */}
        {planMode && (
          <Text color={toolbar.planLabel} bold>
            [PLAN]
          </Text>
        )}

        {/* Streaming indicator */}
        {isStreaming && (
          <Text color={colors.highlight}>
            ● Step {stepCount}
          </Text>
        )}

        {/* Compacting indicator */}
        {isCompacting && (
          <Text color="#f2cc60">
            ⟳ Compacting...
          </Text>
        )}
      </Box>

      <Box gap={2}>
        {/* Token count */}
        {(inputTokens > 0 || outputTokens > 0) && (
          <Text color={colors.dim}>
            ↑{formatTokenCount(inputTokens)} ↓{formatTokenCount(outputTokens)}
          </Text>
        )}

        {/* Context usage */}
        {contextPercent != null && (
          <Text color={contextColor}>
            ctx: {contextPercent}%
            {contextTokens != null && maxContextTokens != null && (
              <Text color={colors.dim}>
                {" "}({formatTokenCount(contextTokens)}/{formatTokenCount(maxContextTokens)})
              </Text>
            )}
          </Text>
        )}
      </Box>
    </Box>
  );
}

/**
 * Format token count for display (e.g., 1234 → "1.2k", 1234567 → "1.2M")
 */
function formatTokenCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}
