/**
 * Web Tools - Web Search and Web Fetch
 *
 * - web_search: Uses playwright-cli in HEADED mode to search via DuckDuckGo/Google
 * - web_fetch: Uses Jina Reader API (primary) with browser fallback for JS-heavy sites
 *
 * Both tools use headed browser mode to avoid captcha issues.
 */

import { Type } from "@sinclair/typebox";
import { runPlaywrightCli } from "../../browser-cli/client.js";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam, readNumberParam } from "./common.js";

const log = createSubsystemLogger("web-tools");

const JINA_API_BASE = "https://r.jina.ai";

function makeSearchSessionId(agentId?: string): string {
  return agentId ? `openclaw-web-search-${agentId}` : "openclaw-web-search";
}

function makeFetchSessionId(agentId?: string): string {
  return agentId ? `openclaw-web-fetch-${agentId}` : "openclaw-web-fetch";
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface FetchedContent {
  url: string;
  title: string;
  content: string;
  links: Array<{ text: string; href: string }>;
}

const WebFetchToolSchema = Type.Object({
  url: Type.String({ description: "URL to fetch content from" }),
  format: Type.Optional(stringEnum(["markdown", "text"])),
  maxChars: Type.Optional(
    Type.Number({ description: "Maximum characters to return (default: 15000)" }),
  ),
  scroll: Type.Optional(Type.Boolean({ description: "Scroll to load dynamic content" })),
  timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (default: 60)" })),
});

const WebSearchToolSchema = Type.Object({
  query: Type.String({ description: "Search query" }),
  engine: Type.Optional(stringEnum(["duckduckgo", "google"])),
  count: Type.Optional(Type.Number({ description: "Number of results (default: 3, max: 5)" })),
  maxChars: Type.Optional(
    Type.Number({ description: "Maximum characters per result content (default: 8000)" }),
  ),
});

/**
 * Extract JSON from playwright-cli eval output
 * The output format shows: ### Result\n"<escaped-json-string>"\n### Ran
 * For non-JSON returns, it may just be the raw value in quotes
 */
function extractJsonFromEvalOutput(output: string): string | null {
  if (!output) {
    return null;
  }

  // Look for Result section
  const resultMatch = output.match(/### Result\s*\n"([\s\S]*?)"\s*\n### Ran/);
  if (resultMatch) {
    const content = resultMatch[1];

    // Try to parse as escaped JSON string first
    try {
      const unescaped = JSON.parse('"' + content + '"');
      // Verify it's valid JSON
      JSON.parse(unescaped);
      return unescaped;
    } catch {
      // Not valid escaped JSON, return as-is for further processing
    }

    // Check if content looks like JSON already (starts with [ or {)
    const trimmed = content.trim();
    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        JSON.parse(trimmed);
        return trimmed;
      } catch {
        // Not valid JSON
      }
    }

    // Return the raw string content
    return content;
  }

  // Fallback: try to find raw JSON array/object in output
  const jsonMatch = output.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      JSON.parse(jsonMatch[0]);
      return jsonMatch[0];
    } catch {
      // Not valid JSON
    }
  }

  return null;
}

/**
 * Build a JavaScript expression string that extracts search results from DuckDuckGo
 */
function buildDuckDuckGoExtractor(count: number): string {
  return `
    (function() {
      const results = [];
      const seenUrls = new Set();
      
      const articles = document.querySelectorAll('article');
      
      for (const article of articles) {
        const heading = article.querySelector('h2, h3');
        if (!heading) continue;
        
        const title = heading.textContent?.trim();
        if (!title || title.length < 3) continue;
        
        const link = article.querySelector('a[href^="http"]');
        if (!link) continue;
        
        const url = link.href;
        if (!url || seenUrls.has(url)) continue;
        if (url.includes('duckduckgo.com') || url.includes('google.com')) continue;
        
        let snippet = '';
        const snippetEl = article.querySelector('p');
        if (snippetEl) {
          snippet = snippetEl.textContent?.trim() || '';
        }
        
        seenUrls.add(url);
        results.push({ title, url, snippet });
        
        if (results.length >= ${count}) break;
      }
      
      if (results.length === 0) {
        const allLinks = document.querySelectorAll('a[href^="http"]');
        for (const link of allLinks) {
          const url = link.href;
          if (!url || seenUrls.has(url)) continue;
          if (url.includes('duckduckgo.com') || url.includes('google.com')) continue;
          
          const title = link.textContent?.trim();
          if (!title || title.length < 10) continue;
          
          if (title.toLowerCase().includes('privacy') || 
              title.toLowerCase().includes('settings') ||
              title.toLowerCase().includes('about') && title.length < 15) continue;
          
          seenUrls.add(url);
          results.push({ title, url, snippet: '' });
          
          if (results.length >= ${count}) break;
        }
      }
      
      return JSON.stringify(results);
    })()
  `;
}

