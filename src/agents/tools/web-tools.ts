/**
 * Web Tools - Web Search and Web Fetch
 *
 * - web_search: Uses playwright-cli to search via DuckDuckGo/Google (free, no API key)
 * - web_fetch: Uses Jina AI Reader API (free tier: 20 RPM without key)
 *
 * Jina AI Reader API: https://r.jina.ai/{URL}
 */

import { Type } from "@sinclair/typebox";
import { runPlaywrightCli } from "../../browser-cli/client.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam, readNumberParam } from "./common.js";

const log = createSubsystemLogger("web-tools");

const JINA_API_BASE = "https://r.jina.ai";
const SESSION_ID = "openclaw-web-search";

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface JinaFetchResponse {
  url?: string;
  title?: string;
  content?: string;
  timestamp?: string;
}

const WebFetchToolSchema = Type.Object({
  url: Type.String({ description: "URL to fetch content from" }),
  format: Type.Optional(stringEnum(["markdown", "json", "text"])),
  maxChars: Type.Optional(
    Type.Number({ description: "Maximum characters to return (default: 10000)" }),
  ),
  selector: Type.Optional(Type.String({ description: "CSS selector to extract specific content" })),
  exclude: Type.Optional(
    Type.String({ description: "CSS selectors to exclude (comma-separated)" }),
  ),
  timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 30)" })),
  images: Type.Optional(Type.Boolean({ description: "Include image descriptions" })),
  links: Type.Optional(Type.Boolean({ description: "Include links summary" })),
  noCache: Type.Optional(Type.Boolean({ description: "Bypass cached content" })),
});

const WebSearchToolSchema = Type.Object({
  query: Type.String({ description: "Search query" }),
  engine: Type.Optional(stringEnum(["duckduckgo", "google"])),
  count: Type.Optional(Type.Number({ description: "Number of results (default: 5)" })),
});

/**
 * Build Jina Reader API URL with options
 */
function buildJinaUrl(
  url: string,
  options: {
    format?: string;
    selector?: string;
    exclude?: string;
    timeout?: number;
    images?: boolean;
    links?: boolean;
    noCache?: boolean;
  },
): string {
  const params = new URLSearchParams();

  if (options.format === "json") {
    params.set("format", "json");
  }
  if (options.selector) {
    params.set("selector", options.selector);
  }
  if (options.exclude) {
    params.set("exclude", options.exclude);
  }
  if (options.timeout) {
    params.set("timeout", String(options.timeout));
  }
  if (options.images) {
    params.set("images", "summary");
  }
  if (options.links) {
    params.set("links", "summary");
  }
  if (options.noCache) {
    params.set("no-cache", "true");
  }

  const queryString = params.toString();
  return `${JINA_API_BASE}/${url}${queryString ? `?${queryString}` : ""}`;
}

/**
 * Fetch content from URL using Jina Reader API
 */
async function fetchWithJina(
  url: string,
  options: {
    format?: string;
    selector?: string;
    exclude?: string;
    timeout?: number;
    images?: boolean;
    links?: boolean;
    noCache?: boolean;
  },
): Promise<JinaFetchResponse> {
  const jinaUrl = buildJinaUrl(url, options);

  log.debug(`Fetching via Jina: ${jinaUrl}`);

  const response = await fetch(jinaUrl, {
    headers: {
      Accept: "application/json, text/markdown, text/plain",
    },
  });

  if (!response.ok) {
    throw new Error(`Jina API error: ${response.status} ${response.statusText}`);
  }

  // If JSON format requested, parse JSON
  if (options.format === "json") {
    return response.json() as Promise<JinaFetchResponse>;
  }

  // Otherwise return as markdown/text content
  const content = await response.text();
  return {
    url,
    content,
  };
}

/**
 * Search using playwright-cli (DuckDuckGo or Google)
 * Free, no API key required
 */
