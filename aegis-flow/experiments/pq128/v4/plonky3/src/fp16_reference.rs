//! Isolated, correctness-first arithmetic for F_p[X]/(X^16-11).
//! This code is only compiled under cfg(test). It is NOT a p3-field
//! implementation, not constant time, not side-channel hardened, and
//! not wired into HidingFriPcs, consensus, or financial proving.
//! p = 2013265921; 11 is a quadratic nonresidue (Euler criterion).
#![allow(dead_code)]
use core::ops::{Add, Mul, Sub};

pub(crate) const P: u64 = 2_013_265_921;
const D: usize = 16;
const W: u64 = 11;
const U32_REJECTION_LIMIT: u64 = 2 * P;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Fp16([u32; D]);

impl Fp16 {
    pub(crate) const fn zero() -> Self { Self([0; D]) }
    pub(crate) const fn one() -> Self {
        let mut coords = [0; D]; coords[0] = 1; Self(coords)
    }
    pub(crate) fn from_coefficients(value: [u32; D]) -> Option<Self> {
        value.iter().all(|&v| (v as u64) < P).then_some(Self(value))
    }
    pub(crate) fn coordinates(&self) -> [u32; D] { self.0 }
    pub(crate) fn serialize(&self) -> [u8; 64] {
        let mut out = [0u8; 64];
        for (i, &v) in self.0.iter().enumerate() {
            out[4 * i..4 * i + 4].copy_from_slice(&v.to_le_bytes());
        }
        out
    }
    pub(crate) fn deserialize(src: &[u8]) -> Option<Self> {
        let input: &[u8; 64] = src.try_into().ok()?;
        let mut coords = [0u32; D];
        for i in 0..D {
            coords[i] = u32::from_le_bytes(input[4*i..4*i+4].try_into().ok()?);
        }
        Self::from_coefficients(coords)
    }
    // Conditional uniform sampler: iff the source u32 values are independent
    // uniform 32-bit integers, each accepted coordinate is exactly uniform Fp.
    // Production needs a pinned CSPRNG and rejection-loop bound/DoS policy.
    pub(crate) fn from_uniform_u32_source(
        next: &mut impl FnMut() -> u32, max_draws: usize
    ) -> Option<(Self, usize)> {
        let mut out = [0u32; D];
        let mut draws = 0usize;
        for coord in &mut out {
            loop {
                if draws >= max_draws { return None; }
                let sample = next() as u64;
                draws += 1;
                if sample < U32_REJECTION_LIMIT {
                    *coord = (sample % P) as u32;
                    break;
                }
            }
        }
        Some((Self(out), draws))
    }
    pub(crate) fn pow_u64(self, mut exponent: u64) -> Self {
        let mut base = self;
        let mut result = Self::one();
        while exponent > 0 {
            if exponent & 1 != 0 { result = result * base; }
            base = base * base;
            exponent >>= 1;
        }
        result
    }
    pub(crate) fn pow_limbs(self, exponent: &[u32; 16]) -> Self {
        let mut base = self;
        let mut result = Self::one();
        for &limb in exponent {
            let mut value = limb;
            for _ in 0..32 {
                if value & 1 != 0 { result = result * base; }
                base = base * base;
                value >>= 1;
            }
        }
        result
    }
    pub(crate) fn inverse(self) -> Option<Self> {
        if self == Self::zero() { return None; }
        // Fermat: a^(p^16-2) is the inverse of a in the field.
        Some(self.pow_limbs(&p_pow_16_minus_2()))
    }
}
impl Add for Fp16 {
    type Output = Self;
    fn add(self, rhs: Self) -> Self {
        let mut out = [0u32; D];
        for (i, coord) in out.iter_mut().enumerate() {
            *coord = ((self.0[i] as u64 + rhs.0[i] as u64) % P) as u32;
        }
        Self(out)
    }
}
impl Sub for Fp16 {
    type Output = Self;
    fn sub(self, rhs: Self) -> Self {
        let mut out = [0u32; D];
        for (i, coord) in out.iter_mut().enumerate() {
            *coord = ((self.0[i] as u64 + P - rhs.0[i] as u64) % P) as u32;
        }
        Self(out)
    }
}
impl Mul for Fp16 {
    type Output = Self;
    fn mul(self, rhs: Self) -> Self {
        // Polynomial multiplication followed by T^16 = 11.
        // Modular reduction after EVERY term prevents u64 overflow.
        let mut out = [0u64; D];
        for i in 0..D {
            for j in 0..D {
                let product = (self.0[i] as u64 * rhs.0[j] as u64) % P;
                let idx = i+j;
                let (target, term) = if idx < D {
                    (idx, product)
                } else { (idx-D, product * W % P) };
                out[target] = (out[target] + term) % P;
            }
        }
        Self(out.map(|v| v as u32))
    }
}

