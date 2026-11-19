# Admissão atômica sob pressão de capacidade

A poda de forks e a admissão do bloco novo agora usam a mesma transação SQLite.
O nó calcula primeiro um plano de remoção, mantendo a cadeia canônica e a branch
do pai protegidas. Executa os DELETEs e o INSERT sob BEGIN IMMEDIATE, confirma
e somente então atualiza os índices/caches em memória. Uma falha não deve apagar
forks e deixar o bloco novo ausente.

A cota de forks é calculada para a cadeia canônica que resultaria da admissão.
Estender a melhor cadeia não consome uma vaga de fork e não provoca poda sem
necessidade. Se não for possível cumprir as cotas preservando a cadeia atual e
a branch de entrada, a admissão falha sem alterar o banco; o operador precisa
rever o orçamento de recursos. Não se apaga a cadeia atual para caber uma reorg.

Dois testes injetam falhas SQL em INSERT e DELETE. Conferem preservação de
tip, corpos, quantidade/bytes/cache e estado no banco; depois removem a falha,
repetem a admissão e verificam poda efetiva e restart. O teste de INSERT também
foi executado contra a implementação anterior e reproduziu o problema.

O planejamento mantém contadores de filhos e uma fila ordenada de folhas
removíveis, sem reconstruir todo o histórico a cada remoção. Um teste adicional
usa uma transferência com STARK nativa válida e pressão de bytes para remover
24 blocos em três níveis de forks. A falha de INSERT preserva todos os blocos;
a repetição sem a falha remove os forks e sobrevive ao restart.

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

## Ensaio de histórico configurável

`benchmark-pow-history.mjs --blocks N --report ARQUIVO_NOVO` minera blocos com
PoW real, esgota um limite local configurado, exige recusa do bloco seguinte sem
perder o tip e reabre/revalida o banco desde genesis. Usa cache de estado limitado
a 1 MiB e registra duração, RSS amostrado, tamanho SQLite, commit/dirty flag e
hash do script. O preflight estima disco necessário e exige orçamento explícito.

O smoke local com 64 blocos passou. O CI executa 50.001 blocos para ultrapassar
o default de 50 mil, com limites maiores explicitamente configurados. Este ensaio
emite o teto de laboratório em três recompensas e depois minera blocos sem
transações, com piso de dificuldade quase igual ao alvo inicial. Não há
transações financeiras, STARKs novas, milhão de notes ou peers independentes
nesse benchmark. Os jobs nativos de pagamentos são separados. O relatório marca
`lifetime_leaf_capacity_closed: false` e não autoriza produção.

O job de 50.001 blocos passou em 19/11/2026 no [run 44483540835](https://github.com/k2everest/horus-eye/actions/runs/44483540835), em 2m34s de duração total do job. Isso não é tempo isolado de mineração ou replay; o relatório JSON do job contém essas medições.
