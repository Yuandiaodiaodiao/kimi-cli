/**
 * Abstract base class for all tools.
 * Corresponds to Python's CallableTool2.
 */

import type { z } from "zod/v4";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolContext, ToolDefinition, ToolResult } from "./types.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export abstract class CallableTool<TParams extends z.ZodType<any, any> = z.ZodType<any, any>> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly schema: TParams;

  /** Execute the tool with validated parameters. */
  abstract execute(
    params: z.infer<TParams>,
    ctx: ToolContext,
  ): Promise<ToolResult>;

  /** Convert this tool into a ToolDefinition for LLM function calling. */
  toDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parameters: zodToJsonSchema(this.schema as any, {
        target: "openAi",
      }) as Record<string, unknown>,
    };
  }
}
