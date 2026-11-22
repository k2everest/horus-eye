//! SHA-512 Boolean arithmetic core for the future financial AIR.
//! This is a REAL Plonky3 AIR enforcing one full-adder and SHA-512
//! choose/majority Boolean gate per row. It is NOT the full SHA-512
//! compression function and does NOT bind note preimages or Merkle paths.
//! Rows are not linked to a SHA-512 schedule yet. Research-only.
use p3_air::{Air,AirBuilder,BaseAir,WindowAccess};
use p3_field::PrimeCharacteristicRing;
use p3_matrix::dense::RowMajorMatrix;
use p3_uni_stark::{prove,verify};
use crate::{F,config,ROWS};

pub const WIDTH:usize=8;
// Columns a,b,c, xor_ab, and_ab, sum3, carry3, choose_a_b_c.
// The carry uses majority(a,b,c), as required by a three-input bit adder.
#[derive(Clone)]
pub struct Sha512BooleanGateAir;
impl<T> BaseAir<T> for Sha512BooleanGateAir {
    fn width(&self)->usize {WIDTH}
    fn main_next_row_columns(&self)->Vec<usize>{vec![]}
}
impl<AB:AirBuilder> Air<AB> for Sha512BooleanGateAir{
    fn eval(&self,builder:&mut AB){
        let w=builder.main();
        let row=w.current_slice();
        let a:AB::Expr=row[0].into();
        let b:AB::Expr=row[1].into();
        let c:AB::Expr=row[2].into();
        let xor:AB::Expr=row[3].into();
        let and:AB::Expr=row[4].into();
        let sum:AB::Expr=row[5].into();
        let carry:AB::Expr=row[6].into();
        let choice:AB::Expr=row[7].into();
        for bit in [a.clone(),b.clone(),c.clone(),xor.clone(),
          and.clone(),sum.clone(),carry.clone(),choice.clone()]{
            builder.assert_zero(bit.clone()*(bit-AB::Expr::ONE));
        }
        let ab=a.clone()*b.clone();
        builder.assert_eq(and.clone(),ab.clone());
        builder.assert_eq(xor.clone(),a.clone()+b.clone()-ab.clone()*AB::Expr::from_u32(2));
        // full-adder sum = (a XOR b) XOR c
        builder.assert_eq(sum,xor.clone()+c.clone()-xor.clone()*c.clone()*AB::Expr::from_u32(2));
        // full-adder carry = (a AND b) OR ((a XOR b) AND c)
        builder.assert_eq(carry,and+xor*c.clone());
        // SHA-512 Ch(a,b,c) = a*b + (1-a)*c
        builder.assert_eq(choice,ab+(AB::Expr::ONE-a)*c);
    }
}
pub fn gate_trace()->RowMajorMatrix<F>{
    let mut values=Vec::with_capacity(ROWS*WIDTH);
    for i in 0..ROWS{
        let a=(i&1) as u32,b=((i>>1)&1) as u32,c=((i>>2)&1) as u32;
        let x=a^b;
        let row=[a,b,c,x,a&b,x^c,(a&b)|(x&c),(a&b)|((1-a)&c)];
        values.extend(row.into_iter().map(F::from_u32));
    }
    RowMajorMatrix::new(values,WIDTH)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn arithmetic_matches_boolean_sha512_word_primitives(){
        for a in 0u32..=1{for b in 0u32..=1{for c in 0u32..=1{
            let xor=a+b-2*a*b;
            assert_eq!(xor,a^b);
            assert_eq!(xor+c-2*xor*c,a^b^c);
            assert_eq!(a*b+xor*c,(a&b)|((a^b)&c));
            assert_eq!(a*b+(1-a)*c,(a&b)|((1-a)&c));
        }}}
    }
    #[test]
    fn corrupted_boolean_gate_is_not_accepted_by_real_verifier(){
        let air=Sha512BooleanGateAir;
        let mut trace=gate_trace();
        // Row 0 has a=b=c=0 and must have sum=0. Force the full-adder
        // output to 1 while preserving all other witness columns.
        trace.values[5]=F::ONE;
        match prove(&config(),&air,trace,&[]){
            Ok(proof)=>assert!(verify(&config(),&air,&proof,&[]).is_err()),
            Err(_)=>{}, // fail-closed prover rejection is also correct
        }
    }
    #[test]
    fn real_hiding_plonky3_boolean_core_proof_verifies(){
        let air=Sha512BooleanGateAir;
        let proof=prove(&config(),&air,gate_trace(),&[]).unwrap();
        assert!(verify(&config(),&air,&proof,&[]).is_ok());
    }
}
