# HORUS-EYE / PQ128: field-16 migration profile and acceptance criteria

Date: 2026-11-24. PR #6 on PR #5. All changes in this note are
**research-only**; the existing WiredAir/HidingFriPcs verifier remains
unchanged. No proof of 128-bit post-quantum security has been completed.

## 1. Mathematical field certificate and arithmetic evidence

Proposed field:
  E16 = F_2013265921[T] / (T^16 - 11).

The base modulus satisfies p-1 = 15*2^27, and Euler's criterion
gives 11^((p-1)/2) = -1 (mod p). Because 11 has full 2-adic
multiplicative order in Fp*, a root of T^16-11 cannot exist in any
proper subextension of F_(p^16); hence T^16-11 is irreducible.

An isolated Rust **reference implementation** now exists under
`v4/plonky3/src/fp16_reference.rs`, compiled ONLY by `#[cfg(test)]`:
canonical 64-byte little-endian encoding with strict <p limb
validation; modular polynomial addition/subtraction/multiplication;
inversion via Fermat exponent p^16-2 with sixteen little-endian
32-bit exponent limbs; conditional rejection sampling from *uniform*
u32 values, accepting 0 <= sample < 2p and reducing mod p; and
tests of field identities, canonical serialization and independent
big-integer golden multiplication vectors.

Uniform-sampler proof: exactly two distinct accepted 32-bit words
map to each residue in Fp. The acceptance probability is
2p / 2^32 ≈ 0.9375000005. A production field sampler would require
an audited cryptographic random source, side-channel timing policy,
and bounded resource use. This reference is NOT constant-time and
must not process secret production witnesses.

**This is not a native p3-field implementation**. Plonky3 0.8.0
`p3-baby-bear` implements `BinomialExtensionData<4>`,
`<5>`, and `<8>`, not `<16>`. A new audited field type or
pinned fork must implement the exact Plonky3 traits, Frobenius
constants, extension basis, serialization, MMCS packing, uniform
challenge sampling and PCS/FRI arithmetic before native migration.

## 1a. Canonical field embedding from the existing BabyBear^8 extension

The existing p3-baby-bear 0.8.0 code specifies
`BinomialExtensionData<8>` with W=11, hence
`E8 = Fp[u]/(u^8-11)`. The candidate `E16` has
`t^16=11`. Define

  iota: E8 -> E16;
  iota(sum_(j=0)^7 a_j u^j) = sum_(j=0)^7 a_j t^(2j).

Then `iota(u^8-11)=t^16-11=0`, so the map descends to
the quotient and is a unital ring homomorphism. Its kernel is an
ideal of a field and cannot contain 1; therefore the kernel is 0
and the map is an injective field homomorphism. Equivalently, its
canonical coefficients occupy *even* positions of the 16-limb
representation, and no nonzero E8 element maps to zero.

The reference Rust implementation now includes
`embed_existing_babybear8` and
`project_existing_babybear8`, with property tests comparing
independent E8 multiplication against E16 multiplication, and
checking that inverses of nonzero embedded E8 values remain in
the even-coefficient subfield.

**Security caveat:** this mathematical embedding does **not**
make existing E8 proof bytes or Fiat-Shamir challenges valid
under the E16 proof system. The latter requires new transcript
domain separation, proof-versioning, parameter commitments, a
fresh independent migration strategy and tests of the actual
P3 encoded extension arithmetic.

## 1b. Deterministic two-adic root-of-unity certificate

The exact-order FFT generator constants for degrees 28 through 31,
needed by a hypothetical Plonky3 `BinomialExtensionData<16>`,
can be derived without guessing:

  M = p^16-1, v2(M)=31,
  g_j = t^(M/2^j) for 28 <= j <= 31.

Each `g_j` has order precisely `2^j`, because
`v2(ord(t))=31` follows from `t^16=11` and
`v2(ord(11))=27`. Each monomial is serialized in the
canonical basis (coefficient index, coefficient mod p):

  j=28: (8, 929455875)
  j=29: (12, 529583979)
  j=30: (14, 1310212151)
  j=31: (15, 1835875777)

The binomial-extension Frobenius constant candidate
`DTH_ROOT = 11^((p-1)/16) mod p = 1400279418`
has exact order 16.

The new `babybear16-two-adic-certificate.mjs` computes these
values dynamically using BigInt and verifies every generator
has the specified order, rather than trusting copied tables.
The vector test fixes the results across implementations.

**Crucial omission:** a full multiplicative generator of
`E16^*` has NOT been proved, nor have the full
`BinomialExtensionData<16>` trait, Frobenius tables,
production random sampling and FRI/PCS compatibility been
implemented. Declaring these five properties would be
unsupported. No changes to the production transcript follow
from a root-of-unity certificate alone.

## 2. Research-sizing calculation derived from pinned p3-security

For the single-instance native WiredAir profile:
  log_trace_length = 13 (4096 main rows, hiding-doubled to 8192);
  log_blowup = 3, n = 65,536, k = 8,192;
  air.max_combo = 2; binary folds; 0 PoW bits.

