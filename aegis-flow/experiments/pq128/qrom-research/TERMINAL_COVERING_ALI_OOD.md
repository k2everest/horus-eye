# Terminal covering: fixed-oracle ALI/OOD theorem and missing lifts

2026-11-23. PR #5. **PROVED CONDITIONAL ALGEBRAIC LEMMA ONLY; FULL TERMINAL COVERING UNPROVED.**

## Target

CMS Definition 8.3 requires **every** complete accepting IOP transcript to have state 1. A bad challenge B_i must be defined by pre-challenge committed data and the actual verifier challenge, not by a circular definition such as "the verifier accepts." A witness predicate K_i must support a polynomial-time extractor at the appropriate prefix. See [CMS](https://eprint.iacr.org/2019/834), ROUND_STATE_CMS_8_6.md, WIRED_RBR_KNOWLEDGE.md.

## Pointwise theorem: fixed-oracle AIR composition and OOD

Let E be a finite field, H the verifier-owned size-N trace domain, and C_0,...,C_(m-1) fixed algebraic constraint polynomials before an independent uniform rho. Let F_rho(X)=sum_(j=0)^(m-1) rho^j C_j(X). After rho, and **before** independent zeta, fix Q_rho(X); set D_rho=F_rho-Z_H*Q_rho. Define Valid_H iff C_j(h)=0 for all j,h in H.

Define:
- B_comp(rho): not Valid_H, but F_rho vanishes on every h in H.
- B_ood(zeta): not Valid_H, not B_comp, zeta outside H, and D_rho(zeta)=0.

**Theorem.** If zeta is outside H and the OOD equality F_rho(zeta)=Z_H(zeta)*Q_rho(zeta) passes, then Valid_H or B_comp(rho) or B_ood(zeta).

**Proof.** If Valid_H, done. Otherwise if F_rho vanishes on all H, B_comp holds. Otherwise choose h in H with F_rho(h) != 0. Since Z_H(h)=0, D_rho(h)=F_rho(h)!=0: the polynomial D_rho is nonzero. The accepted OOD identity gives D_rho(zeta)=0, hence B_ood holds. QED.

Under independent uniform challenges and fixed-oracle degree ceilings, Pr[B_comp] <= min(1,(m-1)/|E|) and, for a fixed nonzero D_rho of degree <= Dmax, Pr[B_ood] <= min(1,Dmax/|E|) with zeta uniformly sampled from E. If zeta is rejection-sampled outside H, use |E|-N as denominator instead. Alternatively count zeta-in-H among exceptional draws, obtaining a conservative joint upper bound (m-1+Dmax+N)/|E|. These bounds require the **actual Plonky3 composition**, selector layout, sampling scheme, independence, and committed degree caps to be proved separately. They are not full RBR bounds.

This proves a pointwise terminal-covering **dichotomy for the conditional ALI/OOD subargument**, not the whole IOP.

## Conditional Boolean witness refinement

If all private trace rows are coherently available, every Boolean/gate/pin constraint is satisfied, the independent public preprocessing matches the authenticated program, and the exact read/table multisets agree (not merely a random fingerprint), the L_full argument in WIRED_RBR_KNOWLEDGE.md gives a single consistent Boolean wire vector in O(N+G+W). This is not extraction from a succinct proof. A separate verified decoder must establish the **same** six-SHA512 financial witness and original statement relation.

## Conditional complete terminal-covering proposition

Suppose independent lemmas provide (i) coherent and binding extraction of all polynomial oracles from commitments; (ii) FRI folding/query terminal covering with an explicit pre-query bounded B_fri, including every hiding PCS round and adversarial chunk recomposition; (iii) batched PCS opening correctness or pre-batch bounded B_batch; (iv) exact LogUp multiset equality or pre-lookup bounded B_lookup(alpha,beta); (v) exact AIR/ALI/OOD identities with the fixed-oracle theorem above; (vi) a polynomial-time refinement from the extracted Boolean trace to R_fin; (vii) proof that each bad event is measurable from the prefix and its verifier challenge and K_i applies at a suitable prefix.

Then any accepting transcript outside the union of the bad events yields coherent low-degree trace oracles, zero AIR constraints, exact LogUp multiset equality, and a consistent Boolean wire assignment. Refinement yields a financial witness. Hence each accepting transcript has a witnessed K_i or one of the B_i and therefore satisfies S*(x,tau)=1. QED **subject to (i)-(vii)**.

**Unproved for the actual WiredAir/LogUp/HidingFriPcs verifier:** (i)-(iv), (vi), parts of (v), and (vii). In particular, no quantum extractor from salted Merkle/MMCS commitments is supplied. No complete terminal-covering theorem can currently be asserted.

## Counterexample to omitting pre-zeta binding

If Q_rho can be selected after zeta, then for any zeta outside H choose the constant Q_rho=F_rho(zeta)/Z_H(zeta); the OOD identity passes even when the constraints are invalid. The existing ali-deep-ood-lemma.mjs demonstrates this in F17. Therefore pre-zeta fixing is indispensable.

## Decision

The fixed-oracle ALI/OOD terminal dichotomy is established; CMS Definition 8.3 terminal covering remains **UNPROVED** on real arbitrary prover transcripts. Do not change terminal_covering_proved, knowledge, QROM, PQ128 or production flags. The local toy regression is evidence of code consistency only.
