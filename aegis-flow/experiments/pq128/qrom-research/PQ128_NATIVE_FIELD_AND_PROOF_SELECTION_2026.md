# PQ128: decision on native field + proof system (2026-11-24)

PR #6 over PR #5. This is a strict security audit, not a PQ128 certificate.
Release decision: **HOLD_NO_GO**. The real original verifier is untouched.

## Verified native field choices, Plonky3 0.8.0

| challenge extension | approximate log2 size | upstream support | 336-bit research margin | impact |
| --- | ---: | --- | --- | --- |
| BabyBear^8 | 247.255 | yes | fails | actual WiredAir baseline |
| KoalaBear^8 | 247.96 | yes | fails | replaces base trace and hash bindings |
| Goldilocks^5 | 320 | yes | fails *this* 336-bit target | replaces base trace and constraints |
| BabyBear^16 | 494.510 | no direct upstream support | **clears field-size only** | retains BabyBear modulus but needs a reviewed backend and proof revision |

The 336-bit intermediate research margin is conditional on the
conservative Q=2^64 QROM budget and an *unproved* 80-bit reserve. A
different (proved!) theorem and constants may yield a different minimum.
Goldilocks^5 may be viable for a smaller proved query/overhead budget,
but is NOT a replacement that establishes the *requested* profile
merely by compiling.

## Actual pinned upstream capability blocker

Plonky3 0.8.0 `p3-monty-31/src/extension.rs` does NOT implement
multiplication for binomial degrees other than 4, 5, and 8:

    match WIDTH { 4 => ..., 5 => ..., 8 => ...,
      _ => panic!("Unsupported binomial extension degree: {}", WIDTH), }

PR #6 reproduced this failure **in the actual native Rust CI** with a
new independently specified `MontyField31<BabyBear16SpikeParameters>`
and a formally irreducible degree-16 polynomial `t^16 - 11`.
The cause is library backend specialization, **not** field
reducibility or a crypto attack.

The smallest compatible repair is the p3-field-provided generic,
constant-degree schoolbook reducer:

    _ => binomial_mul(a,b,res,
             <Self as BinomiallyExtendable<WIDTH>>::W),

with `binomial_mul` imported from `p3_field::extension`.
This is a correct *arithmetic candidate*; performance, canonical
encoding, aliasing/packed operations, inverter and FFT behavior
must be tested.

### Second native blocker: packed matrix rowwise D=8 cap

CI at PR #6 commit `0cbd6ed` independently compiled and passed three
positive degree-16 native field tests, then rejected the real
HidingFriPcs opening test. The failure was:

```
p3-field-0.8.0/src/packed/packed_traits.rs:342
range end index 16 out of range for slice of length 8
```

Tracing the pinned source shows `p3-matrix/src/lib.rs` invokes
`T::Packing::coeffwise_dot_product(d,...)` from
`rowwise_packed_dot_product` with `d=16`; the pinned
`p3-field` trait hardcodes `[Self;8]`. This is a second independent
library compatibility limit, not a polynomial irreducibility error.

The isolated research script now also patches a temporary copy of
exact `p3-matrix=0.8.0`: retain the original optimized accumulator for
`d<=8`, and use a generic extension-packing multiply/accumulate for
`d>8`. Both Cargo patches are process-local; no accepted prover,
consensus verifier, or production dependency is changed. A negative
test additionally corrupts the FRI terminal polynomial. These new
changes need a passing native CI run before crediting a working E16
PCS, and do not discharge malicious-prover FRI or QROM obligations.

### Native reproducibility without production dependency changes

- `v4/plonky3/src/p3_babybear16_spike.rs` defines a test-only
  Monty31 field with BabyBear's exact base constants plus
  degree-16 extension constants and FFT roots.
- The normal CI runs the base-field test and a regression showing
  upstream D16 multiplication fails; D16 positive tests are explicitly
  ignored **unless** running against the temporary patched library.
- `v4/plonky3/scripts/test-babybear16-patched.sh` copies the
  exact cargo registry `p3-monty-31=0.8.0` into a temporary directory,
  checks its source pattern before rewriting and uses Cargo's
  process-local `[patch.crates-io]` override. No dependency inside
  the production verifier is modified by this script.
