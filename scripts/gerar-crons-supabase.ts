/**
 * Gera o SQL que adapta o scheduler Docker para Supabase Cron + pg_net.
 *
 * Há deliberadamente UM job pg_cron: agendar um job para cada rota concentraria
 * mais de oito workers no começo de vários minutos. O dispatcher preserva as
 * expressões canônicas e apenas enfileira os HTTPs que vencem naquele minuto.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type CronDoScheduler = {
  expressao: string;
  timeoutSegundos: number;
  caminho: string;
};

const LINHA_DE_CRON = /^(?<expressao>[^|]+)\|(?<timeout>\d+)\|(?<caminho>api\/v1\/cron\/[a-z0-9-]+(?:\?limit=50)?)$/;

export function lerCronsDoScheduler(fonte: string): CronDoScheduler[] {
  const vistos = new Set<string>();
  return fonte
    .split(/\r?\n/)
    .map((linha) => linha.trim().match(LINHA_DE_CRON))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({
      expressao: match.groups!.expressao.trim(),
      timeoutSegundos: Number(match.groups!.timeout),
      caminho: match.groups!.caminho,
    }))
    .filter((cron) => {
      if (vistos.has(cron.caminho)) throw new Error(`rota de cron duplicada: ${cron.caminho}`);
      vistos.add(cron.caminho);
      return true;
    });
}

function literalSql(valor: string): string {
  return `'${valor.replaceAll("'", "''")}'`;
}

/** O catálogo vem do entrypoint, nunca de uma cópia manual da agenda. */
function catalogoSql(crons: CronDoScheduler[]): string {
  return literalSql(JSON.stringify(crons.map(({ expressao, caminho }) => ({ expressao, caminho }))));
}

export function gerarSqlDosCrons(crons: CronDoScheduler[]): string {
  return `-- Gerado por scripts/gerar-crons-supabase.ts. Não edite à mão.\n-- Crie no Vault deskcomm_serverless_app_url e deskcomm_serverless_cron_secret.\n-- A fonte da agenda é docker/scheduler/entrypoint.sh.\n\ncreate extension if not exists pg_cron with schema pg_catalog;\ncreate extension if not exists pg_net;\n\ncreate schema if not exists private;\n\ncreate or replace function private.campo_cron_corresponde(campo text, valor integer)\nreturns boolean\nlanguage plpgsql\nimmutable\nset search_path = pg_catalog, private\nas $$\nbegin\n  if campo = '*' then return true; end if;\n  if campo ~ '^\\*/[0-9]+$' then return valor % substring(campo from 3)::integer = 0; end if;\n  if campo ~ '^[0-9]+$' then return valor = campo::integer; end if;\n  raise exception 'campo cron não suportado: %', campo;\nend;\n$$;\n\ncreate or replace function private.disparar_crons_serverless()\nreturns void\nlanguage plpgsql\nsecurity definer\nset search_path = pg_catalog, vault, net, private\nas $$\ndeclare\n  origem text;\n  segredo text;\n  agora timestamp := timezone('UTC', now());\n  item jsonb;\n  campos text[];\n  caminho text;\nbegin\n  select decrypted_secret into origem from vault.decrypted_secrets where name = 'deskcomm_serverless_app_url';\n  select decrypted_secret into segredo from vault.decrypted_secrets where name = 'deskcomm_serverless_cron_secret';\n\n  if coalesce(origem, '') = '' or coalesce(segredo, '') = '' then\n    raise exception 'Vault sem deskcomm_serverless_app_url ou deskcomm_serverless_cron_secret';\n  end if;\n\n  for item in select value from jsonb_array_elements(${catalogoSql(crons)}::jsonb)\n  loop\n    campos := regexp_split_to_array(item->>'expressao', '\\s+');\n    caminho := item->>'caminho';\n    if array_length(campos, 1) <> 5 or caminho !~ '^api/v1/cron/[a-z0-9-]+(\\?limit=50)?$' then\n      raise exception 'catálogo de cron serverless inválido';\n    end if;\n    if private.campo_cron_corresponde(campos[1], extract(minute from agora)::integer)\n      and private.campo_cron_corresponde(campos[2], extract(hour from agora)::integer)\n      and private.campo_cron_corresponde(campos[3], extract(day from agora)::integer)\n      and private.campo_cron_corresponde(campos[4], extract(month from agora)::integer)\n      and private.campo_cron_corresponde(campos[5], extract(dow from agora)::integer) then\n      perform net.http_post(\n        url := rtrim(origem, '/') || '/' || caminho,\n        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || segredo),\n        body := '{}'::jsonb,\n        timeout_milliseconds := 5000\n      );\n    end if;\n  end loop;\nend;\n$$;\n\nrevoke all on function private.campo_cron_corresponde(text, integer) from public, anon, authenticated;\nrevoke all on function private.disparar_crons_serverless() from public, anon, authenticated;\ngrant execute on function private.disparar_crons_serverless() to postgres;\n\n-- Regerar é idempotente: troca o dispatcher anterior pelo catálogo atual.\nselect cron.unschedule(jobid) from cron.job where jobname = 'deskcomm:serverless-dispatcher';\nselect cron.schedule('deskcomm:serverless-dispatcher', '* * * * *', 'select private.disparar_crons_serverless();');\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const scheduler = readFileSync(resolve(process.cwd(), "docker/scheduler/entrypoint.sh"), "utf8");
  process.stdout.write(gerarSqlDosCrons(lerCronsDoScheduler(scheduler)));
}
