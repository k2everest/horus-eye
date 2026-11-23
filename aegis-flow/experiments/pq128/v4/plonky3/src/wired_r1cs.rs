//! Plonky3 0.8.0 R1CS Boolean gate wiring via a LogUp permutation bus.
//!
//! The public circuit is a FIXED program, not a prover-chosen circuit.
//! The immutable instruction table and pin values live in the trusted
//! PREPROCESSED matrix committed once per program. Each gate references a wire
//! table using (wire_index, wire_bit) messages on a common LogUp bus.
//! The wire table contributes exactly the program-fixed use multiplicity.
//! This prevents a malicious prover assigning two values to one wire.
//!
//! This module is a general-purpose R1CS/Boolean wiring ENGINE, not
//! confirmation of financial PQ128 or a benchmark of the 6-SHA-512 program.
//! A financial verifier must derive the program from an independently
//! authenticated statement before constructing a verifier instance.
use std::{path::Path,fs,sync::Arc,panic::{catch_unwind,AssertUnwindSafe}};
use base64::{engine::general_purpose::STANDARD as B64,Engine};
use serde::{Serialize,Deserialize};
use sha2::{Digest,Sha512};
use p3_air::{Air,AirBuilder,BaseAir,PermutationAirBuilder,WindowAccess};
use p3_batch_stark::{BatchProof,ProverData,StarkInstance,prove_batch,verify_batch};
use p3_batch_stark::symbolic::{get_constraint_layout,get_max_constraint_degree,get_log_num_quotient_chunks};
use p3_air::symbolic::AirLayout;
use p3_lookup::{Lookups,logup::LogUpGadget};
use p3_security::{fri::FriRegime,logup::{LogUpAir,security_term},shape::{InstanceShape,StarkAirParams},stark::proven_security_report,grinding::GrindingSites};
use p3_field::{Field,PrimeCharacteristicRing};
use p3_lookup::{Count,InteractionBuilder,LookupBus};
use p3_matrix::dense::RowMajorMatrix;
use p3_uni_stark::StarkGenericConfig;
use crate::{F,Config,config};

const PROGRAM_MAGIC:&[u8]=b"AEGIS_V4_BOOLEAN_PROGRAM_V1\0";
const FINANCIAL_PROGRAM_MAGIC:&[u8]=b"AEGIS_V4_BOOLEAN_PROGRAM_V2\0";
const MAX_GATES:usize=8_000_000;
// BabyBear 2-adicity is 27. Hiding doubles the 8x FRI domain:
// rows * 2 * 8 <= 2^27, so <= 2^23 trace rows.
const MAX_WIRES:usize=8_388_608;
const MIN_ROWS:usize=4096;
// Four private-wire columns. Twelve public-program columns live in
// deterministic preprocessed trace, not prover-controlled main trace.
// Plonky3 0.8.0 LogUp RowEvalContext supports preprocessed rows, but
// NOT periodic rows, when it constructs rational lookup witnesses.
const GATE_WIDTH:usize=4;
// columns: gate active; four one-hot op flags; gate (a,b,z) indices;
// wire-table index; wire use-count; constant-0/1 pin flags.
const PREP_WIDTH:usize=12;
const BUS:LookupBus<'static>=LookupBus::new("AEGIS_V4_R1CS_WIRE_VALUES");

#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub(crate) struct Gate{pub op:u8,pub a:u32,pub b:u32,pub z:u32}

