# DEPRECATED: CDP-Based Browser Infrastructure

**Status:** Deprecated - Use `src/browser-cli/` instead

**Migration Path:**

- For task automation: Use `createBrowserTaskExecutor()` from `src/browser-cli/`
- For CLI usage: Use `playwright-cli` directly
- For programmatic control: Use `BrowserClient` from `src/browser-cli/client.js`

## Why Deprecated?

The old CDP-based browser infrastructure was:

- Complex (WebSocket/CDP protocol handling)
- Required manual browser lifecycle management
- Token-heavy for AI interactions
- Had port conflicts and auth complexity

## New Approach: playwright-cli

The new system uses `@playwright/cli`:

- Simple CLI commands
- Token-efficient (uses element refs)
- Automatic session/profile isolation
- No browser downloads needed

## Timeline

- **Now:** Old system still works but is deprecated
- **Next release:** Old system removed from default exports
- **Future:** Directory deleted (after full migration)

## Files to be Removed

All 101 files in `src/browser/` will eventually be deleted:

- CDP client (`cdp.ts`, `client.ts`)
- Chrome management (`chrome.ts`)
- Control service (`control-service.ts`, `server.ts`)
- HTTP bridge (`bridge-server.ts`)
- Profiles/config (`config.ts`, `profiles.ts`)
- Playwright wrappers (`pw-*.ts`)

## Migration Guide

### Before (CDP):

```typescript
import { createBrowserControlContext } from "./browser/control-service.js";
const ctx = createBrowserControlContext();
await ctx.ensureBrowserAvailable();
const tab = await ctx.openTab("https://example.com");
```

### After (playwright-cli):

```typescript
import { BrowserClient } from "./browser-cli/client.js";
const client = new BrowserClient({ agentId: "my-agent" });
await client.start();
await client.navigate("https://example.com");
await client.stop();
```

Or for tasks:

```typescript
import { createBrowserTaskExecutor } from "./browser-cli/task-executor.js";
const executor = createBrowserTaskExecutor({ agentId: "my-agent", dataDir });
```