The upstream `p3-security 0.8.0` UDR FRI formulas give
  rho_plus = (8192+2)/65536,
  alpha = (1 + rho_plus)/2 = 0.5625152587890625,
  query_bits(q) = q * (-log2(alpha)),
  commit_bits(D) = D*log2(p) - log2(n+1).

Native E8, q=320:
  field_bits=247.2551; query_bits=265.6115;
  commit_bits=231.2551; min FRI term=231.2551.

Hypothetical E16, q=512, 16 hiding random codewords:
  field_bits=494.5102; query_bits=424.9784;
  commit_bits=478.5102; min FRI term=424.9784.

The existing *research* interactive target of 336 bits reserves
128 target bits + 2*64 QROM query-loss bits + 80 other bits.
The proposed FRI UDR terms clear **only that necessary screen**.
Actual full STARK soundness must also include ALI/DEEP/LogUp,
PCS batching, FRI list decoding and opening counts, Merkle
collision, adversarial hiding, the regime-selection theorem and
the exact QROM constants.

The current native `p3-security` composite applies a separate
**externally assumed 170-bit collision-resistance cap**. Even
after changing the field, that estimator cannot report >=336
without new justification. Simply increasing the cap in source
would be fraudulent and is forbidden.

The implementation and tests for the comparison are in
`pq128-fri-candidate-screen.mjs` and `.test.mjs`, which
always return `pq128_demonstrated:false`.

## 2a. All UDR terms, not only FRI

`pq128-interactive-composite-screen.mjs` now independently mirrors
the pinned `p3-security 0.8.0` UDR equations:

  ALI = floor(log2|E|) - log2(num_constraints)
  DEEP = floor(log2|E|) -
         log2(max(deg*(k+combo-1)+k-1,(chunks+1)*k+combo-1))
  LogUp = floor(log2|E|) - log2(4*k*(2+2))
  FRI query = q*(-log2(alpha_udr))
  FRI commit = floor(log2|E|)-log2(n+1)
  PCS batch = floor(log2|E|)-log2(n*(num_batched_functions-1))
  total = min(all terms, externally assumed collision-resistance bits)

This function requires the true independently derived compiled
constraints/degree/chunks/batch counts; the input is an
*algebraic screen* only, never a trusted binary attestation.

For an illustrative non-attested shape
`num_constraints=100, max_degree=3, quotient_chunks=8,
num_batched_functions=20`, E16+512 queries gives the
algebraic UDR minimum of **~424.98 bits**, limited by
FRI query sampling, before the 170-bit externally assumed
collision cap. A hypothetical 512-bit collision assumption
would remove that estimator bottleneck but would still
**not** establish quantum Merkle collapse-binding, CMS
knowledge soundness or PQ128. All such flags remain false.

## 3. Cryptographic knowledge/security obligations: clear PASS vs HOLD

A release-ready candidate must have ALL of:

- Native E16 extension arithmetic, proof-of-irreducibility certificate,
  canonical encodings, CSPRNG challenge sampling, batch field operations,
  FRI PCS, LogUp and SHA-512 AIR tests, checked against known vectors.
- Quantum commitments: explicitly instantiated salted multi-height MMCS
  binding *and* an online/collapsing extraction argument under actual
  Fiat-Shamir hash oracles and access pattern. Classical two-opening
  collision reduction is not enough.
- Real, adversarial FRI proximity and round-by-round **knowledge**
  soundness, native gamma batching, ALI/OOD/LogUp and the state
  function with no prover-time 0->1 state transition.
- Full financial witness decoder from the same extracted coherent
  trace, including six SHA-512 constraints; separate ZK and unlinkability
  proofs for the cryptocurrency.
- The exact theorem's polynomial/time/quantum-query accounting
  with constants and end-to-end union bounds; signatures, KEM,
  network protocol and consensus production review.
- Independent cryptographic audit. Benchmark performance is not
  security evidence. Do not merge a replacement scheme into the
  production proof path without a new domain-separated, versioned
  transcript and consensus migration strategy.

References:
- Chiesa–Manohar–Spooner, *Succinct Arguments in the Quantum Random
  Oracle Model*, TCC 2019, https://eprint.iacr.org/2019/834
- Don–Fehr–Majenz–Schaffner, *Efficient NIZKs and Signatures from
  Commit-and-Open Protocols in the QROM*, CRYPTO 2022,
  https://doi.org/10.1007/978-3-031-15979-4_25
  (The theorem is for specified commit-and-open protocols. A
  mapping to our multi-round WiredAir/LogUp/HidingFriPcs is not
  automatically valid.)
- Plonky3 v0.8.0 `security/src/fri.rs`, `security/src/proximity.rs`,
  `baby-bear/src/baby_bear.rs` and `merkle-tree/src/hiding_mmcs.rs`.

**Final release gate: HOLD_NO_GO.** The isolated native reference field
and FRI parameter screen advance one necessary subproblem; they
do not certify a working, safe 128-bit quantum-resistant currency.
