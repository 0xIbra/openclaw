---
summary: "Complete agent guide for browser automation using playwright-cli"
read_when:
  - You are an AI agent needing to use browser automation
  - You want to understand how to use browser-cli effectively
  - You need to perform web automation tasks
title: "Browser Agent Guide (playwright-cli)"
---

# Browser Automation Guide for Agents

This guide explains how to use **playwright-cli** for browser automation as an OpenClaw agent.

## Why playwright-cli?

**Token-efficient.** Unlike CDP or MCP approaches that dump large accessibility trees into context, playwright-cli uses concise commands and element refs (like `e12`). This leaves more tokens for reasoning, code, and task execution.

**Session-based.** Each task gets isolated browser sessions with automatic profile management.

**No browser downloads.** Uses your system's existing Chrome/Edge/Chromium.

## Quick Start

### 1. Check Installation

```bash
playwright-cli --version
```

If not installed, the system will report it. The user should run:

```bash
npm install -g @playwright/cli
```

### 2. Basic Workflow

Every browser automation follows this pattern:

```bash
# 1. Open browser (creates session)
playwright-cli open https://example.com

# 2. Get snapshot to see available elements
playwright-cli snapshot

# 3. Interact using element refs (e12, e13, etc.)
playwright-cli click e12
playwright-cli type "hello world"
playwright-cli press Enter

# 4. Take screenshot for verification
playwright-cli screenshot

# 5. Close when done
playwright-cli close
```

## Understanding Snapshots

Snapshots are the key to browser automation. They show you:

- Current page URL and title
- Interactive elements with refs like `[ref=e12]`
- Form fields, buttons, links, etc.

**Example snapshot output:**

```
### Page
- Page URL: https://example.com/
- Page Title: Example Domain
### Snapshot
- link 'More information' [ref=e1]
- button 'Submit' [ref=e2]
- textbox 'Search' [ref=e3]
```

**How to use refs:**

- `e1`, `e2`, `e3` — numeric element references
- Use them directly in commands: `click e2`, `fill e3 "text"`
- Refs are **NOT stable across page navigations** — always get a fresh snapshot after navigating

## Complete Command Reference

### Opening & Closing

```bash
# Open browser (headless by default)
playwright-cli open https://example.com

# Open with visible browser window
playwright-cli open https://example.com --headed

# Use specific session name (isolated profile)
playwright-cli -s=my-task open https://example.com --persistent

# Close browser
playwright-cli close

# Force kill all browsers
playwright-cli kill-all
```

### Navigation

```bash
playwright-cli goto https://example.com
playwright-cli go-back
playwright-cli go-forward
playwright-cli reload
```

### Getting Page State

```bash
# Get element refs and page structure
playwright-cli snapshot

# Save snapshot to file
playwright-cli snapshot --filename=snapshot.yml

# List all tabs
playwright-cli tab-list

# Create new tab
playwright-cli tab-new https://example.com

# Switch tabs
playwright-cli tab-select 1
```

### Clicking & Interacting

```bash
# Click element by ref
playwright-cli click e12

# Right-click
playwright-cli click e12 right

# Double-click
playwright-cli dblclick e12

# Hover over element
playwright-cli hover e12

# Drag and drop
playwright-cli drag e12 e15
```

### Typing & Forms

```bash
# Type into focused element
playwright-cli type "hello world"

# Fill specific field
playwright-cli fill e12 "username"

# Press specific key
playwright-cli press Enter
playwright-cli press Tab
playwright-cli press arrowdown

# Check/uncheck checkbox
playwright-cli check e5
playwright-cli uncheck e5

# Select dropdown option
playwright-cli select e8 "Option Text"

# Upload file
playwright-cli upload /path/to/file.pdf
```

### Screenshots & PDFs

```bash
# Screenshot of current page
playwright-cli screenshot

# Screenshot specific element
playwright-cli screenshot e12

# Save with specific filename
playwright-cli screenshot --filename=page.png

# Save as PDF
playwright-cli pdf --filename=page.pdf
```

### JavaScript Evaluation

```bash
# Evaluate expression
playwright-cli eval "document.title"

# Evaluate on specific element
playwright-cli eval "el.textContent" e12

# Check if element exists
playwright-cli eval "!!document.querySelector('#submit')"
```

### Waiting

```bash
# Wait for specific time
playwright-cli eval "await new Promise(r => setTimeout(r, 2000))"
```

### Cookies & Storage

```bash
# List cookies
playwright-cli cookie-list

# Get specific cookie
playwright-cli cookie-get session_id

# Set cookie
playwright-cli cookie-set session_id abc123

# Clear cookies
playwright-cli cookie-clear

# LocalStorage
playwright-cli localstorage-list
playwright-cli localstorage-get theme
playwright-cli localstorage-set theme dark

# SessionStorage
playwright-cli sessionstorage-list
```

### Console & Network

```bash
# View console messages
playwright-cli console

# View network requests
playwright-cli network
```

## Session Management Best Practices

### Isolation Between Tasks

Use named sessions to isolate different tasks:

