# Validação local da rede aberta — 18 de novembro de 2026

Implementação: `57571f5`, complementada por `c0d68ce`.
Ambiente: Node 24, verificador/prover RISC Zero fixados pelo projeto, uma máquina
local com processos HTTP e bancos separados. Não representa operação pública
por terceiros nem medição de distribuição real do poder de mineração.

## Evidências executadas

`node --test aegis-flow/services/open-chain/consensus.test.mjs`: oito testes
aprovados. Exercitam genesis sem campos de autoridade/país, proteção das opções
locais de mineração contra peers, subsídio parcial e teto exato, rejeição de
overmint e raízes incorretas mesmo com PoW válido, seleção de cadeia mais curta
com maior trabalho, reorganização de blocos confirmados, reinício/revalidação,
quatro nós com partição/recuperação, rejeição de chainwork adulterado e download
de fork concorrente em mais de um lote. Esses testes só mineram recompensas;
o backend de teste rejeita qualquer tentativa de verificar transferências.

`AEGIS_OPEN_POW_INTEGRATION=1 node --test
aegis-flow/services/open-chain/native.integration.test.mjs`: aprovado em 211 s.
Gera chaves ML-DSA/ML-KEM e uma **STARK nova**, sem verificador financeiro
simulado. Minera a recompensa, rejeita gasto imaturo, aguarda maturidade, prova
o gasto usando raiz ancestral, admite no mempool, inclui e confirma por PoW em
três full nodes com bancos separados. Confere igualdade dos tips, rejeição de
gasto repetido, decriptação autenticada pelo destinatário e revalidação integral
da base após fechar e reabrir o nó.

CLI: criação do genesis de laboratório, mineração de bloco real e abertura da
mesma base para consultar status foram executadas. Regressão:
`bash aegis-flow/scripts/dev-env.sh test`, `npm test`, `npm run build` e
`npx eslint src/pages/QueerLanding.tsx`.
Resultado final: 137 testes rápidos de backend e três de interface aprovados;
build e lint da página aprovaram. A suíte rápida pula seis integrações opt-in;
a integração PoW/STARK descrita acima foi executada separadamente e aprovada.

## O que permanece fora da conclusão

Não houve auditoria independente, demonstração de 128 bits pós-quânticos,
testnet prolongada/adversarial, restauração externa S3 deste novo formato,
ensaio multi-host ou verificação de incentivos/retarget sob ataques. A carteira
gráfica continua no modelo anterior. Confirmar por PoW não estabelece finalização
irreversível. O bloqueio de produção permanece ativo.

Protocolo e próximos gates: [ADR-0006](../adr/ADR-0006-open-proof-of-work.md).
Reprodução: [operação da rede aberta](../operations/open-chain.md).
