# PQ128: ALI / OOD conditional lemma and late-quotient counterexample

Date: 2026-11-23. PR #5. CONDITIONAL ALGEBRA, NOT PQ128.

## Grounding in Plonky3 0.8.0

Upstream source pin:

- batch-stark/src/prover.rs (blob 60224f95e7497c36d5a10f7c3ac1acbb2323941a), lines 865-891 and 1053-1063: first/last/transition selectors, powers of rho, and quotient evaluated as folded_constraints * inverse_vanishing.
- batch-stark/src/transcript.rs: the constraint-folding challenge rho is sampled after permutation commitment and terminal; quotient and hiding-randomization commitments appear before the OOD challenge zeta.
- batch-stark/src/verifier/mod.rs (blob ef49dabbedde2aedd248d55854e41dcb88ba4234), lines 721-843: recompose quotient chunks and verify AIR/lookup constraints plus the independent cross-AIR LogUp terminal condition.
- uni-stark/src/verifier.rs, lines 69-110 and 112-204: the OOD identity is C_rho(zeta) / Z_H(zeta) = Q(zeta).

C_rho includes selector-gated boundary/transition constraints, main and preprocessed columns, and extension-field LogUp accumulator/permutation constraints. It is NOT only the Boolean gate list.

## Lemma 1: invalid constraints and folding-challenge cancellation

Let E=GF(p^d), H the N-point trace domain, and C_j(X) the m fixed constraint polynomials (fixed before rho). Assume the actual fold is equivalent to

    C_rho(X) = sum_{j=0}^{m-1} rho^j C_j(X).

If there exists h in H for which some C_j(h) != 0, then

    F_h(rho) = sum_j rho^j C_j(h)

is a nonzero polynomial of degree at most m-1. Uniform independent rho therefore satisfies

    Pr_rho[all folded constraints vanish on H] <= (m-1)/|E|.

This is independent of a quotient chosen later, provided C_j remain fixed. The simplified alpha-power encoding must be checked against the concrete Plonky3 constraint-layout implementation, including base/extension indexing.

## Lemma 2: a false fixed quotient rarely agrees OOD

For rho outside the folding-cancellation event, let the adversary choose Q_rho before independent uniform zeta. Put

    D_rho(X) = C_rho(X) - Z_H(X) Q_rho(X).

Since C_rho does not vanish at every point in H, D_rho is nonzero. If degrees are bounded by deg(C_rho)<=d_C, deg(Q_rho)<=d_Q, then

    deg(D_rho) <= D = max(d_C, N+d_Q).

At most D values of zeta are roots. Conservatively accounting for
zeta landing on H separately contributes N more points:

    Pr[false AIR passes the composition + OOD check]
      <= ((m-1) + D + N)/|E|.

This does NOT include authentication of opened values by the FRI/PCS, and the numeric bound only applies once all degree ceilings are proved for the concrete committed polynomials.

## Counterexample: the quotient must precede zeta

If the prover is allowed to choose a quotient AFTER learning zeta, the constant polynomial

    Q(X) = C_rho(zeta) / Z_H(zeta)

makes the OOD test pass at every zeta outside H, regardless of invalid AIR constraints. The finite-field test with GF(17), N=4, succeeds at all 13/13 outside-domain points. The actual Plonky3 transcript commits Q before zeta. A QROM argument must still prove that this commitment truly fixes an extractable low-degree object for malicious quantum provers.

## Implementation and reproduction

- ali-deep-ood-lemma.mjs: BigInt rational conditional budget, explicit assumed degree ceilings.
- ali-deep-ood-lemma.test.mjs: exhaustive checks across all rho/zeta in small prime fields, adaptive Q(rho) constrained to not see zeta, invalid-fold cancellation, false quotient, and post-zeta counterexample.
- Run: node --test aegis-flow/experiments/pq128/qrom-research/*.test.mjs

## Next necessary mathematical proofs

1. Obtain actual degree bounds of C_rho and all Q chunks for the compiled six-SHA512 WiredAir, including hiding and selectors.
2. Prove binding and extractability of the concrete salted Merkle MMCS and HidingFriPcs under the relevant quantum game.
3. Prove uniformity/independence of rho and zeta in the interactive IOP and exact transcript binding in Fiat-Shamir QROM.
4. Extend the root argument to committed but maliciously encoded traces, authenticated openings, and FRI folding/query rounds.
5. Derive a terminal-covering state lemma for ALL accepting transcripts and an efficient extractor for the authentic financial statement.
6. Prove knowledge, privacy/ZK/unlinkability and global QROM composition independently.

Status: fixed_oracle_ALI_OOD_lemma=CONDITIONAL;
real_degree_ceiling_proved=false;
terminal_covering_proved=false;
round_by_round_knowledge_proved=false;
pq128_demonstrated=false;
production_ready=false.

No change to wallet, consensus, release gate or mainnet.
