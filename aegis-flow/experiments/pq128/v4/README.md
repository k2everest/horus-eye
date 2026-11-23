# Aegis V4: 512-bit outer binding + replaceable transparent STARK verifier
Date: 2026-11-21

**Candidate only. NOT a deployed SDK replacement, NOT a private STARK proof
and NOT PQ128-qualified.** This directory is excluded from network admission.

## Concrete progress against the SHA-256 obstruction

The currently accepted RISC Zero 3.1.0 Composite proof uses SHA-256 in
receipt/program/state contexts and Poseidon2 with an approximately 247-bit
output-cardinality ceiling. Hashing the old receipt with SHA-512 *afterwards*
cannot lift the internal soundness/binding theorem.

This candidate instead defines a NEW protocol identity and FULL-WIDTH
SHA-512 (64 bytes) for these **outer** values: authenticated program identity,
initial/final state, each segment's state transition, proof-bytes commitment,
public statement/journal and a composed root. Every object is length framed
and domain-separated; an old 32-byte image ID fails to parse. The public
financial relation uses the existing *experimental* SHA-512 private note model.
The candidate JS modules are:

- `hash512.mjs`: bounded binary encoding, SHA-512 external commitments and a 512-bit program image digest from trusted build bytes;
- `composite.mjs`: accepts *only* claims returned by a separately verified
  segment adapter, enforces exact program, statement, state continuity and
  journal equality, and constructs the 512-bit composite root;
- `outer-screen.mjs`: independent exact BigInt calculations for an **ideal
  binary quantum random oracle** with unknown theorem inputs retained as
  unknown; it is not an SDK security calculator.

The candidate program identity is a SHA-512 digest of the independently trusted
program image bytes, not a supplied label. Reproducible source-to-binary
attestation remains a separate unsatisfied obligation.

## New native verification laboratory — implementation, not qualification

The `plonky3/` crate now contains an **actual Plonky3 0.8.0 prove/verify
command**, using a 64-byte domain-separated SHA-512 hasher for the
Merkle leaf, Merkle node and Fiat–Shamir challenger. A small AIR
constrains nine 16-bit amounts (four inputs, four outputs and one fee)
with a bit decomposition and integer conservation, while an independently
specified public claim is bound through a SHA-512 digest split into 32
field elements. This is a **bounded-balance smoke AIR**. It has neither
owner/secret/nullifier/Merkle SHA-512 financial constraints nor ZK
privacy, and must NEVER authorize a financial transfer.

`plonky3-backend.mjs` passes a proof bundle to the real native verifier
and accepts only its response after verifying a locally trusted binary
against two SHA-512-derived identifiers. No fallback or mock is accepted
by that adapter. The existing mock tests exercise only the STRUCTURAL
`composite.mjs` contract. A dedicated CI job constructs a native
Plonky3 prover/verifier, runs the Rust tests and requires creation of
a real proof with positive verification and adversarial rejection.
**A successful CI build and fresh proof have not yet been confirmed.**

This native laboratory does NOT satisfy the financial witness relation.
It is intentionally kept outside the payment verifier and consensus
admission paths. Every V4 response includes
`aegis_target_met:false` and `production_ready:false`.
The Composite structural interface also always sets
`cryptographic_soundness_demonstrated:false`.

Build and test with Rust and Node.js (requires downloading and auditing
the new Rust dependencies):

```sh
cargo generate-lockfile --manifest-path aegis-flow/experiments/pq128/v4/plonky3/Cargo.toml
cargo build --locked --release --manifest-path aegis-flow/experiments/pq128/v4/plonky3/Cargo.toml
cargo test --locked --release --manifest-path aegis-flow/experiments/pq128/v4/plonky3/Cargo.toml
AEGIS_V4_P3_INTEGRATION=1 \
 AEGIS_V4_P3_BINARY="$PWD/aegis-flow/experiments/pq128/v4/plonky3/target/release/aegis-v4-plonky3-lab" \
 node --test aegis-flow/experiments/pq128/v4/plonky3.integration.test.mjs
```

Lock generation currently occurs in CI; reproducible third-party
qualification still requires committing/reviewing the resolved Cargo.lock,
pinning the toolchain and independent source/binary review.

## New SDK choice: Plonky3 research candidate, not an automatic fix

