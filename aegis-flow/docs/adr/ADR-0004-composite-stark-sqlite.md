# ADR-0004 — Composite STARK e ledger local transacional

Status: implementado no laboratório; não libera produção financeira.

## Decisão

Manter a exigência de ZK baseada em STARK, conforme escolha do usuário.
Usar RISC Zero 3.1.0 no modo composite, com programa Rust e image ID aprovado;
recusar Fake/Groth16 e qualquer fallback para flags públicas. A assinatura
externa permanece ML-DSA e a cifragem das notes usa ML-KEM/HKDF/AES-GCM.

Note V2 usa SHA-256 com separação de domínio, owner preimage e randomness.
Inputs, outputs, nullifiers, rede, fee e binding da transação ficam públicos;
valores das notes, openings e segredos de gasto permanecem no witness privado.
A relação executável está no guest; unicidade global exige estado, não uma
flag que o prover declare na prova.

Persistir em SQLite WAL no mesmo host. Validar assinatura/STARK antes de uma
transação BEGIN IMMEDIATE, e conferir root/inputs/nullifiers dentro dela antes
de gravar todas as tabelas. O ponto de entrada público é submitProvenTransfer;
commitTransition é uma API interna de armazenamento confiável.

## Consequências

- Proving local exige ferramenta Linux x86_64, pode levar minutos e usar GiB;
  gateway só precisa do verificador, sem acesso ao witness.
- Não há trusted setup nem uma camada Groth16 no caminho aceito. O SDK contém
  suporte a outros receipts, mas o wrapper nativo os rejeita explicitamente.
- Parâmetros padrão do SDK (~98 bits conjecturados) não equivalem a uma
  garantia de 128 bits pós-quânticos. Auditoria/revisão dos parâmetros e da
  relação é bloqueadora de produção.
- Genesis é administrativo/offline; não há faucet/mint arbitrário público.
- SQLite dá atomicidade e recuperação local, não consenso ou proteção contra
  administrador malicioso. Multi-host, NFS, Cloud Run efêmero e settlement
  externo não são entregues por esta decisão.
- V1 fica restrito à verificação de assinatura; somente Transfer V2 pode ser
  aplicado ao ledger com prova real. A carteira browser antiga ainda não gera
  esse formato; keystore e integração UI permanecem pendentes.

## Evidência

Integração real com receipt composite: adulteração de journal/image ID/bytes,
wrong ownership, inflação, range/path/nullifier inválidos, mudança de objetos
durante await, concorrência entre processos, HTTP, restart e backup. SQLite
é testado também com SIGKILL antes do commit. Container não-root/read-only
verifica o mesmo tipo de prova, aplica estado e outro container recupera e
reverifica transação/prova pelo volume.
