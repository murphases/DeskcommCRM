# Primeiro PR em 10 minutos

Este é o caminho curto. As regras completas continuam em
[`AGENTS.md`](../AGENTS.md), [`CLAUDE.md`](../CLAUDE.md) e
[`CONTRIBUTING.md`](../CONTRIBUTING.md); esta página não as substitui.

1. Atualize a `main` e crie uma branch focada:

   ```bash
   git switch main
   git pull --ff-only
   git switch -c fix/descricao-curta
   ```

2. Localize a regra e a área afetada antes de editar. Para uma rota, descubra
   quem a chama; para dados por organização, encontre a policy/RLS e o guard
   canônico já usados por uma rota vizinha.

3. Faça uma mudança pequena. Entrada externa passa por Zod; mutações usam os
   wrappers de resposta, autenticação canônica e auditoria. Nunca derive
   `organization_id` de payload ou query string.

4. Acrescente a prova proporcional:

   - lógica isolada: teste unitário;
   - schema, RLS ou tenant: invariante em `tests/invariants/`;
   - interface ou jornada: Playwright;
   - Docker/instalação: teste shell.

5. Rode o ciclo rápido:

   ```bash
   pnpm gov:verify
   ```

   Quando houver Docker e ambiente E2E, rode também:

   ```bash
   pnpm verify:full
   ```

6. Revise o diff, faça um commit convencional e abra o PR com o que mudou e
   a evidência dos testes. Não trate um verde de `gov:verify` como prova de
   banco, E2E ou instalador.

## Checklist antes do PR

- Nenhum segredo, `.env` ou dado de cliente no diff.
- Toda leitura/escrita de cliente usa a organização confiável e o filtro de
  tenant correspondente.
- Mudança de schema inclui migration, apêndice idempotente no `baseline.sql` e
  a linha `-- manifest:`.
- Contrato, tela ou operação alterados foram documentados.
