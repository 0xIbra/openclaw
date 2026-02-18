import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSecretAuditLogger } from "./audit.js";
import { openSecretsDatabase, initializeSecretsSchema } from "./sqlite.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-secrets-audit-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("SecretAuditLogger", () => {
  it("logs and queries audit events", async () => {
    const dir = await makeTempDir();
    const dbPath = path.join(dir, "secrets.sqlite");
    const db = openSecretsDatabase({ dbPath });
    initializeSecretsSchema(db);
    const audit = createSecretAuditLogger({ db });

    audit.log({ secretName: "API_KEY", agentId: "zed", action: "scrubbed", context: "prompt" });
    audit.log({
      secretName: "DB_PASS",
      agentId: "zed",
      taskId: "task-1",
      action: "injected",
      context: "env",
    });
    audit.log({ secretName: "API_KEY", agentId: "worker-1", action: "blocked", context: "file" });

    const allLogs = audit.query();
    expect(allLogs).toHaveLength(3);

    // All entries present (order within the same ms is non-deterministic)
    const names = allLogs.map((l) => l.secretName);
    expect(names).toContain("API_KEY");
    expect(names).toContain("DB_PASS");

    const actions = allLogs.map((l) => l.action);
    expect(actions).toContain("scrubbed");
    expect(actions).toContain("injected");
    expect(actions).toContain("blocked");

    db.close();
  });

  it("filters by agentId", async () => {
    const dir = await makeTempDir();
    const dbPath = path.join(dir, "secrets.sqlite");
    const db = openSecretsDatabase({ dbPath });
    initializeSecretsSchema(db);
    const audit = createSecretAuditLogger({ db });

    audit.log({ secretName: "S1", agentId: "zed", action: "scrubbed", context: "prompt" });
    audit.log({ secretName: "S2", agentId: "worker-1", action: "injected", context: "env" });
    audit.log({ secretName: "S3", agentId: "zed", action: "detected", context: "terminal" });

    const zedLogs = audit.query({ agentId: "zed" });
    expect(zedLogs).toHaveLength(2);
    expect(zedLogs.every((l) => l.agentId === "zed")).toBe(true);

    db.close();
  });

  it("filters by action", async () => {
    const dir = await makeTempDir();
    const dbPath = path.join(dir, "secrets.sqlite");
    const db = openSecretsDatabase({ dbPath });
    initializeSecretsSchema(db);
    const audit = createSecretAuditLogger({ db });

    audit.log({ secretName: "S1", agentId: "a", action: "scrubbed", context: "prompt" });
    audit.log({ secretName: "S2", agentId: "b", action: "injected", context: "env" });
    audit.log({ secretName: "S3", agentId: "c", action: "scrubbed", context: "memory" });

    const scrubbed = audit.query({ action: "scrubbed" });
    expect(scrubbed).toHaveLength(2);
    expect(scrubbed.every((l) => l.action === "scrubbed")).toBe(true);

    db.close();
  });

  it("respects limit parameter", async () => {
    const dir = await makeTempDir();
    const dbPath = path.join(dir, "secrets.sqlite");
    const db = openSecretsDatabase({ dbPath });
    initializeSecretsSchema(db);
    const audit = createSecretAuditLogger({ db });

    for (let i = 0; i < 10; i++) {
      audit.log({ secretName: `S${i}`, agentId: "a", action: "scrubbed", context: "prompt" });
    }

    const limited = audit.query({ limit: 3 });
    expect(limited).toHaveLength(3);

    db.close();
  });

  it("handles null agentId and taskId", async () => {
    const dir = await makeTempDir();
    const dbPath = path.join(dir, "secrets.sqlite");
    const db = openSecretsDatabase({ dbPath });
    initializeSecretsSchema(db);
    const audit = createSecretAuditLogger({ db });

    const entry = audit.log({ secretName: "S1", action: "detected", context: "browser" });
    expect(entry.agentId).toBeNull();
    expect(entry.taskId).toBeNull();
    expect(entry.action).toBe("detected");
    expect(entry.context).toBe("browser");

    db.close();
  });
});
