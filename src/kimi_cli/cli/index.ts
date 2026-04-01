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
        verbose?: boolean;
        debug?: boolean;
      },
    ) => {
      const prompt =
        promptParts.length > 0 ? promptParts.join(" ") : undefined;

      try {
        // Create the KimiCLI app
        const app = await KimiCLI.create({
          workDir: options.workDir,
          configFile: options.config,
          modelName: options.model,
          thinking: options.thinking,
          yolo: options.yolo,
          sessionId: options.session,
          maxStepsPerTurn: options.maxStepsPerTurn,
        });

        if (options.print && prompt) {
          // Non-interactive print mode
          await app.runPrint(prompt);
        } else {
          // Interactive shell mode with React Ink
          const { waitUntilExit } = render(
            React.createElement(Shell, {
              modelName: app.soul.modelName,
              workDir: options.workDir ?? process.cwd(),
              sessionId: app.session.id,
              thinking: app.soul.thinking,
              onSubmit: (input: string) => {
                app.soul.run(input);
              },
              extraSlashCommands: app.soul.availableSlashCommands,
            }),
          );

          // Run initial prompt if provided
          if (prompt) {
            app.soul.run(prompt);
          }

          await waitUntilExit();
        }

        await app.shutdown();
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
