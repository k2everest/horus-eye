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
