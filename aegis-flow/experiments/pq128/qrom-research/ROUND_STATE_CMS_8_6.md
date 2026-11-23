# PQ128 / Aegis: candidate state for *all* WiredAir + LogUp + HidingFRI rounds

2026-11-23. PR #5. **UNPROVED CANDIDATE / SECURITY HOLD**.
This is an actual transcript-boundary specification and an explicit proposed
mathematical predicate; it is NOT a theorem instance, witness extractor
from a succinct proof, or demonstration of QROM/PQ128.

## 1. Cite the theorem with the RIGHT definitions

Chiesa–Manohar–Spooner, ePrint 2019/834, full 2020 revision:
- Definition 8.3: a deterministic (possibly inefficient) Boolean
  state(x,tr) must have: (i) empty state 0; (ii) if state=0 before
  a prover message, no such prover message can make it 1; (iii)
  accepting complete transcripts have state=1.
- Definition 8.4: for **false statements** x, at any verifier challenge
  following a state-0 transcript, probability of entering state 1 <=
  epsilon.
- Definition 8.5: for **all** x, if the probability of a 0-to-1
  verifier transition exceeds kappa, there must be a **polynomial-time**
  extractor E(x,tr) recovering (x,w) in the original relation.
- Theorem 8.6: under the stated hypotheses and the specified BCS
  compiler, the QROM knowledge extraction probability is
  Omega(mu - t^2*kappa - t^3/2^lambda), plus exact-query overhead;
  Big-O constants are NOT instantiated for Plonky3. See also Sec. 8.6
  for the stronger variant required by another BCS hash chain.

Correctness of the source code cannot be substituted for universal
quantification over **arbitrary malicious** polynomial oracles.

## 2. Pinned upstream transcript (Plonky3 v0.8.0)

Primary implementation references, Git blob hashes:
- batch-stark/src/transcript.rs 707ec95b2f631f389ab403c50ca795b4013ef821
- fri/src/pcs_transcript.rs b9c3764a67c70cfac054fca58fe4fdf6630d0cac
- fri/src/transcript.rs 739224657bc48b5337225ed63baf7d5fc7c15df1

Run shape: one instance with deterministic publicly preprocessed
program, lookup present, hiding random polynomial present. The typed
events are explicitly enumerated by round-state.mjs:

1. degree bits, main trace commitment, public values, independently
   reconstructed preprocessed commitment;
2. lookup grind (0-bit still described), two verifier random
   challenges: lookup_alpha, lookup_beta;
3. permutation-trace commitment, lookup terminal(s), constraint
   composition challenge;
4. quotient commitment, hiding randomization commitment, OOD grind,
   out-of-domain verifier challenge zeta;
5. claimed PCS openings, optional batch grind, PCS combination
   challenge alpha;
6. each FRI round: codeword commitment, optional grind, independent
   verifier folding challenge beta_i;
7. final polynomial, optional query grind, verifier's joint vector
   of FRI query indices, Merkle/FRI openings, deterministic checks.

The number and arity of FRI rounds **must be reconstructed from the
verifier-owned FriShape and input heights**, NOT from an untrusted
prover schedule. The current JS schedule accepts an explicit arity
array *for structural research* and sets
fri_schedule_proven_from_verifier=false.

PCS opening claims are sent *after zeta, before batch alpha*, and
the vector of FRI query indices is sampled *after* the final
polynomial. Both are essential to the state transitions.

The literal 2019 paper's BCS hash chain is **not** assumed byte-identical
to Plonky3's hierarchical domain-separated Fiat-Shamir transcript.

The 2019 paper's Section 8.6 also analyzes an alternative hash-chain
compiler using **strong round-by-round security**, where a verifier
challenge may be the unknown symbol bottom and a state-invariance
condition is required. validateMaskedWiredTranscript supports those
positions structurally, but it does NOT prove the stronger state
condition for the concrete protocol.

## 3. Candidate mathematical bit-valued state S* (not yet a theorem)

For a partial public-coin IOP transcript tau, define:

- C_i(tau_pre): all pre-challenge oracle data that should already be
  fixed and committed when verifier challenge m_i is sampled;
- K_i(x,C_i): a predicate that is 1 exactly when a polynomial-time
  extractor from the *fixed, coherent oracles in C_i* yields a
  witness w satisfying R_fin(x,w);
- B_i(x,C_i,m_i): the **bad-challenge event** for this step, as
  determined solely from pre-challenge committed data and m_i
  (e.g. a LogUp fingerprint collision, an AIR quotient accidental
  root, a false FRI fold or a FRI query that misses every violation).

Propose the total mathematical predicate

    S*(x,tau) =
      1  if there exists an already-sampled VERIFIER challenge i
         with K_i(x,C_i(tau_pre)) OR B_i(x,C_i(tau_pre),m_i);
      0  otherwise.

