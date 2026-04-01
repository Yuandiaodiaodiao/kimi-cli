/**
 * Print mode — non-interactive output.
 * Corresponds to Python's ui/print/__init__.py + ui/print/visualize.py.
 *
 * Provides multiple printer strategies:
 * - TextPrinter: prints wire events as rich text
 * - JsonPrinter: outputs JSON messages with content merging
 * - FinalOnlyTextPrinter: only prints the final assistant text
 * - FinalOnlyJsonPrinter: only prints the final assistant message as JSON
 * - PrintMode: legacy event-based printer (wraps the above)
 */

import chalk from "chalk";
import type { WireUIEvent } from "../shell/events";

export type OutputFormat = "text" | "stream-json";

export interface PrintOptions {
  outputFormat: OutputFormat;
  finalOnly: boolean;
}

// ── Printer Protocol ────────────────────────────────────

export interface Printer {
  feed(event: WireUIEvent): void;
  flush(): void;
}

// ── Content Part Merging ────────────────────────────────

interface ContentBuffer {
  type: "text" | "think";
  text: string;
}

function mergeContent(buffer: ContentBuffer[], part: ContentBuffer): void {
  const last = buffer[buffer.length - 1];
  if (last && last.type === part.type) {
    last.text += part.text;
  } else {
    buffer.push({ ...part });
  }
}

// ── TextPrinter ─────────────────────────────────────────

export class TextPrinter implements Printer {
  feed(event: WireUIEvent): void {
    switch (event.type) {
      case "text_delta":
        process.stdout.write(event.text);
        break;
      case "think_delta":
        process.stdout.write(chalk.italic.grey(event.text));
        break;
      case "tool_call":
        process.stderr.write(
          chalk.dim(`[tool] ${event.name}(${truncateStr(event.arguments, 60)})\n`),
        );
        break;
      case "tool_result":
        if (event.result.return_value.isError) {
          process.stderr.write(
            chalk.red(`[error] ${truncateStr(event.result.return_value.output, 100)}\n`),
          );
        }
        break;
      case "step_begin":
        break;
      case "step_interrupted":
        process.stderr.write(chalk.yellow("[interrupted]\n"));
        break;
      case "error":
        process.stderr.write(chalk.red(`Error: ${event.message}\n`));
        break;
      case "notification":
        process.stderr.write(chalk.dim(`[${event.title}] ${event.body}\n`));
        break;
      case "turn_end":
        process.stdout.write("\n");
        break;
    }
  }

  flush(): void {}
}

// ── JsonPrinter ─────────────────────────────────────────

export class JsonPrinter implements Printer {
  private contentBuffer: ContentBuffer[] = [];
  private toolCalls: Array<{ id: string; name: string; arguments: string }> = [];
  private pendingNotifications: Array<{ title: string; body: string }> = [];

  feed(event: WireUIEvent): void {
    switch (event.type) {
      case "step_begin":
      case "step_interrupted":
        this.flush();
        break;
      case "notification":
        if (this.contentBuffer.length > 0 || this.toolCalls.length > 0) {
          this.pendingNotifications.push({ title: event.title, body: event.body });
        } else {
          this.flushAssistantMessage();
          this.flushNotifications();
          this.emitJson({ type: "notification", title: event.title, body: event.body });
        }
        break;
      case "text_delta":
        mergeContent(this.contentBuffer, { type: "text", text: event.text });
        break;
      case "think_delta":
        mergeContent(this.contentBuffer, { type: "think", text: event.text });
        break;
      case "tool_call":
        this.toolCalls.push({ id: event.id, name: event.name, arguments: event.arguments });
        break;
      case "tool_result":
        this.flushAssistantMessage();
        this.flushNotifications();
        this.emitJson({
          role: "tool",
          tool_call_id: event.toolCallId,
          content: event.result.return_value.output,
          is_error: event.result.return_value.isError,
        });
        break;
      case "error":
        process.stderr.write(chalk.red(`Error: ${event.message}\n`));
        break;
    }
  }

  private flushAssistantMessage(): void {
    if (this.contentBuffer.length === 0 && this.toolCalls.length === 0) return;
    const content = this.contentBuffer.map((part) => ({
      type: part.type,
      [part.type === "think" ? "think" : "text"]: part.text,
    }));
    const msg: Record<string, unknown> = { role: "assistant", content };
    if (this.toolCalls.length > 0) {
      msg.tool_calls = this.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }
    this.emitJson(msg);
    this.contentBuffer = [];
    this.toolCalls = [];
  }

  private flushNotifications(): void {
    for (const n of this.pendingNotifications) {
      this.emitJson({ type: "notification", ...n });
    }
    this.pendingNotifications = [];
  }

  private emitJson(data: Record<string, unknown>): void {
    process.stdout.write(JSON.stringify(data) + "\n");
  }

  flush(): void {
    this.flushAssistantMessage();
    this.flushNotifications();
  }
}

// ── FinalOnlyTextPrinter ────────────────────────────────

export class FinalOnlyTextPrinter implements Printer {
  private contentBuffer: ContentBuffer[] = [];

  feed(event: WireUIEvent): void {
    switch (event.type) {
      case "step_begin":
      case "step_interrupted":
        this.contentBuffer = [];
        break;
      case "text_delta":
        mergeContent(this.contentBuffer, { type: "text", text: event.text });
        break;
      case "error":
        process.stderr.write(chalk.red(`Error: ${event.message}\n`));
        break;
    }
  }

  flush(): void {
    const text = this.contentBuffer
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");
    if (text) {
      process.stdout.write(text + "\n");
    }
    this.contentBuffer = [];
  }
}

// ── FinalOnlyJsonPrinter ────────────────────────────────

export class FinalOnlyJsonPrinter implements Printer {
  private contentBuffer: ContentBuffer[] = [];

  feed(event: WireUIEvent): void {
    switch (event.type) {
      case "step_begin":
      case "step_interrupted":
        this.contentBuffer = [];
        break;
      case "text_delta":
        mergeContent(this.contentBuffer, { type: "text", text: event.text });
        break;
      case "error":
        process.stderr.write(chalk.red(`Error: ${event.message}\n`));
        break;
    }
  }

  flush(): void {
    const text = this.contentBuffer
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");
    if (text) {
      process.stdout.write(
        JSON.stringify({
          role: "assistant",
          content: [{ type: "text", text }],
        }) + "\n",
      );
    }
    this.contentBuffer = [];
  }
}

// ── Factory ─────────────────────────────────────────────

export function createPrinter(options: PrintOptions): Printer {
  if (options.finalOnly) {
    return options.outputFormat === "text"
      ? new FinalOnlyTextPrinter()
      : new FinalOnlyJsonPrinter();
  }
  return options.outputFormat === "text"
    ? new TextPrinter()
    : new JsonPrinter();
}

// ── Legacy PrintMode (wraps Printer) ────────────────────

export class PrintMode {
  private printer: Printer;

  constructor(options: PrintOptions) {
    this.printer = createPrinter(options);
  }

  handleEvent(event: WireUIEvent): void {
    this.printer.feed(event);
  }

  flush(): void {
    this.printer.flush();
  }
}

/**
 * Classify error for exit codes.
 */
export function classifyError(
  error: unknown,
): "retryable" | "permanent" | "unknown" {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("429") ||
      msg.includes("500") ||
      msg.includes("502") ||
      msg.includes("503") ||
      msg.includes("504") ||
      msg.includes("timeout") ||
      msg.includes("connection")
    ) {
      return "retryable";
    }
    return "permanent";
  }
  return "unknown";
}

function truncateStr(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}
