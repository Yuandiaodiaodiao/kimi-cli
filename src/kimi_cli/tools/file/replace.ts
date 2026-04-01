/**
 * StrReplaceFile tool — edit/replace strings in a file.
 * Corresponds to Python tools/file/replace.py
 */

import { z } from "zod/v4";
import { CallableTool } from "../base.ts";
import type { ToolContext, ToolResult } from "../types.ts";
import { ToolError } from "../types.ts";

const DESCRIPTION = `Replace specific strings within a specified file.

**Tips:**
- Only use this tool on text files.
- Multi-line strings are supported.
- Can specify a single edit or a list of edits in one call.
- You should prefer this tool over WriteFile tool and Shell \`sed\` command.`;

const EditSchema = z.object({
  old: z.string().describe("The old string to replace. Can be multi-line."),
  new: z.string().describe("The new string to replace with. Can be multi-line."),
  replace_all: z
    .boolean()
    .default(false)
    .describe("Whether to replace all occurrences."),
});

const ParamsSchema = z.object({
  path: z.string().describe(
    "The path to the file to edit. Absolute paths are required when editing files outside the working directory.",
  ),
  edit: z
    .union([EditSchema, z.array(EditSchema)])
    .describe("The edit(s) to apply to the file."),
});

type Params = z.infer<typeof ParamsSchema>;
type Edit = z.infer<typeof EditSchema>;

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

function applyEdit(content: string, edit: Edit): string {
  if (edit.replace_all) {
    return content.split(edit.old).join(edit.new);
  }
  const idx = content.indexOf(edit.old);
  if (idx === -1) return content;
  return content.slice(0, idx) + edit.new + content.slice(idx + edit.old.length);
}

export class StrReplaceFile extends CallableTool<typeof ParamsSchema> {
  readonly name = "StrReplaceFile";
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

      // Check if it's actually a file
      const { stat: fsStat } = await import("node:fs/promises");
      try {
        const info = await fsStat(resolvedPath);
        if (!info.isFile()) {
          return ToolError(`\`${params.path}\` is not a file.`);
        }
      } catch {
        // stat failed — continue
      }

      // Read the file content
      const originalContent = await file.text();
      let content = originalContent;

      const edits: Edit[] = Array.isArray(params.edit)
        ? params.edit
        : [params.edit];

      // Apply all edits
      for (const edit of edits) {
        content = applyEdit(content, edit);
      }

      // Check if any changes were made
      if (content === originalContent) {
        return ToolError(
          "No replacements were made. The old string was not found in the file.",
        );
      }

      // Request approval — include diff preview
      const diffLines: string[] = [];
      for (const edit of edits) {
        if (edit.old.length < 200 && edit.new.length < 200) {
          diffLines.push(`-${edit.old.split("\n").join("\n-")}`);
          diffLines.push(`+${edit.new.split("\n").join("\n+")}`);
        }
      }
      const diffPreview = diffLines.length > 0 ? `\n${diffLines.join("\n")}` : "";

      const decision = await ctx.approval(
        "StrReplaceFile",
        "edit",
        `Edit file \`${resolvedPath}\` (${edits.length} edit(s))${diffPreview}`,
      );
      if (decision === "reject") {
        return ToolError(
          "The tool call is rejected by the user. Stop what you are doing and wait for the user to tell you how to proceed.",
        );
      }

      // Write the modified content back
      await Bun.write(resolvedPath, content);

      // Count changes for success message
      let totalReplacements = 0;
      for (const edit of edits) {
        if (edit.replace_all) {
          totalReplacements += originalContent.split(edit.old).length - 1;
        } else {
          totalReplacements += originalContent.includes(edit.old) ? 1 : 0;
        }
      }

      return {
        isError: false,
        output: "",
        message: `File successfully edited. Applied ${edits.length} edit(s) with ${totalReplacements} total replacement(s).`,
      };
    } catch (e) {
      return ToolError(`Failed to edit. Error: ${e}`);
    }
  }
}