#[derive(Clone,Debug)]
pub(crate) struct PublicProgram{
    gates:Arc<[Gate]>,
    use_counts:Arc<[u32]>,
    wire_count:usize,
    rows:usize,
    public_digest_words:[u16;32],
}
impl PublicProgram{
    pub(crate) fn from_gates(gates:Vec<Gate>,wire_count:usize)->Result<Self,()>{
        Self::from_gates_bound(gates,wire_count,None)
    }
    fn from_gates_bound(gates:Vec<Gate>,wire_count:usize,
        statement_digest:Option<[u8;64]>)->Result<Self,()>{
        if gates.is_empty()||gates.len()>MAX_GATES||wire_count<2||wire_count>MAX_WIRES||
            wire_count as u64>=2_013_265_921{return Err(());}
        let mut counts=vec![0u32;wire_count];
        let mut outputs=vec![false;wire_count];
        for gate in &gates{
            if !(1..=4).contains(&gate.op)||
                [gate.a,gate.b,gate.z].iter().any(|x|*x as usize>=wire_count)||
                (gate.op==4&&gate.z!=0)||
                (gate.op==3&&gate.b!=0)||
                (gate.op!=4&&(gate.z<2||outputs[gate.z as usize])){return Err(());}
            if gate.op!=4 {outputs[gate.z as usize]=true;}
            for i in [gate.a,gate.b,gate.z] {
                counts[i as usize]=counts[i as usize].checked_add(1).ok_or(())?;
            }
        }
        // The LogUp height bound includes 3 queries per active gate.
        if 3u64*gates.len() as u64>=2_013_265_921{return Err(());}
        let rows=gates.len().max(wire_count).max(MIN_ROWS).checked_next_power_of_two().ok_or(())?;
        let mut digest=Sha512::new();
        digest.update(if statement_digest.is_some(){
            FINANCIAL_PROGRAM_MAGIC
        }else{PROGRAM_MAGIC});
        digest.update((wire_count as u32).to_be_bytes());
        digest.update((gates.len() as u32).to_be_bytes());
        if let Some(binding)=statement_digest{digest.update(binding);}
        for gate in &gates{
            digest.update([gate.op]);
            for id in [gate.a,gate.b,gate.z]{digest.update(id.to_be_bytes());}
        }
        let hash:[u8;64]=digest.finalize().into();
        let words=std::array::from_fn(|i|
            u16::from_be_bytes([hash[2*i],hash[2*i+1]]));
        if rows>(1usize<<23){return Err(());}
        Ok(Self{gates:gates.into(),use_counts:counts.into(),wire_count,rows,
            public_digest_words:words})
    }
    pub(crate) fn from_bytes(bytes:&[u8])->Result<Self,()>{
        let (prefix,financial)=if bytes.starts_with(FINANCIAL_PROGRAM_MAGIC){
            (FINANCIAL_PROGRAM_MAGIC.len(),true)
        }else if bytes.starts_with(PROGRAM_MAGIC){
            (PROGRAM_MAGIC.len(),false)
        }else{return Err(());};
        let binding_length=if financial{64}else{0};
        if bytes.len()<prefix+8+binding_length{return Err(());}
        let n=u32::from_be_bytes(bytes[prefix..prefix+4].try_into().map_err(|_|())?) as usize;
        let m=u32::from_be_bytes(bytes[prefix+4..prefix+8].try_into().map_err(|_|())?) as usize;
        let start=prefix+8+binding_length;
        if n>MAX_WIRES||m>MAX_GATES||
           bytes.len()!=start+m.checked_mul(13).ok_or(())?{return Err(());}
        let binding=if financial{
            Some(bytes[prefix+8..start].try_into().map_err(|_|())?)
        }else{None};
        let mut gates=Vec::with_capacity(m);
        for chunk in bytes[start..].chunks_exact(13){
            let word=|i|u32::from_be_bytes(chunk[i..i+4].try_into().unwrap());
            gates.push(Gate{op:chunk[0],a:word(1),b:word(5),z:word(9)});
        }
        Self::from_gates_bound(gates,n,binding)
    }
    pub(crate) fn from_parts(gates:Vec<Gate>,wire_count:usize)->Self{
        Self::from_gates(gates,wire_count).expect("trusted public circuit shape")
    }
}

