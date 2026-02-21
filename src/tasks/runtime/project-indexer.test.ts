import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import type { ProjectRecord } from "../types.js";
import { indexProjectIntoMemory } from "./project-indexer.js";

// Mock writeLayeredMemoryEntry to capture calls
const writtenEntries: Array<{ summary: string; eventType: string; metadata: unknown }> = [];
vi.mock("../../memory/layered-writeback.js", () => ({
  writeLayeredMemoryEntry: async (params: {
    entry: { summary: string; eventType: string; metadata: unknown };
  }) => {
    writtenEntries.push({
      summary: params.entry.summary,
      eventType: params.entry.eventType,
      metadata: params.entry.metadata,
    });
    return ["/mock/written"];
  },
}));

function makeProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: "proj-1",
    name: "test-project",
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    archivedAtMs: null,
    ...overrides,
  };
}

const tempDirs: string[] = [];

async function createTempRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-indexer-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  writtenEntries.length = 0;
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  tempDirs.length = 0;
});

const mockCfg = {} as OpenClawConfig;

describe("indexProjectIntoMemory", () => {
  it("returns early when repoRoot is not set", async () => {
    const result = await indexProjectIntoMemory(mockCfg, makeProject({ repoRoot: undefined }));
    expect(result.entriesWritten).toBe(0);
    expect(result.errors).toContain("no repoRoot set");
    expect(writtenEntries).toHaveLength(0);
  });

  it("indexes README.md when present", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(path.join(repoRoot, "README.md"), "# Hello World\nSome content.");
    const result = await indexProjectIntoMemory(mockCfg, makeProject({ repoRoot }));
    expect(result.entriesWritten).toBeGreaterThanOrEqual(1);
    const readmeEntry = writtenEntries.find((e) => e.summary.includes("README"));
    expect(readmeEntry).toBeDefined();
    expect(readmeEntry!.summary).toContain("Hello World");
    expect(readmeEntry!.eventType).toBe("project:indexed");
  });

  it("indexes package.json scripts and dependencies", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({
        name: "my-app",
        scripts: { build: "tsc", test: "vitest" },
        dependencies: { express: "^4.0.0" },
        devDependencies: { vitest: "^1.0.0" },
      }),
    );
    const result = await indexProjectIntoMemory(mockCfg, makeProject({ repoRoot }));
    expect(result.entriesWritten).toBeGreaterThanOrEqual(1);
    const pkgEntry = writtenEntries.find((e) => e.summary.includes("package.json"));
    expect(pkgEntry).toBeDefined();
    expect(pkgEntry!.summary).toContain("my-app");
    expect(pkgEntry!.summary).toContain("tsc");
    expect(pkgEntry!.summary).toContain("express");
    expect(pkgEntry!.summary).toContain("vitest");
  });

  it("indexes directory tree", async () => {
    const repoRoot = await createTempRepo();
    await fs.mkdir(path.join(repoRoot, "src"), { recursive: true });
    await fs.writeFile(path.join(repoRoot, "src", "index.ts"), "export {};");
    const result = await indexProjectIntoMemory(mockCfg, makeProject({ repoRoot }));
    const treeEntry = writtenEntries.find((e) => e.summary.includes("Directory structure"));
    expect(treeEntry).toBeDefined();
    expect(treeEntry!.summary).toContain("index.ts");
    expect(result.errors).toHaveLength(0);
  });

  it("indexes .env.example when present", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(path.join(repoRoot, ".env.example"), "DATABASE_URL=postgres://localhost");
    const result = await indexProjectIntoMemory(mockCfg, makeProject({ repoRoot }));
    const envEntry = writtenEntries.find((e) => e.summary.includes("DATABASE_URL"));
    expect(envEntry).toBeDefined();
    expect(envEntry!.summary).toContain(".env.example");
    expect(result.entriesWritten).toBeGreaterThanOrEqual(1);
  });

  it("handles empty repo gracefully", async () => {
    const repoRoot = await createTempRepo();
    const result = await indexProjectIntoMemory(mockCfg, makeProject({ repoRoot }));
    // Should still produce at least the directory tree entry (with the temp dir itself)
    expect(result.errors).toHaveLength(0);
  });

  it("all entries use project:indexed eventType", async () => {
    const repoRoot = await createTempRepo();
    await fs.writeFile(path.join(repoRoot, "README.md"), "# Test");
    await fs.writeFile(
      path.join(repoRoot, "package.json"),
      JSON.stringify({ name: "test", scripts: {} }),
    );
    await indexProjectIntoMemory(mockCfg, makeProject({ repoRoot }));
    for (const entry of writtenEntries) {
      expect(entry.eventType).toBe("project:indexed");
    }
  });
});
