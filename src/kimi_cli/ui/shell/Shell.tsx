/**
 * Shell.tsx — Main REPL component.
 * Corresponds to Python's ui/shell/__init__.py.
 *
 * Root Ink component managing overall layout:
 * - MessageList (flex-grow) → StatusBar → InputPrompt (bottom)
 * - Connects to Wire EventBus for agent events
 * - Handles slash command routing
 */

import React, { useCallback, useEffect, useState } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import { MessageList } from "./Visualize";
import { Prompt } from "./Prompt";
import { StatusBar } from "../components/StatusBar";
import { ApprovalPrompt } from "../components/ApprovalPrompt";
import { StreamingSpinner, CompactionSpinner } from "../components/Spinner";
import { useWire } from "../hooks/useWire";
import { useKeyboard } from "./keyboard";
import {
  createShellSlashCommands,
  parseSlashCommand,
  findSlashCommand,
} from "./slash";
import { setActiveTheme } from "../theme";
import type { WireUIEvent } from "./events";
import type { ApprovalResponseKind } from "../../wire/types";
import type { SlashCommand } from "../../types";

export interface ShellProps {
  /** Model name to display in status bar */
  modelName?: string;
  /** Callback when user submits a message to the agent */
  onSubmit?: (input: string) => void;
  /** Callback when approval is responded to */
  onApprovalResponse?: (
    requestId: string,
    decision: ApprovalResponseKind,
    feedback?: string,
  ) => void;
  /** External event source — provides pushEvent callback */
  onWireReady?: (pushEvent: (event: WireUIEvent) => void) => void;
  /** Additional slash commands from soul/agent level */
  extraSlashCommands?: SlashCommand[];
}

export function Shell({
  modelName = "",
  onSubmit,
  onApprovalResponse,
  onWireReady,
  extraSlashCommands = [],
}: ShellProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [termHeight, setTermHeight] = useState(stdout?.rows || 24);

  // Wire state
  const wire = useWire({ onReady: onWireReady });

  // Shell slash commands
  const shellCommands = createShellSlashCommands({
    clearMessages: wire.clearMessages,
    exit: () => exit(),
    setTheme: (theme) => setActiveTheme(theme),
  });

  const allCommands = [...shellCommands, ...extraSlashCommands];

  // Handle terminal resize
  useEffect(() => {
    const onResize = () => {
      setTermHeight(stdout?.rows || 24);
    };
    stdout?.on("resize", onResize);
    return () => {
      stdout?.off("resize", onResize);
    };
  }, [stdout]);

  // Keyboard handling
  useKeyboard({
    onAction: (action) => {
      if (action === "interrupt") {
        if (wire.isStreaming) {
          // Send interrupt to agent
          wire.pushEvent({ type: "error", message: "Interrupted by user" });
        }
      }
    },
    active: false, // Prompt handles its own input
  });

  // Handle user input submission
  const handleSubmit = useCallback(
    (input: string) => {
      // Check for slash commands first
      const parsed = parseSlashCommand(input);
      if (parsed) {
        const cmd = findSlashCommand(allCommands, parsed.name);
        if (cmd) {
          cmd.handler(parsed.args);
          return;
        }
        // Unknown slash command — send as regular message with warning
        wire.pushEvent({
          type: "notification",
          title: "Unknown command",
          body: `/${parsed.name} is not a recognized command. Type /help for available commands.`,
        });
        return;
      }

      // Regular message — send to agent
      onSubmit?.(input);
    },
    [allCommands, onSubmit, wire],
  );

  // Handle approval response
  const handleApprovalResponse = useCallback(
    (decision: ApprovalResponseKind, feedback?: string) => {
      if (wire.pendingApproval) {
        onApprovalResponse?.(wire.pendingApproval.id, decision, feedback);
        wire.pushEvent({
          type: "approval_response",
          requestId: wire.pendingApproval.id,
          response: decision,
        });
      }
    },
    [wire.pendingApproval, onApprovalResponse, wire],
  );

  return (
    <Box flexDirection="column" height={termHeight}>
      {/* Message area (flex-grow) */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <MessageList messages={wire.messages} isStreaming={wire.isStreaming} />

        {/* Streaming indicator */}
        {wire.isStreaming && !wire.isCompacting && (
          <StreamingSpinner stepCount={wire.stepCount} />
        )}

        {/* Compaction indicator */}
        <CompactionSpinner active={wire.isCompacting} />
      </Box>

      {/* Approval prompt (modal overlay) */}
      {wire.pendingApproval && (
        <ApprovalPrompt
          request={wire.pendingApproval}
          onRespond={handleApprovalResponse}
        />
      )}

      {/* Status bar */}
      <StatusBar
        modelName={modelName}
        status={wire.status}
        isStreaming={wire.isStreaming}
        stepCount={wire.stepCount}
        isCompacting={wire.isCompacting}
        planMode={wire.status?.plan_mode ?? false}
      />

      {/* Input prompt */}
      <Prompt
        onSubmit={handleSubmit}
        disabled={wire.isStreaming || !!wire.pendingApproval}
        isStreaming={wire.isStreaming}
      />
    </Box>
  );
}