/**
 * Build a JavaScript expression string that extracts search results from Google
 */
function buildGoogleExtractor(count: number): string {
  return `
    (function() {
      const results = [];
      const seenUrls = new Set();
      
      const containers = document.querySelectorAll('#search .g, #rso .g, #search .v7W49e, [data-async-context] .g');
      
      for (const container of containers) {
        const linkEl = container.querySelector('a[jsname="UWckNb"], h3 a, a > h3, .yuRUbf a');
        if (!linkEl) continue;
        
        const title = linkEl.textContent?.trim() || container.querySelector('h3')?.textContent?.trim();
        const url = linkEl.href;
        
        if (!title || !url || seenUrls.has(url)) continue;
        if (url.includes('google.com') || url.includes('/search?')) continue;
        
        let snippet = '';
        const snippetEl = container.querySelector('.VwiC3b, .s3v94d, .lyLwlc, span:not([class])');
        if (snippetEl) {
          snippet = snippetEl.textContent?.trim() || '';
        }
        
        seenUrls.add(url);
        results.push({ title, url, snippet });
        
        if (results.length >= ${count}) break;
      }
      
      return JSON.stringify(results);
    })()
  `;
}

/**
 * Search using playwright-cli in HEADED mode (avoids captchas)
 */
async function searchWithBrowser(
  query: string,
  engine: string,
  count: number,
  sessionId: string,
): Promise<SearchResult[]> {
  const searchUrl =
    engine === "google"
      ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
      : `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;

  log.info(`Starting headed browser search via ${engine}: ${query}`);

  await runPlaywrightCli("close", [], { session: sessionId, timeout: 5000 }).catch(() => {});

  const openArgs = [searchUrl, "--headed", "--persistent"];
  let result = await runPlaywrightCli("open", openArgs, { session: sessionId, timeout: 60000 });

  if (result.exitCode !== 0) {
    throw new Error(`Failed to open browser: ${result.stderr || result.stdout}`);
  }

  try {
    await new Promise((r) => setTimeout(r, 6000));
    await handleConsentDialogs(engine, sessionId);
    await new Promise((r) => setTimeout(r, 3000));

    const extractorScript =
      engine === "google" ? buildGoogleExtractor(count) : buildDuckDuckGoExtractor(count);

    log.debug(`Running extractor script for ${engine}`);
    result = await runPlaywrightCli("eval", [extractorScript], {
      session: sessionId,
      timeout: 15000,
    });

    log.debug(`Extractor result: exitCode=${result.exitCode}`);

    if (result.exitCode === 0 && result.stdout) {
      const jsonStr = extractJsonFromEvalOutput(result.stdout);
      if (jsonStr) {
        try {
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            log.info(`Found ${parsed.length} results from ${engine}`);
            return parsed.slice(0, count);
          }
        } catch (e) {
          log.debug(`Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    log.debug(`Using fallback extraction for ${engine}`);
    return await fallbackExtractResults(query, engine, count, sessionId);
  } finally {
    await runPlaywrightCli("close", [], { session: sessionId, timeout: 5000 }).catch(() => {});
  }
}

/**
 * Handle consent dialogs and captchas
 */
