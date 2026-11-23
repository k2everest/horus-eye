// Deterministic, PRIVATE recovery from complete experimental IOP oracles.
// This is not an extractor from a receipt, a QROM extractor, or a proof verifier.
import {createHash} from 'node:crypto';
import {inspect} from 'node:util';
import {P,assertElement,rootOfUnity} from '../fri/field.mjs';
import {bitCircuitDigest512,bitConstraintCount,bitConstraintRow,checkBitCircuit} from './bit-circuit.mjs';
const freeze=Object.freeze,MAX_WIRES=8_000_000;
const mod=n=>{const r=n%P;return r<0n?r+P:r;};
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys;

function baseFft(input){
  const a=input.slice(),n=a.length;
  for(let i=1,j=0;i<n;i++){
    let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;
    if(i<j)[a[i],a[j]]=[a[j],a[i]];
  }
  for(let width=2;width<=n;width*=2){
    const step=rootOfUnity(Math.log2(width));
    for(let start=0;start<n;start+=width){
      let twiddle=1n;
      for(let j=0;j<width/2;j++){
        const left=a[start+j],right=a[start+j+width/2]*twiddle%P;
        a[start+j]=mod(left+right);a[start+j+width/2]=mod(left-right);
        twiddle=twiddle*step%P;
      }
    }
  }
  return a;
}

function snapshotOracle(values,{n,r,format,digest}){
  if(!Array.isArray(values))throw new Error('oracle bound');
  // A callback may supply a Proxy. Read and validate length once so repeated
  // getter reads cannot bypass the allocation/iteration resource cap.
  const length=values.length;
  if(!Number.isSafeInteger(length)||length<0||length>(format==='coefficients'?n+r:n)||
    (format==='domain-values'&&length!==n))throw new Error('oracle bound');
  const folded=Array.from({length:n},()=>[0n,0n,0n,0n,0n]);
  const bytes=Buffer.alloc(length*(format==='coefficients'?40:8));
  digest.update(u32(length));
  for(let i=0;i<length;i++){
    const source=values[i];if(!Array.isArray(source)||source.length!==5)throw new Error('oracle element');
    // Copy once before validation: callers cannot change the checked limbs
    // through an alias or a getter read a second time.
    const v=[source[0],source[1],source[2],source[3],source[4]];assertElement(v);
    if(format==='domain-values'&&v.slice(1).some(x=>x!==0n))throw new Error('non-base evaluation');
    for(let limb=0;limb<5;limb++){
      folded[i%n][limb]=(folded[i%n][limb]+v[limb])%P;
      if(format==='coefficients')bytes.writeBigUInt64BE(v[limb],40*i+8*limb);
    }
    if(format==='domain-values')bytes.writeBigUInt64BE(v[0],8*i);
  }
  digest.update(bytes);bytes.fill(0);
  // X^n=1 on H. Sum ALL coefficients by exponent modulo n, including r>n.
  // Invertibility of the base-domain FFT means nonzero extension coordinates
  // cannot evaluate to base-field rows everywhere on H.
  if(folded.some(v=>v.slice(1).some(x=>x!==0n)))throw new Error('non-base oracle domain');
  const base=folded.map(v=>v[0]);
  return format==='coefficients'?baseFft(base):base;
}

