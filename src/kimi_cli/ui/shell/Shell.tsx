/**
 * Shell.tsx — Main REPL component.
 * Corresponds to Python's ui/shell/__init__.py.
 *
 * Layout (matching Python):
 * ┌─ WelcomeBox ─────────────────────────┐
 * │  Logo  Welcome to Kimi Code CLI!     │
 * │  Directory / Session / Model          │
 * └──────────────────────────────────────┘
 *
 * [Messages...]                    ← middle area (flex-grow)
 * ✨ input_                        ← input inside middle area
 *
 * ─────────────────────────────────────────  ← bottom
 * agent (model ●)  ~/dir  context: 0.0%
 */

import React, { useCallback, useEffect, useState } from "react";
import { Box, Text, useApp, useStdout } from "ink";
import { MessageList } from "./Visualize.tsx";
import { Prompt } from "./Prompt.tsx";
import { WelcomeBox } from "../components/WelcomeBox.tsx";
import { StatusBar } from "../components/StatusBar.tsx";
import { ApprovalPrompt } from "../components/ApprovalPrompt.tsx";
import { StreamingSpinner, CompactionSpinner } from "../components/Spinner.tsx";
import { useWire } from "../hooks/useWire.ts";
import { useKeyboard } from "./keyboard.ts";
import {
  createShellSlashCommands,
  parseSlashCommand,
  findSlashCommand,
} from "./slash.ts";
import { setActiveTheme } from "../theme.ts";
import type { WireUIEvent } from "./events.ts";
import type { ApprovalResponseKind } from "../../wire/types.ts";
import type { SlashCommand } from "../../types.ts";

export interface ShellProps {
  modelName?: string;
  workDir?: string;
  sessionId?: string;
  thinking?: boolean;
  onSubmit?: (input: string) => void;
  onApprovalResponse?: (
    requestId: string,
    decision: ApprovalResponseKind,
    feedback?: string,
  ) => void;
  onWireReady?: (pushEvent: (event: WireUIEvent) => void) => void;
  extraSlashCommands?: SlashCommand[];
}

export function Shell({
  modelName = "",
  workDir,
  sessionId,
  thinking = false,
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
    const onResize = () => setTermHeight(stdout?.rows || 24);
    stdout?.on("resize", onResize);
    return () => { stdout?.off("resize", onResize); };
  }, [stdout]);

  // Keyboard handling
  useKeyboard({
    onAction: (action) => {
      if (action === "interrupt" && wire.isStreaming) {
        wire.pushEvent({ type: "error", message: "Interrupted by user" });
      }
    },
    active: false,
  });

  // Handle user input
  const handleSubmit = useCallback(
    (input: string) => {
      const parsed = parseSlashCommand(input);
      if (parsed) {
        const cmd = findSlashCommand(allCommands, parsed.name);
        if (cmd) {
          cmd.handler(parsed.args);
          return;
        }
        wire.pushEvent({
          type: "notification",
          title: "Unknown command",
          body: `/${parsed.name} is not a recognized command. Type /help for available commands.`,
        });
        return;
      }
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
      {/* Top: Welcome box */}
      <WelcomeBox
        workDir={workDir}
        sessionId={sessionId}
        modelName={modelName}
        tip="Spot a bug or have feedback? Type /feedback right in this session — every report makes Kimi better."
      />

      {/* Middle: Chat area (flex-grow) */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {/* Chat history — grows upward, messages from top */}
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          <MessageList messages={wire.messages} isStreaming={wire.isStreaming} />

          {/* Streaming indicator */}
          {wire.isStreaming && !wire.isCompacting && (
            <StreamingSpinner stepCount={wire.stepCount} />
          )}

          {/* Compaction indicator */}
          <CompactionSpinner active={wire.isCompacting} />
        </Box>

        {/* Approval prompt (modal) */}
        {wire.pendingApproval && (
          <ApprovalPrompt
            request={wire.pendingApproval}
            onRespond={handleApprovalResponse}
          />
        )}

        {/* Input prompt ✨ — fixed at bottom of chat area */}
        <Prompt
          onSubmit={handleSubmit}
          disabled={wire.isStreaming || !!wire.pendingApproval}
          isStreaming={wire.isStreaming}
        />
      </Box>

      {/* Bottom: Status bar (separator line + status text) */}
      <StatusBar
        modelName={modelName}
        workDir={workDir}
        status={wire.status}
        isStreaming={wire.isStreaming}
        stepCount={wire.stepCount}
        isCompacting={wire.isCompacting}
        planMode={wire.status?.plan_mode ?? false}
        thinking={thinking}
      />
    </Box>
  );
}
