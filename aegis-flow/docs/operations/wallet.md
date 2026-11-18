# Carteira local: chaves, notes e recuperação

A `/queer/wallet` substitui o saldo e os envelopes fictícios por um cliente de
carteira local. Node >=24.8 executa ML-DSA-65, ML-KEM-768 e o prover/verificador
STARK existentes. O navegador não recebe chaves privadas, spend secrets, notes
abertas ou witnesses. Ele mantém apenas o token de pareamento e os campos de
formulário em memória; não há persistência desses segredos no navegador.

A carteira continua de laboratório. A finalização é a da autoridade permissionada
(ADR-0005), o STARK não demonstra 128 bits pós-quânticos e a implementação ainda
não tem auditoria independente. Não há depósitos em rede pública ou ativo com
valor econômico implantado por esta mudança.

## Preparação e execução

Obtenha por canal confiável independente do gateway:

- A configuração pública de settlement da ADR-0005.
- Um JSON contendo o array de commitments do genesis; root/count devem coincidir.
- Uma âncora conhecida `{ "height": ..., "checkpoint_id": "..." }`, de fonte
  independente e atualizada conforme a operação da rede. A resposta do mesmo
  gateway não é, sozinha, uma nova fonte de confiança.

Configure o prover/verificador reais conforme o runbook STARK. Use portas
separadas para frontend, gateway e carteira. Na raiz do repo, por exemplo:

```sh
PORT=8081 AEGIS_LEDGER_PATH=work/authority.sqlite AEGIS_SETTLEMENT_CONFIG_PATH=work/settlement-config.json AEGIS_FINALITY_ANCHOR_PATH=work/finality-anchor.json node aegis-flow/services/validation-gateway/server.mjs
```

Em outro terminal:

```sh
AEGIS_WALLET_DIR=work/local-wallet AEGIS_WALLET_CONFIG=work/settlement-config.json AEGIS_WALLET_GENESIS=work/genesis-commitments.json AEGIS_WALLET_ANCHOR=work/finality-anchor.json AEGIS_GATEWAY_URL=http://127.0.0.1:8081 AEGIS_WALLET_ORIGIN=http://localhost:8080 node aegis-flow/services/wallet-local/server.mjs
```

Inicie `npm run dev` e abra `http://localhost:8080/queer/wallet`. Leia localmente
`work/local-wallet/pairing-token` e informe o token na tela. O serviço escuta
somente em `127.0.0.1:8765`, exige token e confere Host/Origin; não exponha essa
porta à rede nem use um proxy que amplie seu acesso. O token não é a senha do
cofre. Trate-o como capacidade de acesso à sessão local desbloqueada.

O frontend usa endereço local fixo para evitar enviar senha/token a uma URL
arbitrária de gateway. Para outro Origin, configure-o explicitamente no serviço.
Execução da interface hospedada publicamente pode depender das permissões de
acesso à rede local do navegador; o caminho validado é a interface local acima.

## Cofre e bloqueio

Crie uma senha longa e única, com pelo menos 14 caracteres. O serviço gera chaves
reais e um spend secret aleatório de 32 bytes. O arquivo `wallet.vault.json`
contém somente um envelope autenticado AES-256-GCM com nonce novo a cada gravação.
A senha passa por scrypt N=131072, r=8, p=1, salt aleatório de 32 bytes e chave
AES de 32 bytes. Parâmetros/campos do envelope são fixados e autenticados;
substituições de KDF e arquivos adulterados são rejeitados.

As gravações usam arquivo temporário 0600, fsync, rename atômico e fsync do
diretório. O perfil é criado com modo 0700. Nenhuma senha é gravada. A réplica
SQLite guarda somente transações públicas, ciphertexts e provas. Chaves e notes
ficam criptografadas no cofre, mas são abertas em memória durante uso.

A opção Bloquear descarta referências às chaves/notes e zera o buffer da chave
AES. O serviço bloqueia após cinco minutos sem requisições autenticadas; a tela
solicita bloqueio ao ficar oculta. Uma prova em execução mantém a sessão aberta
até a operação terminar. JavaScript/OpenSSL e swap/dumps não oferecem garantia
de apagar todas as cópias de memória: isso não é um enclave nem um keystore de
hardware. Proteção contra malware/XSS no computador desbloqueado exige trabalho
adicional e auditoria. O token autoriza operações na sessão desbloqueada.

O prover nativo existente usa arquivos temporários privados (diretório restrito,
arquivos 0600) para o witness e os remove ao terminar. Uma queda abrupta pode
deixar esses temporários; eles não são o cofre criptografado. Use armazenamento
do sistema cifrado e, quando disponível, configure `TMPDIR` em memória privada
para o processo da carteira. Não há promessa de apagamento seguro do disco,
proteção de swap ou de dumps; endurecer esse ciclo integra a revisão de produção.

