//! Aegis V4 isolated Plonky3 proof verifier smoke. Real FRI proof,
//! not an SHA-512 financial note, membership or ownership AIR.
//! 16-bit amount arithmetic and full-width public claim binding only.
//! NON-ZK; no PQ128 qualification or consensus activation.
mod financial;
use std::{fs,panic::{catch_unwind,AssertUnwindSafe},path::Path};
use base64::{engine::general_purpose::STANDARD as B64,Engine};
use p3_air::{Air,AirBuilder,BaseAir,WindowAccess};
use p3_air::symbolic::AirLayout;
use p3_baby_bear::BabyBear;
use p3_challenger::{HashChallenger,SerializingChallenger32};
use p3_commit::{ExtensionMmcs,Pcs as PolynomialCommitmentScheme};
use p3_dft::Radix2Bowers;
use p3_field::{extension::BinomialExtensionField,PrimeCharacteristicRing};
use p3_fri::{FriParameters,HidingFriPcs};
use p3_security::fri::FriRegime;
use p3_matrix::{dense::RowMajorMatrix,Matrix};
use p3_merkle_tree::MerkleTreeHidingMmcs;
use p3_symmetric::{CompressionFunctionFromHasher,CryptographicHasher,SerializingHasher};
use p3_uni_stark::{prove,verify,Proof,StarkConfig,StarkSecurityParams,StarkGenericConfig,OpeningShape,GrindingSites,ProvenSecurity,ConjecturedSecurity};
use serde::{Deserialize,Serialize};
use rand::{SeedableRng,rngs::{StdRng,SysRng}};
use sha2::{Digest,Sha512};

const SCHEME:&str="AEGIS_V4_P3_HIDING_EXT8_LAB_V1";
const MAX_PROOF:usize=8*1024*1024;
// Research profile: not a PQ128 certification. Budget is verified for one or
// more OOD openings before the proof is constructed. The verifier fixes every
// parameter; nothing is supplied by the untrusted proof.
const ROWS:usize=4096;
const LOG_BLOWUP:usize=3;
const QUERIES:usize=320;
const EXT_DIM:usize=8;
const RANDOM_CODEWORDS:usize=8;
const SALT_ELEMS:usize=8;
const MAX_OPENING_POINTS:usize=8;
// SHA-512 assumed ideal 170-bit chosen-collision resistance is an *input* to
// the classical p3-security estimator, NOT a concrete quantum proof.
const IDEAL_HASH_COLLISION_BITS:usize=170;
const EXTENSION_FIELD_FLOOR_BITS:usize=247;
const WORDS:usize=32;
const AMOUNTS:usize=9;
const BITS:usize=16;
const WIDTH:usize=WORDS+AMOUNTS+AMOUNTS*BITS;
type F=BabyBear;
type E=BinomialExtensionField<F,8>;

