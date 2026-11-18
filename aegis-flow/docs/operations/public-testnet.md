# P1 — Campanha pública prolongada

**Estado: ferramentas e ensaio local; P1 ainda não concluído.** Uma execução curta,
recibos STARK reaproveitados ou participantes gerados pelo autor não comprovam
30 dias de uso público. Esta campanha não remove auditoria, segurança STARK de
128 bits, gestão de chaves ou os demais bloqueios de produção financeira.

Este documento detalha o harness do settlement permissionado anterior, que
não comprova confirmações PoW. Para a rede descentralizada, use o
[procedimento PoW sem dependência de provedor](pow-operations.md).

## Requisitos para iniciar a janela

- Host/URL HTTPS públicos autorizados e estáveis, imagem imutável registrada,
  gateway com RBAC/quotas/TLS e disco persistente local; SQLite continua em um host.
- Configuração, genesis e checkpoint inicial obtidos por canal independente. O
  observador não aprende sua raiz de confiança automaticamente do mesmo gateway.
- Autoridade de laboratório, emissão regular de finalizações e publicação externa
  das âncoras. Não há consenso BFT ou failover automático de notário. Não mantenha
  duas cópias capazes de assinar após uma recuperação.
- Recuperação externa ensaiada e backups privados de chaves protegidos. S3/IAM/KMS
  são uma integração opcional, não um requisito da blockchain.
- Monitoramento/alertas efetivamente instalados, escala de atendimento, orçamento
  de execução/disco/rede, política de retenção e participantes externos cadastrados.
- Ativos sem valor, identidades exclusivas para laboratório, termos/consentimento
  claros e canal de suporte. Não aceitar depósitos/vender tokens ou reutilizar
  chaves de produção. O modo permanece `demo` mesmo com exposição pública testnet.

Sem esses requisitos, execute somente `environment: local-rehearsal`. O descriptor
exige HTTPS e release imutável para `public-testnet`; esse rótulo não comprova que
DNS, infraestrutura ou observadores são públicos/independentes. Isso é revisado
externamente ao aceitar a campanha.

## Campanha e critérios propostos

Use `deployments/testnet/campaign.example.json` substituindo placeholders por
config ID, release, origem e âncora reais. O assessor impõe os mínimos abaixo;
não há flag para reduzir a janela e chamar um smoke de campanha prolongada.

| Critério | Mínimo proposto |
| --- | --- |
| Duração observada | 30 dias completos; agendar 31 dias dá margem ao intervalo de coleta |
| Probes de liveness | A cada 30 s; slots ausentes contam como falhas na razão ajustada |
| Disponibilidade | >=99,9% de slots e >=99,9% de aceitação nominal de replay |
| Continuidade | >=95% dos intervalos de 15 min cobertos; lacuna máxima de 6 h |
| Carga do verificador | >=10.000 submits nominais com recibos STARK realmente verificados |
| Transferências novas | >=1.000 IDs distintos, provas/finalizações verificadas e atividade em >=21 dias UTC |
| Latência ponta a ponta | p95 <=20 min, incluindo prova, submissão, espera e conferência |
| Terceiros | >=10 participantes externos revisados, cada um com >=10 transações próprias e roteiro assinado |
| Falhas externas | gateway-kill, network-partition, disk-full e recuperação de host sem exigir um provedor |
| Recuperação | <=2 min para as três primeiras; <=60 min para recuperação de host |

Esses são **alvos para homologar**, não SLAs demonstrados. Não excluir manutenção
ou 429/503 de carga nominal para melhorar artificialmente disponibilidade. Stress
fora do orçamento é reportado separadamente; liveness não é liquidação financeira.
Mudar commit/config/autoridade, fazer reset de genesis, perder dados finalizados
ou corrigir falha crítica exige registrar o corte e definir nova janela de
estabilidade na revisão; não concatenar ambientes incompatíveis no mesmo relatório.

