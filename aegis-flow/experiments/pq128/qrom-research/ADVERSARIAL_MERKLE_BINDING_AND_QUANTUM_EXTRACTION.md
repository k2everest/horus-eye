# PQ128 — adversarial MMCS position binding vs quantum oracle extraction

Date: 2026-11-24. Audit PR #6 on PR #5, Plonky3 0.8.0.
**PROVED:** a classical *two-openings-to-collision* implication in the
explicit salted, binary, capped-Merkle subgame, conditional on canonical
injective encoding and verifier-owned fixed shape.
**NOT PROVED:** general quantum collapse binding, post-challenge
extractability, coherent *entire* oracle extraction, WiredAir RBR
knowledge soundness, QROM BCS equivalence, or 128-bit PQ security.

## 1. Native objects and ordering

Current `v4/plonky3/src/main.rs` fixes:
- `F=BabyBear`, `E=BinomialExtensionField<F,8>` (about 247.255 field bits);
- `Mmcs=MerkleTreeHidingMmcs<F,u64,...,StdRng,2,8,16>`;
- `cap_height=3`, eight cap hashes;
- leaf hashing: SHA-512 with byte domain label
  `AEGIS_V4_P3_LEAF_SHA512_V2\0`;
- internal node compression: SHA-512 with byte label
  `AEGIS_V4_P3_NODE_SHA512_V2\0`;
- canonical 512-bit digest as eight LE `u64` words;
- SHA-512 challenger has a **distinct** transcript domain label;
- `SALT_ELEMS=16` fresh BabyBear salt columns added on each private
  committed row. Public preprocessing deterministically salted by a
  verifier-controlled program digest, never private salt.

The exact pinned `p3-merkle-tree::hiding_mmcs` verifier checks
**unsalted widths** first, reattaches salts to opened rows, increases
each verifier-owned matrix width by 16, then calls the inner MMCS
`verify_batch`/`verify_multi_batch`. For shorter matrices, the
effective row index is the global row index right shifted by its
height difference. The cap root index is fixed by the global path
and `cap_height=3`. The leaf hasher serializes field elements
through `F::into_u64_stream`; any formal proof must show this encoding
injective for the verifier-owned, fixed row dimensions and unambiguous
across matrix boundaries/height injections.

This is the **actual source contract** to prove; treating a SHA-512
root as a magically extractable polynomial is not justified.

## 2. Exact two-openings-to-collision lemma

Fix one commitment cap c, verifier-owned matrix dimensions, one global
query index j, a fixed binary Merkle structure, leaf serialization,
one leaf-hash function H_leaf and one node-compression H_node.
Suppose two *classical*, fully accepted authentication paths
`(row_A,salt_A,auth_A)` and `(row_B,salt_B,auth_B)`
have differing authenticated salted leaf encodings at j.

**Lemma.** One can deterministically recover two different inputs to
the same leaf or node hash function producing the same 512-bit digest,
with time linear in the opened leaf length plus the Merkle path length.

**Proof.** Evaluate both authenticated paths bottom-up. If the distinct
leaf encodings produce equal leaf digests, they are an H_leaf collision.
Otherwise the leaf digests differ. Both paths terminate at the same
cap component, because the cap and global index were fixed and both
were accepted. Take the first level on the paths where distinct child
digest inputs produce equal parent digests. That node gives two
distinct serialized ordered-child vectors with the same H_node output.
In either case we have a concrete collision. QED.

For *different unsalted opened row values*, the appended salt cannot
erase a difference when the row width and encoding are fixed and
injective; hence the lemma applies. A verifier allowing ambiguous
dimensions or non-injective serialization is outside the lemma and
must fail closed.

For `cap_height=3`, the argument stops at the appropriate of
eight cap components rather than a single root. For mixed-height
MMCS, the same proof needs a verified height-injection and
leaf/inner-level hashing argument for all supported shapes.
The standalone executable `merkle-position-binding.mjs` verifies
the simple binary capped-leaf game. The native Rust negative tests
exercise the actual salted multi-height MMCS. Neither constitutes
a proof for arbitrary quantum adversaries.

## 2a. Explicit mixed-height injection in the pinned verifier

The source `p3-merkle-tree 0.8.0 merkle-tree/src/mmcs/mod.rs`
`walk_pruned_frontier` has a stronger structure than an ordinary
one-height Merkle tree. The *verifier-owned* authenticated node is
built by a directed acyclic graph of hashes:

1. At the maximal matrix height, the leaf is `H_leaf(concat(rows))`,
   with the order of matrices fixed by dimensions.
2. Each parent is `H_node(ordered-child-digests)` under the
   verifier-derived binary arity schedule.
3. When a shorter-height matrix joins a folded level, the verifier
   hashes the **new shorter-height rows** with `H_leaf` and then
   computes `H_node(previous-parent-digest, injected-height-digest)`.
4. `verify_multi_batch` rejects conflicting rows for duplicate or
   merged queries, including `InconsistentGroupOpening` at
   the shorter-height injection. Salts are appended *before* each
   corresponding hash and have known width 16.

**Conditional mixed-height extension.** Fix the entire DAG topology,
matrix order, dimensions, salts' expected width, query index, cap
position and injective serialization. In any pair of distinct accepted
full openings where a row/salt input used by the fixed authentication
DAG differs, evaluate the two DAGs bottom-up. If the root-cap digest
agrees, at least one node on a path from the differing input to the
agreed cap has two different serialized inputs but the same output.
Since each DAG gate is one of the fixed `H_leaf` or `H_node`, this
gate is a hash collision. The proof is the same first-merge argument
as the binary path lemma; branching/injection merely inserts more
hash gates, and fixed topology avoids ambiguity about which gates
were computed.

