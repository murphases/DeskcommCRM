import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("verify:full", () => {
  it("encadeia os gates que não pertencem ao loop rápido", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    const command = pkg.scripts["verify:full"];

    expect(command).toContain("pnpm gov:verify");
    expect(command).toContain("pnpm test:shell");
    expect(command).toContain("pnpm test:db");
    expect(command).toContain("pnpm test:e2e");
  });
});