async function handleConsentDialogs(engine: string, sessionId: string): Promise<void> {
  if (engine === "google") {
    const consentScript = `
      (function() {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase() || '';
          if (text.includes('reject all') || text.includes('accept all') || text.includes('i agree')) {
            btn.click();
            return 'clicked';
          }
        }
        return 'no-consent';
      })()
    `;
    await runPlaywrightCli("eval", [consentScript], { session: sessionId, timeout: 5000 }).catch(
      () => {},
    );
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (engine === "duckduckgo") {
    const dismissScript = `
      (function() {
        const closeButtons = document.querySelectorAll('[aria-label="Close"], .close, .dismiss');
        for (const btn of closeButtons) {
          btn.click();
        }
        return 'dismissed';
      })()
    `;
    await runPlaywrightCli("eval", [dismissScript], { session: sessionId, timeout: 5000 }).catch(
      () => {},
    );
  }
}

/**
 * Fallback extraction using generic link detection
 */
async function fallbackExtractResults(
  query: string,
  engine: string,
  count: number,
  sessionId: string,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  const fallbackScript = `
    (function() {
      const results = [];
      const seenUrls = new Set();
      
      const links = document.querySelectorAll('a[href^="http"]');
      
      for (const link of links) {
        const href = link.href;
        const text = link.textContent?.trim() || '';
        
        if (!href || seenUrls.has(href)) continue;
        if (href.includes('google.com') || href.includes('duckduckgo.com')) continue;
        if (href.includes('gstatic.com') || href.includes('googlesyndication.com')) continue;
        if (text.length < 10) continue;
        if (text.toLowerCase().includes('privacy') || text.toLowerCase().includes('settings')) continue;
        
        seenUrls.add(href);
        results.push({ title: text, url: href, snippet: '' });
        
        if (results.length >= ${count + 3}) break;
      }
      
      return JSON.stringify(results.slice(0, ${count}));
    })()
  `;

  const result = await runPlaywrightCli("eval", [fallbackScript], {
    session: sessionId,
    timeout: 15000,
  });

  if (result.exitCode === 0 && result.stdout) {
    const jsonStr = extractJsonFromEvalOutput(result.stdout);
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed)) {
          results.push(...parsed);
        }
      } catch (e) {
        log.debug(`Fallback extraction failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return results.length > 0
    ? results
    : [
        {
          title: `Search results for "${query}"`,
          url:
            engine === "google"
              ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
              : `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
          snippet: `Search completed via ${engine}. No results could be extracted automatically.`,
        },
      ];
}

/**
 * Fetch content from URL using headed browser (avoids captchas, handles JS)
 */
async function fetchWithBrowser(
  url: string,
  options: {
    maxChars: number;
    scroll: boolean;
    timeout: number;
    sessionId: string;
  },
): Promise<FetchedContent> {
  const sessionId = options.sessionId;
  log.info(`Fetching content from ${url} with headed browser`);

  await runPlaywrightCli("close", [], { session: sessionId, timeout: 5000 }).catch(() => {});

  const openArgs = [url, "--headed", "--persistent"];
  let result = await runPlaywrightCli("open", openArgs, {
    session: sessionId,
    timeout: 60000,
  });

  if (result.exitCode !== 0) {
    throw new Error(`Failed to open browser: ${result.stderr || result.stdout}`);
  }

  try {
    await new Promise((r) => setTimeout(r, 6000));
    await handleConsentDialogsForFetch(sessionId);
    await new Promise((r) => setTimeout(r, 3000));

    if (options.scroll) {
      await scrollPage(sessionId);
    }

    return await extractPageContent(url, options.maxChars, sessionId);
  } finally {
    await runPlaywrightCli("close", [], { session: sessionId, timeout: 5000 }).catch(() => {});
  }
}

/**
 * Handle consent dialogs for fetch operations
 */
async function handleConsentDialogsForFetch(sessionId: string): Promise<void> {
  const consentScript = `
    (function() {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase() || '';
        if (text.includes('accept') || text.includes('allow') || text.includes('agree') || text.includes('continue')) {
          btn.click();
          return 'clicked';
        }
      }
      return 'no-consent';
    })()
  `;

  await runPlaywrightCli("eval", [consentScript], {
    session: sessionId,
    timeout: 5000,
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2000));
}

/**
 * Scroll page to load dynamic content
 */
async function scrollPage(sessionId: string): Promise<void> {
  const scrollScript = `
    (function() {
      let scrolled = 0;
      const step = window.innerHeight * 0.8;
      
      function doScroll() {
        if (scrolled >= 5) return 'done';
        window.scrollBy(0, step);
        scrolled++;
        setTimeout(doScroll, 1000);
        return 'scrolling';
      }
      
      doScroll();
      return 'started';
    })()
  `;

  await runPlaywrightCli("eval", [scrollScript], {
    session: sessionId,
    timeout: 10000,
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 6000));
}

/**
 * Extract page content
 * We extract title directly and content separately to avoid JSON parsing issues with newlines
 */
