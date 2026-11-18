# Revisão de lançamento

Estado: **bloqueado**. Pacote técnico preparado; regras comerciais finais,
responsáveis nomeados e conclusão jurídica ainda dependem de dados/decisões
reais. Não foi contratado/contatado auditor ou advogado, nomeada entidade nem
obtida autorização externa por esta etapa. Nenhum lançamento foi autorizado.

## Documentos

- [Regras monetárias](monetary-rules.md): fatos implementados, gênese e decisões
  necessárias sobre unidade, supply, public_amount, direitos e governança.
- [Responsabilidades](operating-responsibilities.md): funções, poderes, segregação,
  substituição, incidentes e aprovação. Nomeações/escala continuam pendentes.
- [Matriz jurídica](legal-review.md): perguntas, fatos e evidências a avaliar por
  profissional habilitado para entidade, países e atividades específicos.
- `review.json`: draft estruturado com candidato, escopo, decisões, responsáveis,
  documentos e referências de evidências. Nulos não são aprovações implícitas.

A política atual é laboratório/testnet sem valor econômico. O pacote não escolhe
um supply comercial, alocação de tesouraria, preço, promessa de rendimento/resgate
ou parecer aplicável ao Brasil/Portugal/outro país sem definição de escopo.

## Ordem da decisão

1. Sponsor define entidade, países/público e atividades: testnet versus oferta
   econômica, custódia/controle efetivo, emissão e serviços. Jurídico confirma fatos
   e enquadramento. Não atribuir esses papéis ao autor do código por dedução.
2. Protocolo e sponsor especificam as decisões monetárias; jurídico/contabilidade
   e segurança revisam direitos/riscos. Para cada regra, distinguir documentação
   de enforcement. O teto por note não é supply declarado e public_amount não
   representa taxa efetivamente recolhida.
3. Nomear funções e substitutos, registrar mandato/aceite, cobertura/escalonamento
   e executar exercícios de incidente/DR. Cadastros privados ficam fora do Git;
   usar IDs e hashes/referências no dossier público.
4. Resolver P0 técnicos, executar campanha P1 pública, restore externo e validações
   aplicáveis. Parecer, licença ou controle exigido precisa de evidência real,
   com versão/escopo. Referenciar um hash não prova existência ou qualidade.
5. Fixar candidato imutável e verificar imagem/release contra o commit, programa,
   config ID e genesis aprovados usando as ferramentas de release existentes.
   O checker documental confere fontes Git, documentos e assinaturas, mas **não
   inspeciona imagem implantada nem conteúdo de pareceres/mandatos externos**.
6. Obter aprovações específicas por função e decisão formal de lançamento pelos
   responsáveis. Mudança relevante invalida aprovações e exige nova revisão.

## Baseline e fonte candidata

`services/launch-review/facts-baseline.json` registra fatos conservadores e hashes
dos fontes que os sustentam. O relatório não deriva autorização monetária de um
booleano editável. Quando há commit candidato válido, lê os arquivos desse objeto
Git; sem candidato, o diagnóstico lê a árvore local e mantém candidato pendente.
Mudança nos fontes exige nova revisão do baseline, não atualização cega de hashes.
Isso não é prova formal ou auditoria completa de todo o software/dependências.

O `review.json` pode ficar fora do commit runtime revisado (por exemplo em `work/`).
Assim o SHA do candidato não depende de um arquivo que contém o próprio SHA. Os
três documentos públicos são vinculados por hash; pareceres e dados privados são
referências externas. Alterar candidato, escopo, regras, responsáveis, evidências
ou documentos muda o digest e invalida assinaturas antigas.

## CLI e aprovações

Diagnóstico do draft e gate de lançamento, na raiz do repo:

```sh
node aegis-flow/scripts/launch-review.mjs inspect
node aegis-flow/scripts/launch-review.mjs gate
```

`inspect` retorna diagnóstico com saída zero. `gate` termina com código 1 no estado
atual. Não é um deploy e não modifica `assertDemoRuntime`, genesis, fee, saldo ou
permissões da autoridade. O relatório preserva `release_authorized: false`,
`legal_clearance_asserted: false`, `production_ready: false` e os P0 conhecidos.
Mesmo com todos os controles documentais preenchidos, a evidência externa exige
validação e o protocolo atual não passa o requisito de 128 bits PQ.

Cada aprovador usa identidade **de revisão**, ML-DSA-65, distinta das chaves de
fundos/autoridade. O registro de confiança contém para cada um:

```text
{ signer_id, role: product|protocol|operations|security|legal,
  public_key: SPKI_ML_DSA_65, mandate_sha256, qualification_review_sha256 }
```

IDs/chaves duplicados são recusados. Isso não demonstra que cinco chaves são
cinco pessoas independentes; a organização verifica identidade, mandato, conflito
e habilitação jurídica e publica o fingerprint do registro por canal confiável.
As assinaturas só comprovam controle da chave e decisão sobre o digest especificado.

Exemplo de assinatura individual (expires-at é epoch milliseconds, até 30 dias
após signed_at; use validade mais curta conforme o parecer/processo):

```sh
node aegis-flow/scripts/launch-review.mjs sign --dossier work/review.json --signer APPROVER_ID --role operations --decision approve --expires-at EPOCH_MS --key-file /secure/review-only-private.pem --output work/operations-approval.json
```

A chave é lida de arquivo regular 0400/0600, sem symlink, e nunca impressa. Não
exporte chaves do cofre para esse comando. Aprovação expirada/futura, papel alterado,
assinatura inválida ou um reject mantém o controle fechado. Não reutilize aprovação
de outro digest. Rejeição e condições devem também constar da ata correspondente.

O agregador recebe arrays de registro e envelopes de aprovação, com fingerprint
externo do registro (SHA-256 dos bytes do arquivo; não usar valor vindo apenas
do próprio arquivo não confiável):

```sh
node aegis-flow/scripts/launch-review.mjs inspect --dossier work/review.json --registry /secure/approvers.json --registry-sha256 TRUSTED_SHA256 --approvals work/approvals.json --output work/review-result.json
```

O relatório separa controles documentais de autorização real. Não oferece um
atalho para remover bloqueadores financeiros por assinatura/flag. Arquivar ata,
artefatos, imagens/commits, hashes, pareceres e validade; publicar apenas conteúdo
apropriado. Comunicações, termos e identificação da entidade precisam corresponder
à operação e à versão efetivamente disponibilizada.

## Pendências atuais para preencher o pacote

Entidade/países e escopo confirmados; política monetária e gênese revisadas;
responsáveis/substitutos/escala; parecer e documentos jurídicos aplicáveis;
auditoria/parâmetros criptográficos; chave/DR externo; campanha pública prolongada;
revisão da comunicação; candidato e aprovações autênticos. A revisão técnica local
não preenche esses campos inventando uma empresa, advogado ou auditor.
