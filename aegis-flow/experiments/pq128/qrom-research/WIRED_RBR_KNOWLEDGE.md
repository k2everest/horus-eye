# WiredAir: conditional knowledge lemma and RBR-PoK obligations

Date: 2026-11-23. PR #5. **Status: PARTIAL LEMMA ONLY; NO QROM/PQ128 PROOF.**

## Precise target

CMS (Chiesa–Manohar–Spooner, ePrint 2019/834, Definitions 8.3–8.5,
Theorem 8.6) separates **round-by-round soundness** from **round-by-round
knowledge**. The latter requires a polynomial-time extractor E and a
state function on *partial IOP transcripts*. At each verifier-challenge
boundary with state(x,tr)=0, if

    Pr_m[state(x,tr || m)=1] > kappa

then E(x,tr) must return a witness w satisfying the original relation.
Low probability of accepting false statements is not sufficient.

EUROCRYPT 2026 (Chiesa–Di–Hu–Zheng, ePrint 2025/2166) additionally
requires state-restoration and quantum vector-commitment extraction;
the IOR/SNRDX-to-Aegis mapping is still absent.

## Actual relation

For fixed trusted binary program P with G gates and W wires, let
g_j=(op_j,a_j,b_j,z_j), and c_i be the public number of references
to wire i across the 3G read slots. The R-row main trace contains
(a,b,z,wire). The preprocessed matrix pins every opcode, index and
multiplicity. Define R_bool(P,w) by: w_i in {0,1}; w_0=0,w_1=1;
AND: w_z=w_a*w_b; XOR: w_z=w_a+w_b-2*w_a*w_b;
NOT: w_z=1-w_a; EQUAL: w_a=w_b.

The full financial relation R_fin also needs a witness decoder for
the same six SHA-512 preimages, ownership, nullifiers, notes, Merkle
path, 53-bit amounts, fee and canonical statement. Its Boolean
circuit is not itself a knowledge proof.

## Proposition L_full — conditional deterministic extraction

Assume (A) the **complete private main-trace oracle** is available
and the independently authenticated P fixes the preprocessed columns;
(B) all gate, Boolean and pin equations hold on every row;
(C) the exact multiset of (wire_id, bit) read keys equals the
program-multiplicity wire-table multiset (NOT just equality of one
random fingerprint).

Then the algorithm w_i := trace[i].wire for i=0,...,W-1
returns a witness for R_bool(P,w) in O(R+G+W) operations.

**Proof.** For any wire index i the table contains c_i copies
of the unique pair (i,w_i). The read multiset contains exactly c_i
references to that index by construction of P. Exact multiset equality
therefore forces every gate operand/read of wire i to be w_i.
Thus all locally valid gate equations hold on one global vector w.
The Boolean constraints and the two pins establish the Boolean
relation R_bool. QED.

The new wired-full-oracle-extractor.mjs **checks those premises**,
parses the native V1/V2 program format, requires an independently
pinned SHA-512 program digest, and reconstructs the wire vector from
complete row data. The private object refuses JSON serialization and
redacts ordinary inspection. Its dispose operation is best-effort only.
It does not consume or verify a STARK receipt and cannot extract from
quantum commitments.

## Conditional fixed-oracle LogUp event

For two distinct fixed read/table multisets, uniformly independent
alpha,beta in E=GF(p^d), p=2013265921, and no multiplicity cancellation
modulo p, set T=3G+W. Random encoding of keys as wire_id*beta+bit
has at most T(T-1)/2 pair collision candidates. With distinct keys
the nonzero rational difference has numerator degree at most T-1
and up to T pole values. Hence the conservative bound:

    eps_fingerprint <= [T(T-1)/2 + 2T] / p^d

This is a single-step algebraic estimate **conditional on fixed
oracles**. The p3-security N*(W_msg+2)/|E| estimate may be tighter
if its separate conditions apply. Neither establishes RBR PoK or QROM.

## Outstanding theorem obligations — all hard blockers

1. Enumerate the **actual** p3-batch-stark 0.8.0 transcript, public
   preprocessing, LogUp challenges, private and salted commitments,
   ALI/DEEP, FRI rounds, Merkle openings and their chronological order.
2. Define an efficient state(x,tr) at **every verifier-challenge
   boundary**, for arbitrary adaptive malicious prover oracles, and
   prove that terminal doomed transcripts cannot be accepted.
3. Bound every transition from doomed to non-doomed, and construct
   E(x,tr) that outputs a witness whenever transition probability
   exceeds kappa. Incorporate the full FRI/ALI/DEEP/LogUp IOP.
4. Show a reduction from a **quantum prover/receipt** to coherently
   extractable committed oracles. An entire supplied private trace,
   Merkle collision resistance, or ordinary LogUp soundness alone
   do not give quantum vector-commitment extractability.
5. Prove refinement of extracted Boolean w into the **same**
   authenticated financial R_fin(x,w_fin), including input offsets,
   all six SHA-512 digests and the common witness. Confirm native
   proof/verify on full six-hash circuits.
6. Instantiate exact constants and budgets for CMS 2019 or EUROCRYPT
   2026, including global oracle queries and adaptive composition.
7. Prove privacy/ZK/unlinkability separately.

**Non-claims**:
round_by_round_knowledge_proved=false;
quantum_extractor_constructed=false;
pq128_demonstrated=false;
production_ready=false.
No consensus change or mainnet authorization.

## Reproduction

    node --test aegis-flow/experiments/pq128/qrom-research/*.test.mjs

Local synthetic tests exercise full extraction, adversarial gates,
rebinding, pins, partial receipts and statement hashes; CI also
tests against the real BitCircuit-generated program format.

References:
- https://eprint.iacr.org/2019/834
- https://eprint.iacr.org/2025/947
- https://eprint.iacr.org/2025/2166
