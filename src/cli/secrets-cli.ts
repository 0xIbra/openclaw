/**
 * CLI for the Secrets subsystem (SPEC §4.7).
 *
 * Subcommands:
 *   openclaw secrets list   – list registered secrets
 *   openclaw secrets add    – register a secret manually
 *   openclaw secrets scan   – auto-discover secrets in a project
 *   openclaw secrets audit  – view access audit log
 *   openclaw secrets test   – test scrubbing on input text
 */

import type { Command } from "commander";
import { isRich, theme } from "../terminal/theme.js";
import { formatHelpExamples } from "./help-format.js";

export function registerSecretsCli(program: Command) {
  const secrets = program
    .command("secrets")
    .description("Manage the secret vault, scrubber, and audit log")
    .addHelpText(
      "after",
      () =>
        `\n${theme.heading("Examples:")}\n${formatHelpExamples([
          ["openclaw secrets list", "List all registered secrets (names only, never values)."],
          ["openclaw secrets add MY_KEY sk-proj-abc123", "Register a secret by name and value."],
          ["openclaw secrets scan .", "Auto-discover secrets in the current directory."],
          ["openclaw secrets audit", "View the access audit log."],
          ['openclaw secrets test "my key is sk-proj-abc123"', "Test scrubbing on sample text."],
        ])}\n`,
    );

  // ── list ────────────────────────────────────────────────────────────

  secrets
    .command("list")
    .description("List all registered secrets (names and sources — never values)")
    .option("--json", "Output machine-readable JSON", false)
    .action(async (opts: { json?: boolean }) => {
      const { createSecretVault } = await import("../secrets/vault.js");
      const vault = createSecretVault();

      try {
        const entries = vault.list();

        if (opts.json) {
          const safeEntries = entries.map((e) => ({
            name: e.name,
            source: e.source,
            patternLabel: e.pattern.label,
            createdAtMs: e.createdAtMs,
          }));
          console.log(JSON.stringify(safeEntries, null, 2));
          return;
        }

        if (entries.length === 0) {
          console.log(
            isRich()
              ? theme.muted("No secrets registered. Run `openclaw secrets scan .` to discover.")
              : "No secrets registered.",
          );
          return;
        }

        const heading = isRich() ? theme.heading : (s: string) => s;
        const muted = isRich() ? theme.muted : (s: string) => s;

        console.log(heading(`${entries.length} registered secret(s):\n`));
        for (const entry of entries) {
          console.log(`  ${entry.name}  ${muted(`(${entry.source} · ${entry.pattern.label})`)}`);
        }
      } finally {
        vault.close();
      }
    });

  // ── add ─────────────────────────────────────────────────────────────

  secrets
    .command("add <name> <value>")
    .description("Register a secret by name and value")
    .action(async (name: string, value: string) => {
      const { createSecretVault } = await import("../secrets/vault.js");
      const vault = createSecretVault();

      try {
        const entry = vault.register({
          name,
          pattern: { kind: "exact", label: `Manual (${name})`, value },
          value,
          source: "manual",
        });

        const msg = `Registered secret: ${entry.name}`;
        console.log(isRich() ? theme.success(msg) : msg);
      } finally {
        vault.close();
      }
    });

  // ── scan ────────────────────────────────────────────────────────────

  secrets
    .command("scan [directory]")
    .description("Auto-discover secrets from env vars and .env files in a directory")
    .option("--json", "Output machine-readable JSON", false)
    .action(async (directory: string | undefined, opts: { json?: boolean }) => {
      const path = await import("node:path");
      const projectDir = path.resolve(directory ?? ".");

      const { createSecretVault } = await import("../secrets/vault.js");
      const vault = createSecretVault();

      try {
        const discovered = vault.scan(projectDir);

        if (opts.json) {
          const safeEntries = discovered.map((e) => ({
            name: e.name,
            source: e.source,
            patternLabel: e.pattern.label,
          }));
          console.log(JSON.stringify(safeEntries, null, 2));
          return;
        }

        if (discovered.length === 0) {
          console.log(isRich() ? theme.muted("No secrets discovered.") : "No secrets discovered.");
          return;
        }

        const heading = isRich() ? theme.heading : (s: string) => s;
        const muted = isRich() ? theme.muted : (s: string) => s;

        console.log(heading(`Discovered ${discovered.length} secret(s):\n`));
        for (const entry of discovered) {
          console.log(
            `  ${isRich() ? theme.success("✓") : "+"} ${entry.name}  ${muted(`(${entry.source})`)}`,
          );
        }
      } finally {
        vault.close();
      }
    });

  // ── audit ───────────────────────────────────────────────────────────

  secrets
    .command("audit")
    .description("View the secret access audit log")
    .option("-n, --limit <count>", "Maximum entries to show", "50")
    .option("--agent <id>", "Filter by agent ID")
    .option("--action <action>", "Filter by action (scrubbed|injected|blocked|detected)")
    .option("--json", "Output machine-readable JSON", false)
    .action(async (opts: { limit?: string; agent?: string; action?: string; json?: boolean }) => {
      const { createSecretAuditLogger } = await import("../secrets/audit.js");
      const audit = createSecretAuditLogger();

      try {
        const logs = audit.query({
          limit: parseInt(opts.limit ?? "50", 10),
          agentId: opts.agent,
          action: opts.action as import("../secrets/types.js").SecretAction | undefined,
        });

        if (opts.json) {
          console.log(JSON.stringify(logs, null, 2));
          return;
        }

        if (logs.length === 0) {
          console.log(
            isRich() ? theme.muted("No audit entries found.") : "No audit entries found.",
          );
          return;
        }

        const heading = isRich() ? theme.heading : (s: string) => s;
        const muted = isRich() ? theme.muted : (s: string) => s;

        console.log(heading(`Showing ${logs.length} audit entries:\n`));
        for (const log of logs) {
          const ts = new Date(log.timestampMs).toISOString();
          const actionColor =
            log.action === "blocked"
              ? theme.error
              : log.action === "scrubbed"
                ? theme.warn
                : log.action === "injected"
                  ? theme.info
                  : theme.muted;
          const action = isRich() ? actionColor(log.action.padEnd(9)) : log.action.padEnd(9);
          const agent = log.agentId ? ` agent=${log.agentId}` : "";
          const task = log.taskId ? ` task=${log.taskId}` : "";

          console.log(
            `  ${muted(ts)} ${action} ${log.secretName} ${muted(`[${log.context}]`)}${muted(agent)}${muted(task)}`,
          );
        }
      } finally {
        audit.close();
      }
    });

  // ── test ────────────────────────────────────────────────────────────

  secrets
    .command("test <text>")
    .description("Test the scrubber on sample text — shows what would be redacted")
    .option("--json", "Output machine-readable JSON", false)
    .action(async (text: string, opts: { json?: boolean }) => {
      const { createSecretVault } = await import("../secrets/vault.js");
      const { createSecretScrubber } = await import("../secrets/scrubber.js");
      const vault = createSecretVault();
      const scrubber = createSecretScrubber(vault);

      try {
        const result = scrubber.scrub(text);

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        const heading = isRich() ? theme.heading : (s: string) => s;
        const muted = isRich() ? theme.muted : (s: string) => s;

        if (result.redactions.length === 0) {
          console.log(isRich() ? theme.success("✓ No secrets detected.") : "No secrets detected.");
        } else {
          console.log(heading(`Found ${result.redactions.length} secret(s) to redact:\n`));
          for (const r of result.redactions) {
            console.log(`  ${isRich() ? theme.warn("⚠") : "-"} ${r.secretName} → ${r.placeholder}`);
          }
          console.log(muted("\nScrubbed output:"));
          console.log(`  ${result.scrubbed}`);
        }
      } finally {
        vault.close();
      }
    });
}
