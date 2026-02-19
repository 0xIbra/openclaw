---
summary: "Browser automation via playwright-cli (recommended approach)"
read_when:
  - You want agent-controlled browser automation
  - You prefer simple CLI-based browser control over CDP/MCP
  - You want per-task browser isolation
title: "Browser (playwright-cli)"
---

# Browser Automation (playwright-cli)

OpenClaw uses **playwright-cli** for browser automation - a token-efficient CLI approach that's perfect for coding agents.

## Why playwright-cli?

- **Token-efficient**: Does not force page data into LLM context
- **Simple**: CLI commands instead of complex CDP/MCP protocols
- **Isolated**: Each task gets its own browser session and profile
- **No browser downloads needed**: Uses your existing Chrome/Edge/Chromium

## Documentation

- **[Agent Guide](./browser-agent-guide)** - Complete guide for AI agents using browser automation
- **[Skill Reference](../../skills/browser-cli/SKILL.md)** - Quick reference for agents
- [playwright-cli upstream docs](https://github.com/microsoft/playwright-cli)

## Prerequisites

```bash
npm install -g @playwright/cli
playwright-cli --version  # Should show 1.58.0 or higher
```

## Quick Start for Agents

### 5-Step Pattern

```bash
# 1. OPEN - Start browser
playwright-cli open https://example.com

# 2. SNAPSHOT - Get element refs
playwright-cli snapshot

# 3. ACT - Use refs (e12, e3, etc.)
playwright-cli click e12
playwright-cli fill e3 "text"
playwright-cli press Enter

# 4. VERIFY - Screenshot
playwright-cli screenshot

# 5. CLOSE - Clean up
playwright-cli close
```

**Critical:** Refs change after navigation. Always get a fresh snapshot after clicking links or submitting forms.

### Named Sessions for Isolation

```bash
# Task 1: Login flow (persistent session)
playwright-cli -s=login-flow open https://app.com --persistent
playwright-cli -s=login-flow fill e1 "user"
playwright-cli -s=login-flow click e2
# Session preserved

# Task 2: Different site (isolated)
playwright-cli -s=scraper open https://othersite.com
```

## OpenClaw Integration

### Task-Based Usage

Create tasks with type `web`, `research`, or `test:e2e`:

```bash
openclaw task create --type web "Navigate to https://example.com and take a screenshot"
```

Task types that trigger browser automation:

- `web` - General web automation
- `research` - Web research tasks
- `test:e2e` - End-to-end testing
- `ui-test` - UI testing
- `scraping` - Data extraction

Or any task description containing URLs (`https://...`) or search queries.

### Programmatic API

```typescript
import { BrowserClient } from "openclaw/browser-cli";

const client = new BrowserClient({
  agentId: "my-agent",
  headless: true,
  viewport: { width: 1280, height: 720 },
});

await client.start();
await client.navigate("https://example.com");
const snapshot = await client.snapshot();
await client.click("e12");
await client.screenshot({ fullPage: true });
await client.stop();
```

### Task Executor

```typescript
import { createBrowserTaskExecutor } from "openclaw/browser-cli";

const executor = createBrowserTaskExecutor({
  agentId: "my-agent",
  dataDir: "~/.openclaw",
  headless: true,
});

const result = await executor.execute({
  task: {
    id: "task-1",
    type: "web",
    description: `https://example.com\nscreenshot`,
  },
  agent: { id: "my-agent" },
  workspace: { path: "/tmp/workspace" },
});
```

## Architecture

```
┌─────────────────────────────────────────┐
│           OpenClaw Agent               │
├─────────────────────────────────────────┤
│  Task Executor (createBrowserTaskExecutor)
│           ↓                              │
│  BrowserClient / createBrowserSession    │
│           ↓                              │
│  playwright-cli (shell commands)         │
│           ↓                              │
│  Chrome/Edge/Chromium (system browser)   │
└─────────────────────────────────────────┘
```

Profile isolation:

```
~/.openclaw/browser-profiles/
  └── <agent-id>/
      └── <task-id>/  # Isolated profile
```

## Session Management

```bash
# List active sessions
playwright-cli list

# Visual dashboard
playwright-cli show

# Clean up
playwright-cli close-all
playwright-cli kill-all  # Force
```

## Comparison: Old vs New

| Feature            | Old (CDP)          | New (playwright-cli)          |
| ------------------ | ------------------ | ----------------------------- |
| Protocol           | CDP/WebSocket      | CLI commands                  |
| Browser management | OpenClaw manages   | playwright-cli manages        |
| Profile isolation  | Manual             | Automatic per-session         |
| Token efficiency   | Poor (full tree)   | Excellent (refs only)         |
| Setup complexity   | High (ports, auth) | Low (just install CLI)        |
| Multi-browser      | CDP only           | Any (Chrome, Firefox, WebKit) |

## Migration from Old Browser

The old CDP-based browser (`src/browser/`) remains for backward compatibility. New automation should use:

1. **For agents:** Direct playwright-cli commands via `browser-cli` module
2. **For tasks:** Task types `web`, `research`, `test:e2e`
3. **For CLI:** `playwright-cli` directly instead of `openclaw browser`

## Related

- **[Agent Guide](./browser-agent-guide)** - Complete guide for AI agents
- **[Skill Reference](../../skills/browser-cli/SKILL.md)** - Quick reference
- [playwright-cli docs](https://github.com/microsoft/playwright-cli)
- [Legacy CDP Browser](./browser.md) - Old system (deprecated)
