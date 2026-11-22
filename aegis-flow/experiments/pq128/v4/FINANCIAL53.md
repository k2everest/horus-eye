# Aegis V4 — 53-bit financial AIR (research-only)

This milestone **extends the real Plonky3 STARK amount circuit** from
nine 16-bit values to the Aegis note format's full positive
`1 .. 2^53 - 1` range. It does **not** yet prove SHA-512 preimages inside
the Plonky3 AIR. It must not be used to accept currency transfers.

## Cryptographically checked by the verifier

The native `AEGIS_V4_P3_FINANCIAL_AMOUNT53_PARTIAL_V1` proof
runs in the already isolated Plonky3 0.8.0 HidingFriPcs/EXT8 laboratory.
It validates the independently supplied public financial statement,
including its exact ordered, domain-framed SHA-512 digest, and constrains:

- 1–4 private inputs and 1–4 private outputs, with fixed public slot
  counts and zero padding in inactive slots;
- each active amount has 53 binary bits and a nonzero
  bit-count inverse, so zero/negative/out-of-range amounts cannot satisfy;
- the ninth amount is the public canonical 53-bit transaction fee,
  with all bits forced equal to that fee;
- equality of exact integer totals,
  `sum(input values) == sum(output values) + fee`,
  via four base-`2^16` limbs and bounded carries. All per-limb
  expressions stay **well below BabyBear's modulus**, so field wraparound
  cannot fake equality. Totals fit in 64-bit unsigned integers
  because at most four values of `2^53 - 1` are added;
- binary framing of the public statement and a 512-bit digest
  accepted by the native verifier from its own canonical public input.

The proof stores only the public statement and opaque STARK bytes, not
secret notes, owner tags, private amount values, spend secrets or sibling
paths. The amount rows are masked by `HidingFriPcs`.

## Private SHA-512 preflight — NOT proved in the Plonky3 AIR

The prover imports the existing `aegis-financial512-guest` Rust relation
and **refuses to construct** the partial proof if that relation rejects.
This host-side test covers the exact SHA-512 note commitment,
owner derivation, nullifier derivation, network/asset, private Merkle
opening, output commitments, public fee and conservation. It uses the
same test vectors as the JavaScript financial verifier.

**This is insufficient for cryptographic financial soundness.**
An adversary can modify the prover or generate an AIR-compliant witness
unrelated to note hashes, because the AIR currently has no
SHA-512 Boolean gadget or lookup argument tying the values, owner,
randomness, secret and Merkle path to the published 512-bit hashes.
The verifier cannot infer that a host-side preflight ran; it must
not authorize coins on the strength of the balance proof.

The native verdict explicitly says:
```json
{
  "valid": true,
  "amount_conservation_proved": true,
  "financial_relation_proved": false,
  "sha512_preimages_arithmetized": false,
  "knowledge_demonstrated": false,
  "aegis_target_met": false,
  "production_ready": false
}
```

This format/version is separate from the earlier benchmark and is
**not imported by any consensus admission path**.

## Exact remaining work to complete the requested AIR

1. Lower the existing complete 512-bit Boolean SHA-512 transfer
   constraint circuit from `experiments/pq128/constraints/transfer.mjs`
   to Plonky3 with all input aliases and wire equality enforced
   cryptographically. The upstream Boolean circuit already expresses
   80-round SHA-512, padded/framed note hashes, nullifiers,
   owner checks and Merkle inclusion. Merely copying its values into
   the trace, or hashing them in the host, is not a proof.
2. Select a sound large-circuit trace layout / memory argument to
   enforce **cross-row wire identity** and prevent a malicious
   prover from choosing different Boolean wire values for each gate.
   Size the 8-million-gate public budget, FRI domain, proof bytes
   and hiding mask against the full matrix before enabling it.
3. Tie its **same private amount bits** and SHA-512 preimages to this
   amount-conservation AIR, using one common committed witness.
   Port the exact public statement, without publicly revealing note
   owners/values/paths.
4. Recalculate the interactive round-by-round bound from the
   **new complete AIR shape**, and obtain a corresponding concrete
   Fiat–Shamir/QROM reduction and proof-of-knowledge/privacy
   for the composed system. Current M1/smoke numbers are not transferable.

## Run native tests

```sh
cargo test --locked --release --manifest-path aegis-flow/experiments/pq128/v4/plonky3/Cargo.toml
AEGIS_V4_P3_INTEGRATION=1 AEGIS_V4_P3_BINARY="$PWD/aegis-flow/experiments/pq128/v4/plonky3/target/release/aegis-v4-plonky3-lab" \
  node --test aegis-flow/experiments/pq128/v4/financial53.integration.test.mjs
```

Only the **public** proof bundle and its verification verdict may
leave the local prover. No private witness belongs in CI artifacts.
