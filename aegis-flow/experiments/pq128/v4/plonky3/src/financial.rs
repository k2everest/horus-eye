//! Native V4 partial financial AIR: 53-bit values/fee and exact integer conservation.
//! SHA-512 ownership, note commitments, nullifiers and Merkle membership are
//! checked by the host ONLY, using aegis-financial512-guest. They are NOT
//! arithmetized here: a valid STARK does NOT prove the financial relation.
//! No consensus activation or PQ128 claim is possible from this module.
use std::{fs,path::Path,panic::{catch_unwind,AssertUnwindSafe}};
use base64::{engine::general_purpose::STANDARD as B64,Engine};
use p3_air::{Air,AirBuilder,BaseAir,WindowAccess};
use p3_field::{Field,PrimeCharacteristicRing};
use p3_matrix::dense::RowMajorMatrix;
use p3_uni_stark::{prove,verify,Proof};
use serde::{Deserialize,Serialize};
use serde_json::Value;
use sha2::{Digest,Sha512};
use crate::{F,Config,config,ROWS,MAX_PROOF,WORDS};

const SCHEME:&str="AEGIS_V4_P3_FINANCIAL_AMOUNT53_PARTIAL_V1";
const MAX_VALUE:u64=(1u64<<53)-1;
const NOTE_COUNT:usize=9;
const VALUE_BITS:usize=53;
const LIMBS:usize=4;
const CARRY_BITS:usize=3;
const NONZERO_WITNESSES:usize=8;
const CARRY_ROWS:usize=3;
const PUBLIC_DIGEST_END:usize=WORDS;
const VALUES_START:usize=PUBLIC_DIGEST_END;
const NONZERO_START:usize=VALUES_START+NOTE_COUNT*VALUE_BITS;
const CARRY_START:usize=NONZERO_START+NONZERO_WITNESSES;
const WIDTH:usize=CARRY_START+2*CARRY_ROWS*CARRY_BITS;
const SUITE:&[u8]=b"AEGIS-EXPERIMENT-SHA512-MLDSA87-V1";
const PREFIX:&[u8]=b"AEGIS_BINDING_FRAME_V1\0";

#[derive(Clone,Debug,Deserialize,Serialize,PartialEq,Eq)]
#[serde(deny_unknown_fields)]
struct Statement{
    version:String,network_id:String,asset_id:String,
    anchor_root:String,anchor_leaf_count:u32,
    input_commitments:Vec<String>,output_commitments:Vec<String>,
    nullifiers:Vec<String>,fee:String,transaction_binding:String,
}
fn decimal(value:&str,allow_zero:bool)->Result<u64,()>{
    if value.is_empty()||value.len()>16||value.starts_with('0')&&value!="0"||
        !value.bytes().all(|b|b.is_ascii_digit()){return Err(());}
    let n=value.parse::<u64>().map_err(|_|())?;
    if n>MAX_VALUE||(!allow_zero&&n==0){return Err(());}
    Ok(n)
}
fn hex64(v:&str)->bool{
    v.len()==128&&v.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b))
}
impl Statement{
    fn valid(&self)->bool{
        self.version=="AEGIS_EXPERIMENT_RELATION512_V1"&&self.asset_id=="QUEER"&&
        !self.network_id.is_empty()&&self.network_id.len()<=64&&
        self.network_id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'_'||b==b'-')&&
        (1..=65536).contains(&self.anchor_leaf_count)&&hex64(&self.anchor_root)&&
        hex64(&self.transaction_binding)&&decimal(&self.fee,true).is_ok()&&
        (1..=4).contains(&self.input_commitments.len())&&
        (1..=4).contains(&self.output_commitments.len())&&
        self.nullifiers.len()==self.input_commitments.len()&&
        self.input_commitments.iter().chain(self.output_commitments.iter())
          .chain(self.nullifiers.iter()).all(|v|hex64(v))
    }
}
fn binding(statement:&Statement)->Result<[u16;WORDS],()>{
    if !statement.valid(){return Err(());}
    let body=serde_json::to_vec(statement).map_err(|_|())?;
    let mut h=Sha512::new();
    h.update(PREFIX);
    h.update((SUITE.len() as u32).to_be_bytes());h.update(SUITE);
    let domain=b"FINANCIAL_STATEMENT";
    h.update((domain.len() as u32).to_be_bytes());h.update(domain);
    h.update(1u32.to_be_bytes());h.update((body.len() as u32).to_be_bytes());
    h.update(body);
    let digest:[u8;64]=h.finalize().into();
    Ok(std::array::from_fn(|i|u16::from_be_bytes([digest[2*i],digest[2*i+1]])))
}

