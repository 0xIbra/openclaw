import { vi } from "vitest";

export type StubTool = {
  name: string;
  description: string;
  parameters: { type: "object"; properties: Record<string, unknown> };
  // Keep the exported type portable: don't leak Vitest's mock types into .d.ts.
  execute: (...args: unknown[]) => unknown;
};

export const stubTool = (name: string): StubTool => ({
  name,
  description: `${name} stub`,
  parameters: { type: "object", properties: {} },
  execute: vi.fn() as unknown as (...args: unknown[]) => unknown,
});

vi.mock("../tools/image-tool.js", () => ({
  createImageTool: () => stubTool("image"),
}));

// web-tools.ts is now implemented, no need to mock

vi.mock("../../plugins/tools.js", () => ({
  resolvePluginTools: () => [],
  getPluginToolMeta: () => undefined,
}));