## Duas cargas diferentes

**Replay de recibos válidos** mede caminho HTTP/verificação: o cliente verifica
localmente o corpus por backend STARK nativo, e o gateway verifica de novo antes
da idempotência. O assessor não soma isso ao número de novas transações. Provas
mock/flags antigas ou corpus com tx duplicada são rejeitados. Não inferir TPS de
novas transferências de um benchmark de replay.

**Fresh** usa uma carteira local pareada, desbloqueada e financiada pelo estado
verificado. O runner faz uma transferência para o próprio endereço, com note/
randomness/tx ID novos, prova local e confirmação via réplica da carteira. Não
cria saldo nem faz mint. Ele exige certificado da autoridade, STARK e binding
vinculados à nova submissão, além de altura posterior ao checkpoint inicial.
Outros destinatários e fluxos de recebimento são exercitados pelos participantes.

O cliente atual exige Node >=24.8, binários RISC Zero aprovados para Linux x86_64
e memória adequada; o ensaio consumiu aproximadamente 2,3 GiB no prover. Reserve
pelo menos 4 GiB por provador e valide o hardware dos participantes. Não há
prover mobile/browser completo nesta etapa.

O provador atual pode levar minutos por transação e a carteira seleciona até
quatro inputs. Planeje vários clientes, limites de CPU e baseline antes de
prometer taxa. O cofre limita notes/histórico; mantenha menos de 4.096 notes por
perfil nesta fase e distribua a campanha entre perfis de teste independentes.
Não remova histórico à mão para esconder esse limite. O armazenamento de proofs,
réplicas, journals e snapshots opcionais precisa de orçamento/retencão próprios.

## Executar os observadores e geradores

Exemplos na raiz do repo, depois de configurar a rede real e credenciais:

```sh
node aegis-flow/scripts/testnet-campaign.mjs observe --campaign work/campaign.json --config work/network-config.json --directory work/observer-a --observer observer-a --duration-ms 2678400000 --interval-ms 30000
node aegis-flow/scripts/testnet-campaign.mjs replay --campaign work/campaign.json --config work/network-config.json --directory work/replay-a --observer replay-a --corpus work/public-corpus.json --token-file /run/secrets/testnet-submit.token --count 43200 --interval-ms 60000 --budget nominal
node aegis-flow/scripts/testnet-campaign.mjs fresh --campaign work/campaign.json --config work/network-config.json --directory work/participant-a --observer participant-a --token-file /path/to/local-wallet/pairing-token --count 10
```

`public-corpus.json` é um array de `{transaction, proof}` públicos, da rede fixada.
O máximo do corpus é 64. Mesmo um corpus de um recibo exercita o SDK real, mas o
relatório mostra a diversidade e o caracteriza como replay. A carga é sequencial
por worker; concorrência exige workers/diretórios distintos, credenciais e janelas
de stress aprovadas. Intervalo nominal de 60 s deixa orçamento para uso humano.
Não use a ferramenta contra rede/URL de terceiros sem autorização.

Fresh usa por padrão `http://127.0.0.1:8765`, admite outro port **somente no
loopback 127.0.0.1** e não recebe senha/private key/witness. Desbloqueie pela
interface local. O runner não desabilita bloqueio do cofre; requisições mantêm
atividade conforme a política existente. Um envio pendente/expirado requer
conferência/retry seguro, não criação de um segundo gasto. O timeout de finalização
registra falha e conserva as reservas da carteira.

Tokens são carregados de arquivos 0400/0600; não os ponha em argumentos, URLs,
config pública ou journals. Credenciais expiram em sete dias: rote a cada semana
por canal seguro e substitua o arquivo. O cliente relê o token a cada requisição.
A autoridade/finalizer tem papel e chaves separados; participante não ganha esse
poder. Planeje operador/serviço de finalização e âncoras antes de iniciar fresh.

