/**
 * Shell.tsx — Main REPL component.
 * Corresponds to Python's ui/shell/__init__.py.
 *
 * Layout logic:
 * - WelcomeBox: fixed at top (will scroll off when content grows)
 * - ChatList: height = content lines (grows as messages added)
 * - InputBox: flexGrow=1 + minHeight=6, fills remaining space
 *   - text starts from top (row 0)
 *   - when ChatList grows, InputBox shrinks down to minHeight
 *   - when InputBox is at minHeight, total layout exceeds screen → scrollable
 * - StatusBar: always at bottom
 */

import React, { useCallback, useEffect, useState } from "react";
import { Box, useApp, useStdout } from "ink";
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

const INPUT_MIN_HEIGHT = 6;

/** Deduplicate commands by name, shell commands take priority */
function deduplicateCommands(commands: SlashCommand[]): SlashCommand[] {
  const seen = new Map<string, SlashCommand>();
  for (const cmd of commands) {
    if (!seen.has(cmd.name)) {
      seen.set(cmd.name, cmd);
    }
  }
  return [...seen.values()];
}

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
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);

  // Wire state
  const wire = useWire({ onReady: onWireReady });

  // Shell slash commands
  const shellCommands = createShellSlashCommands({
    clearMessages: wire.clearMessages,
    exit: () => exit(),
    setTheme: (theme) => setActiveTheme(theme),
  });

  const allCommands = deduplicateCommands([
    ...shellCommands,
    ...extraSlashCommands,
  ]);

  // Handle terminal resize
  useEffect(() => {
    const onResize = () => setTermHeight(stdout?.rows || 24);
    stdout?.on("resize", onResize);
    return () => {
      stdout?.off("resize", onResize);
    };
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

  // Calculate status bar height (separator + 2 lines of status)
  const statusBarHeight = slashMenuVisible ? 0 : 3;

  return (
    <Box flexDirection="column" minHeight={termHeight}>
      {/* ═══ Top: Welcome box ═══ */}
      <WelcomeBox
        workDir={workDir}
        sessionId={sessionId}
        modelName={modelName}
        tip="Spot a bug or have feedback? Type /feedback right in this session — every report makes Kimi better."
      />

      {/* ═══ ChatList: height follows content ═══ */}
      <Box flexDirection="column" flexShrink={0}>
        <MessageList
          messages={wire.messages}
          isStreaming={wire.isStreaming}
        />

        {wire.isStreaming && !wire.isCompacting && (
          <StreamingSpinner stepCount={wire.stepCount} />
        )}

        <CompactionSpinner active={wire.isCompacting} />

        {wire.pendingApproval && (
          <ApprovalPrompt
            request={wire.pendingApproval}
            onRespond={handleApprovalResponse}
          />
        )}
      </Box>

      {/* ═══ InputBox: fills remaining, min 6 lines, text at top ═══ */}
      <Box
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        minHeight={INPUT_MIN_HEIGHT}
      >
        <Prompt
          onSubmit={handleSubmit}
          disabled={false}
          isStreaming={wire.isStreaming}
          commands={allCommands}
          onSlashMenuChange={setSlashMenuVisible}
        />
      </Box>

      {/* ═══ Bottom: Status bar (always visible, hidden when slash menu) ═══ */}
      {!slashMenuVisible && (
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
      )}
    </Box>
  );
}
