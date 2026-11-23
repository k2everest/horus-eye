# QUEER / Aegis V5 — PQ128: engineering specification and audit gates
Date: 2026-11-23. PR #5. **Not a PQ128 proof, release or independent audit.**

## Decision: final field candidate versus final verified field
The intended QROM security game is Q=2^128 GLOBAL quantum oracle queries, a
hypothetical H=2^32 receipts and S<=64 segments; 4 conservative first-bad-event
families imply 2^40 events. The CMS BCS theorem for appropriate round-by-round
sound IOPs has the form O(Q²*eps_RBR + Q³/2^lambda). Its applicability, constants,
loss due to oracle commitments and knowledge/extraction **remain uninstantiated**.

The engineering target is 336 **algebraic** round-by-round soundness bits for
the exact WIREdAIR with LogUp + FRI. The finite RBR budget must not replace the
hash collision term with its 170-bit classical cap. A selected component needs
its independent bound and composition.

Plonky3 v0.8.0 challenge-field alternatives, computed by
`experiments/pq128/v5/field-comparison.mjs`:

| Field | Approx field bits | Approx LogUp bits at 2^23 rows | Native support | Reach 336-bit algebraic target? |
|---|---:|---:|---|---|
| BabyBear^8 | 247.26 | 220.26 | yes | no |
| KoalaBear^8 | 247.9 | 220.9 | yes | no |
| Goldilocks^5 | 320.0 | 293.0 | yes | no |
| Goldilocks^2 | 128.0 | 101.0 | yes | no |
| BabyBear^16 | 494.51 | 467.51 | **no** | only the LogUp subterm |

**Candidate polynomial:** GF(2013265921)[X]/(X^16-31). The proof certificate
in `experiments/pq128/v5/babybear16-reference.mjs` verifies
`p-1=2^27·3·5` and that 31^(p-1)/r !=1 for each r in {2,3,5}. Thus
31 has order p-1. Because p≡1 mod4, the irreducible-binomial criterion
implies X^16-31 is irreducible. This proves existence of a **field**,
not the correctness or security of a Rust implementation. The reference
includes canonical 64-byte little-endian coefficient encoding, multiplication,
inverse via exponentiation and unbiased 32-bit rejection sampling.

**Native integration still required:** implement and independently review
the Plonky3 `BinomialExtensionData<16>` base-field extension operations;
test against a second independent implementation and algebraic identities;
verify its canonical encoding and sampling in the transcript
(`SerializingChallenger32`), its roots of unity/DFT and the
`HidingFriPcs` geometry with 320+ queries and the high-domain constraints.
Evaluate whether a different prime/PCS is cheaper. The value 16 is a candidate
selection, **not** a switched live cryptographic parameter.

## Measured WiredAir RBR and QROM gate
Rust `security-report-wired <trusted_program.bin>` uses Plonky3's
lookup-aware symbolic evaluator to report the exact number of constraints,
max degree, quotient chunks and batching powers, with the p3-security
`proven_security_report` term list. The JSON now contains
`rbr_breakdown.udr.terms` and `rbr_breakdown.ldr.terms` including:
`air-composition`, `deep-ali`, `low-degree-test`,
`logup-fingerprint`, `batch-combination` and the separately
assumed `commitment-collision` cap (170). This is a
**classical interactive RBR estimate** (no QROM theorem).
`experiments/pq128/v5/measured-rbr-gate.mjs` computes a conservative
union-of-terms error bound and explicitly excludes the 170-bit hash cap
from the Q² algebraic budget. CI must archive the actual RBR JSON and
evaluate the six-SHA-512 circuit, not just the three-gate smoke.

**Proof obligations for CMS/BCS/QROM:** identify the precise
public-coin IOP and transcript byte specification; demonstrate round-by-round
soundness of the complete ALI/DEEP-FRI/LogUp IOP with arbitrarily malicious
prover commitments; map every Plonky3 challenge to a BCS QROM oracle query,
include salt and Merkle MMCS and verify the theorem's compiler prerequisites;
derive explicit non-asymptotic constants and loss factors for GLOBAL Q, then
use a single first-bad-event reduction for all receipts. A passing numerical
screen or a literature citation cannot discharge any of these obligations.
`cms-qrom-gate.mjs` is only a necessary-parameter screen.

