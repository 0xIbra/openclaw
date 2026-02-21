import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectProjectProfile } from "./project-detector.js";

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-detect-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

describe("detectProjectProfile", () => {
  it("returns unknown for empty directory", async () => {
    const dir = await makeTempDir();
    const profile = await detectProjectProfile(dir);
    expect(profile.language).toBe("unknown");
    expect(profile.buildCmd).toBeUndefined();
  });

  it("detects Rust from Cargo.toml", async () => {
    const dir = await makeTempDir();
    await fs.writeFile(path.join(dir, "Cargo.toml"), '[package]\nname = "test"');
    const profile = await detectProjectProfile(dir);
    expect(profile.language).toBe("rust");
    expect(profile.packageManager).toBe("cargo");
    expect(profile.buildCmd).toBe("cargo build");
    expect(profile.testCmd).toBe("cargo test");
    expect(profile.lintCmd).toBe("cargo clippy");
  });

  it("detects Go from go.mod", async () => {
    const dir = await makeTempDir();
    await fs.writeFile(path.join(dir, "go.mod"), "module example.com/test\n\ngo 1.21");
    const profile = await detectProjectProfile(dir);
    expect(profile.language).toBe("go");
    expect(profile.testCmd).toBe("go test ./...");
  });

  it("detects Python from pyproject.toml", async () => {
    const dir = await makeTempDir();
    await fs.writeFile(path.join(dir, "pyproject.toml"), '[tool.poetry]\nname = "test"');
    const profile = await detectProjectProfile(dir);
    expect(profile.language).toBe("python");
    expect(profile.testCmd).toBe("pytest");
  });

  it("detects PHP from composer.json", async () => {
    const dir = await makeTempDir();
    await fs.writeFile(path.join(dir, "composer.json"), '{"require": {}}');
    const profile = await detectProjectProfile(dir);
    expect(profile.language).toBe("php");
    expect(profile.packageManager).toBe("composer");
  });

  it("detects TypeScript with pnpm from lock file and tsconfig", async () => {
    const dir = await makeTempDir();
    await fs.writeFile(
      path.join(dir, "package.json"),
      '{"scripts":{"build":"tsc","test":"vitest","check":"tsc --noEmit"}}',
    );
    await fs.writeFile(path.join(dir, "tsconfig.json"), "{}");
    await fs.writeFile(path.join(dir, "pnpm-lock.yaml"), "lockfileVersion: 9");
    const profile = await detectProjectProfile(dir);
    expect(profile.language).toBe("typescript");
    expect(profile.packageManager).toBe("pnpm");
    expect(profile.buildCmd).toBe("pnpm run build");
    expect(profile.testCmd).toBe("pnpm run test");
    expect(profile.lintCmd).toBe("pnpm run check");
  });

  it("detects framework from package.json dependencies", async () => {
    const dir = await makeTempDir();
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({
        dependencies: { express: "^4.18.0" },
        scripts: { start: "node index.js", test: "jest" },
      }),
    );
    const profile = await detectProjectProfile(dir);
    expect(profile.framework).toBe("express");
    expect(profile.language).toBe("javascript");
  });

  it("detects NestJS framework and upgrades language to typescript", async () => {
    const dir = await makeTempDir();
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({
        dependencies: { "@nestjs/core": "^10.0.0" },
        scripts: { build: "nest build", test: "jest" },
      }),
    );
    const profile = await detectProjectProfile(dir);
    expect(profile.framework).toBe("nestjs");
    expect(profile.language).toBe("typescript");
  });

  it("detects Laravel from artisan + composer.json", async () => {
    const dir = await makeTempDir();
    await fs.writeFile(path.join(dir, "artisan"), "#!/usr/bin/env php");
    await fs.writeFile(
      path.join(dir, "composer.json"),
      JSON.stringify({
        require: { "laravel/framework": "^10.0" },
      }),
    );
    const profile = await detectProjectProfile(dir);
    expect(profile.framework).toBe("laravel");
    expect(profile.language).toBe("php");
    expect(profile.testCmd).toBe("php artisan test");
  });

  it("prefers pnpm over npm when pnpm-lock.yaml is present", async () => {
    const dir = await makeTempDir();
    await fs.writeFile(path.join(dir, "package.json"), '{"scripts":{"test":"vitest"}}');
    await fs.writeFile(path.join(dir, "pnpm-lock.yaml"), "");
    const profile = await detectProjectProfile(dir);
    expect(profile.packageManager).toBe("pnpm");
    expect(profile.testCmd).toBe("pnpm run test");
  });

  it("derives lint from package.json lint script", async () => {
    const dir = await makeTempDir();
    await fs.writeFile(
      path.join(dir, "package.json"),
      JSON.stringify({
        scripts: { lint: "eslint .", test: "vitest" },
      }),
    );
    const profile = await detectProjectProfile(dir);
    expect(profile.lintCmd).toBe("npm run lint");
  });
});
