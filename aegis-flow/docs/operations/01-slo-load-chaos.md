# SLO e homologação de carga/caos

## Mapeamento da tarefa

Estes testes pertencem à **US-021 — Testes de carga e caos**, conforme o CSV do backlog. A classificação histórica como US-014 foi corrigida: US-014 é validação atômica de transação e estado, ainda pendente.

## SLO mínimo

- **Disponibilidade mensal do validation-gateway:** >= 99,9%.
- **Janela de medição:** 30 dias, excluindo manutenção previamente anunciada.
- **Indicador:** respostas bem-sucedidas / total de requisições válidas.
- **RTO do teste de caos:** <= 2 segundos após uma falha transitória injetada.
- **Critério de recuperação:** a primeira requisição válida após a falha deve retornar HTTP 200.

## Homologação automatizada

O arquivo `services/validation-gateway/load-chaos.test.mjs` executa:

1. carga nominal concorrente de 200 requisições válidas e valida disponibilidade >= 99,9%;
2. injeção de uma falha HTTP 503;
3. validação de recuperação automática na requisição seguinte dentro do RTO.

## Limites do MVP

- O teste é local e mede o processo do gateway, não a infraestrutura completa do Cloud Run.
- Antes da produção, executar o mesmo cenário contra `stage`, incluindo múltiplas réplicas, reinício de instância e indisponibilidade da persistência.
