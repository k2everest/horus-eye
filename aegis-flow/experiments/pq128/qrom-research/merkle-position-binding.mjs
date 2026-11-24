// Local Merkle-cap position-binding reduction for the pinned
// Plonky3 0.8.0 salted-MMCS binary, cap-height-three profile.
// Abstracts away the actual mixed-height leaf packing: caller supplies
// the EXPLICIT verifier-approved salted leaf byte string. Thus this
// proves one binary capped-tree subgame, not global oracle extraction,
// collapse-binding, QROM RBR knowledge, or PQ128.
import {createHash} from 'node:crypto';
const fail=m=>{throw new TypeError('MERKLE_BINDING_'+m)};
const pow2=n=>Number.isSafeInteger(n)&&n>=0&&n<=24&&2**n;
const bytes=x=>Buffer.isBuffer(x)||x instanceof Uint8Array;
const equal=(a,b)=>Buffer.from(a).equals(Buffer.from(b));
const hashCheck=(fn,x,size)=>{
  const digest=fn(Buffer.from(x));
  if(!bytes(digest)||digest.length!==size)fail('INVALID_HASH_RESULT');
  return Buffer.from(digest);
};
export const leafSha512=msg=>createHash('sha512')
  .update(Buffer.from('AEGIS_V4_P3_LEAF_SHA512_V2\0')).update(msg).digest();
export const nodeSha512=msg=>createHash('sha512')
  .update(Buffer.from('AEGIS_V4_P3_NODE_SHA512_V2\0')).update(msg).digest();
const check=({cap,index,leaf,siblings,logLeaves,capHeight,
  leafLength,digestLength})=>{
  if(!pow2(logLeaves)||!Number.isSafeInteger(capHeight)||capHeight<0||
    capHeight>logLeaves||!Number.isSafeInteger(index)||
    index<0||index>=2**logLeaves||!Number.isSafeInteger(leafLength)||
    leafLength<=0||leafLength>1048576||!Number.isSafeInteger(digestLength)||
    digestLength<1||digestLength>64||!bytes(leaf)||
    leaf.length!==leafLength||!Array.isArray(cap)||
    cap.length!==2**capHeight||!cap.every(x=>bytes(x)&&x.length===digestLength)||
    !Array.isArray(siblings)||siblings.length!==logLeaves-capHeight||
    !siblings.every(x=>bytes(x)&&x.length===digestLength))
    fail('INVALID_SHAPE');
};
export function verifyBinaryMerkleCapOpening({
  cap,index,leaf,siblings,logLeaves,capHeight=3,
  leafLength,digestLength=64,leafHash=leafSha512,nodeHash=nodeSha512
}={}){
  check({cap,index,leaf,siblings,logLeaves,capHeight,leafLength,digestLength});
  let current=hashCheck(leafHash,leaf,digestLength);
  const nodes=[{stage:'leaf',input:Buffer.from(leaf),output:current}];
  for(let i=0;i<siblings.length;i++){
    const sib=Buffer.from(siblings[i]);
    const pair= (index>>i)&1
      ?Buffer.concat([sib,current]):Buffer.concat([current,sib]);
    current=hashCheck(nodeHash,pair,digestLength);
    nodes.push({stage:'node',input:pair,output:current});
  }
  return Object.freeze({
    accepted:equal(current,cap[index>>siblings.length]),
    path:Object.freeze(nodes),
    capIndex:index>>siblings.length,
  });
}
export function extractCappedMerklePositionCollision(paramsA,paramsB){
  // The two classical openings are required to concern the SAME
  // commitment, position, shape, hashing algorithm and capped root.
  if(paramsA?.index!==paramsB?.index||
     paramsA?.logLeaves!==paramsB?.logLeaves||
     paramsA?.capHeight!==paramsB?.capHeight||
     paramsA?.leafLength!==paramsB?.leafLength||
     paramsA?.digestLength!==paramsB?.digestLength||
     paramsA?.leafHash!==paramsB?.leafHash||
     paramsA?.nodeHash!==paramsB?.nodeHash||
     !Array.isArray(paramsA?.cap)||!Array.isArray(paramsB?.cap)||
     paramsA.cap.length!==paramsB.cap.length||
     paramsA.cap.some((x,i)=>!equal(x,paramsB.cap[i])))
    fail('NOT_SAME_FIXED_COMMITMENT');
  const a=verifyBinaryMerkleCapOpening(paramsA);
  const b=verifyBinaryMerkleCapOpening(paramsB);
  if(!a.accepted||!b.accepted)fail('OPENING_NOT_ACCEPTED');
  if(equal(paramsA.leaf,paramsB.leaf))
    fail('NO_CONFLICTING_LEAF_VALUE');
  for(let i=0;i<a.path.length;i++){
    const left=a.path[i],right=b.path[i];
    if(!equal(left.input,right.input)&&equal(left.output,right.output)){
      return Object.freeze({
        collision_found:true,
        type:left.stage,
        depth:i,
        // Concrete distinct inputs to THE SAME fixed hash function.
        input_a:Buffer.from(left.input),
        input_b:Buffer.from(right.input),
        output:Buffer.from(left.output),
        conditional_sha512_collision_reduction:true,
        quantum_collapse_binding_proved:false,
        global_oracle_extraction_proved:false,
        cms_rbr_knowledge_proved:false,
        pq128_demonstrated:false,
      });
    }
  }
  throw Error('BINDING_REDUCTION_INVARIANT_VIOLATED');
}