After a challenge, the state is monotone. It cannot change from 0
to 1 on prover messages **provided** all C_i, K_i and B_i are
functions of the historical *pre-challenge* transcript, with no
retrospective reinterpretation of past oracle commitments.
Thus S*(x,empty)=0 and the prover-transition axiom is obtained
*conditionally from the definition*.

The other CMS axioms are exactly the open cryptographic lemmas:

(A) TERMINAL COVERING. Any transcript accepted by the actual
    verifier has either (i) a valid witness extractable from a
    pre-challenge committed oracle or (ii) a challenge in B_i at
    some step. This must include all AIR, LogUp, quotient, DEEP,
    FRI, Merkle opening and batching checks.

(B) BAD-CHALLENGE BOUNDS. For every fixed pre-challenge prefix
    without K_i, Pr_{m_i}[B_i] <= kappa_i, even against arbitrary
    malicious oracles and adaptively chosen later messages.

(C) EFFICIENT EXTRACTOR. If the verifier's step turns S* from 0
    to 1 with probability greater than kappa_i, the bad branch
    alone cannot explain the event, so K_i must hold. Define
    E(x,tau) by extracting the globally consistent full trace
    and decoding the *same* financial witness. This is only
    valid if oracle extraction itself is efficient and binding.

Without A, B and C, S* is a research DEFINITION, NOT an established
CMS state function satisfying the theorem.

Important: a state-1 transition caused solely by a small-probability
bad challenge need not produce a witness. CMS Def. 8.5 only demands
extraction when the TRANSITION PROBABILITY exceeds kappa.

## 4. Specific bad-event candidates and what is missing

| Verifier message | Fixed before sampling | Candidate B_i | Required proof |
|---|---|---|---|
| lookup_alpha/beta | main trace, preprocessed matrix | fingerprint/denominator bad | challenge independence, exact lookup table multiset |
| constraint_challenge | permutation codewords/terminal | invalid combination cancels | symbolic constraint degree and pre-commit chronology |
| zeta | quotient and randomization commitments | wrong rational identity vanishes | full ALI+DEEP evaluation, denominator and degree bounds |
| pcs_batch_alpha | claimed evaluations and PCS commitments | erroneous batch cancels | correct PCS reduction, bound including hiding |
| fri_fold_challenge_i | current folded codeword commitment | false low-degree claim folds | full round-by-round FRI state and list-decoding |
| fri_query_indices | final polynomial and all FRI roots | adversarial codeword errors unqueried | multiquery sampling and authenticated openings |

No numerical kappa_i is marked proven in this dossier. The
p3-security report gives an INTERACTIVE soundness estimate, not
these knowledge-extractor transition bounds.

## 5. Code and what it does NOT do

round-state.mjs returns an ordered immutable typed event schedule,
validates every prefix, and checks the elementary CMS axioms for a
single *synthetic supplied* finite sequence of state bits. It reports
cms_state_bit=null (unknown) on every real prefix rather than
manufacturing a binary answer.

abstract-cms-state.mjs implements the mathematical S* transition rule
on **explicitly supplied idealized K_i/B_i predicates** and returns
one candidate state bit for each prefix. Those predicates are research
inputs, not independently verified cryptographic evidence; the tool
never declares any CMS axiom universally proven.

It is deliberately impossible to set round_by_round_knowledge_proved,
theorem_8_6_applicable or production_ready to true through these
functions. Tests reject out-of-order messages and show a locally
accepting trace with all-zero state **violates** the terminal axiom.

The earlier wired-full-oracle-extractor.mjs verifies exact
lookup multiset equality and extracts Boolean wires **when all
private rows are already supplied**. It does not extract committed
oracles from an adversary nor turn a succinct receipt into a
financial witness. Likewise, the native full 6xSHA512 financial
witness proof is still awaiting conclusive end-to-end validation.

## 6. Next eliminatory work

1. Add a **Rust-side verifier-derived FriShape export** to bind
   every dynamic FRI arity, instance height, commitment shape and
   query vector to the executable Plonky3 version.
2. Define concrete C_i and B_i for LogUp and quotient/DEEP in
   mathematical terms, with full conditional denominators and
   degree bounds. Produce proofs of terminal covering rather
   than just positive fixture tests.
3. Lift the proof to the full FRI fold/query argument, including
   malleable openings and malicious committed oracles.
4. Prove quantum vector commitment extraction for the exact salted
   HidingFriPcs MMCS, then instantiate CMS 2019 or EUROCRYPT 2026,
   including constants and global oracle budget.
5. Prove the financial witness refinement (six SHA512) and
   zero-knowledge/unlinkability **independently**.

Commands:

    node --test aegis-flow/experiments/pq128/qrom-research/*.test.mjs
    node aegis-flow/experiments/pq128/qrom-research/round-state.mjs

Decision: HOLD_NO_GO; pq128_demonstrated=false; production_ready=false.
