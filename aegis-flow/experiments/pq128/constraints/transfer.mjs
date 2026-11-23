// Experimental full Boolean constraint relation, NOT a private proof system.
// The checker below receives the entire private assignment. Never expose it as
// an endpoint or publish its inputs/wires. No production code imports this file.
import {inspect} from 'node:util';
import {BitCircuit,evaluateBitCircuit,checkBitCircuit,bitInputLayout,snapshotBitWitness} from './bit-circuit.mjs';
import {recoverBitWitnessFromOracles} from './oracle-extractor.mjs';
import {ownerHashBits,noteHashBits,nullifierHashBits,treeLeafHashBits,treeNodeHashBits,treeRootHashBits} from './note-hashes.mjs';
import {assertNote512,NOTE512_VERSION} from '../financial/notes.mjs';
import {MEMBERSHIP_VERSION} from '../financial/membership.mjs';
import {assertFinancialStatement512,financialStatementDigest512,checkTransferWitness512} from '../financial/relation.mjs';
import {decodeHex} from '../../../libs/crypto-core/pqc-wrapper.mjs';
const compiled=new WeakMap();
const freeze=Object.freeze;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys;
const u64=n=>{const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(n));return b;};
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n);return b;};
const hex=h=>decodeHex(h,'digest',64);
function equalBits(b,left,right){if(left.length!==right.length)throw new Error('bit width mismatch');left.forEach((w,i)=>b.assertEqual(w,right[i]));}
const or=(b,a,c)=>b.xor(b.xor(a,c),b.and(a,c));
const mux=(b,condition,yes,no)=>b.xor(no,b.and(condition,b.xor(yes,no)));
function positive53(b,bits){
  bits.slice(0,11).forEach(w=>b.assertEqual(w,b.zero));
  let any=b.zero;for(const wire of bits.slice(11))any=or(b,any,wire);b.assertEqual(any,b.one);
}
function add64(b,left,right){
  const out=new Array(64);let carry=b.zero;
  for(let i=63;i>=0;i--){const x=b.xor(left[i],right[i]);out[i]=b.xor(x,carry);carry=b.xor(b.and(left[i],right[i]),b.and(x,carry));}
  b.assertEqual(carry,b.zero);return out;
}
function lessThanConstant32(b,bits,n){
  const expected=b.constantBytes(u32(n));let less=b.zero,same=b.one;
  for(let i=0;i<32;i++){
    if(expected[i]===b.one){less=or(b,less,b.and(same,b.not(bits[i])));same=b.and(same,bits[i]);}
    else same=b.and(same,b.not(bits[i]));
  }
  b.assertEqual(less,b.one);
}
function equalConstant(b,bits,n){
  let same=b.one;
  for(let i=0;i<bits.length;i++)same=b.and(same,((n>>BigInt(bits.length-1-i))&1n)===1n?bits[i]:b.not(bits[i]));
  return same;
}

