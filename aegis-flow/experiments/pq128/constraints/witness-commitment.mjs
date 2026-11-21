// PRIVATE salted wire-vector commitment component. This is not a proof system
// or a zero-knowledge argument. Openings reveal wire bits: never publish them
// or feed them to the current non-hiding FRI. SHA-512/CSPRNG assumptions remain.
import crypto from 'node:crypto';
import {inspect} from 'node:util';
import {bindingDigest512} from '../bindings.mjs';
import {decodeHex} from '../../../libs/crypto-core/pqc-wrapper.mjs';

export const WITNESS_COMMITMENT_VERSION='AEGIS_EXPERIMENT_SALTED_WITNESS_V1';
export const WITNESS_BLOCK_BITS=1024;
export const MAX_COMMITTED_WIRES=10_000_002;
const BLOCK_BYTES=WITNESS_BLOCK_BITS/8;
const VERSION=Buffer.from(WITNESS_COMMITMENT_VERSION,'ascii');
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===keys;
const digest=d=>decodeHex(d,'commitment digest',64);
function wireCount(n){if(!Number.isSafeInteger(n)||n<1||n>MAX_COMMITTED_WIRES)throw new TypeError('wire count must be 1..10000002');return n;}
function index(n,count){if(!Number.isSafeInteger(n)||n<0||n>=count)throw new TypeError('invalid witness block index');return n;}
function context(schemaDigest,statementDigest,count){
  wireCount(count);
  return [VERSION,digest(schemaDigest),digest(statementDigest),u32(count),u32(WITNESS_BLOCK_BITS),u32(Math.ceil(count/WITNESS_BLOCK_BITS))];
}
const leafHash=(ctx,i,salt,packed)=>bindingDigest512({domain:'WITNESS_LEAF',parts:[...ctx,u32(i),salt,packed]});
const nodeHash=(ctx,level,i,left,right)=>bindingDigest512({domain:'WITNESS_NODE',parts:[...ctx,u32(level),u32(i),digest(left),digest(right)]});
const rootHash=(ctx,root)=>bindingDigest512({domain:'WITNESS_ROOT',parts:[...ctx,digest(root)]});
function guarded(metadata,privateProperties,label,error){
  const o={...metadata};
  for(const [name,value] of Object.entries(privateProperties))Object.defineProperty(o,name,{value,enumerable:false});
  Object.defineProperties(o,{
    toJSON:{value(){throw new Error(error);}},
    [inspect.custom]:{value(){return label;}},
  });
  return Object.freeze(o);
}

export function commitPrivateWitness(input){
  if(!exact(input,'schemaDigest,statementDigest,values'))throw new TypeError('exact witness commitment inputs required');
  const {values,schemaDigest,statementDigest}=input;
  if(!(values instanceof Uint8Array))throw new TypeError('private bit vector required');
  const count=wireCount(values.length),ctx=context(schemaDigest,statementDigest,count);
  // Capture input exactly once before packing/hashing; later caller mutations
  // cannot rewrite the committed vector. A concurrent shared source needs its
  // own synchronization to define which snapshot the caller intends.
  const snapshot=new Uint8Array(values);
  if(snapshot.length!==count)throw new TypeError('inconsistent private vector length');
  for(const bit of snapshot)if(bit!==0&&bit!==1)throw new TypeError('every committed wire must be Boolean');
  const leafCount=Math.ceil(count/WITNESS_BLOCK_BITS),packed=[],salts=[];
  for(let i=0;i<leafCount;i++){
    const bytes=Buffer.alloc(BLOCK_BYTES),start=i*WITNESS_BLOCK_BITS;
    for(let j=0;j<Math.min(WITNESS_BLOCK_BITS,count-start);j++)bytes[j>>3]|=snapshot[start+j]<<(7-(j&7));
    packed.push(bytes);salts.push(crypto.randomBytes(64));
  }
  const levels=[packed.map((bytes,i)=>leafHash(ctx,i,salts[i],bytes))];
  for(let level=1;levels.at(-1).length>1;level++){
    const prev=levels.at(-1),next=[];
    for(let i=0;i<prev.length;i+=2)next.push(nodeHash(ctx,level,i/2,prev[i],prev[i+1]??prev[i]));
    levels.push(next);
  }
  const metadata={version:WITNESS_COMMITMENT_VERSION,root:rootHash(ctx,levels.at(-1)[0]),
    schemaDigest,statementDigest,wireCount:count,blockSize:WITNESS_BLOCK_BITS,leafCount,
    private_proof:false,aegis_target_met:false,production_ready:false};
  return guarded(metadata,{opening(blockIndex){
    index(blockIndex,leafCount);const path=[];let position=blockIndex;
    for(const level of levels.slice(0,-1)){path.push(level[position^1]??level[position]);position=Math.floor(position/2);}
    return guarded({version:WITNESS_COMMITMENT_VERSION,schemaDigest,statementDigest,wireCount:count,
      blockSize:WITNESS_BLOCK_BITS,leafCount,blockIndex},
      {packed:Buffer.from(packed[blockIndex]),salt:Buffer.from(salts[blockIndex]),path:Object.freeze(path)},
      '[PRIVATE witness opening; exposes wire bits, not a proof]',
      'PRIVATE_WITNESS_OPENING_MUST_NOT_BE_SERIALIZED');
  }},'[PRIVATE witness commitment artifact; root is public]',
    'PRIVATE_WITNESS_COMMITMENT_ARTIFACT_MUST_NOT_BE_SERIALIZED');
}