fn p_pow_16_minus_2() -> [u32; 16] {
    let mut out = [0u32; 16];
    out[0] = 1;
    for _ in 0..16 {
        let mut carry = 0u64;
        for word in &mut out {
            let n = *word as u64 * P + carry;
            *word = n as u32;
            carry = n >> 32;
        }
        assert_eq!(carry, 0, "p^16 must fit in sixteen 32-bit limbs");
    }
    let mut borrow = 2u64;
    for word in &mut out {
        if borrow == 0 { break; }
        if (*word as u64) >= borrow {
            *word = (*word as u64 - borrow) as u32;
            borrow = 0;
        } else {
            *word = ((1u64 << 32) + *word as u64 - borrow) as u32;
            borrow = 1;
        }
    }
    assert_eq!(borrow, 0);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    fn base_pow(mut a:u64, mut exp:u64)->u64 {
        let mut result=1;
        while exp>0 {
            if exp&1==1 { result=result*a%P; }
            a=a*a%P;
            exp>>=1;
        }
        result
    }
    fn element(seed:u64)->Fp16 {
        let mut state = seed;
        let mut coords=[0u32;16];
        for value in &mut coords {
            // Deterministic TEST DATA ONLY, not a cryptographic RNG.
            state=state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            *value = ((state >> 32) % P) as u32;
        }
        Fp16(coords)
    }
    #[test]
    fn degree_sixteen_modulus_has_irreducibility_certificate(){
        assert_eq!(P-1,15*(1u64<<27));
        assert_eq!(base_pow(11,(P-1)/2),P-1);
        // 11 has maximal 2-adic order in Fp*. A root of x^16=11
        // cannot appear in any proper subextension of F_(p^16).
    }
    #[test]
    fn multiply_reduces_mod_x16_minus_11(){
        let mut x=[0;16]; x[1]=1;
        let generator=Fp16(x);
        assert_eq!(generator.pow_u64(16),Fp16::from_coefficients(
            [11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]).unwrap());
        for i in 1..=64 {
            let a=element(i),b=element(100+i),c=element(200+i);
            assert_eq!(a * b,b * a);
            assert_eq!(a*(b+c),a*b+a*c);
            assert_eq!((a*b)*c,a*(b*c));
            assert_eq!(a*Fp16::one(),a);
            assert_eq!((a-b)+b,a);
        }
    }
    #[test]
    fn independent_bigint_golden_vector_for_modular_reduction(){
        // This vector was generated with an independently written
        // arbitrary-precision integer polynomial multiplier, not Fp16::mul.
        let a=Fp16([123,456,789,101112,131415,161718,192021,222324,
            252627,282930,313233,343536,373839,404142,434445,464748]);
        let b=Fp16(core::array::from_fn(|i|
            (P-100-(i as u64)*333) as u32));
        let expected=Fp16([296647809,939245440,1603211015,196793660,
            933380489,1900614571,1186138975,904128612,
            1155492472,27873624,1648712900,79121527,
            1459806258,1865144241,1396044466,153415923]);
        assert_eq!(a*b,expected);
    }
    #[test]
    fn nonzero_elements_have_unique_multiplicative_inverse(){
        assert_eq!(Fp16::zero().inverse(),None);
        for i in 1..=20 {
            let a=element(i+1000);
            assert_ne!(a,Fp16::zero());
            let inverse=a.inverse().expect("nonzero element must be invertible");
            assert_eq!(a*inverse,Fp16::one());
            assert_eq!(inverse*a,Fp16::one());
        }
    }
    #[test]
    fn canonical_64_byte_encoding_and_invalid_values(){
        for i in 0..40 {
            let a=element(i);
            let bytes=a.serialize();
            assert_eq!(Fp16::deserialize(&bytes),Some(a));
            assert_eq!(a.coordinates().len(),16);
        }
        assert_eq!(Fp16::deserialize(&[0u8;63]),None);
        assert_eq!(Fp16::deserialize(&[0u8;65]),None);
        let mut invalid=[0u8;64];
        invalid[..4].copy_from_slice(&(P as u32).to_le_bytes());
        assert_eq!(Fp16::deserialize(&invalid),None);
        assert_eq!(Fp16::deserialize(&[255u8;64]),None);
    }
    #[test]
    fn rejection_sampling_has_exact_equal_preimage_counts(){
        // [0,2p) is exactly two copies of Fp; each canonical residue
        // has two equally likely 32-bit preimages.
        assert!(2*P <= (u32::MAX as u64)+1);
        assert!(3*P > (u32::MAX as u64)+1);
        for v in [0u64,1,7,P-1] {
            assert!((v as u32 as u64)<2*P);
            assert!(v+P<2*P);
            assert_eq!(v%P,(v+P)%P);
        }
        let mut seq=(0..100).cycle().map(|i|
            if i%7==0 { u32::MAX } else { (i as u64 * 1_993 % (2*P)) as u32 });
        let mut reader=||seq.next().expect("cycle");
        let (a,draws)=Fp16::from_uniform_u32_source(&mut reader,100).unwrap();
        assert!(draws>=16);
        assert!(a.coordinates().iter().all(|&v|v as u64<P));
        let mut always_reject=||u32::MAX;
        assert_eq!(Fp16::from_uniform_u32_source(&mut always_reject,50),None);
    }
}
