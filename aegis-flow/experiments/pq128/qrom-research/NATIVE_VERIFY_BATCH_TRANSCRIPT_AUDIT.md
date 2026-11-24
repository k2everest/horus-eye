# PQ128: exact native verifier transcript observation and typed replay

Date: 2026-11-23. Scope: PR #6 on PR #5, Plonky3 0.8.0, research only.
**Not PQ128 qualified. No consensus/financial release enabled.**

## Why this is needed

Previous `native-wired-schedule.mjs` derived FRI heights and arities
from a separate Rust security report. Matching those integers is useful,
but is insufficient to establish that the **actual** verifier consumes
the same Fiat–Shamir transcript as the CMS round-state model.

The pinned `p3_batch_stark::verify_batch` calls, in chronological order,
the public `BatchVerifierTranscript` driver (main, public preprocessing,
atomic LogUp pair, permutation/constraint-fold, quotient and randomization,
OOD zeta); then delegates to `HidingFriPcs`, which appends hidden
random codewords to every non-preprocessed PCS opening, and delegates to
`PcsVerifierTranscript` (claims, gamma) and `FriVerifierTranscript`
(commit/fold challenges, final poly, indices). All three typed drivers
are shipped by the pinned upstream library, not user-defined hashing.

## Executable audit entry point

```text
aegis-v4-plonky3-lab audit-verify-wired <trusted-program.bin> <proof-bundle.json> <expected-program-sha512>
```

1. Rechecks the original `verify_wired` acceptance and the trusted program
   SHA512. This is an additional read-only command and never a consensus path.
2. Builds an **independent** instrumented `StarkConfig` with identical
   HidingFriPcs, public preprocessing seed and initial challenger.
3. Calls the real `verify_batch` on the original canonical proof.
   `AuditedChallenger` forwards every sponge operation unchanged and
   captures challenge samples, 320 actual query indices, and absorbs.
4. `native_transcript_replay.rs` reconstructs the opening argument using
   the *same public helper* `commitments_with_opening_points`; adds hidden
   random-codeword values in the same order as `HidingFriPcs`;
   derives the FRI input heights from the actual matrix domains; then runs
   `BatchVerifierTranscript`, `PcsVerifierTranscript`, and
   `FriVerifierTranscript` against the same canonical commitments/claims.
5. Fails closed unless the full observed and replayed operations/value
   sequence is identical, including per-field 8-coordinate challenge
   samples and all query bits. A successful replay also compares actual
   rho/zeta/gamma/beta vectors and each index against the named export.
6. Exports FRI query paths using the pinned `fold_query` projection
   `start_index >>= log_arity`; the **projection is not instrumented
   inside upstream** and is separately marked as derived.
7. The JSON is research data, not a trusted or signed build attestation,
   and may reveal metadata about a public proof; do not publish it when
   context requires witness/network privacy.

## Actual PCS batching layout

The upstream FRI verifier's `open_inputs` computes, per input height h,
the batched opening at query X:

```text
reduction_h(X) =
  sum_{(commitment,matrix,point z) at height h}
      sum_{j=0}^{width-1}
        gamma^(offset_h + j) * (p_j(z) - p_j(X)) / (z - X)
```

The offset ladder advances **per height** across commitments, matrices,
opening points and columns, NOT one global offset shared across heights.
The HidingFriPcs adds `RANDOM_CODEWORDS=8` extra columns to every
non-preprocessed point, and zero extra to the verifier-reconstructed public
preprocessing commitment. `native_transcript_replay` exports this ordered
term description, z in the BabyBear^8 basis, domain height, offsets and
mask-column counts from actual authenticated public verification inputs.

The denominator depends on query index through
`X = F::GENERATOR * F::two_adic_generator(log_height) ^
 reverse_bits_len(index >> (max_height-log_height), log_height)`.
The native module now exports **all per-query concrete denominator values** in
the canonical BabyBear^8 basis, along with the query index, bit-reversed
reduced index, root-of-unity query coordinate X and original opening point z.
It reuses the upstream formula while calculating these values in the audit
module rather than instrumenting `open_inputs` itself. A separate JS
validator checks the subtraction z-X in the extension-field coefficient
basis, the query projection, ordering, and rejection of a zero denominator.

The flag `exact_batch_denominator_polynomials_exported` remains false,
because enumerating finite evaluations does not prove a polynomial identity
or an adversarial oracle-binding reduction. The new typed replay explicitly
sets `denominator_evaluations_came_from_upstream_verifier_hook=false`. This
distinction is essential for any soundness argument.

## Fundamental RNG pitfall caught by CI

`HidingFriPcs::clone()` intentionally forks its private RNG. Cloning the
public-preprocessing PCS changes the deterministic Merkle salt stream,
therefore changes the public commitment and the Fiat–Shamir transcript.
The original naïve audit replay failed an honest proof with
`MalformedPrunedProof(InconsistentDuplicateOpenings)`. Refactoring a
shared **construction factory** instead of cloning the PCS fixed this;
the original verifier and audited verifier then both accepted a native
WiredAir/LogUp/HidingFriPcs proof. This was confirmed by CI (14 native
Rust tests passed at intermediate commit `0f131bd`).

## Validation milestone (2026-11-24)

The original audit-challenger and typed-replay implementation (commit
`82cd424`) passed `plonky3-v4-laboratory` with 14/14 native Rust tests and
`Aegis Modular QROM Research` in GitHub Actions. This validates exact
sample-stream replay for tested honest proof input, **not universal security**.

The concrete-denominator exporter and its Rust/JS negative tests were
added subsequently and require their *own* successful CI run before they
can be labeled validated.

## Remaining mathematical and adversarial obligations

- Full typed replay and raw-sample event-stream equality must pass CI on
  the newest commit before being treated as established test evidence.
- Even perfect equality for selected native proofs says nothing about
  quantum extractability of the salted Merkle/MMCS commitment, arbitrary
  prover oracle degree binding or FRI proximity/list-decoding errors.
- A per-round state function for CMS must connect the *same native*
  commitment/oracle game to an efficient financial knowledge extractor.
- The full six-SHA512 transaction relation and quantum adaptive/global
  budget must be proven before PQ128 can be claimed.
- The reference upstream code is pinned to p3-* 0.8.0, but this research
  audit is not a binary/source reproducibility attestation.

**Security decision: HOLD_NO_GO.** This executable observation closes a
software-model equivalence gap only if all new CI tests pass. It does NOT
authorize mainnet, customer funds or production PQ128.
