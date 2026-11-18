# Segurança operacional — laboratório e preparação de release

Os controles desta etapa não removem o bloqueio de produção. Não foram
implantados serviços, contratado SOC, configurados destinatários de alertas nem
realizado pentest independente.

## Fronteiras de acesso

O gateway inicia em loopback por padrão. Sem política, somente conexões de
loopback usam o modo demo sem credencial; ele não é uma opção de acesso remoto.
O startup em host remoto exige política e TLS. Configure `AEGIS_BIND_HOST`,
`AEGIS_ACCESS_POLICY_PATH`, `AEGIS_TLS_CERT_FILE` e `AEGIS_TLS_KEY_FILE`. TLS mínimo
é 1.3, com certificado válido e renovação operacional. Isso autentica/protege o
transporte convencional, não demonstra TLS ou STARK com 128 bits pós-quânticos.

A política JSON V1 contém apenas hashes SHA-256 de tokens aleatórios de 32 bytes,
IDs, funções, expiração em epoch milliseconds e `incident_mode`. É relida a cada
requisição; remoção, expiração ou corrupção falham fechadas. Operações já
admitidas podem terminar após revogação; contenção imediata requer bloquear o
ingresso e parar o processo. Não há endpoint administrativo para editar política,
assinar finalização ou reorganizar ledger.

| Função | Acesso |
| --- | --- |
| reader | GETs de ledger, recibos, transações e settlement |
| submitter | POST /validate e /submit |
| finalizer | POST /settlement/certificates; certificado válido continua obrigatório |
| monitor | GET /metrics e /readyz |

`/healthz` é liveness sem credencial: não significa prontidão ou autorização de
produção. `/readyz` exige ledger e verificador disponíveis e modo normal; responde
503 nos outros casos. O modo `read-only` rejeita POSTs; `halt` rejeita tráfego de
negócio. Liveness, readiness e métricas continuam disponíveis conforme sua função.

Emissor/revogador offline, executado por administrador do host:

```sh
node aegis-flow/scripts/ops-access.mjs issue work/security wallet reader,submitter
node aegis-flow/scripts/ops-access.mjs issue work/security finalizer finalizer
node aegis-flow/scripts/ops-access.mjs issue work/security monitor monitor
node aegis-flow/scripts/ops-access.mjs revoke work/security wallet
```

O CLI imprime somente caminhos e validade (sete dias), nunca o token. Reemitir o
mesmo ID substitui o hash e revoga a credencial anterior para novas requisições;
usa outro arquivo de token para permitir distribuição explícita. Entregue o
arquivo por canal de segredos confiável, atualize o cliente, teste o novo acesso
e destrua cópias antigas segundo a política de retenção. O CLI serializa mudanças
com `policy.lock`; após crash, confira o PID antes de remover um lock órfão.
Restrinja a administração desse diretório: quem pode escrever a política pode
conceder acesso. Não altere a política simultaneamente por outros mecanismos.

## Gestão de segredos e transporte

Arquivos de política, token e chave TLS devem ser regulares, sem symlinks e sem
permissões para grupo/outros (0400/0600), acessíveis ao usuário do serviço. Monte
segredos como arquivos restritos; não coloque tokens em URLs, frontend, Git,
variáveis contendo o valor, imagens Docker ou logs. Certificado público não é
segredo. O carregador rejeita tipo, permissões, tamanho ou conteúdo inválidos.

A carteira local recebe `AEGIS_GATEWAY_TOKEN_FILE` apontando ao token de um
principal reader+submitter. Ela relê o arquivo a cada requisição e envia o Bearer
somente ao gateway HTTPS ou loopback fixado na inicialização, sem seguir
redirecionamentos. A chave da autoridade continua offline; credencial finalizer
não permite assinar certificados. O token de pareamento da carteira continua
local, diferente da credencial do gateway e da senha do cofre.

Use um gerenciador de segredos externo para emissão/distribuição operacional,
controle de administradores e trilhas de acesso. Esta etapa fornece o contrato
por arquivos, não uma integração implantada com KMS/HSM/Secret Manager ou mTLS.
Rotação de certificado/chave TLS requer reinício controlado; rotação/revogação de
identidades criptográficas do protocolo permanece uma tarefa distinta.

## Limites de abuso

