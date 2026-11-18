# Pacote para auditoria criptográfica independente

**Estado: P0 NÃO concluído.** Este pacote e as correções locais são preparação
interna, feitas pelo mesmo autor da implementação. Não constituem auditoria
independente, certificação FIPS, análise formal de soundness ou autorização
para produção financeira. Não foi contratado nem contatado auditor externo.

## Baseline e escopo

Baseline da revisão interna: `4ec3cafebee0130164175431fb6d3b47408e8f9f`.
As correções subsequentes de admissão HTTP e importação de outputs precisam
ser incluídas no SHA do candidato efetivamente entregue ao auditor. Congelar
esse SHA e o image ID; alterações posteriores exigem análise do delta/reteste.

Motor: RISC Zero 3.1.0 composite STARK, exclusivamente Poseidon2, sem receipts
Fake/Groth16 ou assumptions aninhadas. Programa aprovado e hashes em
`services/proof-engine/program.json`; fonte do verificador e locks também
entram no escopo. O manifest do programa, sozinho, não audita a integração.

| Invariante | Implementação a examinar | Evidência disponível | Trabalho independente necessário |
|---|---|---|---|
| Ownership | guest main.rs: owner = hash(spend_secret), abertura da note; shielded-note-v2.mjs | Secret incorreto rejeitado pelo guest real | Justificar relação de autorização, segurança da preimagem, geração/armazenamento de segredos |
| Saldo | guest: inputs/outputs por asset, sum com checked_add, public_amount | Inflação rejeitada pelo motor real | Revisar fee/retirada pública, emissão/genesis e conservação em sequências de transações |
| Ranges | guest: u64, 1..2^53-1; public_amount não negativo | Out-of-range rejeitado no teste real | Fronteiras 0/MAX, serialização JS/Rust, ausência de overflow/wrap e negação de valores inválidos |
| Commitments | Note V2 binária, domínios, randomness; Merkle count/index | Alterações de campos/paths/count rejeitadas | Análise hiding/binding e segurança pós-quântica; vetores de interoperabilidade e revisão dos domínios |
| Nullifiers | guest: hash(commitment, secret); SQLite PK + input consumido | Derivação inválida, processo concorrente e SIGKILL testados | Análise de unicidade/linkabilidade; revisão de replay/recovery/restore e confiança do estado |
| Binding da transação | ML-DSA, tx_id, statementForTransfer, journal, image ID fixado | Journal/bytes/program ID adulterados rejeitados; snapshot contra mutação durante await | Análise de substituição, replay entre redes, canonicalização e todas as entradas públicas relevantes |
| Receipt/proof engine | Rust verifier, bincode com limite, disable-dev-mode, pins/checksums | STARK verdadeiro aceito; forgery antiga e bytes alterados rejeitados | SDK/versões/parametrização, parser adversarial, assumptions, QROM/Fiat–Shamir e supply chain |
| Destinatário | openTransferOutputV2; ML-KEM/HKDF/AEAD | ML-DSA+AEAD válidos com plaintext divergente são rejeitados na importação | Confirmar adoção pela carteira, vínculo de identidade/endereço e confirmação por ledger confiável |
| Estado | submitProvenTransfer e PersistentLedger | Root corrente, idempotência, rollback, backup e volume entre containers | Revisar fronteiras privilegiadas, falhas de disco, rollback de backup e raízes ancoradas externamente |

As descrições não substituem especificação/revisão da relação. Ver também
`docs/architecture/04-zk-statement.md` e `docs/adr/ADR-0004-composite-stark-sqlite.md`.

## Orçamento de segurança a definir antes do parecer

A configuração fixada não demonstra 128 bits pós-quânticos; a revisão de
parâmetros abaixo substitui a indicação anterior de aproximadamente 98 bits.
ML-DSA/ML-KEM
não elevam automaticamente a segurança dos transcripts SHA-256, commitments
ou STARK. O auditor deve definir o adversário/modelo e avaliar cada componente,
incluindo Fiat–Shamir/QROM, pré-imagem, colisão, hiding e composição.
Não converter estimativas conjecturais em segurança quântica por divisão simples.

## Fronteiras de confiança obrigatórias

- Witness gerado localmente; nunca enviado ao gateway, banco, logs ou pacote
  público. O cliente deve proteger as notes/segredos com keystore adequado.
