import fs from "node:fs/promises";
import path from "node:path";
import type { OpenClawConfig } from "../../config/config.js";
import type { ProjectRecord } from "../types.js";
import { readJsonFile } from "../../infra/json-files.js";
import { writeLayeredMemoryEntry } from "../../memory/layered-writeback.js";
import { runExec } from "../../process/exec.js";

const MAX_FILE_BYTES = 4_000;

async function safeReadFile(
  filePath: string,
  maxBytes: number = MAX_FILE_BYTES,
): Promise<string | null> {
  try {
    const buf = await fs.readFile(filePath, "utf8");
    return buf.length > maxBytes ? buf.slice(0, maxBytes) + "\n...(truncated)" : buf;
  } catch {
    return null;
  }
}

async function safeListTree(repoRoot: string): Promise<string | null> {
  try {
    const { stdout } = await runExec(
      "find",
      [
        repoRoot,
        "-maxdepth",
        "2",
        "-type",
        "f",
        "-not",
        "-path",
        "*/node_modules/*",
        "-not",
        "-path",
        "*/.git/*",
        "-not",
        "-path",
        "*/dist/*",
        "-not",
        "-path",
        "*/__pycache__/*",
      ],
      { timeoutMs: 10_000 },
    );
    // Make paths relative for readability
    const lines = stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => line.replace(repoRoot, "."))
      .slice(0, 200);
    return lines.join("\n");
  } catch {
    return null;
  }
}

async function safeFindCiConfigs(repoRoot: string): Promise<string | null> {
  const candidates = [".github/workflows", ".gitlab-ci.yml", ".circleci/config.yml", "Jenkinsfile"];
  const found: string[] = [];
  for (const candidate of candidates) {
    try {
      const full = path.join(repoRoot, candidate);
      const stat = await fs.stat(full);
      if (stat.isDirectory()) {
        const entries = await fs.readdir(full);
        for (const entry of entries) {
          found.push(path.join(candidate, entry));
        }
      } else {
        found.push(candidate);
      }
    } catch {
      // not present
    }
  }
  return found.length > 0 ? found.join("\n") : null;
}

export type IndexProjectResult = {
  entriesWritten: number;
  errors: string[];
};

export async function indexProjectIntoMemory(
  cfg: OpenClawConfig,
  project: ProjectRecord,
): Promise<IndexProjectResult> {
  const repoRoot = project.repoRoot?.trim();
  if (!repoRoot) {
    return { entriesWritten: 0, errors: ["no repoRoot set"] };
  }

  const entries: Array<{ label: string; content: string }> = [];
  const errors: string[] = [];

  // 1. README
  for (const name of ["README.md", "README", "readme.md"]) {
    const readme = await safeReadFile(path.join(repoRoot, name));
    if (readme) {
      entries.push({ label: "README", content: `# README (${name})\n${readme}` });
      break;
    }
  }

  // 2. Package manifest & scripts
  const pkgJson = await readJsonFile<Record<string, unknown>>(path.join(repoRoot, "package.json"));
  if (pkgJson) {
    const scripts = pkgJson.scripts ?? {};
    const deps = Object.keys((pkgJson.dependencies ?? {}) as Record<string, unknown>).join(", ");
    const devDeps = Object.keys((pkgJson.devDependencies ?? {}) as Record<string, unknown>).join(
      ", ",
    );
    entries.push({
      label: "package.json",
      content: [
        "# package.json overview",
        `Name: ${typeof pkgJson.name === "string" ? pkgJson.name : "(unnamed)"}`,
        `Scripts: ${JSON.stringify(scripts, null, 2)}`,
        deps ? `Dependencies: ${deps}` : null,
        devDeps ? `DevDependencies: ${devDeps}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  }

  // Cargo.toml
  const cargoToml = await safeReadFile(path.join(repoRoot, "Cargo.toml"));
  if (cargoToml) {
    entries.push({ label: "Cargo.toml", content: `# Cargo.toml\n${cargoToml}` });
  }

  // pyproject.toml
  const pyproject = await safeReadFile(path.join(repoRoot, "pyproject.toml"));
  if (pyproject) {
    entries.push({ label: "pyproject.toml", content: `# pyproject.toml\n${pyproject}` });
  }

  // 3. Directory tree (depth 2)
  const tree = await safeListTree(repoRoot);
  if (tree) {
    entries.push({ label: "directory-tree", content: `# Directory structure (depth 2)\n${tree}` });
  }

  // 4. CI config
  const ci = await safeFindCiConfigs(repoRoot);
  if (ci) {
    entries.push({ label: "ci-config", content: `# CI configuration files\n${ci}` });
  }

  // 5. Docker
  for (const name of ["Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml"]) {
    try {
      await fs.stat(path.join(repoRoot, name));
      entries.push({ label: name, content: `# Container config: ${name} found` });
    } catch {
      // not present
    }
  }

  // 6. .env.example
  const envExample = await safeReadFile(path.join(repoRoot, ".env.example"));
  if (envExample) {
    entries.push({ label: ".env.example", content: `# .env.example\n${envExample}` });
  }

  // Write each entry to layered memory (project scope)
  let entriesWritten = 0;
  for (const entry of entries) {
    try {
      await writeLayeredMemoryEntry({
        cfg,
        scopeRef: { agentId: "system", projectId: project.id },
        entry: {
          eventType: "project:indexed",
          summary: entry.content,
          metadata: {
            projectId: project.id,
            label: entry.label,
            indexedAtMs: Date.now(),
          },
        },
      });
      entriesWritten++;
    } catch (err) {
      errors.push(
        `failed to write ${entry.label}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return { entriesWritten, errors };
}