This is a **conditional classical circuit reduction** and does not
state that a single malicious post-challenge *quantum* opening can be
coherently measured or that a globally consistent vector can be
extracted. The native mixed-height regression is a check of the
specific deployed verifier behavior, not a symbolic verification of
every height/shape combination.

## 3. Why this does not yet eliminate post-challenge oracle changes

The above lemma starts with **two classical successful openings**.
A quantum adversary need not output such a pair. It may keep quantum
superpositions, and its measured post-challenge response to one index
does not automatically give a simultaneously extractable globally
coherent vector. Computational position binding by itself therefore
does not imply the *collapse-binding* / *online extraction* property
needed by every proposed quantum knowledge argument.

This distinction is substantive, not an unmeasured constant:
Dall'Agnol & Spooner, *On the Necessity of Collapsing for Post-Quantum
and Quantum Commitments*, TQC 2023,
https://doi.org/10.4230/LIPIcs.TQC.2023.2 ,
show that collapse binding/collapsing can be necessary for PQ lifting
of commit-and-open protocols. Don–Fehr–Majenz–Schaffner,
*Efficient NIZKs and signatures from commit-and-open protocols in
the QROM*, CRYPTO 2022,
https://ir.cwi.nl/pub/32496/ , develop *online extractability* for
Merkle-based commitments in an applicable framework, but this
does **not** automatically instantiate WiredAir/LogUp/HidingFriPcs
with 13 rounds and the actual transcript/quantum budget.

Chiesa–Manohar–Spooner, ePrint 2019/834,
https://eprint.iacr.org/2019/834 , require the underlying IOP
round-by-round property and a valid compiler reduction; it cannot
be inferred from a leaf collision lemma.

A recent possible alternate theorem is Bootle–Chiesa–Marty,
*Round-by-Round Knowledge Soundness for Linear-Time IOPs*
(2026-10-26), https://infoscience.epfl.ch/entities/publication/a07668f8-bc32-4ea8-9038-860eaefa69e3 .
It proves strong soundness for specific IOP constructions using
error-correcting codes. A formal transformation or mapping to this
**exact** FRI+LogUp verifier is required; cite it as a candidate,
not as an achieved theorem.

## 4. Necessary field-capacity failure under the conservative CMS route

The current actual E has log2(|E|) = 8*log2(2013265921) =
about 247.255 bits. The QROM screening route conservatively uses
`O(Q^2 * epsilon_RBR + Q^3/2^512)`. A Q=2^64 adversary and a
target 2^-128 output need a **256-bit interactive soundness
exponent before constants or union margins** for the first term:
`128 + 2*64 = 256`.

A generic bad event with `1/|E|` soundness accounting has at most
247.255 bits in that budget and cannot meet the 256-bit requirement
by this proof route. The current audit's 336-bit RBR target
(including larger constants/reserves) is stricter still.
**This is an obstruction to proving PQ128 using these existing bounds,
not a lower-bound attack or a proof that no alternative scheme works.**

A *hypothetical* BabyBear degree-16 extension has about 494.510
field bits and clears the crude capacity screen; it is NOT
implemented or validated in the current native PCS. Before choosing
it, prove an irreducible polynomial, arithmetic, sound uniform field
sampling, serialization, FFT/PCS and LogUp compatibility for the
real protocol. Merely changing the Rust type alias to 16 is unsafe.

The generic quantum random-oracle collision-search heuristic for a
512-bit output gives a separate rough term `O(Q^3/2^512)`, or
320-bit exponent at Q=2^64 *before unspecified constants*.
It assumes a random oracle; no mathematical claim that real SHA-512
is a random oracle or collapsing hash follows from the digest length.
The Merkle term alone never certifies the full SNARK security.

## 5. Evidence in the PR

- `merkle-position-binding.mjs` and `.test.mjs`: exact local
  collision witness for any pair of different accepted binary
  Merkle-cap openings; positive SHA512 test, negative salt/index
  tests, and exhaustive weak-hash adversarial collision cases.
- `wired_r1cs.rs::native_salted_mmcs_position_binding_rejects_row_and_salt_equivocation`:
  original Plonky3 `Mmcs` verification over **two different matrix
  heights**, with verifier-owned row widths; mutated tall/short rows,
  wrong dimensions and different global index must be rejected.
- `quantum-binding-gate.mjs` plus tests: a fail-closed, hardcoded
  screen of the actual *native* 8-degree field and 512-bit hash,
  with a degree-16 *candidate* evaluated only hypothetically.
  The native field cannot be silently re-labeled as 16 by JSON.

Tests check consistency and reject selected malformed openings; they
do not establish SHA-512 collision resistance or quantum collapsing.

## 6. Remaining explicit proof obligations

1. Map full `MerkleTreeHidingMmcs` mixed-height/cap/merkle-multiproof
   verifier with verified shape + injective serialized rows to the
   classical collision lemma, without assuming a globally available
   oracle from the root.
2. Instantiate or prove a **quantum** collapsing/online extractor for
   the actual salted MMCS and its interactive challenge chronology.
3. Combine the extracted oracles with an actual FRI *proximity*
   theorem, LogUp/ALI/DEEP and batch challenge events for **all
   malicious provers**, not merely honest/native rejection tests.
4. Prove a polynomial-time extractor to one valid financial witness
   and the original six-SHA512 relation.
5. Select and implement a field with enough effective challenge
   capacity; instantiate the exact CMS/BCS QROM theorem and constants,
   then independently audit the complete currency.

**Security verdict: HOLD_NO_GO.** Position binding under collision
resistance is a meaningful step; the jump to quantum oracle
extraction and PQ128 remains an open obligation.
