# Validation Gateway — PQC, STARK e estado persistente

Node.js >=24.8. O verificador STARK nativo é compilado com Rust; o gateway não
recebe witness privado e não precisa de um prover. Produção permanece bloqueada
por `runtime-policy.mjs`, mesmo com verificação real e banco persistente.

## Endpoints de laboratório

| Método/rota | Comportamento |
|---|---|
| GET /healthz | Saúde, flags de persistência e disponibilidade STARK; production_ready=false |
| POST /validate | V1: somente assinatura ML-DSA/schema; pode persistir recibo SIGNATURE_VERIFIED, sem alterar ledger |
| POST /submit | V2: recebe `{transaction, proof}`; verifica assinatura, journal/image ID e composite STARK, aplica estado SQLite atomicamente |
| GET /receipts/:request_id | Recibo durável de assinatura ou de aplicação local |
| GET /transactions/:tx_id | Transação pública e receipt STARK persistidos; nunca witness/segredos |
| GET /ledger/root | Tip local (network_id, altura, root e count) |
| GET /ledger/proof/:commitment | Prova de inclusão Merkle no root local |

`APPLIED_LOCAL` e `settled:false` significam estado aplicado no ledger local,
não finalização por consenso ou mainnet. `/validate` nunca cria commitments
ou saldo, nem autoriza gastar. Envelopes fictícios da carteira browser antiga
são rejeitados. A entrada financeira local é exclusivamente `/submit` V2.

## Executar

```bash
python3 aegis-flow/scripts/setup-stark.py
AEGIS_LEDGER_PATH=work/ledger.sqlite node aegis-flow/services/validation-gateway/server.mjs
```

A inicialização de notes de genesis é administrativa, offline e única; veja
`../ledger-state/README.md`. Não há endpoint de faucet ou mint arbitrário.
Sem banco/proof backend configurados, submissões retornam 503 e não gravam
estado. `AEGIS_NETWORK_ID` deve corresponder ao banco e às transações.

O path padrão do banco no processo standalone é `work/aegis-ledger.sqlite`.
A factory de testes só abre um banco quando `ledgerPath` é informado.
`NODE_ENV=production` ou AEGIS_MODE diferente de demo bloqueiam startup.

## Limites, erros e privacidade

- Exige application/json; 64 KiB por requisição V1, 12 MiB por submissão V2,
  receipt binário limitado a 8 MiB. Tamanhos maiores recebem 413.
- Headers 10 s; requisição/inatividade 15 s; verificação nativa limitada a 10 s.
  Apenas uma verificação STARK por processo; excesso retorna VERIFIER_BUSY/503.
- Schema/assinatura/prova inválidos: 400; conflitos de root, gasto ou request_id:
  409; backend/estado indisponível: 503. Retry idêntico é idempotente.
- Persistem somente dados públicos e outputs cifrados. Não enviar witness,
  openings, spend_secret ou chaves privadas. Body de /submit rejeita campos extras.
- Logs V1 mantêm hash do input, sem payload. Política completa de logs,
  metadados, rate limiting e autenticação de produção continuam pendentes.

## Docker

```bash
docker build -f aegis-flow/services/validation-gateway/Dockerfile \
  -t aegis-flow/validation-gateway:local aegis-flow
```

Em ambientes com CA corporativa, passar `--secret id=build_ca,src=/caminho/ca-bundle.pem` ao build. O bundle é montado apenas no estágio de build, sem desativar TLS ou copiá-lo para a imagem final.

O build compila o verificador Rust com Cargo.lock e instala runtime Node 24,
sem prover no gateway. Compose monta volume nomeado em /data e mantém root
filesystem read-only. A imagem/build de STARK está validada para Linux x86_64.
Não usar filesystem efêmero do Cloud Run como ledger persistente ou o mesmo
arquivo SQLite em múltiplos hosts. Guia GCP antigo é apenas demonstração.

## Testes

```bash
bash aegis-flow/scripts/dev-env.sh test
AEGIS_STARK_INTEGRATION=1 node --test aegis-flow/services/proof-engine/integration.test.mjs
```

A primeira suíte é rápida e não instala Rust. A segunda constrói uma prova
real de witness privado e testa verificação/adulteração, ownership, balanço,
concorrência de processos, HTTP, restart e backup. Falha se o backend aprovado
não estiver instalado. O proving local pode levar minutos e usar alguns GiB;
a verificação é uma operação separada e muito mais curta.

Protocolos/formato: `../proof-engine/README.md`,
`../../libs/crypto-core/README.md` e `../ledger-state/README.md`.