async function searchWithBrowser(
  query: string,
  engine: string,
  count: number,
): Promise<SearchResult[]> {
  const searchUrl =
    engine === "google"
      ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
      : `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;

  log.debug(`Searching via ${engine}: ${query}`);

  // 1. Open browser and navigate
  let result = await runPlaywrightCli("open", [searchUrl], { session: SESSION_ID, timeout: 30000 });
  if (result.exitCode !== 0) {
    throw new Error(`Failed to open browser: ${result.stderr || result.stdout}`);
  }

  try {
    // 2. Wait for results to load
    await new Promise((r) => setTimeout(r, 3000));

    // 3. Get snapshot with element refs
    result = await runPlaywrightCli("snapshot", [], { session: SESSION_ID, timeout: 10000 });
    if (result.exitCode !== 0) {
      throw new Error(`Failed to get snapshot: ${result.stderr || result.stdout}`);
    }

    // 4. Parse results from snapshot output
    const results = parseSearchResults(result.stdout, query, engine, count);

    return results;
  } finally {
    // 5. Close browser
    await runPlaywrightCli("close", [], { session: SESSION_ID, timeout: 5000 });
  }
}

/**
 * Parse search results from playwright-cli snapshot output
 */
function parseSearchResults(
  snapshotOutput: string,
  query: string,
  engine: string,
  count: number,
): SearchResult[] {
  const results: SearchResult[] = [];
  const lines = snapshotOutput.split("\n");

  // Look for link elements with URLs
  const linkRegex = /-\s*link\s*'([^']+)'\s*\[ref=(\w+)\]/;
  const headingRegex = /-\s*heading\s*'([^']+)'\s*\[ref=(\w+)\]/;

  const links: Array<{ title: string; ref: string }> = [];
  const headings: Array<{ title: string; ref: string }> = [];

  for (const line of lines) {
    const linkMatch = line.match(linkRegex);
    if (linkMatch && !linkMatch[1].includes(engine === "google" ? "Google" : "DuckDuckGo")) {
      links.push({ title: linkMatch[1], ref: linkMatch[2] });
    }

    const headingMatch = line.match(headingRegex);
    if (headingMatch && headingMatch[1].length > 5) {
      headings.push({ title: headingMatch[1], ref: headingMatch[2] });
    }
  }

  // Match headings with nearby links
  for (let i = 0; i < headings.length && results.length < count; i++) {
    const heading = headings[i];
    // Find a link that appears close in the list
    const nearbyLink = links.find((l) => {
      const headingNum = parseInt(heading.ref.slice(1));
      const linkNum = parseInt(l.ref.slice(1));
      return Math.abs(headingNum - linkNum) < 10;
    });

    // Filter out navigation links
    if (
      heading.title.includes("Sign in") ||
      heading.title.includes("Settings") ||
      heading.title.includes("Privacy") ||
      heading.title.length < 10
    ) {
      continue;
    }

    results.push({
      title: heading.title,
      url: nearbyLink?.title?.startsWith("http")
        ? nearbyLink.title
        : engine === "google"
          ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
          : `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      snippet: nearbyLink?.title || "",
    });
  }

  // If no results found, return a basic result
  if (results.length === 0) {
    results.push({
      title: `Search results for "${query}"`,
      url:
        engine === "google"
          ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
          : `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
      snippet: `Searched via ${engine}`,
    });
  }

  return results.slice(0, count);
}

/**
 * Truncate content to max characters
 */
function truncateContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }
  return content.slice(0, maxChars) + "\n\n[Content truncated...]";
}

/**
 * Create web fetch tool using Jina Reader API (free tier: 20 RPM)
 */
export function createWebFetchTool(): AnyAgentTool {
  return {
    label: "Web Fetch",
    name: "web_fetch",
    description: `Fetch and extract readable content from a URL using Jina AI Reader API.

Converts any webpage to clean, LLM-friendly Markdown:
- Strips ads, navigation, and clutter
- Auto-captions images (as alt text)
- Native PDF support
- Fast extraction (no JavaScript execution)

Examples:
- Fetch article: {"url": "https://example.com/article"}
- Get specific section: {"url": "https://example.com", "selector": "article"}
- Exclude elements: {"url": "https://example.com", "exclude": "nav,footer"}
- JSON output: {"url": "https://example.com", "format": "json"}

Rate limits: 20 RPM (no API key required)
Docs: https://jina.ai/reader`,
    parameters: WebFetchToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const url = readStringParam(params, "url", { required: true });
      const format = readStringParam(params, "format") || "markdown";
      const maxChars = readNumberParam(params, "maxChars") ?? 10000;
      const selector = readStringParam(params, "selector");
      const exclude = readStringParam(params, "exclude");
      const timeout = readNumberParam(params, "timeout");
      const images = params.images === true;
      const links = params.links === true;
      const noCache = params.noCache === true;

      if (!url) {
        return jsonResult({ ok: false, error: "URL is required" });
      }

      try {
        const result = await fetchWithJina(url, {
          format,
          selector,
          exclude,
          timeout,
          images,
          links,
          noCache,
        });

        const truncatedContent = result.content ? truncateContent(result.content, maxChars) : "";

        return jsonResult({
          ok: true,
          url: result.url || url,
          title: result.title,
          content: truncatedContent,
          timestamp: result.timestamp,
          truncated: result.content ? result.content.length > maxChars : false,
          originalLength: result.content?.length,
        });
      } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error);
        log.error(`Web fetch error: ${errorText}`);
        return jsonResult({
          ok: false,
          error: errorText,
          url,
        });
      }
    },
  };
}

/**
 * Create web search tool using playwright-cli (DuckDuckGo/Google)
 * Free, no API key required
 */
export function createWebSearchTool(): AnyAgentTool {
  return {
    label: "Web Search",
    name: "web_search",
    description: `Search the web using playwright-cli automation (DuckDuckGo or Google).

Uses shell commands to perform searches - free, no API key required.
Returns search results with titles and URLs.

Examples:
- Search DuckDuckGo: {"query": "OpenClaw documentation"}
- Search Google: {"query": "TypeScript tips", "engine": "google"}
- Get more results: {"query": "machine learning", "count": 10}

Note: Uses browser automation via playwright-cli commands:
  playwright-cli open <url>
  playwright-cli snapshot
  playwright-cli close

Requires: npm install -g @playwright/cli`,
    parameters: WebSearchToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const query = readStringParam(params, "query", { required: true });
      const engine = readStringParam(params, "engine") || "duckduckgo";
      const count = readNumberParam(params, "count") ?? 5;

      if (!query) {
        return jsonResult({ ok: false, error: "Query is required" });
      }

      try {
        const results = await searchWithBrowser(query, engine, count);

        return jsonResult({
          ok: true,
          query,
          engine,
          count: results.length,
          results,
        });
      } catch (error) {
        const errorText = error instanceof Error ? error.message : String(error);
        log.error(`Web search error: ${errorText}`);
        return jsonResult({
          ok: false,
          error: errorText,
          query,
          engine,
        });
      }
    },
  };
}
