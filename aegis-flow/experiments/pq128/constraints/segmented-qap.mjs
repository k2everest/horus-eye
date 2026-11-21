// PRIVATE segmented arithmetization only. No commitment opening/linear-check
// protocol, public proof, zero-knowledge theorem or PQ128 claim is supplied.
import {inspect} from 'node:util';
import {P,W,ZERO,fromBase,add,sub,mul,equal,fft} from '../fri/field.mjs';
import {bindingDigest512} from '../bindings.mjs';
import {maskTrace} from '../financial/masking.mjs';
import {bitConstraintCount,bitConstraintRow,bitCircuitDigest512,snapshotBitWitness,checkBitCircuit} from './bit-circuit.mjs';
import {commitPrivateWitness,MAX_COMMITTED_WIRES} from './witness-commitment.mjs';
import {checkTransferConstraints512} from './transfer.mjs';
const freeze=Object.freeze;
const privateObject=(properties,metadata)=>{
  const result={...metadata};
  for(const [k,v] of Object.entries(properties))Object.defineProperty(result,k,{value:v,enumerable:false});
  Object.defineProperties(result,{toJSON:{value(){throw new Error('PRIVATE_SEGMENTED_QAP_MUST_NOT_BE_SERIALIZED');}},
    [inspect.custom]:{value(){return '[PRIVATE segmented circuit polynomials; not a proof]';}}});
  return freeze(result);
};
const nextPow2=n=>{let size=1;while(size<n)size*=2;return size;};
function options(opts){
  if(!opts||typeof opts!=='object'||Array.isArray(opts)||Object.keys(opts).sort().join(',')!=='maskCoefficients,maxSegments,segmentRows')throw new TypeError('explicit segmentation budget required');
  const {segmentRows,maxSegments,maskCoefficients:r}=opts;
  if(!Number.isSafeInteger(segmentRows)||segmentRows<32||segmentRows>1024||(segmentRows&(segmentRows-1))!==0||
    !Number.isSafeInteger(maxSegments)||maxSegments<1||maxSegments>65536||!Number.isSafeInteger(r)||r<1||r>1024)throw new TypeError('invalid segmentation budget');
  return {segmentRows,maxSegments,r};
}
export function planBitQap(circuit,opts){
  const {segmentRows,maxSegments,r}=options(opts),constraints=bitConstraintCount(circuit),segments=Math.ceil(constraints/segmentRows);
  return freeze({schema:'AEGIS_EXPERIMENT_BIT_QAP_PLAN_V1',constraints,wireCount:circuit.wireCount,segmentRows,segments,maxSegments,
    maskCoefficients:r,maskedDegreeBound:segmentRows+r,quotientDegreeBound:segmentRows+2*r-1,
    convolutionSize:nextPow2(2*(segmentRows+r)-1),segmentBudgetMet:segments<=maxSegments,
    witnessCommitmentBudgetMet:circuit.wireCount<=MAX_COMMITTED_WIRES,
    withinBudget:segments<=maxSegments&&circuit.wireCount<=MAX_COMMITTED_WIRES,
    private_proof:false,aegis_target_met:false});
}

export function preparePrivateBitQap(circuit,witness,statementDigest,opts){
  if(typeof statementDigest!=='string'||!/^[0-9a-f]{128}$/.test(statementDigest))throw new TypeError('canonical statement digest required');
  const plan=planBitQap(circuit,opts);
  if(!plan.withinBudget)throw new RangeError('QAP_RESOURCE_BUDGET_EXCEEDED');
  const values=snapshotBitWitness(circuit,witness);
  if(!checkBitCircuit(circuit,values))throw new Error('INVALID_BIT_CONSTRAINT_WITNESS');
  const circuitDigest=bitCircuitDigest512(circuit);
  const commitment=commitPrivateWitness({values,schemaDigest:circuitDigest,statementDigest});
  const n=plan.segmentRows,r=plan.maskCoefficients;
  // A row references global wire IDs in this one private snapshot. Segments
  // cannot select separate caller-supplied assignments after preparation.
  const evaluate=linear=>fromBase(linear.terms.reduce((sum,{wire,coefficient})=>(sum+coefficient*BigInt(values[wire]))%P,linear.constant));
  function segment(index){
    if(!Number.isSafeInteger(index)||index<0||index>=plan.segments)throw new RangeError('invalid segment index');
    const first=index*n,count=Math.min(n,plan.constraints-first);
    const traces=[0,1,2].map(()=>Array.from({length:n},()=>ZERO));
    for(let i=0;i<count;i++){
      const row=bitConstraintRow(circuit,first+i);
      traces[0][i]=evaluate(row.A);traces[1][i]=evaluate(row.B);traces[2][i]=evaluate(row.C);
      if(!equal(mul(traces[0][i],traces[1][i]),traces[2][i]))throw new Error('INVALID_SEGMENT_RELATION');
    }
    const [a,b,c]=traces.map(t=>maskTrace(t,{maskCoefficients:r}).coefficients);
    const size=plan.convolutionSize,length=2*(n+r)-1;
    const padded=poly=>Array.from({length:size},(_,i)=>poly[i]??ZERO);
    const av=fft(padded(a)),bv=fft(padded(b));
    const product=fft(av.map((v,i)=>mul(v,bv[i])),true);
    for(let i=length;i<product.length;i++)if(!equal(product[i],ZERO))throw new Error('SEGMENT_CONVOLUTION_ALIAS');
    const remainder=Array.from({length:length},(_,i)=>sub(product[i],c[i]??ZERO)),quotient=Array.from({length:length-n},()=>ZERO);
    for(let i=length-1;i>=n;i--){const x=remainder[i];quotient[i-n]=x;remainder[i]=ZERO;remainder[i-n]=add(remainder[i-n],x);}
    if(remainder.some(v=>!equal(v,ZERO)))throw new Error('SEGMENT_NONZERO_REMAINDER');
    const polynomials=privateObject({a,b,c,quotient:freeze(quotient)},{});
    return privateObject({polynomials},{schema:'AEGIS_EXPERIMENT_PRIVATE_BIT_QAP_SEGMENT_V1',index,firstConstraint:first,constraints:count,
      domainSize:n,maskedDegreeBound:n+r,quotientDegreeBound:n+2*r-1,private_proof:false});
  }
  const publicContext={schema:'AEGIS_EXPERIMENT_BIT_QAP_PUBLIC_CONTEXT_V1',circuitDigest,statementDigest,
    witnessRoot:commitment.root,wireCount:plan.wireCount,constraints:plan.constraints,segmentRows:n,segments:plan.segments,
    maskCoefficients:r,fieldPrime:P.toString(),fieldExtensionDegree:ZERO.length,fieldNonResidue:W.toString(),
    maskedDegreeBound:plan.maskedDegreeBound,quotientDegreeBound:plan.quotientDegreeBound,convolutionSize:plan.convolutionSize};
  const contextDigest=bindingDigest512({domain:'SEGMENTED_QAP_CONTEXT',parts:[Buffer.from(JSON.stringify(publicContext),'utf8')]});
  const publicInputs=freeze({...publicContext,contextDigest,private_proof:false,aegis_target_met:false,production_ready:false});
  return privateObject({segment,commitment},{plan,publicInputs});
}

export function preparePrivateTransferQap(relation,witness,opts){
  // The wrapper pins the public digest chosen by the trusted transfer compiler.
  if(!checkTransferConstraints512(relation,witness))throw new Error('INVALID_TRANSFER_CONSTRAINT_ASSIGNMENT');
  return preparePrivateBitQap(relation.circuit,witness,relation.statement_digest,opts);
}
