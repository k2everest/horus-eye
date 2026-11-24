# PCS gamma batching: a *conditional* fixed-oracle lemma from native verifier ladders

2026-11-24. PR #6 over PR #5. Status: **conditional algebraic lemma only; W2, CMS RBR knowledge and PQ128 are NOT established**.

## Native binding and actual coefficient order

The pinned Plonky3 0.8.0 `fri/src/verifier.rs::open_inputs` computes, for every committed matrix m of LDE height h, each opening point z, each authenticated column j, and sampled index X:

  gamma^(offset_h(z,m)+j) * (p_j(z)-p_j(X)) / (z-X).

The exponent offset is **height-specific**, accumulated in the deterministic order commitment -> matrix -> point -> column. The hiding PCS appends 8 random-codeword columns at each private opening point, and none to the trusted public-preprocessing commitment. The private columns are included in L_h, the full ladder length for height h.

The PR #6 typed-replay exports these exact ordered terms and the canonical query denominators. The JS validator rejects gaps, duplicate/optimistically shortened offsets, mismatched ladder totals, incorrect query projections or altered denominator coefficients.

## Mathematical statement

Let E = F_(2013265921)^8 denote the extension field used for PCS batching. For every height h, each possible verifier-owned query position X on the corresponding domain, and each j in {0,...,L_h-1}, define e_(h,X,j) as the discrepancy between the authentic fixed-oracle opening relation and the claimed opening relation, scaled by any nonzero denominator factors. Assume:

A. Every e_(h,X,j) is uniquely determined **before** sampling gamma, for the *same* trace/quotient/hiding commitments and claimed values. This is a nontrivial cryptographic binding/extraction assumption, not established by the typed replay.
B. Gamma is uniformly sampled in E, conditioned on all earlier fixed data, as in the ideal interactive-oracle model. For the concrete Fiat–Shamir transcript, an additional random-oracle/QROM reduction is required.
C. Every position used for this bound has at least one nonzero e_(h,X,j), so P_(h,X)(Y) = sum_j e_(h,X,j) Y^j is not the zero polynomial. If a discrepancy is absent, it does not define a bad cancellation event.
D. All field denominators used in the reduction are nonzero (the native verifier rejects zero denominators).

For any fixed h,X satisfying C, P_(h,X) is nonzero of degree at most L_h-1, therefore:

  Pr_gamma[P_(h,X)(gamma)=0] <= (L_h-1) / |E|,

by the root bound over a finite field. This is exact for a fixed statement; it does NOT follow merely from successful test vectors.

**Important adaptive-query correction.** The FRI query vector is sampled *after* gamma and, under Fiat–Shamir, can be correlated with gamma. It is invalid to select a gamma-dependent X and apply the fixed-X bound without qualification. Union over all possible query positions in the largest LDE domain D instead:

  Pr_gamma[exists X in D, exists nonzero P_(h,X): P_(h,X)(gamma)=0]
      <= min(1, |D| * sum_h max(0,L_h-1) / |E|).

For shorter heights, counting all |D| positions is deliberately conservative. Multiple queries do not require another factor once this global union is taken.

For the 4096-row lab, |D| = 65536. The actual numerator is derived by `native-verifier-audit.mjs` from the verifier-produced `batch_ladder_lengths_by_height` rather than invented constants. The denominator is the exact integer 2013265921^8; the tool emits an integer ratio, not a security certificate.

This lemma **only** controls cancellation of a nonzero, gamma-independent polynomial discrepancy; it does NOT prove that every adversarial accepted proof yields such a discrepancy. It also does not analyze the probability of query misses, FRI proximity/list decoding, LogUp/ALI/DEEP failures, authentication failures, quantum rewinding or knowledge extraction.

## Why the soundness proof is still open

The missing reduction must establish A for the *actual* salted Merkle/MMCS and HidingFriPcs. It must rule out adversarial adaptive selection of a new oracle or an opening based on gamma, including any post-query nonbinding. It must then map the resulting fixed-oracle game into the CMS round-state bad events and account for the global quantum adversary budget.

The bounds above are used only as a fail-closed consistency check of the native exponent ladder. In particular, the JS result includes `fixed_pre_gamma_discrepancy_hypothesis_proved:false`, `quantum_extraction_proved:false`, `pq128_demonstrated:false`, `production_ready:false`.

**Security decision: HOLD_NO_GO.**
