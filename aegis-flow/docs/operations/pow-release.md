# Pacote de release do nó PoW

O nó PoW usa `deployments/open-pow/compose.yaml`. O empacotador antigo
`prepare-release.mjs` é do gateway single-host e não deve preparar este nó.
O novo pacote continua sendo **LAB_TESTNET_ONLY**, sem autorização para valor
monetário ou produção. Não remove o bloqueio de runtime demonstrativo.

## Preparação

Use um checkout limpo do commit revisado, Node >=24.8, Docker e espaço para
compilar o verificador Rust e armazenar a imagem. A configuração genesis deve
ser escolhida/revisada separadamente; não há genesis econômica de lançamento
aprovada neste repositório. Os exemplos abaixo usam um arquivo público local
existente; não crie parâmetros comerciais copiando os testes.

```bash
node aegis-flow/scripts/build-release.mjs
node aegis-flow/scripts/pow-release.mjs prepare \
  --image aegis-flow/validation-gateway:COMMIT_REVISADO \
  --genesis CAMINHO_GENESIS_REVISADA \
  --directory work/pow-candidate
```

O destino deve ser novo, com diretório pai existente. O pacote contém
`release.json`, `compose.yaml` e `pow-genesis.json`, sem chaves de carteira,
backup ou credenciais AWS. Ele vincula commit, image ID imutável local, plataforma,
versão Node, programa aprovado, SHA-256 do executável verificador, composição e
genesis. Preparar o pacote executa containers isolados, sem rede, para examinar
runtime, suporte PQC e importação da cadeia. Não inicia um nó nem gera uma prova.

## Verificação no destino

Obtenha commit e config ID por um canal confiável independente do próprio pacote.
Use o checkout limpo desse commit. Importe a imagem pelo canal de distribuição
revisado (`docker load` para o arquivo do workflow) antes de verificar:

```bash
node aegis-flow/scripts/pow-release.mjs verify \
  --directory work/pow-candidate \
  --expected-commit COMMIT_REVISADO \
  --expected-config-id CONFIG_ID_REVISADO
```

A verificação recusa outra configuração econômica mesmo se alguém recalcular
seu checksum no manifesto. Recusa imagem mutável, programa diferente, alteração
da composição, arquivos simbólicos e alegação `production_ready: true`. Também
inspeciona a imagem local e compara runtime/programa/verificador com o pacote.
`verified: true` é verificação de integridade e identidade, não prova de segurança
do protocolo, auditoria, reprodutibilidade de build ou autorização de lançamento.
Labels Docker e checksums não substituem origem confiável do build e da imagem.

## Construção no CI

O workflow manual **Package Aegis PoW testnet candidate** recebe `genesis_path`,
exige arquivo rastreado no checkout e programa aprovado, executa os testes locais,
constrói a imagem, prepara/verifica o pacote e publica um artefato temporário de
14 dias com a imagem comprimida e `SHA256SUMS`. Não publica em registry nem faz
deploy. Os checksums detectam corrupção; obtenha-os pelo workflow/commit confiável.
As integrações nativas completas continuam no workflow STARK dedicado. O pacote
não comprova aprovação desses jobs nem encerra os critérios de produção.

## Estado desta entrega

Os testes locais cobrem identidades independentes, alteração de regras monetárias,
composição adulterada, symlinks e falso status de produção. Não foi construída
uma imagem nova nem executado o workflow neste ambiente, com cerca de 94 MiB livres.
A construção/verificação real do artefato permanece pendente. As demais exigências
estão em [critérios de produção](../planning/production-exit-criteria.md), incluindo
128 bits pós-quânticos demonstrados, auditoria independente, política monetária,
capacidade do histórico, operação adversarial, restauração S3 real e testnet pública.
