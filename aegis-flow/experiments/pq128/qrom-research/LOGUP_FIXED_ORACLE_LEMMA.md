# LogUp two-challenge event: fixed-oracle lemma for WiredAir

Date 2026-11-23; PR #5; research only. **Not a proof of RBR knowledge, PoK or QROM.**

## Exact implementation references

- Plonky3 0.8.0 lookup/src/logup.rs, lines 158–180: tuple [wire_id, bit] is compressed to beta*wire_id + bit; denominator is alpha - compressed_key.
- lookup/src/logup.rs, lines 410–478: permutation accumulator starts at zero, accumulates fractions, and one terminal sum is constrained to zero across AIR instances.
- batch-stark/src/transcript.rs: main commitment is observed BEFORE the two independent challenges lookup_alpha and lookup_beta. There is no intervening prover message. The pair is treated as **one logical verifier challenge** for this lemma.
- Aegis v4/plonky3/src/wired_r1cs.rs: three gate-side lookup reads per gate, one table row per wire, fixed public multiplicities; bit values Boolean and trusted public program indices.

## Conditional soundness statement

Let G be gate count, W number of wire table entries and
T = 3G + W, with W < p, T < p, p = 2013265921.
Assume that read/table multisets are different, are fixed BEFORE
independent uniform (alpha,beta) in E=GF(p^d), and all keys are
canonical (wire_id,bit), wire_id in [0,W), bit in {0,1}.
No nonzero integer multiplicity difference can disappear mod p,
because its magnitude is at most T < p.

Define the distinct-key coefficient difference d_(i,b) from the
read multiset minus the table multiset. Their rational fingerprint is

    R_(alpha,beta) = SUM_(i,b) d_(i,b)/(alpha - i*beta - b).

The event of denominator zero is conservatively counted as bad.

### Lemma A: exceptionally colliding beta

Compression identifies distinct keys (i,b) and (j,c) only if

    (i-j)*beta = c-b.

If i=j and b!=c the equation has NO solution. If i!=j, it either
forces beta=0 (b=c), or beta=+/-1/delta for one positive integer
1<=delta<=W-1 (b!=c). Since p>W, nonzero delta is invertible.
At most 1+2(W-1)=2W-1 values of beta can cause any collision.
This uses Booleanity and ordered integer wire indices: it is
far tighter than a generic T(T-1)/2 pair collision count.

### Lemma B: exceptionally bad alpha for fixed good beta

For a beta without a key collision, the U<=T nonzero distinct-key
terms have unique simple poles. Their rational sum is nonzero
(otherwise its residue at any pole would be zero, contradicting
d_(i,b)!=0 mod p). Put over the common denominator: its numerator
has degree at most U-1. Hence at most U-1 alpha roots, and
at most U denominator poles. Therefore at most 2U-1 <=2T-1
exceptional alpha values.

By a union bound for the **uniform independent pair**,

    Pr[bad LogUp fingerprint or pole] <=
      [(2W-1) + (2T-1)] / p^d
      = (2W + 2T - 2)/p^d.

This is a conditional, single-pair lemma. It does not assume
the prover can adapt the main trace after the pair. If it can,
the proof does not apply.

### Concrete hypothetical worst-case Aegis sizing

For G=8,000,000 and W=8,388,608, T=32,388,608:

- Numerator: 81,554,430.
- BabyBear^8: approximately 220.97 bits for this subevent.
- BabyBear^16: approximately 468.23 bits for this subevent.
- The prior generic T^2 pair bound loses about 22.62 bits more.

The tighter estimate is not a replacement for the p3-security
permutation/LogUp round-by-round security report, whose N*(W+2)/|E|
uses protocol-level hypotheses. Both belong to interactive analysis,
not an instantiated quantum reduction.

## Link to the proposed CMS round state

The real transcript draws lookup_alpha then lookup_beta with no
intervening prover message. For the **logical atomic pair**:

    C_0 = fixed main trace, trusted public preprocessing;
    B_logup(C_0,alpha,beta) = [collision or pole or R=0],
    K_logup(C_0) = [EXTRACTABLE, globally consistent financial witness].

The proposed state function may change from zero to one only
**after lookup_beta** for this paired event. It cannot claim that
a beta-dependent event occurs after lookup_alpha alone.
This is enforced by the abstract-cms-state.mjs logical-round
completion set; all physical transcript events remain enumerated.

Caution: the detailed LogUp argument is a permutation accumulator
trace committed AFTER alpha/beta. Therefore the proof that a
malicious prover cannot fake its terminal against the fixed main
trace depends on the separate ALI/DEEP/FRI soundness and extraction
of the permutation trace. A rational sum calculation alone is
NOT terminal covering and NOT a proof of RBR knowledge.

To establish CMS knowledge soundness, still prove:
1. full committed trace and permutation oracle extraction against
   malicious provers, with the correct quantum VC property;
2. the transcript's literal challenges match the mathematical
   uniform independent sampling hypotheses;
3. no missing bad events in the accumulator, quotient, FRI fold,
   batch challenge, or Merkle queries;
4. efficient extraction of the **same** six-SHA512 financial witness;
5. finite constants and global QROM composition.

### Reproduce

    node --test aegis-flow/experiments/pq128/qrom-research/*.test.mjs

The exhaustive small-prime tests enumerate every (alpha,beta) pair.
They establish test coverage of the algebraic expression, NOT a
quantum theorem or a proof for the production field.

Status: terminal_covering_proved=false;
round_by_round_knowledge_proved=false;
qrom_proved=false;
pq128_demonstrated=false;
production_ready=false.
