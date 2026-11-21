# Responsabilidades operacionais e poderes

Estado: funções definidas; pessoas/entidade e escala ainda precisam ser nomeadas.
Não atribuir responsabilidade a um autor de commit, ao assistente ou a um nome
fictício. Registre contatos e dados pessoais em cadastro privado; o dossier público
usa IDs e hashes/referências de versões aprovadas.

| Função accountable | Deveres | Poder efetivo / restrição |
| --- | --- | --- |
| Sponsor/produto/entidade | Escopo, termos, orçamento, política monetária, decisão de lançamento | Não substitui parecer jurídico, auditoria ou responsável de segurança |
| Protocolo | Especificação, guest/SDK, review de alterações, invariantes e migrações | Não pode declarar 128 bits PQ sem evidência nem aprovar a própria auditoria independente |
| Operações | Host único, imagens/digests, disco, certificados TLS, acesso e manutenção | Policy reader/submitter/monitor não é chave da autoridade; não abrir segundo escritor em outro host |
| Guardião da autoridade | Chave de finalização, emissão de certificados, âncoras externas e fencing | Comprometimento/equivocação exige conter; não apagar prefixo finalizado para corrigir incidente |
| Segurança/incidente | Alertas, triagem, contenção, evidências, revogação e reteste | Pode recomendar/bloquear ingresso e modos halt/read-only; não tratar revogação como cancelamento de trabalho já admitido |
| Backup/DR | Backup privado de chaves, recuperação do nó por peers ou cópia cifrada opcional, ensaios e medição de RPO/RTO | Não promover snapshot antigo abaixo da âncora; separar escritor/restore quando possível |
| Jurídico/compliance | Enquadramento por atividade/jurisdição, contratos, autorizações e obrigações aplicáveis | Requer profissional habilitado e responsável da entidade; chave criptográfica não é qualificação |
| Privacidade | Inventário, papéis, minimização, retenção, direitos e incidentes | Nomear função/encarregado quando aplicável; blockchain não dá exclusão automática de histórico finalizado |
| Suporte/comunicação | Onboarding, avisos, feedback, encaminhamento de incidentes | Nunca pedir senha, spend secret, note aberta ou chave privada; não prometer moeda/rendimento/certificação inexistentes |

## Nomeação e segregação

Para cada função: ID responsável, substituto, referência do cadastro privado,
aceite de deveres, horários/escala, canal de escalonamento e evidência de teste.
Defina quem mantém o alerta fora de horário; não declarar atendimento 24/7 sem
escala real e recursos. Quem detém a chave da autoridade precisa de procedimento
separado do deploy do gateway. Operação pequena pode acumular funções operacionais
somente com análise de conflito e controles compensatórios documentados; revisão
independente de segurança e parecer jurídico não podem ser fabricados pela equipe.

Aprovação de lançamento envolve produto/sponsor, protocolo, operações, segurança
e jurídico, com identidades de aprovação distintas. O gate criptográfico exige
chaves/IDs distintos por função, mas independência organizacional, competência,
mandato e conflitos continuam sendo verificados fora do código. Não usar chaves
financeiras da autoridade/carteiras para assinar documentos de release.

## Decisão e incidente

- Conter primeiro: suspender novas escritas, bloquear ingresso e parar signers/
  jobs quando necessário. Preservar logs, imagem/config e checkpoint independente.
- Nomear incident commander e substituto; acionar jurídico/privacidade se o tipo
  e jurisdição exigirem avaliação/notificação. Prazos legais não são inventados
  neste documento: devem constar de matriz jurídica aprovada.
- Backup/DR e operações recuperam em isolamento; protocolo/segurança verificam
  schema, provas e finalidade. Cercar o host/autoridade antigo antes de failover.
- A retomada exige aceite do responsável do incidente, segurança, operações e
  dos demais responsáveis afetados. Não remover bloqueio de produção por variável.
- Sponsor e jurídico aprovam comunicações/ofertas; segurança/protocolo conferem
  alegações técnicas. Registrar decisão, evidências, condições e prazo de validade.

Antes do lançamento: ensaio de handoff, alerta recebido por pessoa real, restore
externo e incidente simulado com participação da equipe. Runbooks prontos não
comprovam plantão, entrega de alerta ou desempenho de recuperação.
