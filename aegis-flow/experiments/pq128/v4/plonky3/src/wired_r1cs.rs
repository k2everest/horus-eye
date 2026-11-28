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
use p3_batch_stark::symbolic::{get_constraint_layout,get_max_constraint_degree,get_log_num_quotient_chunks,get_symbolic_constraints};
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
// Three private columns: a, b and canonical wire-table bit.
// The gate output z is recomputed from a,b and the authenticated public
// opcode; it is still linked to the canonical wire value through LogUp.
// Eleven public-program columns live in deterministic preprocessing.
// Plonky3 0.8.0 LogUp RowEvalContext supports preprocessed rows, but
// NOT periodic rows, when it constructs rational lookup witnesses.
pub(crate) const GATE_WIDTH:usize=3;
// columns: four one-hot op flags; gate (a,b,z) indices;
// wire-table index; wire use-count; constant-0/1 pin flags.
// The active selector is derived from the immutable operation flags, saving
// one full preprocessed column without altering the LogUp multiplicities.
pub(crate) const PREP_WIDTH:usize=11;
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
            u32::from(op==1),u32::from(op==2),
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
            let (a,b)=if let Some(g)=self.program.gates.get(i){
                (bits[g.a as usize],bits[g.b as usize])
            }else{(0,0)};
            let wire=bits.get(i).copied().unwrap_or(0);
            trace.extend([a,b,wire].map(|x|F::from_u32(x as u32)));
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
        let wire:AB::Expr=s[2].into();
        // Program instruction columns are independently rebuilt and
        // committed in the trusted PREPROCESSED matrix. The prover
        // cannot replace their content without changing the commitment
        // that the verifier reconstructs from the public program.
        let preprocessed=builder.preprocessed();
        let c=preprocessed.current_slice().to_vec();
        let op_and:AB::Expr=c[0].into();
        let op_xor:AB::Expr=c[1].into();
        let op_not:AB::Expr=c[2].into();
        let op_eq:AB::Expr=c[3].into();
        let a_id:AB::Expr=c[4].into();
        let b_id:AB::Expr=c[5].into();
        let z_id:AB::Expr=c[6].into();
        let wire_id:AB::Expr=c[7].into();
        let use_count:AB::Expr=c[8].into();
        let pin_zero:AB::Expr=c[9].into();
        let pin_one:AB::Expr=c[10].into();
        // Exactly one operation flag is set on an active trusted row.
        // Their sum is identical to the removed preprocessed active bit.
        let active=op_and.clone()+op_xor.clone()+op_not.clone()+op_eq.clone();
        for bit in [a.clone(),b.clone(),wire.clone()]{
            builder.assert_zero(bit.clone()*(bit.clone()-AB::Expr::ONE));
        }
        let ab=a.clone()*b.clone();
        // Reconstruct z without allocating or committing a fourth private
        // column. The opcode is verifier-derived, one-hot and committed in
        // trusted preprocessing. For AND/XOR/NOT, the expression is Boolean
        // whenever a and b are Boolean. EQ, whose fixed output wire is 0,
        // still enforces a==b as a separate gate equation.
        let z=op_and.clone()*ab.clone()
             +op_xor.clone()*(a.clone()+b.clone()-ab*AB::Expr::from_u32(2))
             +op_not.clone()*(AB::Expr::ONE-a.clone());
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
    let config=config();
    let is_zk=config.is_zk();
    if is_zk!=1{return Err(());}
    let rows=air.rows();
    let committed_log_degree=rows.ilog2() as usize+is_zk;
    let committed_degree=rows.checked_shl(is_zk as u32).ok_or(())?;
    let lookups=Lookups::<F>::from_air::<crate::E,_>(&air);
    if lookups.is_empty(){return Err(());}
    let layout=AirLayout::from_air::<F>(&air);
    let lookup_gadget=LogUpGadget::new();
    let constraint_layout=get_constraint_layout::<F,crate::E,_,_>(
        &air,layout,&lookups,&lookup_gadget);
    let degree=get_max_constraint_degree::<F,crate::E,_,_>(
        &air,layout,air.rows(),&lookups,&lookup_gadget);
    // Two-adic quotient sizing treats IsTransition as degree multiple zero,
    // but its actual selector polynomial is linear. Keep that sizing value
    // for the prover's chunk schedule, and derive a distinct conservative
    // degree for the full polynomial identity used by the OOD analysis.
    let (base_constraints,extension_constraints)=get_symbolic_constraints::<F,crate::E,_,_>(
        &air,layout,&lookups,&lookup_gadget);
    let full_selector_degree=base_constraints.iter()
        .map(|constraint|constraint.degree_multiple_with_transition(1))
        .chain(extension_constraints.iter()
            .map(|constraint|constraint.degree_multiple_with_transition(1)))
        .max().unwrap_or(0).max(degree)
        .max(<WiredAir as BaseAir<F>>::max_constraint_degree(&air).unwrap_or(0));
    let log_chunks=get_log_num_quotient_chunks::<F,crate::E,_,_>(
        &air,layout,rows,&lookups,is_zk,&lookup_gadget);
    // batch-stark/prover.rs adds the ZK bit AFTER symbolic quotient sizing.
    // The previous report omitted this factor and described half of the
    // chunks that the native prover actually commits.
    let committed_log_chunks=log_chunks.checked_add(is_zk).ok_or(())?;
    let chunks=1usize.checked_shl(committed_log_chunks as u32).ok_or(())?;
    let num_batched=p3_batch_stark::num_batched_openings(
        GATE_WIDTH,false,PREP_WIDTH,false,chunks,lookups.len(),crate::EXT_DIM,
        p3_uni_stark::OpeningShape::hiding(crate::RANDOM_CODEWORDS));
    let params=StarkAirParams{
        num_constraints:constraint_layout.total_constraints(),
        max_constraint_degree:degree,
        num_quotient_chunks:chunks,max_combo:2,
    };
    let shape=InstanceShape{
        // The committed polynomial domain is doubled by HidingFriPcs, just
        // as proof.degree_bits and verifier key generation require.
        log_trace_length:committed_log_degree,
        modulus_bits:crate::EXTENSION_FIELD_FLOOR_BITS,
        collision_resistance:crate::IDEAL_HASH_COLLISION_BITS,
        num_batched_functions:num_batched,
    };
    let regime=FriRegime{
        log_blowup:crate::LOG_BLOWUP,log_final_poly_len:0,max_log_arity:1,
        num_queries:crate::QUERIES,commit_pow_bits:0,query_pow_bits:0,
    };
    let interactions=LogUpAir{num_interactions:4,max_message_width:2};
    let logup=security_term(&interactions,&shape,&GrindingSites::NONE).ok_or(())?;
    let rbr=proven_security_report(&regime,&params,&shape,&[logup],&GrindingSites::NONE);
    // Counterfactual research sizing: SAME *compiled* program constraint
    // geometry with 16-dimensional extension, 512 FRI queries, and 16
    // hiding codewords. This does not construct an E16 field or proof.
    // It deliberately preserves the ORIGINAL 170-bit external collision
    // assumption: upgrading it requires a separate quantum hash theorem.
    let candidate_batched=p3_batch_stark::num_batched_openings(
        GATE_WIDTH,false,PREP_WIDTH,false,chunks,lookups.len(),
        16,p3_uni_stark::OpeningShape::hiding(16));
    let candidate_shape=InstanceShape{
        modulus_bits:494,
        num_batched_functions:candidate_batched,
        ..shape
    };
    let candidate_regime=FriRegime{num_queries:512,..regime};
    let candidate_logup=security_term(
        &interactions,&candidate_shape,&GrindingSites::NONE).ok_or(())?;
    let candidate_rbr=proven_security_report(
        &candidate_regime,&params,&candidate_shape,
        &[candidate_logup],&GrindingSites::NONE);
    let quotient_domain=rows.checked_mul(chunks).ok_or(())?;
    let recomposed_general=rows.checked_mul(chunks.checked_add(1).ok_or(())?).ok_or(())?;
    let initial_lde=committed_degree.checked_shl(crate::LOG_BLOWUP as u32).ok_or(())?;
    // This is a source-derived shape, not a coefficient measurement or a
    // soundness proof. The native test below checks actual proof arities.
    // Binary FRI commits each vector BEFORE folding; each matrix leaf holds
    // two extension-field values. log_final_poly_len=0 ends at a constant.
    let fri_rounds:Vec<_>=(0..committed_log_degree).map(|round|{
        let factor=1usize<<round;
        let vector_height=initial_lde/factor;
        serde_json::json!({
            "round":round,
            "commit_before_fold":true,
            "evaluation_vector_height":vector_height,
            "committed_matrix_height":vector_height/2,
            "matrix_width_extension_values":2,
            "verifier_degree_strict_bound":committed_degree/factor,
            "honest_opening_quotient_degree_strict_bound":
                (committed_degree-1).div_ceil(factor),
            "fold_arity":2
        })
    }).collect();
    let degree_geometry=serde_json::json!({
        "schema":"AEGIS_V4_WIRED_HIDING_DEGREE_GEOMETRY_V1",
        "derivation":"pinned-upstream-control-flow-not-coefficient-measurement",
        "upstream_commit":"a21e3ed42905040ad49c519e402f018381c12d0c",
        "trace_rows":rows,"is_zk":is_zk,
        "committed_log_degree":committed_log_degree,
        "committed_trace_rows":committed_degree,
        "main_preprocessed_permutation_degree_strict_bound":committed_degree,
        "randomization_degree_strict_bound":committed_degree,
        "log_quotient_expansion":log_chunks,
        "quotient_chunks":chunks,
        "quotient_domain_rows":quotient_domain,
        "quotient_chunk_rows":rows,
        "quotient_chunk_committed_rows":committed_degree,
        "quotient_chunk_degree_exclusive":committed_degree,
        // q'_i may independently have degree <2N. The degree-(C-1)N
        // recombination weights give Qhat degree <(C+1)N. Only the honest
        // correlated chunk masks cancel back to a polynomial of degree <CN.
        "quotient_recomposed_general_degree_exclusive":recomposed_general,
        "quotient_recomposed_honest_degree_exclusive":quotient_domain,
        "initial_fri_lde_height":initial_lde,
        "fri_rounds":fri_rounds,
        "terminal_evaluation_vector_height":1usize<<crate::LOG_BLOWUP,
        "terminal_polynomial_degree_strict_bound":1,
        "polynomial_coefficients_checked":false,
        "degree_caps_verified_for_arbitrary_prover":false,
        "aegis_target_met":false,"production_ready":false
    });
    let result=serde_json::json!({
        "schema":"AEGIS_V4_WIRED_LOGUP_FRI_RBR_PROVEN_IOP_ONLY_V1",
        "program_sha512":digest,"trace_rows":air.rows(),
        "num_lookups":lookups.len(),
        "constraints":params.num_constraints,
        "constraint_degree":params.max_constraint_degree,
        "constraint_full_selector_degree":full_selector_degree,
        "num_quotient_chunks":chunks,
        "num_batched_functions":num_batched,
        "logup_field_bits_floor":shape.modulus_bits,
        "fri_blowup":1usize<<crate::LOG_BLOWUP,"fri_queries":crate::QUERIES,
        "hiding_fri":true,"sha512_commitment_collision_bits_assumed":170,
        "committed_degree_geometry":degree_geometry,
        "rbr_bits":rbr.security_bits(),
        "rbr_breakdown":rbr,
        "counterfactual_field16_rbr":{
            "status":"SHADOW_RESEARCH_ONLY_NOT_AN_IMPLEMENTED_P3_FIELD",
            "same_compiled_air_constraints":params.num_constraints,
            "same_compiled_quotient_chunks":chunks,
            "field_modulus_bits_floor":494,
            "fri_queries":512,
            "hiding_random_codewords":16,
            "num_batched_functions":candidate_batched,
            "collision_assumption_bits_unmodified":crate::IDEAL_HASH_COLLISION_BITS,
            "conditional_interactive_bits":candidate_rbr.security_bits(),
            "conditional_breakdown":candidate_rbr,
            "native_extension_field16_implemented":false,
            "challenger_transcript_equivalence_proved":false,
            "merkle_quantum_extraction_proved":false,
            "quantum_rbr_knowledge_proved":false,
            "pq128_demonstrated":false,
            "production_ready":false
        },
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
    let status=fs::read_to_string("/proc/self/status").unwrap_or_default();
    let metric=|name:&str|status.lines().find(|l|l.starts_with(name))
        .unwrap_or("unavailable");
    let rss=metric("VmRSS:");
    let hwm=metric("VmHWM:");
    eprintln!("AEGIS_WIRED_PROVER_PHASE={} elapsed_ms={} rows={} {} {}",
        label,start.elapsed().as_millis(),rows,rss,hwm);
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
    // Periodic RSS/high-water samples survive in the Actions log even when
    // the runner kills the process before /usr/bin/time can flush its file.
    // Only process memory and row count are logged; NEVER witness values.
    let reporter_stop=std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let reporter=if std::env::var("AEGIS_V4_P3_PROFILE").as_deref()==Ok("1"){
        let done=reporter_stop.clone();
        let rows=air.rows();
        Some(std::thread::spawn(move||{
            use std::sync::atomic::Ordering;
            while !done.load(Ordering::Relaxed){
                std::thread::sleep(std::time::Duration::from_secs(5));
                if !done.load(Ordering::Relaxed){
                    lab_phase("batch-stark-progress",start,rows);
                }
            }
        }))
    }else{None};
    let prove_result=prove_batch(&config,&instances,&prover_data);
    reporter_stop.store(true,std::sync::atomic::Ordering::Relaxed);
    if let Some(reporter)=reporter{let _=reporter.join();}
    let proof=prove_result.map_err(|_|())?;
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

/// Independently replay the REAL pinned Plonky3 verify_batch with a
/// challenger that records every sampled field element / query index.
/// This is a read-only research API. No private wire or prover seed is
/// exported, and successful replay DOES NOT establish PQ128.
pub(crate) fn audit_wired_verifier_transcript(
    program_bytes:&[u8],bundle_bytes:&[u8],expected_program_sha512:&str
)->Result<serde_json::Value,()>{
    use crate::audit_challenger::AuditedChallenger;
    use p3_uni_stark::StarkConfig;
    use sha2::Digest;

    // Match the production verifier's canonical acceptance gate FIRST.
    // This prevents the audit mode from becoming a weaker verifier.
    if !verify_wired(program_bytes,bundle_bytes,expected_program_sha512).valid {
        eprintln!("AEGIS_AUDIT_FAILED_ORIGINAL_VERIFIER");return Err(());
    }
    let (program,digest)=public_program(program_bytes)?;
    if digest!=expected_program_sha512{return Err(());}
    let bundle:WiredBundle=serde_json::from_slice(bundle_bytes).map_err(|_|())?;
    if bundle.scheme!=WIRED_SCHEME||bundle.program_sha512!=digest{return Err(());}
    let encoded=B64.decode(&bundle.proof).map_err(|_|())?;
    if encoded.is_empty()||encoded.len()>MAX_WIRED_PROOF||
       B64.encode(&encoded)!=bundle.proof{return Err(());}
    let air=WiredAir::new(program);
    // Exactly the same factory as the original verifier; do not clone
    // HidingFriPcs (its Clone generates a new RNG seed and would destroy
    // deterministic PUBLIC-preprocessing commitment equality).
    type TraceConfig=StarkConfig<crate::Pcs,crate::E,AuditedChallenger>;
    let trace_cfg=crate::audit_config_from_public_program(None);
    let observer=trace_cfg.initialise_challenger();
    let log_degree=air.rows().ilog2() as usize+trace_cfg.is_zk();
    let mut public_id=[0u8;64];
    for (i,word) in air.program.public_digest_words.iter().enumerate(){
        public_id[2*i..2*i+2].copy_from_slice(&word.to_be_bytes());
    }
    let public_trace_cfg=crate::audit_config_from_public_program(Some(&public_id));
    let independent=ProverData::<TraceConfig>::from_airs_and_degrees(
        &public_trace_cfg,&[air.clone()],&[log_degree]).map_err(|_|())?;
    // The canonical proof wire format is shared across both Config and
    // TraceConfig because only the Challenger type changes.
    let trace_proof:BatchProof<TraceConfig>=
        postcard::from_bytes(&encoded).map_err(|_|())?;
    verify_batch(&trace_cfg,&[air.clone()],&trace_proof,
        &[air.public_values()],&independent.common).map_err(|e|{
            eprintln!("AEGIS_AUDIT_FAILED_INSTRUMENTED_VERIFIER: {e:?}");()
        })?;

    let events=observer.events();
    // In the pinned TwoAdicFriFolding extra_query_index_bits() == 0.
    // FriShape index_bits = log2(2*N*8). The verifier is the ONLY
    // source of raw index samples, not a user-provided JSON schedule.
    let lde_rows=air.rows().checked_mul(2* (1usize<<crate::LOG_BLOWUP)).ok_or(())?;
    let index_bits=lde_rows.ilog2() as usize;
    let sampled_indices:Vec<usize>=events.iter().filter(|ev|
        ev.operation=="sample_bits" && ev.bits==Some(index_bits)
    ).map(|ev|ev.value.as_deref().ok_or(())
        .and_then(|s|s.parse::<usize>().map_err(|_|()))).collect::<Result<_,_>>()?;
    if sampled_indices.len()!=crate::QUERIES||
       sampled_indices.iter().any(|&i|i>=lde_rows){
        eprintln!("AEGIS_AUDIT_INDEX_SAMPLING_FAILURE: got={}, expected={}, index_bits={index_bits}, sample_types={:?}",
            sampled_indices.len(),crate::QUERIES,
            events.iter().filter(|ev|ev.operation.starts_with("sample"))
                .map(|ev|ev.operation).take(20).collect::<Vec<_>>());
        return Err(());
    }
    let rounds=log_degree;
    if trace_proof.opening_proof.1.commit_phase_commits.len()!=rounds||
       trace_proof.opening_proof.1.commit_phase_openings.len()!=rounds{
        eprintln!("AEGIS_AUDIT_FRI_SHAPE_MISMATCH: expected {rounds}");return Err(());
    }
    // fold_query in pinned Plonky3 (two_adic_pcs.rs) updates index
    // with `start_index >>= log_arity` and records the parent group index.
    // max_log_arity is 1 in this verifier-owned configuration.
    let projected:Vec<Vec<usize>>=sampled_indices.iter().map(|&index|{
        let mut current=index;
        (0..rounds).map(|_|{current>>=1;current}).collect()
    }).collect();
    // The pinned typed drivers sample exactly these extension challenges:
    // LogUp alpha,beta; AIR rho; OOD zeta; PCS batch gamma; then one
    // FRI fold beta per verifier-owned round. ExtensionFieldCodec samples
    // DIMENSION base-field coordinates in canonical basis order.
    let mut labels=vec![
        "lookup_alpha".to_string(),"lookup_beta".to_string(),
        "constraint_challenge".to_string(),"zeta".to_string(),
        "pcs_batch_alpha".to_string(),
    ];
    labels.extend((0..rounds).map(|i|format!("fri_fold_challenge_{i}")));
    let samples:Vec<&str>=events.iter().filter(|e|e.operation=="sample_base")
        .map(|e|e.value.as_deref().ok_or(())).collect::<Result<_,_>>()?;
    let expected=labels.len().checked_mul(crate::EXT_DIM).ok_or(())?;
    if samples.len()!=expected{
        eprintln!("AEGIS_AUDIT_CHALLENGE_COUNT_MISMATCH: got={}, expected={expected}",
            samples.len());return Err(());
    }
    let mut named_challenges=serde_json::Map::new();
    for (i,label) in labels.iter().enumerate(){
        let group=&samples[i*crate::EXT_DIM..(i+1)*crate::EXT_DIM];
        let coefficients:Vec<u32>=group.iter().map(|s|s.parse().map_err(|_|()))
            .collect::<Result<_,_>>()?;
        named_challenges.insert(label.clone(),serde_json::json!({
            "babybear_coefficients":coefficients,
            "basis_dimension":crate::EXT_DIM
        }));
    }
    // This replay uses the EXACT public, typed transcript drivers shipped
    // by p3-batch-stark and p3-fri, including HidingFriPcs augmentation.
    // Reject any difference in even one absorbed value or sampled bit.
    let (mut typed_replay,replayed_events)=
        crate::native_transcript_replay::replay_verified(
            &air,&trace_proof,&independent.common).map_err(|_|{
                eprintln!("AEGIS_AUDIT_TYPED_REPLAY_FAILURE");()
            })?;
    if replayed_events!=events{
        eprintln!("AEGIS_AUDIT_TRANSCRIPT_EVENT_MISMATCH: native={}, replay={}",
            events.len(),replayed_events.len());return Err(());
    }
    for (label,basis) in [
        ("constraint_challenge","rho_basis"),
        ("zeta","zeta_basis"),
        ("pcs_batch_alpha","pcs_batch_gamma_basis"),
    ]{
        if named_challenges[label]["babybear_coefficients"]!=typed_replay[basis]{
            eprintln!("AEGIS_AUDIT_CHALLENGE_LABEL_MISMATCH: {label}");return Err(());
        }
    }
    let replay_betas=typed_replay["fri_fold_beta_bases"].as_array().ok_or(())?;
    if replay_betas.len()!=rounds||
       replay_betas.iter().enumerate().any(|(i,beta)|
           named_challenges.get(&format!("fri_fold_challenge_{i}"))
               .and_then(|c|c.get("babybear_coefficients"))!=Some(beta))||
       typed_replay["fri_query_indices"]!=serde_json::json!(sampled_indices)||
       typed_replay["fri_derived_log_arities"]!=serde_json::json!(vec![1usize;rounds])||
       typed_replay["fri_index_bits"]!=index_bits{
        eprintln!("AEGIS_AUDIT_FRI_TYPED_REPLAY_MISMATCH");return Err(());
    }
    typed_replay["native_transcript_bytes_and_samples_consistent"]=
        serde_json::json!(true);
    let digest_proof=format!("{:x}",Sha512::digest(&encoded));
    Ok(serde_json::json!({
        "schema":"AEGIS_NATIVE_WIRED_VERIFY_BATCH_OBSERVATION_V1",
        "source":"verify_batch executed with same PCS and audited challenger",
        "program_sha512":digest,
        "proof_sha512":digest_proof,
        "verified_by_original_config":true,
        "verified_by_instrumented_config":true,
        "transcript_events":events,
        "named_verifier_challenges":named_challenges,
        "typed_replay":typed_replay,
        "challenge_label_derivation":"pinned v0.8.0 typed-driver sample order; 8 BabyBear coefficients each",
        "fri":{
            "query_samples_source":"actual verifier challenger sample_bits",
            "query_index_bits":index_bits,
            "queries":sampled_indices,
            "fold_query_indices_after_each_round":projected,
            "fold_count":rounds,
            "log_arities":vec![1usize;rounds],
            "initial_lde_rows":lde_rows,
            "final_domain_rows":1usize<<crate::LOG_BLOWUP,
            "projection_source":"p3-fri v0.8.0 verifier::fold_query: start_index >>= log_arity",
            "projection_extracted_inside_upstream_verifier":false
        },
        "batching":{
            "challenge_samples_in_actual_challenger_events":true,
            "source_typed_batch_terms_replayed":true,
            "exact_batch_denominator_polynomials_exported":false,
            "native_pcs_batch_equivalence_proved":false
        },
        "audit_mode_only":true,
        "native_challenger_samples_observed":true,
        "whole_verifier_byte_transcript_equivalence_proved":false,
        "quantum_vector_commitment_extraction_proved":false,
        "cms_round_by_round_knowledge_proved":false,
        "pq128_demonstrated":false,
        "production_ready":false
    }))
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
    fn circuit_bytes(air:&WiredAir)->Vec<u8>{
        let mut bytes=PROGRAM_MAGIC.to_vec();
        bytes.extend((air.program.wire_count as u32).to_be_bytes());
        bytes.extend((air.program.gates.len() as u32).to_be_bytes());
        for gate in air.program.gates.iter(){
            bytes.push(gate.op);
            for id in [gate.a,gate.b,gate.z]{bytes.extend(id.to_be_bytes());}
        }
        bytes
    }
    #[test]
    fn derived_gate_output_matches_old_boolean_equations_for_every_input(){
        assert_eq!(GATE_WIDTH,3);
        for op in 1u8..=4{
            for a in [0u32,1]{
                for b in [0u32,1]{
                    // The previously committed z had to satisfy exactly
                    // these four instructions. The new z is implicit and
                    // lookup-linked to the same output wire.
                    let ab=a*b;
                    let derived=u32::from(op==1)*ab+
                        u32::from(op==2)*(a+b-2*ab)+
                        u32::from(op==3)*(1-a);
                    let old_z=match op{
                        1=>ab,2=>a^b,3=>1-a,4=>0,_=>unreachable!()
                    };
                    assert_eq!(derived,old_z,
                        "op={op} a={a} b={b}");
                    assert!(derived<=1,"derived output is Boolean");
                    if op==4{
                        // Equality remains independently enforced.
                        assert_eq!(a==b,(a as i32-b as i32)==0);
                    }
                }
            }
        }
        let air=circuit();
        let compact=air.trace(&[0,1,1,1,1,1]).unwrap();
        assert_eq!(compact.values.len(),air.rows()*GATE_WIDTH);
        assert_eq!(&compact.values[0..3],&[F::ONE,F::ONE,F::ZERO]);
        assert_eq!(&compact.values[3..6],&[F::ONE,F::ZERO,F::ONE]);
    }
    #[test]
    fn compact_public_preprocessing_preserves_each_original_active_selector(){
        let air=circuit();
        assert_eq!(PREP_WIDTH,11);
        for row in 0..air.rows(){
            let cells=air.program_row(row);
            let active_from_flags=cells[0]+cells[1]+cells[2]+cells[3];
            let original_active=u32::from(row<air.program.gates.len());
            assert_eq!(active_from_flags,original_active,"selector at row {row}");
            assert!(active_from_flags<=1);
            assert_eq!(cells[4],air.program.gates.get(row).map(|g|g.a).unwrap_or(0));
            assert_eq!(cells[5],air.program.gates.get(row).map(|g|g.b).unwrap_or(0));
            assert_eq!(cells[6],air.program.gates.get(row).map(|g|g.z).unwrap_or(0));
            assert_eq!(cells[7],row as u32);
            assert_eq!(cells[8],air.program.use_counts.get(row).copied().unwrap_or(0));
            assert_eq!(cells[9],u32::from(row==0));
            assert_eq!(cells[10],u32::from(row==1));
        }
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
        // Compare the report against the ACTUAL native proof/key shape, not
        // a second copy of a formula. This catches omitting the ZK doubling
        // in either trace degree or quotient chunk count.
        let report=wired_security_report(&circuit_bytes(&air)).unwrap();
        assert!(report["constraint_full_selector_degree"].as_u64().unwrap()>=
            report["constraint_degree"].as_u64().unwrap());
        let geometry=&report["committed_degree_geometry"];
        let shadow=&report["counterfactual_field16_rbr"];
        assert_eq!(shadow["status"],"SHADOW_RESEARCH_ONLY_NOT_AN_IMPLEMENTED_P3_FIELD");
        assert_eq!(shadow["field_modulus_bits_floor"],494);
        assert_eq!(shadow["fri_queries"],512);
        assert_eq!(shadow["hiding_random_codewords"],16);
        assert_eq!(shadow["collision_assumption_bits_unmodified"],170);
        assert_eq!(shadow["same_compiled_air_constraints"],report["constraints"]);
        assert_eq!(shadow["same_compiled_quotient_chunks"],report["num_quotient_chunks"]);
        assert!(shadow["num_batched_functions"].as_u64().unwrap()>=
            report["num_batched_functions"].as_u64().unwrap());
        assert!(shadow["conditional_interactive_bits"].as_f64().unwrap()<=170.0);
        assert_eq!(shadow["native_extension_field16_implemented"],false);
        assert_eq!(shadow["merkle_quantum_extraction_proved"],false);
        assert_eq!(shadow["pq128_demonstrated"],false);
        let committed_log=geometry["committed_log_degree"].as_u64().unwrap() as usize;
        assert_eq!(proof.degree_bits,vec![committed_log]);
        assert_eq!(committed_log,air.rows().ilog2() as usize+config.is_zk());
        let prep_meta=data.common.preprocessed.as_ref().unwrap()
            .instances[0].as_ref().unwrap();
        assert_eq!(prep_meta.degree_bits,committed_log);
        let actual_chunks=&proof.opened_values.instances[0]
            .base_opened_values.quotient_chunks;
        assert_eq!(actual_chunks.len(),report["num_quotient_chunks"].as_u64().unwrap() as usize);
        assert_eq!(actual_chunks.len(),geometry["quotient_chunks"].as_u64().unwrap() as usize);
        assert!(actual_chunks.iter().all(|chunk|chunk.len()==crate::EXT_DIM));
        let fri=&proof.opening_proof.1;
        let rounds=geometry["fri_rounds"].as_array().unwrap();
        assert_eq!(fri.commit_phase_commits.len(),rounds.len());
        assert_eq!(fri.commit_phase_openings.len(),rounds.len());
        for step in &fri.commit_phase_openings{
            assert!(step.sibling_values.iter().all(|values|values.len()==1));
        }
        assert_eq!(fri.final_poly.len(),geometry["terminal_polynomial_degree_strict_bound"].as_u64().unwrap() as usize);
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
    fn native_salted_mmcs_position_binding_rejects_row_and_salt_equivocation(){
        use p3_commit::{Mmcs as MmcsTrait,BatchOpeningRef};
        use p3_matrix::Dimensions;
        use rand::{SeedableRng,rngs::StdRng};
        // The exact hash labels, cap height, 512-bit digest shape and salt
        // count from the production PCS factory, but deterministic test-only
        // RNG. This regression is not a quantum collapse-binding theorem.
        let mmcs=crate::Mmcs::new(
            crate::FH::new(crate::Sha512Words(b"AEGIS_V4_P3_LEAF_SHA512_V2\0")),
            crate::Compress::new(crate::Sha512Words(
                b"AEGIS_V4_P3_NODE_SHA512_V2\0")),
            3,StdRng::seed_from_u64(42));
        let tall=RowMajorMatrix::new(
            (0..(16*2)).map(|i|F::from_u32((i+1) as u32))
                .collect::<Vec<_>>(),2);
        let short=RowMajorMatrix::new(
            (0..(8*3)).map(|i|F::from_u32((i+200) as u32))
                .collect::<Vec<_>>(),3);
        let dimensions=[Dimensions{width:2,height:16},
            Dimensions{width:3,height:8}];
        let (root,prover_data)=mmcs.commit(vec![tall,short]);
        let (opened,opening_proof)=mmcs.open_batch(5,&prover_data).unpack();
        assert!(mmcs.verify_batch(&root,&dimensions,5,
            BatchOpeningRef::new(&opened,&opening_proof)).is_ok());
        for matrix in 0..2{
            let mut forged=opened.clone();
            forged[matrix][0]+=F::ONE;
            assert!(mmcs.verify_batch(&root,&dimensions,5,
                BatchOpeningRef::new(&forged,&opening_proof)).is_err(),
                "an adversarial change to matrix {matrix} must be rejected");
        }
        let mut forged_salts=opening_proof.clone();
        forged_salts.0[0][0]+=F::ONE;
        assert!(mmcs.verify_batch(&root,&dimensions,5,
            BatchOpeningRef::new(&opened,&forged_salts)).is_err(),
            "same root and row cannot validate a changed private salt");
        let mut shortened=opened.clone();
        shortened[0].pop();
        assert!(mmcs.verify_batch(&root,&dimensions,5,
            BatchOpeningRef::new(&shortened,&opening_proof)).is_err());
        // Index binding: the same proof must not authorize an unrelated
        // global query coordinate. Other indices can map to same shorter
        // matrix row, but the tallest row and Merkle path are pinned.
        assert!(mmcs.verify_batch(&root,&dimensions,7,
            BatchOpeningRef::new(&opened,&opening_proof)).is_err());
    }
    #[test]
    fn audited_native_verifier_exports_real_samples_and_query_paths(){
        let air=circuit();
        let program=circuit_bytes(&air);
        let digest=hex::encode(Sha512::digest(&program));
        let trace=air.trace(&[0,1,1,1,1,1]).unwrap();
        let cfg=config();
        let instances=[StarkInstance::<Config,_>{
            air:&air,trace:&trace,public_values:air.public_values()
        }];
        let prep_cfg=preprocessing_config(&air);
        let data=ProverData::from_instances(&prep_cfg,&instances).unwrap();
        let proof=prove_batch(&cfg,&instances,&data).unwrap();
        let encoded=postcard::to_allocvec(&proof).unwrap();
        let bundle=serde_json::to_vec(&WiredBundle{
            scheme:WIRED_SCHEME.to_owned(),program_sha512:digest.clone(),
            proof:B64.encode(&encoded)
        }).unwrap();
        let audit=audit_wired_verifier_transcript(
            &program,&bundle,&digest).expect("native auditor accepts honest proof");
        assert_eq!(audit["verified_by_original_config"],true);
        assert_eq!(audit["verified_by_instrumented_config"],true);
        assert_eq!(audit["typed_replay"]
            ["native_transcript_bytes_and_samples_consistent"],true);
        assert_eq!(audit["typed_replay"]
            ["fri_derived_log_arities"].as_array().unwrap().len(),13);
        assert_eq!(audit["typed_replay"]
            ["fri_query_indices"].as_array().unwrap().len(),crate::QUERIES);
        assert_eq!(audit["typed_replay"]
            ["pcs_batch_gamma_basis"].as_array().unwrap().len(),crate::EXT_DIM);
        assert_eq!(audit["typed_replay"]["rho_basis"].as_array().unwrap().len(),crate::EXT_DIM);
        assert_eq!(audit["typed_replay"]["zeta_basis"].as_array().unwrap().len(),crate::EXT_DIM);
        let terms=audit["typed_replay"]["batch_polynomial_terms"]
            .as_array().unwrap();
        assert!(!terms.is_empty());
        assert!(terms.iter().any(|term|
            term["hiding_random_codewords"]==crate::RANDOM_CODEWORDS));
        assert!(terms.iter().any(|term|
            term["hiding_random_codewords"]==0));
        assert_eq!(audit["typed_replay"]["denominator_evaluations_exported"],true);
        assert_eq!(audit["typed_replay"]
            ["denominator_evaluations_came_from_upstream_verifier_hook"],false);
        let denominators=audit["typed_replay"]
            ["actual_pcs_query_denominator_evaluations"].as_array().unwrap();
        assert_eq!(denominators.len(),crate::QUERIES*terms.len());
        let modulus=2_013_265_921u64;
        for (i,rec) in denominators.iter().enumerate(){
            assert_eq!(rec["query"].as_u64().unwrap() as usize,i/terms.len());
            let x=rec["query_x_canonical"].as_u64().unwrap();
            let z=rec["z_basis"].as_array().unwrap();
            let d=rec["denominator_basis"].as_array().unwrap();
            assert_eq!(z.len(),crate::EXT_DIM);
            assert_eq!(d.len(),crate::EXT_DIM);
            assert!(x<modulus);
            let expected=(z[0].as_u64().unwrap()+modulus-x)%modulus;
            assert_eq!(d[0].as_u64(),Some(expected));
            assert!(z[1..].iter().zip(&d[1..]).all(|(a,b)|a==b));
            assert!(d.iter().any(|coord|coord.as_u64()!=Some(0)));
        }

        assert_eq!(audit["fri"]["fold_count"],13);
        assert_eq!(audit["fri"]["query_index_bits"],16);
        assert_eq!(audit["fri"]["initial_lde_rows"],65536);
        assert_eq!(audit["fri"]["queries"].as_array().unwrap().len(),crate::QUERIES);
        assert_eq!(audit["fri"]["fold_query_indices_after_each_round"]
            .as_array().unwrap().len(),crate::QUERIES);
        for (query,path) in audit["fri"]["queries"].as_array().unwrap().iter().zip(
            audit["fri"]["fold_query_indices_after_each_round"]
                .as_array().unwrap())
        {
            let mut index=query.as_u64().unwrap() as usize;
            for folded in path.as_array().unwrap(){
                index>>=1;
                assert_eq!(folded.as_u64().unwrap() as usize,index);
            }
        }
        assert_eq!(audit["whole_verifier_byte_transcript_equivalence_proved"],false);
        assert_eq!(audit["pq128_demonstrated"],false);
        // The observer never authorizes a proof rejected by the original path.
        let mut corrupted=serde_json::from_slice::<WiredBundle>(&bundle).unwrap();
        corrupted.program_sha512="00".repeat(64);
        let bad=serde_json::to_vec(&corrupted).unwrap();
        assert!(audit_wired_verifier_transcript(&program,&bad,&digest).is_err());
    }
    #[test]
    fn native_verifier_rejects_modified_fri_and_quotient_proof_objects(){
        // This is a real native verifier rejection test, NOT an argument
        // for extraction from an arbitrary malicious quantum commitment.
        let air=circuit();
        let trace=air.trace(&[0,1,1,1,1,1]).unwrap();
        let cfg=config();
        let instances=[StarkInstance::<Config,_>{
            air:&air,trace:&trace,public_values:air.public_values()
        }];
        let prep_cfg=preprocessing_config(&air);
        let data=ProverData::from_instances(&prep_cfg,&instances).unwrap();
        let proof=prove_batch(&cfg,&instances,&data).unwrap();
        let public=air.public_values();
        let verify=|candidate:&BatchProof<Config>|{
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(||{
                verify_batch(&cfg,&[air.clone()],candidate,
                    &[public.clone()],&data.common).is_ok()
            })).unwrap_or(false)
        };
        assert!(verify(&proof));
        // BatchProof does not implement Clone in the pinned Plonky3.
        // Deserialize fresh independent objects from the canonical encoding.
        let encoded=postcard::to_allocvec(&proof).unwrap();
        // Missing terminal polynomial coefficient cannot be accepted.
        let mut tampered:BatchProof<Config>=postcard::from_bytes(&encoded).unwrap();
        assert!(!tampered.opening_proof.1.final_poly.is_empty());
        tampered.opening_proof.1.final_poly.clear();
        assert!(!verify(&tampered));
        // The FRI query/opening shape is part of the authenticated proof.
        let mut tampered:BatchProof<Config>=postcard::from_bytes(&encoded).unwrap();
        assert!(!tampered.opening_proof.1.commit_phase_openings.is_empty());
        tampered.opening_proof.1.commit_phase_openings.pop();
        assert!(!verify(&tampered));
        // Hiding quotient-chunk opening shape must match verifier degree data.
        let mut tampered:BatchProof<Config>=postcard::from_bytes(&encoded).unwrap();
        assert!(!tampered.opened_values.instances[0]
            .base_opened_values.quotient_chunks.is_empty());
        tampered.opened_values.instances[0]
            .base_opened_values.quotient_chunks.pop();
        assert!(!verify(&tampered));
    }
    #[test]
    fn adversarial_gate_row_rebinding_is_rejected_by_logup(){
        let air=circuit();
        let mut trace=air.trace(&[0,1,1,1,1,1]).unwrap();
        // Change a gate-row argument without updating its globally unique
        // value in the wire table. The derived AND output now changes with a,
        // but the authentic wire-table assignment stays fixed: LogUp rejects.
        trace.values[0]=F::ZERO; // tamper first gate input; z is derived
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