#[derive(Clone,Copy,Debug)]
struct Sha512Hash(&'static [u8]);
impl CryptographicHasher<u8,[u8;64]> for Sha512Hash {
    fn hash_iter<I>(&self,input:I)->[u8;64] where I:IntoIterator<Item=u8>{
        let mut h=Sha512::new();
        h.update(self.0);
        for b in input {h.update([b]);}
        h.finalize().into()
    }
    fn hash_iter_slices<'a,I>(&self,input:I)->[u8;64] where I:IntoIterator<Item=&'a [u8]>{
        let mut h=Sha512::new();
        h.update(self.0);
        for part in input {h.update(part);}
        h.finalize().into()
    }
}
// The SHA-512 digest is represented as 8 canonical little-endian u64 words.
// This preserves all 512 bits while remaining serializable in the PCS proof.
#[derive(Clone,Copy,Debug)]
struct Sha512Words(&'static [u8]);
impl CryptographicHasher<u64,[u64;8]> for Sha512Words {
    fn hash_iter<I>(&self,input:I)->[u64;8] where I:IntoIterator<Item=u64>{
        let mut h=Sha512::new();
        h.update(self.0);
        for word in input {h.update(word.to_le_bytes());}
        let digest:[u8;64]=h.finalize().into();
        std::array::from_fn(|i|u64::from_le_bytes(digest[i*8..i*8+8].try_into().unwrap()))
    }
    fn hash_iter_slices<'a,I>(&self,input:I)->[u64;8] where I:IntoIterator<Item=&'a [u64]>{
        let mut h=Sha512::new();
        h.update(self.0);
        for words in input {for word in words {h.update(word.to_le_bytes());}}
        let digest:[u8;64]=h.finalize().into();
        std::array::from_fn(|i|u64::from_le_bytes(digest[i*8..i*8+8].try_into().unwrap()))
    }
}
type FH=SerializingHasher<Sha512Words>;
type Compress=CompressionFunctionFromHasher<Sha512Words,2,8>;
type Mmcs=MerkleTreeHidingMmcs<F,u64,FH,Compress,StdRng,2,8,SALT_ELEMS>;
type EMmcs=ExtensionMmcs<F,E,Mmcs>;
type Chall=SerializingChallenger32<F,HashChallenger<u8,Sha512Hash,64>>;
type Pcs=HidingFriPcs<F,Radix2Bowers,Mmcs,EMmcs,StdRng>;
type Config=StarkConfig<Pcs,E,Chall>;

fn config()->Config{
    // HidingFriPcs upstream requires N >= 2*(queries + DIMENSION*points)
    // AND both MMCS instances must be hiding; mere HidingFriPcs wrapping is
    // insufficient. Salt entropy uses 8 independent BabyBear elements.
    assert!(ROWS >= 2*(QUERIES+EXT_DIM*MAX_OPENING_POINTS));
    assert!(RANDOM_CODEWORDS >= EXT_DIM);
    assert!(SALT_ELEMS >= 5);
    let leaf=Sha512Words(b"AEGIS_V4_P3_LEAF_SHA512_V2\0");
    let node=Sha512Words(b"AEGIS_V4_P3_NODE_SHA512_V2\0");
    let chal_hash=Sha512Hash(b"AEGIS_V4_P3_TRANSCRIPT_SHA512_V2\0");
    let val_mmcs=Mmcs::new(FH::new(leaf),Compress::new(node),3,StdRng::try_from_rng(&mut SysRng).expect("cryptographically secure OS RNG required"));
    let fri=FriParameters{
        log_blowup:LOG_BLOWUP,
        log_final_poly_len:0,
        max_log_arity:1,
        num_queries:QUERIES,
        batch_proof_of_work_bits:0,
        commit_proof_of_work_bits:0,
        query_proof_of_work_bits:0,
        mmcs:EMmcs::new(val_mmcs.clone()),
    };
    let pcs=Pcs::new(Radix2Bowers::default(),val_mmcs,fri,
        RANDOM_CODEWORDS,StdRng::try_from_rng(&mut SysRng).expect("cryptographically secure OS RNG required"));
    let challenger=Chall::new(HashChallenger::new(
        b"AEGIS_V4_P3_HIDING_EXT8_LAB_V1".to_vec(),chal_hash));
    Config::new(pcs,challenger)
}

#[derive(Clone,Debug,Serialize,Deserialize,PartialEq,Eq)]
#[serde(deny_unknown_fields)]
struct Claim{
    network_id:String,program_id:String,index:usize,segment_count:usize,
    pre_state:String,post_state:String,journal_digest:Option<String>,
}
fn digest64(s:&str)->bool{
    s.len()==128&&s.as_bytes().iter().all(|c|c.is_ascii_digit()||(b'a'..=b'f').contains(c))
}
impl Claim{
    fn valid(&self)->bool{
        let id=self.network_id.as_bytes();
        !id.is_empty()&&id.len()<=64&&id.iter().all(|c|c.is_ascii_alphanumeric()||*c==b'_'||*c==b'-')&&
        (1..=64).contains(&self.segment_count)&&self.index<self.segment_count&&
        digest64(&self.program_id)&&digest64(&self.pre_state)&&digest64(&self.post_state)&&
        self.journal_digest.as_ref().is_none_or(|s|digest64(s))&&
        ((self.index+1==self.segment_count)==self.journal_digest.is_some())
    }
}
fn claim_words(claim:&Claim)->Result<[u16;WORDS],()>{
    if !claim.valid(){return Err(());}
    let bytes=serde_json::to_vec(claim).map_err(|_|())?;
    let mut h=Sha512::new();
    h.update(b"AEGIS_V4_P3_PUBLIC_CLAIM_V1\0");
    h.update((bytes.len() as u32).to_be_bytes());
    h.update(bytes);
    let digest:[u8;64]=h.finalize().into();
    Ok(std::array::from_fn(|i|u16::from_be_bytes([digest[2*i],digest[2*i+1]])))
}
#[derive(Clone)]
struct BalanceAir{claim:[u16;WORDS]}
impl<T> BaseAir<T> for BalanceAir{
    fn width(&self)->usize{WIDTH}
    fn main_next_row_columns(&self)->Vec<usize>{vec![]}
}
impl<AB:AirBuilder> Air<AB> for BalanceAir{
    fn eval(&self,builder:&mut AB){
        let main=builder.main();
        // Plonky3 0.8.0 exposes a two-row AIR window, not a trace Matrix.
        let local=main.current_slice();
        for (i,value) in self.claim.iter().enumerate(){
            builder.assert_eq(local[i],AB::Expr::from_u16(*value));
        }
        for i in 0..AMOUNTS{
            let mut reconstruct=AB::Expr::ZERO;
            for j in 0..BITS{
                let bit:AB::Expr=local[WORDS+AMOUNTS+i*BITS+j].into();
                builder.assert_zero(bit.clone()*(bit.clone()-AB::Expr::ONE));
                reconstruct+=bit*AB::Expr::from_u32(1u32<<j);
            }
            builder.assert_eq(local[WORDS+i],reconstruct);
        }
        let mut input=AB::Expr::ZERO;
        for i in 0..4 {input+=local[WORDS+i];}
        let mut output=AB::Expr::ZERO;
        for i in 4..AMOUNTS {output+=local[WORDS+i];}
        // All values <=65535; no BabyBear modular wrap is possible.
        builder.assert_eq(input,output);
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProveInput{claim:Claim,amounts:[u16;AMOUNTS]}
#[derive(Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
struct Bundle{scheme:String,claim:Claim,proof:String}
#[derive(Serialize)]
struct Verdict{
    valid:bool,
    #[serde(skip_serializing_if="Option::is_none")]
    authenticated:Option<Claim>,
    engine:&'static str,
    aegis_target_met:bool,
    production_ready:bool,
}
fn make_trace(words:[u16;WORDS],amounts:[u16;AMOUNTS])->RowMajorMatrix<F>{
    let mut row=Vec::with_capacity(WIDTH);
    for w in words{row.push(F::from_u16(w));}
    for v in amounts{row.push(F::from_u16(v));}
    for v in amounts{for j in 0..BITS{row.push(F::from_u16((v>>j)&1));}}
    assert_eq!(row.len(),WIDTH);
    let mut values=Vec::with_capacity(ROWS*WIDTH);
    for _ in 0..ROWS{values.extend_from_slice(&row);}
    RowMajorMatrix::new(values,WIDTH)
}
fn generate(input:ProveInput,path:&Path)->Result<(),()>{
    let words=claim_words(&input.claim)?;
    if input.amounts[..4].iter().map(|n|u64::from(*n)).sum::<u64>()!=
        input.amounts[4..].iter().map(|n|u64::from(*n)).sum::<u64>(){return Err(());}
    let air=BalanceAir{claim:words};
    let proof=prove(&config(),&air,make_trace(words,input.amounts),&[]).map_err(|_|())?;
    let bytes=postcard::to_allocvec(&proof).map_err(|_|())?;
    if bytes.is_empty()||bytes.len()>MAX_PROOF{return Err(());}
    let bundle=Bundle{scheme:SCHEME.to_owned(),claim:input.claim,proof:B64.encode(bytes)};
    fs::write(path,serde_json::to_vec(&bundle).map_err(|_|())?).map_err(|_|())
}
fn check(bundle:&[u8],expected:&[u8])->Result<Claim,()>{
    if bundle.len()>11_200_000||expected.len()>4096{return Err(());}
    let b:Bundle=serde_json::from_slice(bundle).map_err(|_|())?;
    let e:Claim=serde_json::from_slice(expected).map_err(|_|())?;
    if b.scheme!=SCHEME||b.claim!=e||!e.valid(){return Err(());}
    let bytes=B64.decode(&b.proof).map_err(|_|())?;
    if bytes.is_empty()||bytes.len()>MAX_PROOF||B64.encode(&bytes)!=b.proof{return Err(());}
    let proof:Proof<Config>=postcard::from_bytes(&bytes).map_err(|_|())?;
    let air=BalanceAir{claim:claim_words(&e)?};
    if !catch_unwind(AssertUnwindSafe(||verify(&config(),&air,&proof,&[]).is_ok())).unwrap_or(false){
        return Err(());
    }
    Ok(e)
}
// Reproduce the *classical round-by-round* p3-security terms using the exact
// AIR and configuration; there is NO quantum Fiat-Shamir/QROM compiler theorem
// or full financial-statement relation here. Do not promote this number.
fn parameter_report()->serde_json::Value{
    let params=FriRegime{
        log_blowup:LOG_BLOWUP,log_final_poly_len:0,max_log_arity:1,
        num_queries:QUERIES,commit_pow_bits:0,query_pow_bits:0,
    };
    let config=config();
    let air=BalanceAir{claim:[0;WORDS]};
    let layout=AirLayout{main_width:WIDTH,..Default::default()};
    let trace_domain=<Pcs as PolynomialCommitmentScheme<E,Chall>>::natural_domain_for_degree(config.pcs(),ROWS*2);
    let security=StarkSecurityParams::from_air::<F,E,_>(
        params,&air,layout,trace_domain,
        EXTENSION_FIELD_FLOOR_BITS,IDEAL_HASH_COLLISION_BITS,1,
        OpeningShape::hiding(RANDOM_CODEWORDS),GrindingSites::NONE);
    let measured=ProvenSecurity::compute_from_proof(ROWS.ilog2() as usize+1,&security);
    let conjectured=ConjecturedSecurity::compute_from_params(&security,ROWS.ilog2() as usize+1);
    serde_json::json!({
        "schema":"AEGIS_V4_PLONKY3_RBR_LAB_REPORT_V1",
        "sdk":"Plonky3 0.8.0",
        "air":"balance-16bit-smoke-only",
        "trace_rows":ROWS,"log_blowup":LOG_BLOWUP,
        "fri_queries":QUERIES,"challenge_extension_degree":EXT_DIM,
        "field_cardinality_floor_bits":EXTENSION_FIELD_FLOOR_BITS,
        "ideal_sha512_collision_bits_assumed":IDEAL_HASH_COLLISION_BITS,
        "random_codewords":RANDOM_CODEWORDS,"salt_elements":SALT_ELEMS,
        "max_opening_points_budget":MAX_OPENING_POINTS,
        "air_constraints_derived":security.num_constraints,
        "air_constraint_degree_derived":security.air_max_constraint_degree,
        "batch_openings_derived":security.num_batched_functions,
        "quotient_chunks_derived":security.num_quotient_chunks,
        "rbr_unique_decoding_bits":measured.unique_decoding_bits,
        "rbr_list_decoding_bits":measured.list_decoding_bits,
        "rbr_best_bits":measured.security_bits(),
        "conjectured_bits":conjectured.security_bits,
        "hash_model_assumptions_proved":false,
        "quantum_fiat_shamir_qrom_proved":false,
        "financial_air_complete":false,"soundness_composition_proved":false,
        "knowledge_demonstrated":false,"privacy_full_receipt_demonstrated":false,
        "demonstrated_post_quantum_bits":null,
        "aegis_target_met":false,"production_ready":false
    })
}

fn main(){
    let args:Vec<String>=std::env::args().collect();
    if args.len()==4&&args[1]=="prove-financial-balance"{
        let ok=fs::read(&args[2]).ok().filter(|b|b.len()<=262144)
            .and_then(|b|catch_unwind(AssertUnwindSafe(||financial::prove_financial(&b,Path::new(&args[3])))).ok())
            .is_some_and(|r|r.is_ok());
        if !ok{eprintln!("FINANCIAL53_PROOF_GENERATION_FAILED");std::process::exit(1);}
        return;
    }
    if args.len()==4&&args[1]=="verify-financial-balance"{
        let result=fs::read(&args[2]).ok().and_then(|proof|fs::read(&args[3]).ok()
            .map(|public|financial::verify_financial(&proof,&public)));
        let status=result.unwrap_or_else(||financial::verify_financial(b"",b""));
        println!("{}",serde_json::to_string(&status).unwrap());
        return;
    }
    if args.len()==2&&args[1]=="security-report"{
        println!("{}",parameter_report());
        return;
    }
    if args.len()!=4||!matches!(args[1].as_str(),"prove"|"verify"){
        eprintln!("usage: v4-p3-lab <prove|verify> <input> <output-or-expected> | security-report");
        std::process::exit(2);
    }
    if args[1]=="prove"{
        let ok=fs::read(&args[2]).ok().filter(|b|b.len()<=4096)
            .and_then(|b|serde_json::from_slice::<ProveInput>(&b).ok())
            .and_then(|v|catch_unwind(AssertUnwindSafe(||generate(v,Path::new(&args[3])))).ok())
            .is_some_and(|result|result.is_ok());
        if !ok{eprintln!("PROOF_GENERATION_FAILED");std::process::exit(1);}
        return;
    }
    let result=fs::read(&args[2]).ok().and_then(|bundle|fs::read(&args[3]).ok()
        .and_then(|expected|check(&bundle,&expected).ok()));
    let status=Verdict{valid:result.is_some(),authenticated:result,
        engine:"PLONKY3-0.8.0-HIDING-EXT8-LAB",aegis_target_met:false,production_ready:false};
    println!("{}",serde_json::to_string(&status).unwrap());
}
#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn hash_binds_claim_fields(){
        let claim=Claim{network_id:"v4-lab".into(),program_id:"ab".repeat(64),
            index:0,segment_count:1,pre_state:"11".repeat(64),
            post_state:"22".repeat(64),journal_digest:Some("33".repeat(64))};
        assert!(claim.valid());
        assert_ne!(claim_words(&claim).unwrap(),claim_words(&Claim{post_state:"44".repeat(64),..claim.clone()}).unwrap());
        assert!(!Claim{program_id:"ab".repeat(32),..claim}.valid());
    }
    #[test]
    fn trace_shape(){
        assert!(ROWS >= 2*(QUERIES+EXT_DIM*MAX_OPENING_POINTS));
        assert!(SALT_ELEMS*30 >= 128);
        let m=make_trace([1;WORDS],[0;AMOUNTS]);
        assert_eq!(m.width(),WIDTH);
        assert_eq!(m.height(),ROWS);
    }
}
