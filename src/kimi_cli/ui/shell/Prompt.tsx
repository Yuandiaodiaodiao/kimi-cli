/**
 * Prompt.tsx — Input prompt component.
 * Uses ✨ sparkles emoji matching Python version.
 */

import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { useInputHistory } from "../hooks/useInput";

interface PromptProps {
  onSubmit: (input: string) => void;
  disabled?: boolean;
  placeholder?: string;
  isStreaming?: boolean;
}

export function Prompt({
  onSubmit,
  disabled = false,
  placeholder = "Send a message... (/ for commands)",
  isStreaming = false,
}: PromptProps) {
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

  useInput(
    (_input, key) => {
      if (key.upArrow) historyPrev();
      else if (key.downArrow) historyNext();
    },
    { isActive: !disabled },
  );

  return (
    <Box>
      <Text>✨ </Text>
      {disabled ? (
        <Text color="#888888">
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
