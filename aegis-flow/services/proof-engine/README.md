# Provas ZK com STARK — laboratório Aegis

Implementação executável com **RISC Zero 3.1.0**, receipts **composite STARK**.
O verificador recusa Fake, Groth16 e outros tipos de receipt. A assinatura da
transação continua sendo ML-DSA. Não há fallback para flags booleanas, provas
transparentes com witness público ou assinatura tratada como prova de saldo.

## O que é provado

O guest Rust recebe um witness privado, valida e publica apenas o statement:

1. 1–4 entradas e 1–4 saídas, de um único asset.
2. Abertura de cada commitment de entrada e saída (formato Note V2).
3. Posse de cada entrada: preimagem secreta do owner_tag da note.
4. Inclusão de cada entrada no root Merkle público, com count/index vinculados.
5. Nullifier derivado do segredo e commitment, único dentro da transação.
6. Valores inteiros no intervalo `1..2^53-1` e conservação:
   `sum(inputs) == sum(outputs) + public_amount`.
7. Publicação autenticada do network_id e transaction_binding.

A unicidade global dos nullifiers e a política de root corrente são aplicadas
pelo SQLite na mesma transação que consome inputs e cria outputs. O STARK
isolado não comprova o estado futuro do banco.

`public_amount` representa valor público retirado do conjunto privado (usado
como fee no builder de laboratório); não existe liquidação externa dessa fee.

## Formatos e binding

- Programa aprovado: `program.json` contém image ID, checksum do binário e hash
  das fontes/lockfile do guest. Receipts de programas escolhidos pelo cliente
  são rejeitados, mesmo que o cliente altere o campo program_id do envelope.
- O guest publica o statement completo no journal autenticado. O verificador
  nativo compara esse journal ao statement reconstruído pelo servidor a partir
  da transação ML-DSA assinada, incluindo `transaction_binding = tx_id`.
- Witness: notes, randomness, segredos de gasto e caminhos Merkle. Fica apenas
  no processo de proving local e em diretório temporário privado removido ao
  terminar. Não deve ser enviado ao gateway nem entrar no ledger ou logs.
- Prova pública: `{scheme, program_id, statement_digest, receipt}`. Receipt em
  base64 canônico, máximo 8 MiB. Não existe chave privada de prova ou setup
  confiável neste modo composite.
- O verificador Rust é compilado com `disable-dev-mode`. O wrapper também
  força `RISC0_DEV_MODE=0`; um receipt Fake é sempre rejeitado.

## Construir

Linux x86_64, Python >=3.12, Rust host com cargo (testado com Rust 1.100) e
espaço em disco para toolchain/targets. Downloads e artefatos ficam em `work/`.
O instalador não escreve no diretório home; exige Rust host previamente instalado.

```bash
python3 aegis-flow/scripts/setup-stark.py
```

Binários e toolchain de guest têm checksums fixados em `tools.lock.json`.
Dependências Rust são fixadas pelos Cargo.lock. O build remapeia paths para
permitir reprodução em outros diretórios. O script compara o image ID ao
manifest e falha se o programa não for o aprovado. A opção
`--update-program-manifest` é somente para alteração deliberada do guest com
revisão do diff; nunca usar para ignorar um mismatch de release.

O padrão local usa `work/risc0/bin/r0vm`, `work/risc0/aegis-transfer.bin` e
`work/stark-target/host/release/aegis-stark-verifier`. Paths alternativos podem
ser configurados com `AEGIS_R0VM`, `AEGIS_STARK_PROGRAM` e
`AEGIS_STARK_VERIFIER`; o prover/binário de guest ainda precisam corresponder
às pins. O servidor só precisa do verificador e fontes/manifest aprovados;
a imagem Docker o compila em estágio separado, sem instalar um prover no gateway.

## Utilizar

1. Criar uma identidade de gasto com `createSpendIdentity` e uma Note V2 com
   `createPrivateNote`. Guardar o spend_secret localmente com proteção adequada.
2. Obter o root e a prova de inclusão dos commitments de entrada no ledger.
3. `prepareTransferV2` retorna `{transaction, statement, witness}`. O witness
   continua privado. Outputs incluem notes cifradas com ML-KEM/HKDF/AES-GCM.
4. `await proveTxV1({statement, witness})` gera a prova local e a verifica antes
   de devolvê-la. O proving real em CPU leva minutos e pode usar alguns GiB.
5. Enviar **somente** `{transaction, proof}` ao `POST /submit`.
6. O gateway verifica assinatura + STARK e então aplica o estado atomicamente.
   O resultado `APPLIED_LOCAL` não é mainnet ou finalização por consenso.

## Testar

```bash
AEGIS_STARK_INTEGRATION=1 node --test aegis-flow/services/proof-engine/integration.test.mjs
```

O teste gera um receipt real e verifica: binding do journal, image ID, bits
adulterados, ownership incorreto, inflação, concorrência entre processos,
HTTP, persistência após restart e backup. Não usa dev-mode nem prova mockada.
A suíte rápida inclui regressão da forgery antiga; a integração demorada fica
explicitamente opt-in e falha se os binários aprovados estiverem ausentes.

## Limites antes de produção

STARK é a base de prova pós-quântica escolhida, mas esta integração ainda exige
revisão criptográfica/circuito independente. **O perfil aceito não demonstra
128 bits de segurança pós-quântica.** A [avaliação do motor](../../docs/security/risc0-qualification-2026-11-20.md)
confronta os parâmetros declarados com os fontes e distingue estimativas
clássicas de uma demonstração quântica. O modo `--require-source-profile` do
script `review-stark-security.mjs` exige correspondência dos fontes; o modo
`--require-production` continua rejeitando o perfil. Parâmetros, Fiat–Shamir,
hashes, conhecimento, privacidade e composição precisam de análise aplicável
à configuração completa.

Commitments V2 são hashes SHA-256 com domains e randomness, não construções
lattice/SIS/LWE. Preimage/collision/hiding sob o adversário escolhido precisam
de revisão. Inputs, outputs, nullifiers e fee são públicos; valores das notes
e segredos ficam privados. Isso não entrega anonimato de rede nem unlinkability
completa. Correção do conteúdo cifrado de uma saída não faz parte do guest:
o destinatário deve decriptar e conferir commitment/owner antes de importar a note.
O helper local `openTransferOutputV2` faz essas verificações junto de assinatura,
contexto, asset e identidade KEM. Seu retorno `confirmed:false` exige confirmação
separada contra estado/prova confiáveis; o helper não credita saldo nem finaliza
uma transação. A carteira browser ainda precisa integrar esse caminho.

A receipt valida a relação financeira e depende do consenso para inclusão,
double spend e finalização. Consulte os módulos de settlement/open-chain para
essas responsabilidades. A auditoria independente não foi concluída e o
bloqueio de produção continua ativo. Os formatos antigos ZK/Note V1 não são
aceitos para `/submit`.
