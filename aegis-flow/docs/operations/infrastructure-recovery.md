# Infraestrutura e recuperação em um host

Estado: implementação e ensaios locais; sem implantação financeira autorizada.
SQLite permanece **single-host**. Não há HA, réplica gravável multi-host, NFS ou
consenso acrescentado por esta etapa. O bloqueio `AEGIS_MODE=demo` continua ativo.

## Artefato e deploy reproduzível

`Dockerfile` fixa digests Linux/amd64 de Debian/Node, rustup por hash, Rust por
versão e dependências Cargo por lock. O candidato é construído de um commit limpo,
rotulado com esse SHA e fixado por ID OCI/digest. Dependências apt do builder
não estão em snapshot imutável: não se promete build bit a bit idêntico. O
**deploy do mesmo artefato** é reproduzível por digest; preserve-o no registry ou
em `docker save`, junto do manifesto e sua cadeia de custódia.

```sh
node aegis-flow/scripts/build-release.mjs
node aegis-flow/scripts/prepare-release.mjs aegis-flow/validation-gateway:COMMIT work/release-COMMIT
node aegis-flow/scripts/verify-release.mjs work/release-COMMIT COMMIT
```

Substitua COMMIT pelo SHA completo. `release.json` vincula commit, ID/digest da
imagem, plataforma, Node, schema, image ID do programa, hash do verificador e do
Compose. `prepare-release` recusa árvore suja e imagem sem rótulo correspondente;
`verify-release` confere imagem carregada e manifesto contra um commit obtido por
canal confiável. O manifesto não assina a si mesmo nem substitui revisão, SBOM,
scanning, assinatura de release ou atestação independente. Preserve também o
manifesto de auditoria. A imagem de gateway não inclui chave de autoridade/cofre.

No host alvo: Linux/amd64, Docker/Compose, runtime/verificador aprovados e disco
persistente local ext4/XFS/btrfs ou equivalente com locking POSIX e fsync reais.
Não use SQLite sobre NFS/CIFS/S3/FUSE ou disco efêmero de Cloud Run. O diretório
de dados precisa sobreviver ao container e pertencer ao UID/GID 1000 da imagem.
Somente **um host ativo**, uma instância de gateway e a autoridade autorizada;
não compartilhe cópias do banco entre servidores que possam assinar/escrever.

O Compose de staging está em `deployments/single-host/compose.yaml`: sem build
no host alvo, sem pull implícito, uma réplica, bind local persistente obrigatório,
filesystem read-only, limites de recursos e gateway em loopback autenticado.
Use `docker load` do arquivo preservado ou pull explícito do digest antes de
verificá-lo. Configure em arquivo local de parâmetros públicos:

```text
AEGIS_RELEASE_IMAGE=sha256:ID_CONFIG_DA_IMAGEM
AEGIS_NETWORK_ID=aegis-lab-v1
AEGIS_LEDGER_DIR=/var/lib/aegis
AEGIS_POLICY_DIR=/etc/aegis/policy
AEGIS_PUBLIC_CONFIG_DIR=/etc/aegis/public
AEGIS_GATEWAY_PORT=8081
```

Não use o texto placeholder como valor. O diretório público contém `config.json`
e `anchor.json` confiáveis; o diretório de política contém apenas política e
arquivos administrativos, **nenhum token bruto**. Diretórios, e não bind mounts de
arquivos individuais, permitem observar rename atômico durante revogações e
atualizações de âncora. Emita credenciais com `AEGIS_TOKEN_OUTPUT_DIR` separado.
Confira permissões e não monte o diretório de credenciais no gateway.

Após revisão dos parâmetros, migração e verificação do artefato:

```sh
docker compose --env-file /etc/aegis/staging.env -f work/release-COMMIT/compose.yaml config --quiet
docker compose --env-file /etc/aegis/staging.env -f work/release-COMMIT/compose.yaml up --detach --wait
```

Esses comandos não foram executados em um host externo. Exposição remota exige
TLS/ingresso e revisão de segurança conforme `security.md`; não abra o loopback
anonimamente por um proxy. Healthcheck mede liveness, não finalidade, prontidão
financeira ou presença de backup externo. Verifique `/readyz` autenticado e a
âncora antes de admitir tráfego. Não execute signer/autoridade em duas máquinas.

## Migrações e troca de versão