Compare a pinned and independently reviewed build of Plonky3 with p3-security,
p3-fri, a typed Fiat–Shamir transcript, and an application-specific AIR
implementing the SAME secret/owner/note/value/fee/merkle relation as the Aegis
SHA-512 guest. Plonky3 is a toolkit, NOT a drop-in RISC-V zkVM replacement.
Existing examples and common Keccak-256 output modes DO NOT solve the
256-bit outer or inner binding issue. A separate *full-width* hash/transcript
and commitment integration, compatible with the selected PCS, is necessary.

`p3-security` assembles theoretical soundness terms for an instantiated
protocol. Its values are not automatically quantum QROM bounds. The exact
parameters, field/extension, constraints, low-degree test, state-restoration
hypotheses, transcript codec, hashing and per-instance adaptive composition
must be independently mapped into an applicable quantum theorem. Pin the
source commit and toolchain only after constructing a working prover/verifier;
do not invent a source/binary attestation for an absent toolchain.

References:
- Plonky3 architecture: https://github.com/Plonky3/Plonky3/blob/main/docs/architecture.md
- p3-security documentation: https://docs.rs/p3-security/latest/p3_security/
- 2026 CFRG Fiat–Shamir draft (typed statement/session/encoding):
  https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-fiat-shamir-04
- CMS19 quantum Fiat–Shamir: https://eprint.iacr.org/2019/834
- BGKTTZ23 STARK/FRI QROM: https://eprint.iacr.org/2023/1071

## Exact conditional budget: what 512-bit output does and does not buy

For global `Q=2^128` ideal quantum-oracle queries, `H=2^32` attempted
receipts and at most `m=64` segments, assume there is a separately proved,
uniform adaptive reduction mapping any **outer binding** failure to one of
`K=H*(2m+4)` candidate collision pairs. These K events are not equivalent
to all internal STARK/Merkle hash calls. Under the ideal binary QROM
collision database lemma, the conditional union bound is

```text
Pr[outer collision in selected K pairs]
  <= min(1, K * (12*(Q+2)^3 + 4) / 2^lambda).
```

The current V4 outer frame has `lambda=512`. The bound is strictly below
1/2 in this model, avoiding the saturated 256-bit ideal-collision upper
bound. With the SAME huge global query budget, obtaining a residual failure
probability at most `2^-128` in this specific union allocation would require
at least **555 ideal binary-output bits**, not 512. A hypothetical 576-bit
random oracle passes *this arithmetic only*. Widening a real XOF output
does not, by itself, prove 576 bits of independent binding or preserve the
quantum ideal-oracle theorem.

**These event counts are assumptions, not limits enforced by consensus.**
Off-chain failed/unpublished attempts are not counted by a ledger.
No applicable reduction from accepting a false whole Composite receipt to
this collision event has been delivered. In particular the following remain
unknown for a NEW Plonky3 prover:

```text
epsilon_RBR_IOP          = unknown
epsilon_Fiat_Shamir_QROM = unknown
epsilon_inner_commitment = unknown
epsilon_adaptive_comp    = unknown
epsilon_AEGIS_whole      = unknown
```

The existing RISC Zero verifier still has 50 FRI queries and its internal
hashes. The new SHA-512 wrapper **cannot be placed around it and then called
PQ128**. The proof backend itself must be replaced and measured.

## Hard release and migration conditions

1. Implement and pin a real Plonky3 or equivalent verifier producing
   **authenticated**, source-derived segment claims and a real proof.
   No fixture/mock verifier is eligible for production.
2. Replace/check all inner proof commitments, challenge generation, image IDs,
   state digests and transaction encodings; prove the claimed 512-bit binding
   security in the actual primitive model.
3. Reimplement the financial AIR and differential-test all cases against the
   existing SHA-512 Rust guest. Validate one common private witness across the
   entire composed proof. Preserve strict journal comparison.
4. Obtain a proof of RBR/state-restoration soundness and a QROM compiler
   reduction for the **actual** protocol; calculate finite losses per
   application/lifetime. Knowledge and ZK each need separate arguments.
5. Pin proof IDs, verifier binary checksum and reproducible build,
   obtain independent cryptographic review, add native proof CI tests,
   and design a versioned, supply-preserving migration/reorg rule.
6. Only then consider a separate consensus activation. Until that point,
   no existing notes, rewards or transfers use this V4 candidate.

