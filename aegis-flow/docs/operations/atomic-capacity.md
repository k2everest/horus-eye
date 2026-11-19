# Admissão atômica sob pressão de capacidade

A poda de forks e a admissão do bloco novo agora usam a mesma transação SQLite.
O nó calcula primeiro um plano de remoção, mantendo a cadeia canônica e a branch
do pai protegidas. Executa os DELETEs e o INSERT sob BEGIN IMMEDIATE, confirma
e somente então atualiza os índices/caches em memória. Uma falha não deve apagar
forks e deixar o bloco novo ausente.

Dois testes injetam falhas SQL em INSERT e DELETE. Conferem preservação de
tip, corpos, quantidade/bytes/cache e estado no banco; depois removem a falha,
repetem a admissão e verificam poda efetiva e restart. O teste de INSERT também
foi executado contra a implementação anterior e reproduziu o problema.

## Recibos canônicos

Recibos passam a ser encontrados em um índice por request ID, sem percorrer e
rehashear toda a cadeia a cada consulta. A extensão normal acrescenta a entrada;
uma reorganização recompõe o índice usando a nova cadeia canônica. O restart
o reconstrói durante o replay validado. O índice não é um estado confiado a peers
nem substitui assinatura, STARK, validação monetária ou trabalho acumulado.

Um teste nativo com prova pública real existente verifica inclusão, confirmação,
cópia defensiva, restart e remoção do recibo após reorg. Cem consultas repetidas
não efetuaram hashes de cabeçalhos. Isso é uma propriedade do caminho de leitura,
não medição de TPS, disponibilidade ou segurança criptográfica.

`resources.canonical_transactions` e a métrica `aegis_pow_canonical_transactions`
permitem observar a quantidade indexada. Ela continua limitada pelo histórico
retido. Os índices de cabeçalhos/recibos também consomem memória e não estão
incluídos na contagem de bytes serializados do cache de BranchState.

## Limites

Não houve aumento do limite do circuito de um milhão de folhas nem implantação
de snapshot persistente/poda canônica. Os limites locais de armazenamento e os
orçamentos de replay continuam explícitos. A implementação melhora atomicidade
e custo de leitura; não fecha a análise STARK de 128 bits pós-quânticos, auditoria
independente, qualificação de recursos ou campanha pública prolongada.