Schema atual: v3. Migrações v1→v2→v3 são transacionais, com checksums e validação
da estrutura/triggers. Bancos legados recebem proveniência `legacy-baseline`;
isso registra a estrutura reconhecida, não inventa histórico de execução.
Alteração de hashes ou schema inesperado falha fechada. Não há down migration.

O deploy single-host exige `AEGIS_REQUIRE_MIGRATED=1`. Antes de atualizar:

1. Suspenda escritas com política de incidente, pare gateway, jobs e notarizador;
   confirme que não restou escritor. O modo read-only sozinho não para CLIs.
2. Preserve imagem/manifesto anteriores, âncora externa e um backup externo validado.
3. Execute uma cópia SQLite **antes** de abrir o app/migrar:

```sh
node aegis-flow/scripts/recovery.mjs migrate --ledger /var/lib/aegis/ledger.sqlite --network aegis-lab-v1 --pre-migration-backup /var/lib/aegis-backups/pre-upgrade.sqlite
```

4. Confira schema/estado, teste nova imagem contra cópia isolada e só então suba.
   O snapshot pré-migração é local e sem criptografia de aplicação; proteja o disco,
   não o publique no S3 diretamente e aplique retenção adequada.
5. Em falha, prefira corrigir para frente. Rollback de imagem não reverte schema nem
   finalizações. Nunca force `user_version` para enganar um binário antigo. Reverter
   banco só é admissível com análise de compatibilidade, escritores parados e
   comparação com a âncora externa; nenhuma finalidade conhecida pode ser perdida.

A migração pode ser ensaiada sobre backup. Arquivos novos precisam de inicialização
offline/genesis aprovado; o gateway de deploy não cria silenciosamente uma rede vazia.

## Backup S3

Integração: AWS CLI **v2 recente**, suporte a `put-object --if-none-match`, IAM role
dedicada ou arquivo de credenciais restrito. Nenhuma credencial é solicitada no
chat ou gravada no Git. Modelo CloudFormation em
`deployments/single-host/s3-backups.cloudformation.yaml`: bucket privado versionado,
SSE-KMS, HTTPS obrigatório, retenção do recurso em exclusão da stack e permissões
limitadas ao prefixo. Ainda exige revisão/provisionamento AWS. Não há Object Lock,
replicação entre contas/regiões ou política automática de expiração nesta versão;
defina retenção/custo e segregação de funções antes de operar. O exemplo associa
uma role existente: revise também todas as outras políticas dessa role.

Configuração de destino (arquivo JSON; substitua pelos identificadores reais):

```json
{
  "schema": "AEGIS_S3_BACKUP_TARGET_V1",
  "bucket": "NOME-REAL-DO-BUCKET",
  "region": "us-east-1",
  "prefix": "aegis/ledger",
  "expected_bucket_owner": "123456789012",
  "kms_key_arn": "arn:aws:kms:us-east-1:123456789012:key/ID-REAL"
}
```

Além de SSE-KMS, o snapshot é cifrado no cliente com AES-256-GCM e uma chave
aleatória de 32 bytes, carregada de arquivo 0400/0600. Ela é distinta de tokens,
senha da carteira e chave da autoridade. Crie-a sem imprimir o valor:

```sh
node aegis-flow/scripts/recovery.mjs create-key --key-file /run/secrets/aegis-backup.key
```

**Guarde a chave também fora do host**, em gerenciador de segredos/escrow controlado.
A cópia S3 não é recuperável após perda do host se essa chave só existir nele.
Não a envie para o mesmo prefixo dos backups. Escrow/distribuição real da chave
não foram provisionados aqui. Para rotação, preserve versões antigas e mapeie o
fingerprint `key_id` às chaves necessárias para restaurar cada geração.

```sh
node aegis-flow/scripts/recovery.mjs backup --ledger /var/lib/aegis/ledger.sqlite --network aegis-lab-v1 --directory /var/lib/aegis-backups --key-file /run/secrets/aegis-backup.key
node aegis-flow/scripts/recovery.mjs upload --directory /var/lib/aegis-backups/UUID --s3-config /etc/aegis/s3.json
```

Backup usa a API SQLite de snapshot online, nunca cópia solta de main/WAL.
Metadados vêm da cópia, não de leituras do host que podem ter avançado durante o
backup. Temporário plaintext fica em diretório 0700/arquivo 0600 e é removido ao
concluir; use disco cifrado e trate restos após crash como dados sensíveis.