#[derive(Clone)]
struct FinancialAmountAir{
    expected_digest:[u16;WORDS],
    fee:u64,inputs:usize,outputs:usize,
}
impl<T> BaseAir<T> for FinancialAmountAir{
    fn width(&self)->usize{WIDTH}
    fn main_next_row_columns(&self)->Vec<usize>{vec![]}
}
impl<AB:AirBuilder> Air<AB> for FinancialAmountAir{
    fn eval(&self,builder:&mut AB){
        let window=builder.main();
        let local=window.current_slice();
        for i in 0..WORDS{
            builder.assert_eq(local[i],AB::Expr::from_u16(self.expected_digest[i]));
        }
        // Reconstruct 9 53-bit private values from individually constrained
        // Boolean bits. Slots not used by the authenticated public statement
        // MUST be exactly zero; active input/output slots MUST be positive.
        let mut limbs:[Vec<AB::Expr>;NOTE_COUNT]=std::array::from_fn(|_|Vec::with_capacity(LIMBS));
        for i in 0..NOTE_COUNT{
            let mut bit_sum=AB::Expr::ZERO;
            for j in 0..LIMBS{
                let mut limb=AB::Expr::ZERO;
                for k in 0..16{
                    let bit_index=j*16+k;
                    if bit_index>=VALUE_BITS{break;}
                    let bit:AB::Expr=local[VALUES_START+i*VALUE_BITS+bit_index].into();
                    builder.assert_zero(bit.clone()*(bit.clone()-AB::Expr::ONE));
                    bit_sum+=bit.clone();
                    limb+=bit*AB::Expr::from_u32(1u32<<k);
                }
                limbs[i].push(limb);
            }
            if i==8{
                for k in 0..VALUE_BITS {
                    let required=AB::Expr::from_u32((self.fee>>k&1) as u32);
                    builder.assert_eq(local[VALUES_START+i*VALUE_BITS+k],required);
                }
            }else{
                let active=if i<4{i<self.inputs}else{i-4<self.outputs};
                if active{
                    let inverse:AB::Expr=local[NONZERO_START+i].into();
                    builder.assert_eq(bit_sum*inverse,AB::Expr::ONE);
                }else{
                    builder.assert_eq(bit_sum,AB::Expr::ZERO);
                    builder.assert_eq(local[NONZERO_START+i],AB::Expr::ZERO);
                }
            }
        }
        // Each carry is 0..7 (three constrained bits). All intermediate
        // per-limb sums fit within 7*65536 << BabyBear prime, so these
        // equalities cannot be satisfied via field-modulus wraparound.
        let mut ci=AB::Expr::ZERO;
        let mut co=AB::Expr::ZERO;
        for j in 0..LIMBS{
            let mut ins=ci.clone();
            let mut outs=co.clone()+limbs[8][j].clone();
            for i in 0..4{
                ins+=limbs[i][j].clone();outs+=limbs[4+i][j].clone();
            }
            let (ci_next,co_next)=if j<CARRY_ROWS{
                let carry=|side:usize|{
                    let mut acc=AB::Expr::ZERO;
                    for k in 0..CARRY_BITS{
                        let value:AB::Expr=local[CARRY_START+side*CARRY_ROWS*CARRY_BITS+
                            j*CARRY_BITS+k].into();
                        builder.assert_zero(value.clone()*(value.clone()-AB::Expr::ONE));
                        acc+=value*AB::Expr::from_u32(1u32<<k);
                    }
                    acc
                };
                (carry(0),carry(1))
            }else{(AB::Expr::ZERO,AB::Expr::ZERO)};
            builder.assert_eq(ins-outs,
                (ci_next.clone()-co_next.clone())*AB::Expr::from_u32(65536));
            ci=ci_next;co=co_next;
        }
    }
}
fn trace(air:&FinancialAmountAir,amounts:[u64;NOTE_COUNT])->RowMajorMatrix<F>{
    let mut row=Vec::with_capacity(WIDTH);
    for x in air.expected_digest{row.push(F::from_u16(x));}
    for amount in amounts {
        for i in 0..VALUE_BITS{row.push(F::from_u64(amount>>i&1));}
    }
    for (i,amount) in amounts[..8].iter().enumerate(){
        let active=if i<4{i<air.inputs}else{i-4<air.outputs};
        if active{
            let bits=amount.count_ones();
            row.push(F::from_u32(bits).inverse());
        }else{row.push(F::ZERO);}
    }
    let mut ins_carries=[0u64;CARRY_ROWS],outs_carries=[0u64;CARRY_ROWS];
    let mut ci=0u64;let mut co=0u64;
    for j in 0..CARRY_ROWS{
        let ins=ci+(0..4).map(|i|amounts[i]>>(16*j)&65535).sum::<u64>();
        let outs=co+(4..9).map(|i|amounts[i]>>(16*j)&65535).sum::<u64>();
        ci=ins>>16;co=outs>>16;
        ins_carries[j]=ci;outs_carries[j]=co;
        debug_assert!(ci<8&&co<8);
    }
    for side in [ins_carries,outs_carries]{
        for v in side{for i in 0..CARRY_BITS{row.push(F::from_u64(v>>i&1));}}
    }
    assert_eq!(row.len(),WIDTH);
    let mut data=Vec::with_capacity(WIDTH*ROWS);
    for _ in 0..ROWS{data.extend_from_slice(&row);}
    RowMajorMatrix::new(data,WIDTH)
}
#[derive(Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
struct ProofBundle{scheme:String,statement:Statement,proof:String}
#[derive(Serialize)]
pub(crate) struct Verdict{
    valid:bool,amount_conservation_proved:bool,financial_relation_proved:bool,
    sha512_preimages_arithmetized:bool,knowledge_demonstrated:bool,
    aegis_target_met:bool,production_ready:bool,
}
pub(crate) fn prove_financial(input:&[u8],output:&Path)->Result<(),()>{
    if input.len()>262144{return Err(());}
    // IMPORTANT: this full financial check is LOCAL TO THE PROVER.
    // It does not generate SHA512 AIR constraints or make the prover
    // an authority for hashes, secrets, nullifiers or Merkle openings.
    let st_json=aegis_financial512_guest::verify_witness_json(input).map_err(|_|())?;
    let st:Statement=serde_json::from_slice(&st_json).map_err(|_|())?;
    let v:Value=serde_json::from_slice(input).map_err(|_|())?;
    let arr=v.get("inputs").and_then(Value::as_array).ok_or(())?;
    let outputs=v.get("outputs").and_then(Value::as_array).ok_or(())?;
    if arr.len()!=st.input_commitments.len()||outputs.len()!=st.output_commitments.len(){return Err(());}
    let mut values=[0u64;NOTE_COUNT];
    for (i,item) in arr.iter().enumerate(){
        values[i]=decimal(item.pointer("/note/value").and_then(Value::as_str).ok_or(())?,false)?;
    }
    for (i,item) in outputs.iter().enumerate(){
        values[4+i]=decimal(item.get("value").and_then(Value::as_str).ok_or(())?,false)?;
    }
    values[8]=decimal(&st.fee,true)?;
    let air=FinancialAmountAir{expected_digest:binding(&st)?,fee:values[8],inputs:arr.len(),outputs:outputs.len()};
    let proof=prove(&config(),&air,trace(&air,values),&[]).map_err(|_|())?;
    let proof_bytes=postcard::to_allocvec(&proof).map_err(|_|())?;
    if proof_bytes.is_empty()||proof_bytes.len()>MAX_PROOF{return Err(());}
    let bundle=ProofBundle{scheme:SCHEME.into(),statement:st,proof:B64.encode(proof_bytes)};
    fs::write(output,serde_json::to_vec(&bundle).map_err(|_|())?).map_err(|_|())
}
pub(crate) fn verify_financial(bundle:&[u8],expected:&[u8])->Verdict{
    let fail=||Verdict{valid:false,amount_conservation_proved:false,financial_relation_proved:false,
        sha512_preimages_arithmetized:false,knowledge_demonstrated:false,aegis_target_met:false,production_ready:false};
    let check=||->Result<(),()>{
        if bundle.len()>11_200_000||expected.len()>16_384{return Err(());}
        let payload:ProofBundle=serde_json::from_slice(bundle).map_err(|_|())?;
        let exp:Statement=serde_json::from_slice(expected).map_err(|_|())?;
        if payload.scheme!=SCHEME||payload.statement!=exp||!exp.valid(){return Err(());}
        let proof_bytes=B64.decode(&payload.proof).map_err(|_|())?;
        if proof_bytes.is_empty()||proof_bytes.len()>MAX_PROOF||B64.encode(&proof_bytes)!=payload.proof{return Err(());}
        let proof:Proof<Config>=postcard::from_bytes(&proof_bytes).map_err(|_|())?;
        let air=FinancialAmountAir{expected_digest:binding(&exp)?,
            fee:decimal(&exp.fee,true)?,
            inputs:exp.input_commitments.len(),outputs:exp.output_commitments.len()};
        catch_unwind(AssertUnwindSafe(||verify(&config(),&air,&proof,&[])))
            .map_err(|_|())?.map_err(|_|())?;
        Ok(())
    };
    if check().is_err(){return fail();}
    Verdict{valid:true,amount_conservation_proved:true,
        financial_relation_proved:false,sha512_preimages_arithmetized:false,
        knowledge_demonstrated:false,aegis_target_met:false,production_ready:false}
}

#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn rejects_noncanonical_and_out_of_range_values(){
        for value in ["0","01","","-1","9007199254740992","+1"]{
            assert!(decimal(value,false).is_err());
        }
        assert_eq!(decimal("9007199254740991",false),Ok(MAX_VALUE));
    }
    #[test]
    fn limbs_and_53bit_overflow_bounds(){
        assert_eq!(WIDTH,535);
        assert!(ROWS>=4096);
        assert!((4u128*MAX_VALUE as u128) < (1u128<<64));
        assert!((5*65535+7)<2_013_265_921u64);
        let air=FinancialAmountAir{expected_digest:[1;WORDS],fee:10,inputs:1,outputs:2};
        let m=trace(&air,[100,0,0,0,40,50,0,0,10]);
        assert_eq!(m.width(),WIDTH);
        assert_eq!(m.height(),ROWS);
    }
}