Reproduce local **structural** tests:
```sh
node --test aegis-flow/experiments/pq128/v4/*.test.mjs
```


## M1: native hiding FRI with degree-8 challenges (22 November 2026)

This branch now replaces the `new_benchmark` non-hiding configuration in the
isolated Plonky3 research binary with an explicit candidate profile:
- BabyBear, irreducible binomial extension degree **8**; challenge-field
  cardinality has a conservative floor of **247 bits**;
- `HidingFriPcs`, **both** input and challenge Merkle MMCSs salted with
  independently OS-seeded cryptographic RNGs, **16 salt field elements**;
- 8 independent random codewords (at least the extension dimension);
  a 4096-row trace with budget reservation for 320 queries and up to
  8 opened points, enforcing `4096 >= 2*(320 + 8*8)`;
- explicit FRI blowup 8 (log-blowup 3), binary folding, 320 queries,
  no unearned grinding bits. All verifier parameters are constants in
  the trusted Rust binary; proof data cannot override them;
- 512-bit SHA-512 Merkle digests, with domain-separated leaf, node,
  transcript, program image and public claims;
- separate proof scheme `AEGIS_V4_P3_HIDING_EXT8_LAB_V1` and a
  bounded proof envelope. Earlier benchmark proofs cannot be interpreted
  as this suite.

`security-report` uses the exact AIR shape and the
`p3-security` 0.8.0 `ProvenSecurity` *interactive round-by-round*
calculator. The input hash collision resistance (**170 bits**) is a
conservative **ideal-function hypothesis**, not a quantum cryptanalysis
of concrete SHA-512. The research gate compares the measured RBR result
with a separately labelled strict residual target of `2^-128`
distributed across `H=2^32` attempted receipts, `64` segments and
four first-bad-event categories: **168 bits per segment** in this
conditional allocation. A passing arithmetic screen does not prove that
this allocation applies to quantum Fiat–Shamir or actual Composite proofs.

**Outstanding mandatory dependencies:** complete financial AIR with
SHA-512 note/ownership/nullifier/inclusion and values; a proof of common
witness and private transcript simulation; quantum QROM compiler
applicable to the exact implementation; event reduction from fake entire
receipts, source/binary reproducibility, independent review and a
versioned migration. `security-report` keeps
`aegis_target_met:false` and `production_ready:false` regardless of
the RBR value.

Local evaluation:

```sh
cargo run --release --manifest-path aegis-flow/experiments/pq128/v4/plonky3/Cargo.toml -- security-report > aegis-v4-p3-rbr.json
node aegis-flow/experiments/pq128/v4/rbr-gate.mjs aegis-v4-p3-rbr.json > aegis-v4-p3-m1-screen.json
```

The native integration CI is the decisive compiler/proof validation. It
must report a genuine successful build and verified proof; an in-flight or
failed job is not a success.


## M3: SHA-512 arithmetic gates within the native Plonky3 AIR

An initial **native, real Plonky3 AIR** is now added under
`plonky3/src/sha512_gates.rs`. It constrains Boolean inputs,
`AND`, `XOR`, the SHA-512 choice operation and a full-adder
`sum,carry` output with explicit polynomial equalities over BabyBear.
The module has a real hiding STARK `prove/verify` test, and an
adversarial test which mutates one addend result and requires the
prover/verifier to reject it.

**Incomplete SHA-512:** this is one combinational Boolean gate per row,
not the 80-round SHA-512 compression algorithm. It does not yet constrain
the message schedule, rotation, state chaining, padding, domain-separated
lengths, note commitment, owner secret, nullifier, or the Merkle path.
Rows are independent and no SHA-512 digest is yet constrained against
the 53-bit note values. The completed JS `constraints/sha512.mjs`
and `constraints/note-hashes.mjs` are symbolic reference gadgets,
not an AIR backend.

The native `financial.rs` already implements 53-bit limb arithmetic,
positive active notes, 4-in/4-out and public fee conservation. The
missing requirement is to create one **common** Plonky3 AIR witness
tying that arithmetic to private SHA-512 preimages and Merkle openings
and to the trusted public statement. Until then,
`financial_relation_proved=false` and `production_ready=false`
remain mandatory. No user or consensus path imports these modules.