async function extractPageContent(
  url: string,
  maxChars: number,
  sessionId: string,
): Promise<FetchedContent> {
  // Get title
  const titleResult = await runPlaywrightCli("eval", ["document.title"], {
    session: sessionId,
    timeout: 10000,
  });
  let title = "Untitled";
  if (titleResult.exitCode === 0 && titleResult.stdout) {
    const extracted = extractJsonFromEvalOutput(titleResult.stdout);
    if (extracted) {
      title = extracted;
    }
  }

  // Get content - Try multiple approaches for JavaScript-heavy sites
  const contentScript = `
    (function() {
      // Remove script and style elements
      const toRemove = document.querySelectorAll('script, style, nav, header, footer, aside, .sidebar, .advertisement, .ads, .cookie-banner, .consent-banner, iframe, noscript');
      toRemove.forEach(el => el.remove());
      
      let content = '';
      
      // Try to find the main content area
      const contentSelectors = [
        'main article', 
        'main',
        '[role="main"]',
        '.prose',
        '.content',
        '.main-content',
        '#content',
        '#main-content',
        '.documentation',
        '.docs-content',
        '.markdown-body',
        'article',
        '.fern-docs-content',
        '.docs',
        '[class*="content"]',
        'body'
      ];
      
      for (const selector of contentSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          // Skip navigation elements that might be inside main
          if (el.closest('nav') || el.classList.contains('nav')) continue;
          
          const text = el.textContent?.trim();
          if (text && text.length > content.length && text.length > 200) {
            content = text;
          }
        }
      }
      
      // Fallback: combine text from paragraphs and headings
      if (content.length < 500) {
        const paragraphs = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
        const texts = [];
        for (const p of paragraphs) {
          const text = p.textContent?.trim();
          if (text && text.length > 10 && !text.startsWith('function') && !text.startsWith('var ')) {
            texts.push(text);
          }
        }
        content = texts.join('\\n\\n');
      }
      
      // Clean up content for safe JSON transport
      content = content
        .replace(/\\\\/g, '\\\\\\\\')
        .replace(/"/g, '\\\\"')
        .replace(/\n/g, '\\\\n')
        .replace(/\r/g, '\\\\r')
        .replace(/\t/g, '\\\\t');
      
      return '"' + content.slice(0, 50000) + '"';
    })()
  `;

  const contentResult = await runPlaywrightCli("eval", [contentScript], {
    session: sessionId,
    timeout: 20000,
  });

  if (contentResult.exitCode !== 0) {
    throw new Error(`Failed to extract content: ${contentResult.stderr || "Unknown error"}`);
  }

  // Get links
  const linksScript = `
    (function() {
      const links = [];
      const seen = new Set();
      const linkElements = document.querySelectorAll('a[href^="http"]');
      
      for (const link of linkElements) {
        const text = link.textContent?.trim();
        const href = link.href;
        if (text && href && text.length > 2 && text.length < 100 && links.length < 20) {
          // Skip duplicates
          if (seen.has(href)) continue;
          seen.add(href);
          links.push({ text: text.replace(/"/g, '\\"'), href });
        }
      }
      
      return JSON.stringify(links);
    })()
  `;

  const linksResult = await runPlaywrightCli("eval", [linksScript], {
    session: sessionId,
    timeout: 10000,
  });
  let links: Array<{ text: string; href: string }> = [];
  if (linksResult.exitCode === 0 && linksResult.stdout) {
    const jsonStr = extractJsonFromEvalOutput(linksResult.stdout);
    if (jsonStr) {
      try {
        links = JSON.parse(jsonStr);
      } catch {
        links = [];
      }
    }
  }

  // Parse content
  let content = "";
  if (contentResult.stdout) {
    const extracted = extractJsonFromEvalOutput(contentResult.stdout);
    if (extracted) {
      content = extracted;
    }
  }

  // Clean up whitespace
  content = content.replace(/\s+/g, " ").trim();

  // Truncate if needed
  const truncated = content.length > maxChars;
  if (truncated) {
    content = content.slice(0, maxChars) + "\n\n[Content truncated...]";
  }

  return {
    url,
    title,
    content,
    links,
  };
}

/**
 * Create web fetch tool using headed browser
 */
