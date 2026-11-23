# FRI/PCS terminal covering: exact-code lemma, adversarial openings, hiding

Date: 2026-11-23. Target: PR #5 Plonky3 0.8.0 WiredAir/LogUp/HidingFriPcs.
**STATUS: A POINTWISE CONDITIONAL LEMMA IS PROVED HERE. THE COMPLETE PLONKY3/CMS RBR KNOWLEDGE AND QROM/PQ128 THEOREMS ARE NOT PROVED.**

## 1. Scope and chronological binding assumptions

Consider the full IOP, NOT Fiat–Shamir as a priori independent challenges. Each FRI codeword f_i is represented by a globally fixed oracle, committed before its folding challenge beta_i. A consistent authentication/opening oracle must answer all positions from that one f_i. The next f_(i+1) may depend on beta_i but is fixed before beta_(i+1), and is fixed before the terminal query draw. The final polynomial is sent before queries. Any binding/extraction failure is a separately named bad event B_bind, NOT silently dismissed.

Let D_i be a verifier-owned multiplicative evaluation domain of size M_i, invariant under x -> -x, with pairwise distinct nonzero squares per pair. Let C_i=RS(D_i,d_i) be the evaluation code of polynomials of degree < d_i, with d_i even, d_(i+1)=d_i/2, and M_(i+1)=M_i/2. The actual Plonky3 schedule, domain injections, multiple heights, blowup, terminal degree, and heterogeneous fold arities must be separately mapped; the current toy implementation handles ONE binary fold only.

For f_i on D_i, the true fold F_beta(f_i) on squared domain D_(i+1) is:
  F_beta(f_i)(x^2) = (f_i(x)+f_i(-x))/2 + beta*(f_i(x)-f_i(-x))/(2*x).
This is well-defined independently of the sign chosen for x.

## 2. Exact-code exceptional fold lemma

**Lemma 1.** If f_i is not in C_i, there exists at most one beta in E such that F_beta(f_i) belongs to C_(i+1).

**Proof.** For distinct beta and beta', assume both folds belong to C_(i+1). Their difference divided by beta-beta' equals the odd component O(y)=(f(x)-f(-x))/(2x) and belongs to C_(i+1), by linearity. Subtracting beta*O from the first fold shows the even component E(y)=(f(x)+f(-x))/2 belongs to C_(i+1). Therefore some polynomials E,O of degree < d_i/2 realize f(x)=E(x^2)+x O(x^2) on D_i, with degree < d_i. Contradiction. QED.

This gives Pr_beta[B_fold_i] <= 1/|E| for independent uniform full-field beta. This is NOT a FRI soundness bound for words close to the code: a word can have one corrupted coordinate, causing query detection to be poor.

## 3. Exact-code pointwise terminal covering with malicious openings

Define B_fold_i at the verifier challenge beta_i iff f_i is NOT in C_i but the TRUE fold F_beta_i(f_i) IS in C_(i+1). This event depends only on the fixed pre-beta_i oracle and beta_i.

Define mismatch set Delta_i = { positions j in D_(i+1): f_(i+1)(j) != F_beta_i(f_i)(j) }. It is determined after commitment of f_(i+1), before FRI query challenges. Let B_query be the event that the query paths all avoid every discrepancy in the committed chain, including mismatches between the claimed final polynomial and its final codeword, and ALL PCS batched opening disagreements. For this pointwise lemma, map each discrepancy to the set of initial query indices whose authenticated paths check it. Define B_query only when this union is NONEMPTY. All authentications are assumed binding; otherwise B_bind. Query sampling must occur AFTER the full folded oracle chain is fixed.

**Proposition 2.** If the verifier accepts all authenticated FRI folding checks and the terminal polynomial comparison, then either f_0 is in C_0, or B_bind, or some B_fold_i, or B_query.

**Proof.** Outside B_bind use one fixed codeword per commitment. The final supplied polynomial is in its declared low-degree code by direct coefficient checking (assuming the verifier performs that check). If the initial word is not in C_0, find the first transition i where f_i is not in C_i but f_(i+1) is in C_(i+1). If the true fold is in C_(i+1), B_fold_i occurred. Otherwise f_(i+1) differs from the true fold at one or more coordinates, so Delta_i is nonempty. Since the verifier accepted the authenticated folding equality at all sampled paths, every query missed Delta_i, hence B_query. A terminal-word mismatch is covered identically by the final-polynomial comparison. QED.