// Compile only from an independently authenticated PUBLIC statement/digest.
// No private values, path positions or hash preimages select the circuit shape.
export function compileTransferConstraints512({statement,expectedStatementDigest,maxGates=8_000_000}){
  // Snapshot once without invoking toJSON; validate and authenticate that exact
  // snapshot. A getter/serialization hook must not swap fields after approval.
  const st=structuredClone(statement);assertFinancialStatement512(st);
  if(financialStatementDigest512(st)!==expectedStatementDigest)throw new Error('UNTRUSTED_FINANCIAL_STATEMENT');
  const b=new BitCircuit({maxGates}),networkId=st.network_id;
  const depth=Math.ceil(Math.log2(st.anchor_leaf_count)),inputValues=[],outputValues=[];let hashes=0;
  const hash=(fn,options)=>{hashes++;return fn(b,options);};
  for(let i=0;i<st.input_commitments.length;i++){
    const prefix=`input_${i}_`,value=b.inputBytes(prefix+'value',8),owner=b.inputBytes(prefix+'owner',64),randomness=b.inputBytes(prefix+'randomness',64),secret=b.inputBytes(prefix+'secret',64);
    positive53(b,value);inputValues.push(value);
    equalBits(b,hash(ownerHashBits,{networkId,spendSecretBits:secret}),owner);
    const commitment=hash(noteHashBits,{networkId,valueBits:value,ownerBits:owner,randomnessBits:randomness});
    equalBits(b,commitment,b.constantBytes(hex(st.input_commitments[i])));
    equalBits(b,hash(nullifierHashBits,{networkId,commitmentBits:commitment,spendSecretBits:secret}),b.constantBytes(hex(st.nullifiers[i])));
    const index=b.inputBytes(prefix+'index',4);lessThanConstant32(b,index,st.anchor_leaf_count);
    let valueHash=hash(treeLeafHashBits,{networkId,commitmentBits:commitment});
    for(let level=0,width=st.anchor_leaf_count;level<depth;level++,width=Math.ceil(width/2)){
      const sibling=b.inputBytes(prefix+`sibling_${level}`,64),side=index[31-level];
      if(width%2===1){
        const last=equalConstant(b,index.slice(0,32-level),BigInt(width-1));
        for(let k=0;k<512;k++)b.assertEqual(b.and(last,b.xor(sibling[k],valueHash[k])),b.zero);
      }
      const left=valueHash.map((w,k)=>mux(b,side,sibling[k],w));
      const right=valueHash.map((w,k)=>mux(b,side,w,sibling[k]));
      valueHash=hash(treeNodeHashBits,{networkId,leftBits:left,rightBits:right});
    }
    equalBits(b,hash(treeRootHashBits,{networkId,leafCount:st.anchor_leaf_count,rootBits:valueHash}),b.constantBytes(hex(st.anchor_root)));
  }
  for(let i=0;i<st.output_commitments.length;i++){
    const prefix=`output_${i}_`,value=b.inputBytes(prefix+'value',8),owner=b.inputBytes(prefix+'owner',64),randomness=b.inputBytes(prefix+'randomness',64);
    positive53(b,value);outputValues.push(value);
    equalBits(b,hash(noteHashBits,{networkId,valueBits:value,ownerBits:owner,randomnessBits:randomness}),b.constantBytes(hex(st.output_commitments[i])));
  }
  let totalIn=b.constantBytes(u64(0)),totalOut=b.constantBytes(u64(st.fee));
  for(const value of inputValues)totalIn=add64(b,totalIn,value);
  for(const value of outputValues)totalOut=add64(b,totalOut,value);
  equalBits(b,totalIn,totalOut);
  const circuit=b.seal(),result=freeze({schema:'AEGIS_EXPERIMENT_TRANSFER_BIT_RELATION_V1',circuit,
    statement_digest:expectedStatementDigest,hashCalls:hashes,private_proof:false,aegis_target_met:false,production_ready:false});
  compiled.set(result,{statement:st,depth});return result;
}

export function assignTransferConstraints512(relation,witness){
  const data=compiled.get(relation);if(!data)throw new TypeError('trusted compiled transfer required');
  const st=data.statement;
  if(!exact(witness,'inputs,outputs')||!Array.isArray(witness.inputs)||!Array.isArray(witness.outputs)||witness.inputs.length!==st.input_commitments.length||witness.outputs.length!==st.output_commitments.length)throw new TypeError('invalid transfer witness');
  const inputs={};
  const noteInputs=(prefix,note)=>{
    assertNote512(note);if(note.network_id!==st.network_id)throw new TypeError('wrong note network');
    inputs[prefix+'value']=u64(note.value);inputs[prefix+'owner']=hex(note.owner_tag);inputs[prefix+'randomness']=hex(note.randomness);
  };
  witness.inputs.forEach((item,i)=>{
    if(!exact(item,'membership,note,spend_secret'))throw new TypeError('invalid transfer input');
    const prefix=`input_${i}_`;noteInputs(prefix,item.note);inputs[prefix+'secret']=decodeHex(item.spend_secret,'spend secret',64);
    const p=item.membership;
    if(!exact(p,'commitment,leaf_count,leaf_index,network_id,siblings,version')||p.version!==MEMBERSHIP_VERSION||p.network_id!==st.network_id||p.commitment!==st.input_commitments[i]||p.leaf_count!==st.anchor_leaf_count||!Array.isArray(p.siblings)||p.siblings.length!==data.depth||!Number.isSafeInteger(p.leaf_index)||p.leaf_index<0||p.leaf_index>0xffffffff)throw new TypeError('invalid membership encoding');
    inputs[prefix+'index']=u32(p.leaf_index);p.siblings.forEach((s,level)=>inputs[prefix+`sibling_${level}`]=hex(s));
  });
  witness.outputs.forEach((note,i)=>noteInputs(`output_${i}_`,note));
  return evaluateBitCircuit(relation.circuit,inputs);
}
export function checkTransferConstraints512(relation,assignment){
  if(!compiled.has(relation))return false;
  return checkBitCircuit(relation.circuit,assignment);
}

