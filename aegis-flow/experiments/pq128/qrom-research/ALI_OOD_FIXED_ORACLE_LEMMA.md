# PQ128 — ALI / quotient / out-of-domain conditional lemma

Date: 2026-11-23. Aegis V5, PR #5, research-only.
**Status: CONDITIONAL FINITE-FIELD LEMMA; NO RBR KNOWLEDGE / QROM / PQ128 PROOF.**

## Real Plonky3 0.8.0 code paths

- batch-stark/src/prover.rs (tag v0.8.0): quotient_values computes the AIR + LogUp folded constraint values over a disjoint quotient domain, divides by the trace-domain vanishing polynomial Z_H, commits quotient chunks, and only then samples zeta.
- batch-stark/src/verifier/mod.rs (tag v0.8.0): recompose_quotient_from_chunks at zeta; evaluate the actual AIR with LogUp permutation openings and preprocessed columns at zeta; compare combined constraints(zeta)/Z_H(zeta) with quotient(zeta). The verifier checks the LogUp terminal sum.
- batch-stark/src/verifier/data.rs: reject zeta in the trace domain, where Z_H(zeta)=0.
- wired_r1cs.rs: Boolean gate restrictions, public preprocessed instructions, LogUp lookups; may run at 2^23 rows. BabyBear extension degree 8 is actual Plonky3 experiment, extension 16 is NOT ported to native PCS.

Sources at pinned https://github.com/Plonky3/Plonky3/tree/v0.8.0 .
No claim here that the simplified polynomial model reproduces the entire Plonky3 constraint code.

## Lemma 1 — composition challenge

For a fixed trace row x in H with at least one nonzero AIR constraint residual c_j(x), define

    F_x(alpha)=c_0(x)+alpha*c_1(x)+...+alpha^(m-1)*c_(m-1)(x).

Assume the c_j(x) are already committed/fixed BEFORE alpha.
At least one c_j(x) is nonzero, so F_x is a nonzero polynomial
of degree at most m-1. A uniform independent alpha in E=GF(p^d)
then has

    Pr[F_x(alpha)=0] <= (m-1)/|E|.

This holds for ONE selected fixed offending row and for m
constraints evaluated at that row. It does not establish that
the prover's committed oracle is low-degree, nor that a Boolean
financial witness is extractable.

In the actual flow, the permutation commitment and terminal are
received after the LogUp alpha/beta pair and before the constraint
composition challenge. Therefore the composition theorem needs
the LogUp trace to be coherent first.

## Lemma 2 — OOD quotient identity

Let H be a verifier-authenticated multiplicative subgroup of
size N, Z_H(X)=X^N-1. With fixed full polynomials C_alpha(X)
(the AIR composition polynomial) and Q(X) (the recomposed quotient)
BEFORE zeta, define

    P(X)=C_alpha(X)-Z_H(X)*Q(X).

If P != 0, then deg(P) <= D where

    D=max(deg(C_alpha), N+deg(Q)).

Therefore for uniform zeta in E=GF(p^d),

    Pr[P(zeta)=0] <= D/|E|.

If the sampled zeta lies in H, Z_H(zeta)=0 and division is
undefined; conservative unconditional sampling adds <=N/|E|
to the exceptional-event budget. If the verifier instead samples
uniformly from E\H, use the conditional denominator |E|-N
for the root bound (and establish that this is the actual sampler).

A falsely chosen Q may pass at one zeta, but its roots are bounded
provided its polynomial is FIXED before zeta and has certified degree.

The crucial caveat is that PCS/FRI Merkle commitments by themselves
do not imply the full polynomial behind the root can be extracted
with the correct degree in the QROM. This requires additional
soundness, binding and knowledge arguments.

## Combined conditional union bound

For m constraints, a committed C_alpha and Q with degree caps
D_C and D_Q, and a uniformly sampled alpha then zeta:

    eps_{ALI+OOD} <=
      [m-1 + max(D_C, N+D_Q) + N] / |E|.

This is a conservative *algebraic* two-stage illustration.
It is NOT the p3-security ALI/DEEP/FRI total theorem and
DOES NOT INCLUDE LogUp, PCS batch cancellations, low-degree
testing, merkle vector-commitment extraction, or adaptive
cross-receipt quantum composition. It does not substitute for
an actual degree theorem from Plonky3.

A row-specific composition bound of (m-1)/|E| applies
only under the stated fixed-oracle chronological assumptions.

## Executable experiments

- ali-ood-fixed-oracle-lemma.mjs:
  exact prime-field polynomial long division by X^N-1,
  Boolean AIR composition evaluation, and an OOD residual
  polynomial P=C-Z_H Q with its degree-root bound.
  Small-prime exhaustive oracle enumerates every eligible
  OOD zeta and counts actual exceptional roots.

- ali-ood-degree-budget.mjs:
  arithmetic using exact BigInt BabyBear field cardinalities
  for extension degrees 8 and 16. REFUSES to calculate an OOD
  bound unless caller supplies BOTH polynomial degree caps.
  Supplied caps are explicitly UNVERIFIED and never authorize
  PQ128 or mainnet.

The tests cover honest Q, malicious Q, false AIR constraints
hidden by exceptional alpha, OOD roots outside H, non-prime
domains and fail-closed missing degree caps.

    node --test aegis-flow/experiments/pq128/qrom-research/*.test.mjs

## Needed to advance RBR knowledge (not just soundness)

1. Extract the precise verifier-owned constraint polynomial degree
   cap and chunked Q recomposition cap from actual compile-time
   AirLayout, get_max_constraint_degree, quotient domain sizes,
   HidingFriPcs mask degrees and quotient chunk domains.
   Reject mismatches between compiled program and analysis.
2. Prove that canonical main/permutation/preprocessed oracles
   remain fixed through each alpha/zeta draw; justify challenge
   uniformity and independence in the **interactive public-coin**
   model before any BCS/QROM compilation.
3. Prove full terminal covering: if the verifier accepts, either
   the extracted full trace satisfies the same financial relation,
   or some correctly enumerated ALI, LogUp, DEEP, FRI, PCS batch
   or Merkle opening exceptional event happened.
4. Construct an **efficient** financial witness extractor from
   committed oracles; a full trace supplied by hand is insufficient.
5. Instantiate 2019/834 or 2025/2166 QROM theorem hypotheses,
   constants and quantum budget; separately prove ZK and
   unlinkability. Neither RBR soundness alone nor these
   algebraic lemmas prove PoK.

Security gates remain FALSE:
round_by_round_knowledge_proved=false,
financial_extraction_proved=false,
qrom_proved=false,
pq128_demonstrated=false,
production_ready=false.