#[derive(Clone,Debug)]
pub(crate) struct WiredAir{program:Arc<PublicProgram>}
impl WiredAir{
    pub(crate) fn new(program:PublicProgram)->Self{Self{program:Arc::new(program)}}
    fn program_row(&self,i:usize)->[u32;PREP_WIDTH]{
        let g=self.program.gates.get(i);
        let op=g.map(|x|x.op).unwrap_or(0);
        let a=g.map(|x|x.a).unwrap_or(0);
        let b=g.map(|x|x.b).unwrap_or(0);
        let z=g.map(|x|x.z).unwrap_or(0);
        [
            u32::from(g.is_some()),u32::from(op==1),u32::from(op==2),
            u32::from(op==3),u32::from(op==4),a,b,z,
            i as u32,self.program.use_counts.get(i).copied().unwrap_or(0),
            u32::from(i==0),u32::from(i==1),
        ]
    }
    pub(crate) fn trace(&self,bits:&[u8])->Result<RowMajorMatrix<F>,()>{
        if bits.len()!=self.program.wire_count||
            bits.iter().any(|&b|b>1)||bits[0]!=0||bits[1]!=1{return Err(());}
        let mut trace=Vec::with_capacity(self.program.rows*GATE_WIDTH);
        for i in 0..self.program.rows{
            let (a,b,z)=if let Some(g)=self.program.gates.get(i){
                (bits[g.a as usize],bits[g.b as usize],bits[g.z as usize])
            }else{(0,0,0)};
            let wire=bits.get(i).copied().unwrap_or(0);
            trace.extend([a,b,z,wire].map(|x|F::from_u32(x as u32)));
        }
        Ok(RowMajorMatrix::new(trace,GATE_WIDTH))
    }
    pub(crate) fn rows(&self)->usize{self.program.rows}
    pub(crate) fn public_values(&self)->Vec<F>{
        self.program.public_digest_words.iter().copied().map(F::from_u16).collect()
    }
}
impl<T:Field> BaseAir<T> for WiredAir{
    fn width(&self)->usize{GATE_WIDTH}
    fn num_public_values(&self)->usize{32}
    fn preprocessed_width(&self)->usize{PREP_WIDTH}
    fn main_next_row_columns(&self)->Vec<usize>{vec![]}
    fn preprocessed_next_row_columns(&self)->Vec<usize>{vec![]}
    fn preprocessed_trace(&self)->Option<RowMajorMatrix<T>>{
        let mut values=Vec::with_capacity(self.program.rows*PREP_WIDTH);
        for i in 0..self.program.rows{
            values.extend(self.program_row(i).map(T::from_u32));
        }
        Some(RowMajorMatrix::new(values,PREP_WIDTH))
    }
}
impl<AB> Air<AB> for WiredAir
where AB:AirBuilder+PermutationAirBuilder+InteractionBuilder,
      AB::F:Field{
    fn eval(&self,builder:&mut AB){
        // The program's SHA-512 is absorbed into Fiat-Shamir as public
        // values. The AIR also constrains them to the verifier's program,
        // preventing a prover-controlled self-description.
        let pins=builder.public_values().to_vec();
        for (i,word) in self.program.public_digest_words.iter().enumerate(){
            builder.assert_eq(pins[i],AB::Expr::from_u16(*word));
        }
        let row=builder.main();
        let s=row.current_slice();
        let a:AB::Expr=s[0].into();
        let b:AB::Expr=s[1].into();
        let z:AB::Expr=s[2].into();
        let wire:AB::Expr=s[3].into();
        // Program instruction columns are independently rebuilt and
        // committed in the trusted PREPROCESSED matrix. The prover
        // cannot replace their content without changing the commitment
        // that the verifier reconstructs from the public program.
        let preprocessed=builder.preprocessed();
        let c=preprocessed.current_slice().to_vec();
        let active:AB::Expr=c[0].into();
        let op_and:AB::Expr=c[1].into();
        let op_xor:AB::Expr=c[2].into();
        let op_not:AB::Expr=c[3].into();
        let op_eq:AB::Expr=c[4].into();
        let a_id:AB::Expr=c[5].into();
        let b_id:AB::Expr=c[6].into();
        let z_id:AB::Expr=c[7].into();
        let wire_id:AB::Expr=c[8].into();
        let use_count:AB::Expr=c[9].into();
        let pin_zero:AB::Expr=c[10].into();
        let pin_one:AB::Expr=c[11].into();
        for bit in [a.clone(),b.clone(),z.clone(),wire.clone()]{
            builder.assert_zero(bit.clone()*(bit.clone()-AB::Expr::ONE));
        }
        let ab=a.clone()*b.clone();
        builder.assert_zero(op_and*(ab.clone()-z.clone()));
        builder.assert_zero(op_xor*(a.clone()+b.clone()-ab*AB::Expr::from_u32(2)-z.clone()));
        builder.assert_zero(op_not*(AB::Expr::ONE-a.clone()-z.clone()));
        builder.assert_zero(op_eq*(a.clone()-b.clone()));
        builder.assert_zero((AB::Expr::ONE-active.clone())*a.clone());
        builder.assert_zero((AB::Expr::ONE-active.clone())*b.clone());
        builder.assert_zero((AB::Expr::ONE-active.clone())*z.clone());
        builder.assert_zero(pin_zero*wire.clone());
        builder.assert_zero(pin_one*(wire.clone()-AB::Expr::ONE));
        // Three gateside reads are matched against the exactly one wire
        // table value, repeated with a PROGRAM-FIXED multiplicity.
        BUS.lookup_key(builder,[a_id,a],Count::bounded(active.clone(),1));
        BUS.lookup_key(builder,[b_id,b],Count::bounded(active.clone(),1));
        BUS.lookup_key(builder,[z_id,z],Count::bounded(active,1));
        BUS.table_entry(builder,[wire_id,wire],use_count);
    }
}