`deployments/testnet/observer.service` é um exemplo de systemd para o observador,
com novo journal após reinício. Os paths/OBSERVER_ID ficam em arquivo de parâmetros
sem segredos; prepare os diretórios e usuário. Nenhum serviço prolongado foi
instalado/ativado por esta mudança. Falha/reinício do coletor não apaga as lacunas.

## Cadastro e uso por terceiros

Use pessoas/equipes fora da autoria da implementação, idealmente em redes e
provedores distintos. O operador fornece apenas credencial reader+submitter,
config/anchor fixados, endereço público, versão do software e roteiro. Nunca
peça senha do cofre, PEM privado, spend secret ou note aberta.

Cada participante deve criar/bloquear/desbloquear o cofre, exportar backup,
restaurar em perfil vazio, receber ativos de teste aprovados, enviar e conferir
saldo/finalização. O crédito inicial vem de alocação de genesis aprovada ou
transferência real de tesouraria testnet; não há faucet fictício/public mint.
Inclua interrupção/retry, estado atrasado e recusa de rede/endereço incorretos.
Guarde feedback/defeitos em canal com consentimento, sem segredos ou PII nos logs.

O endpoint **local pareado** `GET /transfers/:request_id` exporta somente o bundle
público já finalizado de uma transação assinada pela própria carteira. O runner
confronta a prova/certificado e salva artefato público por tx ID. Não exporta
notes, chave privada ou witness. O status pareado inclui `signer_tag` público
para vincular cadastro às transações, com ciência do participante sobre essa
vinculação pública.

Um registro de observadores é um array de:

```text
{ observer_id, role: participant|operator, public_key: SPKI_ML_DSA_65,
  wallet_signer_tag: TAG_DA_CARTEIRA, independence_reviewed: true,
  review_reference_sha256: HASH_DA_REVISAO_DE_CADASTRO }
```

O revisor registra independência por processo externo; dez chaves geradas pela
mesma pessoa não comprovam dez terceiros. Não publique dados pessoais nesse
registro. Chaves de relatório duplicadas são recusadas. Use uma identidade
ML-DSA-65 separada só para relatórios, protegida localmente: não exporte a chave
principal do cofre para assinar o relatório.

Relatório de participante: payload com campos exatos `kind: participant`,
`campaign_id`, `config_id`, `observer_id`, `transactions` (IDs próprios), `heads`
(hashes terminais de seus journals) e `flows` (`create`, `backup`, `restore`, `send`,
`receive`, `sync`, `lock`). Assine com a identidade de relatório cadastrada:

```sh
node aegis-flow/scripts/testnet-campaign.mjs sign-report --input work/report-payload.json --key-file /secure/report-only-private.pem --output work/report-signed.json
```

A assinatura é ML-DSA real sobre domínio separado; não é aprovação automática.
O assessor só conta IDs verificados cujo sender tag corresponde à carteira
cadastrada, vinculados a um head do mesmo observador. O revisor deve conferir
feedback e evidência dos fluxos, porque uma declaração assinada pode ser falsa.

## Falhas e recuperação

Execute falhas **só em host, disco e rede de teste dedicados**, com escopo revisado,
console fora de banda e possibilidade de contenção. Não aplique encher disco,
firewall ou kill em máquinas de produção/usuários deste workspace.

| Cenário | Conferência obrigatória |
| --- | --- |
| SIGKILL do gateway | Reiniciar mesma imagem/dados; nenhuma inclusão parcial, replay idempotente, mesmo checkpoint finalizado |
| Partição de rede | Falhas/timeouts observáveis, reserva de inputs preservada, reconexão sem crédito/gasto duplicado |
| Disco cheio | Usar filesystem/volume descartável ou quota; rollback de SQLite, sem recibo de sucesso parcial; recuperar espaço e repetir com segurança |
| Perda de host | Cercar host/autoridade antiga; buscar versões S3, recuperar chave por escrow e restaurar com âncora independente antes de assinar |

