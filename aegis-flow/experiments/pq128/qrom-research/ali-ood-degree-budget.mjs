// Conditional exact-rational degree budgeting for Aegis ALI/OOD.
// This is NOT p3-security's demonstrated bound, a PCS degree certificate,
// a transcript theorem, or a knowledge/RBR/QROM proof.
const P=2013265921n;
const int=(n,low,high)=>Number.isSafeInteger(n)&&n>=low&&n<=high;
const limit = 50_000_000;
export function conditionalAliOodBudget({
  fieldDegree=8,traceRows,airConstraintComponents,
  constraintPolynomialDegreeCap=null,quotientPolynomialDegreeCap=null,
}={}){
  if(!int(fieldDegree,1,32)||!int(traceRows,1,2**23)||
     !int(airConstraintComponents,1,limit)||
     (constraintPolynomialDegreeCap!==null&&!int(constraintPolynomialDegreeCap,0,limit))||
     (quotientPolynomialDegreeCap!==null&&!int(quotientPolynomialDegreeCap,0,limit)))
    throw new TypeError('INVALID_OR_MISSING_WIRED_DEGREE_BUDGET');
  const fieldSize=P**BigInt(fieldDegree);
  const ali=BigInt(airConstraintComponents-1);
  const hasCaps=constraintPolynomialDegreeCap!==null&&quotientPolynomialDegreeCap!==null;
  const residualCap=hasCaps
    ?Math.max(constraintPolynomialDegreeCap,traceRows+quotientPolynomialDegreeCap)
    :null;
  // Worst-case union of (i) composition-alpha cancellation at one
  // fixed invalid trace row, (ii) OOD residual roots, (iii) zeta in H.
  // This formula is conditional on a fixed oracle *before* each random draw.
  const ood=residualCap===null?null:BigInt(residualCap+traceRows);
  const total=ood===null?null:ali+ood;
  return Object.freeze({
    schema:'AEGIS_ALI_OOD_CONDITIONAL_DEGREE_BUDGET_V1',
    BabyBear_prime:P.toString(),
    extension_degree:fieldDegree,
    trace_rows:traceRows,
    air_constraint_components:airConstraintComponents,
    constraint_degree_cap:constraintPolynomialDegreeCap,
    quotient_degree_cap:quotientPolynomialDegreeCap,
    composition_exceptional_alpha:Object.freeze({
      numerator:ali.toString(),denominator:fieldSize.toString(),
    }),
    ood_exceptional_zeta:ood===null?null:Object.freeze({
      numerator:ood.toString(),denominator:fieldSize.toString(),
    }),
    conditional_combined_bound:total===null?null:Object.freeze({
      numerator:total.toString(),denominator:fieldSize.toString(),
    }),
    needs_actual_compiled_polynomial_degree_caps:!hasCaps,
    // The AIR symbolic constraint degree is NOT itself a polynomial
    // degree bound in X. Inputs cannot certify a malicious commitment.
    degree_caps_independently_proved:false,
    quotient_chunk_recomposition_proved:false,
    quantum_knowledge_soundness_proved:false,
    pq128_demonstrated:false,production_ready:false,
  });
}
