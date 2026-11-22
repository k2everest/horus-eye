//! Plonky3 0.8.0 R1CS Boolean gate wiring via a LogUp permutation bus.
//!
//! The public circuit is a FIXED program, not a prover-chosen circuit.
//! Its instruction table and fixed pin values live in the PREPROCESSED
//! columns committed by batch-STARK.  Each gate references a unique wire
//! table using (wire_index, wire_bit) messages on a common LogUp bus.
//! The wire table contributes exactly the program-fixed use multiplicity.
//! This prevents a malicious prover assigning two values to one wire.
//!
//! This module is a general-purpose R1CS/Boolean wiring ENGINE, not
//! confirmation of financial PQ128 or a benchmark of the 6-SHA-512 program.
//! A financial verifier must derive the program from an independently
//! authenticated statement before constructing a verifier instance.
use std::sync::Arc;
use p3_air::{Air,AirBuilder,BaseAir,PermutationAirBuilder,WindowAccess};
use p3_batch_stark::{ProverData,StarkInstance,prove_batch,verify_batch};
use p3_field::{Field,PrimeCharacteristicRing};
use p3_lookup::{Count,InteractionBuilder,LookupBus};
use p3_matrix::dense::RowMajorMatrix;
use p3_uni_stark::StarkGenericConfig;
use crate::{F,Config,config};

const PROGRAM_MAGIC:&[u8]=b"AEGIS_V4_BOOLEAN_PROGRAM_V1\0";
const MAX_GATES:usize=8_000_000;
const MAX_WIRES:usize=12_000_000;
const MIN_ROWS:usize=4096;
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
}
impl PublicProgram{
    pub(crate) fn from_gates(gates:Vec<Gate>,wire_count:usize)->Result<Self,()>{
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
        Ok(Self{gates:gates.into(),use_counts:counts.into(),wire_count,rows})
    }
    pub(crate) fn from_bytes(bytes:&[u8])->Result<Self,()>{
        let prefix=PROGRAM_MAGIC.len();
        if bytes.len()<prefix+8||&bytes[..prefix]!=PROGRAM_MAGIC{return Err(());}
        let n=u32::from_be_bytes(bytes[prefix..prefix+4].try_into().map_err(|_|())?) as usize;
        let m=u32::from_be_bytes(bytes[prefix+4..prefix+8].try_into().map_err(|_|())?) as usize;
        if n>MAX_WIRES||m>MAX_GATES||
           bytes.len()!=prefix+8+m.checked_mul(13).ok_or(())?{return Err(());}
        let mut gates=Vec::with_capacity(m);
        for chunk in bytes[prefix+8..].chunks_exact(13){
            let word=|i|u32::from_be_bytes(chunk[i..i+4].try_into().unwrap());
            gates.push(Gate{op:chunk[0],a:word(1),b:word(5),z:word(9)});
        }
        Self::from_gates(gates,n)
    }
    pub(crate) fn from_parts(gates:Vec<Gate>,wire_count:usize)->Self{
        Self::from_gates(gates,wire_count).expect("trusted public circuit shape")
    }
}

#[derive(Clone,Debug)]
pub(crate) struct WiredAir{program:Arc<PublicProgram>}
impl WiredAir{
    pub(crate) fn new(program:PublicProgram)->Self{Self{program:Arc::new(program)}}
    pub(crate) fn trace(&self,bits:&[u8])->Result<RowMajorMatrix<F>,()>{
        if bits.len()!=self.program.wire_count||
            bits.iter().any(|&b|b>1)||bits[0]!=0||bits[1]!=1{return Err(());}
        let mut trace=Vec::with_capacity(self.program.rows*GATE_WIDTH);
        for i in 0..self.program.rows{
            let (a,b,z)=if let Some(g)=self.program.gates.get(i){
                (bits[g.a as usize],bits[g.b as usize],bits[g.z as usize])
            }else{(0,0,0)};
            let w=bits.get(i).copied().unwrap_or(0);
            trace.extend([a,b,z,w].map(|x|F::from_u32(x as u32)));
        }
        Ok(RowMajorMatrix::new(trace,GATE_WIDTH))
    }
    pub(crate) fn rows(&self)->usize{self.program.rows}
}
impl<T:Field> BaseAir<T> for WiredAir{
    fn width(&self)->usize{GATE_WIDTH}
    fn preprocessed_width(&self)->usize{PREP_WIDTH}
    fn main_next_row_columns(&self)->Vec<usize>{vec![]}
    fn preprocessed_next_row_columns(&self)->Vec<usize>{vec![]}
    fn preprocessed_trace(&self)->Option<RowMajorMatrix<T>>{
        let mut v=Vec::with_capacity(self.program.rows*PREP_WIDTH);
        for i in 0..self.program.rows{
            let g=self.program.gates.get(i);
            let op=g.map(|x|x.op).unwrap_or(0);
            let a=g.map(|x|x.a).unwrap_or(0);
            let b=g.map(|x|x.b).unwrap_or(0);
            let z=g.map(|x|x.z).unwrap_or(0);
            let row=[
                u32::from(g.is_some()),u32::from(op==1),u32::from(op==2),
                u32::from(op==3),u32::from(op==4),a,b,z,
                i as u32,self.program.use_counts.get(i).copied().unwrap_or(0),
                u32::from(i==0),u32::from(i==1),
            ];
            v.extend(row.map(T::from_u32));
        }
        Some(RowMajorMatrix::new(v,PREP_WIDTH))
    }
}
impl<AB> Air<AB> for WiredAir
where AB:AirBuilder+PermutationAirBuilder+InteractionBuilder{
    fn eval(&self,builder:&mut AB){
        let row=builder.main();
        let s=row.current_slice();
        let a:AB::Expr=s[0].into();
        let b:AB::Expr=s[1].into();
        let z:AB::Expr=s[2].into();
        let wire:AB::Expr=s[3].into();
        let prep=builder.preprocessed();
        let c=prep.current_slice();
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
        for bit in [&a,&b,&z,&wire]{
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
        let inst=[StarkInstance::<Config,_>{air:&air,trace:&trace,public_values:vec![]}];
        let data=ProverData::from_instances(&config,&inst).unwrap();
        let proof=prove_batch(&config,&inst,&data).unwrap();
        verify_batch(&config,&[air],&proof,&[vec![]],&data.common).unwrap();
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
        let inst=[StarkInstance::<Config,_>{air:&air,trace:&trace,public_values:vec![]}];
        let run=std::panic::catch_unwind(std::panic::AssertUnwindSafe(||{
            let data=ProverData::from_instances(&config,&inst).unwrap();
            match prove_batch(&config,&inst,&data){
                Ok(p)=>verify_batch(&config,&[air],&p,&[vec![]],&data.common).is_err(),
                Err(_)=>true,
            }
        }));
        assert!(run.unwrap_or(true));
    }
}
