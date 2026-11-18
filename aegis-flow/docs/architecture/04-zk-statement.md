# Statement ZK implementado — AEGIS-ZK-STARK-V1

Backend: RISC Zero 3.1.0, receipt composite STARK; sem Groth16.
O verificador usa image ID aprovado em `services/proof-engine/program.json`.

## Statement público

`version`, `network_id`, `anchor_state_root`, `input_commitments[]`,
`output_commitments[]`, `nullifiers[]`, `public_amount`, `public_asset_id`,
`transaction_binding`.

`transaction_binding` é o tx_id (hash do payload público V2), que também é
verificado por assinatura ML-DSA. O journal autenticado deve ser exatamente o
statement reconstruído pelo servidor, não um digest ou flag escolhido pelo cliente.

## Witness privado

Notes de entrada/saída (value, asset_id, owner_tag, randomness), segredos de
gasto das entradas e caminhos Merkle. O gateway recebe somente transação
pública e receipt, nunca esse witness.

## Relação provada no guest

- 1–4 inputs e outputs; asset único, commitments/notes correspondentes.
- Posse da preimagem de owner_tag de cada entrada.
- Caminho Merkle de cada commitment até anchor_state_root, incluindo count/index.
- Nullifier derivado do spend_secret e input commitment, único no lote.
- Valores inteiros positivos <=2^53-1; sum(inputs) = sum(outputs) + public_amount.

O SQLite verifica globalmente nullifiers/inputs não consumidos e root corrente
no commit atômico. A prova não verifica, sozinha, o estado futuro do banco.

## Formato Note V2

- owner = SHA256(ASCII("AEGIS_OWNER_V2") || 0x00 || spend_secret[32])
- commitment = SHA256(ASCII("AEGIS_NOTE_V2") || 0x00 || asset_len_u8 ||
  asset_ascii || value_u64_be || owner[32] || randomness[32])
- nullifier = SHA256(ASCII("AEGIS_NULLIFIER_V2") || 0x00 || commitment[32] || spend_secret[32])

Esses são commitments hash-based com randomness, não lattice/SIS/LWE.
O método anterior de JSON/booleanos foi removido; os metadados formais antigos
não constituem provas e nenhum verifier os aceita como sucesso.

## Segurança e limites

A configuração padrão do SDK tem cerca de 98 bits conjecturados; o protocolo
não promete 128 bits pós-quânticos. Exige revisão independente de parâmetros,
Fiat–Shamir, relação e primitives. Não há consenso ou ancoragem externa. A
correção da cifragem de outputs não faz parte do guest; o destinatário precisa
conferir a note decriptada contra commitment/owner. Produção continua bloqueada.

Implementação, build e teste real: `services/proof-engine/README.md`.