For q independent uniform initial query indices and a fixed union of bad initial indices of size s>0, Pr[B_query]=(1-s/M_0)^q. For q distinct indices sampled without replacement, the exact probability is binom(M_0-s,q)/binom(M_0,q), with zero numerator when q>M_0-s. The actual Plonky3 sampler and cross-round query projection must be inspected before using either formula. The trivial s>=1 bound is generally nowhere near PQ128. To obtain useful soundness, replace this exact-membership argument with a full proximity/list-decoding FRI lemma, including challenge-dependent low-degree tests and height injections.

## 4. PCS batching and claimed openings

Let authenticated PCS oracle openings be fixed as globally coherent field values. For k fixed discrepancies e_0(j),...,e_(k-1)(j) at any fixed position j, and an independently uniform alpha sampled AFTER claims, a batched discrepancy sum_j(alpha)=sum_r alpha^r e_r(j) can vanish for at most k-1 alphas unless all e_r(j)=0. If any discrepancy exists choose the FIRST discrepant position j* canonically BEFORE alpha. Define B_batch(alpha) by sum_(j*)(alpha)=0. Then Pr[B_batch] <= (k-1)/|E|. Outside B_batch, the batched vector has a nonzero disagreement that must be found by authenticated queries, or B_query occurs.

This is a conditional **linear combination lemma**. The actual p3-fri two-adic PCS combines quotient/opening polynomials with domain-specific denominators, heights, and possibly other coefficients. No claim is made that its exact batch polynomial has this simple monomial layout until the Rust verifier is symbolically mapped. In particular, a coefficient depending on alpha or a claim arriving after alpha invalidates this bound.

## 5. HidingFriPcs obligations (essential distinctions)

The hiding layer doubles the effective trace/interpolation height: each main, preprocessed, permutation, random-codeword, and randomization column has honest degree < 2N. A malicious prover must still be bound/extracted to a globally coherent low-degree oracle; salting a Merkle commitment does NOT prove that property, and neither SHA-512 transcript use nor successful native smoke tests imply quantum extraction.

The quotient has C=2^(L+1) chunks in the pinned hiding profile. Each chunk of an honest prover has degree < 2N. For arbitrary chunks independently satisfying this cap, the reconstructed polynomial generally has degree < (C+1)N. The better honest bound < CN follows from correlated masks and is NOT granted to arbitrary adversarial chunks. See HIDING_COMMITTED_DEGREES.md and its counterexample. The general degree cap, not the honest one, must feed ALI/OOD root accounting whenever malicious opening oracles are considered.

Hiding randomization and salted MMCS commitments enlarge the set of commitments/openings that must be authenticated. The deterministic public preprocessing commitment is verifier-reconstructed, but this is not a proof of binding of private polynomial commitments. No privacy claim follows from these degree bounds.

## 6. Conditional composition and open hypotheses

Given:
(1) one coherent globally committed oracle per FRI/PCS commitment, quantum extractable and binding for arbitrary malicious provers;
(2) a verifier-owned, *byte-level* replay of the actual 0.8.0 transcript, all FRI shapes, offsets, heights, arities, quotient cosets and query projections;
(3) the actual FRI proximity/list-decoding bound for all stages and challenge distributions;
(4) the actual PCS batch/opening reduction bound including hidden chunks and hashing/authentication;
(5) the LogUp and ALI/OOD bad-event bounds on those same extracted oracles;
(6) efficient financial witness refinement and proof that all bad events are measurable at the respective CMS challenge boundaries;

the acceptance of the full protocol implies a financially extractable witness or a bad event at some verifier challenge. This is the remaining CONDITIONAL terminal covering route for S*.

**NOT PROVED:** conditions (1)-(6) for the actual protocol, CMS Definition 8.5 efficient knowledge extraction, per-round kappa for arbitrary adaptive malicious oracles, the QROM BCS compiler equivalence, or PQ128. A synthetic finite-field test below checks a single binary-fold instance and is not a cryptographic proof.

## 7. Quantitative red flag

Even with Lemma 1's at-most-one exceptional challenge, the elementary query-miss bound for a single error is (1-1/M)^q. For M=65536, q=320, it remains about 0.995. This demonstrates precisely WHY replacing proximity FRI with the exact-code lemma cannot certify even ordinary soundness, much less 128-bit quantum security.

Decision: conditional FRI/PCS pointwise terminal coverage established; complete real-WiredAir terminal covering and PQ128 remain HOLD_NO_GO.
