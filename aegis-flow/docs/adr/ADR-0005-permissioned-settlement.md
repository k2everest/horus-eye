# ADR-0005 — Settlement permissionado com autoridade explícita

Estado: adotado para laboratório; produção bloqueada. Substitui a indefinição
de settlement da ADR-0004, sem modificar o motor STARK nem sua meta de segurança.

## Decisão

Usar rede própria permissionada, com um sequenciador e uma autoridade de
finalização fixada por chave pública ML-DSA-65. Réplicas verificam transações,
STARKs e certificados antes de aceitar o prefixo finalizado. Não existe ponte,
rede pública hospedeira, consenso BFT, votação por stake ou criptomoeda lançada.

| Alternativa | Avaliação |
| --- | --- |
| Rede pública existente | Oferece consenso, disponibilidade e finalidade próprios, mas exige escolher e integrar rede/contratos, custos e um modelo de segurança herdado. Não há essa integração nem evidência pós-quântica neste repo. |
| Rede própria com consenso BFT | Exige validadores independentes, quorum, locks, mudanças de rodada, rede P2P e testes de partição. Fora da capacidade atual; certificados isolados não implementam esse consenso. |
| Rede própria permissionada | Permite implementar agora um protocolo de inclusão/finalização com confiança explícita na autoridade e recuperação verificável. Escolhida como etapa limitada, sujeita a revisão antes de produção. |

Esta escolha sacrifica descentralização e disponibilidade da autoridade. A chave
pode censurar ou equivocar; comprometer/restaurar incorretamente seu estado pode
produzir forks assinados. ML-DSA autentica a decisão, não impede uma autoridade
maliciosa de assinar duas histórias. A segurança STARK de 128 bits pós-quânticos
continua não demonstrada.

## Identidade e transição de estados

A configuração imutável vincula rede, raiz/count do genesis, programa STARK,
algoritmo e chave/tag da autoridade. Seu hash identifica a rede de settlement.
Ela só pode ser instalada em altura zero, com genesis correspondente. Alterar
autoridade/programa exige um protocolo de migração ainda não implementado;
trocar arquivo ou variável não altera uma rede existente.

`APPLIED_LOCAL` significa inclusão no estado tentativo. A autoridade revalida a
assinatura da transação e a prova STARK antes de emitir o próximo checkpoint.
O checkpoint vincula config/rede, altura, parent checkpoint, tx, transition hash,
raízes, count, programa e digest da prova. Não contém witness ou chave privada.

O certificado ML-DSA só finaliza a próxima altura contígua que corresponde ao
estado local. Emissão e gravação são atômicas; o certificado não sai antes do
commit SQLite FULL/WAL. Receipts passam a `FINALIZED_PERMISSIONED`,
`finality_status: FINALIZED`, `settled: true`, sempre com
`settlement_scope: aegis-permissioned-authority` e `production_ready: false`.
O significado é finalidade nesta rede permissionada, sem liquidação em L1,
lastro econômico, resgate ou garantia descentralizada.

O genesis é o checkpoint de confiança inicial, não uma transferência liquidada.
Tempo decorrido e número de confirmações nunca promovem uma inclusão a final.

## Reorganizações e recuperação

Um comando administrativo pode remover apenas o sufixo inteiro não finalizado.
Ele restaura root, commitments, inputs consumidos, nullifiers, transações e
receipts atomicamente; receipts removidos ficam `ORPHANED`. Uma alternativa
precisa passar novamente pela verificação STARK e pelas regras do estado. Não
há escolha automática de fork pelo maior comprimento, timeout ou altura.

O prefixo finalizado não pode ser reordenado por essa API. Certificados de
outra rede, fora de ordem, adulterados ou conflitantes são rejeitados. Após
reinício, o banco verifica toda a cadeia de certificados, sua correspondência
com receipts/raízes e a assinatura da autoridade. Isso não substitui reexecutar
STARKs na recuperação de uma réplica a partir de dados externos.

Uma réplica recupera o genesis confiável e reexecuta bundles públicos em ordem:
assinatura, STARK, estado e certificado. Falha no certificado pode deixar uma
inclusão válida pendente; jamais cria finalidade. A operação deve parar e o
sufixo pendente pode ser removido pelo administrador.

Uma âncora externa `(height, checkpoint_id)` impede abrir um backup anterior ou
divergente de uma finalização conhecida. Sem âncora independente, não se pode
detectar o apagamento completo da história finalizada junto com o banco. Banco
e âncora restaurados juntos de um backup velho não oferecem proteção contra
rollback. A âncora é obrigatória no CLI para assinar, reorganizar ou certificar
uma restauração; é configurável no gateway. Réplicas devem obtê-la por canal
confiável independente, não confiar automaticamente na resposta do mesmo nó.

## Critérios e limites de liberação

Testes cobrem inclusão/finalização, assinatura real ML-DSA, STARK nativo,
réplica/restauração, reorganização, concorrência e crash antes do commit.
Ainda faltam auditoria independente, chave protegida e autoridade operacional
única com prevenção de split brain, distribuição/backup externo das âncoras,
disponibilidade de dados, integração da carteira e teste operacional prolongado.
Uma rede BFT exigiria nova ADR e implementação; não é descrita como pronta aqui.

Operação detalhada: [runbook de settlement](../operations/settlement.md).
