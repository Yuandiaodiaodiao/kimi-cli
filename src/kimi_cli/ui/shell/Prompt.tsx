/**
 * Prompt.tsx — Input prompt component.
 * Corresponds to Python's ui/shell/prompt.py.
 *
 * Features:
 * - Text input with ink-text-input
 * - Enter to submit
 * - Up/Down arrow for history navigation
 * - Slash command detection
 * - Placeholder text
 */

import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { getMessageColors } from "../theme";
import { useInputHistory } from "../hooks/useInput";

interface PromptProps {
  /** Called when user submits input */
  onSubmit: (input: string) => void;
  /** Whether input is disabled (e.g., during streaming) */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Whether the agent is currently streaming */
  isStreaming?: boolean;
}

export function Prompt({
  onSubmit,
  disabled = false,
  placeholder = "Send a message... (/ for commands)",
  isStreaming = false,
}: PromptProps) {
  const colors = getMessageColors();
  const {
    value,
    setValue,
    historyPrev,
    historyNext,
    addToHistory,
    isSlashCommand,
  } = useInputHistory();

  const handleSubmit = useCallback(
    (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) return;
      addToHistory(trimmed);
      setValue("");
      onSubmit(trimmed);
    },
    [onSubmit, addToHistory, setValue],
  );

  // Handle up/down arrows for history
  useInput(
    (input, key) => {
      if (key.upArrow) {
        historyPrev();
      } else if (key.downArrow) {
        historyNext();
      }
    },
    { isActive: !disabled },
  );

  const promptChar = isSlashCommand ? "/" : ">";
  const promptColor = isSlashCommand ? colors.highlight : colors.user;

  return (
    <Box>
      <Text color={promptColor} bold>
        {promptChar}{" "}
      </Text>
      {disabled ? (
        <Text color={colors.dim}>
          {isStreaming ? "Agent is responding..." : "Processing..."}
        </Text>
      ) : (
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder={placeholder}
        />
      )}
    </Box>
  );
}
