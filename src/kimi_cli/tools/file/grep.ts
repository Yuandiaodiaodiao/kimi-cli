/**
 * Grep tool — regex search using ripgrep.
 * Corresponds to Python tools/file/grep_local.py
 */

import { z } from "zod/v4";
import { CallableTool } from "../base.ts";
import type { ToolContext, ToolResult } from "../types.ts";
import { ToolError, ToolResultBuilder } from "../types.ts";

const RG_TIMEOUT = 20_000; // 20 seconds in ms
const RG_MAX_BUFFER = 20_000_000; // 20MB

const DESCRIPTION = `A powerful search tool based on ripgrep.

**Tips:**
- ALWAYS use Grep tool instead of running \`grep\` or \`rg\` command with Shell tool.
- Use the ripgrep pattern syntax, not grep syntax. E.g. you need to escape braces like \`\\{\` to search for \`{\`.`;

const ParamsSchema = z.object({
  pattern: z
    .string()
    .describe(
      "The regular expression pattern to search for in file contents",
    ),
  path: z
    .string()
    .default(".")
    .describe(
      "File or directory to search in. Defaults to current working directory.",
    ),
  glob: z
    .string()
    .nullish()
    .describe("Glob pattern to filter files (e.g. `*.js`, `*.{ts,tsx}`)."),
  output_mode: z
    .string()
    .default("files_with_matches")
    .describe(
      "`content`: Show matching lines; `files_with_matches`: Show file paths; `count_matches`: Show total number of matches.",
    ),
  "-B": z
    .number()
    .int()
    .nullish()
    .describe("Number of lines to show before each match."),
  "-A": z
    .number()
    .int()
    .nullish()
    .describe("Number of lines to show after each match."),
  "-C": z
    .number()
    .int()
    .nullish()
    .describe("Number of lines to show before and after each match."),
  "-n": z.boolean().default(true).describe("Show line numbers in output."),
  "-i": z.boolean().default(false).describe("Case insensitive search."),
  type: z
    .string()
    .nullish()
    .describe("File type to search (e.g. py, js, ts, go, java)."),
  head_limit: z
    .number()
    .int()
    .min(0)
    .default(250)
    .describe("Limit output to first N lines/entries. 0 for unlimited."),
  offset: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe("Skip first N lines/entries before applying head_limit."),
  multiline: z
    .boolean()
    .default(false)
    .describe("Enable multiline mode where `.` matches newlines."),
});

type Params = z.infer<typeof ParamsSchema>;

function buildRgArgs(params: Params, searchPath: string): string[] {
  const args: string[] = ["rg"];

  // Fixed args
  if (params.output_mode !== "content") {
    args.push("--max-columns", "500");
  }
  args.push("--hidden");
  for (const vcsDir of [".git", ".svn", ".hg", ".bzr", ".jj", ".sl"]) {
    args.push("--glob", `!${vcsDir}`);
  }

  // Search options
  if (params["-i"]) args.push("--ignore-case");
  if (params.multiline) args.push("--multiline", "--multiline-dotall");

  // Content display options
  if (params.output_mode === "content") {
    if (params["-B"] != null) args.push("--before-context", String(params["-B"]));
    if (params["-A"] != null) args.push("--after-context", String(params["-A"]));
    if (params["-C"] != null) args.push("--context", String(params["-C"]));
    if (params["-n"]) args.push("--line-number");
  }

  // File filtering
  if (params.glob) args.push("--glob", params.glob);
  if (params.type) args.push("--type", params.type);

  // Output mode
  if (params.output_mode === "files_with_matches") {
    args.push("--files-with-matches");
  } else if (params.output_mode === "count_matches") {
    args.push("--count-matches");
  }

  // Pattern and path
  args.push("--", params.pattern, searchPath);

  return args;
}

function stripPathPrefix(output: string, searchBase: string): string {
  const prefix = searchBase.replace(/[/\\]$/, "") + "/";
  return output
    .split("\n")
    .map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line))
    .join("\n");
}

export class Grep extends CallableTool<typeof ParamsSchema> {
  readonly name = "Grep";
  readonly description = DESCRIPTION;
  readonly schema = ParamsSchema;

