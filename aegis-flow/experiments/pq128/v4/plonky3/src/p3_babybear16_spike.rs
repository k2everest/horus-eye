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
    #[ignore = "isolated patched Monty31 D16 experiment; NOT a verified or production PCS"]
    fn native_plonky3_hiding_fri_pcs_field16_commit_open_verify_and_forgery(){
        use p3_challenger::{HashChallenger,SerializingChallenger32,CanObserve};
        use p3_commit::{
            Pcs,ExtensionMmcs,OpeningRequest,CommitmentOpening,
            MatrixOpening,PointOpening,
        };
        use p3_dft::Radix2Bowers;
        use p3_fri::{FriParameters,HidingFriPcs};
        use p3_matrix::dense::RowMajorMatrix;
        use p3_merkle_tree::MerkleTreeHidingMmcs;
        use rand::{SeedableRng,rngs::StdRng};
        type MM=MerkleTreeHidingMmcs<SpikeBase,u64,
            crate::FH,crate::Compress,StdRng,2,8,16>;
        type FMM=ExtensionMmcs<SpikeBase,SpikeExtension16,MM>;
        type PCS=HidingFriPcs<SpikeBase,Radix2Bowers,MM,FMM,StdRng>;
        type CH=SerializingChallenger32<SpikeBase,
            HashChallenger<u8,crate::Sha512Hash,64>>;
        let leaf=crate::Sha512Words(b"AEGIS_PQ128_NATIVE_E16_LEAF_TEST_V1\\0");
        let node=crate::Sha512Words(b"AEGIS_PQ128_NATIVE_E16_NODE_TEST_V1\\0");
        let val_mmcs=MM::new(crate::FH::new(leaf),
            crate::Compress::new(node),3,StdRng::seed_from_u64(7101));
        let fri=FriParameters{
            log_blowup:3,log_final_poly_len:0,max_log_arity:1,
            num_queries:512,batch_proof_of_work_bits:0,
            commit_proof_of_work_bits:0,query_proof_of_work_bits:0,
            mmcs:FMM::new(val_mmcs.clone()),
        };
        let pcs=PCS::new(Radix2Bowers::default(),val_mmcs,fri,16,
            StdRng::seed_from_u64(7102));
        let make_chall=||CH::new(HashChallenger::new(
            b"AEGIS_PQ128_NATIVE_E16_PCS_TEST_V1".to_vec(),
            crate::Sha512Hash(b"AEGIS_PQ128_NATIVE_E16_TRANSCRIPT_TEST_V1\\0")));
        // HidingFriPcs interleaves fresh rows before the inner PCS commit:
        // a trace of N rows is committed on a domain of 2N points. The public
        // domain must describe that actual committed polynomial, not N.
        const TRACE_ROWS:usize=4096;
        const COMMITTED_ROWS:usize=2*TRACE_ROWS;
        let domain=Pcs::<SpikeExtension16,CH>::natural_domain_for_degree(&pcs,COMMITTED_ROWS);
        let witness=RowMajorMatrix::new((0..TRACE_ROWS*2)
            .map(|i|SpikeBase::new((i as u32*37+11)%0x78000001))
            .collect::<Vec<_>>(),2);
        let (commitment,prover_data)=
            Pcs::<SpikeExtension16,CH>::commit(
                &pcs,vec![(domain,witness)]).expect("research commit");
        let mut prover_chall=make_chall();
        prover_chall.observe(commitment.clone());
        let mut point_basis=[0u32;16];point_basis[0]=73;point_basis[1]=5;
        let z=e16(point_basis);
        let (values,proof)=Pcs::<SpikeExtension16,CH>::open(
            &pcs,vec![OpeningRequest{prover_data:&prover_data,
                points:vec![vec![z]]}],&mut prover_chall
        ).expect("research open");
        assert_eq!(values.len(),1);
        assert_eq!(values[0].len(),1);
        assert_eq!(values[0][0][0].len(),2);
        // This is the real E16 PCS proof, not a field arithmetic stand-in:
        // all binary folds of the 2N committed polynomial must be present.
        let expected_rounds=COMMITTED_ROWS.ilog2() as usize;
        assert_eq!(proof.1.commit_phase_commits.len(),expected_rounds);
        assert_eq!(proof.1.commit_phase_openings.len(),expected_rounds);
        assert_eq!(proof.1.final_poly.len(),1);
        let claim=CommitmentOpening{
            commitment:commitment.clone(),
            matrices:vec![MatrixOpening{
                domain,
                points:vec![PointOpening{
                    point:z,values:values[0][0][0].clone(),
                }],
            }],
        };
        let mut verifier_chall=make_chall();
        verifier_chall.observe(commitment.clone());
        Pcs::<SpikeExtension16,CH>::verify(
            &pcs,vec![claim.clone()],&proof,&mut verifier_chall
        ).expect("research verify");
        // Binding sanity check only: changing an authenticated E16
        // evaluation must NOT validate under the same commitment.
        let mut forged=claim.clone();
        forged.matrices[0].points[0].values[0]+=SpikeExtension16::ONE;
        let mut forged_chall=make_chall();
        forged_chall.observe(commitment.clone());
        assert!(Pcs::<SpikeExtension16,CH>::verify(
            &pcs,vec![forged],&proof,&mut forged_chall).is_err());

        // Exercise all 16 extension coordinates of BOTH opened columns.
        // The original proof and root stay fixed; any modified claimed
        // value must be rejected by the actual native PCS verifier.
        for column in 0..2 {
            for limb in 0..16 {
                let mut bad_claim=claim.clone();
                let mut delta=[0u32;16];
                delta[limb]=1;
                bad_claim.matrices[0].points[0].values[column]+=e16(delta);
                let mut bad_chall=make_chall();
                bad_chall.observe(commitment.clone());
                assert!(
                    Pcs::<SpikeExtension16,CH>::verify(
                        &pcs,vec![bad_claim],&proof,&mut bad_chall
                    ).is_err(),
                    "forged extension coordinate {limb} in column {column} accepted"
                );
            }
        }

        // A distinct adversarial path: keep the authenticated claim
        // unchanged but corrupt the final FRI coefficient.
        let mut forged_final=proof.clone();
        forged_final.1.final_poly[0]+=SpikeExtension16::ONE;
        let mut terminal_chall=make_chall();
        terminal_chall.observe(commitment);
        assert!(Pcs::<SpikeExtension16,CH>::verify(
            &pcs,vec![claim],&forged_final,&mut terminal_chall).is_err());
    }
    #[test]
    #[ignore = "requires isolated patched Plonky3 D16 crates; research-only actual WiredAir+LogUp"]
    fn native_e16_wired_logup_batch_stark_prove_verify(){
        use crate::wired_r1cs::{Gate,PublicProgram,WiredAir};
        use p3_batch_stark::{StarkInstance,ProverData,prove_batch,verify_batch};
        use p3_challenger::{HashChallenger,SerializingChallenger32};
        use p3_commit::ExtensionMmcs;
        use p3_dft::Radix2Bowers;
        use p3_fri::{FriParameters,HidingFriPcs};
        use p3_matrix::dense::RowMajorMatrix;
        use p3_merkle_tree::MerkleTreeHidingMmcs;
        use p3_uni_stark::{StarkConfig,StarkGenericConfig};
        use rand::{SeedableRng,rngs::StdRng};

        type MM=MerkleTreeHidingMmcs<SpikeBase,u64,
            crate::FH,crate::Compress,StdRng,2,8,16>;
        type FMM=ExtensionMmcs<SpikeBase,SpikeExtension16,MM>;
        type PCS=HidingFriPcs<SpikeBase,Radix2Bowers,MM,FMM,StdRng>;
        type CH=SerializingChallenger32<SpikeBase,
            HashChallenger<u8,crate::Sha512Hash,64>>;
        type CFG=StarkConfig<PCS,SpikeExtension16,CH>;

        // Test seeds ensure a verifier can independently rebuild the
        // PUBLIC preprocessing commitment. Never use deterministic salts
        // for a deployed private witness/receipt.
        let make_cfg=|seed:u64|->CFG{
            let leaf=crate::Sha512Words(b"AEGIS_PQ128_E16_WIRED_LEAF_TEST_V1\\0");
            let node=crate::Sha512Words(b"AEGIS_PQ128_E16_WIRED_NODE_TEST_V1\\0");
            let mmcs=MM::new(crate::FH::new(leaf),crate::Compress::new(node),
                3,StdRng::seed_from_u64(seed));
            let fri=FriParameters{
                log_blowup:3,log_final_poly_len:0,max_log_arity:1,
                num_queries:512,batch_proof_of_work_bits:0,
                commit_proof_of_work_bits:0,query_proof_of_work_bits:0,
                mmcs:FMM::new(mmcs.clone()),
            };
            let pcs=PCS::new(Radix2Bowers::default(),mmcs,fri,16,
                StdRng::seed_from_u64(seed+1));
            let challenger=CH::new(HashChallenger::new(
                b"AEGIS_PQ128_E16_WIRED_LOGUP_TEST_V1".to_vec(),
                crate::Sha512Hash(b"AEGIS_PQ128_E16_WIRED_TRANSCRIPT_V1\\0")));
            CFG::new(pcs,challenger)
        };

        let air=WiredAir::new(PublicProgram::from_parts(vec![
            Gate{op:1,a:2,b:3,z:4},
            Gate{op:2,a:4,b:0,z:5},
            Gate{op:4,a:5,b:1,z:0},
        ],6));
        // The trusted AIR remains unchanged; its canonical BabyBear
        // values are re-encoded into an isomorphic Monty31 base type.
        let source=air.trace(&[0,1,1,1,1,1]).unwrap();
        let trace=RowMajorMatrix::new(source.values.iter()
            .map(|x|SpikeBase::new(x.as_canonical_u32()))
            .collect::<Vec<_>>(),4);
        let public=air.public_values().iter()
            .map(|x|SpikeBase::new(x.as_canonical_u32()))
            .collect::<Vec<_>>();
        let cfg=make_cfg(8701);
        let prep=make_cfg(8801);
        let instances=[StarkInstance::<CFG,_>{
            air:&air,trace:&trace,public_values:public.clone(),
        }];
        let data=ProverData::from_instances(&prep,&instances)
            .expect("E16 fixed public preprocessing");
        let mut proof=prove_batch(&cfg,&instances,&data)
            .expect("E16 WiredAir+LogUp native proof");
        assert_eq!(proof.degree_bits.len(),1);
        assert_eq!(proof.opening_proof.1.commit_phase_commits.len(),13);
        assert_eq!(proof.opening_proof.1.commit_phase_openings.len(),13);
        assert_eq!(proof.opening_proof.1.final_poly.len(),1);
        let chunks=&proof.opened_values.instances[0]
            .base_opened_values.quotient_chunks;
        assert!(!chunks.is_empty());
        assert!(chunks.iter().all(|chunk|chunk.len()==16),
            "native E16 quotient chunks must expose all 16 coordinates");
        let independent=make_cfg(8801);
        let derived=ProverData::<CFG>::from_airs_and_degrees(
            &independent,&[air.clone()],&proof.degree_bits)
            .expect("independent fixed-program preprocessing");
        verify_batch(&cfg,&[air.clone()],&proof,&[public.clone()],&derived.common)
            .expect("independently verified E16 WiredAir+LogUp");

        // Attack the *actual batch STARK* FRI terminal message. This differs
        // from the isolated PCS forged-claim test above: the verifier must
        // reject a transcript that keeps the committed program and all
        // public inputs intact while changing one terminal coefficient.
        assert!(!proof.opening_proof.1.final_poly.is_empty());
        proof.opening_proof.1.final_poly[0]+=SpikeExtension16::ONE;
        assert!(verify_batch(
            &cfg,&[air.clone()],&proof,&[public.clone()],&derived.common
        ).is_err(),"tampered native E16 WiredAir+LogUp FRI terminal polynomial accepted");
        // BatchProof does not implement Clone in pinned Plonky3 0.8.0.
        // Restore the original coefficient, then reverify the same proof.
        proof.opening_proof.1.final_poly[0]-=SpikeExtension16::ONE;

        // The original proof must remain valid after the adversarial check,
        // excluding accidental test pollution of shared verifier state.
        verify_batch(&cfg,&[air.clone()],&proof,&[public.clone()],&derived.common)
            .expect("original E16 WiredAir+LogUp proof after adversarial check");


        let mut changed_public=public;
        changed_public[0]+=SpikeBase::ONE;
        assert!(verify_batch(
            &cfg,&[air.clone()],&proof,&[changed_public],&derived.common
        ).is_err(),"changed authenticated public program digest was accepted");

        // Stronger program-binding check: the alternative public circuit
        // has the same wire count, gates count, height and a valid witness.
        // A proof for one authenticated instruction table must not verify
        // against independently reconstructed preprocessing of the other.
        let alternate_air=WiredAir::new(PublicProgram::from_parts(vec![
            Gate{op:1,a:2,b:2,z:4},
            Gate{op:2,a:4,b:0,z:5},
            Gate{op:4,a:5,b:1,z:0},
        ],6));
        let alternate_public=alternate_air.public_values().iter()
            .map(|x|SpikeBase::new(x.as_canonical_u32()))
            .collect::<Vec<_>>();
        assert_ne!(alternate_public,public,"distinct programs have same digest");
        let alternate_prep=ProverData::<CFG>::from_airs_and_degrees(
            &make_cfg(8801),&[alternate_air.clone()],&proof.degree_bits
        ).expect("alternate public preprocessing");
        assert!(verify_batch(
            &cfg,&[alternate_air],&proof,&[alternate_public],&alternate_prep.common
        ).is_err(),"proof for one fixed circuit accepted with different program");


        // Adversarial invalid witness: the final asserted wire is zero,
        // contradicting the public program's ASSERT_ONE gate. Either the
        // prover must refuse or the independently verified proof must fail.
        let bad_source=air.trace(&[0,1,1,1,1,0]).unwrap();
        let bad_trace=RowMajorMatrix::new(bad_source.values.iter()
            .map(|x|SpikeBase::new(x.as_canonical_u32()))
            .collect::<Vec<_>>(),4);
        let invalid_public=air.public_values().iter()
            .map(|x|SpikeBase::new(x.as_canonical_u32()))
            .collect::<Vec<_>>();
        let bad_instances=[StarkInstance::<CFG,_>{
            air:&air,trace:&bad_trace,public_values:invalid_public.clone(),
        }];
        let bad_preprocessed=ProverData::from_instances(
            &make_cfg(8801),&bad_instances).unwrap();
        if let Ok(invalid_proof)=prove_batch(&make_cfg(8701),
            &bad_instances,&bad_preprocessed)
        {
            assert!(verify_batch(
                &cfg,&[air],&invalid_proof,&[invalid_public],&derived.common
            ).is_err(),"invalid LogUp / ASSERT_ONE witness verified");
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