// The deterministic public-only preprocessing seed is derived from the
// canonical program digest. Both the prover and verifier reconstruct the
// same salted preprocessed commitment, while all PRIVATE proof phases use
// fresh OS-seeded randomness from config().
fn preprocessing_config(air:&WiredAir)->Config{
    let mut id=[0u8;64];
    for (i,word) in air.program.public_digest_words.iter().enumerate(){
        id[2*i..2*i+2].copy_from_slice(&word.to_be_bytes());
    }
    crate::public_preprocessing_config(id)
}

// Derive a quantitative round-by-round *INTERACTIVE* report for the
// actual LogUp AIR, not the unrelated balance-only AIR. Constraint count,
// degrees and quotient chunk size come from p3-batch-stark's own symbolic
// lookup-aware evaluator; the LogUp term is added explicitly as a round.
// This command deliberately makes NO claims about quantum Fiat-Shamir.
pub(crate) fn wired_security_report(program_bytes:&[u8])->Result<serde_json::Value,()>{
    let (program,digest)=public_program(program_bytes)?;
    let air=WiredAir::new(program);
    let lookups=Lookups::<F>::from_air::<crate::E,_>(&air);
    if lookups.is_empty(){return Err(());}
    let layout=AirLayout::from_air::<F>(&air);
    let lookup_gadget=LogUpGadget::new();
    let constraint_layout=get_constraint_layout::<F,crate::E,_,_>(
        &air,layout,&lookups,&lookup_gadget);
    let degree=get_max_constraint_degree::<F,crate::E,_,_>(
        &air,layout,air.rows(),&lookups,&lookup_gadget);
    let log_chunks=get_log_num_quotient_chunks::<F,crate::E,_,_>(
        &air,layout,air.rows(),&lookups,1,&lookup_gadget);
    if log_chunks>=32 {return Err(());}
    let chunks=1usize.checked_shl(log_chunks as u32).ok_or(())?;
    let num_batched=p3_batch_stark::num_batched_openings(
        GATE_WIDTH,false,PREP_WIDTH,false,chunks,lookups.len(),8,
        p3_uni_stark::OpeningShape::hiding(8));
    let params=StarkAirParams{
        num_constraints:constraint_layout.total_constraints(),
        max_constraint_degree:degree,
        num_quotient_chunks:chunks,max_combo:2,
    };
    let shape=InstanceShape{
        log_trace_length:air.rows().ilog2() as usize,
        modulus_bits:247,
        collision_resistance:170,
        num_batched_functions:num_batched,
    };
    let regime=FriRegime{
        log_blowup:3,log_final_poly_len:0,max_log_arity:1,
        num_queries:320,commit_pow_bits:0,query_pow_bits:0,
    };
    let interactions=LogUpAir{num_interactions:4,max_message_width:2};
    let logup=security_term(&interactions,&shape,&GrindingSites::NONE).ok_or(())?;
    let rbr=proven_security_report(&regime,&params,&shape,&[logup],&GrindingSites::NONE);
    let result=serde_json::json!({
        "schema":"AEGIS_V4_WIRED_LOGUP_FRI_RBR_PROVEN_IOP_ONLY_V1",
        "program_sha512":digest,"trace_rows":air.rows(),
        "num_lookups":lookups.len(),
        "constraints":params.num_constraints,
        "constraint_degree":params.max_constraint_degree,
        "num_quotient_chunks":chunks,
        "num_batched_functions":num_batched,
        "logup_field_bits_floor":shape.modulus_bits,
        "fri_blowup":8,"fri_queries":320,
        "hiding_fri":true,"sha512_commitment_collision_bits_assumed":170,
        "rbr_bits":rbr.security_bits(),
        "rbr_breakdown":rbr,
        "collision_cap_is_external_assumption":true,
        "rbr_report_is_for_actual_compiled_wired_air":true,
        "plonky3_field16_implemented":false,
        "final_qrom_rbr_target_bits":336,
        "qrom_fiat_shamir_reduction_proved":false,
        "quantum_adaptive_soundness_proved":false,
        "knowledge_soundness_proved":false,
        "zero_knowledge_proved":false,
        "pq128_demonstrated":false,"production_ready":false
    });
    Ok(result)
}