M3 proof acceptance criterion: a valid amount-balanced fake commitment
must be rejected **by the native verifier**, not merely by the
prover-side Rust/JS preflight. Also reject any altered spend secret,
nullifier, Merkle sibling, anchor, recipient output or public fee.
End-to-end PQ128 additionally requires the prior M1/QROM, knowledge
and privacy proofs.


## 1x1 single-leaf transfer vertical slice

The current one-in/one-out path is separated into **two trust boundaries**:

1. **Native Plonky3 subset:** `prove-single-transfer` and
   `verify-single-transfer` use the existing 53-bit amount-conservation
   `FinancialAmountAir` with one input, one output and a public fee.
   For an anchor consisting of **exactly one leaf**, the native verifier
   independently recomputes the public Merkle leaf/root hash using the
   input commitment and network identifier. This new verifier-side
   public check does not require a Merkle proof or disclose private note
   data. A unit test constructs a *genuine balanced Plonky3 proof*
   against a fake root; the generic balance verifier accepts it but the
   new strict one-leaf verifier rejects it.
2. **Full SHA-512 Boolean relation (not yet a Plonky3 proof):**
   `single-transfer-circuit.mjs` explicitly selects exactly one input,
   one output and one leaf, independently pins the public SHA-512
   financial-statement digest, and compiles the already existing
   `constraints/transfer.mjs` into a deterministic program. The
   returned manifest binds the *public program* with
   `bitCircuitDigest512`, gate/wire counts and all six required SHA-512
   relations (owner, input note, nullifier, leaf, tree root, output note).
   The one private assignment checks ownership, positive 53-bit note
   values, note commitments, nullifier, exact Merkle root and
   `sum(input) == sum(output)+fee`, with adversarial tests.
   A local Boolean checker is **not** a post-quantum STARK proof.

The native result intentionally exposes
`valid_balance` and `public_single_leaf_membership_verified` but
**always returns** `private_note_commitment_proved:false`,
`private_ownership_proved:false`, `private_nullifier_proved:false`,
`financial_relation_proved:false`, `production_ready:false` and
`aegis_target_met:false`.

**Implemented bridge, still unqualified:** the native batch-STARK LogUp
R1CS adapter now translates the complete canonical Boolean SHA-512 program
into a hiding Plonky3 AIR/IOP, including cross-row wire-index consistency.
Its native smoke proof and full six-hash proof must still pass end-to-end
CI before treating this translation as validated. Prove the
result under a verifier-rebuilt and independently authenticated program.
Without lookup/wiring constraints, proving individual SHA-512 gates
would be unsound: a prover can substitute arbitrary values between
gate rows. An R1CS/QAP host check or an additional unlinked proof is
not a substitute for a common cryptographically bound witness.
The one-leaf public membership shortcut does not generalize to hidden
multi-leaf Merkle inclusion.

Reproducible native integration:

```sh
cargo test --release --manifest-path aegis-flow/experiments/pq128/v4/plonky3/Cargo.toml
AEGIS_V4_P3_INTEGRATION=1 AEGIS_V4_P3_BINARY="$PWD/aegis-flow/experiments/pq128/v4/plonky3/target/release/aegis-v4-plonky3-lab" \
  node --test aegis-flow/experiments/pq128/v4/single-transfer.integration.test.mjs
node --test aegis-flow/experiments/pq128/v4/single-transfer-circuit.test.mjs
```


## Native Plonky3 LogUp bridge for the full one-in/one-out R1CS

The V4 branch now includes a **native Boolean R1CS Plonky3 batch-STARK
bridge** at `plonky3/src/wired_r1cs.rs`. This is distinct from the
older `sha512_gates.rs` toy and the `financial.rs` balance-only AIR:

- A fixed, independently rebuilt *public* Boolean program defines all
  AND/XOR/NOT/EQUAL instructions and every wire index. The canonical
  encoding is `AEGIS_V4_BOOLEAN_PROGRAM_V1\\0`, 32-bit big-endian
  wire/gate counts, then exactly 13 bytes per gate: opcode and three
  32-bit wire indices. The native decoder checks bounds, unique gate
  outputs, the fixed zero/one pins and canonical sizes.
- Its opcode selectors, index triples, use-multiplicities and constant
  pins are deterministic Plonky3 public **periodic columns**, not
  prover-controlled witness columns or randomized preprocessed
  commitments. The whole program's SHA-512 digest is also constrained
  as **32 public field values absorbed by Fiat-Shamir**.
