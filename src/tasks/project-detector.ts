/**
 * Auto-detect project language, framework, and build/test/lint commands
 * from well-known marker files in the repo root.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { readJsonFile } from "../infra/json-files.js";

export type ProjectProfile = {
  language: string;
  packageManager?: string;
  framework?: string;
  buildCmd?: string;
  testCmd?: string;
  lintCmd?: string;
};

// ---------------------------------------------------------------------------
// Detection rules — ordered by priority (highest first)
// ---------------------------------------------------------------------------

type DetectionRule = {
  marker: string;
  priority: number;
  profile: Partial<ProjectProfile>;
};

const DETECTION_RULES: DetectionRule[] = [
  // Rust
  {
    marker: "Cargo.toml",
    priority: 10,
    profile: {
      language: "rust",
      packageManager: "cargo",
      buildCmd: "cargo build",
      testCmd: "cargo test",
      lintCmd: "cargo clippy",
    },
  },
  // Go
  {
    marker: "go.mod",
    priority: 10,
    profile: {
      language: "go",
      packageManager: "go",
      buildCmd: "go build ./...",
      testCmd: "go test ./...",
      lintCmd: "golangci-lint run",
    },
  },
  // Python
  {
    marker: "pyproject.toml",
    priority: 9,
    profile: {
      language: "python",
      packageManager: "pip",
      testCmd: "pytest",
      lintCmd: "ruff check .",
    },
  },
  {
    marker: "setup.py",
    priority: 8,
    profile: { language: "python", packageManager: "pip", testCmd: "pytest", lintCmd: "flake8" },
  },
  {
    marker: "requirements.txt",
    priority: 7,
    profile: { language: "python", packageManager: "pip", testCmd: "pytest" },
  },
  // PHP
  {
    marker: "composer.json",
    priority: 9,
    profile: {
      language: "php",
      packageManager: "composer",
      buildCmd: "composer install",
      testCmd: "./vendor/bin/phpunit",
      lintCmd: "./vendor/bin/phpstan analyse",
    },
  },
  {
    marker: "artisan",
    priority: 10,
    profile: { framework: "laravel", testCmd: "php artisan test" },
  },
  // JS/TS — lock files determine package manager
  { marker: "pnpm-lock.yaml", priority: 8, profile: { packageManager: "pnpm" } },
  { marker: "bun.lockb", priority: 8, profile: { packageManager: "bun" } },
  { marker: "yarn.lock", priority: 7, profile: { packageManager: "yarn" } },
  { marker: "tsconfig.json", priority: 6, profile: { language: "typescript" } },
  {
    marker: "package.json",
    priority: 5,
    profile: { language: "javascript", packageManager: "npm" },
  },
];

// ---------------------------------------------------------------------------
// Framework detection from dependency names
// ---------------------------------------------------------------------------

type FrameworkMarker = { dep: string; framework: string; language?: string };

const FRAMEWORK_MARKERS: FrameworkMarker[] = [
  // JS
  { dep: "express", framework: "express" },
  { dep: "fastify", framework: "fastify" },
  { dep: "next", framework: "nextjs" },
  { dep: "nuxt", framework: "nuxt" },
  { dep: "@nestjs/core", framework: "nestjs", language: "typescript" },
  { dep: "hono", framework: "hono" },
  { dep: "elysia", framework: "elysia", language: "typescript" },
  // Python
  { dep: "fastapi", framework: "fastapi", language: "python" },
  { dep: "flask", framework: "flask", language: "python" },
  { dep: "django", framework: "django", language: "python" },
  // PHP
  { dep: "laravel/framework", framework: "laravel", language: "php" },
  { dep: "slim/slim", framework: "slim", language: "php" },
  { dep: "symfony/symfony", framework: "symfony", language: "php" },
  // Rust
  { dep: "actix-web", framework: "actix", language: "rust" },
  { dep: "axum", framework: "axum", language: "rust" },
  { dep: "rocket", framework: "rocket", language: "rust" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function collectDeps(obj: Record<string, unknown>, field: string): string[] {
  const section = obj[field];
  if (section && typeof section === "object" && !Array.isArray(section)) {
    return Object.keys(section as Record<string, unknown>);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Main detection
// ---------------------------------------------------------------------------

export async function detectProjectProfile(repoRoot: string): Promise<ProjectProfile> {
  const profile: ProjectProfile = { language: "unknown" };

  // 1. Scan marker files by priority (highest first).
  //    Higher-priority rules win for each field; lower-priority rules fill gaps.
  const sorted = [...DETECTION_RULES].toSorted((a, b) => b.priority - a.priority);
  for (const rule of sorted) {
    if (await fileExists(path.join(repoRoot, rule.marker))) {
      for (const [key, value] of Object.entries(rule.profile)) {
        if (
          (profile as Record<string, unknown>)[key] === undefined ||
          (profile as Record<string, unknown>)[key] === "unknown"
        ) {
          (profile as Record<string, unknown>)[key] = value;
        }
      }
    }
  }

  // 2. Collect all dependency names for framework detection.
  const allDeps = new Set<string>();

  const pkgJson = await readJsonFile<Record<string, unknown>>(path.join(repoRoot, "package.json"));
  if (pkgJson) {
    for (const dep of [
      ...collectDeps(pkgJson, "dependencies"),
      ...collectDeps(pkgJson, "devDependencies"),
    ]) {
      allDeps.add(dep);
    }
  }

  const composerJson = await readJsonFile<Record<string, unknown>>(
    path.join(repoRoot, "composer.json"),
  );
  if (composerJson) {
    for (const dep of [
      ...collectDeps(composerJson, "require"),
      ...collectDeps(composerJson, "require-dev"),
    ]) {
      allDeps.add(dep);
    }
  }

  // 3. Detect framework from dependencies.
  for (const marker of FRAMEWORK_MARKERS) {
    if (allDeps.has(marker.dep)) {
      if (!profile.framework) {
        profile.framework = marker.framework;
      }
      if (
        marker.language &&
        (profile.language === "unknown" || profile.language === "javascript")
      ) {
        profile.language = marker.language;
      }
      break; // first match wins
    }
  }

  // 4. Derive build/test/lint from package.json scripts if not already set.
  if (pkgJson && typeof pkgJson.scripts === "object" && pkgJson.scripts) {
    const scripts = pkgJson.scripts as Record<string, string>;
    const pm = profile.packageManager ?? "npm";
    if (!profile.buildCmd && scripts.build) {
      profile.buildCmd = `${pm} run build`;
    }
    if (!profile.testCmd && scripts.test) {
      profile.testCmd = `${pm} run test`;
    }
    if (!profile.lintCmd) {
      if (scripts.lint) {
        profile.lintCmd = `${pm} run lint`;
      } else if (scripts.check) {
        profile.lintCmd = `${pm} run check`;
      }
    }
  }

  return profile;
}
