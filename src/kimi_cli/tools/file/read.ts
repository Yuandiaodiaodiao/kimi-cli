/**
 * ReadFile tool — read text content from a file.
 * Corresponds to Python tools/file/read.py
 */

import { z } from "zod/v4";
import { CallableTool } from "../base.ts";
import type { ToolContext, ToolResult } from "../types.ts";
import { ToolError, ToolOk } from "../types.ts";

const MAX_LINES = 1000;
const MAX_LINE_LENGTH = 2000;
const MAX_BYTES = 100 * 1024; // 100KB

const DESCRIPTION = `Read text content from a file.

**Tips:**
- A \`<system>\` tag will be given before the read file content.
- This tool can only read text files.
- Content will be returned with a line number before each line like \`cat -n\` format.
- Use \`line_offset\` and \`n_lines\` parameters when you only need to read a part of the file.
- The maximum number of lines that can be read at once is ${MAX_LINES}.
- Any lines longer than ${MAX_LINE_LENGTH} characters will be truncated, ending with "...".`;

const ParamsSchema = z.object({
  path: z.string().describe(
    "The path to the file to read. Absolute paths are required when reading files outside the working directory.",
  ),
  line_offset: z
    .number()
    .int()
    .min(1)
    .default(1)
    .describe("The line number to start reading from. Defaults to 1."),
  n_lines: z
    .number()
    .int()
    .min(1)
    .default(MAX_LINES)
    .describe(
      `The number of lines to read. Defaults to ${MAX_LINES} (max allowed).`,
    ),
});

type Params = z.infer<typeof ParamsSchema>;

function truncateLine(line: string, maxLength: number): string {
  if (line.length <= maxLength) return line;
  return line.slice(0, maxLength - 3) + "...";
}

function resolvePath(filePath: string, workingDir: string): string {
  if (filePath.startsWith("/") || filePath.startsWith("~")) {
    if (filePath.startsWith("~")) {
      const home = process.env.HOME || process.env.USERPROFILE || "";
      return filePath.replace(/^~/, home);
    }
    return filePath;
  }
  return `${workingDir}/${filePath}`;
}

export class ReadFile extends CallableTool<typeof ParamsSchema> {
  readonly name = "ReadFile";
  readonly description = DESCRIPTION;
  readonly schema = ParamsSchema;

  async execute(params: Params, ctx: ToolContext): Promise<ToolResult> {
    if (!params.path) {
      return ToolError("File path cannot be empty.");
    }

    try {
      const resolvedPath = resolvePath(params.path, ctx.workingDir);
      const file = Bun.file(resolvedPath);

      if (!(await file.exists())) {
        return ToolError(`\`${params.path}\` does not exist.`);
      }

      // Read file content
      const text = await file.text();
      const allLines = text.split("\n");

      // If last line is empty (file ends with newline), keep as-is
      const lineOffset = params.line_offset;
      const nLines = params.n_lines;

      const lines: string[] = [];
      const truncatedLineNumbers: number[] = [];
      let nBytes = 0;
      let maxLinesReached = false;
      let maxBytesReached = false;

      for (
        let i = lineOffset - 1;
        i < allLines.length && lines.length < nLines;
        i++
      ) {
        const lineNo = i + 1;
        let line = allLines[i] ?? "";
        // Add newline back except for last line if original doesn't end with \n
        if (i < allLines.length - 1 || text.endsWith("\n")) {
          line += "\n";
        }

        const truncated = truncateLine(line, MAX_LINE_LENGTH);
        if (truncated !== line) {
          truncatedLineNumbers.push(lineNo);
        }
        lines.push(truncated);
        nBytes += new TextEncoder().encode(truncated).length;

        if (lines.length >= MAX_LINES) {
          maxLinesReached = true;
          break;
        }
        if (nBytes >= MAX_BYTES) {
          maxBytesReached = true;
          break;
        }
      }

      // Format output with line numbers (cat -n format)
      const linesWithNo = lines.map((line: string, idx: number) => {
        const lineNum = lineOffset + idx;
        return `${String(lineNum).padStart(6)}\t${line}`;
      });

      let message =
        lines.length > 0
          ? `${lines.length} lines read from file starting from line ${lineOffset}.`
          : "No lines read from file.";

      if (maxLinesReached) {
        message += ` Max ${MAX_LINES} lines reached.`;
      } else if (maxBytesReached) {
        message += ` Max ${MAX_BYTES} bytes reached.`;
      } else if (lines.length < nLines) {
        message += " End of file reached.";
      }
      if (truncatedLineNumbers.length > 0) {
        message += ` Lines [${truncatedLineNumbers.join(", ")}] were truncated.`;
      }

      return ToolOk(linesWithNo.join(""), message);
    } catch (e) {
      return ToolError(`Failed to read ${params.path}. Error: ${e}`);
    }
  }
}
