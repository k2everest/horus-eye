# Como testar a QUEER

QUEER é a identidade de demonstração do Aegis Flow. O estado atual é um MVP
técnico: não existe emissão monetária, cotação, custódia ou rede pública. Os
valores usados nos testes não têm valor econômico.

## 1. Testes criptográficos e de estado

Na raiz do repositório:

```bash
./aegis-flow/scripts/dev-env.sh test
```

Esse comando executa os testes de transcript canônico, commitments, modelo de
notes, nullifiers, árvore do ledger, assinatura/envelope PQC, construção e
validação de transações, prover/verifier e cenários adversariais.

## 2. Validation Gateway local

Com Docker Compose disponível:

```bash
cd aegis-flow
./scripts/dev-env.sh init
./scripts/dev-env.sh up
./scripts/dev-env.sh smoke
./scripts/dev-env.sh logs
```

O smoke test verifica a saúde do serviço e a rejeição segura de um envelope
inválido. Para encerrar:

```bash
./scripts/dev-env.sh down
```

## 3. Interface e carteira pública

Na raiz do repositório:

```bash
npm install
npm run dev -- --host 0.0.0.0
```

Abra `http://localhost:8080/queer` (ou a porta exibida pelo Vite). A carteira
de laboratório fica em `http://localhost:8080/queer/wallet` e envia o envelope
demonstrativo para `http://localhost:8080/validate`.

Para usar outra URL de gateway, configure antes de iniciar o frontend:

```bash
VITE_AEGIS_GATEWAY_URL=https://gateway.example.test npm run dev -- --host 0.0.0.0
```

O gateway aceita por padrão a origem `http://localhost:8080`. Em outro ambiente,
defina `CORS_ORIGIN` (ou `AEGIS_CORS_ORIGIN` no Compose). O saldo, as chaves e o
histórico da carteira ainda são demonstrativos e não chamam uma blockchain real.

## Critérios antes de uma testnet pública

- substituir os wrappers demonstrativos por implementações ML-KEM/ML-DSA
  validadas e vetores oficiais;
- realizar auditoria criptográfica independente;
- integrar prover/verifier de produção;
- persistir ledger e nullifiers com atomicidade transacional;
- executar testes adversariais, carga, caos e privacidade de rede;
- publicar parâmetros, limitações, política de atualização e modelo econômico.
