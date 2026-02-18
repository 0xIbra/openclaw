#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const uiDir = path.join(repoRoot, "ui");
const controlUiDistDir = path.join(repoRoot, "dist", "control-ui");
const controlUiIndexPath = path.join(controlUiDistDir, "index.html");

function writeControlUiFallback() {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>OpenClaw Control UI</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b1220;
        color: #e5e7eb;
      }
      main {
        max-width: 680px;
        padding: 24px;
        border: 1px solid #334155;
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.88);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 1.25rem;
      }
      p {
        margin: 8px 0;
        line-height: 1.5;
      }
      code {
        background: rgba(148, 163, 184, 0.2);
        padding: 2px 6px;
        border-radius: 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Control UI unavailable in stripped build</h1>
      <p>The standalone web UI source directory was removed from this checkout.</p>
      <p>Gateway APIs are still available. If you need the full web UI, restore <code>/ui</code> and run <code>pnpm ui:build</code>.</p>
    </main>
  </body>
</html>
`;
  fs.mkdirSync(controlUiDistDir, { recursive: true });
  fs.writeFileSync(controlUiIndexPath, html, "utf8");
}

function usage() {
  // keep this tiny; it's invoked from npm scripts too
  process.stderr.write("Usage: node scripts/ui.js <install|dev|build|test> [...args]\n");
}

function which(cmd) {
  try {
    const key = process.platform === "win32" ? "Path" : "PATH";
    const paths = (process.env[key] ?? process.env.PATH ?? "")
      .split(path.delimiter)
      .filter(Boolean);
    const extensions =
      process.platform === "win32"
        ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
        : [""];
    for (const entry of paths) {
      for (const ext of extensions) {
        const candidate = path.join(entry, process.platform === "win32" ? `${cmd}${ext}` : cmd);
        try {
          if (fs.existsSync(candidate)) {
            return candidate;
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function resolveRunner() {
  const pnpm = which("pnpm");
  if (pnpm) {
    return { cmd: pnpm, kind: "pnpm" };
  }
  return null;
}

function run(cmd, args) {
  const child = spawn(cmd, args, {
    cwd: uiDir,
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
}

function runSync(cmd, args, envOverride) {
  const result = spawnSync(cmd, args, {
    cwd: uiDir,
    stdio: "inherit",
    env: envOverride ?? process.env,
  });
  if (result.signal) {
    process.exit(1);
  }
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function depsInstalled(kind) {
  try {
    const require = createRequire(path.join(uiDir, "package.json"));
    require.resolve("vite");
    require.resolve("dompurify");
    if (kind === "test") {
      require.resolve("vitest");
      require.resolve("@vitest/browser-playwright");
      require.resolve("playwright");
    }
    return true;
  } catch {
    return false;
  }
}

const [, , action, ...rest] = process.argv;
if (!action) {
  usage();
  process.exit(2);
}

const runner = resolveRunner();
if (!runner) {
  process.stderr.write("Missing UI runner: install pnpm, then retry.\n");
  process.exit(1);
}

const script =
  action === "install"
    ? null
    : action === "dev"
      ? "dev"
      : action === "build"
        ? "build"
        : action === "test"
          ? "test"
          : null;

if (action !== "install" && !script) {
  usage();
  process.exit(2);
}

if (action === "install") {
  if (!fs.existsSync(uiDir)) {
    process.stderr.write("UI source directory not found; skipping UI install.\n");
    process.exit(0);
  }
  run(runner.cmd, ["install", ...rest]);
} else {
  if (!fs.existsSync(uiDir)) {
    if (action === "build") {
      writeControlUiFallback();
      process.stderr.write(
        `UI source directory not found; wrote fallback Control UI page to ${controlUiIndexPath}.\n`,
      );
      process.exit(0);
    }
    process.stderr.write(
      "UI source directory not found; this command is unavailable in stripped mode.\n",
    );
    process.exit(1);
  }
  if (!depsInstalled(action === "test" ? "test" : "build")) {
    const installEnv = process.env;
    const installArgs = action === "build" ? ["install", "--force"] : ["install"];
    runSync(runner.cmd, installArgs, installEnv);
  }
  run(runner.cmd, ["run", script, ...rest]);
}
