import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("configuração serverless da Vercel", () => {
  it("reserva para cron a maior duração usada pelo scheduler original", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      functions: Record<string, { maxDuration?: number }>;
    };

    expect(config.functions["app/api/v1/cron/**/route.ts"]?.maxDuration).toBe(240);
    expect(config.functions["app/api/v1/system/relogio/tick/route.ts"]?.maxDuration).toBe(240);
  });
});
