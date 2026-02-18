#!/usr/bin/env node

import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import module from "node:module";

// https://nodejs.org/api/module.html#module-compile-cache
if (module.enableCompileCache && !process.env.NODE_DISABLE_COMPILE_CACHE) {
  try {
    module.enableCompileCache();
  } catch {
    // Ignore errors
  }
}

const isModuleNotFoundError = (err) =>
  err && typeof err === "object" && "code" in err && err.code === "ERR_MODULE_NOT_FOUND";

const installProcessWarningFilter = async () => {
  // Keep bootstrap warnings consistent with the TypeScript runtime.
  for (const specifier of ["./dist/warning-filter.js", "./dist/warning-filter.mjs"]) {
    try {
      const mod = await import(specifier);
      if (typeof mod.installProcessWarningFilter === "function") {
        mod.installProcessWarningFilter();
        return;
      }
    } catch (err) {
      if (isModuleNotFoundError(err)) {
        continue;
      }
      throw err;
    }
  }
};

await installProcessWarningFilter();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isWatchProcess =
  process.env.OPENCLAW_WATCH_MODE === "1" || process.execArgv.includes("--watch");

const fileExists = async (path) => {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const waitForEntryBuildOutputIfWatchMode = async () => {
  if (!isWatchProcess) {
    return;
  }
  const deadlineMs = Date.now() + 120_000;
  while (Date.now() < deadlineMs) {
    if ((await fileExists("./dist/entry.js")) || (await fileExists("./dist/entry.mjs"))) {
      return;
    }
    await sleep(50);
  }
};

const tryImport = async (specifier) => {
  try {
    await import(specifier);
    return true;
  } catch (err) {
    // Only swallow missing-module errors; rethrow real runtime errors.
    if (isModuleNotFoundError(err)) {
      return false;
    }
    throw err;
  }
};

await waitForEntryBuildOutputIfWatchMode();

if (await tryImport("./dist/entry.js")) {
  // OK
} else if (await tryImport("./dist/entry.mjs")) {
  // OK
} else {
  throw new Error("openclaw: missing dist/entry.(m)js (build output).");
}
