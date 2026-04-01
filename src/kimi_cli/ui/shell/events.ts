/**
 * Wire event types for UI consumption.
 * Simplified interface that UI components use to render messages.
 */

import type {
  StatusUpdate,
  ApprovalRequest,
  ToolResult,
  DisplayBlock,
} from "../../wire/types";

// ── UI Message Types ──────────────────────────────────────

export type UIMessageRole = "user" | "assistant" | "system" | "tool";

export interface TextSegment {
  type: "text";
  text: string;
}

export interface ThinkSegment {
  type: "think";
  text: string;
}

export interface ToolCallSegment {
  type: "tool_call";
  id: string;
  name: string;
  arguments: string;
  result?: ToolResult;
  collapsed: boolean;
}

export type MessageSegment = TextSegment | ThinkSegment | ToolCallSegment;

export interface UIMessage {
  id: string;
  role: UIMessageRole;
  segments: MessageSegment[];
  timestamp: number;
}

// ── Wire Events (simplified for UI) ───────────────────────

export type WireUIEvent =
  | { type: "turn_begin"; userInput: string }
  | { type: "turn_end" }
  | { type: "step_begin"; n: number }
  | { type: "step_interrupted" }
  | { type: "text_delta"; text: string }
  | { type: "think_delta"; text: string }
  | { type: "tool_call"; id: string; name: string; arguments: string }
  | { type: "tool_result"; toolCallId: string; result: ToolResult }
  | { type: "approval_request"; request: ApprovalRequest }
  | { type: "approval_response"; requestId: string; response: string }
  | { type: "status_update"; status: StatusUpdate }
  | { type: "compaction_begin" }
  | { type: "compaction_end" }
  | { type: "notification"; title: string; body: string }
  | { type: "error"; message: string };
