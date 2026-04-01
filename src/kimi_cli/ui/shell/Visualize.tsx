/**
 * Visualize.tsx — Message visualization components.
 * Corresponds to Python's ui/shell/visualize.py.
 *
 * Components:
 * - MessageList: renders all messages
 * - Message: single message with role-based styling
 * - ToolCallView: tool call display (collapsible)
 * - StreamingText: streaming text with cursor
 * - ThinkingView: thinking/reasoning display
 */

import React, { useState } from "react";
import { Box, Text, Newline } from "ink";
import chalk from "chalk";
import { getStyles, getMessageColors } from "../theme";
import type {
  UIMessage,
  MessageSegment,
  TextSegment,
  ThinkSegment,
  ToolCallSegment,
} from "./events";
import type { ToolResult, DisplayBlock } from "../../wire/types";

// ── MessageList ────────────────────────────────────────────

interface MessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  return (
    <Box flexDirection="column" flexGrow={1}>
      {messages.map((msg, idx) => (
        <MessageView
          key={msg.id}
          message={msg}
          isLast={idx === messages.length - 1}
          isStreaming={isStreaming && idx === messages.length - 1}
        />
      ))}
    </Box>
  );
}

// ── MessageView ────────────────────────────────────────────

interface MessageViewProps {
  message: UIMessage;
  isLast: boolean;
  isStreaming: boolean;
}

function MessageView({ message, isLast, isStreaming }: MessageViewProps) {
  const colors = getMessageColors();

  const roleLabel = getRoleLabel(message.role);
  const roleColor = getRoleColor(message.role, colors);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={roleColor} bold>
        {roleLabel}
      </Text>
      {message.segments.map((segment, idx) => (
        <SegmentView
          key={idx}
          segment={segment}
          isStreaming={isStreaming && idx === message.segments.length - 1}
        />
      ))}
    </Box>
  );
}

function getRoleLabel(
  role: string,
): string {
  switch (role) {
    case "user":
      return "You";
    case "assistant":
      return "Assistant";
    case "system":
      return "System";
    case "tool":
      return "Tool";
    default:
      return role;
  }
}

function getRoleColor(
  role: string,
  colors: ReturnType<typeof getMessageColors>,
): string {
  switch (role) {
    case "user":
      return colors.user;
    case "assistant":
      return colors.assistant;
    case "system":
      return colors.system;
    case "tool":
      return colors.tool;
    default:
      return colors.dim;
  }
}

// ── SegmentView ────────────────────────────────────────────

interface SegmentViewProps {
  segment: MessageSegment;
  isStreaming: boolean;
}

function SegmentView({ segment, isStreaming }: SegmentViewProps) {
  switch (segment.type) {
    case "text":
      return <StreamingText text={segment.text} isStreaming={isStreaming} />;
    case "think":
      return <ThinkingView text={segment.text} />;
    case "tool_call":
      return <ToolCallView toolCall={segment} />;
    default:
      return null;
  }
}

// ── StreamingText ──────────────────────────────────────────

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
}

export function StreamingText({ text, isStreaming }: StreamingTextProps) {
  const colors = getMessageColors();
  return (
    <Box>
      <Text color={colors.assistant}>
        {renderMarkdownInline(text)}
        {isStreaming ? "▌" : ""}
      </Text>
    </Box>
  );
}

// ── ThinkingView ───────────────────────────────────────────

interface ThinkingViewProps {
  text: string;
}

export function ThinkingView({ text }: ThinkingViewProps) {
  const colors = getMessageColors();
  return (
    <Box borderStyle="single" borderColor={colors.thinking} paddingX={1}>
      <Text color={colors.thinking} italic>
        💭 {text}
      </Text>
    </Box>
  );
}

// ── ToolCallView ───────────────────────────────────────────

interface ToolCallViewProps {
  toolCall: ToolCallSegment;
}

