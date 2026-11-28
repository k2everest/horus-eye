# Executable WiredAir + LogUp + HidingFriPcs: hypothesis-by-hypothesis audit

Date: 2026-11-23. Scope: k2everest/horus-eye PR #5, native Plonky3 v0.8.0, audit PR #6. This is a **source-and-test assessment**, NOT a security certificate.

## The actual execution paths

- `aegis-flow/experiments/pq128/v4/plonky3/src/wired_r1cs.rs`:
  * `PublicProgram::from_bytes` rejects malformed opcodes/indices, malformed program lengths, repeated output assignments, unsupported shapes; SHA-512 of program plus optional 64-byte statement binding is converted to public words.
  * `WiredAir::program_row` deterministically builds 12 preprocessed columns from the trusted program: active, op flags, a/b/z IDs, wire ID/use count, constant pins.
  * `WiredAir::trace` builds 4 private columns: a,b,z,wire, and checks Boolean input bits and the 0/1 constants before honest proof generation.
  * `Air::eval` asserts bitness of four columns, AND/XOR/NOT/EQUAL, inactive rows, pins and 3 lookup-key reads per active gate against a multiplicity-weighted wire table entry. `LogUpGadget` is used by the Plonky3 backend.
  * `prove_wired` calls `prove_batch` with private `config()` and preprocessed `ProverData` derived under deterministic PUBLIC preprocessing RNG only.
  * `verify_wired` parses a canonical base64 proof and calls `verify_batch`, with `ProverData::from_airs_and_degrees` independently derived from the verifier's public program, not prover-provided preprocessing.
  * Native tests compare degree bits, hiding quotient chunk count, 13 FRI rounds for N=4096, and native `verify_batch` acceptance. New regression mutates serialized proof fields in memory (terminal polynomial, FRI opening count and quotient chunk count); rejection is required. These are tests of malformed proofs, not all adversarial strategies.

- `aegis-flow/experiments/pq128/v4/plonky3/src/main.rs`: defines actual HidingFriPcs with salted hiding MMCS and SHA-512 challenger, `config()` uses private randomness, `public_preprocessing_config` is derived only from the public digest.

- `hiding-degree-profile.mjs` and `HIDING_COMMITTED_DEGREES.md`: source-linked degree geometry for the SINGLE height instance, with strict trace/perm/random bounds <2N, C chunks, each chunk <2N, general malicious recomposition <(C+1)N. This is honest construction geometry unless a low-degree/binding theorem grants the same bounds to malicious fixed oracles.

## W1-W6 verdict

| Hypothesis | Direct executable evidence | Unproved universal claim | Decision |
| --- | --- | --- | --- |
| W1 fixed coherent oracles, verifier chronology and shape | Trusted public preprocessing; source-derived log-degree/chunk schedule; source-pinned transcript event order and native positive proof shape | The `round-state.mjs` schedule still accepts user-specified FRI arities and explicitly sets verifier-derived schedule flag false. No byte-level challenger replay or verified oracle extraction against arbitrary prover | **PARTIAL** |
| W2 complete FRI/PCS low-degree and opening alignment | Real verifier calls `verify_batch`; native shape comparison and malformed-proof rejection test | Code-level equivalence of all batch denominators/query projections; proximity/list-decoding theorem; malicious salted-MMCS binding, quantum extraction and degree enforcement | **UNPROVED** |
| W3 LogUp exact multiset if no bad event | Native AIR declares 3 reads and 1 multiplicity-weighted wire table entry; test rejects gate-row rebinding | Full exact transcript LogUp fingerprint/terminal equivalence for arbitrary committed oracle words, nonzero denominators, adaptive attack probabilities | **PARTIAL** |
| W4 full AIR/ALI/OOD identity | Rust AIR has explicit Boolean/gate/pin equations, public digest equality; symbolic constraint layout from native crate; ALI/OOD fixed-oracle lemma | Exact native quotient normalization/selector/evaluation identity under all malicious oracles and concrete bad-challenge event bounds | **PARTIAL** |
| W5 extracted same financial witness | Conditional deterministic complete-trace extractor and SHA-512-bound program representation | Efficient adversarial PCS oracle extractor, R_fin refinement to six SHA-512 preimages and all financial constraints on one witness | **UNPROVED** |
| W6 CMS prefix-measurable bad events and witness K | Typed schedule, abstract research S*, no-prover-revival conditional argument | Per-prefix actual event oracle construction, query projection from verifier, full knowledge-extraction transition property, strong RBR if applicable | **UNPROVED** |

**Conclusion: the executable protocol does not yet have a demonstrated proof of W1–W6.** This is a failure to establish the theorem, **not** a verified exploit against the protocol.

## A significant distinction

`verify_wired` currently returns `boolean_gate_relations_proved: true` and `cross_row_wire_consistency_proved: true` on an accepted native proof. These are flags reporting **acceptance of the selected proof system**, not unconditional mathematical certification that every adaptive malicious oracle obeys an extracted low-degree Boolean relation. Formal soundness and knowledge require the missing adversarial reductions above.

The ideal-IOP pointwise theorem in TERMINAL_COVERING_COMPLETE_IDEAL_IOP.md is valid under W1–W6, but cannot be instantiated for the native path by simply mapping function names to hypotheses. The quantum proof-of-knowledge requirement must not be inferred from successful honest proofs, malformed-proof rejection, deterministic digest pinning, FRI query counts, or total test counts.

## Next concrete proof task

Implement a Rust-side verifier-owned exact transcript/shape exporter at the common `verify_batch` level, including dynamic FRI arities, multiple input heights, challenges, all batches/denominators, query indices, projection paths, and terminal checks; validate byte-for-byte against the pinned backend and independent negative fixtures. Then give a cryptographic reduction from those checks to W2–W4 for arbitrary fixed oracle words. Separately prove the quantum vector-commitment extractor and financial decoder. Until then `terminal_covering_proved=false`, `pq128_demonstrated=false`, `production_ready=false`.