// Decode only an assignment of the independently compiled financial circuit.
// This is a PRIVATE local operation, never receipt verification or a network API.
export function decodeTransferWitness512(relation,recoveredValues){
  let values;
  try{
    const data=compiled.get(relation);if(!data)throw new Error('untrusted relation');
    values=snapshotBitWitness(relation.circuit,recoveredValues);
    if(!checkBitCircuit(relation.circuit,values))throw new Error('invalid assignment');
    const st=data.statement,layout=new Map(bitInputLayout(relation.circuit).map(x=>[x.name,x]));
    const bytes=name=>{
      const block=layout.get(name);if(!block)throw new Error('missing input layout');
      const out=Buffer.alloc(block.length);
      for(let i=0;i<8*block.length;i++)out[i>>3]|=values[block.first+i]<<(7-(i&7));
      return out;
    };
    const note=prefix=>({version:NOTE512_VERSION,network_id:st.network_id,asset_id:st.asset_id,
      value:bytes(prefix+'value').readBigUInt64BE().toString(),owner_tag:bytes(prefix+'owner').toString('hex'),randomness:bytes(prefix+'randomness').toString('hex')});
    const witness={inputs:st.input_commitments.map((commitment,i)=>{
      const prefix=`input_${i}_`;
      return {note:note(prefix),spend_secret:bytes(prefix+'secret').toString('hex'),membership:{version:MEMBERSHIP_VERSION,
        network_id:st.network_id,commitment,leaf_count:st.anchor_leaf_count,leaf_index:bytes(prefix+'index').readUInt32BE(),
        siblings:Array.from({length:data.depth},(_,level)=>bytes(prefix+`sibling_${level}`).toString('hex'))}};
    }),outputs:st.output_commitments.map((_,i)=>note(`output_${i}_`))};
    const expected={networkId:st.network_id,anchorRoot:st.anchor_root,anchorLeafCount:st.anchor_leaf_count,
      transactionBinding:st.transaction_binding,statementDigest:relation.statement_digest};
    if(!checkTransferWitness512({statement:st,witness,expected}).valid)throw new Error('financial refinement failed');
    let owned=witness;
    const result={schema:'AEGIS_PRIVATE_FINANCIAL_RECOVERY_V1',statement_digest:relation.statement_digest,
      scope:'private-full-oracle-financial-recovery-only',receipt_extractor:false,knowledge_soundness_demonstrated:false,
      witness_commitment_binding_checked:false,aegis_target_met:false,production_ready:false};
    Object.defineProperties(result,{
      witness:{get(){if(!owned)throw new Error('PRIVATE_RECOVERY_DISPOSED');return structuredClone(owned);}},
      dispose:{value(){owned=null;}},
      toJSON:{value(){throw new Error('PRIVATE_FINANCIAL_WITNESS_MUST_NOT_BE_SERIALIZED');}},
      [inspect.custom]:{value(){return '[PRIVATE financial witness recovery; not a receipt proof]';}},
    });
    return freeze(result);
  }catch{throw new Error('PRIVATE_FINANCIAL_EXTRACTION_FAILED');}
  finally{values?.fill(0);} // JS strings/copies are not claimed securely erased.
}

export function recoverTransferWitnessFromOracles(relation,options){
  let recovered,values;
  try{
    if(!compiled.has(relation)||!options||typeof options!=='object'||Array.isArray(options)||
      Object.keys(options).some(k=>!['segmentRows','maskCoefficients','maxSegments','maxWires','oracleFormat','readSegment'].includes(k)))throw new Error('untrusted extraction context');
    // Public circuit and statement identity cannot be selected by the source.
    recovered=recoverBitWitnessFromOracles({...options,circuit:relation.circuit,statementDigest:relation.statement_digest});
    values=recovered.values;
    return decodeTransferWitness512(relation,values);
  }catch{throw new Error('PRIVATE_FINANCIAL_EXTRACTION_FAILED');}
  finally{values?.fill(0);recovered?.dispose();}
}