O arquivo `process.lock` impede dois serviços no mesmo perfil. Após queda abrupta,
confira que o PID nele registrado realmente terminou antes de remover esse
arquivo e reiniciar. Não remova o lock de um processo ainda ativo. A validação do
cofre e o replay do ledger continuam necessários após essa recuperação.

## Receber e sincronizar

O endereço `aegis_receive1_...` contém rede/config ID, owner tag e chave pública
ML-KEM, sem spend secret. Confira-o por canal confiável com o destinatário.
Criação da carteira começa com saldo zero; não existe crédito inicial ou faucet
fictício. O emissor constrói uma note com esse owner tag e a cifra para a chave
ML-KEM do destinatário.

Ao sincronizar, a carteira baixa todos os bundles finalizados públicos em lotes
de até 128 alturas. Reexecuta assinatura, STARK, transição de estado e certificado
na réplica local, contra a configuração/genesis fixados. Nunca consulta o saldo
por endereço nem transmite seus nullifiers/notas para descobrir recebimentos.
Ela decifra localmente os outputs destinados à sua chave e confere asset,
commitment e ownership antes de guardar a note no cofre.

O saldo resulta de notes próprias incluídas no prefixo finalizado e ainda não
consumidas; usa inteiros/BigInt e apresenta valores como strings de unidades
inteiras. Notes recebidas pendentes e meros envelopes decifrados não são crédito.
O saldo disponível fica oculto na tela até a sincronização terminar. Se houver
mais de 128 blocos, repita Sincronizar até ficar atualizado. Um gateway pode
omitir dados/novas finalizações; a âncora externa estabelece o prefixo mínimo
conhecido, não prova que nenhum checkpoint posterior existe.

Notes de genesis precisam de suas aberturas privadas, que não estão na lista
pública de commitments. A API local autenticada `/import-genesis-note` permite
importação offline de `{note}` somente se a note pertencer ao spend secret da
carteira e corresponder a um commitment do genesis fixado. Não há emissão/mint
via essa API. Não envie aberturas privadas ao gateway.

## Enviar e recuperar um envio

Informe o endereço, asset ID e quantidade em unidades inteiras. Confira os dados
antes de Confirmar e enviar. A carteira sincroniza novamente, seleciona até quatro
notes confirmadas, constrói destinatário e troco, assina com ML-DSA e prova o
witness localmente. Apenas `{transaction, proof}` sai para o gateway.

A reserva dos inputs é persistida antes de provar; o bundle público é persistido
antes de publicar. Um erro de transporte conserva a reserva. Reenviar usa o mesmo
bundle/request ID; não cria outra transação. A carteira permite um envio pendente
por vez. Falha de prova antes da publicação libera a reserva; queda nesse estágio
é recuperável ao desbloquear. Um envio possivelmente publicado só é liberado
quando aparece na cadeia finalizada ou quando uma nova raiz finalizada torna seu
anchor antigo inválido. Censura/ausência de finalização pode manter a reserva;
não há cancelamento por timeout que arrisque um gasto concorrente.

## Backup, restauração e troca de senha

Exporte o backup criptografado e guarde cópias separadas da senha. Ele inclui as
chaves, notes já abertas, watermark de finalização e envio pendente. Não existe
redefinição de senha ou seed de demonstração para recuperar chaves perdidas.
Apenas um backup autenticado e a senha correta recuperam essa identidade.

Para testar restauração, pare o serviço e inicie com outro `AEGIS_WALLET_DIR`
vazio, mantendo config/genesis/âncora confiáveis. Pareie com o novo token e use
Restaurar backup. A operação recusa sobrescrever um cofre existente. Ela mantém
saldo não sincronizado até replay/checagem dos checkpoints. Um backup antigo
pode recuperar recebimentos posteriores ao varrer os envelopes da cadeia com
as mesmas chaves; notes de genesis exigem suas aberturas no backup/importação.

Atualize a âncora externa antes de confiar numa restauração. A carteira rejeita
história conflitante ou abaixo da âncora conhecida. Restaurar simultaneamente
backup e âncora antigos não permite detectar uma rede que omite história recente.
Mantenha disponíveis os bundles/ciphertexts públicos, pois são necessários para
reconstruir recebimentos não presentes no backup.

Alterar senha gera outro salt/chave e recriptografa atomicamente o cofre. Exporte
novo backup: cópias antigas continuam válidas com a senha anterior. Isso não
rotaciona as identidades ML-DSA/ML-KEM nem revoga cópias das chaves já expostas.
Rotação/revogação de identidade e recuperação social não estão implementadas.

## Verificação

```sh
bash aegis-flow/scripts/dev-env.sh test
npm test
npx tsc --noEmit -p tsconfig.app.json
AEGIS_WALLET_INTEGRATION=1 node --test aegis-flow/services/wallet-local/wallet.integration.test.mjs
```

A integração lenta cria uma prova STARK verdadeira para envio com troco, finaliza
pela autoridade, confere saldos de remetente/destinatário e restaura backup antigo.
Os testes rápidos isolam regras de carteira com doubles explícitos de prova;
não há fallback fictício no serviço de carteira.