export function createWebFetchTool(options?: { agentId?: string }): AnyAgentTool {
  const fetchSessionId = makeFetchSessionId(options?.agentId);
  return {
    label: "Web Fetch",
    name: "web_fetch",
    description: `Fetch and extract readable content from a URL using a real headed browser.

This tool browses to the URL in a visible browser window (headed mode) to avoid captchas and handle JavaScript-rendered content.

Features:
- Bypasses captchas and bot detection via headed browser
- Handles JavaScript-rendered content (SPAs, dynamic sites)
- Auto-dismissing common consent dialogs
- Optional scrolling for lazy-loaded content
- Returns clean text/markdown content

Examples:
- Fetch article: {"url": "https://example.com/article"}
- Fetch with scrolling: {"url": "https://example.com/docs", "scroll": true}
- Limit output: {"url": "https://example.com", "maxChars": 5000}

Note: Uses headed browser mode which may show a browser window briefly.`,
    parameters: WebFetchToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const url = readStringParam(params, "url", { required: true });
      const format = readStringParam(params, "format") || "markdown";
      const maxChars = readNumberParam(params, "maxChars") ?? 15000;
      const scroll = params.scroll === true;
      const timeout = readNumberParam(params, "timeout") ?? 60;

      if (!url) {
        return jsonResult({ ok: false, error: "URL is required" });
      }

      try {
        const result = await fetchWithBrowser(url, {
          maxChars,
          scroll,
          timeout,
          sessionId: fetchSessionId,
        });

        let formattedContent = result.content;
        if (format === "markdown") {
          formattedContent = `# ${result.title}\n\n${result.content}`;

          if (result.links.length > 0) {
            formattedContent += "\n\n## Links on Page\n";
            for (const link of result.links.slice(0, 10)) {
              formattedContent += `- [${link.text}](${link.href})\n`;
            }
          }
        }

        return jsonResult({
          ok: true,
          url: result.url,
          title: result.title,
          content: formattedContent,
          linksFound: result.links.length,
          truncated: result.content.length < (result.content + "").length,
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
 * Fetch content from URL using Jina Reader API
 */
async function fetchContentWithJina(url: string, maxChars: number): Promise<string> {
  try {
    const jinaUrl = `${JINA_API_BASE}/${url}`;
    log.debug(`Fetching via Jina: ${jinaUrl}`);

    const response = await fetch(jinaUrl, {
      headers: {
        Accept: "text/markdown, text/plain",
      },
    });

    if (!response.ok) {
      throw new Error(`Jina API error: ${response.status}`);
    }

    const content = await response.text();

    // Truncate if needed
    if (content.length > maxChars) {
      return content.slice(0, maxChars) + "\n\n[Content truncated...]";
    }

    return content;
  } catch (error) {
    log.debug(
      `Jina fetch failed for ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

interface SearchResultWithContent extends SearchResult {
  content: string;
}

/**
 * Search and fetch content from results using Jina Reader
 */
async function searchWithContent(
  query: string,
  engine: string,
  count: number,
  maxChars: number,
  sessionId: string,
): Promise<SearchResultWithContent[]> {
  // First, get search results using browser
  const searchResults = await searchWithBrowser(query, engine, count, sessionId);

  // Then fetch content for each result using Jina Reader
  const resultsWithContent: SearchResultWithContent[] = [];

  for (const result of searchResults) {
    try {
      log.info(`Fetching content from: ${result.url}`);
      const content = await fetchContentWithJina(result.url, maxChars);
      resultsWithContent.push({
        ...result,
        content,
      });
    } catch (error) {
      log.debug(
        `Failed to fetch content for ${result.url}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Include the result even without content, but indicate failure
      resultsWithContent.push({
        ...result,
        content: `[Failed to fetch content: ${error instanceof Error ? error.message : String(error)}]`,
      });
    }
  }

  return resultsWithContent;
}

/**
 * Create web search tool that returns markdown content from search results
 */
export function createWebSearchTool(options?: { agentId?: string }): AnyAgentTool {
  const searchSessionId = makeSearchSessionId(options?.agentId);
  return {
    label: "Web Search",
    name: "web_search",
    description: `Search the web and return markdown content from the results.

Uses browser automation in HEADED mode to avoid captchas, then fetches full content 
from each result using Jina Reader API (free, no key needed).

Returns search results with full markdown content suitable for reading and analysis.

Examples:
- Search: {"query": "OpenClaw documentation"}
- Search with more results: {"query": "machine learning", "count": 5}
- Limit content length: {"query": "TypeScript tips", "maxChars": 5000}

Note: Uses headed browser (shows window) to avoid captchas. Requires: npm install -g @playwright/cli`,
    parameters: WebSearchToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const query = readStringParam(params, "query", { required: true });
      const engine = readStringParam(params, "engine") || "duckduckgo";
      const count = Math.min(readNumberParam(params, "count") ?? 3, 5);
      const maxChars = readNumberParam(params, "maxChars") ?? 8000;

      if (!query) {
        return jsonResult({ ok: false, error: "Query is required" });
      }

      try {
        const results = await searchWithContent(query, engine, count, maxChars, searchSessionId);

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
