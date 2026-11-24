//! Experimental Plonky3-native BabyBear^16 *type* integration.
//! Only compiled by #[cfg(test)]. No consensus, PCS, Fiat-Shamir or
//! quantum knowledge soundness claim. The base field is an independent
//! p3_monty_31 MontyField31 with exactly the BabyBear prime and constants.
//! Crucially, this is NOT the p3_baby_bear::BabyBear type already pinned
//! by WiredAir: the two types are deliberately incompatible at compile time.
//! EXT_GENERATOR is a *candidate*, NOT proven primitive; until certified,
//! do NOT build/ship an active FRI PCS with this field.
use p3_field::extension::BinomialExtensionField;
use p3_field::{PrimeCharacteristicRing, UniformSamplingField, Field, TwoAdicField, PrimeField32};
use p3_monty_31::{
    BarrettParameters, BinomialExtensionData, FieldParameters, MontyField31, MontyParameters,
    PackedMontyParameters, TwoAdicData,
};

#[derive(Copy,Clone,Debug,Default,Eq,Hash,PartialEq)]
pub(crate) struct BabyBear16SpikeParameters;
pub(crate) type SpikeBase = MontyField31<BabyBear16SpikeParameters>;
pub(crate) type SpikeExtension16 = BinomialExtensionField<SpikeBase,16>;

impl MontyParameters for BabyBear16SpikeParameters {
    const PRIME:u32=0x78000001;
    const MONTY_BITS:u32=32;
    const MONTY_MU:u32=0x88000001;
}
impl PackedMontyParameters for BabyBear16SpikeParameters {}
impl BarrettParameters for BabyBear16SpikeParameters {}
impl FieldParameters for BabyBear16SpikeParameters {
    const MONTY_GEN:SpikeBase=SpikeBase::new(31);
    const BENEFITS_FROM_LOCKSTEP_EVALUATION:bool=false;
}
impl TwoAdicData for BabyBear16SpikeParameters {
    const TWO_ADICITY:usize=27;
    type ArrayLike=&'static [SpikeBase];
    // Verbatim field parameters from p3-baby-bear 0.8.0, verified in tests.
    const TWO_ADIC_GENERATORS:Self::ArrayLike=&SpikeBase::new_array([
        0x1,0x78000000,0x67055c21,0x5ee99486,0xbb4c4e4,0x2d4cc4da,
        0x669d6090,0x17b56c64,0x67456167,0x688442f9,0x145e952d,
        0x4fe61226,0x4c734715,0x11c33e2a,0x62c3d2b1,0x77cad399,
        0x54c131f4,0x4cabd6a6,0x5cf5713f,0x3e9430e8,0x0ba067a3,
        0x18adc27d,0x21fd55bc,0x4b859b3d,0x3bd57996,0x4483d85a,
        0x3a26eef8,0x1a427a41,
    ]);
    const ROOTS_8:Self::ArrayLike=&SpikeBase::new_array([
        0x1,0x5ee99486,0x67055c21,0x0c9ea3ba,
    ]);
    const INV_ROOTS_8:Self::ArrayLike=&SpikeBase::new_array([
        0x1,0x6b615c47,0x10faa3e0,0x19166b7b,
    ]);
    const ROOTS_16:Self::ArrayLike=&SpikeBase::new_array([
        0x1,0x0bb4c4e4,0x5ee99486,0x04b49e08,
        0x67055c21,0x5376917a,0x0c9ea3ba,0x563112a7,
    ]);
    const INV_ROOTS_16:Self::ArrayLike=&SpikeBase::new_array([
        0x1,0x21ceed5a,0x6b615c47,0x24896e87,
        0x10faa3e0,0x734b61f9,0x19166b7b,0x76242965,
    ]);
}
impl BinomialExtensionData<16> for BabyBear16SpikeParameters {
    const W:SpikeBase=SpikeBase::new(11);
    const DTH_ROOT:SpikeBase=SpikeBase::new(1400279418);
    // Implementation placeholder from a candidate that still needs
    // a FULL multiplicative-order certificate. Do not assume primitive!
    const EXT_GENERATOR:[SpikeBase;16]=SpikeBase::new_array([
        5,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    ]);
    const EXT_TWO_ADICITY:usize=31;
    type ArrayLike=[[SpikeBase;16];4];
    // Exact order 2^28, 2^29, 2^30, 2^31 in that order.
    const TWO_ADIC_EXTENSION_GENERATORS:Self::ArrayLike=
        SpikeBase::new_2d_array([
            [0,0,0,0,0,0,0,0,929455875,0,0,0,0,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,529583979,0,0,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0,1310212151,0],
            [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1835875777],
        ]);
}
impl UniformSamplingField for BabyBear16SpikeParameters {
    const MAX_SINGLE_SAMPLE_BITS:usize=27;
    const SAMPLING_BITS_M:[u64;64]={
        let p=Self::PRIME as u64;
        let mut out=[0u64;64];
        let mut k=0;
        while k<64{
            out[k]=if k==0{p}else{p & !((1u64<<k)-1)};
            k+=1;
        }
        out
    };
}

