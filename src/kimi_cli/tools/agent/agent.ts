/**
 * Agent tool — spawn subagent instances.
 * Corresponds to Python tools/agent/__init__.py
 * Stub: full implementation requires subagent runner integration.
 */

import { z } from "zod/v4";
import { CallableTool } from "../base.ts";
import type { ToolContext, ToolResult } from "../types.ts";
import { ToolError, ToolOk } from "../types.ts";

const DESCRIPTION = `Start a subagent instance to work on a focused task.

**Usage:**
- Always provide a short \`description\` (3-5 words).
- Use \`subagent_type\` to select a built-in agent type. If omitted, \`coder\` is used.
- Use \`model\` when you need to override the default model.
- Default to foreground execution. Use \`run_in_background=true\` only when needed.
- Be explicit about whether the subagent should write code or only do research.
- The subagent result is only visible to you. If the user should see it, summarize it yourself.`;

const ParamsSchema = z.object({
  description: z
    .string()
    .describe("A short (3-5 word) description of the task"),
  prompt: z.string().describe("The task for the agent to perform"),
  subagent_type: z
    .string()
    .default("coder")
    .describe("The built-in agent type to use. Defaults to `coder`."),
  model: z
    .string()
    .nullish()
    .describe("Optional model override."),
  resume: z
    .string()
    .nullish()
    .describe(
      "Optional agent ID to resume instead of creating a new instance.",
    ),
  run_in_background: z
    .boolean()
    .default(false)
    .describe("Whether to run the agent in the background."),
  timeout: z
    .number()
    .int()
    .min(30)
    .max(3600)
    .nullish()
    .describe("Timeout in seconds for the agent task."),
});

type Params = z.infer<typeof ParamsSchema>;

export class AgentTool extends CallableTool<typeof ParamsSchema> {
  readonly name = "Agent";
  readonly description = DESCRIPTION;
  readonly schema = ParamsSchema;

  async execute(params: Params, _ctx: ToolContext): Promise<ToolResult> {
    // Stub: full implementation requires subagent runner
    return ToolError(
      "Subagent system is not yet implemented in this version.",
    );
  }
}
