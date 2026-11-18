# Backups PoW no bucket queer-altcoin

Destino informado pelo responsável:

- Bucket de uso geral: queer-altcoin.
- Região: us-east-2 (Ohio).
- Owner esperado: 941554679497.
- Prefixo exclusivo desta integração: aegis/pow/v2.

O access point S3 Files informado não substitui o bucket na API de objetos.
Os nós continuam usando SQLite local; S3 guarda snapshots cifrados e evidências.
O arquivo deployments/open-pow/s3-destination.json é um pedido de configuração,
não uma declaração de que IAM, KMS ou o bucket já foram verificados.

## Autenticação e inspeção somente leitura

Use Node >=24.8 e AWS CLI atualizado, autenticado pela cadeia normal de
credenciais. Pode ser uma sessão AWS IAM Identity Center/SSO, CloudShell ou
credenciais temporárias de role já configuradas. Não há dependência de um tipo
específico de serviço de computação. Não copie access keys, secret keys ou tokens
para o chat/repositório. O processo herda o perfil/sessão configurado no ambiente.

Na raiz do repositório:

```bash
aws sts get-caller-identity
node aegis-flow/scripts/s3-target.mjs plan \
  --request aegis-flow/deployments/open-pow/s3-destination.json \
  --output-directory work/queer-s3-plan
node aegis-flow/scripts/s3-target.mjs inspect \
  --request aegis-flow/deployments/open-pow/s3-destination.json \
  --output-directory work/queer-s3-inspection-live
```

Cada diretório de saída precisa ser novo. plan funciona offline e gera a
política de inspeção para revisão. inspect lê identidade, região, versionamento,
bloqueio público, criptografia e metadados KMS; não executa PutBucket*, IAM ou
alterações no S3 Files. Os erros são códigos sanitizados, sem credenciais.

A inspeção exige versionamento Enabled, os quatro bloqueios públicos e uma
chave KMS simétrica habilitada, no owner/região esperados. Não modifica esses
atributos. Se o bucket já tem SSE-KMS, resolve o ID/alias para o ARN canônico.
Se ele usa SSE-S3, uma chave pode ser escolhida explicitamente por
--kms-key-arn ARN: os uploads usam SSE-KMS por objeto e não exigem mudar o
padrão de criptografia de todos os arquivos existentes.

Quando os metadados passam, target.json contém a configuração executável.
configuration_ready não comprova permissão de gravar/restaurar: o campo
write_read_access_verified permanece falso até ensaio real. Acesso negado,
região incorreta, bloqueio público ausente ou chave não selecionada geram
inspeção incompleta e exit code 1; não há configuração pronta fictícia.

## Políticas IAM e preservação do bucket existente

Com uma chave selecionada, o comando gera:

- backup-writer-policy.json: criação condicional e leitura de versões apenas
  no prefixo, sem DeleteObject, PutBucketPolicy ou permissões administrativas.
- backup-reader-policy.json: leitura das versões e uso da chave KMS pelo S3.
- bucket-prefix-statements.json: denies de transporte inseguro, SSE incorreto,
  chave diferente e escrita sem condição, limitados ao prefixo Aegis.

O writer também pode ler seus objetos para resolver uma confirmação de upload
perdida. Não recebe ListBucket para o bucket inteiro. O S3 pode responder 403
em HEAD de objeto inexistente quando ListBucket não é permitido; por isso a
criação usa PutObject condicional e só aceita retomada após validar metadados.
Nunca transforma um 403 em autorização para sobrescrever.

As permissões KMS são restritas à chave e ao uso via S3 na região. O contexto
permite ARN do objeto/prefixo e ARN do bucket, necessário quando S3 Bucket Keys
estão habilitadas. A política S3 continua delimitando os objetos. A key policy
KMS e outras políticas da identidade também precisam permitir a operação; um
JSON gerado não prova as permissões efetivas nem limita grants de outras fontes.

