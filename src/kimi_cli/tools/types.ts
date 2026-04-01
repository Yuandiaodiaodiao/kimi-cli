/**
 * Tool-related types — corresponds to Python tools/utils.py and kosong.tooling types.
 */

import type { ApprovalDecision, JsonValue } from "../types.ts";

// ── ToolContext ──────────────────────────────────────────

/** Context injected into every tool execution. */
export interface ToolContext {
  /** Current working directory. */
  workingDir: string;
  /** AbortSignal for cooperative cancellation. */
  signal?: AbortSignal;
  /** Request user approval; returns the decision. */
  approval: (
    toolName: string,
    action: string,
    summary: string,
  ) => Promise<ApprovalDecision>;
  /** Emit a wire event (for UI communication). */
  wireEmit?: (event: unknown) => void;
}

// ── ToolResult ──────────────────────────────────────────

export interface ToolResult {
  isError: boolean;
  output: string;
  message?: string;
  display?: unknown[];
  extras?: Record<string, JsonValue>;
}

/** Create a successful ToolResult. */
export function ToolOk(
  output: string,
  message?: string,
  display?: unknown[],
  extras?: Record<string, JsonValue>,
): ToolResult {
  return { isError: false, output, message, display, extras };
}

/** Create an error ToolResult. */
export function ToolError(
  message: string,
  output = "",
  display?: unknown[],
): ToolResult {
  return { isError: true, output, message, display };
}

// ── ToolDefinition ──────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ── ToolResultBuilder ───────────────────────────────────

const DEFAULT_MAX_CHARS = 50_000;
const DEFAULT_MAX_LINE_LENGTH = 2000;

function truncateLine(line: string, maxLength: number, marker = "..."): string {
  if (line.length <= maxLength) return line;

  // Find trailing line breaks
  const m = line.match(/[\r\n]+$/);
  const linebreak = m ? m[0] : "";
  const end = marker + linebreak;
  const effectiveMax = Math.max(maxLength, end.length);
  return line.slice(0, effectiveMax - end.length) + end;
}

export class ToolResultBuilder {
  private maxChars: number;
  private maxLineLength: number | null;
  private marker = "[...truncated]";
  private buffer: string[] = [];
  private _nChars = 0;
  private _nLines = 0;
  private _truncationHappened = false;
  private _display: unknown[] = [];
  private _extras: Record<string, JsonValue> | null = null;

  constructor(
    maxChars = DEFAULT_MAX_CHARS,
    maxLineLength: number | null = DEFAULT_MAX_LINE_LENGTH,
  ) {
    this.maxChars = maxChars;
    this.maxLineLength = maxLineLength;
  }

  get isFull(): boolean {
    return this._nChars >= this.maxChars;
  }

  get nChars(): number {
    return this._nChars;
  }

  get nLines(): number {
    return this._nLines;
  }

  /** Write text to the output buffer. Returns number of characters written. */
  write(text: string): number {
    if (this.isFull) return 0;

    // Split keeping line endings
    const lines = text.split(/(?<=\n)/);
    if (lines.length === 0) return 0;

    let charsWritten = 0;

    for (const originalLine of lines) {
      if (this.isFull) break;
      if (!originalLine) continue;

      const remainingChars = this.maxChars - this._nChars;
      const limit =
        this.maxLineLength !== null
          ? Math.min(remainingChars, this.maxLineLength)
          : remainingChars;
      const line = truncateLine(originalLine, limit, this.marker);
      if (line !== originalLine) {
        this._truncationHappened = true;
      }

      this.buffer.push(line);
      charsWritten += line.length;
      this._nChars += line.length;
      if (line.endsWith("\n")) {
        this._nLines += 1;
      }
    }

    return charsWritten;
  }

  display(...blocks: unknown[]): void {
    this._display.push(...blocks);
  }

  extras(extra: Record<string, JsonValue>): void {
    if (this._extras === null) {
      this._extras = {};
    }
    Object.assign(this._extras, extra);
  }

  ok(message = ""): ToolResult {
    const output = this.buffer.join("");

    let finalMessage = message;
    if (finalMessage && !finalMessage.endsWith(".")) {
      finalMessage += ".";
    }
    const truncationMsg = "Output is truncated to fit in the message.";
    if (this._truncationHappened) {
      finalMessage = finalMessage
        ? `${finalMessage} ${truncationMsg}`
        : truncationMsg;
    }
    return {
      isError: false,
      output,
      message: finalMessage || undefined,
      display: this._display.length > 0 ? this._display : undefined,
      extras: this._extras ?? undefined,
    };
  }

  error(message: string): ToolResult {
    const output = this.buffer.join("");

    let finalMessage = message;
    if (this._truncationHappened) {
      const truncationMsg = "Output is truncated to fit in the message.";
      finalMessage = finalMessage
        ? `${finalMessage} ${truncationMsg}`
        : truncationMsg;
    }

    return {
      isError: true,
      output,
      message: finalMessage,
      display: this._display.length > 0 ? this._display : undefined,
      extras: this._extras ?? undefined,
    };
  }
}
