# Revisão dos parâmetros STARK

**Resultado: requisito P0 aberto. A configuração aceita não demonstra 128 bits
pós-quânticos. Produção permanece bloqueada.** Esta revisão interna não substitui
a auditoria independente e não apresenta uma redução de segurança quântica.

## Requisito de liberação

A meta é pelo menos **128 bits de segurança pós-quântica para a prova completa
aceita por transação**, incluindo até 64 segmentos, vinculação ao programa e ao
journal. O relatório independente deve definir a noção de segurança, os recursos
do adversário (tempo, memória, consultas clássicas e quânticas), o horizonte de
uso e a composição entre transações. Fiat–Shamir exige análise no modelo de
oráculo aleatório quântico (QROM), ou outra justificativa explícita aplicável.
Ser transparente ou usar hashes não demonstra esse requisito automaticamente.

A análise deve cobrir soundness, conhecimento/ownership e zero knowledge
separadamente; justificar as hipóteses de FRI, os erros algébricos e lookups,
Poseidon2, as vinculações SHA-256, Fiat–Shamir e a composição de receipts.
Uma conjectura ou estimativa clássica precisa ser identificada como tal. Não
se obtém um limite quântico dividindo arbitrariamente um número clássico por dois.

## Inventário da implementação aceita

O inventário versionado está em `services/proof-engine/security-profile.json`.
Ele vincula o programa, os arquivos do verificador/backend e os fontes upstream
por SHA-256. As versões efetivas vêm do `verifier/Cargo.lock`.

| Componente | Configuração |
| --- | --- |
| RISC Zero zkVM / ZKP / circuito / core | 3.1.0 / 3.0.6 / 4.1.0 / 3.0.2 |
| Receipt | Composite; sem assumptions; máximo de 64 segmentos |
| FRI | 50 consultas; expansão 4; folding 16; grau final 256 |
| Campo | Baby Bear, p = 2013265921; extensão de grau 4 |
| Poseidon2 | largura 24; rate 16; saída 8 elementos; 8 rounds completos e 21 parciais |
| Prover local | `--po2 18`; tamanho de segmento, não parâmetro de segurança |
| Verificação upstream | lê po2 do seal; máximo 24; não impõe o po2 18 do prover local |

O caminho efetivo é `risc0-zkvm::receipt::segment` →
`risc0-circuit-rv32im::verify` → `risc0-zkp::verify`, com Poseidon2. Os
parâmetros FRI são constantes compiladas do SDK. Flags do cliente ou metadados
de uma transação não os alteram. Receipts Fake/Groth16 continuam rejeitados.

## O que os números permitem concluir

O código upstream `toy_model_security` soma erros de lookup, constraints e FRI.
Dois termos são `4^-50 = 2^-100` e `1/p^4`, com `log2(p^4)` ≈ 123,63.
Logo, **esse estimador** não pode atribuir mais de 100 bits à configuração
atual. Aumentar somente as consultas também não permite que esse estimador
alcance 128, pois o termo de constraints permanece. Os demais erros e a
composição ainda precisam entrar no cálculo completo.

Isso é um limite do resultado do estimador, **não demonstra uma complexidade
de ataque nem um limite superior da segurança real do sistema**. Não calculamos
aqui um limite completo para o circuito rv32im 4.1.0. Os comentários upstream
referem 97 bits conjecturados em segmentos 2^20 e 95 em 2^24; não são uma
certificação desta instância. A indicação antiga de “cerca de 98 bits” foi
retirada do manifesto para evitar atribuir precisão ou garantia indevida.

Poseidon2 produz oito elementos do campo: armazená-los em 32 bytes não faz da
saída uma distribuição uniforme de 256 bits. É necessária análise das
propriedades usadas pelo protocolo e dos ataques quânticos relevantes. Os
hashes SHA-256 de commitments, Merkle e transcritos também precisam de análise
de propriedade e composição; a resistência pós-quântica de ML-DSA/ML-KEM não
transfere uma garantia de 128 bits para o STARK.

Uma estimativa por segmento não é uma estimativa por receipt. Por exemplo,
uma soma de erros de 64 segmentos pode consumir até 6 bits de uma estimativa
por segmento sob hipóteses apropriadas; isso não constitui a análise quântica
de composição exigida.

## Reprodução e bloqueio

Na raiz do repositório:

```sh
node aegis-flow/scripts/review-stark-security.mjs
node aegis-flow/scripts/review-stark-security.mjs --require-production
```

O primeiro comando emite diagnóstico JSON; o segundo termina com código 1
enquanto faltar demonstração. Com os crates baixados, confira também seus
hashes (substitua o caminho pelo diretório local do registry):

```sh
node aegis-flow/scripts/review-stark-security.mjs --source-root work/cargo/registry/src/index.crates.io-1949cf8c6b5b557f
```

Sem `--source-root`, o relatório declara que não conferiu os fontes upstream.
Uma divergência ou arquivo ausente falha a conferência. O inventário não atesta
o binário compilado: o manifesto de auditoria registra separadamente os hashes
dos artefatos locais. O bloqueio de produção do gateway continua incondicional;
o comando é uma checagem de liberação, não uma implantação ou aprovação de CI.

Para fechar o P0: selecionar parâmetros/backend com análise quântica aplicável
à meta; obter revisão independente da derivação completa e dos orçamentos;
implementar e fixar esses parâmetros também no verificador; reconstruir os
artefatos e reproduzir provas válidas e rejeições adversariais; corrigir achados
críticos/altos e obter reteste. Aumentar uma constante isolada exigiria um fork
do SDK e nova análise; esta revisão não modifica o protocolo para simular aprovação.

## Fontes primárias fixadas

- [FRI e constantes, risc0-zkp 3.0.6](https://docs.rs/crate/risc0-zkp/3.0.6/source/src/lib.rs)
- [Estimadores e hipóteses](https://docs.rs/crate/risc0-zkp/3.0.6/source/src/prove/soundness.rs)
- [Verificação e leitura de po2](https://docs.rs/crate/risc0-zkp/3.0.6/source/src/verify/mod.rs)
- [Poseidon2](https://docs.rs/crate/risc0-zkp/3.0.6/source/src/core/hash/poseidon2/mod.rs)
- [Rounds e largura](https://docs.rs/crate/risc0-zkp/3.0.6/source/src/core/hash/poseidon2/consts.rs)
- [Campo Baby Bear, risc0-core 3.0.2](https://docs.rs/crate/risc0-core/3.0.2/source/src/field/baby_bear.rs)
- [Circuito rv32im 4.1.0](https://docs.rs/crate/risc0-circuit-rv32im/4.1.0/source/src/lib.rs)
- [Verificador de segmentos, zkVM 3.1.0](https://docs.rs/crate/risc0-zkvm/3.1.0/source/src/receipt/segment.rs)