export function ToolCallView({ toolCall }: ToolCallViewProps) {
  const [collapsed, setCollapsed] = useState(toolCall.collapsed);
  const colors = getMessageColors();
  const statusIcon = toolCall.result
    ? toolCall.result.return_value.isError
      ? "✗"
      : "✓"
    : "⟳";
  const statusColor = toolCall.result
    ? toolCall.result.return_value.isError
      ? colors.error
      : colors.highlight
    : colors.dim;

  // Format arguments for display
  let argsPreview = "";
  try {
    const parsed = JSON.parse(toolCall.arguments);
    const key = extractKeyArgument(toolCall.name, parsed);
    argsPreview = key || truncate(toolCall.arguments, 60);
  } catch {
    argsPreview = truncate(toolCall.arguments, 60);
  }

  return (
    <Box flexDirection="column" marginY={0}>
      <Box>
        <Text color={statusColor}>{statusIcon} </Text>
        <Text color={colors.tool} bold>
          {toolCall.name}
        </Text>
        <Text color={colors.dim}> {argsPreview}</Text>
      </Box>
      {!collapsed && toolCall.result && (
        <Box marginLeft={2} flexDirection="column">
          <ToolResultView result={toolCall.result} />
        </Box>
      )}
    </Box>
  );
}

// ── ToolResultView ─────────────────────────────────────────

interface ToolResultViewProps {
  result: ToolResult;
}

function ToolResultView({ result }: ToolResultViewProps) {
  const colors = getMessageColors();
  const output = result.return_value.output;
  const isError = result.return_value.isError;
  const truncated = truncate(output, 500);

  return (
    <Box flexDirection="column">
      {result.display.map((block, idx) => (
        <DisplayBlockView key={idx} block={block} />
      ))}
      {!result.display.length && (
        <Text color={isError ? colors.error : colors.dim}>{truncated}</Text>
      )}
    </Box>
  );
}

// ── DisplayBlockView ───────────────────────────────────────

interface DisplayBlockViewProps {
  block: DisplayBlock;
}

function DisplayBlockView({ block }: DisplayBlockViewProps) {
  const colors = getMessageColors();
  const b = block as Record<string, unknown>;

  switch (block.type) {
    case "brief":
      return <Text color={colors.dim}>{b.brief as string}</Text>;
    case "diff":
      return (
        <DiffView
          block={{
            path: b.path as string,
            old_text: b.old_text as string,
            new_text: b.new_text as string,
          }}
        />
      );
    case "shell":
      return (
        <Box>
          <Text color={colors.dim}>$ </Text>
          <Text>{b.command as string}</Text>
        </Box>
      );
    case "todo": {
      const items = b.items as Array<{
        title: string;
        status: string;
      }>;
      return (
        <Box flexDirection="column">
          {items.map((item, idx) => (
            <Box key={idx}>
              <Text>
                {item.status === "done"
                  ? "✓"
                  : item.status === "in_progress"
                    ? "⟳"
                    : "○"}{" "}
                {item.title}
              </Text>
            </Box>
          ))}
        </Box>
      );
    }
    default:
      return null;
  }
}

// ── DiffView ───────────────────────────────────────────────

function DiffView({
  block,
}: {
  block: { path: string; old_text: string; new_text: string };
}) {
  const colors = getMessageColors();
  return (
    <Box flexDirection="column">
      <Text color={colors.dim}>--- {block.path}</Text>
      <Text color={colors.dim}>+++ {block.path}</Text>
      {block.old_text.split("\n").map((line, idx) => (
        <Text key={`old-${idx}`} color="#ff7b72">
          - {line}
        </Text>
      ))}
      {block.new_text.split("\n").map((line, idx) => (
        <Text key={`new-${idx}`} color="#56d364">
          + {line}
        </Text>
      ))}
    </Box>
  );
}

// ── Helpers ────────────────────────────────────────────────

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

/**
 * Extract the most relevant argument from a tool call for preview.
 */
function extractKeyArgument(
  toolName: string,
  args: Record<string, unknown>,
): string {
  // Try common key argument names
  const keyNames = ["path", "file_path", "command", "query", "url", "name"];
  for (const key of keyNames) {
    if (key in args && typeof args[key] === "string") {
      return args[key] as string;
    }
  }
  // Fall back to first string argument
  for (const [_, val] of Object.entries(args)) {
    if (typeof val === "string" && val.length < 100) {
      return val;
    }
  }
  return "";
}

/**
 * Basic inline markdown rendering (bold, italic, code).
 * For terminal output via Ink's Text component.
 */
function renderMarkdownInline(text: string): string {
  // This is a simplified version; chalk handles the styling
  return text
    .replace(/\*\*(.+?)\*\*/g, (_, p1) => chalk.bold(p1))
    .replace(/\*(.+?)\*/g, (_, p1) => chalk.italic(p1))
    .replace(/`(.+?)`/g, (_, p1) => chalk.cyan(p1));
}
