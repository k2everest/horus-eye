# Decisão sobre a meta pós-quântica de 128 bits

Em 19/11/2026, a revisão interna não demonstrou a meta do receipt completo e
não encontrou, entre os candidatos examinados, uma substituição pronta com
evidência suficiente. Isso não demonstra que a meta seja impossível, nem que
nenhum outro motor possa atendê-la. O RISC Zero atual permanece exclusivamente
para laboratório. Não houve mudança de consenso, circuito ou programa.

## Comparação dos candidatos

| Construção examinada | Evidência encontrada | Decisão para Aegis |
| --- | --- | --- |
| RISC Zero fixado no projeto | Campo e consultas não sustentam sequer 128 bits no estimador conjectural adotado. Inventário local e fontes upstream conferidos. | Rejeitado para liberação com a meta PQ128; preservar compatibilidade de laboratório. |
| Plonky3, `p3-security` e arquitetura | Biblioteca de análise e componentes FRI com ocultação. A arquitetura distingue ocultação do PCS de ZK do protocolo completo e exige análise da aplicação. | Candidato a pesquisa de substituição; não aprovado nem integrado. |
| Winterfell, README | O projeto informa que não está pronto para produção e que não fornece perfect zero knowledge; isso não é uma demonstração de ZK computacional apropriada à Aegis. | Não selecionar como substituição direta para notes privadas. |

Fontes primárias: [Plonky3 security](https://github.com/Plonky3/Plonky3/blob/main/security/src/lib.rs),
[arquitetura](https://github.com/Plonky3/Plonky3/blob/main/docs/architecture.md),
[Winterfell](https://github.com/meta/winterfell/blob/main/README.md).
O [inventário dos arquivos examinados](backend-source-inventory-2026-11-19.json)
registra SHA-256 e identidade de blob Git. As URLs usam `main` e podem mudar;
o inventário identifica o conteúdo efetivamente consultado, não fixa um build.
Ausência de garantia nesses arquivos não prova ausência de resultados em toda a literatura.

## Dimensionamento reproduzível antes de um fork

O diagnóstico `review-stark-security.mjs` agora aloca um orçamento explícito
entre lookup, constraints e FRI. Para um erro modelado agregado de no máximo
`2^-128`, 64 segmentos e o máximo aceito `po2=24`, exige de cada um dos três
termos pelo menos:

```text
128 + log2(64) + log2(receipt_attempts) + log2(3) bits
```

| Cenário hipotético | Consultas mínimas para essa alocação | Grau mínimo de extensão para essa alocação |
| --- | ---: | ---: |
| Uma tentativa de receipt de até 64 segmentos | 68 | 6 |
| 2^32 tentativas de receipts de até 64 segmentos | 84 | 7 |

O grau é recalculado incluindo o fator `103 / grau` do termo de lookup; não se
congela esse fator no valor do campo atual. Arredondamentos são conservadores.
Esses mínimos pertencem à alocação igualitária escolhida e ao modelo conjectural,
não são mínimos universais. O cenário 2^32 é uma hipótese de planejamento, não
uma previsão de uso ou limite imposto à rede. O SDK não foi qualificado para
esses graus, e alterar o campo afeta toda a implementação.

**Esta tabela não propõe um perfil PQ128.** Ela só mostra por que aumentar
consultas ou reduzir segmentos isoladamente não fecha a meta. O cálculo não
inclui redução QROM, funções hash, conhecimento, privacidade ou composição real.
O resultado continua `target_met: false` mesmo para os parâmetros hipotéticos.

## Contrato necessário para uma substituição

Antes de portar o circuito para Plonky3 ou outro motor, o argumento de segurança
precisa identificar o protocolo exato e o teorema de Fiat–Shamir aplicável no
QROM, com tempo, memória, consultas e probabilidade de sucesso explícitos.
Também precisa cobrir todas as mensagens/compromissos ocultando o witness,
extração/conhecimento, abertura dos commitments e composição de segmentos.
Um resultado clássico de soundness do IOP não basta.

O inventário de hashes deve separar colisão, segunda pré-imagem e pré-imagem.
Um digest de 256 bits não significa 128 bits de resistência quântica a colisões:
no modelo ideal com consultas quânticas e recursos apropriados, os expoentes
genéricos são n/3 para colisões e n/2 para busca de pré-imagem. Isso não prova
um ataque de falsificação da Aegis e não substitui uma redução para cada uso.
Se a redução exigir resistência a colisões com expoente 128 nesse modelo,
um hash ideal exige saída de pelo menos 384 bits, antes das perdas de composição.
Trocar apenas SHA-256 por SHA-384 externamente não modifica o Poseidon2 interno.

Referências dos algoritmos genéricos: [Brassard–Høyer–Tapp](https://arxiv.org/abs/quant-ph/9705002)
e [Grover](https://arxiv.org/abs/quant-ph/9605043). Contagem de consultas não é
contagem de portas ou estimativa de custo de uma máquina física.

A migração precisa de um perfil novo vinculado pelo verificador, identidade de
programa/rede correspondente, provas positivas e negativas nativas do circuito
financeiro completo e medições de recursos. Um teste de recorrência aritmética
ou uma flag `security_bits=128` não substitui essa validação.

Não há aprovação independente nesta decisão. A tarefa de demonstrar PQ128 ou
entregar uma substituição qualificada permanece aberta; o trabalho aqui entrega
comparação rastreável e dimensionamento, não uma alegação criptográfica nova.
