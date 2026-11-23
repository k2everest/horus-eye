# Carteira PoW e recuperação operacional

Estado: implementação de laboratório/staging; produção permanece bloqueada pelos
critérios criptográficos, econômicos e externos. Não usar com valor real.

## Carteira local

Use o genesis PoW V2 fixado por canal independente e um diretório novo. Não
converta um cofre permissionado em saldo PoW. Na raiz do repositório:

```bash
AEGIS_WALLET_CONFIG=work/open-genesis.json \
AEGIS_WALLET_DIR=work/pow-wallet \
AEGIS_POW_PEERS='["http://127.0.0.1:8090"]' \
  node aegis-flow/services/wallet-local/server.mjs
```

A interface /queer/wallet usa o mesmo pareamento privado em 127.0.0.1:8765. Ela
identifica o modo PoW, exibe o owner_tag público para mineração e informa que as
confirmações são probabilísticas. O endereço aegis_pow_receive2_ inclui a
identidade completa do genesis e não é intercambiável com o endereço legado.
Chaves/notes ficam no cofre AES-GCM/scrypt; só transação assinada/prova pública
saem do computador. O serviço local também executa uma réplica verificadora.

Saldo é derivado de blocos/provas revalidados, confirmações e maturidade da
recompensa. Notes gastas no tip ainda não confirmado não ficam disponíveis para
novo envio. A janela de 4096 notes limita aberturas ativas; excedentes são
recuperáveis do histórico cifrado, com total agregado confirmado e aviso na UI.
Uma reorganização reconstrói o saldo e retira saídas órfãs. Pagamentos próprios
órfãos recuperáveis são reservados e exigem reenvio explícito. A mudança de raiz
isoladamente não libera uma transação que pode ter sido entregue.

A reserva é gravada antes de provar e antes de transmitir. PREPARING é removido
no desbloqueio porque não houve transmissão; BROADCASTING sobrevive a erro de
transporte, restart e backup. Um backup de carteira guarda o trabalho já visto:
restaurar exige alcançar trabalho pelo menos igual, permitindo uma cadeia mais
curta com maior trabalho. Não há checkpoint de autoridade ou finalização absoluta.

Mantenha backups atualizados após operações. Um backup antigo não conhece intenções
criadas depois dele; mineração majoritária, isolamento e reorganizações continuam
riscos de PoW. O histórico local e a recuperação de intents têm orçamento: o
cofre rejeita excesso em vez de liberar silenciosamente reservas. Reorganizações
com muitas intenções e histórico grande precisam de ensaios prolongados antes de
release. Não alegar disponibilidade ilimitada a partir dos testes locais.

Um único processo deve usar cada perfil. Servidor da carteira, nó e CLI usam
flock do kernel Linux: o lock é liberado quando o processo morre, sem apagar um
arquivo de outro processo. A perda inesperada do lock encerra o dono para evitar
dois escritores. O arquivo de lock persistente não deve ser removido durante o
uso. Perfis antigos com PID de processo vivo são recusados na migração. A imagem
Linux de referência contém flock; outros ambientes precisam dessa ferramenta.
O agendador de backup usa o mesmo mecanismo. Testes locais exercitam exclusão,
liberação normal e reacquisição após SIGKILL do processo dono.

## Backup de nó PoW

O novo formato preserva branches e revalida o snapshot antes de cifrá-lo. Não
use o restaurador de certificados permissionados para um banco PoW.

```bash
node aegis-flow/scripts/pow-recovery.mjs create-key --key-file work/pow-backup.key
node aegis-flow/scripts/pow-recovery.mjs backup --genesis work/open-genesis.json \
  --directory work/node-a --backup-directory work/pow-backups \
  --key-file work/pow-backup.key
```

O snapshot usa a API de backup do SQLite, inclusive com WAL. Chaves nunca vão
para o manifest. AES-256-GCM autentica contexto, configuração e tip; checksum e
key ID permitem detectar corrupção/arquivo incorreto. Plaintext temporário fica
em diretório restrito e é removido. O destino de restore precisa ser novo.

```bash
node aegis-flow/scripts/pow-recovery.mjs restore --genesis work/open-genesis.json \
  --backup-directory work/pow-backups/BACKUP_ID --destination work/restored-node \
  --key-file work/pow-backup.key --minimum-work WORK_RECORDED_INDEPENDENTLY
```

minimum-work é um inteiro decimal adquirido/registrado fora do próprio backup,
por exemplo o watermark de uma réplica verificada. O manifest não atesta sua
própria atualidade. Restauração verifica genesis, PoW, dificuldade, STARK, raízes,
nullifiers e trabalho acumulado antes de publicar o diretório. Isso não garante
que o snapshot represente o tip global; sincronize peers independentes depois.

## S3 e deploy

O formato usa ledger.enc/manifest.json compatíveis com o transporte S3 existente:

```bash
node aegis-flow/scripts/pow-recovery.mjs upload \
  --backup-directory work/pow-backups/BACKUP_ID --s3-config /run/secrets/s3-target.json
node aegis-flow/scripts/pow-recovery.mjs download --backup-id BACKUP_ID \
  --destination work/downloaded-backup --s3-config /run/secrets/s3-target.json
```

Versionamento, bloqueio de acesso público, KMS, owner esperado, checksums e
receipt de versões continuam exigidos pelo cliente S3. scheduled-backup.mjs
seleciona PoW quando AEGIS_POW_GENESIS e AEGIS_POW_DIR estão configurados, junto
com AEGIS_BACKUP_DIRECTORY, AEGIS_BACKUP_KEY_FILE e AEGIS_S3_CONFIG. O agendamento
precisa de espaço, retenção, alertas e supervisão de lock; o bucket real e o
ensaio externo ainda dependem de provisionamento/configuração.

A composição deployments/open-pow/compose.yaml executa a imagem imutável
construída do commit revisado, com diretório exclusivo por nó, raiz read-only,
limites e logs rotacionados. Não compartilhar um SQLite entre hosts/réplicas.
Carteira/prover não precisam ficar expostos publicamente. Não foi construído ou
implantado um novo artefato de produção nesta etapa.

GET /readyz distingue verificador/capacidade de um processo vivo. GET /metrics
expõe altura, idade do tip, mempool e retenção/cache, sem chaves. Alertar idade
do tip, indisponibilidade do verifier, capacidade próxima ao limite, peers sem
sincronização e falhas/atraso de backup. Esses endpoints não certificam consenso
honesto nem prontidão de produção.

## Evidência local

AEGIS_POW_WALLET_INTEGRATION=1 node --test
services/open-chain/wallet.integration.test.mjs gera STARK nova e verifica envio,
recebimento, reorganização confirmada, reserva de órfãos, backup da carteira e
backup/restauração do nó com revalidação. Os testes de contrato não substituem
30 dias públicos, restauração no S3 real ou auditoria independente.

Destino definido: bucket queer-altcoin, us-east-2, owner 941554679497, prefixo
aegis/pow/v2. Inspeção de KMS/IAM, uploads retomáveis, fila durável e ensaio
completo: [queer-altcoin-s3.md](queer-altcoin-s3.md). O bucket real ainda precisa
de inspeção autenticada; o relatório local registrou AWS_CLI_REQUIRED.