  async execute(params: Params, ctx: ToolContext): Promise<ToolResult> {
    try {
      const builder = new ToolResultBuilder();
      let message = "";

      // Resolve the search path
      let searchPath = params.path;
      if (!searchPath.startsWith("/")) {
        searchPath = `${ctx.workingDir}/${searchPath}`;
      }
      searchPath = searchPath.replace(/^~/, process.env.HOME || "");

      const args = buildRgArgs(params, searchPath);

      // Execute ripgrep using Bun.spawn
      const proc = Bun.spawn(args, {
        stdout: "pipe",
        stderr: "pipe",
      });

      let timedOut = false;
      let output: string;
      let stderrStr: string;

      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("timeout")), RG_TIMEOUT);
        });

        const resultPromise = (async () => {
          const stdoutBytes = await new Response(proc.stdout).arrayBuffer();
          const stderrBytes = await new Response(proc.stderr).arrayBuffer();
          return {
            stdout: new TextDecoder().decode(stdoutBytes),
            stderr: new TextDecoder().decode(stderrBytes),
          };
        })();

        const result = await Promise.race([resultPromise, timeoutPromise]);
        output = result.stdout;
        stderrStr = result.stderr;
        await proc.exited;
      } catch (e) {
        if (e instanceof Error && e.message === "timeout") {
          proc.kill();
          timedOut = true;
          output = "";
          stderrStr = "";
        } else {
          throw e;
        }
      }

      // Buffer truncation
      let bufferTruncated = false;
      if (output.length > RG_MAX_BUFFER) {
        output = output.slice(0, RG_MAX_BUFFER);
        const lastNl = output.lastIndexOf("\n");
        output = lastNl >= 0 ? output.slice(0, lastNl) : "";
        bufferTruncated = true;
        message = "Output exceeded buffer limit. Some results omitted.";
      }

      // Timeout handling
      if (timedOut) {
        if (!output.trim()) {
          return ToolError(
            `Grep timed out after ${RG_TIMEOUT / 1000}s. Try a more specific path or pattern.`,
          );
        }
        const timeoutMsg = `Grep timed out after ${RG_TIMEOUT / 1000}s. Partial results returned.`;
        message = message ? `${message} ${timeoutMsg}` : timeoutMsg;
      }

      // rg exit codes: 0=matches found, 1=no matches, 2+=error
      if (!timedOut && proc.exitCode !== 0 && proc.exitCode !== 1) {
        return ToolError(`Failed to grep. Error: ${stderrStr}`);
      }

      // Post-processing: strip path prefix
      let searchBase = searchPath;
      try {
        const stat = await Bun.file(searchBase).exists();
        // If it's a file, use its parent directory
        if (stat) {
          const f = Bun.file(searchBase);
          // Check if it's a file by trying to get size
          try {
            // Use a simple heuristic: if path has extension, likely a file
            if (searchBase.includes(".") && !searchBase.endsWith("/")) {
              searchBase = searchBase.replace(/\/[^/]+$/, "");
            }
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
      output = stripPathPrefix(output, searchBase);

      // Split into lines
      let lines = output.split("\n");
      if (lines.length > 0 && lines[lines.length - 1] === "") {
        lines = lines.slice(0, -1);
      }

      // count_matches summary
      if (params.output_mode === "count_matches") {
        let totalMatches = 0;
        let totalFiles = 0;
        for (const line of lines) {
          const idx = line.lastIndexOf(":");
          if (idx > 0) {
            const count = parseInt(line.slice(idx + 1), 10);
            if (!isNaN(count)) {
              totalMatches += count;
              totalFiles += 1;
            }
          }
        }
        const countSummary = `Found ${totalMatches} total occurrences across ${totalFiles} files.`;
        message = message ? `${message} ${countSummary}` : countSummary;
      }

      // Offset + head_limit pagination
      if (params.offset > 0) {
        lines = lines.slice(params.offset);
      }

      const effectiveLimit = params.head_limit;
      if (effectiveLimit && lines.length > effectiveLimit) {
        const total = lines.length + params.offset;
        lines = lines.slice(0, effectiveLimit);
        output = lines.join("\n");
        const truncationMsg =
          `Results truncated to ${effectiveLimit} lines (total: ${total}). ` +
          `Use offset=${params.offset + effectiveLimit} to see more.`;
        message = message ? `${message} ${truncationMsg}` : truncationMsg;
      } else {
        output = lines.join("\n");
      }

      if (!output && !bufferTruncated) {
        return builder.ok("No matches found");
      }

      builder.write(output);
      return builder.ok(message);
    } catch (e) {
      return ToolError(`Failed to grep. Error: ${String(e)}`);
    }
  }
}
