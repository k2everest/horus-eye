# Whole-Composite quantum soundness: finite accounting, NOT certification (21/11/2026)

**Status: mathematical accounting implemented, end-to-end quantum soundness proof
NOT obtained.** The current Aegis accepted engine is RISC Zero zkVM 3.1.0,
`risc0-zkp` 3.0.6, Composite receipt, Poseidon2 transcript, 50 FRI queries,
fold 16, Baby Bear extension 4; the verifier permits up to 64 segments.
The already published upstream "proven" calculator produces *classical*
diagnostics only, not a quantum bound for this compiled protocol.

The executable `experiments/pq128/quantitative/receipt-soundness.mjs` and
its unit tests model a conditional first-bad-event decomposition with
**exact BigInt rational arithmetic**. `quantitative/demo.mjs` embeds its
output under `conditional_composite_soundness`.

## Conditional reduction requiring an actual theorem

Let a verifier accept a false *whole receipt* with up to `m=64` segments.
Suppose it has been independently proved for the exact implementation that
every such event implies at least one of these disjoint first-bad-event
categories (the events themselves need not be independent):

1. The compiled segment protocol accepts a false segment claim;
2. An adjacent segment state transition/claim is incorrectly linked;
3. The complete public journal is incorrectly bound to the final claim; or
4. The trusted image ID is incorrectly bound to the initial program state.

If there exist **uniform, conditional on arbitrary prior adaptive history**
per-event failure probabilities `e_seg`, `e_link`, `e_journal`,
`e_program` that apply in the quantum oracle experiment, the union bound
would yield

```text
Pr[false whole receipt within horizon]
  <= min(1, H*m*e_seg + H*(m-1)*e_link + H*e_journal + H*e_program).
```

This expression is a conditional accounting **template**. The proof that its
events cover the exact Composite verifier is **missing**, as are concrete,
applicable upper bounds for every event. A replayed public receipt does not
establish prover knowledge; knowledge and privacy remain separate games.
A model in which hash calls are ideal quantum-oracle queries cannot silently
replace concrete SHA-256/Poseidon2 with that oracle.

For the proposed `H=2^32` **total verification attempts** including rejected,
failed and unpublished ones, the maximum counts are:

| Abstract family | Maximum events | Per-event bits sufficient for *equal-family* allocation of total 1/2 | For total 2^-128 |
| --- | ---: | ---: | ---: |
| Segment acceptance | 2^38 | 41 | 168 |
| Adjacent-state boundary | 63 * 2^32 | 41 | 168 |
| Journal binding | 2^32 | 35 | 162 |
| Program-identity binding | 2^32 | 35 | 162 |

Each group receives at most 1/4 of the target total; the target 1/2
therefore assigns 1/8 to each family. These values are **sufficient
requirements under the stated hypothetical reductions**, not measured
soundness/security bits of RISC Zero. `H` currently is NOT enforced as a
lifetime cap for unsuccessful proof attempts. The model explicitly records
`attempts_limit_enforced_by_network:false` and therefore cannot be used to
claim an actual lifetime guarantee.

This accounting is not interchangeable with the **separate** CMS19/QROM
conditional compiler estimate in `quantitative/budget.mjs`. The latter,
assuming its *different* compiler model applies exactly, yields for the
research scenario an RBR-error exponent of at least 301 and ideal binary-hash
range at least 431 bits under its equal-term allocation. Neither requirement
is met or established for the accepted SDK by the calculator. One must not
double-count a Fiat–Shamir/Merkle failure once within the compiled per-segment
bound and again as a separate component.

## Concrete obstruction and limitations

The existing cross-value SHA-256 binding issue is separate from state-link
hashes, but both require carefully distinguished collision vs second-preimage
games. The new calculator shows that, at `Q=2^128` quantum-oracle queries,
the **generic ideal binary SHA-256 collision upper bound** available here
saturates at 1 even before compositional losses. This **does not provide an
attack on the concrete SDK**, nor prove that such a collision is sufficient
to forge a Composite receipt. It does show that this particular ideal-hash
inequality cannot certify PQ128 for chosen-message state-link collisions.
A 512-bit ideal-hash diagnostic can be numerically small, but moving only
the *financial guest* to SHA-512 does NOT upgrade the internal state chain.

Quantitative gaps to close through source-level proof and review:
- Formalize the exact accepted public claim and a **first-bad-event
  refinement** of Composite validation into segment failures and digest
  binding, including halted/paused conditions and all continuation states.
- Establish round-by-round or state-restoration soundness for the compiled
  IOP (RV32IM taps, lookup, ALI, DEEP, folding 16 and final-degree 256).
  Its current `toy`/`proven` estimators are not that theorem.
- Map the actual stateful Poseidon2 transcript and codec to a proven
  post-quantum Fiat–Shamir compiler, quantify reductions and sampler bias.
- Specify attack games for state-transition hashes, journal and image ID;
  chosen-message collision resistance is **not identical** to fixed-target
  program image integrity or second-preimage resistance.
- Prove adaptive composition and meaningful caps on attempts, oracle calls,
  time, memory and coherent oracle access; do not allocate a fresh `2^128`
  query budget to each segment.

The research output keeps
`demonstrated_whole_receipt_soundness_bound:null`,
`demonstrated_post_quantum_bits:null`, `aegis_target_met:false`, and
`production_ready:false` **even when hypothetical event rates are entered**.
These flags cannot be promoted by selecting convenient synthetic inputs.
An independently reviewed theorem, a new parameterization/build and a
separate consensus activation are required before production approval.

Primary references:
[Chiesa et al., CMS19, quantum Fiat–Shamir](https://eprint.iacr.org/2019/834);
[BGKTTZ23, STARK quantum analysis](https://eprint.iacr.org/2023/1071);
[official RISC Zero security model](https://dev.risczero.com/api/3.0/security-model);
[IETF Fiat–Shamir draft, quantum security and full-instance encoding](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-fiat-shamir).

Reproduce:

```bash
node --test aegis-flow/experiments/pq128/quantitative/*.test.mjs
node aegis-flow/experiments/pq128/quantitative/demo.mjs
```

The second command is a **research report**. It is not a proof verifier.
