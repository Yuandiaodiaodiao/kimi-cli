/**
 * Tool registry — register, find, and list all tools.
 * Also acts as a DI container for ToolContext.
 */

import type { CallableTool } from "./base.ts";
import type { ToolContext, ToolDefinition, ToolResult } from "./types.ts";

export class ToolRegistry {
  private tools = new Map<string, CallableTool>();
  private _ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this._ctx = ctx;
  }

  get context(): ToolContext {
    return this._ctx;
  }

  /** Register a tool instance. */
  register(tool: CallableTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  /** Find a tool by name. */
  find(name: string): CallableTool | undefined {
    return this.tools.get(name);
  }

  /** List all registered tools. */
  list(): CallableTool[] {
    return [...this.tools.values()];
  }

  /** Get all tool definitions for LLM function calling. */
  definitions(): ToolDefinition[] {
    return this.list().map((t) => t.toDefinition());
  }

  /** Execute a tool by name with raw JSON arguments. */
  async execute(
    name: string,
    rawArgs: Record<string, unknown>,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        isError: true,
        output: "",
        message: `Tool "${name}" not found.`,
      };
    }

    // Validate params through tool schema
    const parsed = tool.schema.safeParse(rawArgs);
    if (!parsed.success) {
      return {
        isError: true,
        output: "",
        message: `Invalid parameters for tool "${name}": ${parsed.error.message}`,
      };
    }

    return tool.execute(parsed.data, this._ctx);
  }
}
