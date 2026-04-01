/**
 * FetchURL tool — fetch a web page and extract main text content.
 * Corresponds to Python tools/web/fetch.py
 */

import { z } from "zod/v4";
import { CallableTool } from "../base.ts";
import type { ToolContext, ToolResult } from "../types.ts";
import { ToolResultBuilder } from "../types.ts";

const DESCRIPTION =
  "Fetch a web page from a URL and extract main text content from it.";

const ParamsSchema = z.object({
  url: z.string().describe("The URL to fetch content from."),
});

type Params = z.infer<typeof ParamsSchema>;

export class FetchURL extends CallableTool<typeof ParamsSchema> {
  readonly name = "FetchURL";
  readonly description = DESCRIPTION;
  readonly schema = ParamsSchema;

  async execute(params: Params, _ctx: ToolContext): Promise<ToolResult> {
    const builder = new ToolResultBuilder(50_000, null);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 180_000); // 3 min

      const response = await fetch(params.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status >= 400) {
        return builder.error(
          `Failed to fetch URL. Status: ${response.status}. This may indicate the page is not accessible or the server is down.`,
        );
      }

      const respText = await response.text();
      const contentType = response.headers.get("content-type") || "";

      if (
        contentType.startsWith("text/plain") ||
        contentType.startsWith("text/markdown")
      ) {
        builder.write(respText);
        return builder.ok(
          "The returned content is the full content of the page.",
        );
      }

      if (!respText) {
        return builder.ok("The response body is empty.");
      }

      // Simple HTML to text extraction (basic implementation)
      // In production, consider using a library like readability or turndown
      const extracted = extractTextFromHtml(respText);

      if (!extracted) {
        return builder.error(
          "Failed to extract meaningful content from the page. " +
            "The page may require JavaScript to render its content.",
        );
      }

      builder.write(extracted);
      return builder.ok(
        "The returned content is the main text content extracted from the page.",
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return builder.error(
          "Failed to fetch URL: request timed out. The server may be slow or unreachable.",
        );
      }
      return builder.error(
        `Failed to fetch URL due to network error: ${e}. The URL may be invalid or the server is unreachable.`,
      );
    }
  }
}

/**
 * Basic HTML to text extraction.
 * Strips HTML tags, decodes common entities, and collapses whitespace.
 */
function extractTextFromHtml(html: string): string {
  // Remove script and style tags and their contents
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "");

  // Replace block-level elements with newlines
  text = text
    .replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|pre|hr)[^>]*>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "") // Remove all remaining tags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n") // Collapse multiple newlines
    .replace(/[ \t]+/g, " ") // Collapse whitespace on same line
    .trim();

  return text;
}
