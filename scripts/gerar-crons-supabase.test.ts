import { describe, expect, it } from "vitest";

import { gerarSqlDosCrons, lerCronsDoScheduler } from "./gerar-crons-supabase";

describe("gerador de crons Supabase", () => {
  it("preserva a agenda canônica em um dispatcher e lê segredos somente pelo Vault", () => {
    const crons = lerCronsDoScheduler("* * * * *|25|api/v1/cron/event-log-drain\n*/5 * * * *|25|api/v1/cron/storage-redaction?limit=50");
    const sql = gerarSqlDosCrons(crons);

    expect(crons).toHaveLength(2);
    expect(sql).toContain('"expressao":"*/5 * * * *"');
    expect(sql).toContain("api/v1/cron/storage-redaction?limit=50");
    expect(sql).toContain("vault.decrypted_secrets");
    expect(sql).toContain("net.http_post");
    expect(sql).toContain("deskcomm:serverless-dispatcher");
    expect(sql.match(/select cron\.schedule/g)).toHaveLength(1);
    expect(sql).toContain("revoke all on function private.disparar_crons_serverless");
  });

  it("ignora entradas que não pertencem às rotas internas de cron", () => {
    expect(lerCronsDoScheduler("* * * * *|25|https://fora.exemplo/cron")).toEqual([]);
  });
});
