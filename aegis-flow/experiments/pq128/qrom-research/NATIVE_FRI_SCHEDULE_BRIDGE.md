# Native report -> CMS schedule bridge (PR #6)

Date: 2026-11-23. This is a verification **bridge**, not a QROM proof.

The original `wiredRoundSchedule({friLogArities})` permits a researcher
to provide arities by hand. That is useful for testing ordering but not an
adequate statement about the adversarial implementation: the verifier must own
the shape.

`deriveWiredScheduleFromNativeReport(report,{expectedProgramSha512})` now:
- requires an independently supplied expected, lowercase 128-hex program digest and exact match to report;
- requires the single-instance, one-lookup, hiding BabyBear^8, 320-query,
  zero-PoW geometry pinned in `wired_r1cs.rs` / `main.rs`;
- invokes the already established geometry validator
  `matchNativeHidingDegreeReport`, which rejects changes to ZK doubling,
  quotient chunks, FRI fold arity, Merkle matrix height, committed polynomial
  degree caps, terminal degree and every round;
- derives the actual symbolic schedule arity vector from the matched
  per-round report, rather than accepting any prover-controlled array;
- constructs a typed CMS event chronology for the single-instance shape
  and always returns `native_build_attested=false`,
  `rust_verifier_byte_transcript_equivalence_proved=false`,
  `cms_terminal_covering_executable_proved=false`,
  `pq128_demonstrated=false`.

An attestation boundary is **essential**: a JSON report can be fabricated to
agree with its own computed geometry, and the expected digest is not an
authenticated executable identity. This adapter must only consume a report
generated through the trusted pinned native binary; accepting an arbitrary
report supplied with a proof is insecure.

The adapter proves neither correct domain-specific Fiat-Shamir ordering nor
the actual verifier's FRI query projection into each fold domain. The source
report is assembled by the native `wired_security_report` method using
`p3_security::fri::FriRegime`; it is not a direct export of the
`verify_batch` transcript. Proving W1 universally still requires deriving
the shape and query map from `verify_batch` itself, verifying all dynamic
instance-height combinations and proving byte-level challenger replay.

## Implementation and next acceptance criterion

Modules:
- `native-wired-schedule.mjs`
- `native-wired-schedule.test.mjs`

Required next changes in pinned Rust:
1. Introduce a native verifier-owned metadata view that is produced at
   `verify_batch`, not an out-of-band reimplementation of the schedule.
2. Export all batch polynomial denominator sets, rounds and per-query
   projection maps, including hiding randomness and quotient chunk order.
3. Compare this export against `native-wired-schedule.mjs` with malicious
   fixtures and independently reconstructed verifier preprocessing.
4. Establish algebraic soundness/proximity and authenticated-oracle extraction,
   rather than inferring it from the shape match.

**Gate remains HOLD_NO_GO.**
