// Synthetic PRIVATE full-row oracle for a recovery rehearsal. This hands the
// extractor complete A/B/C evaluations, not a receipt or a committed proof.
import {inspect} from 'node:util';
import {P} from '../fri/field.mjs';
import {bitConstraintCount,bitConstraintRow,snapshotBitWitness,checkBitCircuit} from './bit-circuit.mjs';

export function privateRowOracle(circuit,assignment,{segmentRows=1024,maxSegments=8192}={}){
  if(!Number.isSafeInteger(segmentRows)||segmentRows<32||segmentRows>1024||(segmentRows&(segmentRows-1))!==0||
    !Number.isSafeInteger(maxSegments)||maxSegments<1||maxSegments>65536)throw new TypeError('invalid private row oracle budget');
  const constraints=bitConstraintCount(circuit),segments=Math.ceil(constraints/segmentRows);
  if(segments>maxSegments)throw new RangeError('private row oracle segment budget exceeded');
  const values=snapshotBitWitness(circuit,assignment);
  if(!checkBitCircuit(circuit,values)){values.fill(0);throw new Error('invalid private row oracle assignment');}
  let next=0,disposed=false;
  const scalars=new Map(),element=value=>{
    let canonical=value%P;if(canonical<0n)canonical+=P;
    if(!scalars.has(canonical))scalars.set(canonical,Object.freeze([canonical,0n,0n,0n,0n]));
    return scalars.get(canonical);
  },zero=element(0n);
  const evaluate=linear=>{
    let value=linear.constant;
    for(const term of linear.terms)if(values[term.wire])value+=term.coefficient;
    return element(value);
  };
  const source={constraints,segments,segmentRows};
  Object.defineProperties(source,{
    readSegment:{value(index){
      if(disposed||index!==next||index>=segments)throw new Error('PRIVATE_ROW_ORACLE_ORDER_OR_DISPOSED');
      next++;
      const firstConstraint=index*segmentRows,count=Math.min(segmentRows,constraints-firstConstraint);
      const a=Array(segmentRows).fill(zero),b=Array(segmentRows).fill(zero),c=Array(segmentRows).fill(zero);
      for(let local=0;local<count;local++){
        const row=bitConstraintRow(circuit,firstConstraint+local);
        a[local]=evaluate(row.A);b[local]=evaluate(row.B);c[local]=evaluate(row.C);
      }
      return {index,firstConstraint,constraints:count,domainSize:segmentRows,a,b,c};
    }},
    segmentsRead:{get(){return next;}},
    dispose:{value(){values.fill(0);scalars.clear();disposed=true;}},
    toJSON:{value(){throw new Error('PRIVATE_ROW_ORACLE_MUST_NOT_BE_SERIALIZED');}},
    [inspect.custom]:{value(){return '[PRIVATE complete row oracle; synthetic rehearsal only]';}},
  });
  return Object.freeze(source);
}
