import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createSecretAuditLogger } from "./audit.js";
import { createSecretScrubber } from "./scrubber.js";
import { createSecretVault } from "./vault.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-secrets-scrub-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

function setup() {
  return makeTempDir().then((dir) => {
    const vault = createSecretVault({ dbPath: path.join(dir, "secrets.sqlite") });
    const scrubber = createSecretScrubber(vault);
    return { vault, scrubber };
  });
}

describe("SecretScrubber", () => {
  it("scrubs registered secrets from text", async () => {
    const { vault, scrubber } = await setup();

    vault.register({
      name: "MY_TOKEN",
      pattern: { kind: "exact", label: "My Token", value: "tok_secret_12345" },
      value: "tok_secret_12345",
      source: "manual",
    });

    const result = scrubber.scrub("Connect using tok_secret_12345 as auth token");
    expect(result.scrubbed).toBe("Connect using [REDACTED: MY_TOKEN] as auth token");
    expect(result.redactions).toHaveLength(1);
    expect(result.redactions[0].secretName).toBe("MY_TOKEN");

    vault.close();
  });

  it("scrubs multiple different secrets", async () => {
    const { vault, scrubber } = await setup();

    vault.register({
      name: "API_KEY",
      pattern: { kind: "exact", label: "API Key", value: "key-abc123" },
      value: "key-abc123",
      source: "manual",
    });
    vault.register({
      name: "DB_PASS",
      pattern: { kind: "exact", label: "DB Password", value: "hunter2" },
      value: "hunter2",
      source: "manual",
    });

    const result = scrubber.scrub("Use key-abc123 with password hunter2");
    expect(result.scrubbed).toBe("Use [REDACTED: API_KEY] with password [REDACTED: DB_PASS]");
    expect(result.redactions).toHaveLength(2);

    vault.close();
  });

  it("scrubs multiple occurrences of the same secret", async () => {
    const { vault, scrubber } = await setup();

    vault.register({
      name: "REPEATED",
      pattern: { kind: "exact", label: "Repeated", value: "secret123" },
      value: "secret123",
      source: "manual",
    });

    const result = scrubber.scrub("first=secret123, second=secret123");
    expect(result.scrubbed).toBe("first=[REDACTED: REPEATED], second=[REDACTED: REPEATED]");
    expect(result.redactions).toHaveLength(2);

    vault.close();
  });

  it("detects unregistered prefix patterns (defense in depth)", async () => {
    const { vault, scrubber } = await setup();

    // Don't register anything — the scrubber should still catch known prefixes
    const text = "My key is sk-proj-abc123456789xyz000111222333";
    const result = scrubber.scrub(text);
    expect(result.scrubbed).not.toContain("sk-proj-");
    expect(result.scrubbed).toContain("[REDACTED:");

    vault.close();
  });

  it("detects private key blocks", async () => {
    const { vault, scrubber } = await setup();

    const text =
      "Here is my key:\n-----BEGIN RSA PRIVATE KEY-----\nsome data\n-----END RSA PRIVATE KEY-----";
    const result = scrubber.scrub(text);
    expect(result.scrubbed).toContain("[REDACTED: Private Key Block]");

    vault.close();
  });

  it("contains() returns true when secrets are present", async () => {
    const { vault, scrubber } = await setup();

    vault.register({
      name: "CHECK_SECRET",
      pattern: { kind: "exact", label: "Check", value: "super_secret_value" },
      value: "super_secret_value",
      source: "manual",
    });

    expect(scrubber.contains("No secrets here")).toBe(false);
    expect(scrubber.contains("Has super_secret_value in it")).toBe(true);

    vault.close();
  });

  it("contains() catches unregistered prefix patterns", async () => {
    const { vault, scrubber } = await setup();

    expect(scrubber.contains("Token: ghp_abc123456789abc123456789abc12345678")).toBe(true);
    expect(scrubber.contains("Token: notaprefix_abc")).toBe(false);

    vault.close();
  });

  it("classify() returns correct classification", async () => {
    const { vault, scrubber } = await setup();

    vault.register({
      name: "SECRET",
      pattern: { kind: "exact", label: "Secret", value: "classified_data" },
      value: "classified_data",
      source: "manual",
    });

    expect(scrubber.classify("safe text")).toBe("SAFE");
    expect(scrubber.classify("has classified_data in it")).toBe("NEVER_SEND");
    expect(scrubber.classify("")).toBe("SAFE");

    vault.close();
  });

  it("handles empty and null-ish inputs gracefully", async () => {
    const { vault, scrubber } = await setup();

    expect(scrubber.scrub("")).toEqual({ scrubbed: "", redactions: [] });
    expect(scrubber.contains("")).toBe(false);
    expect(scrubber.classify("")).toBe("SAFE");

    vault.close();
  });

  it("writes scrubbed and detected audit events when audit logger is configured", async () => {
    const dir = await makeTempDir();
    const dbPath = path.join(dir, "secrets.sqlite");
    const vault = createSecretVault({ dbPath });
    const audit = createSecretAuditLogger({ dbPath });
    const scrubber = createSecretScrubber(vault, {
      audit,
      context: "terminal",
      agentId: "agent-1",
      taskId: "task-123",
    });

    vault.register({
      name: "AUDIT_SECRET",
      pattern: { kind: "exact", label: "Audit Secret", value: "audit-secret-value" },
      value: "audit-secret-value",
      source: "manual",
    });

    scrubber.scrub("token=audit-secret-value");
    scrubber.contains("token=audit-secret-value");

    const scrubbedLogs = audit.query({ action: "scrubbed" });
    const detectedLogs = audit.query({ action: "detected" });
    expect(scrubbedLogs.some((entry) => entry.secretName === "AUDIT_SECRET")).toBe(true);
    expect(detectedLogs.some((entry) => entry.secretName === "AUDIT_SECRET")).toBe(true);
    expect(scrubbedLogs.some((entry) => entry.context === "terminal")).toBe(true);

    audit.close();
    vault.close();
  });
});
