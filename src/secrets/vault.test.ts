import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openSecretsDatabase, initializeSecretsSchema } from "./sqlite.js";
import { createSecretVault } from "./vault.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-secrets-vault-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("SecretVault", () => {
  it("register and list secrets", async () => {
    const dir = await makeTempDir();
    const vault = createSecretVault({ dbPath: path.join(dir, "secrets.sqlite") });

    vault.register({
      name: "MY_API_KEY",
      pattern: { kind: "exact", label: "Test Key", value: "sk-test-abc123" },
      value: "sk-test-abc123",
      source: "manual",
    });

    vault.register({
      name: "DB_PASSWORD",
      pattern: { kind: "exact", label: "DB Password", value: "hunter2" },
      value: "hunter2",
      source: "manual",
    });

    const secrets = vault.list();
    expect(secrets).toHaveLength(2);
    expect(secrets.map((s) => s.name)).toContain("MY_API_KEY");
    expect(secrets.map((s) => s.name)).toContain("DB_PASSWORD");

    vault.close();
  });

  it("getByName returns registered secret", async () => {
    const dir = await makeTempDir();
    const vault = createSecretVault({ dbPath: path.join(dir, "secrets.sqlite") });

    vault.register({
      name: "GITHUB_TOKEN",
      pattern: { kind: "exact", label: "GitHub Token", value: "ghp_abc123def456" },
      value: "ghp_abc123def456",
      source: "manual",
    });

    const entry = vault.getByName("GITHUB_TOKEN");
    expect(entry).not.toBeNull();
    expect(entry!.name).toBe("GITHUB_TOKEN");
    expect(entry!.source).toBe("manual");

    expect(vault.getByName("NONEXISTENT")).toBeNull();

    vault.close();
  });

  it("getValue returns raw value for injection", async () => {
    const dir = await makeTempDir();
    const vault = createSecretVault({ dbPath: path.join(dir, "secrets.sqlite") });

    vault.register({
      name: "OPENAI_KEY",
      pattern: { kind: "exact", label: "OpenAI Key", value: "sk-proj-abc123xyz" },
      value: "sk-proj-abc123xyz",
      source: "manual",
    });

    expect(vault.getValue("OPENAI_KEY")).toBe("sk-proj-abc123xyz");
    expect(vault.getValue("MISSING")).toBeNull();

    const row = vault.db
      .prepare("SELECT encrypted_value FROM secrets WHERE name = ?")
      .get("OPENAI_KEY") as { encrypted_value?: string | null } | undefined;
    expect(row?.encrypted_value).toBeTruthy();
    expect(row?.encrypted_value).not.toContain("sk-proj-abc123xyz");
    expect(row?.encrypted_value?.startsWith("enc:v1:")).toBe(true);

    vault.close();
  });

  it("re-registering same name replaces existing", async () => {
    const dir = await makeTempDir();
    const vault = createSecretVault({ dbPath: path.join(dir, "secrets.sqlite") });

    vault.register({
      name: "ROTATED_KEY",
      pattern: { kind: "exact", label: "Key v1", value: "old-value" },
      value: "old-value",
      source: "manual",
    });

    vault.register({
      name: "ROTATED_KEY",
      pattern: { kind: "exact", label: "Key v2", value: "new-value" },
      value: "new-value",
      source: "manual",
    });

    expect(vault.list()).toHaveLength(1);
    expect(vault.getValue("ROTATED_KEY")).toBe("new-value");

    vault.close();
  });

  it("discoverFromEnv finds secrets by env var name patterns", async () => {
    const dir = await makeTempDir();
    const vault = createSecretVault({ dbPath: path.join(dir, "secrets.sqlite") });

    const fakeEnv: Record<string, string> = {
      APP_SECRET: "my-secret-value",
      DATABASE_URL: "postgres://user:pass@localhost:5432/db",
      HOME: "/home/user",
      PATH: "/usr/bin",
      API_KEY: "key-12345-abcdef",
    };

    const discovered = vault.discoverFromEnv(fakeEnv);
    expect(discovered.length).toBeGreaterThanOrEqual(3);

    const names = discovered.map((s) => s.name);
    expect(names).toContain("APP_SECRET");
    expect(names).toContain("DATABASE_URL");
    expect(names).toContain("API_KEY");

    // HOME and PATH should NOT be discovered
    expect(names).not.toContain("HOME");
    expect(names).not.toContain("PATH");

    vault.close();
  });

  it("discoverFromDotenv parses .env files", async () => {
    const dir = await makeTempDir();
    const projectDir = path.join(dir, "project");
    await fs.mkdir(projectDir, { recursive: true });

    // Write a .env file
    await fs.writeFile(
      path.join(projectDir, ".env"),
      [
        "# Comment line",
        "APP_TOKEN=tok_abc123",
        'DATABASE_URL="postgres://user:pass@localhost/db"',
        "PLAIN_VAR=hello",
      ].join("\n"),
    );

    const vault = createSecretVault({ dbPath: path.join(dir, "secrets.sqlite") });
    const discovered = vault.discoverFromDotenv(projectDir);

    // APP_TOKEN matches _TOKEN env var pattern, DATABASE_URL matches exact env var pattern
    const names = discovered.map((s) => s.name);
    expect(names).toContain("APP_TOKEN");
    expect(names).toContain("DATABASE_URL");

    vault.close();
  });

  it("reads legacy plaintext rows for backward compatibility", async () => {
    const dir = await makeTempDir();
    const dbPath = path.join(dir, "secrets.sqlite");
    const db = openSecretsDatabase({ dbPath });
    initializeSecretsSchema(db);
    db.prepare(
      `INSERT INTO secrets (id, name, pattern_kind, pattern_label, pattern_value, encrypted_value, source, created_at_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "legacy-1",
      "LEGACY_TOKEN",
      "exact",
      "Legacy Token",
      "legacy-plain-token",
      "legacy-plain-token",
      "manual",
      Date.now(),
    );
    db.close();

    const vault = createSecretVault({ dbPath });
    expect(vault.getValue("LEGACY_TOKEN")).toBe("legacy-plain-token");
    vault.close();
  });
});
