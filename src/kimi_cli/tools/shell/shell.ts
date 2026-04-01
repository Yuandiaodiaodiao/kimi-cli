/**
 * Shell tool — execute shell commands.
 * Corresponds to Python tools/shell/__init__.py
 */

import { z } from "zod/v4";
import { CallableTool } from "../base.ts";
import type { ToolContext, ToolResult } from "../types.ts";
import { ToolError, ToolResultBuilder } from "../types.ts";

const MAX_FOREGROUND_TIMEOUT = 5 * 60; // 5 minutes
const MAX_BACKGROUND_TIMEOUT = 24 * 60 * 60; // 24 hours

const DESCRIPTION = `Execute a shell command. Use this tool to explore the filesystem, edit files, run scripts, get system information, etc.

**Output:**
The stdout and stderr will be combined and returned as a string. The output may be truncated if it is too long.

**Guidelines for safety and security:**
- Each shell tool call will be executed in a fresh shell environment.
- Avoid using \`..\ to access files outside of the working directory.
- Never run commands that require superuser privileges unless explicitly instructed.

**Guidelines for efficiency:**
- For multiple related commands, use \`&&\` to chain them in a single call.
- Prefer \`run_in_background=true\` for long-running builds, tests, or servers.`;

const ParamsSchema = z
  .object({
    command: z.string().describe("The command to execute."),
    timeout: z
      .number()
      .int()
      .min(1)
      .max(MAX_BACKGROUND_TIMEOUT)
      .default(60)
      .describe("The timeout in seconds for the command to execute."),
    run_in_background: z
      .boolean()
      .default(false)
      .describe("Whether to run the command as a background task."),
    description: z
      .string()
      .default("")
      .describe(
        "A short description for the background task. Required when run_in_background=true.",
      ),
  })
  .refine(
    (data) => !data.run_in_background || data.description.trim().length > 0,
    {
      message: "description is required when run_in_background is true",
      path: ["description"],
    },
  )
  .refine(
    (data) =>
      data.run_in_background || data.timeout <= MAX_FOREGROUND_TIMEOUT,
    {
      message: `timeout must be <= ${MAX_FOREGROUND_TIMEOUT}s for foreground commands; use run_in_background=true for longer timeouts`,
      path: ["timeout"],
    },
  );

type Params = z.infer<typeof ParamsSchema>;

export class Shell extends CallableTool<typeof ParamsSchema> {
  readonly name = "Shell";
  readonly description = DESCRIPTION;
  readonly schema = ParamsSchema;

  async execute(params: Params, ctx: ToolContext): Promise<ToolResult> {
    const builder = new ToolResultBuilder();

    if (!params.command) {
      return builder.error("Command cannot be empty.");
    }

    if (params.run_in_background) {
      // Background mode - stub for now
      return builder.error(
        "Background tasks are not yet implemented in this version.",
      );
    }

    // Request approval
    const decision = await ctx.approval(
      "Shell",
      "run command",
      `Run command \`${params.command}\``,
    );
    if (decision === "reject") {
      return ToolError(
        "The tool call is rejected by the user. Stop what you are doing and wait for the user to tell you how to proceed.",
      );
    }

    try {
      const shellPath = process.env.SHELL || "/bin/bash";

      const proc = Bun.spawn([shellPath, "-c", params.command], {
        stdout: "pipe",
        stderr: "pipe",
        cwd: ctx.workingDir,
        env: {
          ...process.env,
          // Disable interactive features
          GIT_TERMINAL_PROMPT: "0",
          TERM: "dumb",
        },
      });

      // Close stdin so interactive prompts get EOF
      if (proc.stdin && typeof (proc.stdin as any).end === "function") {
        (proc.stdin as any).end();
      }

      let timedOut = false;

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error("timeout")),
            params.timeout * 1000,
          );
        });

        const resultPromise = (async () => {
          const stdoutBytes = await new Response(proc.stdout).arrayBuffer();
          const stderrBytes = await new Response(proc.stderr).arrayBuffer();
          return {
            stdout: new TextDecoder("utf-8", { fatal: false }).decode(
              stdoutBytes,
            ),
            stderr: new TextDecoder("utf-8", { fatal: false }).decode(
              stderrBytes,
            ),
          };
        })();

        const result = await Promise.race([resultPromise, timeoutPromise]);

        // Write stdout and stderr
        if (result.stdout) builder.write(result.stdout);
        if (result.stderr) builder.write(result.stderr);

        await proc.exited;
      } catch (e) {
        if (e instanceof Error && e.message === "timeout") {
          proc.kill();
          timedOut = true;
        } else {
          throw e;
        }
      }

      if (timedOut) {
        return builder.error(
          `Command killed by timeout (${params.timeout}s)`,
        );
      }

      const exitCode = proc.exitCode;
      if (exitCode === 0) {
        return builder.ok("Command executed successfully.");
      }
      return builder.error(
        `Command failed with exit code: ${exitCode}.`,
      );
    } catch (e) {
      return builder.error(`Failed to execute command. Error: ${e}`);
    }
  }
}
