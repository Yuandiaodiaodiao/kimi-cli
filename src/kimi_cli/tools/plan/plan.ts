/**
 * Plan mode tools — lets the LLM enter/exit plan mode.
 * Corresponds to Python tools/plan/enter.py and tools/plan/exit.py
 */

import { z } from "zod/v4";
import { CallableTool } from "../base.ts";
import type { ToolContext, ToolResult } from "../types.ts";
import { ToolOk } from "../types.ts";

// ── EnterPlanMode ──────────────────────────────────

const ENTER_DESCRIPTION = `Use this tool proactively when you're about to start a non-trivial implementation task.
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

const EnterParamsSchema = z.object({});

export class EnterPlanMode extends CallableTool<typeof EnterParamsSchema> {
  readonly name = "EnterPlanMode";
  readonly description = ENTER_DESCRIPTION;
  readonly schema = EnterParamsSchema;

  async execute(_params: unknown, ctx: ToolContext): Promise<ToolResult> {
    ctx.setPlanMode?.(true);
    return ToolOk(
      "Entered plan mode. You should now focus on exploring the codebase and designing an implementation approach.\n" +
        "In plan mode, you should:\n" +
        "1. Thoroughly explore the codebase to understand existing patterns\n" +
        "2. Consider multiple approaches and their trade-offs\n" +
        "3. Design a concrete implementation strategy\n" +
        "4. When ready, use ExitPlanMode to present your plan for approval\n" +
        "\n" +
        "Remember: DO NOT write or edit any files yet. This is a read-only exploration and planning phase.",
      "Plan mode activated.",
    );
  }
}

// ── ExitPlanMode ──────────────────────────────────

const EXIT_DESCRIPTION = `Use this tool when you are in plan mode and have finished writing your plan.
This signals that you're done planning and ready for the user to review and approve.

IMPORTANT: Only use this tool when the task requires planning the implementation of a task that requires writing code.`;

const ExitParamsSchema = z.object({});

export class ExitPlanMode extends CallableTool<typeof ExitParamsSchema> {
  readonly name = "ExitPlanMode";
  readonly description = EXIT_DESCRIPTION;
  readonly schema = ExitParamsSchema;

  async execute(_params: unknown, ctx: ToolContext): Promise<ToolResult> {
    ctx.setPlanMode?.(false);
    return ToolOk(
      "Exited plan mode. You can now make edits, run tools, and take actions.",
      "Plan mode deactivated.",
    );
  }
}