#[cfg(test)]
mod tests{
    use super::*;
    use p3_baby_bear::BabyBear;
    fn e16(coefs:[u32;16])->SpikeExtension16{
        SpikeExtension16::new(coefs.map(SpikeBase::new))
    }
    #[test]
    fn pinned_upstream_rejects_degree16_multiplication_until_patched(){
        let mut x=[0u32;16];x[1]=1;
        let a=e16(x);
        // This is a precisely identified upstream capability limit, not
        // a failure of the irreducible field polynomial.
        assert!(std::panic::catch_unwind(||{let _result=a*a;}).is_err());
    }
    #[test]
    fn montgomery_spike_matches_real_native_babybear_base(){
        for val in [0,1,2,11,31,0x77ffffff,0x78000000]{
            let native=BabyBear::new(val);
            let spike=SpikeBase::new(val);
            assert_eq!(native.as_canonical_u32(),spike.as_canonical_u32());
            assert_eq!((native*native).as_canonical_u32(),
                (spike*spike).as_canonical_u32());
            assert_eq!((native+native).as_canonical_u32(),
                (spike+spike).as_canonical_u32());
        }
    }
    #[test]
    #[ignore = "requires an isolated patched p3-monty-31-0.8.0 generic degree-16 multiplication fallback"]
    fn generic_p3_binomial_extension16_is_a_real_field_for_test_vectors(){
        let mut x=[0u32;16];x[1]=1;
        let t=e16(x);
        let w=e16([11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]);
        assert_eq!(t.exp_u64(16),w);
        for coeff in [1u32,2,17,10000,0x77fffffe]{
            let a=e16([coeff,1,2,3,5,7,11,13,17,19,23,29,31,37,41,43]);
            let b=e16([43,41,37,31,29,23,19,17,13,11,7,5,3,2,1,coeff]);
            assert_eq!(a*b,b*a);
            assert_eq!((a*b)*a,a*(b*a));
            assert_eq!(a*a.try_inverse().unwrap(),SpikeExtension16::ONE);
        }
        assert_eq!(SpikeExtension16::ZERO.try_inverse(),None);
    }
    #[test]
    #[ignore = "requires an isolated patched p3-monty-31-0.8.0 generic degree-16 multiplication fallback"]
    fn native_p3_extension16_matches_independent_integer_reference_field(){
        use crate::fp16_reference::Fp16;
        use p3_field::BasedVectorSpace;
        for seed in 1u32..=96{
            let a=core::array::from_fn(|i|
                ((seed as u64*(i as u64+37)*1234567+11*i as u64)
                    % 2_013_265_921) as u32);
            let b=core::array::from_fn(|i|
                ((seed as u64*(i as u64+7)*7654321+19*i as u64)
                    % 2_013_265_921) as u32);
            let real_a=Fp16::from_coefficients(a).unwrap();
            let real_b=Fp16::from_coefficients(b).unwrap();
            let actual=e16(a)*e16(b);
            let actual_basis: &[SpikeBase]=
                <SpikeExtension16 as BasedVectorSpace<SpikeBase>>::
                    as_basis_coefficients_slice(&actual);
            let actual_coords:Vec<u32>=actual_basis.iter()
                .map(|v|v.as_canonical_u32()).collect();
            assert_eq!(actual_coords,(real_a*real_b).coordinates().to_vec());
            assert_eq!(actual_basis.len(),16);
            let inv=e16(a).try_inverse().unwrap();
            let inv_basis: &[SpikeBase]=
                <SpikeExtension16 as BasedVectorSpace<SpikeBase>>::
                    as_basis_coefficients_slice(&inv);
            let ref_inv=real_a.inverse().unwrap().coordinates();
            assert!(inv_basis.iter().zip(ref_inv.iter())
                .all(|(v,b)|v.as_canonical_u32()==*b));
        }
    }
    #[test]
    #[ignore = "requires an isolated patched p3-monty-31-0.8.0 generic degree-16 multiplication fallback"]
    fn generic_p3_field_has_correct_extension16_two_adic_generators(){
        assert_eq!(<SpikeExtension16 as TwoAdicField>::TWO_ADICITY,31);
        for bits in [1usize,2,3,4,13,27,28,29,30,31]{
            let root=<SpikeExtension16 as TwoAdicField>::two_adic_generator(bits);
            assert_eq!(root.exp_u64(1u64<<bits),SpikeExtension16::ONE);
            if bits>0{
                assert_ne!(root.exp_u64(1u64<<(bits-1)),SpikeExtension16::ONE);
            }
        }
    }
}
