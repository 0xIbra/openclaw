# Browser Automation with playwright-cli

Use this skill when you need to perform browser automation tasks - navigating websites, filling forms, clicking elements, taking screenshots, or extracting data from web pages.

## When to Use

- Navigating to URLs and interacting with web pages
- Filling forms and submitting data
- Clicking buttons, links, or other interactive elements
- Taking screenshots of web pages
- Extracting data from websites
- Testing web applications
- Performing research that requires web browsing

## Prerequisites

Ensure playwright-cli is available:

```bash
playwright-cli --version
```

If not available, inform the user to install it:

```bash
npm install -g @playwright/cli
```

## Core Workflow

Every browser automation follows this 5-step pattern:

```bash
# 1. OPEN - Start browser and navigate
playwright-cli open https://example.com

# 2. SNAPSHOT - Get element references
playwright-cli snapshot

# 3. ACT - Interact using element refs (e12, e3, etc.)
playwright-cli click e12
playwright-cli fill e3 "text"
playwright-cli press Enter

# 4. VERIFY - Screenshot or check result
playwright-cli screenshot

# 5. CLOSE - Clean up
playwright-cli close
```

## Understanding Element References

After `snapshot`, elements are labeled with refs like `[ref=e12]`:

```
### Snapshot
- link 'About' [ref=e1]
- button 'Submit' [ref=e2]
- textbox 'Name' [ref=e3]
```

Use these refs in commands: `click e2`, `fill e3 "value"`

**Critical:** Refs change after page navigation. Always get a fresh snapshot after:

- Clicking links
- Submitting forms
- Any action that changes the page

## Essential Commands

### Navigation

- `playwright-cli open <url>` - Open browser and navigate
- `playwright-cli goto <url>` - Navigate to URL
- `playwright-cli reload` - Reload page
- `playwright-cli go-back` / `go-forward` - Browser history

### Inspection

- `playwright-cli snapshot` - Get element refs and page structure
- `playwright-cli tab-list` - List browser tabs
- `playwright-cli console` - View console messages
- `playwright-cli network` - View network requests

### Interaction

- `playwright-cli click <ref>` - Click element
- `playwright-cli fill <ref> <text>` - Fill input field
- `playwright-cli type <text>` - Type into focused element
- `playwright-cli press <key>` - Press key (Enter, Tab, arrowdown, etc.)
- `playwright-cli check <ref>` / `uncheck <ref>` - Toggle checkbox
- `playwright-cli select <ref> <value>` - Select dropdown option
- `playwright-cli hover <ref>` - Hover over element

### Output

- `playwright-cli screenshot` - Screenshot of page
- `playwright-cli screenshot <ref>` - Screenshot of element
- `playwright-cli pdf` - Save page as PDF
- `playwright-cli eval "<js>"` - Execute JavaScript

### Sessions

- `playwright-cli -s=<name> <cmd>` - Run command in named session
- `playwright-cli list` - List active sessions
- `playwright-cli close` - Close current session
- `playwright-cli kill-all` - Force close all sessions

## Named Sessions for Isolation

Use `-s=<name>` to isolate different tasks:

```bash
# Task 1: Login to app
playwright-cli -s=login open https://app.com --persistent
playwright-cli -s=login fill e1 "user"
playwright-cli -s=login fill e2 "pass"
playwright-cli -s=login click e3

# Task 2: Scrape different site (isolated)
playwright-cli -s=scraper open https://othersite.com
```

## Common Patterns

### Login Flow

```bash
playwright-cli open https://app.com/login
playwright-cli snapshot                    # Get form field refs
playwright-cli fill e1 "username"
playwright-cli fill e2 "password"
playwright-cli click e3                    # Submit
playwright-cli snapshot                    # Get refs for logged-in page
playwright-cli screenshot
```

### Form Submission

```bash
playwright-cli open https://example.com/form
playwright-cli snapshot
playwright-cli fill e1 "John Doe"
playwright-cli fill e2 "john@example.com"
playwright-cli check e3                    # Agree to terms
playwright-cli click e4                    # Submit
playwright-cli snapshot                    # Verify success message
```

### Data Extraction

```bash
playwright-cli open https://example.com/products
playwright-cli snapshot
playwright-cli eval "Array.from(document.querySelectorAll('.price')).map(el => el.textContent)"
```

### Multi-Step Workflow with State

```bash
# Use --persistent to save cookies/session
playwright-cli -s=workflow open https://app.com --persistent

# Step 1: Login
playwright-cli -s=workflow fill e1 "user"
playwright-cli -s=workflow fill e2 "pass"
playwright-cli -s=workflow click e3

# Step 2: Navigate and perform action
playwright-cli -s=workflow goto https://app.com/dashboard
playwright-cli -s=workflow snapshot
playwright-cli -s=workflow click e5

# Step 3: Verify
playwright-cli -s=workflow screenshot
playwright-cli -s=workflow close
```

## Tips

1. **Always snapshot first** - Get element refs before interacting
2. **Snapshot after navigation** - Refs change when page changes
3. **Use --headed when debugging** - See the browser window
4. **Check console for errors** - `playwright-cli console`
5. **Use named sessions** - Prevents conflicts between tasks
6. **Clean up sessions** - Close or kill-all when done

## Error Handling

If an element interaction fails:

1. Get fresh snapshot: `playwright-cli snapshot`
2. Check element still exists
3. Use updated refs
4. If stuck: `playwright-cli kill-all` and restart

## Integration with OpenClaw Tasks

When creating OpenClaw tasks with browser automation:

```typescript
// Task description format
const task = {
  type: "web", // or "research", "test:e2e"
  description: `
    https://example.com
    click e2
    fill e3 "search query"
    press Enter
    screenshot
  `,
};
```

Or use programmatic API:

```typescript
import { BrowserClient } from "openclaw/browser-cli";

const client = new BrowserClient({ agentId: "my-agent" });
await client.start();
await client.navigate("https://example.com");
await client.click("e12");
await client.stop();
```
