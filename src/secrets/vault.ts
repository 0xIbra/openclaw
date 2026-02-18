/**
 * Secret Vault — the core registry of known secrets (SPEC §4.7.3).
 *
 * Responsibilities:
 *  - Register secrets (manually or via auto-discovery)
 *  - Store detection patterns and optional encrypted values
 *  - Auto-discover secrets from env vars and project directories
 *  - Provide retrieval-by-name for injection (local use only)
 *  - List all tracked secrets (names and sources, never values)
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { DetectionPattern, SecretEntry, SecretSource } from "./types.js";
import { createSecretsCrypto } from "./crypto.js";
import { BUILTIN_PATTERNS } from "./patterns.js";
import { initializeSecretsSchema, openSecretsDatabase, type SecretsDatabase } from "./sqlite.js";

// ── SQLite row shape ────────────────────────────────────────────────────

type SecretRow = {
  id: string;
  name: string;
  pattern_kind: string;
  pattern_label: string;
  pattern_value: string;
  encrypted_value: string | null;
  source: string;
  created_at_ms: number;
};

// ── Vault ───────────────────────────────────────────────────────────────

export type SecretVault = ReturnType<typeof createSecretVault>;

export function createSecretVault(opts?: {
  db?: SecretsDatabase;
  dbPath?: string;
  keyPath?: string;
}) {
  const db = opts?.db ?? openSecretsDatabase({ dbPath: opts?.dbPath });
  const ownsDb = !opts?.db;
  initializeSecretsSchema(db);
  const crypto = createSecretsCrypto({ dbPath: opts?.dbPath, keyPath: opts?.keyPath });

  // Prepared statements
  const insertStmt = db.prepare(
    `INSERT INTO secrets (id, name, pattern_kind, pattern_label, pattern_value, encrypted_value, source, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const getByNameStmt = db.prepare(`SELECT * FROM secrets WHERE name = ?`);

  const listStmt = db.prepare(`SELECT * FROM secrets ORDER BY created_at_ms DESC`);

  const deleteByNameStmt = db.prepare(`DELETE FROM secrets WHERE name = ?`);

  // ── Public API ──────────────────────────────────────────────────────

  function mapRow(row: SecretRow): SecretEntry {
    let decryptedValue: string | null = null;
    if (row.encrypted_value) {
      try {
        decryptedValue = crypto.decrypt(row.encrypted_value);
      } catch {
        decryptedValue = null;
      }
    }
    return {
      id: row.id,
      name: row.name,
      pattern: {
        kind: row.pattern_kind as DetectionPattern["kind"],
        label: row.pattern_label,
        value: row.pattern_value,
      },
      encryptedValue: decryptedValue,
      source: row.source as SecretSource,
      createdAtMs: row.created_at_ms,
    };
  }

  function close(): void {
    if (ownsDb) {
      db.close();
    }
  }

  /**
   * Register a new secret.  If a secret with the same name already exists,
   * it is silently replaced.
   */
  function register(params: {
    name: string;
    pattern: DetectionPattern;
    value?: string;
    source: SecretSource;
  }): SecretEntry {
    const now = Date.now();
    const id = randomUUID();
    const existing = getByNameStmt.get(params.name) as SecretRow | undefined;
    if (existing) {
      deleteByNameStmt.run(params.name);
    }
    const encryptedValue =
      typeof params.value === "string" && params.value.length > 0
        ? crypto.encrypt(params.value)
        : null;
    insertStmt.run(
      id,
      params.name,
      params.pattern.kind,
      params.pattern.label,
      params.pattern.value,
      encryptedValue,
      params.source,
      now,
    );
    return {
      id,
      name: params.name,
      pattern: params.pattern,
      encryptedValue: params.value ?? null,
      source: params.source,
      createdAtMs: now,
    };
  }

  /** List all registered secrets (names and sources — never values). */
  function list(): SecretEntry[] {
    const rows = listStmt.all() as SecretRow[];
    return rows.map(mapRow);
  }

  /** Get a secret by name. Returns null if not registered. */
  function getByName(name: string): SecretEntry | null {
    const row = getByNameStmt.get(name) as SecretRow | undefined;
    return row ? mapRow(row) : null;
  }

  /**
   * Get the raw secret value by name (for local injection only).
   * Returns null if not registered or if the value was not stored.
   */
  function getValue(name: string): string | null {
    const row = getByNameStmt.get(name) as SecretRow | undefined;
    if (!row?.encrypted_value) {
      return null;
    }
    try {
      return crypto.decrypt(row.encrypted_value);
    } catch {
      return null;
    }
  }

  /**
   * Auto-discover secrets from the current process environment variables.
   * Matches env var names against built-in patterns and registers any whose
   * values are non-empty.
   */
  function discoverFromEnv(env: Record<string, string | undefined> = process.env): SecretEntry[] {
    const envPatterns = BUILTIN_PATTERNS.filter((p) => p.kind === "env_var");
    const discovered: SecretEntry[] = [];

    for (const [varName, varValue] of Object.entries(env)) {
      if (!varValue || !varValue.trim()) {
        continue;
      }

      for (const pattern of envPatterns) {
        const re = new RegExp(pattern.value);
        if (re.test(varName)) {
          const entry = register({
            name: varName,
            pattern: { kind: "exact", label: `${pattern.label} (${varName})`, value: varValue },
            value: varValue,
            source: "env",
          });
          discovered.push(entry);
          break; // one match per env var is enough
        }
      }
    }

    return discovered;
  }

  /**
   * Auto-discover secrets from .env files in a project directory.
   * Scans for `.env`, `.env.local`, `.env.production`, `.env.*` files
   * and registers any key=value pairs matching known patterns.
   */
  function discoverFromDotenv(projectDir: string): SecretEntry[] {
    const discovered: SecretEntry[] = [];
    const dotenvFiles = [".env", ".env.local", ".env.production", ".env.development"];

    for (const fileName of dotenvFiles) {
      const filePath = path.join(projectDir, fileName);
      if (!fs.existsSync(filePath)) {
        continue;
      }

      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) {
            continue;
          }

          const eqIndex = trimmed.indexOf("=");
          if (eqIndex < 0) {
            continue;
          }

          const key = trimmed.slice(0, eqIndex).trim();
          const val = trimmed
            .slice(eqIndex + 1)
            .trim()
            .replace(/^["']|["']$/g, "");
          if (!key || !val) {
            continue;
          }

          // Check if the var name matches any env_var pattern
          const envPatterns = BUILTIN_PATTERNS.filter((p) => p.kind === "env_var");
          for (const pattern of envPatterns) {
            const re = new RegExp(pattern.value);
            if (re.test(key)) {
              const entry = register({
                name: key,
                pattern: { kind: "exact", label: `${pattern.label} (${key})`, value: val },
                value: val,
                source: "dotenv",
              });
              discovered.push(entry);
              break;
            }
          }

          // Also check if the value matches any prefix/regex patterns
          const valuePatterns = BUILTIN_PATTERNS.filter(
            (p) => p.kind === "prefix" || p.kind === "regex",
          );
          for (const pattern of valuePatterns) {
            if (pattern.kind === "prefix" && val.startsWith(pattern.value) && val.length >= 10) {
              const entry = register({
                name: key,
                pattern: { kind: "exact", label: `${pattern.label} (${key})`, value: val },
                value: val,
                source: "dotenv",
              });
              discovered.push(entry);
              break;
            }
            if (pattern.kind === "regex") {
              try {
                const re = new RegExp(pattern.value);
                if (re.test(val)) {
                  const entry = register({
                    name: key,
                    pattern: { kind: "exact", label: `${pattern.label} (${key})`, value: val },
                    value: val,
                    source: "dotenv",
                  });
                  discovered.push(entry);
                  break;
                }
              } catch {
                // invalid regex — skip
              }
            }
          }
        }
      } catch {
        // permission or read error — skip file
      }
    }

    return discovered;
  }

  /**
   * Scan a project directory for secrets.
   * Combines env discovery with dotenv file scanning.
   */
  function scan(
    projectDir: string,
    env: Record<string, string | undefined> = process.env,
  ): SecretEntry[] {
    const fromEnv = discoverFromEnv(env);
    const fromDotenv = discoverFromDotenv(projectDir);
    return [...fromEnv, ...fromDotenv];
  }

  return {
    close,
    register,
    list,
    getByName,
    getValue,
    discoverFromEnv,
    discoverFromDotenv,
    scan,
    /** Expose db for audit/scrubber to share the connection. */
    get db() {
      return db;
    },
  };
}
