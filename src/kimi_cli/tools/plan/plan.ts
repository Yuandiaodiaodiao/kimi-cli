/**
 * EnterPlanMode tool — lets the LLM request to enter plan mode.
 * Corresponds to Python tools/plan/enter.py
 */

import { z } from "zod/v4";
import { CallableTool } from "../base.ts";
import type { ToolContext, ToolResult } from "../types.ts";
import { ToolError, ToolOk } from "../types.ts";

const DESCRIPTION = `Use this tool proactively when you're about to start a non-trivial implementation task.
Getting user sign-off on your approach before writing code prevents wasted effort.

Use it when ANY of these conditions apply:
1. New Feature Implementation
2. Multiple Valid Approaches
3. Code Modifications
4. Architectural Decisions
5. Multi-File Changes
6. Unclear Requirements
7. User Preferences Matter

When NOT to use:
- Single-line or few-line fixes
- User gave very specific, detailed instructions
- Pure research/exploration tasks`;

const ParamsSchema = z.object({});

type Params = z.infer<typeof ParamsSchema>;

export class EnterPlanMode extends CallableTool<typeof ParamsSchema> {
  readonly name = "EnterPlanMode";
  readonly description = DESCRIPTION;
  readonly schema = ParamsSchema;

  async execute(_params: Params, _ctx: ToolContext): Promise<ToolResult> {
    // Stub: plan mode toggling requires soul/wire integration
    return ToolOk(
      "Plan mode activated.\n" +
        "Workflow: identify key questions → explore codebase → design approach → " +
        "write plan file → call ExitPlanMode.\n",
      "Plan mode on",
    );
  }
}
