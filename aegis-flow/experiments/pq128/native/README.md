# Ensaio nativo da relação financeira SHA-512

Este programa isolado executa ownership, note commitment, nullifier, inclusão,
ranges e conservação dentro de uma zkVM. O objetivo é conferir a relação inteira
contra um journal público, sem passar o witness ao verificador. O construtor de
constraints e o guest Rust são implementações independentes, com testes de
equivalência à relação JavaScript.

**O motor continua sendo RISC Zero 3.1.0, Poseidon2 e 50 consultas FRI. Seus
parâmetros não demonstram PQ128.** Este ensaio não altera esses parâmetros nem
os substitui por SHA-512 internamente. Não habilita produção, não muda o
programa aceito pelos nós e não conclui a análise de ZK/QROM/composição completa.

## Separação de responsabilidades

- `guest/src/lib.rs` valida o witness usando SHA-512 e encodings fixos do
  formato experimental V2. Todos os campos de entrada usam schemas estritos.
- `guest/src/bin/check.rs` é somente um checker local para testes diferenciais;
  sucesso desse comando **não** produz ou verifica uma prova.
- `guest/src/main.rs` é o programa zkVM: lê no máximo 262.144 bytes privados e
  escreve no journal somente o statement público, com no máximo 16.384 bytes.
- `backend.mjs` exige ferramentas/manifesto locais verificados, gera receipt
  composite real com dev mode desligado e verifica journal/program ID usando
  o verificador nativo. Não há fallback para o checker local ou flags públicas.
- `build.py` usa dependências/ferramentas já instaladas e outputs separados;
  não baixa ferramentas, não muda manifests antigos e não apaga dados existentes.

O programa mantém os mesmos bytes de valor/owner/randomness/segredo em todos
os hashes da relação. O nullifier permanece independente de posição/anchor,
e o estado público inclui os commitments, a raiz, a contagem e a taxa. O
verificador compara o statement completo esperado com o journal autenticado;
não confia somente no digest escrito pelo remetente da prova.

O esquema `AEGIS-EXPERIMENT-NATIVE512-COMPOSITE-V1` e a identidade de programa
são separados do esquema da rede atual. O backend da rede rejeita esse formato.
Nullifiers já gastos, emissão e finalização ainda são responsabilidades do
consenso; este ensaio não movimenta fundos nem fornece migração de carteira.

## Construção e reprodução

Em Linux/x64 com espaço e Rust host disponíveis:

```sh
python3 aegis-flow/scripts/setup-stark.py
python3 aegis-flow/experiments/pq128/native/build.py --host-only
AEGIS_NATIVE512_HOST_TESTS=1 node --test aegis-flow/experiments/pq128/native/host-differential.test.mjs
python3 aegis-flow/experiments/pq128/native/build.py
AEGIS_NATIVE512_INTEGRATION=1 node --test aegis-flow/experiments/pq128/native/integration.test.mjs
```

Os builds usam `--locked --offline`; o setup anterior instala ferramentas
fixadas por checksum. A cópia de Cargo.lock usa os mesmos pacotes/versões do
guest existente e outro nome de package. Não se aprova atualização de lock
automaticamente: a opção de regeneração é uma operação explícita de manutenção.
O build exige preflight de disco e não contorna a falta de ferramentas.

Os resultados ficam em `work/native512/`, `work/native512-host/` e
`work/native512-target/`. O manifesto gerado registra fontes, image ID, binário,
flags e checksums de ferramentas. Ele é uma entrada **local confiada pelo
operador**, nunca um campo recebido com a prova. Registro de hashes não é
atestado de correspondência fonte/binário ou aprovação criptográfica externa.
Uma terceira parte precisa reconstruir/conferir o programa com ferramentas
fixadas antes de confiar na identidade registrada.

## Verificação e evidência

O workflow possui um job separado que constrói o checker Rust, testa a
equivalência JS/Rust, gera o guest e exige uma prova composite nova. A integração
confere segredo/incorporação/saldo inválidos, journal alterado, mutação do caller,
troca de destinatário/taxa, receipt corrompida e programa/esquema incorretos.
Os artefatos de CI contêm somente o manifesto e a prova/statement públicos,
nunca witness, salts, notes privadas ou secrets.

O ambiente local da implementação tem aproximadamente 87 MiB livres e não possui
o compilador guest/target. Portanto os testes Rust e a integração nativa precisam
ser executados no CI; testes pulados localmente não contam como provas aprovadas.
Consulte o resultado efetivo do job antes de afirmar que houve receipt válida.

O receipt pode expor metadados como segmentação/execução; não foi qualificado
um modelo completo de leakage do protocolo. Segredo ausente do JSON público
não é por si só uma demonstração matemática de zero knowledge. As flags
`aegis_target_met` e `production_ready` ficam falsas mesmo que a verificação
nativa tenha sucesso. Esse ensaio valida a relação; substituir/qualificar o
motor para 128 bits pós-quânticos permanece uma tarefa separada.
