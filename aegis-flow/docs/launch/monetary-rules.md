# Regras monetárias — baseline técnica e decisões de lançamento

Estado: especificação do comportamento atual e registro de decisões pendentes.
Escopo atual: laboratório/testnet sem valor econômico. Não aprova oferta, supply
comercial, emissão de QER, preço, rendimento ou resgate. QUEER é a marca da
experiência; `AEGIS` é o asset ID padrão do código. Isso não constitui registro
comercial de ticker nem garante exclusividade de nome.

## Regras implementadas

| Regra | Comportamento verificável | Limite da conclusão |
| --- | --- | --- |
| Unidade | Inteiros; carteira apresenta unidades inteiras e agrega com BigInt | Casas decimais econômicas por ativo não são um registro de protocolo |
| Valor por note | 1 a 9007199254740991 (`2^53−1`) | Não é limite de saldo agregado nem de supply |
| Transação | 1–4 inputs e 1–4 outputs, um mesmo asset ID | Não implementa swap/múltiplos ativos na mesma prova |
| Capacidade do witness | Guest aceita Merkle leaf_count até 1.000.000 | É limite técnico de histórico, não supply; crescimento/migração exigem plano antes do lançamento |
| Asset ID | ASCII alfanumérico, `_`/`-`, 1–64 caracteres | Não há allowlist global de ativos econômicos aprovados |
| Conservação | Soma(inputs) = soma(outputs) + public_amount; checked_add u64 no guest | Supply inicial depende do genesis e das aberturas; não há prova de supply global |
| public_amount | Inteiro entre 0 e `2^53−1`, público e vinculado à transação | Não existe conta de beneficiário, crédito de taxas, bridge ou pagamento de retirada |
| Gasto | Ownership, inclusão, nullifiers e unicidade de inputs verificados | Não equivale à auditoria independente ou prova de 128 bits PQ |
| Genesis | Bootstrap offline uma vez, antes da atividade/configuração; até 64 commitments | O bootstrap não recebe/confere valores, assets e direitos econômicos das aberturas |
| Emissão posterior | Não há endpoint público de mint, subsídio/recompensa ou staking | Operação privilegiada/configuração/fork exige governança e revisão; não prometer imutabilidade absoluta |
| Finalização | Autoridade permissionada, certificado ML-DSA e prefixo persistente | Não é consenso descentralizado, liquidação em L1 ou garantia de conversibilidade |

Fonte: `shielded-note-v2.mjs`, `stark-statement.mjs`, `transfer-v2.mjs`,
`guest/src/main.rs`, `ledger-state/store.mjs` e `finality.mjs`. Os hashes desses
fontes e o programa STARK constam do baseline da revisão de lançamento.

Na cadeia de transições válidas, conservação impede aumentar o total a partir
do genesis. Isso fornece uma restrição técnica de conservação, mas não declara
um `max_supply` econômico nem revela/prova o total inicial por ativo. A gênese,
as hipóteses criptográficas e a integridade do estado são premissas dessa conclusão.

## Tratamento de public_amount

O builder usa o nome histórico `fee`, com default zero, e a carteira envia zero.
O protocolo aceita valores positivos. Hoje eles deixam de aparecer nos novos
outputs blindados; **não há repasse implementado**. Não chamar isso de taxa
recolhida, receita do operador, retirada paga ou burn econômico formal sem
especificar destino, direitos, contabilidade e enforcement correspondentes.
Também não declarar “taxa zero obrigatória”: zero é default da carteira, não
uma restrição universal da API/guest.

Proposta para uma primeira testnet: não cobrar nem representar receita econômica;
se a política exigir public_amount zero em toda a rede, adicionar e auditar a
admissão correspondente, em todos os caminhos relevantes. Esta revisão não muda
essa regra silenciosamente nem invalida provas antigas com public_amount > 0.

## Registro de decisões a aprovar

Antes de uma oferta com valor, definir e vincular à rede/programa/configuração:

1. Entidade emitente/operadora, jurisdições, propósito e direitos do ativo.
2. Asset ID e unidade/casas decimais oficiais, conversões/rounding e limites.
3. Supply inicial, máximo (ou ausência explícita de máximo), alocações, concentração,
   vesting, tesouraria, conflitos de interesse e método de comprovação.
4. Manifesto de genesis: raiz/count e compromisso da revisão de valores/alocações;
   aberturas privadas não devem ser publicadas. Definir auditoria/prova agregada
   de emissão que preserve a privacidade; isso ainda não existe no circuito atual.
5. Emissão/mint/recompensas futuros, autoridade, ritmo, condições e controles —
   ou proibição formal com enforcement correspondente. Não inventar um cap
   multiplicando número de commitments pelo limite por note.
6. Taxas/public_amount: limites, destinatário, eventual burn, contabilidade e
   efeitos de falha/estorno. Não creditar recebimento que o código não implementa.
7. Lastro/resgate/conversibilidade, reservas e segregação se houver promessa;
   caso não existam, comunicação explícita sem promessas implícitas.
8. Governança de mudanças, migração/fork, atualização de software/autoridade,
   publicação, prazo e proteção de usuários. Não reescrever finalidade conhecida.
9. Análise econômica, incentivos/concentração, testes de abuso e revisão jurídica.

Os campos em `review.json` começam pendentes. Nenhum número de emissão, preço,
percentual de tesouraria ou direito comercial foi escolhido pelo assistente.
A aprovação documental não instala enforcement monetário ausente. Mudanças de
supply/fees/circuito exigem implementação, provas/testes e novo candidato revisado.
