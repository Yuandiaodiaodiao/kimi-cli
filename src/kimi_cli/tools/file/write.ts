/**
 * WriteFile tool — write content to a file.
 * Corresponds to Python tools/file/write.py
 */

import { z } from "zod/v4";
import { CallableTool } from "../base.ts";
import type { ToolContext, ToolResult } from "../types.ts";
import { ToolError } from "../types.ts";

const DESCRIPTION = `Write content to a file.

**Tips:**
- When \`mode\` is not specified, it defaults to \`overwrite\`. Always write with caution.
- When the content to write is too long (e.g. > 100 lines), use this tool multiple times instead of a single call. Use \`overwrite\` mode at the first time, then use \`append\` mode after the first write.`;

const ParamsSchema = z.object({
  path: z.string().describe(
    "The path to the file to write. Absolute paths are required when writing files outside the working directory.",
  ),
  content: z.string().describe("The content to write to the file"),
  mode: z
    .enum(["overwrite", "append"])
    .default("overwrite")
    .describe("The mode to use: `overwrite` or `append`."),
});

type Params = z.infer<typeof ParamsSchema>;

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

export class WriteFile extends CallableTool<typeof ParamsSchema> {
  readonly name = "WriteFile";
  readonly description = DESCRIPTION;
  readonly schema = ParamsSchema;

  async execute(params: Params, ctx: ToolContext): Promise<ToolResult> {
    if (!params.path) {
      return ToolError("File path cannot be empty.");
    }

    try {
      const resolvedPath = resolvePath(params.path, ctx.workingDir);

      // Check if parent directory exists
      const parentDir = resolvedPath.replace(/\/[^/]+$/, "");
      const parentFile = Bun.file(parentDir);
      // Use a stat check via filesystem
      try {
        const stat = await Bun.file(parentDir + "/.").exists();
        // If parent doesn't exist, we try to check differently
      } catch {
        // ignore
      }

      const file = Bun.file(resolvedPath);
      const fileExisted = await file.exists();

      // Request approval for writes
      const decision = await ctx.approval(
        "WriteFile",
        fileExisted ? "edit" : "create",
        `Write file \`${resolvedPath}\``,
      );
      if (decision === "reject") {
        return ToolError(
          "The tool call is rejected by the user. Stop what you are doing and wait for the user to tell you how to proceed.",
        );
      }

      if (params.mode === "append" && fileExisted) {
        const existingContent = await file.text();
        await Bun.write(resolvedPath, existingContent + params.content);
      } else {
        await Bun.write(resolvedPath, params.content);
      }

      const newFile = Bun.file(resolvedPath);
      const fileSize = newFile.size;
      const action =
        params.mode === "overwrite" ? "overwritten" : "appended to";
      return {
        isError: false,
        output: "",
        message: `File successfully ${action}. Current size: ${fileSize} bytes.`,
      };
    } catch (e) {
      return ToolError(`Failed to write to ${params.path}. Error: ${e}`);
    }
  }
}
