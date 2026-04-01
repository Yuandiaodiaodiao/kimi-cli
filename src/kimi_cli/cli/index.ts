/**
 * CLI router — corresponds to Python cli/__init__.py
 * Uses Commander.js (replaces Typer)
 */

import { Command } from "commander";
import React from "react";
import { render } from "ink";
import { KimiCLI } from "../app.ts";
import type { SoulCallbacks } from "../soul/kimisoul.ts";
import { Shell } from "../ui/shell/Shell.tsx";
import type { WireUIEvent } from "../ui/shell/events.ts";
import chalk from "chalk";

const program = new Command()
  .name("kimi")
  .description("Kimi Code CLI - AI Agent for Terminal")
  .version("2.0.0");

// Main chat command (default)
program
  .argument("[prompt...]", "Initial prompt to send")
  .option("-m, --model <model>", "Model to use")
  .option("--thinking", "Enable thinking mode")
  .option("--yolo", "Auto-approve all tool calls")
  .option("--print", "Print mode (non-interactive)")
  .option("-w, --work-dir <dir>", "Working directory")
  .option("--max-steps-per-turn <n>", "Max steps per turn", parseInt)
  .option("--config <path>", "Config file path")
  .option("--session <id>", "Resume session by ID")
  .option("-C, --continue", "Continue the most recent session")
  .option("--verbose", "Verbose output")
  .option("--debug", "Debug mode")
  .action(
    async (
      promptParts: string[],
      options: {
        model?: string;
        thinking?: boolean;
        yolo?: boolean;
        print?: boolean;
        workDir?: string;
        maxStepsPerTurn?: number;
        config?: string;
        session?: string;
        continue?: boolean;
        verbose?: boolean;
        debug?: boolean;
      },
    ) => {
      const prompt =
        promptParts.length > 0 ? promptParts.join(" ") : undefined;

      try {
        if (options.print) {
          // ── Print mode: callbacks write directly to stdout/stderr ──
          const callbacks: SoulCallbacks = {
            onTextDelta: (text) => process.stdout.write(text),
            onThinkDelta: (text) => process.stderr.write(chalk.dim(text)),
            onError: (err) =>
              process.stderr.write(chalk.red(`[ERROR] ${err.message}\n`)),
            onTurnEnd: () => process.stdout.write("\n"),
            onStatusUpdate: (status) => {
              if (options.verbose && status.tokenUsage) {
                process.stderr.write(
                  chalk.dim(
                    `[tokens] in=${status.tokenUsage.inputTokens} out=${status.tokenUsage.outputTokens}\n`,
                  ),
                );
              }
            },
          };

          const app = await KimiCLI.create({
            workDir: options.workDir,
            configFile: options.config,
            modelName: options.model,
            thinking: options.thinking,
            yolo: options.yolo,
            sessionId: options.session,
            continueSession: options.continue,
            maxStepsPerTurn: options.maxStepsPerTurn,
            callbacks,
          });

          if (prompt) await app.runPrint(prompt);
          await app.shutdown();
        } else {
          // ── Interactive mode: callbacks push wire events to React Ink UI ──

          // pushEvent will be set by Shell's onWireReady callback
          let pushEvent: ((event: WireUIEvent) => void) | null = null;

          const callbacks: SoulCallbacks = {
            onTurnBegin: (userInput) => {
              const text =
                typeof userInput === "string"
                  ? userInput
                  : "[complex input]";
              pushEvent?.({ type: "turn_begin", userInput: text });
            },
            onTurnEnd: () => {
              pushEvent?.({ type: "turn_end" });
            },
            onStepBegin: (n) => {
              pushEvent?.({ type: "step_begin", n });
            },
            onTextDelta: (text) => {
              pushEvent?.({ type: "text_delta", text });
            },
            onThinkDelta: (text) => {
              pushEvent?.({ type: "think_delta", text });
            },
            onToolCall: (tc) => {
              pushEvent?.({
                type: "tool_call",
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
              });
            },
            onToolResult: (toolCallId, result) => {
              pushEvent?.({
                type: "tool_result",
                toolCallId,
                result: {
                  tool_call_id: toolCallId,
                  return_value: {
                    isError: result.isError,
                    output: result.output,
                    message: result.message,
                  },
                  display: [],
                },
              });
            },
            onStatusUpdate: (status) => {
              pushEvent?.({
                type: "status_update",
                status: {
                  context_usage: status.contextUsage ?? null,
                  context_tokens: status.contextTokens ?? null,
                  max_context_tokens: status.maxContextTokens ?? null,
                  token_usage: status.tokenUsage ?? null,
                  message_id: null,
                  plan_mode: status.planMode ?? null,
                  mcp_status: null,
                },
              });
            },
            onCompactionBegin: () => {
              pushEvent?.({ type: "compaction_begin" });
            },
            onCompactionEnd: () => {
              pushEvent?.({ type: "compaction_end" });
            },
            onError: (err) => {
              pushEvent?.({ type: "error", message: err.message });
            },
          };

          const app = await KimiCLI.create({
            workDir: options.workDir,
            configFile: options.config,
            modelName: options.model,
            thinking: options.thinking,
            yolo: options.yolo,
            sessionId: options.session,
            maxStepsPerTurn: options.maxStepsPerTurn,
            callbacks,
          });

          const { waitUntilExit } = render(
            React.createElement(Shell, {
              modelName: app.soul.modelName,
              workDir: options.workDir ?? process.cwd(),
              sessionId: app.session.id,
              thinking: app.soul.thinking,
              onSubmit: (input: string) => {
                app.soul.run(input);
              },
              onWireReady: (push) => {
                pushEvent = push;
              },
              extraSlashCommands: app.soul.availableSlashCommands,
            }),
          );

          // Run initial prompt if provided
          if (prompt) {
            app.soul.run(prompt);
          }

          await waitUntilExit();
          await app.shutdown();
        }
      } catch (err) {
        console.error("Error:", err);
        process.exit(1);
      }
    },
  );

export async function cli(argv: string[]): Promise<number> {
  try {
    await program.parseAsync(argv);
    return 0;
  } catch (error) {
    console.error("Fatal error:", error);
    return 1;
  }
}