Defaults por processo: 128 conexões, headers até 16 KiB, 100 requests por socket,
keepalive de 5 s, timeout de headers 10 s/body 15 s e socket 15 s. Até oito corpos
em admissão; validação até 64 KiB, submit até 12 MiB, um verificador ativo.
Contadores com janela de 60 s: 1.200 requests globais, 600/IP, 300 leituras por
principal e 10 escritas por principal. Resposta 429 inclui Retry-After. O mapa de
rate limit tem no máximo 4.096 chaves; saturação rejeita novas entradas, sem
crescimento ilimitado. O teste de carga nominal usa orçamento explicitamente
maior; rejeição por quota não é demonstração de disponibilidade de produção.

A identidade IP vem do socket; X-Forwarded-For não é confiado. Um proxy local
concentra o limite de IP; as quotas de principal continuam separadas. Limites são
locais e reiniciam com o processo. Distribuição multi-instância, limites de
banda/conexões na borda e proteção volumétrica exigem infraestrutura adicional.

O Compose padrão usa host networking para loopback em Linux, sem publicação de
porta em todas as interfaces, e limita memória/CPU/PIDs/FDs, remove capabilities
e usa filesystem read-only. Docker Desktop pode exigir suporte explícito a host
networking; alternativamente execute o serviço diretamente no loopback. Não
substitua isso por bind público sem política/TLS. Uma exposição remota é uma
configuração separada revisada, não feita por estes comandos.

## Monitoramento

`/metrics` publica formato Prometheus com contadores por rota e classe HTTP,
soma/count de latência, corpos em andamento, verificador ocupado e readiness.
Não inclui URLs, IDs de transação, IPs, tokens, notes ou cardinalidade controlada
por entradas de clientes. Logs de gateway autenticado têm ID aleatório de
requisição gerado pelo servidor, principal da política, classe de rota, resultado,
latência e motivos operacionais. Não logam corpos/headers/URLs de negócio.

Exemplos em `deployments/monitoring/`: scrape TLS com token monitor por arquivo e
regras de indisponibilidade, readiness, erros, rejeições e verificador preso.
Configure Alertmanager, escalas e destinos fora desses exemplos. Valide regras
com `promtool check rules` e confirme entrega em staging antes de liberar. Não
há Prometheus/Alertmanager em execução por esta mudança nem SLO real comprovado.

Logs Docker têm rotação de 10 MiB, três arquivos. Em operação, exporte para
armazenamento de auditoria com acesso/retenção controlados e relógio sincronizado.
Monitore também validade de certificados/tokens, disco/WAL, backups e disponibilidade
dos bundles; essas medições de infraestrutura ainda dependem do ambiente implantado.

## Resposta a incidentes

1. Declare incidente, registre responsável, horário, commit/imagem/config ID e
   último checkpoint confiável; preserve logs e evidências sem exportar segredos.
2. Para abuso ou suspeita de gasto indevido, suspenda escritas:
   `node aegis-flow/scripts/ops-access.mjs incident work/security read-only`.
   Para comprometimento grave, use `halt`, bloqueie o ingresso e pare processos
   emissores/assinadores. Não dependa só da revogação para interromper trabalho
   já iniciado.
3. Revogue credenciais afetadas, distribua novas credenciais por canal independente
   e investigue acesso ao host/cofre/autoridade. Se a chave da autoridade foi
   exposta, interrompa finalizações: trocar um Bearer não revoga essa chave nem
   resolve uma história equivocada.
4. Faça backup SQLite consistente; não copie apenas o arquivo principal com WAL
   ativo. Preserve bundles e certificados. Investigue corrupção ou conflito com
   âncoras independentes. Nunca apague/reorganize o prefixo finalizado para ocultar
   um incidente. Recupere uma réplica isolada e execute `verify-anchor` conforme
   o runbook de settlement antes de servir ou assinar.
5. Corrija, execute testes/reteste e confirme monitoramento e revogação. Reabra
   leituras/escritas gradualmente com autorização do responsável pelo incidente:
   `node aegis-flow/scripts/ops-access.mjs incident work/security normal`.
6. Documente causa, impacto, checkpoints afetados, evidências e ações preventivas.
   Exercite esse procedimento em staging; produção continua dependente de auditoria,
   teste de restauração, proteção das chaves e dos demais P0 de segurança.

Os testes automatizados exercitam RBAC, expiração, revogação imediata, arquivos
restritos, rejeição de forwarding forjado, quotas, política inválida e modos de
incidente. Eles não substituem um exercício operacional com pessoas e infraestrutura.