- A separate GitHub Actions job executes D16 positive field tests.
  Its success must be confirmed *before* claiming this stage is done.
- `p3_babybear16_spike.rs` also includes a research-only full native
  `HidingFriPcs` commit/open/verify test, with a forged opened
  evaluation. The test uses a fixed seed ONLY to be reproducible;
  real prover keys/salts must use CSPRNG entropy, as in production.

**Important:** this local test base type is distinct from the actual
`p3_baby_bear::BabyBear`. It does not yet run the real WiredAir,
does not retain identical canonical Fiat–Shamir commitment bytes,
and is not a production PCS. The current `EXT_GENERATOR` is a
*candidate without a full primitive-element certificate*; the exact
2^28..2^31 FFT roots and Frobenius constant DO have mathematical
order certificates. A native field or FRI release must not use an
uncertified multiplicative generator.

## Can other cryptographic primitives already provide level-1 security?

Yes, **for the individual capabilities they were standardized for**.
The NIST FIPS 205 SLH-DSA-SHA2-128[s/f] signature family targets
security category 1. NIST FIPS 204 ML-DSA-44 similarly targets
category 1, and FIPS 203 ML-KEM-512 is category 1 for encapsulation.
A conservative wallet can use properly integrated FIPS-conforming
implementations to obtain a standardized PQ signature/KEM *component*.

However, **NONE** of these proves the ciphertext/private-value
relation, transaction balance, anonymity or STARK witness existence
of `WiredAir + LogUp + HidingFriPcs`. Signatures cannot be
substituted for the missing STARK/QROM extraction theorem. Never
claim the entire currency 128-bit PQ from signature certification.

Standards:
- https://csrc.nist.gov/pubs/fips/203/final
- https://csrc.nist.gov/pubs/fips/204/final
- https://csrc.nist.gov/pubs/fips/205/final

## Alternative *proof system* rather than alternative field

If a formal RBR knowledge extractor for the pinned HidingFriPcs
cannot be proved, a viable research branch is to replace the IOP
with one whose round-by-round knowledge theorem is published and
instantiated. Bootle, Chiesa and Marty (October 2026) prove such
properties for specific general error-correcting-code IOPs;
S-two's 2026 whitepaper also contains an explicit Flat-AIR IOPP
RBR knowledge statement. Their hypotheses are NOT automatically
those of the HORUS-EYE financial AIR, hiding PCS, six SHA512
instances or commitment implementation.

References:
- https://infoscience.epfl.ch/entities/publication/a07668f8-bc32-4ea8-9038-860eaefa69e3
- https://eprint.iacr.asia/2026/532
- https://eprint.iacr.org/2019/834
- https://arxiv.org/abs/2202.13730

## Release-blocking proof obligations

1. Compiled, reproducible, audited, *native* BabyBear^16 field with
   a fully certified generator and safe CSPRNG distribution;
   full positive and negative FRI PCS tests.
2. A new, versioned HidingFriPcs/LogUp/WiredAir transcript with
   512 queries, 16 hiding codewords and unchanged base/AIR semantics.
3. A theorem for **all malicious provers**, including quantum
   coherent/MMCS collapsing or online extraction and adaptive
   commitment/query chronology. Two-opening classical binding is not
   enough.
4. Round-by-round KNOWLEDGE soundness for the exact interactive
   financial AIR including malicious hiding degrees, LogUp, FRI,
   actual gamma challenge schedule, and an efficient witness extractor.
5. An exact BCS/CMS QROM reduction with quantified global Q, hash
   oracle and constants, plus financial ZK/unlinkability proofs.
6. Independent code/cryptographic audit and mainnet release review.

Until all are discharged: `pq128_demonstrated=false`,
`production_ready=false`, `HOLD_NO_GO`.

### Engineering decision

**Keep BabyBear^16 as the primary research candidate**. Its field
capacity is sufficient with generous algebraic margin and its
base modulus is shared with the existing Boolean AIR. The new
problem discovered by native CI is a narrow p3-monty-31 kernel
implementation limitation, for which the separate patched experiment
provides a controlled repair path.

**Goldilocks^5 is the native-ready fallback** if the private
backend audit or performance makes BabyBear^16 untenable, but
Goldilocks^5 does not meet the present 336-bit intermediate target
or provide the missing RBR/QROM knowledge proof on its own.