// Verify membership of the independently requested block, not an index selected
// by the prover. This routine receives the PRIVATE opening, including raw wires.
export function verifyPrivateWitnessOpening(input){
  try{
    if(!exact(input,'expectedBlockIndex,expectedRoot,opening,schemaDigest,statementDigest,wireCount'))return false;
    const {expectedRoot,schemaDigest,statementDigest,wireCount:count,expectedBlockIndex,opening}=input;
    const ctx=context(schemaDigest,statementDigest,count),leafCount=Math.ceil(count/WITNESS_BLOCK_BITS);
    digest(expectedRoot);index(expectedBlockIndex,leafCount);
    if(!opening||typeof opening!=='object'||Array.isArray(opening))return false;
    const fields=Object.getOwnPropertyNames(opening).filter(k=>k!=='toJSON').sort().join(',');
    if(fields!=='blockIndex,blockSize,leafCount,packed,path,salt,schemaDigest,statementDigest,version,wireCount'||
      Object.getOwnPropertySymbols(opening).some(s=>s!==inspect.custom))return false;
    const packedSource=opening.packed,saltSource=opening.salt,pathSource=opening.path;
    if(opening.version!==WITNESS_COMMITMENT_VERSION||opening.schemaDigest!==schemaDigest||opening.statementDigest!==statementDigest||
      opening.wireCount!==count||opening.blockSize!==WITNESS_BLOCK_BITS||opening.leafCount!==leafCount||opening.blockIndex!==expectedBlockIndex||
      !Buffer.isBuffer(packedSource)||packedSource.length!==BLOCK_BYTES||!Buffer.isBuffer(saltSource)||saltSource.length!==64||
      !Array.isArray(pathSource)||pathSource.length!==Math.ceil(Math.log2(leafCount)))return false;
    // Copy the data before validation/hashing so mutable accessors or later
    // caller writes cannot make the checked padding differ from the hash input.
    const packed=Buffer.from(packedSource),salt=Buffer.from(saltSource),path=[...pathSource];
    const used=Math.min(WITNESS_BLOCK_BITS,count-expectedBlockIndex*WITNESS_BLOCK_BITS);
    for(let bit=used;bit<WITNESS_BLOCK_BITS;bit++)if((packed[bit>>3]>>(7-(bit&7)))&1)return false;
    let value=leafHash(ctx,expectedBlockIndex,salt,packed),position=expectedBlockIndex,width=leafCount;
    for(let level=0;level<path.length;level++){
      const sibling=path[level];digest(sibling);
      const parent=Math.floor(position/2);
      if(position%2===0){if(position+1>=width&&sibling!==value)return false;value=nodeHash(ctx,level+1,parent,value,sibling);}
      else value=nodeHash(ctx,level+1,parent,sibling,value);
      position=parent;width=Math.ceil(width/2);
    }
    return rootHash(ctx,value)===expectedRoot;
  }catch{return false;}
}
