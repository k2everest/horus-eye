# Verificação de contratos protobuf

O CI usa Buf 1.75.0 e plugins Go fixados em `buf.gen.yaml`. O script
`scripts/gen-proto.sh` executa lint, comparação de compatibilidade e geração.
`--check` executa somente lint e compatibilidade, sem gerar arquivos.

A comparação recebe `AEGIS_PROTO_BASE_REF`, resolvido para um commit local
existente. No CI, é o SHA-base do PR ou o commit anterior ao push. O checkout
busca o histórico completo. O script extrai a árvore desse commit para um
diretório temporário e a compara com o módulo atual; não procura `.git` dentro
de `aegis-flow`, que é um subdiretório do repositório. O arquivo temporário é
removido na saída. Referência ausente causa falha, sem pular a verificação.

A main atual, `f0da431cbb19909809cee25b0d59a74d882143ba`, tem configuração Buf,
mas ainda não tem schemas protobuf. Nesse caso inicial, o script registra que
não existe contrato anterior, preserva o lint e gera o novo contrato. Assim que
o commit-base contém schemas, a compatibilidade é obrigatoriamente verificada.

Quatro regressões usam Git e Buf reais em repositórios temporários: introdução
inicial, base existente, caminhos com espaços, rejeição de tipo incompatível e
falha de referência ausente. Os quatro testes passaram localmente; a geração
Go com os plugins fixados também passou. Os arquivos gerados ficam em `gen/`,
fora do Git e do contexto Docker do runtime Node.

Execução, com Buf 1.75.0 instalado e diretório de cache gravável:

```bash
node --test aegis-flow/scripts/gen-proto.test.mjs
bash aegis-flow/scripts/gen-proto.sh
```
