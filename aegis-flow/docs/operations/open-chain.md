# Executar a rede aberta experimental

Node >=24.8 e verificador STARK nativo do projeto são necessários. Para provar
transferências também é necessário o prover fixado em `proof-engine/tools.lock.json`.
O bloqueio de `NODE_ENV=production` permanece: não usar com valor real.

Na raiz do repositório, crie **uma** configuração e distribua esse mesmo arquivo
a todos os participantes (confiram o config_id por canais independentes):

```bash
node aegis-flow/scripts/open-chain.mjs lab-genesis --output work/open-genesis.json
AEGIS_POW_GENESIS=work/open-genesis.json AEGIS_POW_DIR=work/node-a PORT=8090 \
  node aegis-flow/services/open-chain/node.mjs
```

Em outro terminal, segundo nó com banco próprio:

```bash
AEGIS_POW_GENESIS=work/open-genesis.json AEGIS_POW_DIR=work/node-b PORT=8091 \
  AEGIS_POW_PEERS='["http://127.0.0.1:8090"]' \
  node aegis-flow/services/open-chain/node.mjs
```

Para máquinas diferentes, configure `AEGIS_BIND_HOST`, conectividade e origens
HTTP/HTTPS públicas explícitas. O P2P só transporta dados públicos. Chaves, notes
privadas, testemunhas e credenciais de cofre nunca devem ser enviados a esses
endpoints. Mantenha o serviço de carteira privado em loopback.
Peers são pontos de descoberta locais, não membros de um comitê autorizado.
Use múltiplos peers independentes; um único bootstrap permite isolamento/censura.

Minere usando um terceiro diretório, sem compartilhar o SQLite do servidor:

```bash
node aegis-flow/scripts/open-chain.mjs mine --genesis work/open-genesis.json \
  --directory work/miner-a --peer http://127.0.0.1:8090 \
  --owner PUBLIC_OWNER_TAG_64_HEX --count 10
node aegis-flow/scripts/open-chain.mjs sync --genesis work/open-genesis.json \
  --directory work/verifier-c --peer http://127.0.0.1:8091
curl http://127.0.0.1:8091/chain/status
```

`--owner` é o **owner_tag público**, derivado do spend secret com `spendOwner`.
Não use o próprio spend secret. Guarde o segredo correspondente: sem ele as
recompensas não são gastáveis. A carteira gráfica atual ainda atende a rede
permissionada; não copie o endereço dela para esta rede incompatível.
O gerador usa unidades exclusivamente de laboratório, recompensa 7, teto 700000,
target fácil, seis confirmações e maturidade seis. Esses valores não são uma
proposta de política monetária comercial nem de segurança para mainnet.
`--count` limita o trabalho da execução, não garante mineração dentro de um prazo.

API pública: `GET /chain/genesis`, `/chain/status`, `/chain/hash/:height`,
`/chain/blocks/:height`, `/mempool/next`, `/receipts/:request_id`;
`POST /submit` e `/p2p/transaction` recebem `{transaction,proof}`;
`POST /p2p/block` recebe `{block}`. Não há `/mint`, `/mine` remoto ou finalizador.
Transações exigem a STARK nativa e saldo adquirido nesta mesma rede.

Reinicie usando a mesma configuração/diretório: o nó revalida blocos, proofs,
raízes e trabalho acumulado. Para cópia fria, encerre o nó e copie o diretório
inteiro; não copie só `chain.sqlite` enquanto WAL estiver aberto. O fluxo S3 do
ledger antigo não restaura automaticamente uma cadeia PoW. Testes de recuperação
externa e operação prolongada continuam necessários.

```bash
node --test aegis-flow/services/open-chain/consensus.test.mjs
AEGIS_OPEN_POW_INTEGRATION=1 node --test aegis-flow/services/open-chain/native.integration.test.mjs
```

O segundo teste gera uma STARK nova (vários minutos; reserve ao menos 6 GiB RAM),
gasta uma recompensa madura, propaga o bloco e revalida após reinício.
Não há simulação criptográfica no caminho de transferência desse teste.
Leia a [ADR-0006](../adr/ADR-0006-open-proof-of-work.md) antes de expor um nó.
