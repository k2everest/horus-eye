# Preparação para produção

## Estado e escopo

O produto atual é uma demonstração sem valor monetário. Não há release
financeira autorizada por esta preparação. O gateway falha ao iniciar em
`NODE_ENV=production` ou com `AEGIS_MODE` diferente de `demo`. A imagem Docker
é explicitamente demonstrativa; mudar variáveis para `development` não elimina
os bloqueadores. `valid: true` significa apenas envelope demo aceito.

## Etapas e evidências de saída

| Etapa | Entrega | Critério de saída | Dependência |
|---|---|---|---|
| P0 Base | Backlog corrigido, bloqueio de produção, hardening e CI | Testes negativos de produção e entradas malformadas; build reproduzível | Nenhuma |
| P1 Arquitetura | ADR de settlement externo versus rede própria; protocolo, unidades inteiras, fees, finality e ameaças | Revisão técnica registrada e orçamento de desempenho | P0 |
| P2 Criptografia | ML-DSA/ML-KEM reais, KDF/AEAD, commitments revisados e provas criptográficas | Vetores oficiais, casos negativos, benchmarks e revisão independente | P1 |
| P3 Estado | Banco transacional, migrações, unicidade de nullifiers e aplicação atômica | Gasto duplo rejeitado entre processos, retries idempotentes e recuperação após crash | P1; aceitação completa depende de P2 |
| P4 Testnet | Settlement, indexador, status, carteira e faucet | Envio até finalização com saldo do estado, reorgs e retries testados | P2, P3 |
| P5 Operação | IaC, ambientes, autenticação, secrets, monitoramento e backups | Testes de carga real, restauração e incidentes em staging | P4 |
| P6 Segurança | Auditorias, pentest, correções e testnet adversarial | Nenhum achado crítico/alto aberto; correções revalidadas | P4, P5 |
| P7 Lançamento | Revisão de release, responsáveis, requisitos jurídicos e limites iniciais | Evidências assinadas pelos responsáveis técnicos e operacionais | P6 |

P0 iniciou nesta entrega, mas o build do frontend ainda precisa ser validado.
Responsáveis individuais e orçamento precisam ser atribuídos antes de assumir
datas. Estimativas preliminares com equipe dedicada: testnet 3–5 meses;
produção financeira 6–12+ meses. Rede própria exige reestimativa de consenso,
P2P, validadores e auditoria; não cabe automaticamente nesse prazo.

## Próximas mudanças, em ordem

1. Validar instalação/build/testes do frontend e resolver dependências.
2. ADR com alternativas de settlement e requisitos de segurança pós-quântica.
3. Prova de viabilidade ML-DSA/ML-KEM: runtime suportado, biblioteca, formatos,
   vetores oficiais, mensagens adulteradas e chaves erradas. Sem criptografia
   caseira ou fallback para os stubs.
4. Escolha e benchmark do sistema de provas: soundness, privacidade do witness,
   resistência quântica, tamanho e custo de verificação/settlement.
5. Persistência e validação atômica de tx+estado (US-014), incluindo concorrência
   entre processos, expiração de reservas, migrações e restauração.
6. Integração de carteira/gateway/settlement somente após definir esses contratos.

## Condições para remover o bloqueio de produção

- Nenhum stub no caminho de aceitação; assinatura, prova, root e regras
  monetárias realmente verificadas. Não basta adicionar um flag de configuração.
- Invariantes de valor e não reutilização de nullifiers preservados sob
  concorrência, replay, reinícios e falhas parciais.
- Chaves protegidas, rotação/recovery ensaiados e ausência de segredos em logs.
- Rate limiting, identidade/autorização, gestão de segredos e proteção de rede.
- Metas de throughput, latência, disponibilidade e recuperação definidas com
  medições reais. 99,9% é objetivo, não evidência obtida por teste HTTP local.
- Restore de backup e resposta a incidentes ensaiados; migrações compatíveis.
  Rollback de imagem não desfaz transações finalizadas.
- Auditoria independente e revisão de lançamento com requisitos jurídicos
  aplicáveis e comunicação compatível com as garantias efetivamente entregues.

## Validação desta etapa

`bash aegis-flow/scripts/dev-env.sh test` executa crypto-core, gateway/hardening
e relay sem instalar dependências externas. Os testes dos stubs comprovam
somente seu comportamento demonstrativo. O CI executa a mesma suíte.
