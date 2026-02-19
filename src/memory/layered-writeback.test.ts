import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getLayeredMemoryWritebackMetrics, writeLayeredMemoryEntry } from "./layered-writeback.js";

describe("layered writeback", () => {
  let tmpDir: string | null = null;

  afterEach(async () => {
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it("writes structured entries across agent/project/team scopes", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-layered-memory-"));
    const before = getLayeredMemoryWritebackMetrics();
    const paths = await writeLayeredMemoryEntry({
      cfg: {
        memory: {
          layered: {
            storage: {
              root: tmpDir,
            },
          },
        },
      } as never,
      scopeRef: {
        agentId: "ares",
        projectId: "project-a",
        teamId: "team-a",
      },
      entry: {
        eventType: "attempt:finished",
        taskId: "task-1",
        attemptId: "attempt-1",
        summary: "Completed implementation and tests",
        changedFiles: ["src/a.ts", "src/b.ts"],
      },
    });

    expect(paths).toHaveLength(3);
    const after = getLayeredMemoryWritebackMetrics();
    expect(after.events).toBe(before.events + 1);
    expect(after.writes).toBe(before.writes + 3);
    expect(after.failures).toBe(before.failures);
    for (const entryPath of paths) {
      const content = await fs.readFile(entryPath, "utf-8");
      expect(content).toContain("Layered Memory Entry");
      expect(content).toContain("task-1");
      expect(content).toContain("attempt:finished");
    }
  });
});
