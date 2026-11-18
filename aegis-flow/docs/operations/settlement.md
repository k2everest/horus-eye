# Settlement permissionado: operação de laboratório

Modelo e fronteiras de confiança: [ADR-0005](../adr/ADR-0005-permissioned-settlement.md).
Os comandos abaixo partem da raiz do repo. Não habilitam produção.

## Inicialização

Use um ledger persistente com genesis previamente aprovado/importado offline.
Provisione uma identidade ML-DSA-65 separada para a autoridade; o gateway recebe
apenas a chave pública/configuração. O CLI de assinatura exige arquivo PKCS8
sem permissões de grupo/outros (modo 0600) e runtime Node >=24.8. Proteção de
chaves por HSM/KMS e rotação ainda não estão implementadas.

Construa um arquivo público de configuração com exatamente estes campos:

| Campo | Valor |
| --- | --- |
| schema | `AEGIS_PERMISSIONED_SETTLEMENT_V1` |
| network_id | Identificador idêntico ao ledger e às transações |
| genesis_root / genesis_count | Raiz e quantidade de commitments do genesis confiável |
| program_id | Image ID aprovado em `services/proof-engine/program.json` |
| authority_public_key | PEM SPKI canônico ML-DSA-65 |
| authority_tag | Resultado de `signerTag(publicKey, 'ML-DSA-65')` do crypto-core |
| signature_algorithm | `ML-DSA-65` |

Instale essa configuração antes de aplicar a primeira transação. Um banco já
usado sem settlement não é convertido implicitamente: crie uma réplica com o
mesmo genesis, configure-a e reexecute suas transações verificáveis.

```sh
node aegis-flow/scripts/settlement-admin.mjs init --ledger work/authority.sqlite --network aegis-lab-v1 --config work/settlement-config.json
node aegis-flow/scripts/settlement-admin.mjs status --ledger work/authority.sqlite --network aegis-lab-v1
```

Distribua o arquivo público/config ID por canal confiável. Salve o objeto
`finalized` do status como âncora JSON em armazenamento independente. Ele contém
`height` e `checkpoint_id`; root/count extras são informativos. Nesta primeira
etapa a altura é zero. Os caminhos abaixo são exemplos de arquivos de trabalho;
o CLI não cria nem protege automaticamente um serviço externo de âncoras.

## Inclusão e finalização

`POST /submit` continua recebendo somente `{transaction, proof}`. Só retorna
inclusão após assinatura, STARK e aplicação atômica. A autoridade executa:

```sh
node aegis-flow/scripts/settlement-admin.mjs notarize --ledger work/authority.sqlite --network aegis-lab-v1 --key work/authority-private.pem --anchor work/trusted-finality-anchor.json
```

O comando revalida a prova e finaliza exatamente a próxima altura. A âncora deve
corresponder ao head finalizado atual. Grave o certificado retornado e atualize
o registro externo da âncora a partir do status antes da próxima emissão. Se o
processo cair depois do commit, recupere o certificado com `export`/HTTP; não
restaure um backup antigo para tentar assinar de novo. Use SQLite backup API
(`ledger.backupTo`) para backups consistentes com WAL.

Rotas públicas disponíveis quando settlement estiver configurado:

| Rota | Evidência |
| --- | --- |
| `GET /settlement/config` | Configuração pública; autenticar por canal independente |
| `GET /settlement/status` | Heads incluído e finalizado separados |
| `GET /settlement/certificates/:height` | Certificado da altura finalizada |
| `GET /settlement/blocks/:height` | Transação pública, STARK e certificado para replay |
| `GET /settlement/proof/:commitment` | Inclusão na raiz finalizada, checkpoint e certificado |
| `POST /settlement/certificates` | `{certificate}`; apenas importa assinatura válida para estado local correspondente |
| `GET /receipts/:request` | Inclusão pendente, finalização permissionada ou ORPHANED |

O gateway não recebe chave privada, não assina e não expõe rewind por HTTP.
`/ledger/root` e `/ledger/proof/:commitment` continuam representando o head
incluído, que pode conter transações pendentes. A carteira deve distinguir isso
de uma raiz finalizada e verificar a âncora/certificados com a chave fixada.

O processo do gateway aceita `AEGIS_SETTLEMENT_CONFIG_PATH` para conferir a
configuração e `AEGIS_FINALITY_ANCHOR_PATH` para conferir a âncora ao abrir o
banco. Na recuperação, configure ambos explicitamente. Configurações existentes
no banco são verificadas ao reiniciar, mesmo sem o arquivo de configuração.

## Recuperação de réplica

Importe o mesmo genesis e configuração confiáveis em um banco novo. Exporte os
bundles finalizados da autoridade e faça replay sequencial, começando em 1:

```sh
node aegis-flow/scripts/settlement-admin.mjs export --ledger work/authority.sqlite --network aegis-lab-v1 --height 1 > work/finalized-1.json
node aegis-flow/scripts/settlement-admin.mjs replay --ledger work/replica.sqlite --network aegis-lab-v1 --bundle work/finalized-1.json
node aegis-flow/scripts/settlement-admin.mjs verify-anchor --ledger work/replica.sqlite --network aegis-lab-v1 --anchor work/trusted-finality-anchor.json
```

Repita `export`/`replay` para cada altura até atingir a âncora conhecida. Não
sirva a réplica antes de `verify-anchor` passar. O replay verifica STARKs reais;
um certificado não substitui os dados/provas das transações. Uma âncora antiga
permite conferir apenas o prefixo conhecido, não comprova ausência de uma
finalização mais recente. Não execute duas autoridades com a mesma chave em
bancos separados: o SQLite serializa escritores de um arquivo, não duas cópias.

## Reorganização administrativa

```sh
node aegis-flow/scripts/settlement-admin.mjs rewind --ledger work/authority.sqlite --network aegis-lab-v1 --anchor work/trusted-finality-anchor.json
```

Remove todo o sufixo ainda não finalizado e preserva o prefixo certificado.
Reenvie transações alternativas por `/submit` com prova/anchor compatíveis;
transações dependentes dos outputs removidos precisarão ser reconstruídas.
Certificado conflitante nunca autoriza apagar uma altura finalizada. Investigue
equivocação/corrupção e interrompa a operação; não escolha uma história apenas
por ser mais longa.

## Verificação

```sh
bash aegis-flow/scripts/dev-env.sh test
AEGIS_SETTLEMENT_INTEGRATION=1 node --test aegis-flow/services/ledger-state/settlement.integration.test.mjs
```

A integração usa o bundle público real em `work/stark-smoke-public.json`, ou
`AEGIS_SETTLEMENT_PUBLIC_ARTIFACT`, e requer o verificador nativo configurado.
Os testes rápidos usam um double explícito só para isolar regras de storage;
ele não é disponibilizado no runtime. Os bloqueios de produção e de 128 bits
pós-quânticos permanecem ativos.
