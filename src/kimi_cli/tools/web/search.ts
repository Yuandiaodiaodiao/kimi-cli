/**
 * SearchWeb tool — web search interface.
 * Corresponds to Python tools/web/search.py
 */

import { z } from "zod/v4";
import { CallableTool } from "../base.ts";
import type { ToolContext, ToolResult } from "../types.ts";
import { ToolResultBuilder } from "../types.ts";

const DESCRIPTION =
  "WebSearch tool allows you to search on the internet to get latest information, including news, documents, release notes, blog posts, papers, etc.";

const ParamsSchema = z.object({
  query: z.string().describe("The query text to search for."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .describe("The number of results to return."),
  include_content: z
    .boolean()
    .default(false)
    .describe(
      "Whether to include the content of the web pages in the results. Can consume many tokens.",
    ),
});

type Params = z.infer<typeof ParamsSchema>;

export class SearchWeb extends CallableTool<typeof ParamsSchema> {
  readonly name = "SearchWeb";
  readonly description = DESCRIPTION;
  readonly schema = ParamsSchema;

  async execute(params: Params, _ctx: ToolContext): Promise<ToolResult> {
    const builder = new ToolResultBuilder(50_000, null);

    // Placeholder: search service needs to be configured
    return builder.error(
      "Search service is not configured. You may want to try other methods to search.",
    );
  }
}