- The private trace has three gate operand values and one canonical bit
  per indexed wire. Plonky3 LogUp balances the three gate-side
  lookups with the one-row-per-wire table using program-fixed
  multiplicities, while Boolean constraints enforce AND, XOR, NOT,
  EQUAL and the constant pins. This is what prevents a malicious prover
  changing one wire's value between two SHA-512 gates.
- `prove-wired <trusted-public-program.bin> <private-wire-assignment.bin>
  <proof.json>` constructs an isolated hiding-FRI batch-STARK.
  `verify-wired <reconstructed-public-program.bin> <proof.json>
  <expected-program-sha512>` recomputes the program and verifies the
  actual STARK; **the expected hash must be supplied by the verifier**
  and may not originate from the proof.
- `single-transfer-circuit.mjs` now exposes
  `writeOneInOneOutPublicProgram512` and
  `writeOneInOneOutPrivateAssignment512`: they compile the entire
  existing six-SHA-512 Boolean financial program and give the native
  prover a private bit assignment from a single validated witness.
  `verify-one-in-one-out.mjs` rebuilds the statement-specific program,
  checks an independently pinned Rust binary SHA-512 and the actual
  LogUp proof before it can report financial relation satisfaction.
- A small genuine native LogUp proof and tampered-wiring test are
  added to `wired-r1cs.integration.test.mjs`. A separate **opt-in**
  `full-single-transfer.integration.test.mjs` generates a real six-hash
  1x1 proof; it is deliberately outside the ordinary CI until its
  high-memory resource profile is established.

**Qualification gates:** the existence of source code does not mean
its current commit compiled or that the million-gate full one-in/one-out
proof has finished. The small LogUp test and the resource-intensive full
test must both pass before describing this as an operational full
financial proof. The lookup argument's non-asymptotic soundness,
randomness/zero-knowledge properties, Fiat-Shamir/QROM, knowledge
extraction, hash assumptions, and lifetime composition remain
unqualified. Consensus and network admission must remain unchanged;
`aegis_target_met=false` and `production_ready=false` are mandatory.

Local lab:

```sh
cargo build --release --manifest-path aegis-flow/experiments/pq128/v4/plonky3/Cargo.toml
AEGIS_V4_P3_INTEGRATION=1 AEGIS_V4_P3_BINARY="$PWD/aegis-flow/experiments/pq128/v4/plonky3/target/release/aegis-v4-plonky3-lab" \
  node --test aegis-flow/experiments/pq128/v4/wired-r1cs.integration.test.mjs

# Resource-intensive full six-SHA-512 research verification (opt-in)
AEGIS_V4_FULL_WIRED_SHA512=1 AEGIS_V4_P3_BINARY="$PWD/aegis-flow/experiments/pq128/v4/plonky3/target/release/aegis-v4-plonky3-lab" \
  node --test aegis-flow/experiments/pq128/v4/full-single-transfer.integration.test.mjs
```


## QROM elimination test — BabyBear degree 8 is not sufficient for the CMS20 theorem path

The proof-theoretic bottleneck is now quantified, not guessed.
Chiesa–Manohar–Spooner, *Succinct Arguments in the Quantum Random
Oracle Model* (ePrint 2019/834, informal Theorem 3), gives for BCS
compiled from a suitable round-by-round sound public-coin IOP an
error `O(Q²*epsilon_RBR + Q³/2^lambda)`. This theorem has NOT yet
been instantiated for the exact Aegis `p3-batch-stark` implementation;
it is a **necessary-parameter screen for that candidate proof route**.

Using the more precise upstream Plonky3 `p3-security::logup`
fingerprint bound `N*(W+2)/|E|` with four LogUp interactions,
message width 2, a 2^23-row ceiling, and BabyBear degree 8, the
interactive bound is `2^-220.255`. At Q=2^128 the quadratic
term alone is `2^35.745` (completely vacuous), even BEFORE
multiplying by the optional research horizon H or composition events.
No increase in FRI queries changes this lookup fingerprint term.

