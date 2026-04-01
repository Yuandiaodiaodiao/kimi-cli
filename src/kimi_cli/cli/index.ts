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

// ── Re-exports from Python cli/__init__.py ──────────────

export class Reload extends Error {
  sessionId: string | null;
  constructor(sessionId: string | null = null) {
    super("reload");
    this.name = "Reload";
    this.sessionId = sessionId;
  }
}

export class SwitchToWeb extends Error {
  sessionId: string | null;
  constructor(sessionId: string | null = null) {
    super("switch_to_web");
    this.name = "SwitchToWeb";
    this.sessionId = sessionId;
  }
}

export class SwitchToVis extends Error {
  sessionId: string | null;
  constructor(sessionId: string | null = null) {
    super("switch_to_vis");
    this.name = "SwitchToVis";
    this.sessionId = sessionId;
  }
}

export type UIMode = "shell" | "print" | "acp" | "wire";
export type InputFormat = "text" | "stream-json";
export type OutputFormat = "text" | "stream-json";

export const ExitCode = {
  SUCCESS: 0,
  FAILURE: 1,
  RETRYABLE: 75, // EX_TEMPFAIL from sysexits.h
} as const;

// ── Subcommands ──────────────────────────────────────────

import { loginCommand } from "./login.ts";
import { logoutCommand } from "./logout.ts";
import { infoCommand } from "./info.ts";
import { exportCommand } from "./export.ts";

// ── Version callback ─────────────────────────────────────

function getVersionString(): string {
  try {
    const { getVersion } = require("../constant.ts");
    return getVersion();
  } catch {
    return "0.0.0";
  }
}

// ── Program ──────────────────────────────────────────────

const program = new Command()
  .name("kimi")
  .description("Kimi, your next CLI agent.")
  .version(getVersionString(), "-V, --version")
  .addCommand(loginCommand)
  .addCommand(logoutCommand)
  .addCommand(infoCommand)
  .addCommand(exportCommand);

// Main chat command (default)
program
  .argument("[prompt...]", "Initial prompt to send")
  .option("-m, --model <model>", "Model to use")
  .option("--thinking", "Enable thinking mode")
  .option("--no-thinking", "Disable thinking mode")
  .option("--yolo", "Auto-approve all tool calls")
  .option("--print", "Print mode (non-interactive)")
  .option("-w, --work-dir <dir>", "Working directory")
  .option("--add-dir <dir...>", "Add additional directories to the workspace")
  .option("--max-steps-per-turn <n>", "Max steps per turn", parseInt)
  .option("--max-retries-per-step <n>", "Max retries per step", parseInt)
  .option("--config-file <path>", "Config TOML/JSON file to load")
  .option("--config <string>", "Config TOML/JSON string to load")
  .option("--session <id>", "Resume session by ID")
  .option("-C, --continue", "Continue the most recent session")
  .option("--input-format <format>", "Input format (text, stream-json). Print mode only.")
  .option("--output-format <format>", "Output format (text, stream-json). Print mode only.")
  .option("--quiet", "Alias for --print --output-format text --final-message-only")
  .option("--final-message-only", "Only print the final assistant message (print UI)")
  .option("-p, --prompt <text>", "User prompt to the agent")
  .option("--verbose", "Verbose output")
  .option("--debug", "Debug mode")
  .option("--wire", "Run as Wire server (experimental)")
  .option("--agent <name>", "Builtin agent specification to use")
  .option("--agent-file <path>", "Custom agent specification file")
  .option("--mcp-config-file <path...>", "MCP config file(s) to load")
  .option("--mcp-config <json...>", "MCP config JSON to load")
  .action(
    async (
      promptParts: string[],
      options: {
        model?: string;
        thinking?: boolean;
        yolo?: boolean;
        print?: boolean;
        workDir?: string;
        addDir?: string[];
        maxStepsPerTurn?: number;
        maxRetriesPerStep?: number;
        configFile?: string;
        config?: string;
        session?: string;
        continue?: boolean;
        inputFormat?: string;
        outputFormat?: string;
        quiet?: boolean;
        finalMessageOnly?: boolean;
        prompt?: string;
        verbose?: boolean;
        debug?: boolean;
        wire?: boolean;
        agent?: string;
        agentFile?: string;
        mcpConfigFile?: string[];
        mcpConfig?: string[];
      },
    ) => {
      // Handle --quiet alias
      if (options.quiet) {
        options.print = true;
        options.outputFormat = "text";
        options.finalMessageOnly = true;
      }

      // Resolve prompt from either positional args or --prompt option
      const prompt =
        promptParts.length > 0
          ? promptParts.join(" ")
          : options.prompt ?? undefined;

      // Determine config source: --config-file takes precedence over legacy --config as path
      const configFile = options.configFile ?? undefined;

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
            additionalDirs: options.addDir,
            configFile,
            modelName: options.model,
            thinking: options.thinking,
            yolo: options.yolo ?? true, // print mode implies yolo
            sessionId: options.session,
            continueSession: options.continue,
            maxStepsPerTurn: options.maxStepsPerTurn,
            maxRetriesPerStep: options.maxRetriesPerStep,
            callbacks,
          });

          if (prompt) await app.runPrint(prompt);
          await app.shutdown();
        } else if (options.wire) {
          // ── Wire mode ──
          const app = await KimiCLI.create({
            workDir: options.workDir,
            additionalDirs: options.addDir,
            configFile,
            modelName: options.model,
            thinking: options.thinking,
            yolo: options.yolo,
            sessionId: options.session,
            continueSession: options.continue,
            maxStepsPerTurn: options.maxStepsPerTurn,
            maxRetriesPerStep: options.maxRetriesPerStep,
            callbacks: {},
          });
          if (typeof app.runWireStdio === "function") {
            await app.runWireStdio();
          } else {
            console.error("Wire mode is not yet implemented.");
            process.exit(1);
          }
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
            onNotification: (title, body) => {
              pushEvent?.({ type: "notification", title, body });
            },
          };

          const app = await KimiCLI.create({
            workDir: options.workDir,
            additionalDirs: options.addDir,
            configFile,
            modelName: options.model,
            thinking: options.thinking,
            yolo: options.yolo,
            sessionId: options.session,
            continueSession: options.continue,
            maxStepsPerTurn: options.maxStepsPerTurn,
            maxRetriesPerStep: options.maxRetriesPerStep,
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
              onInterrupt: () => {
                app.soul.abort();
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
        process.exit(ExitCode.FAILURE);
      }
    },
  );

export async function cli(argv: string[]): Promise<number> {
  try {
    await program.parseAsync(argv);
    return ExitCode.SUCCESS;
  } catch (error) {
    console.error("Fatal error:", error);
    return ExitCode.FAILURE;
  }
}
