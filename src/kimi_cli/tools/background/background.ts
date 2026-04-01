/**
 * Background task tools — TaskList, TaskOutput, TaskStop.
 * Corresponds to Python tools/background/__init__.py
 * Stub: full implementation requires background task manager integration.
 */

import { z } from "zod/v4";
import { CallableTool } from "../base.ts";
import type { ToolContext, ToolResult } from "../types.ts";
import { ToolError, ToolOk } from "../types.ts";

// ── TaskList ────────────────────────────────────────────

const TaskListParamsSchema = z.object({
  active_only: z
    .boolean()
    .default(true)
    .describe("Whether to list only non-terminal background tasks."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of tasks to return."),
});

export class TaskList extends CallableTool<typeof TaskListParamsSchema> {
  readonly name = "TaskList";
  readonly description =
    "List background tasks. Returns task IDs, statuses, and descriptions.";
  readonly schema = TaskListParamsSchema;

  async execute(
    _params: z.infer<typeof TaskListParamsSchema>,
    _ctx: ToolContext,
  ): Promise<ToolResult> {
    // Stub
    return ToolOk("No background tasks.", "Task list retrieved.");
  }
}

// ── TaskOutput ──────────────────────────────────────────

const TaskOutputParamsSchema = z.object({
  task_id: z.string().describe("The background task ID to inspect."),
  block: z
    .boolean()
    .default(false)
    .describe("Whether to wait for the task to finish before returning."),
  timeout: z
    .number()
    .int()
    .min(0)
    .max(3600)
    .default(30)
    .describe("Maximum number of seconds to wait when block=true."),
});

export class TaskOutput extends CallableTool<typeof TaskOutputParamsSchema> {
  readonly name = "TaskOutput";
  readonly description =
    "Retrieve output from a background task by its ID.";
  readonly schema = TaskOutputParamsSchema;

  async execute(
    params: z.infer<typeof TaskOutputParamsSchema>,
    _ctx: ToolContext,
  ): Promise<ToolResult> {
    // Stub
    return ToolError(`Task not found: ${params.task_id}`);
  }
}

// ── TaskStop ────────────────────────────────────────────

const TaskStopParamsSchema = z.object({
  task_id: z.string().describe("The background task ID to stop."),
  reason: z
    .string()
    .default("Stopped by TaskStop")
    .describe("Short reason recorded when the task is stopped."),
});

export class TaskStop extends CallableTool<typeof TaskStopParamsSchema> {
  readonly name = "TaskStop";
  readonly description = "Stop a running background task by its ID.";
  readonly schema = TaskStopParamsSchema;

  async execute(
    params: z.infer<typeof TaskStopParamsSchema>,
    _ctx: ToolContext,
  ): Promise<ToolResult> {
    // Stub
    return ToolError(`Task not found: ${params.task_id}`);
  }
}