// A general-purpose STARK proof of a *fixed Boolean program*. This is
// not by itself a financial proof: the verifier must independently rebuild
// and authenticate the complete program for the relevant public statement.
const WIRED_SCHEME:&str="AEGIS_V4_PLONKY3_WIRED_LOGUP_RESEARCH_V1";
const MAX_PROGRAM_BYTES:usize=110_000_128;
const MAX_WIRED_PROOF:usize=32*1024*1024;
const MAX_WIRED_BUNDLE:usize=44*1024*1024;
#[derive(Debug,Serialize,Deserialize)]
#[serde(deny_unknown_fields)]
struct WiredBundle{scheme:String,program_sha512:String,proof:String}
#[derive(Debug,Serialize)]
pub(crate) struct WiredVerdict{
    valid:bool,program_sha512:Option<String>,
    boolean_gate_relations_proved:bool,
    cross_row_wire_consistency_proved:bool,
    financial_relation_proved:bool,
    knowledge_demonstrated:bool,
    quantum_soundness_proved:bool,
    aegis_target_met:bool,production_ready:bool,
}
fn rejected()->WiredVerdict{
    WiredVerdict{valid:false,program_sha512:None,
        boolean_gate_relations_proved:false,cross_row_wire_consistency_proved:false,
        financial_relation_proved:false,knowledge_demonstrated:false,
        quantum_soundness_proved:false,aegis_target_met:false,production_ready:false}
}
fn public_program(bytes:&[u8])->Result<(PublicProgram,String),()>{
    if bytes.len()>MAX_PROGRAM_BYTES{return Err(());}
    let digest=hex::encode(Sha512::digest(bytes));
    let program=PublicProgram::from_bytes(bytes)?;
    Ok((program,digest))
}
// Never logs witnesses, secret bits, note values or financial metadata.
fn lab_phase(label:&str,start:std::time::Instant,rows:usize){
    if std::env::var("AEGIS_V4_P3_PROFILE").as_deref()!=Ok("1"){return;}
    let rss=fs::read_to_string("/proc/self/status").ok()
        .and_then(|s|s.lines().find(|l|l.starts_with("VmRSS:")).map(str::to_string))
        .unwrap_or_else(||"VmRSS: unavailable".to_string());
    eprintln!("AEGIS_WIRED_PROVER_PHASE={} elapsed_ms={} rows={} {}",
        label,start.elapsed().as_millis(),rows,rss);
}
pub(crate) fn prove_wired(program_bytes:&[u8],assignment:&[u8],output:&Path)->Result<(),()>{
    let start=std::time::Instant::now();
    let (program,sha)=public_program(program_bytes)?;
    let air=WiredAir::new(program);
    lab_phase("public-program-validated",start,air.rows());
    let trace=air.trace(assignment)?;
    lab_phase("private-trace-built",start,air.rows());
    let config=config(); // fresh unpredictable secrets for private witness
    let instances=[StarkInstance::<Config,_>{air:&air,trace:&trace,public_values:air.public_values()}];
    let preprocessor_config=preprocessing_config(&air);
    let prover_data=ProverData::from_instances(&preprocessor_config,&instances)
        .map_err(|_|())?;
    lab_phase("public-preprocessed-committed",start,air.rows());
    let proof=prove_batch(&config,&instances,&prover_data).map_err(|_|())?;
    lab_phase("batch-stark-complete",start,air.rows());
    let encoded=postcard::to_allocvec(&proof).map_err(|_|())?;
    if encoded.is_empty()||encoded.len()>MAX_WIRED_PROOF{return Err(());}
    let bundle=WiredBundle{scheme:WIRED_SCHEME.to_owned(),program_sha512:sha,
        proof:B64.encode(encoded)};
    fs::write(output,serde_json::to_vec(&bundle).map_err(|_|())?).map_err(|_|())?;
    lab_phase("public-proof-saved",start,air.rows());
    Ok(())
}
pub(crate) fn verify_wired(program_bytes:&[u8],bundle_bytes:&[u8],expected_program_sha512:&str)->WiredVerdict{
    let perform=||->Result<String,()>{
        if bundle_bytes.len()>MAX_WIRED_BUNDLE||
           expected_program_sha512.len()!=128||
           !expected_program_sha512.bytes().all(|b|b.is_ascii_digit()||(b'a'..=b'f').contains(&b)){
            return Err(());
        }
        let (program,digest)=public_program(program_bytes)?;
        if digest!=expected_program_sha512{return Err(());}
        let bundle:WiredBundle=serde_json::from_slice(bundle_bytes).map_err(|_|())?;
        if bundle.scheme!=WIRED_SCHEME||bundle.program_sha512!=digest{return Err(());}
        let encoded=B64.decode(&bundle.proof).map_err(|_|())?;
        if encoded.is_empty()||encoded.len()>MAX_WIRED_PROOF||
           B64.encode(&encoded)!=bundle.proof{return Err(());}
        let proof:BatchProof<Config>=postcard::from_bytes(&encoded).map_err(|_|())?;
        let air=WiredAir::new(program);
        let config=config();
        // The verifier derives every gate/index/constant pin and every
        // multiplicity from the externally trusted public program.
        // No private wire assignment or prover-supplied preprocessed
        // commitment can influence this setup.
        let log_degree=air.rows().ilog2() as usize+config.is_zk();
        let preprocessor_config=preprocessing_config(&air);
        let data=ProverData::<Config>::from_airs_and_degrees(&preprocessor_config,
            &[air.clone()],&[log_degree]).map_err(|_|())?;
        let public=air.public_values();
        verify_batch(&config,&[air],&proof,&[public],&data.common).map_err(|_|())?;
        Ok(digest)
    };
    let result=catch_unwind(AssertUnwindSafe(perform)).ok().and_then(Result::ok);
    if let Some(program_sha512)=result{
        WiredVerdict{valid:true,program_sha512:Some(program_sha512),
            boolean_gate_relations_proved:true,cross_row_wire_consistency_proved:true,
            financial_relation_proved:false,knowledge_demonstrated:false,
            quantum_soundness_proved:false,aegis_target_met:false,production_ready:false}
    }else{rejected()}
}