export function recoverBitWitnessFromOracles(options){
  let values;
  try{
    if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>
      !['circuit','statementDigest','segmentRows','maskCoefficients','maxSegments','maxWires','oracleFormat','readSegment'].includes(k)))throw new Error('extraction options');
    const {circuit,statementDigest,segmentRows,maskCoefficients,maxSegments,maxWires,oracleFormat='coefficients',readSegment}=options;
    if(typeof statementDigest!=='string'||!/^[0-9a-f]{128}$/.test(statementDigest)||
      !Number.isSafeInteger(maxWires)||maxWires<2||maxWires>MAX_WIRES||
      !['coefficients','domain-values'].includes(oracleFormat)||typeof readSegment!=='function')throw new Error('extraction profile');
    if(!Number.isSafeInteger(segmentRows)||segmentRows<32||segmentRows>1024||(segmentRows&(segmentRows-1))!==0||
      !Number.isSafeInteger(maskCoefficients)||maskCoefficients<1||maskCoefficients>1024||
      !Number.isSafeInteger(maxSegments)||maxSegments<1||maxSegments>65536)throw new Error('oracle resource profile');
    const constraints=bitConstraintCount(circuit),segments=Math.ceil(constraints/segmentRows);
    const plan={constraints,segments,segmentRows,maskCoefficients};
    if(segments>maxSegments||circuit.wireCount>maxWires)throw new Error('extraction budget');
    const circuitDigest=bitCircuitDigest512(circuit),n=plan.segmentRows,r=plan.maskCoefficients;
    const digest=createHash('sha512').update('AEGIS_PRIVATE_ORACLE_RECOVERY_V1\0').update(circuitDigest).update(statementDigest)
      .update(oracleFormat).update(u32(n)).update(u32(r)).update(u32(plan.segments));
    values=new Uint8Array(circuit.wireCount);values.fill(2);values[0]=0;values[1]=1;
    const evaluate=linear=>{
      let total=linear.constant;
      for(const {wire,coefficient} of linear.terms){if(values[wire]>1)throw new Error('unknown wire');if(values[wire]===1)total+=coefficient;}
      return mod(total);
    };
    let rows=0;
    for(let index=0;index<plan.segments;index++){
      // Exactly one read. Re-reading prepared QAP segments would generate new
      // masks and would not be extraction from the same oracle transcript.
      const source=readSegment(index);
      if(!exact(source,'a,b,c,constraints,domainSize,firstConstraint,index'))throw new Error('segment schema');
      const metadata=[source.index,source.firstConstraint,source.constraints,source.domainSize];
      const first=index*n,count=Math.min(n,plan.constraints-first);
      if(metadata[0]!==index||metadata[1]!==first||metadata[2]!==count||metadata[3]!==n)throw new Error('segment coverage');
      for(const v of metadata)digest.update(u32(v));
      const rawA=source.a,rawB=source.b,rawC=source.c;
      const A=snapshotOracle(rawA,{n,r,format:oracleFormat,digest}),
        B=snapshotOracle(rawB,{n,r,format:oracleFormat,digest}),C=snapshotOracle(rawC,{n,r,format:oracleFormat,digest});
      for(let local=0;local<n;local++){
        if(local>=count){if(A[local]!==0n||B[local]!==0n||C[local]!==0n)throw new Error('nonzero padding');continue;}
        const rowIndex=first+local;
        if(rowIndex>=2&&rowIndex<2+circuit.wireCount){
          const wire=rowIndex-2,value=A[local];
          if(value!==0n&&value!==1n)throw new Error('non-Boolean extraction');
          if(wire<2&&value!==BigInt(wire))throw new Error('constant pin');
          values[wire]=Number(value);
        }
        const row=bitConstraintRow(circuit,rowIndex);
        if(A[local]!==evaluate(row.A)||B[local]!==evaluate(row.B)||C[local]!==evaluate(row.C)||A[local]*B[local]%P!==C[local])throw new Error('inconsistent global assignment');
        rows++;
      }
    }
    if(rows!==bitConstraintCount(circuit)||values.some(v=>v>1)||!checkBitCircuit(circuit,values))throw new Error('incomplete extraction');
    const owned=values;values=null;let disposed=false;
    const result={schema:'AEGIS_PRIVATE_ORACLE_RECOVERY_V1',scope:'complete-private-iop-oracles-only',
      circuitDigest,statementDigest,oracleTranscriptDigest:digest.digest('hex'),segments:plan.segments,
      constraintsChecked:rows,wireCount:owned.length,receipt_extractor:false,knowledge_soundness_demonstrated:false,
      qap_identity_checked:false,witness_commitment_binding_checked:false,aegis_target_met:false,production_ready:false};
    Object.defineProperties(result,{
      values:{get(){if(disposed)throw new Error('PRIVATE_RECOVERY_DISPOSED');return Uint8Array.from(owned);}},
      dispose:{value(){owned.fill(0);disposed=true;}},
      toJSON:{value(){throw new Error('PRIVATE_RECOVERED_WITNESS_MUST_NOT_BE_SERIALIZED');}},
      [inspect.custom]:{value(){return '[PRIVATE oracle witness recovery; not a receipt proof]';}},
    });
    return freeze(result);
  }catch{
    values?.fill(0);throw new Error('PRIVATE_ORACLE_EXTRACTION_FAILED');
  }
}