```bash
# Task 1: Login flow
playwright-cli -s=login-flow open https://app.example.com --persistent
playwright-cli -s=login-flow fill e1 "user@example.com"
playwright-cli -s=login-flow fill e2 "password"
playwright-cli -s=login-flow click e3
# Session preserves login state

# Task 2: Different site (completely isolated)
playwright-cli -s=scraper open https://other-site.com
```

### Cleaning Up

```bash
# List active sessions
playwright-cli list

# Close specific session
playwright-cli -s=my-session close

# Delete session data
playwright-cli -s=my-session delete-data

# Kill all browsers (emergency)
playwright-cli kill-all
```

## Common Task Patterns

### Pattern 1: Login and Navigate

```bash
# 1. Open login page
playwright-cli open https://app.example.com/login

# 2. Get snapshot to find form fields
playwright-cli snapshot

# 3. Fill credentials (use refs from snapshot)
playwright-cli fill e2 "user@example.com"
playwright-cli fill e3 "password"

# 4. Click login
playwright-cli click e4

# 5. Wait for navigation
playwright-cli snapshot

# 6. Verify logged in
playwright-cli eval "document.body.innerText.includes('Dashboard')"
```

### Pattern 2: Form Submission

```bash
playwright-cli open https://example.com/form
playwright-cli snapshot

# Fill multiple fields
playwright-cli fill e1 "John Doe"
playwright-cli fill e2 "john@example.com"
playwright-cli select e3 "United States"
playwright-cli check e4  # agree to terms

# Submit
playwright-cli click e5

# Verify success
playwright-cli snapshot
```

### Pattern 3: Data Extraction

```bash
playwright-cli open https://example.com/products

# Get page with element refs
playwright-cli snapshot

# Extract specific data using JavaScript
playwright-cli eval "Array.from(document.querySelectorAll('.price')).map(el => el.textContent)"

# Or extract from specific element
playwright-cli eval "el.textContent" e12
```

### Pattern 4: Screenshot Verification

```bash
playwright-cli open https://example.com
playwright-cli click e5
playwright-cli screenshot --filename=after-click.png
```

## Working with OpenClaw Tasks

When running as an OpenClaw agent, use task descriptions:

### Task Type: `web`

```
Navigate to https://example.com, click on the "Get Started" button,
and verify the page shows "Welcome".
```

### Task Type: `research`

```
Search for "OpenClaw documentation" on Google.
Find the official docs link and navigate to it.
Extract the main features list.
```

### Task Type: `test:e2e`

```
Test the login flow on https://app.example.com:
1. Navigate to login page
2. Fill username: test@example.com
3. Fill password: testpass
4. Click login
5. Verify redirect to dashboard
6. Take screenshot
```

## Tips for Success

### 1. Always Snapshot First

Before interacting, get a snapshot to see current page state:

```bash
playwright-cli snapshot
```

### 2. Refs Change After Navigation

After clicking a link or submitting a form, **always get a new snapshot**:

```bash
playwright-cli click e5  # navigates to new page
playwright-cli snapshot  # get new refs for new page
```

### 3. Use --headed for Debugging

If automation isn't working, run with `--headed` to see what's happening:

```bash
playwright-cli open https://example.com --headed
```

### 4. Check Console for Errors

```bash
playwright-cli console
```

### 5. Persistent Sessions for Multi-Step Flows

Use `--persistent` and named sessions for workflows that need state:

```bash
playwright-cli -s=workflow open https://example.com --persistent
# ... multiple commands ...
playwright-cli -s=workflow close
```

## Troubleshooting

### "Element not found"

- Get a fresh snapshot — the page may have changed
- Check if you're using the correct session (`-s=`)

### "Browser not started"

- Run `playwright-cli open` first to create a session
- Or the browser closed due to inactivity

### Timeouts

- Some pages take time to load — add waits between actions
- Use `--headed` to see if page is loading correctly

### Session Conflicts

- Each `-s=` session is isolated
- Run `playwright-cli list` to see active sessions
- Run `playwright-cli kill-all` to clean up stuck sessions

## Environment Variables

```bash
# Set default session name
PLAYWRIGHT_CLI_SESSION=my-task playwright-cli open https://example.com
```

## Monitoring with Dashboard

View all active sessions visually:

```bash
playwright-cli show
```

This opens a window showing:

- All running sessions
- Live screencasts
- Remote control capability

## Integration with OpenClaw

The `browser-cli` module provides programmatic access:

```typescript
import { BrowserClient } from "openclaw/browser-cli";

const client = new BrowserClient({ agentId: "my-agent" });
await client.start();
await client.navigate("https://example.com");
const snapshot = await client.snapshot();
await client.click("e12");
await client.stop();
```

For task automation:

```typescript
import { createBrowserTaskExecutor } from "openclaw/browser-cli";

const executor = createBrowserTaskExecutor({
  agentId: "my-agent",
  dataDir: "~/.openclaw",
  headless: true,
});
```

---

**Remember:** The key to successful browser automation is:

1. Open → 2. Snapshot → 3. Act using refs → 4. Verify → 5. Close
