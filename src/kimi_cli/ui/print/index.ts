/**
 * Print mode — non-interactive output.
 * Corresponds to Python's ui/print/__init__.py.
 *
 * Simple message printing to stdout without TUI.
 */

import chalk from "chalk";
import type { WireUIEvent } from "../shell/events";

export type OutputFormat = "text" | "stream-json";

export interface PrintOptions {
  outputFormat: OutputFormat;
  finalOnly: boolean;
}

/**
 * Non-interactive print mode.
 * Consumes wire events and prints to stdout.
 */
export class PrintMode {
  private outputFormat: OutputFormat;
  private finalOnly: boolean;
  private buffer: string = "";

  constructor(options: PrintOptions) {
    this.outputFormat = options.outputFormat;
    this.finalOnly = options.finalOnly;
  }

  /**
   * Process a wire event and print output if needed.
   */
  handleEvent(event: WireUIEvent): void {
    switch (event.type) {
      case "text_delta": {
        if (this.finalOnly) {
          this.buffer += event.text;
        } else {
          if (this.outputFormat === "text") {
            process.stdout.write(event.text);
          } else {
            this.writeJson({ type: "text_delta", text: event.text });
          }
        }
        break;
      }

      case "turn_end": {
        if (this.finalOnly && this.buffer) {
          if (this.outputFormat === "text") {
            process.stdout.write(this.buffer);
            process.stdout.write("\n");
          } else {
            this.writeJson({ type: "final_text", text: this.buffer });
          }
          this.buffer = "";
        } else if (!this.finalOnly && this.outputFormat === "text") {
          process.stdout.write("\n");
        }
        break;
      }

      case "tool_call": {
        if (!this.finalOnly) {
          if (this.outputFormat === "stream-json") {
            this.writeJson({
              type: "tool_call",
              name: event.name,
              arguments: event.arguments,
            });
          }
          // In text mode, tool calls are not printed
        }
        break;
      }

      case "tool_result": {
        if (!this.finalOnly) {
          if (this.outputFormat === "stream-json") {
            this.writeJson({
              type: "tool_result",
              tool_call_id: event.toolCallId,
              result: event.result,
            });
          }
        }
        break;
      }

      case "error": {
        process.stderr.write(chalk.red(`Error: ${event.message}\n`));
        break;
      }

      case "notification": {
        if (!this.finalOnly) {
          if (this.outputFormat === "text") {
            process.stderr.write(
              chalk.dim(`[${event.title}] ${event.body}\n`),
            );
          } else {
            this.writeJson({
              type: "notification",
              title: event.title,
              body: event.body,
            });
          }
        }
        break;
      }

      // Other events are silently ignored in print mode
    }
  }

  private writeJson(data: Record<string, unknown>): void {
    process.stdout.write(JSON.stringify(data) + "\n");
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
    // Retryable HTTP status codes
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
