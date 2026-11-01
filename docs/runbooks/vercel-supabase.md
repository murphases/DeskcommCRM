# Deploy serverless: Vercel + Supabase

Este caminho mantém o CRM no mesmo repositório, sem Docker em produção. O app
Next.js roda na Vercel; Supabase fornece Auth, Postgres, RLS, Storage, Realtime
e os agendamentos. WAHA/NOWEB, telefonia e os artefatos de infraestrutura Docker
permanecem no código para instalações self-hosted, mas ficam desligados neste
modo.

## Pré-requisitos

- Um projeto Supabase com o schema do CRM aplicado.
- Um projeto Vercel ligado a este repositório.
- Um Redis REST compatível com o SDK Upstash (o plano gratuito da Upstash é
  suficiente para uso pequeno). O app preserva rate limits entre instâncias e
  o debounce de IA; Supabase Postgres não substitui esse adaptador hoje.
- Segredos da aplicação configurados na Vercel: as chaves Supabase, `INTERNAL_SECRET`,
  `INTERNAL_CRON_SECRET`, `CPF_ENCRYPTION_KEY`, `AI_CRED_AES_KEY`,
  `SUPABASE_DB_URL`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
  `NEXT_PUBLIC_APP_URL` e `NEXT_PUBLIC_ADMIN_URL`.
- `WAHA_*`, `WACALLS_*`, `ARI_*` e `COMPOSE_PROFILES` ficam vazios. Vazio é o
  sinal explícito de que esses adaptadores não existem nesta instalação.

## Schema inicial

Em um projeto Supabase vazio, aplique o baseline idempotente com a connection
string **direta de administrador** obtida no painel do Supabase:

```bash
psql "$SUPABASE_DB_ADMIN_URL" -v ON_ERROR_STOP=1 -f supabase/baseline.sql
```

Não use `supabase db push` para esse primeiro bootstrap: o projeto usa
`supabase/baseline.sql` como schema completo de instalação. Depois, guarde a
string de pooler usada pelo app em `SUPABASE_DB_URL`; a credencial
administrativa não entra na Vercel.

## Agendamento

Não use Vercel Cron para esta agenda: o plano Hobby limita os jobs. Em vez disso,
um único job Supabase `pg_cron` roda por minuto, interpreta a agenda canônica e
chama as rotas existentes da Vercel por `pg_net`. Assim mantemos as cadências e
a autenticação Bearer sem concentrar dezenas de workers do `pg_cron` no mesmo
minuto.

`vercel.json` reserva até 240 segundos para essas rotas, que é o maior timeout
declarado pelo scheduler Docker original.

1. Gere o SQL a partir da agenda canônica:

   ```bash
   pnpm tsx scripts/gerar-crons-supabase.ts > supabase/serverless-cron.sql
   ```

2. No SQL Editor do Supabase, crie os dois segredos do Vault, usando o domínio
   de produção da Vercel e o mesmo valor definido em `INTERNAL_CRON_SECRET`.
3. Execute o SQL gerado. Ele substitui o dispatcher pelo mesmo nome, portanto é
   seguro regenerá-lo após uma mudança de agenda.

Os jobs só chamam rotas já protegidas por `INTERNAL_CRON_SECRET`; o segredo é
lido pelo Vault em tempo de execução e não é persistido em `cron.job`.

## Limites importantes

- O Supabase mantém somente um job de dispatcher concorrente. As rotas recebem
  chamadas assíncronas e já guardam suas próprias operações idempotentes.
- O worker persistente não sobe na Vercel. As rotas de cron já fazem trabalho
  curto e idempotente; os jobs substituem o scheduler Docker.
- O `agent-worker` não tem adaptador serverless no código atual. Portanto,
  agentes de IA autônomos que consomem `job_queue` ficam desativados neste
  perfil; CRM, automações, follow-ups e as rotas cron continuam disponíveis.
  Não ligue `AGENT_DISPATCH_CONSUMER` esperando reativá-los: o dispatcher
  serverless legado é um no-op deliberado.
- Para WhatsApp, use outro adaptador hospedado fora da Vercel (por exemplo,
  Cloud API oficial). Não configure WAHA neste modo.