Registre commit/imagem, config ID, checkpoints antes/depois, início/fim, métricas,
logs redigidos e hashes dos artefatos. Um HTTP 503 injetado não equivale a perda de
host, partição ou disco cheio. O runner não aplica falhas remotas automaticamente.
Use o runbook de infraestrutura/segurança para incidentes e restauração. O ensaio
local SIGKILL/restore demonstra um caminho, não a recuperação num ambiente externo.

Relatório de falha, assinado por observador cadastrado como operator: campos exatos
`kind: infrastructure_drill`, `campaign_id`, `config_id`, `observer_id`, `scenario`
(`gateway-kill`, `network-partition`, `disk-full`, `host-recovery`),
`artifact_sha256`, `measured_recovery_ms`, `recovered` e `external_environment`.
O assessor exige recuperação e RTO alvo; assinatura/autodeclaração não comprova
sozinha que a infraestrutura falhou. A revisão independente examina o artefato.

## Evidência e aceitação

Journals NDJSON têm sequência, SHA-256 encadeado, campos restritos e fsync. Detectam
corrupção/reordenação, mas quem controla o arquivo pode reescrever a cadeia ou
remover seu final. O arquivo vizinho `.jsonl.head.json` é atualizado atomicamente a cada evento.
Publique esses heads regularmente em armazenamento/observadores
independentes; não os trate como assinatura ou relógio confiável por si só.
Journals têm ambiente/release/config/âncora fixados e artefatos públicos. Separe
logs por observador/execução; não execute writers concorrentes no mesmo arquivo.

Crie `journals.json` com a lista de paths, `registry.json` com os cadastros revisados
e `reports.json` com envelopes assinados. Depois:

```sh
node aegis-flow/scripts/testnet-campaign.mjs assess --campaign work/campaign.json --config work/network-config.json --journals work/journals.json --registry work/registry.json --reports work/reports.json --output work/assessment.json
```

O assessor revalida provas e certificados dos artefatos; rejeita arquivo trocado e
não conta tx duplicada como fresh. Limites de latência nominal são superiores de
buckets p50/p95/p99; p95 ponta a ponta usa amostras de finalizações únicas.
Probes faltantes de 30 s contam como falha na razão ajustada, não são descartados.
Assinaturas de terceiros precisam de cadastro prévio, referência de revisão,
transações próprias e heads correspondentes. O replay completo do ledger a partir
do genesis, usando as ferramentas de recuperação, continua necessário para
revisar toda a cadeia além dos bundles individuais/certificados.

O comando `gate` aceita os mesmos argumentos de `assess` e retorna código 1
enquanto P1 não tiver aceitação independente; `assess` é diagnóstico, com saída
zero mesmo quando os critérios ainda não foram atendidos.

O resultado separa `automated_checks_met` de `p1_completed`. **P1 permanece false
na ferramenta**: aceitação independente deve conferir alcance público, identidade
dos terceiros, clocks, imagem realmente implantada, dados brutos, falhas reais e
incidentes. Não existe flag para liberar produção por uma etiqueta JSON. Uma
campanha aprovada ainda não substitui auditoria criptográfica dos P0 existentes.

Verificação local:

```sh
bash aegis-flow/scripts/dev-env.sh test
AEGIS_TESTNET_INTEGRATION=1 node --test aegis-flow/services/testnet/campaign.integration.test.mjs
```

O ensaio nativo gera uma prova nova por HTTP/carteira local, finaliza, reenvia o
recibo três vezes sem criar outros blocos, mata o processo de gateway com SIGKILL,
recupera o checkpoint e restaura backup AES-GCM com replay. Não é testnet pública,
não envolve terceiros e não mede 30 dias ou disponibilidade/RTO de infraestrutura
externa. Nenhum convite/mensagem foi enviado a pessoas por esta etapa.
