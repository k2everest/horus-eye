# Aegis experimental value binding and admission — 21 November 2026

**Status: isolated SHA-512 financial format with proof-backed state-transition
rehearsal. NOT activated on the network. PQ128 for the full protocol is NOT
demonstrated.** No changes to V1/V2 consensus, monetary cap, wallet migration,
accepted image ID or release policy are authorized by this experiment.

## Monetary claim and trust boundary

A value is hidden in a **canonical, injectively encoded** note
`(version, network, asset, 8-byte unsigned big-endian value, 64-byte owner,
64-byte randomness)`. The complete, length-prefixed transcript is hashed with
SHA-512 under the `NOTE512_COMMITMENT` domain. Spend ownership and nullifier
have *different* SHA-512 domains, including the network, commitment and secret.
The note schema is exact; values are canonical decimal strings in
`[1, 2^53-1]`. A distinct value means a distinct encoded message. If two
different values yield the same commitment, they imply a SHA-512 collision in
that domain. Binding depends on the collision resistance assumption, not on
JavaScript/Rust uniqueness tests.

The native guest validates, under one private witness:
- input note hashes, spend secret/owner, nullifier and Merkle membership;
- output note hashes, positive range and one asset/network;
- exact integer `sum(inputs) = sum(outputs) + fee` with checked u64 sums.

The authenticated public statement includes all commitments, root/count,
nullifiers, network, asset, fee and transaction binding. The native adapter
verifies a Composite RISC Zero receipt against the **independently trusted**
program ID and complete expected statement. The verifier never receives
amounts, randomness or spend secrets.

The `ExperimentalValueLedger512` has **no witness input**: its input is a
statement plus proof. It serializes admission to avoid two concurrent spends,
checks known inputs, spent commitments, duplicate outputs, used nullifiers,
duplicate transaction binding, known roots and the strict SHA-512 proof suite.
After native verification, it appends new commitments, records consumed inputs,
records fees and updates the Merkle root together; invalid proofs leave state
unchanged. Genesis commitments are a **trusted external allocation**, not an
authorized mining/mint function. This is an in-memory laboratory rehearsal,
not persistent/reorg-safe network consensus.

## Adversarial properties tested

- A value increase or fee change invalidates the private transfer relation,
  even when the attacker recomputes their new note commitment.
- Modifying statement, recipient commitment, fee, nullifier, owner or path
  makes the independently verified receipt fail (native integration tests).
- Legacy 32-byte SHA-256 commitments and statement versions do not parse as
  64-byte experimental SHA-512 commitments.
- Simultaneous attempts to spend the same commitment are serialized; a second
  spend is refused. A rejected proof causes no local state mutation.
- Replaying an old receipt, foreign-network statement, unknown/expired anchor,
  known output commitment or previously recorded nullifier is rejected.

Ordinary `value-ledger.test.mjs` uses an EXPLICIT TEST-ONLY verifier stub to
exercise state-transition invariants; these tests provide NO cryptographic
verification evidence. `native/integration.test.mjs` exercises a real
Composite receipt when the pinned toolchain is available. This distinction
must remain visible in CI and reports.

## Conditional quantitative conclusion

The 256-bit legacy commitment remains an open quantum binding issue under the
ideal cross-value claw model in `../quantitative/claw-bound.mjs`. Under an
ideal **512-bit binary quantum random oracle**, the finite collision bound in
`../quantitative/ideal-collision-bound.mjs` with global `Q=2^128` oracle
queries and `K=2^34` compared opening pairs is below `2^-90`.
This is a conservative **ideal-model** probability upper bound for a specific
binding game, not a theorem about the concrete SHA-512 implementation, the
entire IOP/FRI, the QROM compiler, knowledge, ZK or network lifetime.

No assertion about finite gate cost, coherent memory, implementation-specific
SHA-512 attacks, hardware time, independent reviewers, or PQ128 full-receipt
certification is made. Security qualification for the full protocol stays
`HOLD_NO_GO`.

## Activation and migration remain explicitly blocked

Do **not** relabel a SHA-256 note as SHA-512 or silently rehash a legacy leaf:
the roots, nullifiers, accepted proof image and signatures would no longer
authenticate the same relation. A network activation needs a new consensus
upgrade, independent image ID, state root/leaf encoding commitment, signed
transaction envelope, wallet changes, deterministic replay/reorg handling,
mint/reward rules and a separately specified legacy conversion ceremony with
supply accounting. Until that is designed and audited, do not accept 512
experimental receipts as real currency transactions and do not convert old
notes via an unsecured bridge.

Tests:
```sh
node --test aegis-flow/experiments/pq128/financial/*.test.mjs
AEGIS_NATIVE512_INTEGRATION=1 node --test aegis-flow/experiments/pq128/native/integration.test.mjs
```
The second command needs the exact pinned native build; failures and skips must
not be described as successful cryptographic tests.
