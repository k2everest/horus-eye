# Terminal covering: ideal coherent-oracle IOP theorem

2026-11-23. PR #5 / audit PR #6.

**PROVED: pointwise terminal covering of the explicitly defined ideal IOP, conditional on W1–W6. NOT PROVED: equivalence to executable Plonky3, commitment extraction, CMS RBR knowledge, QROM or PQ128.**

## 1. The transcript and the essential separation

CMS ePrint 2019/834 Definition 8.3 requires state(empty)=0, forbids 0->1 at prover moves, and requires state=1 at every accepting terminal transcript. Definitions 8.4–8.5 additionally require probabilistic transition bounds and a polynomial-time knowledge extractor. Terminal covering alone does not imply either.

Ideal IOP semantics: a prover oracle message fixes one globally coherent *complete word*, which all subsequent queries read. The real salted Merkle/MMCS commitment does NOT automatically provide this abstraction against a quantum prover. Commitment binding and quantum vector-extractability belong to a separate compiler proof. Never insert an authentication exception decided by a prover opening **after** the final query into the ideal IOP state.

Required verifier-owned chronological boundaries:
1. Authenticated program P and main trace are fixed before the atomic LogUp alpha/beta verifier round.
2. Lookup/permutation words and terminal values precede AIR composition challenge rho.
3. Quotient chunks and hiding words precede OOD zeta.
4. Claimed PCS evaluations precede batch challenge gamma.
5. FRI word f_i precedes beta_i, with f_(i+1) fixed before beta_(i+1).
6. Final polynomial precedes verifier query vector q; late openings only read previously fixed words.

These are *required assumptions*, not a verified Rust transcript byte-level mapping. Dynamic arities/heights/injections and the query projection must be derived by the actual verifier, not accepted from the prover.

## 2. Bad events (only pre-challenge data + the named verifier challenge)

B_LU(alpha,beta): fixed unequal read/table multisets spuriously pass the lookup fingerprint/terminal/denominator checks. LogUp alpha/beta form one logical verifier move.
B_ALI(rho): fixed violated AIR component constraints combine to zero on all H.
B_OOD(zeta): fixed nonzero composed constraint-minus-vanishing-times-quotient discrepancy vanishes at zeta; exceptional domain/denominator cases included separately.
B_BATCH(gamma): fixed discrepant opening claims cancel at the first canonically selected differing position under the actual PCS batch combination. The simple monomial-batching bound remains conditional on a native equivalence proof.
B_FOLD_i(beta_i): fixed FRI word f_i is not in its code C_i, but its TRUE fold is in C_(i+1).
B_QUERY(q): at least one fixed mismatch in fold consistency, terminal polynomial consistency or batched/PCS opening consistency exists, but all verifier-derived paths sampled by q miss all such mismatches.

Every B_QUERY discrepancy and its set of bad initial query indices must be fixed **before q**. Authentication for real Merkle paths is NOT a post-query B event: it must be addressed in the hash/commitment reduction separately.

## 3. FRI multiround exact-code theorem

Take coherent fixed words f_0,...,f_t on verifier-owned fold domains, each with a target code C_i; the final polynomial is of declared low degree and is checked on queried positions. In each round the true fold A_i=Fold_(beta_i)(f_i) is determined from the preceding fixed word.

**Proposition.** Acceptance implies f_0 in C_0, or some B_FOLD_i, or B_QUERY.

**Proof.** Suppose f_0 is invalid and every fold exceptional event fails. The final polynomial defines a valid codeword. Thus along the chain there is a first invalid-to-valid transition, including the final polynomial check. At that transition the true folded word cannot be valid (otherwise B_FOLD occurred), but the next purported word is valid. Their difference is nonempty. Since every sampled folding/opening equality passed in the ideal verifier, the fixed discrepancy was missed by q, which is B_QUERY. For the final polynomial transition, its checked disagreement is included in B_QUERY by definition. QED.