Cada backup tem UUID novo. Upload confirma versionamento, bloqueio público,
checksum e ACK SSE-KMS. Não sobrescreve objetos: envia ciphertext, manifesto
GCM e, por último, recibo de versões como marcador de commit. O recibo fica
**também no S3**, permitindo restaurar sem os arquivos de controle do host perdido.
Upload interrompido antes do marcador não conta como backup externo concluído.
Reexecução gera novo UUID; limpe órfãos só por processo administrativo revisado.

`backup.service`/`backup.timer` são exemplos instaláveis de systemd com lock e
registro de sucesso somente após ACK externo. `backup.env` contém apenas paths
identificadores: AEGIS_LEDGER_PATH, AEGIS_NETWORK_ID, AEGIS_BACKUP_DIRECTORY,
AEGIS_BACKUP_KEY_FILE, AEGIS_S3_CONFIG. Prepare diretórios/permissões e alinhe o UID
real do job com o SQLite; não exponha main/WAL para todos os usuários. O serviço
não faz prune automático. Monitore disco e arquivos incompletos.

Alvos iniciais a validar: cadência 15 minutos e recuperação em até 60 minutos.
**Não são RPO/RTO comprovados**: duração, falhas/retries, atraso do timer e rede
ampliam o RPO. Monitore a idade de `last-success.json`, último UUID/âncora em
armazenamento de monitoramento independente, falhas do job, IAM/KMS e espaço.
Não confunda backup local criado com cópia externa confirmada. Ensaie restaurações
periódicas; manter só um indicador no host não comprova backup após sua perda.

## Restauração ensaiada

Num host isolado/vazio, recupere imagem aprovada, chave do backup, config ID e
âncora por canais independentes. Descubra o UUID pelo inventário operacional/S3,
sem promover objetos sem recibo de commit. O papel de restauração precisa de
GetObjectVersion/GetObject e KMS Decrypt; separe-o do escritor quando possível.

```sh
node aegis-flow/scripts/recovery.mjs download --destination /var/lib/aegis-backups/retrieved --backup-id UUID --s3-config /etc/aegis/s3.json
node aegis-flow/scripts/recovery.mjs restore --directory /var/lib/aegis-backups/retrieved --destination /var/lib/aegis/ledger.sqlite --key-file /run/secrets/aegis-backup.key --anchor /etc/aegis/public/anchor.json --config-id CONFIG_ID_CONFIAVEL
```

Destino precisa estar ausente; não restaure sobre banco ativo. Restore autentica
GCM, valida checksums/schema/rede/âncora e **reconstrói um banco novo**, reexecutando
assinaturas, STARKs e certificados de todas as alturas finalizadas. Estado de
inputs/nullifiers é recalculado, não confiado cegamente às tabelas restauradas.
O arquivo só é promovido ao destino após replay completo. Uma âncora mais nova
que o backup recusa restauração; obtenha backup/bundles mais recentes, sem baixar
artificialmente a âncora.

Escopo recuperado: prefixo financeiro finalizado. Transações locais pendentes,
recibos de validação V1 e arquivos de configuração/credenciais não são promovidos.
Pending precisa de reenvio/revalidação. Cofres de carteira e chave da autoridade
exigem backups/recuperação próprios e segregados (wallet.md/settlement.md).
Antes de failover, **cerque/desligue o host antigo e sua autoridade**; SQLite não
coordena duas cópias independentes nem evita split brain entre hosts.

Ensaio disponível:

```sh
AEGIS_RECOVERY_INTEGRATION=1 node --test aegis-flow/services/recovery/recovery.integration.test.mjs
```

Executado com snapshot cifrado, exclusão do banco de origem de teste, armazenamento
separado **simulado no mesmo host**, âncora divergente, adulteração de GCM e replay
STARK nativo. Reconstituiu a altura finalizada 1 e descartou a altura pendente 2.
O teste não prova perda física de máquina, IAM, disponibilidade S3, escrow KMS,
retenção ou RTO de um histórico grande. Integração S3 tem testes de contrato com
runner simulado; upload/download real continua dependente do bucket/região,
conta/role/chave KMS e AWS CLI no ambiente autorizado. Template não foi aplicado.
