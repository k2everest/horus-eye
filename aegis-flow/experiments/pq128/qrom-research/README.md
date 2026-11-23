# Aegis/QUEER V5 — modular QROM route (2026-11-23)

**Status: RESEARCH / HOLD_NO_GO.** This directory neither implements a quantum extractor nor proves PQ128. It never authorizes financial activity or mainnet.

## Primary sources

- Chiesa–Manohar–Spooner, [ePrint 2019/834](https://eprint.iacr.org/2019/834): BCS applied to public-coin round-by-round sound IOPs; QROM soundness with asymptotic Q² algebraic and Q³ hash dependencies.
- Chiesa–Dall'Agnol–Di–Guan–Spooner, [ePrint 2025/947](https://eprint.iacr.org/2025/947): **interactive** BCS variant with collapsing vector commitments. This does not prove Aegis's noninteractive Fiat–Shamir transcript.
- Chiesa–Di–Hu–Zheng, [ePrint 2025/2166](https://eprint.iacr.org/2025/2166), EUROCRYPT 2026, and [authors' slides](https://zihanhu.cn/assets/pdf/pq-bcs.pdf): modular QROM BCS for IORs/SNRDXs using state-restoration security and quantum vector-commitment extraction. Their displayed **asymptotic** dependencies include O((t+k)²·epsilon_RBR) and O(t³/2^sigma).

**Do not claim that EUROCRYPT 2026 eliminates Q².** Its value is a modular proof path and potentially knowledge soundness *if* the formal conditions hold. The IOR-to-Aegis mapping is still missing.

## Reproducible feasibility screen

Run from repository root:

    node --test aegis-flow/experiments/pq128/qrom-research/modular-route.test.mjs
    node aegis-flow/experiments/pq128/qrom-research/modular-route.mjs --degree 16 --digest-bits 576
    node aegis-flow/experiments/pq128/qrom-research/modular-route.mjs --wired-rbr /path/to/wired-report.json

Defaults: **global** Q=2^128, H=2^32 receipts, S=64 segments, four event families. An *illustrative*, not theorem-proved, E=2^40 union is applied; without supplied rounds, the code optimistically takes k=0 and explicitly records this assumption.

For BabyBear extension degree d and prior Aegis LogUp numerator 2^27, the script computes the **two-subterm, unit-prefactor** illustration with exact BigInt rationals:

    B_demo = E (Q+k)^2 2^27 / (2013265921^d) + E Q^3 / 2^sigma

G1 requires B_demo <= 1/2; G2 requires B_demo <= 2^-128. These comparisons **do not include** full AIR/DEEP/FRI/batching errors, the full quantum Merkle/commitment interface, concrete theorem constants, knowledge extraction, privacy, transcript mapping or adaptive composition. Even passing both does not qualify PQ128.

Optional --wired-rbr ingests the actual **interactive** WiredAir report shape; this is a read-only diagnostic. If UDR and LDR are both present it takes the worse of their reported bit bounds **pending proof that these bounds apply**. A self-reported JSON is not an independent attestation.

## Required proofs before promotion

1. Verify the exact ePrint 2025/2166 theorem statements (revised 2026-03-02), loss constants and which games are proven: IOR/SNRDX and **knowledge** versus basic soundness.
2. Establish the actual program's full round-by-round **knowledge** soundness for six SHA-512 hashes and LogUp/ALI/DEEP/FRI, not only the small circuit smoke tests.
3. Specify the precise Plonky3 Fiat–Shamir transcript byte format, domain separation, public preprocessed commitment, salts, queries, MMCS and all openings.
4. Prove the quantum-extractable vector-commitment premise for the salted HidingFriPcs/Merkle MMCS (collision resistance alone does not suffice); check IOP-to-IOR/SNRDX mapping.
5. Instantiate finite constants, round count k, quantum oracle budget, and adaptive global composition **without invented factors**.
6. Construct a separate quantum financial witness extractor and ZK/unlinkability simulation, including network leakage.

Every obligation is a hardcoded false in the executable screen. There is no input parameter that promotes it to a certificate.

**No consensus migration, financial authorization, mainnet, sale or PQ128 claim follows from this research.**

## Revisão de graus comprometidos

A [derivação HidingFriPcs](HIDING_COMMITTED_DEGREES.md) distingue domínios
originais/estendidos, chunks mascarados, recomposição honesta/adversarial e
cada rodada FRI. A auditoria confere 15 fontes fixados e o relatório nativo;
isso não substitui extração de baixo grau ou o teorema QROM.
