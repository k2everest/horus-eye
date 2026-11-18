# Horus Eye / Aegis Flow

Console React/Vite e protótipo Aegis Flow/QUEER. A carteira browser permanece demonstrativa; o backend verifica assinaturas
PQC e composite STARK reais, com estado local persistente. Os saldos não
têm valor monetário e os componentes não estão aptos à produção.

## Desenvolvimento

Use Node.js 24 (arquivo `.nvmrc`) e npm. `package-lock.json` é o lockfile usado
pelo CI; o `bun.lock` histórico não é atualizado por este fluxo.

```bash
npm ci
npm run dev
```

Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` em um arquivo
`.env.local` para usar autenticação. Variáveis `VITE_*` ficam públicas no
bundle: nunca inserir chaves de serviço ou segredos nesse prefixo.

## Validação local

```bash
npm run lint
npx tsc -b
npm test
npm run build
bash aegis-flow/scripts/dev-env.sh test
```

O CI do frontend executa instalação limpa, lint, tipos, testes e build. O teste
atual do frontend é apenas um smoke unitário; cobertura de autenticação,
carteira e fluxos de usuário permanece pendente. O CI da Aegis executa os
contratos protobuf e testes Node de crypto-core, gateway e relay.

## Preparação para produção

- Plano e critérios: `aegis-flow/docs/planning/production-readiness.md`.
- Status corrigido: `aegis-flow/docs/planning/status-tarefas-aegis-flow.md`.
- Ambiente local e limites: `aegis-flow/README.md`.

O gateway recusa iniciar com `NODE_ENV=production` até concluir as revisões de
protocolo/parâmetros, gestão de chaves e operação de produção. ML-DSA/ML-KEM, cifragem das notes, composite STARK e SQLite WAL são reais.
Consulte `aegis-flow/services/proof-engine/README.md` e
`aegis-flow/services/ledger-state/README.md`. Compilar o
frontend com sucesso não torna o protocolo seguro para movimentar valor.