For even d_i, symmetric nonzero evaluation domains and binary folds d_i -> d_i/2, at most one beta can fold an exact non-codeword into C_(i+1). This is a pointwise exact-code lemma, NOT a usable proximity/list-decoding soundness estimate: one corrupt position can escape almost every sample.

## 4. Conditional complete ideal-IOP terminal theorem

Assume:
W1. Coherent globally fixed oracles, correctly sized and aligned, exact degree/code semantics and verifier-owned challenge/query chronology for the real AIR/LogUp/FRI shapes.
W2. Outside B_FOLD, B_BATCH and B_QUERY, accepted FRI/PCS checks yield exact trace, permutation, quotient and hiding polynomial evaluations used by the rest of the verifier. All adversarial quotient chunks use the general bound degree(Qhat)<(C+1)N, not the honest correlated-mask bound.
W3. Outside B_LU, accepted LogUp means exact read/table multiset equality, with correct denominator and terminal treatment.
W4. Outside B_ALI and B_OOD, accepted AIR/composition/OOD checks imply every gate, pin, Boolean, lookup and statement-binding constraint vanishes on H.
W5. A polynomial-time extractor recovers the common Boolean wire vector from the complete trace and exact multiset, and a proven polynomial-time financial decoder gives w_fin satisfying R_fin(x,w_fin) for the *same* authenticated financial statement (including all six SHA-512 instances).
W6. Each B family is measurable from the pre-challenge historical oracle data and its named verifier challenge; the main-oracle-valid-witness predicate K(x,main) is already decided before the first LogUp challenge. Later prover messages cannot revise it.

Define S*(x,tau) as zero on empty transcript; after the first verifier challenge, set S*=1 if K is true; thereafter set S*=1 when any of the named B events occurs at its verifier challenge. State 1 is absorbing.

**Theorem (conditional terminal clause).** Every complete accepting transcript of this ideal IOP has S*=1.

**Proof.** If any bad event occurred, S* became 1 at the corresponding verifier challenge. Otherwise FRI telescoping and W2 enforce coherent low-degree openings; W3 enforces exact lookup equality; W4 enforces all AIR constraints; W5 extracts a financial witness from the *already fixed* initial main oracle. Therefore K held at the first challenge, and S*=1 from then on. S*(empty)=0. The first K event cannot occur during a prover move because K is evaluated only when the first verifier challenge occurs, after the main oracle is fixed. All later bad events are evaluated only at verifier challenges on previously fixed oracle words. Thus no prover move revives state 0. QED under W1–W6.

This does NOT establish W1–W6 for the concrete Plonky3 verifier; it is a formally explicit reduction, not an unconditional security theorem.

## 5. Concrete gaps that prevent the actual terminal theorem

1. Rust verifier-derived FriShape, code dimensions, domain injections, all batch heights and the exact query projections must be exported and matched to a native valid proof and malicious fixtures.
2. Precise p3-fri PCS batching/opening identities, denominators and hiding chunk recomposition must be shown equivalent to W2, including low-degree *binding* of adversarial oracles.
3. Full FRI proximity/list-decoding and LogUp bounds must replace exact-code toy exceptions.
4. Financial witness refinement to all six SHA-512 hashes must be proven on the extracted common wire assignment, not assumed.
5. Quantum commitment extraction, CMS Definition 8.5, BCS/Fiat–Shamir QROM and concrete constants need independent arguments.

NO production certification: terminal_covering_proved=false, knowledge_proved=false, pq128_demonstrated=false, production_ready=false.

## 6. Evidence

FRI_PCS_TERMINAL_COVERING.md, TERMINAL_COVERING_ALI_OOD.md, WIRED_RBR_KNOWLEDGE.md; executable checks fri-terminal-toy.mjs, fri-multiround-terminal-toy.mjs, pcs-batch-terminal-toy.mjs and their test files. All tests are finite mathematical consistency checks; none attests an adversarial quantum prover.
