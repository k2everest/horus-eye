# Revisão interna preliminar — baseline 4ec3caf

Autor: o mesmo agente que implementou o código. **Não independente.**
Método: leitura de guest/verifier/binding/DAO/HTTP e regressões locais focadas.
Não houve prova formal, auditoria do SDK, fuzzing completo, teste de mainnet ou
contratação externa. Não é um parecer de ausência de vulnerabilidades.

## AUD-001 — Uploads admitidos antes do controle de verificação

- Classe: disponibilidade; severidade preliminar **alta**, antes da correção,
  em exposição HTTP sem controle de admissão/proxy.
- Evidência: em server.mjs da baseline, `verifying` só era ativado depois do
  recebimento e parse do corpo; múltiplos uploads podiam ficar em `chunks`.
  O teto de 12 MiB era por requisição, sem teto de requisições em buffering.
- Impacto: pressão de memória proporcional ao número de uploads simultâneos;
  não foi demonstrada quebra de ownership, inflação ou bypass de prova.
- Reprodução segura: manter um POST chunked incompleto e iniciar outro com
  limite de admissão configurado em 1. A regressão usa pequenos payloads;
  não foi executado OOM ou flood destrutivo.
- Correção local: reservar admissão antes de ler bytes; máximo padrão de oito
  corpos; responder 429/Retry-After no excesso; liberar uma única vez em
  aborto, erro ou término. Submissões bloqueadas por outra verificação não
  são montadas/parseadas desnecessariamente.
- Evidência: `services/validation-gateway/admission.test.mjs` cobre aborto,
  excesso, parse inválido, payload grande e recuperação. Carga nominal mantida.
- Estado: mitigação local implementada, reteste externo pendente. Isso não
  substitui limite global de conexões, autenticação, rate limit, proxy e
  dimensionamento. A memória transitória de JSON/clones também deve ser medida.

## AUD-002 — Meta de segurança criptográfica sem aceite independente

- Tipo: bloqueador de especificação/aceite, não exploit confirmado.
- Evidência: `program.json` declara SDK padrão com ~98 bits conjecturados;
  domínios/transcripts/commitments usam SHA-256 e assinatura ML-DSA.
- Risco: anunciar um nível pós-quântico que não foi demonstrado para a composição.
- Estado: **aberto**. Definir adversário, meta e avaliação de parâmetros com
  especialista externo. Não recomendar uma troca de constantes sem análise.

## AUD-003 — Importação de note exige validação além de assinatura/AEAD

- Tipo: fronteira conhecida de protocolo e controle de cliente; não foi
  demonstrado exploit contra carteira real, pois ela ainda não integra V2.
- Evidência: o guest prova os commitments das notes e autentica o binding
  público, mas não verifica dentro do circuito a cifragem do conteúdo das saídas.
  Um sender autorizado pode assinar um ciphertext válido cujo plaintext difere
  da note comprometida. Confiar apenas na decriptação permitiria importar um
  valor/owner incorreto numa futura carteira.
- Correção local preventiva: `openTransferOutputV2` valida assinatura, contexto,
  fingerprint KEM, schema, asset, commitment e preimagem de owner do destinatário.
  Retorna `confirmed:false`; não credita saldo nem atesta settlement.
- Evidência: `libs/crypto-core/recipient-output.test.mjs` cria ML-DSA e AEAD
  válidos com plaintext divergente e verifica a rejeição na importação. Esse
  teste não afirma produzir uma quebra de STARK ou criação de valor no ledger.
- Estado: helper e regressões implementados; adoção obrigatória na carteira
  e confirmação contra ledger/prova confiáveis continuam pendentes.

## Controles examinados, sem sign-off

Ownership/ranges/balance são assertions executadas no guest, sem flags do
cliente. O verifier nativo fixa image ID e journal e recusa receipts fora da
policy. O facade reconstrói statement do payload assinado e faz snapshot dos
dados antes de awaits. Root/inputs/nullifiers/outputs/recibos são validados e
gravados sob BEGIN IMMEDIATE; SQL impõe unicidade. Esses controles têm testes,
mas sua existência não prova soundness/composição nem independência da revisão.

## Pendências de evidência externa

Revisão matemática/QROM e parâmetros; fuzzing do parser/receipt; fronteiras
JS/Rust e formatos; release/compilador/binários; restauração de estado antigo;
política de genesis/fee; keystore e importação da carteira; reteste dos achados
contra o SHA final. O P0 permanece **não concluído**.