- Assinatura válida sozinha não autoriza gasto. A única submissão V2 pública
  passa pelo STARK e pelo commit transacional do estado.
- `commitTransition` é DAO privilegiado: não expô-lo em uma rota pública nem
  interpretar o seu retorno como prova criptográfica por si só.
- Genesis é administrativo/offline e confiável; precisa de política de emissão.
- Root local não é consenso. SQLite é single-host; restore de snapshot antigo
  não pode ser tratado como estado canônico sem uma âncora externa.
- AEAD não comprova que plaintext corresponde ao commitment. O helper de
  importação verifica esse vínculo, mas não confirma inclusão/settlement.
- Overrides de paths/binários são configuração de operador, não dados de cliente.
  Proteção de executáveis, release e permissões precisa entrar no escopo.

## Reprodução

Pré-requisitos e hashes de ferramentas em `services/proof-engine/README.md`.

```bash
mkdir -p work
node aegis-flow/scripts/audit-baseline.mjs > work/aegis-audit-manifest.json
bash aegis-flow/scripts/dev-env.sh test
python3 aegis-flow/scripts/setup-stark.py
AEGIS_STARK_INTEGRATION=1 node --test aegis-flow/services/proof-engine/integration.test.mjs
```

A suíte rápida não substitui a integração STARK real. A integração deve ser
executada contra o binário e o source SHA do candidato, sem dev-mode. O
relatório deve distinguir evidência observada, hipótese e itens não testados.
Não incluir testemunhos privados, chaves ou snapshots pessoais ao compartilhar
resultados. Fixtures públicos NIST do repositório não são credenciais.

## Entregáveis exigidos do auditor externo

1. Identidade/equipe responsável, experiência relevante e declaração de
   independência em relação à implementação.
2. Commit, manifests, ferramentas, arquitetura, ambiente e limites examinados.
3. Threat model, modelo/nível de segurança e análise das nove linhas acima.
4. Achados com severidade justificada, pré-condições, impacto, reprodução,
   código afetado e recomendações; explicitar itens fora do escopo.
5. Revisão das correções em novo SHA e evidência de reteste independente.
6. Relatório final: nenhum crítico/alto aberto **no escopo declarado**, riscos
   residuais e limitações. Não generalizar um parecer parcial para toda a rede.

## Gate de liberação deste P0

Permanece fechado até haver relatório externo, parâmetros aceitos, correções
de todos os críticos/altos, reteste externo no candidato final e aceite dos
riscos residuais pelos responsáveis. Outros P0 de carteira, consenso,
autenticação e operação não são encerrados por uma auditoria de criptografia.
## Revisão dos parâmetros STARK

O requisito de 128 bits pós-quânticos permanece **não atendido**. Consulte
[a revisão reproduzível dos parâmetros](stark-parameters.md), o inventário
`services/proof-engine/security-profile.json` e o comando de liberação
`node aegis-flow/scripts/review-stark-security.mjs --require-production`.
O comando falha enquanto faltar evidência; não representa auditoria independente.

## Settlement permissionado

A ADR-0005 define finalidade por autoridade única ML-DSA-65. Incluir na revisão
`ledger-state/finality.mjs`, `settlement.mjs`, migração SQLite v2, emissão/importação
de certificados, cadeia de checkpoints, rewind somente do sufixo não finalizado
e recuperação com âncora externa. Testes internos de concorrência/crash e replay
com STARK nativo não substituem auditoria, proteção da chave e prevenção
operacional de split brain. Não existe consenso BFT nem garantia de 128 bits PQ.

## Carteira e cofre local

Incluir `wallet-local/vault.mjs`, `wallet.mjs`, `server.mjs` e a interface
`QueerWallet` no escopo. Revisar scrypt/AES-GCM, parse/autenticação do backup,
gravação atômica, bloqueio e limites de limpeza de memória; token/Host/Origin do
serviço loopback; pinning de configuração/genesis/âncora; revalidação de STARKs e
certificados; decriptação de notes, seleção de inputs e reserva/retry duráveis.
Testes internos não certificam segurança de navegador/OS, armazenamento de
hardware, rotação de identidade ou recuperação social. Essas capacidades não
foram implementadas nesta etapa. Runbook: `docs/operations/wallet.md`.