## Knowledge and privacy require independent games
**Knowledge:** for each accepted financial statement x and proof π, a
knowledge extractor E with appropriate oracle/execution access must recover
a valid common witness w for **the same exact authenticated program**:
spend secret, in/out notes, Merkle path, SHA-512 preimages and positive
53-bit values with exact fee conservation. No separate host-side witness
check is allowed to substitute for verifier-side native proof acceptance.
A `decodeTransferWitness512` from already disclosed full oracles is NOT a
proof extractor. The extraction failure probability must be bounded
under the quantum model or explicitly scoped to a distinct game.

**Privacy/ZK:** provide a simulator for transcript and proof conditional
on the public transaction x, compare simulated and real distributions and
account for all revealing channels, including LogUp permutation columns,
FRI commitments/openings, salts, KEM ciphertexts, network metadata and
repeated nullifiers. Show that two valid witnesses with the same public
statement do not become distinguishable and that two unrelated shielded
payments cannot be linked beyond unavoidable public nullifiers/time/fees.
Private-looking public schemas alone are not an anonymity proof.
The V5 experimental schema is NOT admitted to consensus.

## Independent coin-wide security audit scope
- **Transfer/mint:** double spending and nullifier uniqueness; entire-note
  commitment binding; Merkle canonical position/padding; 53-bit range and
  carry overflow; miner fees and exact base units; reorg rollback.
- **PQC:** NIST FIPS 203 ML-KEM-1024 and FIPS 204 ML-DSA-87 for proposed
  V5 profile; fixed context/suite/network/program id; bad-key and
  algorithm downgrade; recipient KEM implicit rejection;
  domain-separated KDF/AEAD and wallet key life-cycle.
  A Category-5 primitive does NOT make the STARK Category 5 or PQ128.
- **Consensus/network:** supply capped at 20M QUEER; existing
  V3 `supplyTarget` quadratic tightening must be redesigned without
  violating genesis/network consensus; timestamp manipulation, fork choice,
  reorg, selfish mining, P2P eclipse/Sybil/DoS and client diversity.
- **Wallet:** spend/view secret separation, entropy/backup and recovery,
  payments by recipient one-time key, privacy leaks in indexing and scanning,
  RPC authentication, metadata confidentiality, network layer protections.
- **Infrastructure:** reproducible source+binary hashes, no signed release
  based solely on GitHub Actions green, independent external crypto
  review with reproducible attack transcripts, multi-implementation
  interoperability, continuous red-team and rewards.

**Currently identified security defects/risk:** active transfer V2 exposes
`sender_tag`, `pq_public_key`, input commitments and recipient tag
(relinkable) in `libs/crypto-core/transfer-v2.mjs`. Active PoW V3
difficulty scales as the square of remaining supply independently of
observed network hashrate. These are blockers to the intended V5 product
and require separately reviewed consensus changes.

## Commercial release gate
`experiments/pq128/v5/release-readiness.mjs` MUST remain blocked until:
native field/PCS verification; one complete six-SHA512 proof; RBR/QROM
reduction with constants; quantum knowledge and privacy proofs;
ML-DSA/ML-KEM end-to-end audits; secure open mining, wallets and P2P;
signed third-party findings and reproducible binaries. An
`independent_audit_passed:true` flag in an attacker-provided JSON file is
NOT acceptable. There is no automatic path from tests to PQ128=true.

NIST references:
- FIPS 203: https://csrc.nist.gov/pubs/fips/203/final
- FIPS 204: https://csrc.nist.gov/pubs/fips/204/final
Theorem/reference:
- CMS BCS in QROM: https://eprint.iacr.org/2019/834
- Pinned Plonky3 v0.8.0: https://github.com/Plonky3/Plonky3/tree/v0.8.0

No commercial release, no mainnet financial activation, and no claim of
PQ128 security before the verified evidence and independent audit.