Para preparar uma mesclagem sem apagar políticas atuais, forneça
--existing-bucket-policy ARQUIVO ao comando. Ele preserva statements existentes,
recusa colisão de Sid e escreve bucket-policy.merged.proposed.json. Revise/aplique
pelos controles administrativos AWS. Nenhum comando desta ferramenta aplica
política, cria bucket/chave ou altera a configuração do S3 Files.
Não use o template que cria um bucket novo para substituir este bucket existente.

## Upload retomável e agendamento

A gravação mantém ledger.enc, manifest.json e, por último, s3-receipt.json como
commit marker. Objetos só são criados com If-None-Match: *. Repetir um backup
completo retorna o receipt original; erro de transporte ou 412 exige checksum,
tamanho, versão e SSE-KMS coincidentes para reutilizar o objeto. Conteúdo ou
chave divergentes causam conflito, sem delete/overwrite.

scheduled-backup.mjs grava pending-upload.json antes de enviar. Após falha ele
retoma o mesmo UUID sem criar outro snapshot. Mudança da origem ou do destino
com uma pendência exige revisão; não redireciona dados silenciosamente. O lock
do kernel exclui jobs concorrentes e é liberado após crash.

last-success.json só é atualizado depois do commit remoto. Ele separa
completed_at de snapshot_created_at: enviar hoje um snapshot antigo não reduz
sua idade/RPO. Espaco livre é verificado antes de snapshot/restore/download,
com margem de 16 MiB; isso é preflight, não reserva de filesystem. Configure
quota/margem/retencão conforme o tamanho real e não apague o último backup válido.

## Ensaio completo de restauração

```bash
node aegis-flow/scripts/pow-s3-drill.mjs \
  --genesis work/open-genesis.json --directory work/node-a \
  --backup-directory work/pow-backups --output-directory work/pow-drills \
  --key-file /run/secrets/pow-backup.key \
  --minimum-work WORK_RECORDED_INDEPENDENTLY \
  --s3-config work/queer-s3-inspection-live/target.json
```

O ensaio verifica restauração local antes de escrever no S3, envia, baixa versões
fixadas e restaura novamente revalidando a blockchain. O relatório liga versão
do código, config/programa, piso de trabalho, versões/checksums e estado
restaurado. Ele mede duração do ensaio/restore; não inventa RPO ou RTO de um
incidente de produção. evidence_accepted e production_ready permanecem falsos:
a revisão operacional/independente precisa aceitar a evidência.

Transportes simulados são marcados injected-runner e não contam como acesso
AWS real. A validação com STARK de arquivo público existente usa o verificador
nativo, mas não conta como prova nova nem ensaio no bucket real.

## Métricas

Um node_exporter com textfile collector pode receber:

```bash
node aegis-flow/scripts/backup-metrics.mjs --directory work/pow-backups \
  --profile node-a --output /CAMINHO_DO_TEXTFILE_COLLECTOR/aegis-backup.prom
```

Exporte regularmente e use profiles diferentes para múltiplos nós no mesmo
collector. Há gauges de validade, instante de upload, idade do snapshot,
pendência/idade e cópia externa concluída. Marcadores simulados não viram cópia
externa confirmada. deployments/monitoring/open-pow-backups.rules.yml contém
limiares de exemplo; precisam de RPO/RTO e scrape configurados no destino.
Também monitore o próprio exporter/ausência de métricas e quota de disco.

## Estado observado nesta implementação

Os testes locais exercitaram falhas, retomada, versões imutáveis, planos IAM,
mesclagem e o ensaio com verificador STARK nativo. A inspeção real neste ambiente
retornou AWS_CLI_REQUIRED; IAM, KMS e estado do bucket não foram verificados.
Nenhuma alteração AWS foi aplicada. Meta de 128 bits PQ, incentivos, histórico,
auditoria independente e testnet prolongada continuam sendo gates distintos.

Referências técnicas AWS:
- https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html
- https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html

Uploads pendentes ficam vinculados à origem, ao destino e ao identificador da chave de criptografia. Uma troca de chave bloqueia a retomada; preserve a chave e a configuração anteriores até concluir a cópia e validar a restauração.