With the hypothesis of H=2^32 receipts, 64 segments and four
first-bad-event categories, the optimistic unit-constant numerical
screen requires at least a challenge field of **greater than 324
bits**, corresponding to BabyBear extension degree **>=11**
for G1. This is a minimum arithmetic condition, not sufficient
to qualify: the theorem's hidden constants, proof shape, RBR
composite, and quantum-adaptive extraction must all be checked.
G2 is stronger and requires at least degree 15 under the same
unit-constant subterm. The SHA-512 ideal Q³ hash term is
approximately 2^-88 under the same horizon, sufficient for G1
as a component but not G2.

**Upstream field support is not interchangeable with cardinality:**
Plonky3 0.8.0 implements BabyBear binomial extensions of degree
4, 5, and 8; Goldilocks supplies degree 2 and 5 binomial
extensions, with the quintic field at approximately 320 bits,
slightly short of the conservative worst-case G1 budget at
this row/horizon shape. Thus merely replacing `EXT_DIM`
with 11 or 16 cannot compile or establish an extension
field. A larger, irreducible challenge field with audited
arithmetic and suitable `HidingFriPcs`, transcript and
serialization support must be implemented, OR an applicable
QROM theorem with a tighter *proved* concrete reduction must
be identified. The framework Plonky3 may remain in place.

Use `cms-qrom-gate.mjs` for the exact BigInt screen and
`logup-qrom-branches.mjs` for explicit separation between an
unproved linear branch and the known BCS quadratic-loss route.
Neither is a PQ128 proof. CI must retain `pq128_demonstrated=false`,
`production_ready=false`, and no consensus upgrade.

A native `security-report-wired <trusted-program.bin>` command
now evaluates the **actual lookup-aware WiredAir** constraint
degree, quotient chunks, FRI and LogUp (still interactive),
unlike `security-report` which measures only the toy
balance AIR. This command is tested with the small authenticated
Boolean program; no full million-gate native proof or audit
is yet verified.



## V2 native financial program binding + reproducible public preprocessing

The first full SHA-512 1×1 proof attempt did **not** establish a passing
financial proof: the previous GitHub runner was cancelled during the
resource-intensive test before it reported an accepted STARK. Two
structural fixes were subsequently implemented:

**(1) Full-statement replay binding.** Version 1 of the Boolean native
program encoded the gate equations but did not necessarily encode
`transaction_binding`. Two different authenticated public statements
could therefore compile to the same instruction bytes and program hash.
The financial path now emits
`AEGIS_V4_BOOLEAN_PROGRAM_V2\\0`, an 8-byte length header, then
**64 bytes of the complete canonical statement SHA-512**, then the
same 13-byte gate instructions. The native parser and public digest
calculation enforce the exact V2 header. The verifier re-generates
the complete program from independently pinned public inputs.
The non-financial tiny circuit keeps V1 for backward-compatible
laboratory testing. The research verifier **never promotes** V1 to a
financial proof.

**(2) Public preprocessing versus private witness.** Initially the
lookup witness evaluator could not access periodic columns, forcing
12 public instruction columns to be copied into each private main
trace row, with equality checks. Plonky3 0.8.0 does support
`preprocessed` columns in `RowEvalContext`. The implementation
now uses 4 columns for the private trace and 12 immutable
preprocessed instruction columns committed by the PCS.
**Independent reproduction of that commitment requires deterministic
salts**, since the upstream hiding MMCS normally inserts fresh random
salts even for public preprocessing. The public-only preprocessing
config derives domain-separated RNG seeds from the canonical program
SHA-512. The prover and verifier reproduce this public commitment
independently. All private proof commitments and quotient/FRI masking
continue to use fresh OS randomness, not the deterministic
preprocessing seed. The Rust test constructs an independent verifier
preprocessing commitment to detect incorrect prover-root reuse.

**(3) Measurable full-proof progress.** The full six-SHA-512 test
emits stage checkpoints (circuit compiled, private assignment built,
native proof generated, independent verification) and the Rust prover
optionally reports its stage and process RSS via
`AEGIS_V4_P3_PROFILE=1`. No witness bits, inputs or secrets are logged.
The test also mutates the V2 statement hash **without changing any
gate instruction bytes** and demands native proof rejection.

Until the native job has compiled the revised backend and accepted one
complete six-hash STARK proof with the independently reconstructed
preprocessed commitment, the status stays
`full_financial_relation_native_verified=false`,
`pq128_demonstrated=false`, `production_ready=false`. Production
consensus has not been modified.