/// End-to-end proof is only for a **trusted public program**. Callers must
/// rebuild the program from the independently checked financial statement;
/// accepting a prover-supplied instruction blob would not bind SHA-512.
#[cfg(test)]
mod tests{
    use super::*;
    // [0]=0 and [1]=1 are fixed pins; all other wires are private.
    fn circuit()->WiredAir{
        WiredAir::new(PublicProgram::from_parts(vec![
            Gate{op:1,a:2,b:3,z:4}, // w4=w2&w3
            Gate{op:2,a:4,b:0,z:5}, // w5=w4^0
            Gate{op:4,a:5,b:1,z:0}, // assert w5==1
        ],6))
    }
    #[test]
    fn statement_binding_is_cryptographically_included_in_program_digest(){
        let circuit=circuit();
        let gates=circuit.program.gates.to_vec();
        let bound1=PublicProgram::from_gates_bound(gates.clone(),6,Some([0x42;64])).unwrap();
        let bound2=PublicProgram::from_gates_bound(gates,6,Some([0x43;64])).unwrap();
        assert_ne!(bound1.public_digest_words,bound2.public_digest_words);
        let mut bytes=FINANCIAL_PROGRAM_MAGIC.to_vec();
        bytes.extend(6u32.to_be_bytes());
        bytes.extend(3u32.to_be_bytes());
        bytes.extend([0x42u8;64]);
        for g in circuit.program.gates.iter(){
            bytes.push(g.op);
            for id in [g.a,g.b,g.z]{bytes.extend(id.to_be_bytes());}
        }
        assert_eq!(PublicProgram::from_bytes(&bytes).unwrap().public_digest_words,
            bound1.public_digest_words);
        let header=FINANCIAL_PROGRAM_MAGIC.len()+8;
        bytes[header]^=1;
        assert_ne!(PublicProgram::from_bytes(&bytes).unwrap().public_digest_words,
            bound1.public_digest_words);
        bytes.pop();
        assert!(PublicProgram::from_bytes(&bytes).is_err());
    }
    #[test]
    fn program_binary_decode_and_public_pins(){
        let mut bytes=PROGRAM_MAGIC.to_vec();
        bytes.extend(6u32.to_be_bytes());
        bytes.extend(3u32.to_be_bytes());
        for g in circuit().program.gates.iter(){
            bytes.push(g.op);for id in [g.a,g.b,g.z]{bytes.extend(id.to_be_bytes());}
        }
        assert_eq!(PublicProgram::from_bytes(&bytes).unwrap().gates.len(),3);
        bytes[PROGRAM_MAGIC.len()+8]=77;
        assert!(PublicProgram::from_bytes(&bytes).is_err());
    }
    #[test]
    fn real_plonky3_logup_proves_cross_row_wiring(){
        let air=circuit();
        let trace=air.trace(&[0,1,1,1,1,1]).unwrap();
        let config=config();
        let inst=[StarkInstance::<Config,_>{air:&air,trace:&trace,public_values:air.public_values()}];
        let prep_config=preprocessing_config(&air);
        let data=ProverData::from_instances(&prep_config,&inst).unwrap();
        let proof=prove_batch(&config,&inst,&data).unwrap();
        let public=air.public_values();
        // Critical: do NOT re-use the prover's preprocessed commitment.
        // The verifier independently reconstructs it from the public program.
        let independent_prep=preprocessing_config(&air);
        let independently_derived=ProverData::<Config>::from_airs_and_degrees(
            &independent_prep,&[air.clone()],
            &[air.rows().ilog2() as usize+config.is_zk()]).unwrap();
        verify_batch(&config,&[air.clone()],&proof,&[public],
            &independently_derived.common).unwrap();
    }
    #[test]
    fn adversarial_gate_row_rebinding_is_rejected_by_logup(){
        let air=circuit();
        let mut trace=air.trace(&[0,1,1,1,1,1]).unwrap();
        // Change a gate-row argument without updating its globally unique
        // value in the wire table. The local AND still holds after changing z,
        // but cross-row wire equality is false and LogUp must reject.
        trace.values[0]=F::ZERO;
        trace.values[2]=F::ZERO;
        let config=config();
        let inst=[StarkInstance::<Config,_>{air:&air,trace:&trace,public_values:air.public_values()}];
        let run=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||{
            let prep_config=preprocessing_config(&air);
            let data=ProverData::from_instances(&prep_config,&inst).unwrap();
            match prove_batch(&config,&inst,&data){
                Ok(p)=>{let public=air.public_values();
                    verify_batch(&config,&[air.clone()],&p,&[public],&data.common).is_err()},
                Err(_)=>true,
            }
        }));
        assert!(run.unwrap_or(true));
    }
}
