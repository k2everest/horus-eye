// Experimental, non-hiding low-degree proof over a quintic field. No financial
// AIR, no transaction verification, no certified CMS transcript equivalence.
import {P, ZERO, add, sub, mul, scale, equal, assertElement, encodeElement, decodeElement, fft, rootOfUnity} from './field.mjs';
import {buildMerkle, verifyMany} from './merkle.mjs';
import {Transcript} from './transcript.mjs';
import {bindingFrame512} from '../bindings.mjs';

export const FRI_SCHEMA='AEGIS_EXPERIMENT_BINARY_FRI_V1';
const INV2=(P+1n)/2n;
function power(a,n){let result=1n;for(;n>0n;n>>=1n,a=a*a%P)if(n&1n)result=result*a%P;return result;}
function parameters(domainLog2,queries,context){
  if(!Number.isSafeInteger(domainLog2)||domainLog2<3||domainLog2>16||
     !Number.isSafeInteger(queries)||queries<1||queries>1024||
     !(context instanceof Uint8Array)||context.length>8192)throw new TypeError('invalid experimental FRI parameters');
  const n=2**domainLog2,degreeBound=n/4;
  const integers=Buffer.alloc(12);integers.writeUInt32BE(domainLog2);integers.writeUInt32BE(degreeBound,4);integers.writeUInt32BE(queries,8);
  return {n,degreeBound,rounds:domainLog2-2,transcriptContext:bindingFrame512({domain:'FRI_PARAMETERS',
    parts:[Buffer.from(FRI_SCHEMA),integers,Buffer.from(context)]})};
}
function schema(value,fields){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...fields].sort().join(',');}
const encode=e=>encodeElement(e).toString('hex');
function decode(s){if(typeof s!=='string'||!/^[0-9a-f]{80}$/.test(s))throw new TypeError('noncanonical field encoding');return decodeElement(Buffer.from(s,'hex'));}
function folded(left,right,alpha,inverseX){
  return add(scale(add(left,right),INV2),mul(alpha,scale(sub(left,right),INV2*inverseX%P)));
}
function foldLayer(values,alpha,logSize){
  const half=values.length/2,out=new Array(half),inverseRoot=power(rootOfUnity(logSize),P-2n);
  let inverseX=1n;
  for(let i=0;i<half;i++,inverseX=inverseX*inverseRoot%P)out[i]=folded(values[i],values[i+half],alpha,inverseX);
  return out;
}

// All coefficients here are PUBLIC. This API must not receive private notes,
// spending secrets or a financial witness; ordinary FRI is not zero knowledge.
export function proveLowDegree({coefficients,domainLog2=8,queries=720,context}){
  const p=parameters(domainLog2,queries,context);
  if(!Array.isArray(coefficients)||!coefficients.length||coefficients.length>p.degreeBound)throw new TypeError('coefficient degree exceeds bound');
  const padded=Array.from({length:p.n},(_,i)=>{const v=i<coefficients.length?coefficients[i]:ZERO;assertElement(v);return [...v];});
  const transcript=new Transcript({context:p.transcriptContext}),layers=[],trees=[],roots=[];
  let values=fft(padded);
  for(let round=0;round<=p.rounds;round++){
    const tree=buildMerkle(values.map(encodeElement));
    layers.push(values);trees.push(tree);roots.push(tree.root);transcript.commit(tree.root);
    if(round<p.rounds)values=foldLayer(values,transcript.fieldChallenge(),domainLog2-round);
  }
  if(!values.every(v=>equal(v,values[0])))throw new Error('FRI_FINAL_LAYER_NOT_CONSTANT');
  const indices=transcript.queryIndices({size:p.n,count:queries});
  const openings=trees.slice(0,-1).map((tree,round)=>{
    const half=layers[round].length/2;
    return tree.openMany(indices.flatMap(i=>[i%half,i%half+half]));
  });
  return {root:roots[0],proof:{schema:FRI_SCHEMA,roots,final_value:encode(values[0]),layers:openings},
    diagnostics:{experimental:true,hiding:false,financial_proof:false,aegis_target_met:false,
      domain_size:p.n,degree_bound:p.degreeBound,queries,transcript_oracle_calls:transcript.oracleCalls}};
}

// Expected root, application context and policy parameters come from the caller,
// never from fields in an untrusted proof. This verifier does not authorize money.
export function verifyLowDegree({root,domainLog2=8,queries=720,context,proof}){
  try{
    const p=parameters(domainLog2,queries,context);
    if(typeof root!=='string'||!/^[0-9a-f]{128}$/.test(root)||
      !schema(proof,['schema','roots','final_value','layers'])||proof.schema!==FRI_SCHEMA||
      !Array.isArray(proof.roots)||proof.roots.length!==p.rounds+1||proof.roots[0]!==root||
      !Array.isArray(proof.layers)||proof.layers.length!==p.rounds)return false;
    const transcript=new Transcript({context:p.transcriptContext}),alphas=[];
    for(let round=0;round<=p.rounds;round++){
      transcript.commit(proof.roots[round]);
      if(round<p.rounds)alphas.push(transcript.fieldChallenge());
    }
    const finalValue=decode(proof.final_value);
    const finalTree=buildMerkle(Array.from({length:4},()=>encodeElement(finalValue)));
    if(finalTree.root!==proof.roots[p.rounds])return false;
    const indices=transcript.queryIndices({size:p.n,count:queries});
    const maps=[];
    for(let round=0;round<p.rounds;round++){
      const size=p.n/2**round,half=size/2,needed=indices.flatMap(i=>[i%half,i%half+half]);
      if(!verifyMany({root:proof.roots[round],size,indices:needed,proof:proof.layers[round]}))return false;
      maps.push(new Map(proof.layers[round].leaves.map(leaf=>[leaf.index,decode(leaf.value)])));
    }
    for(let q=0;q<queries;q++){
      let index=indices[q],expected;
      for(let round=0;round<p.rounds;round++){
        const size=p.n/2**round,half=size/2,position=index%half;
        const left=maps[round].get(position),right=maps[round].get(position+half);
        if(expected&&!equal(expected,index<half?left:right))return false;
        const inverseX=power(rootOfUnity(domainLog2-round),(P-1n-BigInt(position))%(P-1n));
        expected=folded(left,right,alphas[round],inverseX);index=position;
      }
      if(!equal(expected,finalValue))return false;
    }
    return true;
  }catch{return false;}
}
